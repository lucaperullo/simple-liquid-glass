/**
 * The page-thread side of the 6.0 engine: `createGlassHost()`.
 *
 * How the worker loads. The worker's code ships inside this entry as text and is started from a Blob URL,
 * so it works with no configuration in Vite, webpack and a plain `<script type="module">`: there is no
 * second file for a bundler to find or a server to host. The cost is that the renderer is in the bundle
 * twice (once as that text, once as the page-thread fallback), and that a site whose Content-Security-Policy
 * forbids `blob:` workers cannot start it. Such a site hosts `simple-liquid-glass/next/worker` itself and
 * passes its address as `workerUrl`; without that the host notices the refusal and draws on the page thread.
 *
 * Nothing here touches the DOM when the module loads, so it can be imported during server rendering.
 */
import {
  DEFAULT_SPRING,
  MAX_SHAPES,
  MAX_WORKER_LAYERS,
  createShapeBatch,
  writeShape,
  type BackdropFrame,
  type FrameStats,
  type HostMessage,
  type LayerStatus,
  type Rect,
  type RendererMessage,
  type ShapeBox,
  type SpringConfig,
} from './scene';
import type {
  BackdropOptions,
  GlassHost,
  GlassHostOptions,
  GlassLayerOptions,
  GlassShape,
  GlassShapeOptions,
  GlassStats,
} from './api';
import { ContentFollower } from './content';
import { packParams, specOf, type MaterialSpec } from './materials';
import { scrollPosition, watchScroll, watchVideo } from './pageSources';
import { GLASS_MATERIAL } from './shader';
import { connect, type Transport } from './transport';

interface ShapeRecord {
  readonly id: number;
  readonly box: ShapeBox;
  readonly attributes: number[];
  readonly spring: SpringConfig | null;
  readonly content: ContentFollower | null;
  jump: boolean;
}

interface LayerRecord {
  readonly id: number;
  status: LayerStatus;
  readonly onStatus: GlassLayerOptions['onStatus'];
  readonly shapes: Set<ShapeRecord>;
  readonly changed: Set<ShapeRecord>;
  bounds: Rect | null;
  /** The walls changed since the last flush. */
  boundsChanged: boolean;
}

const NO_STATS: FrameStats = {
  frames: 0,
  fps: 0,
  p50: 0,
  p95: 0,
  drawMs: 0,
  scrollError: 0,
  scrollErrorMax: 0,
};

/** A rectangle measured in the viewport now, as the protocol wants it (see `HostMessage`). */
const place = (rect: Rect, fixed: boolean): Rect => {
  if (fixed) return rect;
  const { x, y } = scrollPosition();
  return { left: rect.left + x, top: rect.top + y, width: rect.width, height: rect.height };
};

const boxOf = (canvas: HTMLCanvasElement): Rect => {
  const { left, top, width, height } = canvas.getBoundingClientRect();
  return { left, top, width, height };
};

/** Creates a host: the scene's owner on the page thread. It describes; a renderer draws. */
export function createGlassHost(options: GlassHostOptions = {}): GlassHost {
  const layers = new Map<number, LayerRecord>();
  const statsRequests = new Map<number, (stats: GlassStats) => void>();
  let transport: Transport | null = null;
  /** Work waiting for the renderer to start. Null once it has. */
  let queue: ((transport: Transport) => void)[] | null = [];
  let destroyed = false;
  let nextId = 1;
  let flushScheduled = false;
  /** The layers whose canvases a worker holds. */
  const workerLayers = new Set<number>();
  /** Every material layers can name, with its uniforms' default values. The renderer has `glass` built in too. */
  const materials = new Map<string, { spec: MaterialSpec; defaults: Float32Array }>();
  const glass = specOf(GLASS_MATERIAL);
  materials.set(glass.id, { spec: glass, defaults: packParams(glass, GLASS_MATERIAL.uniforms ?? {}) });

  const run = (command: (transport: Transport) => void): void => {
    if (destroyed) return;
    if (transport) command(transport);
    else queue?.push(command);
  };
  const post = (message: HostMessage): void => {
    run((to) => {
      to.send(message);
    });
  };

  const setStatus = (layer: LayerRecord, status: LayerStatus, detail: string): void => {
    layer.status = status;
    layer.onStatus?.(status, detail);
  };

  const receive = (message: RendererMessage): void => {
    if (message.type === 'layer-status') {
      const layer = layers.get(message.layer);
      if (layer) setStatus(layer, message.status, message.detail);
    } else if (message.type === 'stats' && transport) {
      statsRequests.get(message.request)?.({ ...message.stats, thread: transport.thread });
      statsRequests.delete(message.request);
    }
  };

  /** Sends every shape changed since the last flush, one message per layer. */
  const flush = (): void => {
    flushScheduled = false;
    for (const layer of layers.values()) {
      if (layer.changed.size === 0 && !layer.boundsChanged) continue;
      // One moment for the whole batch: the renderer's springs and the content's start from it together.
      const time = performance.timeOrigin + performance.now();
      if (layer.boundsChanged) {
        layer.boundsChanged = false;
        // Content whose shape also changed plans its path once, when it is moved below.
        for (const shape of layer.shapes) shape.content?.bound(layer.bounds, time, !layer.changed.has(shape));
        post({ type: 'layer-bounds', layer: layer.id, bounds: layer.bounds, time });
      }
      if (layer.changed.size === 0) continue;
      const batch = createShapeBatch(layer.changed.size);
      let index = 0;
      for (const shape of layer.changed) {
        const spring = shape.jump ? null : shape.spring;
        writeShape(batch, index++, shape.id, shape.box, shape.attributes, spring);
        shape.content?.moveTo(shape.box, time, reducedMotion() ? null : spring, contentLead);
        shape.jump = false;
      }
      layer.changed.clear();
      post({ type: 'shapes-set', layer: layer.id, batch, time });
    }
  };
  // Changes made in one task leave together, so a layout pass that moves ten shapes costs one message.
  const scheduleFlush = (): void => {
    if (flushScheduled) return;
    flushScheduled = true;
    void Promise.resolve().then(flush);
  };

  const media =
    options.reducedMotion === undefined && typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  const reducedMotion = (): boolean => options.reducedMotion ?? media?.matches ?? false;
  const contentLead = options.contentLead ?? 0;
  const sendMotion = (): void => {
    post({ type: 'motion', reduced: reducedMotion() });
  };
  media?.addEventListener('change', sendMotion);
  sendMotion();

  const stopScroll = watchScroll((x, y, time) => {
    post({ type: 'scroll', x, y, time, lead: options.scrollLead ?? 0 });
  });

  const ready = connect({ thread: options.thread ?? 'auto', workerUrl: options.workerUrl }, receive).then(
    (connected) => {
      if (destroyed) {
        connected.close();
        return connected.thread;
      }
      transport = connected;
      const waiting = queue ?? [];
      queue = null;
      for (const command of waiting) command(connected);
      return connected.thread;
    },
  );

  const addShape = (layer: LayerRecord, box: ShapeBox, shapeOptions: GlassShapeOptions): GlassShape => {
    if (layer.shapes.size >= MAX_SHAPES) {
      throw new RangeError(`A glass layer holds at most ${MAX_SHAPES} shapes`);
    }
    const spring = shapeOptions.spring === undefined ? DEFAULT_SPRING : shapeOptions.spring;
    const shape: ShapeRecord = {
      id: nextId++,
      box: { ...box },
      attributes: [...(shapeOptions.attributes ?? [])],
      content: shapeOptions.content
        ? new ContentFollower(shapeOptions.content, shapeOptions.contentClip ?? null)
        : null,
      spring,
      jump: false,
    };
    if (layer.bounds) shape.content?.bound(layer.bounds, performance.timeOrigin + performance.now(), false);
    layer.shapes.add(shape);
    layer.changed.add(shape);
    scheduleFlush();
    return {
      set(next, setOptions) {
        if (!layer.shapes.has(shape)) return;
        Object.assign(shape.box, next);
        if (setOptions?.jump === true) shape.jump = true;
        layer.changed.add(shape);
        scheduleFlush();
      },
      setAttributes(values, setOptions) {
        if (!layer.shapes.has(shape)) return;
        values.forEach((value, index) => (shape.attributes[index] = value));
        if (setOptions?.jump === true) shape.jump = true;
        layer.changed.add(shape);
        scheduleFlush();
      },
      remove() {
        if (!layer.shapes.delete(shape)) return;
        shape.content?.stop();
        // What was already said about the shape goes first, so the renderer sees one consistent order.
        flush();
        post({ type: 'shapes-remove', layer: layer.id, ids: Uint32Array.of(shape.id) });
      },
    };
  };

  return {
    get thread() {
      return transport?.thread ?? 'pending';
    },
    ready,

    addLayer(canvas, layerOptions = {}) {
      const layer: LayerRecord = {
        id: nextId++,
        status: 'pending',
        onStatus: layerOptions.onStatus,
        shapes: new Set(),
        changed: new Set(),
        bounds: null,
        boundsChanged: false,
      };
      const material = materials.get(layerOptions.material ?? GLASS_MATERIAL.id);
      if (!material) throw new TypeError(`No material "${layerOptions.material ?? ''}" is defined`);
      const lean = layerOptions.lean ?? false;
      let params = packParams(material.spec, layerOptions.params ?? {}, material.defaults);
      let scale = layerOptions.scale ?? Math.min(window.devicePixelRatio, 2);
      const fixed = layerOptions.fixed ?? false;
      const streams = new Set<() => void>();
      const sendBackdrop = (frame: BackdropFrame | null, backdrop: BackdropOptions = {}): void => {
        const rect = backdrop.rect ?? {
          left: 0,
          top: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        };
        const backdropFixed = backdrop.fixed ?? false;
        post({
          type: 'layer-backdrop',
          layer: layer.id,
          frame,
          rect: place(rect, backdropFixed),
          fixed: backdropFixed,
        });
      };
      const setBackdrop = (frame: BackdropFrame, backdrop?: BackdropOptions): void => {
        sendBackdrop(frame, backdrop);
      };
      layers.set(layer.id, layer);
      run((to) => {
        if (to.thread === 'worker' && workerLayers.size >= MAX_WORKER_LAYERS) {
          // Handing it over would cost an earlier layer its context. The canvas stays the application's.
          setStatus(layer, 'unsupported', `A worker draws at most ${MAX_WORKER_LAYERS} layers`);
          return;
        }
        let target;
        try {
          target = to.canvas(canvas);
        } catch (error) {
          // The canvas already has a context, or was handed over before.
          setStatus(layer, 'unsupported', error instanceof Error ? error.message : String(error));
          return;
        }
        to.send({
          type: 'layer-add',
          layer: layer.id,
          canvas: target,
          view: place(boxOf(canvas), fixed),
          fixed,
          scale,
          material: material.spec.id,
          params,
          lean,
        });
        if (to.thread === 'worker') workerLayers.add(layer.id);
      });

      return {
        get status() {
          return layer.status;
        },
        setBackdrop,
        setTexture(name, frame) {
          if (!material.spec.textures.includes(name)) {
            throw new TypeError(`Material "${material.spec.id}" has no texture "${name}"`);
          }
          post({ type: 'layer-texture', layer: layer.id, name, frame });
        },
        setRunning(running) {
          post({ type: 'layer-running', layer: layer.id, running });
        },
        moveBackdrop(backdrop) {
          sendBackdrop(null, backdrop);
        },
        streamBackdrop(video, backdrop) {
          const stop = watchVideo(video, (frame) => {
            if (layers.has(layer.id) && !destroyed) setBackdrop(frame, backdrop);
            else frame.close();
          });
          streams.add(stop);
          return () => {
            streams.delete(stop);
            stop();
          };
        },
        setParams(next) {
          params = packParams(material.spec, next, params);
          post({ type: 'layer-material', layer: layer.id, material: material.spec.id, params, lean });
        },
        setBounds(bounds) {
          // Sent with the shapes changed in the same task, as of the same moment.
          layer.bounds = bounds && { ...bounds };
          layer.boundsChanged = true;
          scheduleFlush();
        },
        addShape: (box, shapeOptions = {}) => addShape(layer, box, shapeOptions),
        resize(nextScale = scale) {
          scale = nextScale;
          post({ type: 'layer-view', layer: layer.id, view: place(boxOf(canvas), fixed), fixed, scale });
        },
        simulateContextLoss(restoreAfter = 0) {
          post({ type: 'context-loss', layer: layer.id, restoreAfter });
        },
        remove() {
          if (!layers.delete(layer.id)) return;
          workerLayers.delete(layer.id);
          for (const stop of streams) stop();
          layer.shapes.clear();
          layer.changed.clear();
          post({ type: 'layer-remove', layer: layer.id });
        },
      };
    },

    defineMaterial(definition) {
      if (materials.has(definition.id)) throw new TypeError(`Material "${definition.id}" is already defined`);
      const spec = specOf(definition);
      materials.set(spec.id, { spec, defaults: packParams(spec, definition.uniforms ?? {}) });
      post({ type: 'material-define', material: spec });
    },

    settle() {
      flush();
      post({ type: 'settle' });
    },

    stats() {
      if (destroyed) return Promise.resolve({ ...NO_STATS, thread: transport?.thread ?? 'page' });
      return new Promise((resolve) => {
        const request = nextId++;
        statsRequests.set(request, resolve);
        post({ type: 'stats', request });
      });
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      media?.removeEventListener('change', sendMotion);
      stopScroll();
      transport?.close();
      const thread = transport?.thread ?? 'page';
      for (const resolve of statsRequests.values()) resolve({ ...NO_STATS, thread });
      statsRequests.clear();
      layers.clear();
      queue = null;
    },
  };
}
