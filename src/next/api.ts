/** The public types of `createGlassHost()`. */
import type { MaterialDefinition, UniformValue } from './materials';
import type { BackdropFrame, FrameStats, LayerStatus, Rect, ShapeBox, SpringConfig } from './scene';
import type { Thread } from './transport';

export interface GlassHostOptions {
  /** `'auto'` (default): a worker when the browser can draw WebGL from one. `'page'`: always the page thread. */
  readonly thread?: 'auto' | 'page';
  /** Address of a hosted copy of `simple-liquid-glass/next/worker`, for sites that forbid `blob:` workers. */
  readonly workerUrl?: string | URL;
  /** Overrides the visitor's `prefers-reduced-motion` setting, which is followed by default. */
  readonly reducedMotion?: boolean;
  /**
   * Milliseconds to predict the scroll position ahead of what the page thread reports, for glass that
   * refracts scrolling content. Default 0.
   */
  readonly scrollLead?: number;
  /**
   * Milliseconds to start a shape's `content` ahead of its glass, for a browser that shows the two a
   * constant time apart. Default 0.
   */
  readonly contentLead?: number;
}

/** Where a rectangle lives. */
export interface Placement {
  /**
   * `true`: it stays put in the viewport (`position: fixed`, or sticky while stuck). Default `false`: it
   * moves with the document when the page scrolls.
   */
  readonly fixed?: boolean;
}

export interface BackdropOptions extends Placement {
  /** The viewport rectangle the picture covers right now. Default: the whole viewport. */
  readonly rect?: Rect;
}

export interface GlassLayerOptions extends Placement {
  /** Canvas pixels per CSS pixel. Default: the device pixel ratio, at most 2. */
  readonly scale?: number;
  /** The id of the layer's material: `'glass'` (default) or one given to `defineMaterial()`. */
  readonly material?: string;
  /** Values for the material's uniforms; the rest keep its defaults. For `glass`, see `GLASS_LIGHT`. */
  readonly params?: Readonly<Record<string, UniformValue>>;
  /** Compile the material's cheaper variant (for `glass`: no dispersion). Default `false`. */
  readonly lean?: boolean;
  /**
   * Called when the layer starts drawing, loses or regains its context, or turns out to be unsupported. In
   * `simple-liquid-glass/next/stack` also with `'drawing'` each time a material has been compiled for it (the
   * detail names it): its glass shows from then, which can be a moment after the layer was made.
   */
  readonly onStatus?: (status: LayerStatus, detail: string) => void;
}

export interface GlassShapeOptions {
  /** How the shape moves when `set()` changes it. Default: stiffness 170, damping 18. `null`: it jumps. */
  readonly spring?: SpringConfig | null;
  /**
   * An element to keep on the shape: its top-left corner follows the shape's, moved by the browser's
   * compositor in step with the glass, at the display's rate even where the page's own frames are slower.
   * Put it at the layer canvas's top-left corner (same containing block, `position: absolute; left: 0;
   * top: 0`): the engine sets its `transform`, nothing else.
   */
  readonly content?: HTMLElement;
  /**
   * The parent of `content`, to cut the content off at the shape's right and bottom edges while the shape
   * changes size: lay the content out at the size it is going to (or coming from), and the shape's edges
   * uncover or cover it at the display's rate. Give it `position: absolute; left: 0; top: 0; overflow:
   * hidden` at the layer canvas's top-left corner, and the content the same position inside it. The engine
   * sets its `width`, `height` and `transform`. It is larger than the shape and reaches up and left of it,
   * so give it `pointer-events: none` and the content `pointer-events: auto`. The cut is square: content
   * that reaches into the shape's rounded corners shows there.
   */
  readonly contentClip?: HTMLElement;
  /** Up to 24 free values for the layer's material (a colour, a lift, a flag). Default: zeros. */
  readonly attributes?: readonly number[];
}

/** Frame cadence, and the thread it was measured on. */
export interface GlassStats extends FrameStats {
  readonly thread: Thread;
}

export interface GlassShape {
  /** Moves the shape to a new box: animated by its spring, or at once with `{ jump: true }`. */
  set(box: Partial<ShapeBox>, options?: { readonly jump?: boolean }): void;
  /**
   * Changes the shape's attributes, from the first: animated by its spring, or at once with `{ jump: true }`,
   * which leaves the box to its spring (values a page works out each frame, on a shape the engine moves).
   */
  setAttributes(values: readonly number[], options?: { readonly jump?: boolean }): void;
  remove(): void;
}

export interface GlassLayer {
  /** `'unsupported'` means this canvas will not show glass: keep your CSS fallback visible. */
  readonly status: LayerStatus;
  /**
   * The picture behind the glass. The layer takes it: do not use or close it afterwards. Call it again with
   * a new picture whenever what is behind the glass changes.
   */
  setBackdrop(frame: BackdropFrame, options?: BackdropOptions): void;
  /**
   * Gives one of the material's own textures (see `MaterialDefinition.textures`) its picture. The layer
   * takes it: do not use or close it afterwards. Throws on a name the material does not declare.
   */
  setTexture(name: string, frame: BackdropFrame): void;
  /**
   * Draws the layer on every frame while on, for a material that reads `slg_time` (a shimmer, a flow). Off
   * by default: a layer draws when something changes. Turn it off while the glass is out of sight.
   */
  setRunning(running: boolean): void;
  /**
   * Says where the picture already given is now, without sending it again: for a backdrop element that
   * moved or changed size while its picture stayed the same.
   */
  moveBackdrop(options?: BackdropOptions): void;
  /** Uses a playing video as the backdrop, frame by frame. Returns a function that stops following it. */
  streamBackdrop(video: HTMLVideoElement, options?: BackdropOptions): () => void;
  /** Changes some of the material's uniforms. Throws on a name the material does not declare. */
  setParams(params: Readonly<Record<string, UniformValue>>): void;
  /**
   * Walls the layer's shapes may not pass while they move: a rectangle in CSS pixels from the canvas's
   * top-left corner, or null for none. A spring that would carry a shape through one stops it there, and a
   * shape wider or taller than the room is held to the room's size. Content given to a shape keeps to the
   * same walls. Aim shapes inside them: one sent past a wall stops at it.
   */
  setBounds(bounds: Rect | null): void;
  /** Adds a rounded box, in CSS pixels from the canvas's top-left corner. At most `MAX_SHAPES` per layer. */
  addShape(box: ShapeBox, options?: GlassShapeOptions): GlassShape;
  /** Re-reads the canvas's box. Call it when the canvas is resized or moved by anything but a scroll. */
  resize(scale?: number): void;
  /**
   * Only in `simple-liquid-glass/next/stack`. Another layer in this layer's canvas, drawn after it and after
   * the layers stacked before: its own shapes, material, uniforms, textures and backdrop, at this layer's
   * scale and place. Its pixels go over the glass already in the canvas, and its material can read that glass
   * at a viewport point with `vec4 slg_below(vec2 screen)` (premultiplied), to bend it as it bends the
   * backdrop. Give it a clip: what it reads is only current inside it. Removing a layer removes the layers
   * stacked over it.
   */
  stack?(options?: Omit<GlassLayerOptions, 'scale' | 'fixed'>): GlassLayer;
  /**
   * Only in `simple-liquid-glass/next/stack`, for a stacked layer: the rectangle it may draw in, in CSS pixels
   * from the canvas's top-left corner, or null for the whole canvas.
   */
  setClip?(clip: Rect | null): void;
  /**
   * Only in `simple-liquid-glass/next/stack`. How far past its shapes this layer's material paints right now,
   * in CSS pixels, in place of the material's own `bleed`; null goes back to that. For a material whose reach
   * depends on its uniforms or its shapes' attributes (a merge radius, a stretch): a layer shades only that
   * far around each shape, so a reach no larger than it needs is drawn faster. Too small cuts the glass off.
   */
  setReach?(reach: number | null): void;
  /**
   * Only in `simple-liquid-glass/next/stack`. Where this layer's shapes are measured from: a point in CSS
   * pixels from the canvas's top-left corner (the corner itself by default). Moving it moves every shape at
   * once, wherever its spring has it: for a canvas that grows or moves around glass that should stay put.
   */
  setOrigin?(x: number, y: number): void;
  /**
   * Only in `simple-liquid-glass/next/stack`, for a layer with a canvas of its own: the least time between
   * two frames of that canvas, in milliseconds; null for none. A worker draws as often as the display allows,
   * and on a phone glass that is expensive to shade then takes the GPU from the page's own scrolling: held to
   * about the rate the page itself runs at, both keep theirs. What changes in between is drawn in the next
   * frame. Springs keep their own time.
   */
  setPace?(interval: number | null): void;
  /** Test aid: loses the layer's WebGL context and restores it after `restoreAfter` ms. */
  simulateContextLoss(restoreAfter?: number): void;
  remove(): void;
}

export interface GlassHost {
  /** `'pending'` until the renderer has started, then where it runs. */
  readonly thread: Thread | 'pending';
  /** Resolves with the thread once the renderer has started. Calls made before that are queued. */
  readonly ready: Promise<Thread>;
  /**
   * Makes `canvas` a layer covering its own box. A worker draws at most `MAX_WORKER_LAYERS` layers: one more
   * comes back `'unsupported'` with its canvas untouched, so let several pieces of glass share a layer. The canvas must not have a context yet. In a worker it is
   * handed over for good: size it with CSS, not its `width` and `height`.
   */
  addLayer(canvas: HTMLCanvasElement, options?: GlassLayerOptions): GlassLayer;
  /**
   * Adds a material layers can use by its `id`. Throws if the id is taken or a uniform is unusable; GLSL
   * that fails to compile shows up as a layer's `'unsupported'` status, with the compiler's message.
   */
  defineMaterial(material: MaterialDefinition): void;
  /** Brings every moving shape to its target now. */
  settle(): void;
  /**
   * Only in `simple-liquid-glass/next/stack`. Draws what has changed now instead of in the next frame. On the
   * page thread that is before this call returns: for a canvas the page places over the viewport each frame, whose
   * glass must be where the page is in that same frame. In a worker it only saves the wait for the worker's frame.
   */
  draw?(): void;
  /** Frame cadence since the previous call. */
  stats(): Promise<GlassStats>;
  /** Stops the renderer and releases its contexts. Canvases handed to a worker stay blank. */
  destroy(): void;
}
