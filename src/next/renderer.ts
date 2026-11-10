import { GlassLayer } from './layer';
import { specOf, type MaterialSpec } from './materials';
import type { HostMessage, RendererMessage } from './scene';
import { ScrollTracker } from './scroll';
import { GLASS_MATERIAL } from './shader';
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
    for (const layer of order) {
      const changed = layer.springs.advanceTo(now + env.origin);
      if (changed || layer.dirty || (scrolled && layer.followsScroll)) {
        layer.draw(scroll.x, scroll.y);
        drew = true;
      }
      if (layer.springs.moving || (scrolling && layer.followsScroll)) moving = true;
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
    layer.dispose();
    layers.delete(id);
    order.splice(order.indexOf(layer), 1);
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
          const layer = new GlassLayer(canvas, view, fixed, scale, material, params, lean, {
            status: (status, detail) => {
              env.post({ type: 'layer-status', layer: id, status, detail });
            },
            wake,
          });
          layers.set(id, layer);
          order.push(layer);
          break;
        }
        case 'layer-view':
          layers.get(message.layer)?.setView(message.view, message.fixed, message.scale);
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
          else message.frame.close();
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
          if (reducedMotion) settle(order);
          break;
        case 'settle':
          settle(order);
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
