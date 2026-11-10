/**
 * The 6.0 scene, as data. The page thread describes what exists with the messages below and never draws.
 * A renderer (in a worker, or on the page thread when a worker cannot draw) owns the WebGL contexts, the
 * clock and the springs.
 */

import type { MaterialSpec } from './materials';

/** A rectangle in viewport CSS pixels. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A picture for the glass to bend: a still, or one frame of a video. Both are handed over, not copied. */
export type BackdropFrame = ImageBitmap | VideoFrame;

/** A canvas a renderer can draw into: the page's own, or one handed to a worker. */
export type GlassCanvas = HTMLCanvasElement | OffscreenCanvas;

/** The most shapes one layer can hold. The shader's loop bound; see `shader/glass.ts`. */
export const MAX_SHAPES = 16;

/** Values of a shape's box on the wire: centre x, centre y, half width, half height, corner radius. */
export const SHAPE_BOX = 5;

/**
 * Free values per shape, for materials: a colour, a lift, a flag. They travel and spring with the box and
 * reach the material's GLSL as two `vec4`s per shape.
 */
export const SHAPE_ATTRIBUTES = 8;

/** Values per shape on the wire: its box, then its attributes. */
export const SHAPE_STRIDE = SHAPE_BOX + SHAPE_ATTRIBUTES;

/** Values per shape in `ShapeBatch.springs`: stiffness, damping. */
export const SPRING_STRIDE = 2;

/** A rounded box, in CSS pixels from the top-left corner of its layer. */
export interface ShapeBox {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/** How a shape moves to a new box. Units: mass 1, stiffness in 1/s², damping in 1/s. */
export interface SpringConfig {
  readonly stiffness: number;
  readonly damping: number;
}

export const DEFAULT_SPRING: SpringConfig = { stiffness: 170, damping: 18 };

/**
 * Several shapes of one layer. Shapes cross the thread boundary as three typed arrays, never as an object
 * per shape, so a batch of any size costs one structured clone of three buffers (which are transferred).
 */
export interface ShapeBatch {
  /** One id per shape. */
  readonly ids: Uint32Array;
  /** `SHAPE_STRIDE` values per shape. */
  readonly values: Float32Array;
  /** `SPRING_STRIDE` values per shape. A stiffness of 0 means "set directly, no spring". */
  readonly springs: Float32Array;
}

export function createShapeBatch(count: number): ShapeBatch {
  return {
    ids: new Uint32Array(count),
    values: new Float32Array(count * SHAPE_STRIDE),
    springs: new Float32Array(count * SPRING_STRIDE),
  };
}

/** Writes shape `index` of a batch. Missing attributes are 0. `spring: null` sets the shape directly. */
export function writeShape(
  batch: ShapeBatch,
  index: number,
  id: number,
  box: Readonly<ShapeBox>,
  attributes: ArrayLike<number>,
  spring: SpringConfig | null,
): void {
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  batch.ids[index] = id;
  batch.values.set(
    [box.x + halfWidth, box.y + halfHeight, halfWidth, halfHeight, box.radius],
    index * SHAPE_STRIDE,
  );
  batch.values.set(Array.from(attributes).slice(0, SHAPE_ATTRIBUTES), index * SHAPE_STRIDE + SHAPE_BOX);
  batch.springs.set([spring?.stiffness ?? 0, spring?.damping ?? 0], index * SPRING_STRIDE);
}

/** Reads shape `index` of a batch back: the inverse of `writeShape`, to single precision. */
export function readShape(
  batch: ShapeBatch,
  index: number,
): { id: number; box: ShapeBox; attributes: number[]; spring: SpringConfig | null } {
  const [x = 0, y = 0, halfWidth = 0, halfHeight = 0, radius = 0] = batch.values.subarray(
    index * SHAPE_STRIDE,
    (index + 1) * SHAPE_STRIDE,
  );
  const [stiffness = 0, damping = 0] = batch.springs.subarray(
    index * SPRING_STRIDE,
    (index + 1) * SPRING_STRIDE,
  );
  return {
    id: batch.ids[index] ?? 0,
    box: { x: x - halfWidth, y: y - halfHeight, width: halfWidth * 2, height: halfHeight * 2, radius },
    attributes: Array.from(
      batch.values.subarray(index * SHAPE_STRIDE + SHAPE_BOX, (index + 1) * SHAPE_STRIDE),
    ),
    spring: stiffness > 0 ? { stiffness, damping } : null,
  };
}

/** What a layer is doing. `pending`: not yet handed to a renderer. `unsupported`: no WebGL for its canvas. */
export type LayerStatus = 'pending' | 'drawing' | 'context-lost' | 'unsupported';

/** Frame cadence since the previous reading. Times are milliseconds. */
export interface FrameStats {
  /** Frames drawn. 0 while the scene is at rest. */
  readonly frames: number;
  /** Frames per second over the frames that followed one another without a pause. */
  readonly fps: number;
  /** Median and 95th-percentile time between such frames. */
  readonly p50: number;
  readonly p95: number;
  /** Mean time spent stepping springs and issuing draw calls, per frame. */
  readonly drawMs: number;
  /**
   * How far the scroll position predicted between two samples was from the next sample, CSS px: the mean
   * and the worst. 0 when the page did not scroll.
   */
  readonly scrollError: number;
  readonly scrollErrorMax: number;
}

/**
 * Page thread → renderer. Every message names its layer by the id the host gave it.
 *
 * Rectangles come with `fixed`. A fixed rectangle is in viewport pixels and stays there. One that is not
 * fixed moves with the document: it is given as it would be with the page scrolled to the top.
 */
export type HostMessage =
  | {
      readonly type: 'layer-add';
      readonly layer: number;
      readonly canvas: GlassCanvas;
      readonly view: Rect;
      readonly fixed: boolean;
      readonly scale: number;
      /** The id of a material the renderer knows: `glass`, or one sent with `material-define`. */
      readonly material: string;
      /** The material's uniforms, laid out as its `MaterialSpec` says. */
      readonly params: Float32Array;
      /** Compile the material's cheaper variant (`SLG_LEAN`). */
      readonly lean: boolean;
    }
  | {
      readonly type: 'layer-view';
      readonly layer: number;
      readonly view: Rect;
      readonly fixed: boolean;
      readonly scale: number;
    }
  | { readonly type: 'material-define'; readonly material: MaterialSpec }
  | {
      readonly type: 'layer-material';
      readonly layer: number;
      readonly material: string;
      readonly params: Float32Array;
      readonly lean: boolean;
    }
  | {
      readonly type: 'layer-backdrop';
      readonly layer: number;
      readonly frame: BackdropFrame;
      readonly rect: Rect;
      readonly fixed: boolean;
    }
  /**
   * The page's scroll position at `time` (ms on the clock both threads share: `performance.timeOrigin +
   * performance.now()`). `lead`: ms to predict ahead of the samples.
   */
  | {
      readonly type: 'scroll';
      readonly x: number;
      readonly y: number;
      readonly time: number;
      readonly lead: number;
    }
  | { readonly type: 'layer-remove'; readonly layer: number }
  | { readonly type: 'shapes-set'; readonly layer: number; readonly batch: ShapeBatch }
  | { readonly type: 'shapes-remove'; readonly layer: number; readonly ids: Uint32Array }
  /** Reduced motion: while on, every change lands at once. */
  | { readonly type: 'motion'; readonly reduced: boolean }
  /** Jump every spring to its target now. */
  | { readonly type: 'settle' }
  | { readonly type: 'stats'; readonly request: number }
  /** Test aid: lose the layer's WebGL context and give it back after `restoreAfter` ms. */
  | { readonly type: 'context-loss'; readonly layer: number; readonly restoreAfter: number }
  | { readonly type: 'destroy' };

/** Renderer → page thread. */
export type RendererMessage =
  /** Sent once by a worker when it starts. `frames`: it has `requestAnimationFrame`. */
  | { readonly type: 'ready'; readonly frames: boolean }
  | {
      readonly type: 'layer-status';
      readonly layer: number;
      readonly status: Exclude<LayerStatus, 'pending'>;
      readonly detail: string;
    }
  | { readonly type: 'stats'; readonly request: number; readonly stats: FrameStats };

/** What `postMessage` must move, not copy, for a message: canvases, pictures and shape buffers. */
export function transferables(message: HostMessage): Transferable[] {
  switch (message.type) {
    case 'layer-add':
      return typeof OffscreenCanvas === 'function' && message.canvas instanceof OffscreenCanvas
        ? [message.canvas]
        : [];
    case 'layer-backdrop':
      return [message.frame];
    case 'shapes-set':
      return [message.batch.ids.buffer, message.batch.values.buffer, message.batch.springs.buffer];
    case 'shapes-remove':
      return [message.ids.buffer];
    default:
      return [];
  }
}
