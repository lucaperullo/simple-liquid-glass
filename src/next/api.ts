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
  /** Called when the layer starts drawing, loses or regains its context, or turns out to be unsupported. */
  readonly onStatus?: (status: LayerStatus, detail: string) => void;
}

export interface GlassShapeOptions {
  /** How the shape moves when `set()` changes it. Default: stiffness 170, damping 18. `null`: it jumps. */
  readonly spring?: SpringConfig | null;
  /** Up to eight free values for the layer's material (a colour, a lift, a flag). Default: zeros. */
  readonly attributes?: readonly number[];
}

/** Frame cadence, and the thread it was measured on. */
export interface GlassStats extends FrameStats {
  readonly thread: Thread;
}

export interface GlassShape {
  /** Moves the shape to a new box: animated by its spring, or at once with `{ jump: true }`. */
  set(box: Partial<ShapeBox>, options?: { readonly jump?: boolean }): void;
  /** Changes the shape's attributes, from the first: animated by its spring, or at once with `{ jump: true }`. */
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
  /** Uses a playing video as the backdrop, frame by frame. Returns a function that stops following it. */
  streamBackdrop(video: HTMLVideoElement, options?: BackdropOptions): () => void;
  /** Changes some of the material's uniforms. Throws on a name the material does not declare. */
  setParams(params: Readonly<Record<string, UniformValue>>): void;
  /** Adds a rounded box, in CSS pixels from the canvas's top-left corner. At most `MAX_SHAPES` per layer. */
  addShape(box: ShapeBox, options?: GlassShapeOptions): GlassShape;
  /** Re-reads the canvas's box. Call it when the canvas is resized or moved by anything but a scroll. */
  resize(scale?: number): void;
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
  /** Frame cadence since the previous call. */
  stats(): Promise<GlassStats>;
  /** Stops the renderer and releases its contexts. Canvases handed to a worker stay blank. */
  destroy(): void;
}
