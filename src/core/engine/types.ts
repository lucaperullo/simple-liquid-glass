/**
 * simple-liquid-glass/engine — @experimental public types.
 *
 * Scope note: this module implements G1 (custom materials), the two items the design bundles
 * with it (G2 bleed + scissored draws, G3 liveness + the draw-result protocol), G10
 * (per-context resources), G7 (document-order layers), G8 (glass on glass / `under`, opt-in) and
 * G12 (backdrop-source providers). It does NOT implement G9 (a frost input) or G11 (pointer
 * input) — those were not approved; there is no `slg_frost`/`slg_pointer` and no pointer field
 * anywhere in this API. See the README "Engine API" section and the CHANGELOG for exactly what
 * each gap means for a material author.
 */

/** Integer version of this contract. Bumped only by a breaking change (an engine major). */
export const ENGINE_API = 1;

export interface EngineCapabilities {
  webgl: 1;
  maxFragmentUniformVectors: number;
  maxTextureSize: number;
  bitmapTransfer: boolean;
  /** A conservative heuristic ('lite' on low core/memory devices or a small uniform budget), not the full G14
   * adaptive-quality proposal: it exists only because `MaterialDefinition.fragment(caps)` needs something to size
   * its uniform arrays against. */
  tier: 'full' | 'lite';
}

export interface FrameInfo {
  frame: number;
  dt: number;
  now: number;
  scrolling: boolean;
}

export type DrawResult = 'drawn' | 'unchanged' | 'pending' | 'resized';

export interface MaterialDefinition<P> {
  /** Namespaced and versioned, e.g. 'glass-pro/liquid@1'. One compiled program per context per id. */
  id: string;
  /** GLSL ES 1.00 without `precision` or the prelude. Must define `vec4 slg_shade(vec2 p)`: premultiplied colour
   * at view point p (CSS px, y down, slg_point()). Called once per context; capabilities let it size uniform arrays. */
  fragment(caps: EngineCapabilities): string;
  /** Uniform names this material sets (beyond the prelude's own); locations are resolved once per program. */
  uniforms?: readonly string[];
  /** Samplers it binds itself; units are allocated above the engine's one reserved unit (slg_backdrop). */
  samplers?: readonly string[];
  /** Inputs the engine must provide; anything not asked for costs nothing. Only `backdrop` is implemented. */
  inputs?: { backdrop?: boolean };
  /** Sets this surface's uniforms and issues its draws. Called only when the surface is due this frame. */
  draw(context: DrawContext, params: Readonly<P>): DrawResult;
  /** The program was rebuilt (new context, context restored): drop cached GL objects. */
  reset?(gl: WebGLRenderingContext): void;
}

export interface Material<P> {
  readonly id: string;
}

export interface DrawContext {
  readonly gl: WebGLRenderingContext;
  /** The drawn region: CSS px size and canvas px per CSS px. */
  readonly view: { width: number; height: number; scale: number };
  /** This view's top-left in the browser viewport, CSS px (what Pro passes today as `offset`). */
  readonly viewport: { left: number; top: number };
  readonly frame: number;
  readonly dt: number;
  readonly time: number;
  /** The program/textures are new in this context (first draw after creation or a context restore). */
  readonly fresh: boolean;
  /** `prefers-reduced-motion` or a still is being taken: materials should jump to targets, not animate. */
  readonly settle: boolean;
  readonly backdrop: { box: readonly [number, number, number, number]; live: boolean } | null;
  readonly tier: 'full' | 'lite';
  /** Cached: values equal to the last call for this name on this program are not resent to the GPU.
   * The uniform's GLSL type is read once per program (via `getActiveUniform`): a `float`/`vecN` is sent
   * with `uniformNf`, an `int`/`bool`/`sampler2D`/`samplerCube` with `uniformNi` (rounded) — materials
   * never need a separate call for integer or sampler uniforms. */
  uniform(name: string, ...values: number[]): void;
  /** For a GLSL array uniform (e.g. `uniform vec4 uRect[8]`): one call for the whole array instead of
   * one `uniform()` per slot. `components` is the GLSL type's arity (1 for `float`/`int`/`bool`, up to 4
   * for `vecN`); `values` is every slot's components flattened in order. Same type detection as
   * `uniform()`, so an `int[]`/`bool[]` array is sent correctly too. Not value-cached: arrays are
   * typically whole-buffer data that changes every draw, so caching would cost more than it saves. */
  uniformArray(name: string, values: Float32Array | readonly number[], components: 1 | 2 | 3 | 4): void;
  bind(sampler: string, texture: WebGLTexture): void;
  /** This context's instance of a resource (G10), created lazily on first use. */
  resource<T>(resource: Resource<T>): T;
  /** Shade the whole region, or only these view-space CSS px rects — each gets its own `gl.viewport`
   * for that one draw, not a `gl.scissor` confined to the surface's own view, so a rect may legally
   * extend past the view's own edges (bleed/refraction reach, e.g. a soft rim that needs a few extra
   * px beyond a slot's own box); it is still clipped to the real framebuffer either way. */
  draw(rects?: ReadonlyArray<readonly [number, number, number, number]>): void;
}

export interface ResourceDefinition<T> {
  id: string;
  /** Created lazily in each context that needs it, and again (lazily, on next use) after a context restore. */
  create(gl: WebGLRenderingContext): T;
  dispose?(gl: WebGLRenderingContext, value: T): void;
}

export interface Resource<T> {
  readonly id: string;
  /** Every live instance: e.g. upload something into all contexts that already created this resource. */
  each(callback: (gl: WebGLRenderingContext, value: T) => void): void;
}

/** A surface's backdrop. `{ scene: true }` resolves against the nearest `LiquidGlassScene`
 * (see `simple-liquid-glass/backdrop`); `{ source: id }` resolves against a provider registered
 * with `engine.registerBackdropSource` (G12). */
export type BackdropInput = HTMLElement | { scene: true } | { source: string } | null;

export interface SurfaceOptions<P> {
  /** Element whose box (plus bleed) is drawn; its canvas follows it. */
  host: HTMLElement;
  material: Material<P>;
  params: P;
  backdrop?: BackdropInput;
  /** Bump when a canvas backdrop repaints; omitted = the canvas is treated as live (uploaded once per frame). */
  backdropVersion?: number | string;
  /** Draw area beyond the host on every side, CSS px; a function is read each frame (liquid that grows). */
  bleed?: number | (() => number);
  /** Highest canvas px per CSS px. Default: min(devicePixelRatio, 2), or 1.5 on tier 'lite'. */
  maxScale?: number;
  /** 'auto' (default): the nearest `Layer` whose root contains `host`, else its own canvas (same shared
   * context). 'own': always its own canvas, even inside a layer's root. */
  composition?: 'auto' | 'own';
  /** Explicit layer (overrides the 'auto' search); `null` forces 'own' even inside a layer's root. */
  layer?: Layer | null;
  /** True while moving or interacted with: drawn every frame; otherwise only when dirty. */
  active?(): boolean;
  onStatus?(status: SurfaceStatus): void;
}

export interface LayerOptions {
  /** Drawing-buffer scale, canvas px per CSS px. Default: the same default as a surface's `maxScale`. */
  scale?: number;
  /** Before each member draws, copy the layer's buffer so far (what lies beneath it) into a texture it can
   * read through `slg_under(screen)` — the mechanism behind glass on glass. Off by default: it costs one
   * extra copy per member. An own-canvas ('auto'/'own') surface whose host lies inside this layer's root
   * reads the *previous frame's* downscaled snapshot the same way, when `snapshots` is also on. */
  under?: boolean;
  /** Keep a downscaled snapshot of the layer's last completed frame, for `slg_under` on floating ('own')
   * surfaces over this layer (see `under`). Off by default. */
  snapshots?: boolean;
  /** Reserved for a future fade-in once the layer's first complete frame is ready; not implemented (no-op). */
  revealMs?: number;
}

export interface Layer {
  readonly root: HTMLElement;
  /** Inserted as `root`'s first child, `z-index: -1`; `root` is given `position: relative` and
   * `isolation: isolate` if it does not already establish a stacking context. */
  readonly canvas: HTMLCanvasElement;
  destroy(): void;
}

/** A private backdrop provider (G12): lets Pro keep a page model such as `pageScene` out of this MIT
 * engine while still using its scheduling, upload and `slg_backdrop`/`slg_under`-style sampling. */
export interface BackdropSource {
  id: string;
  /** Paint `region` (viewport CSS px) at `scale` (canvas px per CSS px) into `ctx`, skipping `exclude`d
   * elements (typically the surface's own host, so a source never captures the glass itself). Return
   * whether it actually painted (`drew`) and whether it expects to keep changing (`live`: the engine then
   * treats the surface like a live canvas/video backdrop, redrawing every frame). */
  paint(ctx: CanvasRenderingContext2D, region: DOMRectReadOnly, scale: number, exclude: readonly Element[]):
    { drew: boolean; live: boolean };
  /** Bump whenever a repaint is needed (layout changed, a frame of an internal animation, …). */
  version(): number;
  /** Optional: true when nothing paints in `region` (for example, bare page background) — lets the engine
   * skip the upload. Defaults to "always paints something". */
  covers?(region: DOMRectReadOnly, exclude: readonly Element[]): boolean;
}

export interface Surface<P> {
  update(params: Partial<P>): void;
  invalidate(): void;
  setBackdrop(backdrop: BackdropInput, version?: number | string): void;
  readonly status: SurfaceStatus;
  diagnostics(): SurfaceDiagnostics;
  destroy(): void;
}

export type SurfaceStatus =
  | { state: 'pending' | 'active' }
  | { state: 'fallback'; reason: 'webgl-unavailable' | 'material-error' | 'capture-failed' | 'invalid-backdrop' | 'api-mismatch' };

export interface SurfaceDiagnostics {
  composition: 'own' | 'layer';
  scale: number;
  uploadsLastFrame: number;
  lastDrawMs: number;
  drawnFrames: number;
}

export interface EngineStats {
  contexts: number;
  layers: number;
  surfaces: number;
  visible: number;
  drawn: number;
  missed: number;
  uploads: number;
  uploadBytes: number;
  frameMs: number;
}

export interface GlassEngine {
  readonly api: number;
  readonly version: string;
  capabilities(): EngineCapabilities;
  defineMaterial<P>(definition: MaterialDefinition<P>): Material<P>;
  defineResource<T>(definition: ResourceDefinition<T>): Resource<T>;
  createSurface<P>(options: SurfaceOptions<P>): Surface<P>;
  /** Members are any descendant of `root` registered through `createSurface`'s `layer`/'auto' resolution,
   * drawn into one shared canvas in document order (G7). */
  createLayer(root: HTMLElement, options?: LayerOptions): Layer;
  /** Register a private backdrop source (G12), referenced by id in `SurfaceOptions.backdrop: { source }`. */
  registerBackdropSource(source: BackdropSource): () => void;
  /** Hooks into the shared frame loop. 'measure' runs before any draw (read layout here), 'after' after compositing. */
  onFrame(callback: (frame: FrameInfo) => void, phase?: 'measure' | 'before' | 'after'): () => void;
  /** Mark surfaces dirty (all of them, or some): e.g. a colour-scheme change. */
  invalidate(surfaces?: readonly Surface<unknown>[]): void;
  stats(): EngineStats;
}
