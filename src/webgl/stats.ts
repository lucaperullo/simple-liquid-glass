import { DRAWN, FRAME_MS, MISSED, UPLOADS, UPLOAD_BYTES, VISIBLE, stats } from '../core/webgl/stats';

/** How a glass surface on the page renders: refracting through WebGL (in a shared scene canvas or its own
 * canvas) or SVG, falling back to CSS blur, or not yet / not currently rendering. */
export type GlassSurfaceStrategy = 'webgl-scene' | 'webgl-single' | 'svg' | 'css-fallback' | 'pending' | 'paused' | 'off';

export interface GlassSurfaceStats {
  readonly element: HTMLElement;
  readonly strategy: GlassSurfaceStrategy;
  /** The diagnostics reason (`data-glass-reason`) or WebGL status, e.g. `webgl-requested`, `native-svg`,
   * `missing-backdrop`, `capture-failed`. */
  readonly reason: string;
}

/** Totals since collection started; frame fields of `GlassEngineStats` hold the last completed engine frame. */
export interface GlassEngineFrameStats {
  /** WebGL surfaces whose rect intersected the viewport. */
  readonly visible: number;
  /** WebGL surfaces that rendered a new frame. */
  readonly drawn: number;
  /** Visible WebGL surfaces that needed a new frame and could not draw one (backdrop snapshot or video frame not
   * ready, a fault). Surfaces whose frame is unchanged are skipped, not missed. */
  readonly missed: number;
  /** Texture uploads (texImage2D / texSubImage2D of backdrops, crops, masks, lens maps) and their bytes. */
  readonly uploads: number;
  readonly uploadBytes: number;
  /** Main-thread time of the engine's shared frame callback, in ms (measurement, drawing and scene compositing), at the
   * resolution of `performance.now()` (coarse in some browsers: average `total.frameMs / frames`). */
  readonly frameMs: number;
}

export interface GlassEngineStats extends GlassEngineFrameStats {
  /** WebGL contexts used by live surfaces (the shared offscreen context, one per shared scene). */
  readonly contexts: number;
  /** Glass surfaces on the page: `LiquidGlass`, `<liquid-glass>` and `createWebGLSurface` surfaces. */
  readonly surfaces: number;
  /** Live WebGL surface engines (`webgl-scene`, `webgl-single` and those still pending or failed). */
  readonly webgl: number;
  /** Surfaces currently refracting: `webgl-scene`, `webgl-single` or `svg`. */
  readonly refracting: number;
  /** Surfaces per strategy. */
  readonly strategies: Readonly<Record<GlassSurfaceStrategy, number>>;
  readonly list: readonly GlassSurfaceStats[];
  /** Engine frames counted since collection started. */
  readonly frames: number;
  readonly total: GlassEngineFrameStats;
}

const strategyOf = (value: string | undefined): GlassSurfaceStrategy => value === 'webgl' ? 'webgl-single'
  : value === 'svg' || value === 'pending' || value === 'paused' || value === 'off' ? value : 'css-fallback';

/**
 * Page-level rendering statistics of every simple-liquid-glass entry on the page, for benchmarks and dashboards.
 * Frame counters start with the first call (which therefore reports zero frames); before it the engine counts
 * nothing. After it, each engine frame costs a few counter increments.
 */
export function getGlassEngineStats(): GlassEngineStats {
  stats.on = true;
  const list = new Map<HTMLElement, GlassSurfaceStats>(), contexts = new Set<WebGLRenderingContext>();
  for (const { panel, gl, scene, status } of stats.surfaces) {
    contexts.add(gl);
    const active = status === 'active';
    list.set(panel, { element: panel, strategy: active ? scene ? 'webgl-scene' : 'webgl-single' : status === 'pending' ? 'pending' : 'css-fallback',
      reason: active ? panel.dataset.glassReason ?? 'webgl' : status });
  }
  if (typeof document !== 'undefined') for (const element of document.querySelectorAll<HTMLElement>('[data-glass-strategy]')) {
    if (!list.has(element)) list.set(element, { element, strategy: strategyOf(element.dataset.glassStrategy), reason: element.dataset.glassReason ?? element.dataset.glassStrategy! });
  }
  const strategies = { 'webgl-scene': 0, 'webgl-single': 0, svg: 0, 'css-fallback': 0, pending: 0, paused: 0, off: 0 };
  for (const { strategy } of list.values()) strategies[strategy]++;
  const frame = (from: Float64Array) => ({ visible: from[VISIBLE], drawn: from[DRAWN], missed: from[MISSED], uploads: from[UPLOADS],
    uploadBytes: from[UPLOAD_BYTES], frameMs: from[FRAME_MS] });
  return { ...frame(stats.last), contexts: contexts.size, surfaces: list.size, webgl: stats.surfaces.size,
    refracting: strategies['webgl-scene'] + strategies['webgl-single'] + strategies.svg, strategies, list: [...list.values()],
    frames: stats.frames, total: frame(stats.total) };
}
