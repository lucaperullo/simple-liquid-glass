/**
 * simple-liquid-glass/engine — @experimental public types.
 *
 * Scope note: this module implements G1 (custom materials), the two items the design bundles
 * with it (G2 bleed + scissored draws, G3 liveness + the draw-result protocol) and G10
 * (per-context resources). It does NOT implement G7 (document-order layers), G8 (glass on
 * glass / `under`), G9 (a frost input), G11 (pointer input) or G12 (backdrop-source providers) —
 * those were not approved. Where the design's sketch (`docs/engine-migration.md` §4.3) mentions
 * fields or prelude functions that belong to those gaps, they are left out here on purpose; see
 * the README "Engine API" section and the CHANGELOG for exactly what that means for a material
 * author. Composition is always the surface's own canvas, sharing the one pooled WebGL context —
 * there is no multi-surface "scene" canvas for engine surfaces, because that would need the
 * sibling/layer machinery of G7/G8.
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
  /** Cached: values equal to the last call for this name on this program are not resent to the GPU. */
  uniform(name: string, ...values: number[]): void;
  bind(sampler: string, texture: WebGLTexture): void;
  /** This context's instance of a resource (G10), created lazily on first use. */
  resource<T>(resource: Resource<T>): T;
  /** Shade the whole region, or only these view-space CSS px rects (scissored to the surface's view). */
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
 * (see `simple-liquid-glass/backdrop`); a registered BackdropSource id (G12) is not implemented. */
export type BackdropInput = HTMLElement | { scene: true } | null;

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
  /** Reserved for forward compatibility with layers (G7); both values currently resolve to 'own', because this
   * module does not implement a multi-surface shared-canvas scene. See the module doc comment above. */
  composition?: 'auto' | 'own';
  /** True while moving or interacted with: drawn every frame; otherwise only when dirty. */
  active?(): boolean;
  onStatus?(status: SurfaceStatus): void;
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
  composition: 'own';
  scale: number;
  uploadsLastFrame: number;
  lastDrawMs: number;
  drawnFrames: number;
}

export interface EngineStats {
  contexts: number;
  /** Always 0: document-order layers (G7) are not implemented. */
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
  /** Hooks into the shared frame loop. 'measure' runs before any draw (read layout here), 'after' after compositing. */
  onFrame(callback: (frame: FrameInfo) => void, phase?: 'measure' | 'before' | 'after'): () => void;
  /** Mark surfaces dirty (all of them, or some): e.g. a colour-scheme change. */
  invalidate(surfaces?: readonly Surface<unknown>[]): void;
  stats(): EngineStats;
}
