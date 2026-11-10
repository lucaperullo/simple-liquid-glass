/** Small pieces of host.ts. */
import { scrollPosition } from './pageSources';
import type { GlassLayer } from './api';
import type { FrameStats, HostMessage, Rect } from './scene';

export const NO_STATS: FrameStats = {
  frames: 0,
  fps: 0,
  p50: 0,
  p95: 0,
  drawMs: 0,
  scrollError: 0,
  scrollErrorMax: 0,
};

/** A rectangle measured in the viewport now, as the protocol wants it (see `HostMessage`). */
export const place = (rect: Rect, fixed: boolean): Rect => {
  if (fixed) return rect;
  const { x, y } = scrollPosition();
  return { left: rect.left + x, top: rect.top + y, width: rect.width, height: rect.height };
};

export const boxOf = (canvas: HTMLCanvasElement): Rect => {
  const { left, top, width, height } = canvas.getBoundingClientRect();
  return { left, top, width, height };
};

/** Stacking: the message that adds a layer drawn into the canvas of layer `over`. */
export const stackedAdd = (
  layer: number,
  over: number,
  view: Rect,
  fixed: boolean,
  scale: number,
  material: string,
  params: Float32Array,
  lean: boolean,
): HostMessage => ({
  type: 'layer-add',
  layer,
  canvas: null,
  over,
  view,
  fixed,
  scale,
  material,
  params,
  lean,
});

/** Stacking: the calls a layer has only there, apart from `stack()`. */
export const stackedCalls = (
  post: (message: HostMessage) => void,
  layer: number,
): Pick<GlassLayer, 'setClip' | 'setReach' | 'setOrigin' | 'setPace'> => ({
  setClip(clip) {
    post({ type: 'layer-clip', layer, clip });
  },
  setReach(reach) {
    post({ type: 'layer-reach', layer, reach });
  },
  setOrigin(x, y) {
    post({ type: 'layer-origin', layer, origin: [x, y] });
  },
  setPace(interval) {
    post({ type: 'layer-pace', layer, pace: interval ?? 0 });
  },
});
