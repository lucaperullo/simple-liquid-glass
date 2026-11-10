import { GlassLayer } from './layer';
import { specOf, type MaterialSpec } from './materials';
import type { HostMessage, LayerStatus, RendererMessage } from './scene';
import { ScrollTracker } from './scroll';
import { GLASS_MATERIAL } from './shader';
import { stackOf } from './stacked';
import { STACKING } from './stacking';
import { FrameMeter } from './stats';

/** What a renderer needs from the thread it runs on. */
export interface RendererEnv {
  /** This thread's `requestAnimationFrame`. */
  requestFrame(callback: (now: number) => void): void;
  /** Delivers a message to the host. */
  post(message: RendererMessage): void;
  /** A millisecond clock. */
  now(): number;
  /**
   * What to add to this thread's frame timestamps to put them on the clock all threads share
   * (`performance.timeOrigin`).
   */
  readonly origin: number;
}

export interface Renderer {
  handle(message: HostMessage): void;
}

/** Two drawn frames further apart than this (ms) had a rest between them; the gap is not a slow frame. */
const REST_GAP = 100;

/**
 * The renderer: the same code on the page thread and in a worker. It draws a layer only when something in
 * it changed or is still moving, and asks for no frames at all while the whole scene is at rest.
 */
export function createRenderer(env: RendererEnv): Renderer {
  const layers = new Map<number, GlassLayer>();
  /** The layers again, as an array: cheaper for the frame loop to walk than the map. */
  const order: GlassLayer[] = [];
  const materials = new Map<string, MaterialSpec>([[GLASS_MATERIAL.id, specOf(GLASS_MATERIAL)]]);
  const meter = new FrameMeter();
  const scroll = new ScrollTracker();
  /** The scroll position the layers were last drawn with. */
  let drawnX = 0;
  let drawnY = 0;
  let scheduled = false;
  /** When a frame was last drawn: the meter's clock. Frames driven by messages (a video) count as a run too. */
  let drawnAt = 0;
  let reducedMotion = false;

  const wake = (): void => {
    if (scheduled) return;
    scheduled = true;
    env.requestFrame(frame);
  };

  const frame = (now: number): void => {
    scheduled = false;
    const started = env.now();
    const scrolling = scroll.predict(now + env.origin);
    const scrolled = scroll.x !== drawnX || scroll.y !== drawnY;
    drawnX = scroll.x;
    drawnY = scroll.y;
    let drew = false;
    let moving = false;
    if (STACKING) {
      // A canvas is drawn whole: its layer, then those stacked over it, whenever any of them changed.
      for (const base of order) {
        const all = [base, ...stackOf(base).members];
        let due = false;
        for (const layer of all) {
          const changed = layer.springs.advanceTo(now + env.origin);
          if (changed || layer.dirty || layer.running || (scrolled && layer.followsScroll)) due = true;
          if (layer.springs.moving || layer.running || (scrolling && layer.followsScroll)) moving = true;
        }
        if (due) for (const layer of all) layer.draw(scroll.x, scroll.y, now + env.origin);
        drew ||= due;
      }
    } else
      for (const layer of order) {
        const changed = layer.springs.advanceTo(now + env.origin);
        if (changed || layer.dirty || layer.running || (scrolled && layer.followsScroll)) {
          layer.draw(scroll.x, scroll.y, now + env.origin);
          drew = true;
        }
        if (layer.springs.moving || layer.running || (scrolling && layer.followsScroll)) moving = true;
      }
    if (drew) {
      meter.record(now - drawnAt < REST_GAP ? now - drawnAt : 0, env.now() - started);
      drawnAt = now;
    }
    if (moving) wake();
  };

  const remove = (id: number): void => {
    const layer = layers.get(id);
    if (!layer) return;
    if (STACKING) {
      // Its canvas is drawn again without it.
      const base = stackOf(layer).base;
      if (base) base.dirty = true;
      // The layers stacked over it go with its canvas.
      for (const member of [...stackOf(layer).members]) {
        member.dispose();
        for (const [other, each] of layers) if (each === member) layers.delete(other);
      }
    }
    layer.dispose();
    layers.delete(id);
    if (!STACKING || order.includes(layer)) order.splice(order.indexOf(layer), 1);
  };

  return {
    handle(message) {
      switch (message.type) {
        case 'layer-add': {
          const id = message.layer;
          const { canvas, view, fixed, scale, params, lean } = message;
          const material = materials.get(message.material);
          if (!material) {
            env.post({ type: 'layer-status', layer: id, status: 'unsupported', detail: 'Unknown material' });
            break;
          }
          const events = {
            status: (status: Exclude<LayerStatus, 'pending'>, detail: string): void => {
              env.post({ type: 'layer-status', layer: id, status, detail });
            },
            wake,
          };
          if (STACKING && !canvas) {
            // A layer drawn into the canvas of the one it is stacked over.
            const over = layers.get(message.over ?? 0);
            const base = over && (stackOf(over).base ?? over);
            if (base) {
              layers.set(
                id,
                new GlassLayer(base.canvas, view, fixed, scale, material, params, lean, events, base),
              );
            }
            break;
          }
          const layer = new GlassLayer(
            // (Only a stacked layer comes without a canvas.)
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            canvas!,
            view,
            fixed,
            scale,
            material,
            params,
            lean,
            events,
          );
          layers.set(id, layer);
          order.push(layer);
          break;
        }
        case 'layer-view': {
          const layer = layers.get(message.layer);
          layer?.setView(message.view, message.fixed, message.scale);
          // The layers stacked over it are in the same canvas.
          if (STACKING && layer)
            for (const member of stackOf(layer).members)
              member.setView(message.view, message.fixed, message.scale);
          break;
        }
        case 'layer-clip': {
          const layer = STACKING && layers.get(message.layer);
          if (layer) {
            stackOf(layer).clip = message.clip;
            layer.dirty = true;
          }
          break;
        }
        case 'layer-texture': {
          const layer = layers.get(message.layer);
          if (layer) layer.setTexture(message.name, message.frame);
          else message.frame.close();
          break;
        }
        case 'layer-running': {
          const layer = layers.get(message.layer);
          if (layer) {
            layer.running = message.running;
            layer.dirty = true;
          }
          break;
        }
        case 'layer-bounds':
          layers.get(message.layer)?.setBounds(message.bounds, message.time);
          break;
        case 'material-define':
          materials.set(message.material.id, message.material);
          return;
        case 'layer-material': {
          const material = materials.get(message.material);
          if (material) layers.get(message.layer)?.setMaterial(material, message.params, message.lean);
          break;
        }
        case 'layer-backdrop': {
          const layer = layers.get(message.layer);
          if (layer) layer.setBackdrop(message.frame, message.rect, message.fixed);
          else message.frame?.close();
          break;
        }
        case 'layer-remove':
          remove(message.layer);
          break;
        case 'shapes-set':
          layers.get(message.layer)?.setShapes(message.batch, reducedMotion, message.time);
          break;
        case 'shapes-remove':
          layers.get(message.layer)?.removeShapes(message.ids);
          break;
        case 'scroll': {
          const error = scroll.sample(message.x, message.y, message.time, message.lead);
          if (error >= 0) meter.recordScrollError(error);
          break;
        }
        case 'motion':
          reducedMotion = message.reduced;
          if (reducedMotion) settle(STACKING ? [...layers.values()] : order);
          break;
        case 'settle':
          settle(STACKING ? [...layers.values()] : order);
          break;
        case 'stats':
          env.post({ type: 'stats', request: message.request, stats: meter.read() });
          return;
        case 'context-loss':
          layers.get(message.layer)?.loseContext(message.restoreAfter);
          return;
        case 'destroy':
          for (const id of [...layers.keys()]) remove(id);
          return;
      }
      wake();
    },
  };
}

function settle(layers: readonly GlassLayer[]): void {
  for (const layer of layers) {
    layer.springs.settle();
    layer.dirty = true;
  }
}
