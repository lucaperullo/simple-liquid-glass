/** Resolves a surface's `BackdropInput` into a texture + UV-mapping region each frame, reusing the package's
 * existing backdrop leases: `acquireTexture` (ref-counted upload cache) for video/canvas sampled in place and for
 * HTML snapshots, `acquireSource` for the HTML capture itself, and the scene registry for `{ scene: true }`.
 *
 * `acquireSource` (`../webgl/source`) pulls in the html-to-image capture pipeline — tens of kB, the same cost the
 * public `.` entry already budgets for. Surfaces that only use a video/canvas backdrop (or none) must not pay for
 * it, so it is imported lazily (R6 in the engine migration design), only from `bindHtml`, below. */
import { acquireTexture } from '../webgl/textureCache';
import { frameRect } from '../webgl/contextPool';
import { canvasFrame, liveCanvasFrame } from '../webgl/canvasFrames';
import { findScene } from '../sceneRegistry';
import type { BackdropInput, BackdropSource } from './types';

export interface BackdropSample {
  texture: WebGLTexture;
  /** uv = region.xy + screenCssPx * region.zw (see glsl.ts's slg_backdrop). */
  region: readonly [number, number, number, number];
}

/** A surface's current drawn region, CSS px — what a `{ source }` backdrop (G12) needs to know which
 * page-coordinate strip to paint; the element-based bindings (media/HTML/scene) ignore it, since they
 * already know their own geometry from the bound element. */
export interface BackdropGeometry {
  view: { width: number; height: number; scale: number };
  viewport: { left: number; top: number };
}

export interface BackdropBinding {
  /** Called on every candidate frame. Null means nothing to sample yet (still capturing, no media ready). */
  resolve(gl: WebGLRenderingContext, geometry: BackdropGeometry): BackdropSample | null;
  /** The source changes on its own schedule (a playing video, or a live canvas with no explicit version): the
   * surface should treat every frame as potentially dirty rather than waiting for an onChange notification. */
  readonly live: boolean;
  destroy(): void;
}

const alignment = (value: string | undefined): number => {
  if (value === undefined) return .5;
  if (value.endsWith('%')) return parseFloat(value) / 100;
  if (value === 'left' || value === 'top') return 0;
  if (value === 'right' || value === 'bottom') return 1;
  return .5;
};

/** uv(screen) = region.xy + screen*region.zw reproduces u=(sx-left)/w, v=1-(sy-top)/h — the exact mapping already
 * proven correct for `flip=true` uploads by `core/webgl/background.ts`. Exported: `engine.ts` reuses it for a
 * layer's snapshot-under mapping (G8), which happens to need the exact same shape (see its call site). */
export const regionFor = (left: number, top: number, w: number, h: number): readonly [number, number, number, number] =>
  [-left / w, 1 + top / h, 1 / w, -1 / h];

function bindMedia(media: HTMLVideoElement | HTMLCanvasElement, version?: number | string): BackdropBinding {
  let lease: ReturnType<typeof acquireTexture> | undefined;
  let lastFrame: number | string | undefined;
  const live = version === undefined;
  return {
    live,
    resolve(gl, _geometry) {
      const isVideo = media instanceof HTMLVideoElement;
      if (isVideo && media.readyState < 2) return null;
      const vw = isVideo ? media.videoWidth : media.width;
      const vh = isVideo ? media.videoHeight : media.height;
      if (!vw || !vh) return null;
      const bounds = frameRect(media);
      if (!bounds.width || !bounds.height) return null;
      const style = getComputedStyle(media);
      const [px, py] = style.objectPosition.split(' ');
      const ax = alignment(px), ay = alignment(py);
      let fx = bounds.width / vw, fy = bounds.height / vh;
      if (style.objectFit === 'cover') fx = fy = Math.max(fx, fy);
      else if (style.objectFit === 'contain') fx = fy = Math.min(fx, fy);
      else if (style.objectFit !== 'fill') { fx = 1; fy = 1; }
      const dw = vw * fx, dh = vh * fy;
      const left = bounds.left + (bounds.width - dw) * ax, top = bounds.top + (bounds.height - dh) * ay;
      // An internally versioned canvas (markCanvasFrame, e.g. a LiquidGlassScene capture) skips
      // the upload when nothing changed; a plain user canvas has no such version, so it is
      // treated as live and re-checked every batch (liveCanvasFrame), exactly like runtime.ts.
      const frame = live ? (isVideo ? media.currentTime : canvasFrame(media as HTMLCanvasElement) ?? liveCanvasFrame()) : version;
      if (frame !== lastFrame || !lease) {
        const next = acquireTexture(gl, media, true, typeof frame === 'number' ? frame : undefined);
        lease?.release();
        lease = next;
        lastFrame = frame;
      }
      return { texture: lease.texture, region: regionFor(left, top, dw, dh) };
    },
    destroy() { lease?.release(); lease = undefined; },
  };
}

function bindHtml(element: HTMLElement, onChange: () => void): BackdropBinding {
  type Source = ReturnType<typeof import('../webgl/source').acquireSource>;
  let shared: Source | undefined;
  let destroyed = false;
  let snapshot: HTMLCanvasElement | undefined;
  let lease: ReturnType<typeof acquireTexture> | undefined;
  void import('../webgl/source').then(({ acquireSource }) => {
    if (destroyed) return;
    shared = acquireSource(element, onChange);
    if (!shared.capture.cache.has(element)) void shared.refresh().catch(() => {});
    onChange();
  });
  return {
    live: false,
    resolve(gl, _geometry) {
      if (!shared) return null;
      const next = shared.capture.cache.get(element)?.canvas as HTMLCanvasElement | undefined;
      if (!next) return null;
      if (next !== snapshot) {
        const acquired = acquireTexture(gl, next, true);
        lease?.release();
        lease = acquired;
        snapshot = next;
      }
      const bounds = frameRect(element);
      if (!bounds.width || !bounds.height) return null;
      return { texture: lease!.texture, region: regionFor(bounds.left, bounds.top, bounds.width, bounds.height) };
    },
    destroy() { destroyed = true; lease?.release(); lease = undefined; shared?.release(); },
  };
}

function bindScene(host: HTMLElement, onChange: () => void): BackdropBinding | null {
  const scene = findScene(host);
  if (!scene) return null;
  let ready = false;
  const binding = scene.register(host, (next) => { ready = next; onChange(); });
  let lease: ReturnType<typeof acquireTexture> | undefined;
  let lastVersion: number | undefined;
  return {
    live: true,
    resolve(gl, _geometry) {
      const canvas = binding.canvas;
      if (!canvas.width || !canvas.height) return null;
      const version = canvasFrame(canvas);
      if (version === undefined) return null;
      if (version !== lastVersion || !lease) {
        const next = acquireTexture(gl, canvas, true, version);
        lease?.release();
        lease = next;
        lastVersion = version;
      }
      const top = frameRect(canvas).top;
      void ready; // the scene surfaces partial captures immediately; completeness only affects onChange cadence.
      return { texture: lease.texture, region: regionFor(0, top, canvas.width, canvas.height) };
    },
    destroy() { lease?.release(); lease = undefined; binding.release(); },
  };
}

/** How far past the surface's own view a `{ source }` backdrop (G12) paints, CSS px, and at what fraction of
 * the surface's own scale — "the surface's scale × 0.75" per the design. A real page model (`pageScene`) can
 * repaint cheaply, so this trades a little resolution for far fewer repaints: the strip is repainted only when
 * the source's `version()` changes or the surface's own view would read outside it ("leaving the painted
 * strip"), not every frame. `covers()` (skip the upload when nothing paints in the region) is not consulted —
 * a reasonable optimisation left out of this first pass. */
const SOURCE_MARGIN = 160;
const SOURCE_SCALE_FACTOR = .75;

// jsdom (and SSR) have no DOMRect global; a plain object with the same shape is what every caller reads.
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this; } }) as DOMRectReadOnly;

function bindSource(host: HTMLElement, source: BackdropSource, onChange: () => void): BackdropBinding {
  const canvas = document.createElement('canvas');
  const ctx2d = canvas.getContext('2d');
  let painted: { left: number; top: number; width: number; height: number } | null = null;
  let paintedScale = 0;
  let lease: ReturnType<typeof acquireTexture> | undefined;
  let uploadedVersion = -1;
  let paintVersion = 0;
  let lastSourceVersion: number | undefined;
  let live = false;
  let destroyed = false;

  const outside = (needed: { left: number; top: number; width: number; height: number }) =>
    !painted || needed.left < painted.left || needed.top < painted.top
    || needed.left + needed.width > painted.left + painted.width
    || needed.top + needed.height > painted.top + painted.height;

  return {
    get live() { return live; },
    resolve(gl, geometry) {
      if (!ctx2d || destroyed) return null;
      const { view, viewport } = geometry;
      const needed = {
        left: viewport.left - SOURCE_MARGIN, top: viewport.top - SOURCE_MARGIN,
        width: view.width + SOURCE_MARGIN * 2, height: view.height + SOURCE_MARGIN * 2,
      };
      const scale = Math.max(.1, view.scale * SOURCE_SCALE_FACTOR);
      const sourceVersion = source.version();
      if (scale !== paintedScale || sourceVersion !== lastSourceVersion || outside(needed)) {
        const w = Math.max(1, Math.round(needed.width * scale)), h = Math.max(1, Math.round(needed.height * scale));
        canvas.width = w; canvas.height = h;
        ctx2d.save();
        ctx2d.scale(scale, scale);
        ctx2d.translate(-needed.left, -needed.top);
        let result: { drew: boolean; live: boolean };
        try { result = source.paint(ctx2d, rect(needed.left, needed.top, needed.width, needed.height), scale, [host]); }
        catch { ctx2d.restore(); return null; }
        ctx2d.restore();
        live = result.live;
        lastSourceVersion = sourceVersion;
        if (result.drew) { painted = needed; paintedScale = scale; paintVersion++; }
      }
      if (!painted) return null;
      if (paintVersion !== uploadedVersion || !lease) {
        const next = acquireTexture(gl, canvas, true, paintVersion);
        lease?.release();
        lease = next;
        uploadedVersion = paintVersion;
      }
      return { texture: lease!.texture, region: regionFor(painted.left, painted.top, painted.width, painted.height) };
    },
    destroy() { destroyed = true; lease?.release(); lease = undefined; canvas.width = canvas.height = 0; },
  };
}

/** `null` means "no backdrop requested" (not an error): `slg_hasBackdrop()` reads 0 and `slg_backdrop` is
 * transparent black. A `{ scene: true }` input with no enclosing `LiquidGlassScene`, or a `{ source }` input
 * naming an id nothing has registered (yet), also resolves to null — not a fallback status; it starts
 * sampling as soon as a matching scene/source appears. */
export function bindBackdrop(host: HTMLElement, input: BackdropInput, onChange: () => void, version: number | string | undefined,
  sources: ReadonlyMap<string, BackdropSource>): BackdropBinding | null {
  if (!input) return null;
  if (input instanceof HTMLVideoElement || input instanceof HTMLCanvasElement) return bindMedia(input, version);
  if (input instanceof HTMLElement) return bindHtml(input, onChange);
  if ('scene' in input && input.scene) return bindScene(host, onChange);
  if ('source' in input) { const source = sources.get(input.source); return source ? bindSource(host, source, onChange) : null; }
  return null;
}
