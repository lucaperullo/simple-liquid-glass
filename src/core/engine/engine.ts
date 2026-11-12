/**
 * The page's `GlassEngine` singleton (`getGlassEngine()`), shared by every bundle of
 * simple-liquid-glass on the page via `sharedValue('engine.v1')`.
 *
 * Reuses, rather than reimplements: `acquireContextCanvas`/`frameRect`/`subscribeFrame`
 * (`contextPool.ts`, the one shared offscreen WebGL context and the one shared rAF ticker) and
 * `acquireTexture`/`acquireSource` (via `backdrop.ts`) for backdrop leases. It does not reuse
 * `sharedScene.ts`: that module's eligibility rules and blit pipeline are specific to
 * `<LiquidGlass>` panels; this engine's own document-order compositing (G7) is built directly on
 * the same one pooled WebGL context, below.
 */
import { sharedValue } from '../shared';
import { acquireContextCanvas, frameRect, subscribeFrame } from '../webgl/contextPool';
import { acquireTexture, invalidateTextures } from '../webgl/textureCache';
import { installLiquidGLOptics } from '../webgl/liquidGLOptics';
import { stats as glStats, UPLOADS, UPLOAD_BYTES } from '../webgl/stats';
import { PRELUDE, VERTEX_SHADER, linkProgram, drawQuad, invalidateQuadBuffer } from './glsl';
import { bindBackdrop, regionFor, type BackdropBinding } from './backdrop';
import {
  ENGINE_API,
  type BackdropSource,
  type DrawContext,
  type DrawResult,
  type EngineCapabilities,
  type EngineStats,
  type FrameInfo,
  type GlassEngine,
  type Layer,
  type LayerOptions,
  type Material,
  type MaterialDefinition,
  type Resource,
  type ResourceDefinition,
  type Surface,
  type SurfaceDiagnostics,
  type SurfaceOptions,
  type SurfaceStatus,
} from './types';

const EPILOGUE = 'void main() { gl_FragColor = slg_shade(slg_point()); }\n';
const PACKAGE_VERSION = '6.0.1';

interface BuiltinLocations {
  view: WebGLUniformLocation | null;
  scale: WebGLUniformLocation | null;
  origin: WebGLUniformLocation | null;
  viewport: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  backdropTex: WebGLUniformLocation | null;
  backdropRegion: WebGLUniformLocation | null;
  hasBackdrop: WebGLUniformLocation | null;
  underTex: WebGLUniformLocation | null;
  underRegion: WebGLUniformLocation | null;
  hasUnder: WebGLUniformLocation | null;
}

interface ProgramEntry {
  program: WebGLProgram;
  builtins: BuiltinLocations;
  locations: Map<string, WebGLUniformLocation | null>;
  lastValues: Map<string, readonly number[]>;
  samplerUnits: Map<string, number>;
  /** A material's own uniforms' GLSL types (by bare name, array suffixes like "[0]" stripped), read
   * once via getActiveUniform right after linking. Consulted by setUniform/setUniformArray to pick the
   * int or float GL entry point — an `int`/`bool`/`sampler2D`/`samplerCube` uniform set through
   * uniformNf would otherwise raise GL_INVALID_OPERATION. */
  uniformTypes: Map<string, number>;
  nextUnit: number;
  fresh: boolean;
}

/** GLSL ES 1.00 / WebGL1 uniform types that take the integer uniformNi entry points: int, bool and
 * both sampler types (a sampler set through `uniform()` directly, rather than `bind()`, still works). */
function isIntegerUniformType(gl: WebGLRenderingContext, type: number): boolean {
  return type === gl.INT || type === gl.INT_VEC2 || type === gl.INT_VEC3 || type === gl.INT_VEC4
    || type === gl.BOOL || type === gl.BOOL_VEC2 || type === gl.BOOL_VEC3 || type === gl.BOOL_VEC4
    || type === gl.SAMPLER_2D || type === gl.SAMPLER_CUBE;
}

/** What a draw call samples for `slg_under`: either a layer's live, per-member copy of its own buffer
 * (G8 `under`), or a floating surface's read of the nearest layer's downscaled last-frame snapshot
 * (G8 `snapshots`). Both expose the same `{ texture, region }` shape `makeContext` already uses for backdrops. */
interface UnderProvider { resolve(gl: WebGLRenderingContext): { texture: WebGLTexture; region: readonly [number, number, number, number] } | null; }

interface InternalSurface {
  id: number;
  options: SurfaceOptions<unknown>;
  params: unknown;
  canvas: HTMLCanvasElement;
  backdropBinding: BackdropBinding | null;
  backdropVersion: number | string | undefined;
  dirty: boolean;
  pendingRedraw: boolean;
  consecutiveFailures: number;
  status: SurfaceStatus;
  destroyed: boolean;
  lastGeometryKey: string;
  drawnFrames: number;
  lastDrawMs: number;
  uploadsLastFrame: number;
  lastScale: number;
  /** Resolved once at creation (and after a layer it belonged to is destroyed): the layer this surface
   * draws into, or null for its own presentation canvas. */
  layer: LayerInternal | null;
  /** Set only for an own-canvas surface floating over a layer with `snapshots: true` (G8). */
  underProvider: UnderProvider | null;
}

interface LayerMember { surface: InternalSurface; }

interface LayerInternal {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  options: Required<Pick<LayerOptions, 'scale' | 'under' | 'snapshots'>>;
  members: Set<InternalSurface>;
  destroyed: boolean;
  underTexture: WebGLTexture | null;
  underTextureSize: { w: number; h: number };
  snapshotCanvas: HTMLCanvasElement | null;
  snapshotVersion: number;
  lastCssSize: { width: number; height: number };
  handle: Layer;
}

let nextSurfaceId = 1;

function sortByDocumentOrder(members: InternalSurface[]): InternalSurface[] {
  return members.slice().sort((a, b) => {
    const relation = a.options.host.compareDocumentPosition(b.options.host);
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

function resolveBleed(bleed: SurfaceOptions<unknown>['bleed']): number {
  if (typeof bleed === 'function') return Math.max(0, bleed() || 0);
  return Math.max(0, bleed || 0);
}

function reducedMotion(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

/** Builds and owns the shared WebGL context, the material/resource/surface registries and the
 * one subscription to the package's shared frame loop. There is exactly one of these per
 * `ENGINE_API` per document (see `sharedValue`). */
function createEngine(): GlassEngine | null {
  const lease = acquireContextCanvas(false);
  const gl = lease.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true }) as WebGLRenderingContext | null;
  if (!gl) return null;

  const materialDefs = new Map<string, MaterialDefinition<unknown>>();
  const resourceDefs = new Map<string, ResourceDefinition<unknown>>();
  const resourceInstances = new Map<string, unknown>();
  const programs = new Map<string, ProgramEntry>();
  const materialsUsed = new Set<string>();
  const surfaces = new Set<InternalSurface>();
  const surfaceById = new Map<number, InternalSurface>();
  const layers = new Set<LayerInternal>();
  const layersByRoot = new Map<HTMLElement, LayerInternal>();
  const backdropSources = new Map<string, BackdropSource>();
  const frameCallbacks: { measure: Set<(f: FrameInfo) => void>; before: Set<(f: FrameInfo) => void>; after: Set<(f: FrameInfo) => void> } =
    { measure: new Set(), before: new Set(), after: new Set() };
  let frameNumber = 0, lastTime = performance.now(), lost = false;
  let statsAccum: EngineStats = { contexts: 0, layers: 0, surfaces: 0, visible: 0, drawn: 0, missed: 0, uploads: 0, uploadBytes: 0, frameMs: 0 };

  const caps: EngineCapabilities = {
    webgl: 1,
    maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    bitmapTransfer: installLiquidGLOptics.supportsBitmap(),
    tier: 'full',
  };
  {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
    const memory = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4 : 4;
    if (cores <= 2 || memory <= 1 || caps.maxFragmentUniformVectors < 256) caps.tier = 'lite';
  }

  function getProgram(materialId: string): ProgramEntry {
    let entry = programs.get(materialId);
    if (entry) return entry;
    const definition = materialDefs.get(materialId);
    if (!definition) throw new Error(`simple-liquid-glass/engine: unknown material "${materialId}"`);
    const source = PRELUDE + definition.fragment(caps) + EPILOGUE;
    const program = linkProgram(gl!, VERTEX_SHADER, source);
    const location = (name: string) => gl!.getUniformLocation(program, name);
    const uniformTypes = new Map<string, number>();
    const activeCount = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < activeCount; i++) {
      const info = gl!.getActiveUniform(program, i);
      if (!info) continue;
      // An array uniform ("uRect[8]") is reported as "uRect[0]"; uniform()/uniformArray() are always
      // called with the bare name, so strip the index to key this map the same way.
      const name = info.name.endsWith('[0]') ? info.name.slice(0, -3) : info.name;
      uniformTypes.set(name, info.type);
    }
    entry = {
      program,
      builtins: {
        view: location('slg_view'), scale: location('slg_scale'), origin: location('slg_origin'),
        viewport: location('slg_viewport'), time: location('slg_time'),
        backdropTex: location('slg_backdropTex'), backdropRegion: location('slg_backdropRegion'),
        hasBackdrop: location('slg_hasBackdropFlag'),
        underTex: location('slg_underTex'), underRegion: location('slg_underRegion'),
        hasUnder: location('slg_hasUnderFlag'),
      },
      // Unit 0 is reserved for slg_backdropTex, unit 1 for slg_underTex; a material's own samplers start at 2.
      locations: new Map(), lastValues: new Map(), samplerUnits: new Map(), uniformTypes, nextUnit: 2, fresh: true,
    };
    programs.set(materialId, entry);
    materialsUsed.add(materialId);
    return entry;
  }

  function uniformLocation(entry: ProgramEntry, name: string): WebGLUniformLocation | null {
    if (entry.locations.has(name)) return entry.locations.get(name)!;
    const location = gl!.getUniformLocation(entry.program, name);
    entry.locations.set(name, location);
    return location;
  }

  function setUniform(entry: ProgramEntry, name: string, values: readonly number[]) {
    const location = uniformLocation(entry, name);
    if (!location) return;
    const previous = entry.lastValues.get(name);
    if (previous && previous.length === values.length && previous.every((v, i) => v === values[i])) return;
    entry.lastValues.set(name, values);
    const type = entry.uniformTypes.get(name);
    if (type !== undefined && isIntegerUniformType(gl!, type)) {
      switch (values.length) {
        case 1: gl!.uniform1i(location, Math.round(values[0])); break;
        case 2: gl!.uniform2i(location, Math.round(values[0]), Math.round(values[1])); break;
        case 3: gl!.uniform3i(location, Math.round(values[0]), Math.round(values[1]), Math.round(values[2])); break;
        case 4: gl!.uniform4i(location, Math.round(values[0]), Math.round(values[1]), Math.round(values[2]), Math.round(values[3])); break;
        default: throw new Error('simple-liquid-glass/engine: uniform() takes 1-4 numbers');
      }
      return;
    }
    switch (values.length) {
      case 1: gl!.uniform1f(location, values[0]); break;
      case 2: gl!.uniform2f(location, values[0], values[1]); break;
      case 3: gl!.uniform3f(location, values[0], values[1], values[2]); break;
      case 4: gl!.uniform4f(location, values[0], values[1], values[2], values[3]); break;
      default: throw new Error('simple-liquid-glass/engine: uniform() takes 1-4 numbers');
    }
  }

  function setUniformArray(entry: ProgramEntry, name: string, values: Float32Array | readonly number[], components: 1 | 2 | 3 | 4) {
    const location = uniformLocation(entry, name);
    if (!location) return;
    // Not value-cached (see DrawContext.uniformArray's doc): array data is expected to change every
    // draw, so diffing it would typically cost more than just resending it.
    const type = entry.uniformTypes.get(name);
    if (type !== undefined && isIntegerUniformType(gl!, type)) {
      const ints = values instanceof Float32Array ? Int32Array.from(values) : Int32Array.from(values);
      switch (components) {
        case 1: gl!.uniform1iv(location, ints); break;
        case 2: gl!.uniform2iv(location, ints); break;
        case 3: gl!.uniform3iv(location, ints); break;
        case 4: gl!.uniform4iv(location, ints); break;
      }
      return;
    }
    const floats = values instanceof Float32Array ? values : Float32Array.from(values);
    switch (components) {
      case 1: gl!.uniform1fv(location, floats); break;
      case 2: gl!.uniform2fv(location, floats); break;
      case 3: gl!.uniform3fv(location, floats); break;
      case 4: gl!.uniform4fv(location, floats); break;
    }
  }

  function samplerUnit(entry: ProgramEntry, name: string): number {
    let unit = entry.samplerUnits.get(name);
    if (unit === undefined) {
      unit = entry.nextUnit++;
      entry.samplerUnits.set(name, unit);
      const location = uniformLocation(entry, name);
      if (location) gl!.uniform1i(location, unit);
    }
    return unit;
  }

  function getResourceInstance<T>(resource: Resource<T>): T {
    const key = resource.id;
    if (!resourceInstances.has(key)) {
      const definition = resourceDefs.get(key);
      if (!definition) throw new Error(`simple-liquid-glass/engine: unknown resource "${key}"`);
      resourceInstances.set(key, definition.create(gl!));
    }
    return resourceInstances.get(key) as T;
  }

  function enterFallback(surface: InternalSurface, reason: Extract<SurfaceStatus, { state: 'fallback' }>['reason']) {
    surface.status = { state: 'fallback', reason };
    surface.canvas.style.display = 'none';
    surface.options.onStatus?.(surface.status);
  }

  function setStatus(surface: InternalSurface, status: SurfaceStatus) {
    if (surface.status.state === status.state && (status.state !== 'fallback' || (surface.status as { reason?: string }).reason === (status as { reason?: string }).reason)) return;
    surface.status = status;
    if (status.state !== 'fallback') surface.canvas.style.display = '';
    surface.options.onStatus?.(status);
  }

  function presentationCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.liquidGlassEngine = '';
    canvas.style.cssText = 'display:block;position:fixed;left:0;top:0;pointer-events:none;z-index:-1';
    document.body.append(canvas);
    return canvas;
  }

  /** A layer member has no presentation canvas of its own (it draws into the layer's shared one): this is
   * never inserted into the document, just a placeholder so `enterFallback`/`setStatus` have somewhere to
   * set `.style.display` without a null check on every surface. */
  function detachedCanvas(): HTMLCanvasElement {
    return document.createElement('canvas');
  }

  function findLayerForHost(host: HTMLElement): LayerInternal | null {
    for (let node = host.parentElement; node; node = node.parentElement) {
      const found = layersByRoot.get(node);
      if (found) return found;
    }
    return null;
  }

  /** A floating ('own') surface over a layer with `snapshots: true` (G8): `slg_under` reads the layer's
   * downscaled last-completed-frame snapshot, mapped by the layer's own current viewport-covering rect. */
  function makeSnapshotUnderProvider(layer: LayerInternal): UnderProvider {
    let lease: ReturnType<typeof acquireTexture> | undefined;
    let uploadedVersion = -1;
    return {
      resolve(gl) {
        if (!layer.snapshotCanvas || !layer.snapshotCanvas.width || !layer.snapshotCanvas.height) return null;
        if (layer.snapshotVersion !== uploadedVersion || !lease) {
          const next = acquireTexture(gl, layer.snapshotCanvas, true, layer.snapshotVersion);
          lease?.release();
          lease = next;
          uploadedVersion = layer.snapshotVersion;
        }
        return { texture: lease!.texture, region: regionFor(0, 0, layer.lastCssSize.width, layer.lastCssSize.height) };
      },
    };
  }

  function rebindBackdrop(surface: InternalSurface) {
    surface.backdropBinding?.destroy();
    const input = surface.options.backdrop ?? null;
    surface.backdropBinding = bindBackdrop(surface.options.host, input, () => { surface.dirty = true; }, surface.backdropVersion, backdropSources);
  }

  /** `origin` is device px, the same value passed to `gl.viewport` for this draw (0,0 for an own-canvas
   * surface; a layer member's own offset within the shared layer buffer — see `slg_origin` in `glsl.ts`).
   * `underProvider` supplies `slg_under`: a layer's live per-member copy (G8 `under`) or a floating
   * surface's read of the nearest layer's snapshot (G8 `snapshots`); null means `slg_under` always reads 0. */
  function makeContext(surface: InternalSurface, entry: ProgramEntry, view: { width: number; height: number; scale: number },
    viewport: { left: number; top: number }, origin: { x: number; y: number }, underProvider: UnderProvider | null,
    time: number, dt: number, fresh: boolean, settle: boolean): DrawContext {
    const canvasW = Math.max(1, Math.round(view.width * view.scale)), canvasH = Math.max(1, Math.round(view.height * view.scale));
    let backdropInfo: DrawContext['backdrop'] = null;
    let bound = false;
    const bindInputs = () => {
      if (bound) return;
      bound = true;
      const sample = surface.backdropBinding?.resolve(gl!, { view, viewport });
      if (sample) {
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, sample.texture);
        if (entry.builtins.backdropTex) gl!.uniform1i(entry.builtins.backdropTex, 0);
        if (entry.builtins.backdropRegion) gl!.uniform4f(entry.builtins.backdropRegion, sample.region[0], sample.region[1], sample.region[2], sample.region[3]);
        if (entry.builtins.hasBackdrop) gl!.uniform1f(entry.builtins.hasBackdrop, 1);
        backdropInfo = { box: [viewport.left, viewport.top, view.width, view.height], live: surface.backdropBinding!.live };
      } else if (entry.builtins.hasBackdrop) {
        gl!.uniform1f(entry.builtins.hasBackdrop, 0);
      }
      const under = underProvider?.resolve(gl!);
      if (under) {
        gl!.activeTexture(gl!.TEXTURE1);
        gl!.bindTexture(gl!.TEXTURE_2D, under.texture);
        if (entry.builtins.underTex) gl!.uniform1i(entry.builtins.underTex, 1);
        if (entry.builtins.underRegion) gl!.uniform4f(entry.builtins.underRegion, under.region[0], under.region[1], under.region[2], under.region[3]);
        if (entry.builtins.hasUnder) gl!.uniform1f(entry.builtins.hasUnder, 1);
      } else if (entry.builtins.hasUnder) {
        gl!.uniform1f(entry.builtins.hasUnder, 0);
      }
    };
    return {
      gl: gl!,
      view: { width: view.width, height: view.height, scale: view.scale },
      viewport,
      frame: frameNumber, dt, time,
      fresh, settle,
      get backdrop() { bindInputs(); return backdropInfo; },
      tier: caps.tier,
      uniform(name, ...values) { setUniform(entry, name, values); },
      uniformArray(name, values, components) { setUniformArray(entry, name, values, components); },
      bind(name, texture) {
        const unit = samplerUnit(entry, name);
        gl!.activeTexture(gl!.TEXTURE0 + unit);
        gl!.bindTexture(gl!.TEXTURE_2D, texture);
      },
      resource(resource) { return getResourceInstance(resource); },
      draw(rects) {
        bindInputs();
        const baseX = Math.round(origin.x), baseY = Math.round(origin.y);
        if (!rects || !rects.length) { gl!.disable(gl!.SCISSOR_TEST); drawQuad(gl!); return; }
        // A material may ask to draw past its own view on purpose (bleed/refraction reach — e.g.
        // `clusters(slots, merge + REFRACT_REACH)` padding a slot's box for its soft rim). The quad's
        // geometry is confined to whatever `gl.viewport` is current, so a viewport fixed to the
        // surface's own view can never let a rect reach past it — a scissor can only shrink what the
        // quad already covers, never grow it. Fixed here by widening `gl.viewport`, ONCE, to the union
        // of the view and every rect, then scissoring each rect inside that union — NOT by moving the
        // viewport per rect (reverted: that moved `slg_origin` with it, so `slg_point()` returned a
        // point relative to each rect's own corner instead of the surface's own view, shifting any
        // shape a material positions in surface coordinates, e.g. an SDF slot — see the regression
        // this comment replaces). `gl_FragCoord` is an absolute framebuffer position, independent of
        // `gl.viewport`; `slg_origin`/`slg_view`/`slg_scale` (set once, before the material's own
        // `draw()` runs, and never touched here) are what `slg_point()` actually reads, so leaving them
        // alone keeps every fragment's point identical to the unpadded case, in the view and the bleed
        // alike — widening the viewport only changes which pixels the quad can reach, not what any of
        // them compute.
        let l = 0, t = 0, r = view.width, b = view.height;
        for (const [x, y, w, h] of rects) { l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x + w); b = Math.max(b, y + h); }
        // l/t can only shrink from 0 and r/b can only grow from view.width/height above, so every pad
        // below is always >= 0 — never needs its own clamp.
        if (l < 0 || t < 0 || r > view.width || b > view.height) {
          const pl = Math.round(-l * view.scale), pt = Math.round(-t * view.scale);
          const pr = Math.round((r - view.width) * view.scale), pb = Math.round((b - view.height) * view.scale);
          gl!.viewport(baseX - pl, baseY - pb, canvasW + pl + pr, canvasH + pt + pb);
        }
        gl!.enable(gl!.SCISSOR_TEST);
        for (const [x, y, w, h] of rects) {
          // Scissor coordinates are absolute framebuffer device px — the same space `gl.viewport`'s
          // x/y are in, independent of whatever the viewport above just widened to — so this is still
          // relative to the surface's own (unpadded) origin, exactly as the no-pad case already was. A
          // signed x/y here is legal and clipped to the real framebuffer by WebGL on its own: a rect
          // whose near edge goes negative must NOT be clamped back to 0 first (that would shift the
          // whole rect instead of letting it extend past 0, losing the near-edge bleed while wasting an
          // equal amount past the far edge instead — the bug the per-rect-viewport attempt also carried
          // over from the very first version of this fix).
          const sx = Math.round(x * view.scale), sw = Math.max(0, Math.round(w * view.scale));
          const topPx = Math.round(y * view.scale), sh = Math.max(0, Math.round(h * view.scale));
          const sy = canvasH - topPx - sh;
          gl!.scissor(baseX + sx, baseY + sy, sw, sh);
          drawQuad(gl!);
        }
        gl!.disable(gl!.SCISSOR_TEST);
        // Restore the surface's own nominal viewport: code after this ctx.draw() call (or the next
        // surface's own draw) must not see this call's widened one.
        gl!.viewport(baseX, baseY, canvasW, canvasH);
      },
    };
  }

  function drawSurface(surface: InternalSurface, rect: DOMRect, time: number, dt: number) {
    const materialId = surface.options.material.id;
    let entry: ProgramEntry;
    try { entry = getProgram(materialId); }
    catch { enterFallback(surface, 'material-error'); return; }
    const fresh = entry.fresh; entry.fresh = false;
    const materialDef = materialDefs.get(materialId)!;
    const settle = reducedMotion();

    let result: DrawResult = 'unchanged';
    let errored = false;
    let view = { width: 0, height: 0, scale: 1 }, viewport = { left: 0, top: 0 };
    for (let loops = 0; loops < 4; loops++) {
      const bleed = resolveBleed(surface.options.bleed);
      view = { width: rect.width + bleed * 2, height: rect.height + bleed * 2,
        scale: Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1, surface.options.maxScale ?? (caps.tier === 'lite' ? 1.5 : 2)) };
      viewport = { left: rect.left - bleed, top: rect.top - bleed };
      surface.lastScale = view.scale;
      const canvasW = Math.max(1, Math.round(view.width * view.scale)), canvasH = Math.max(1, Math.round(view.height * view.scale));
      const glCanvas = gl!.canvas as HTMLCanvasElement;
      glCanvas.width = canvasW; glCanvas.height = canvasH;
      gl!.viewport(0, 0, canvasW, canvasH);
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.useProgram(entry.program);
      if (entry.builtins.view) gl!.uniform2f(entry.builtins.view, view.width, view.height);
      if (entry.builtins.scale) gl!.uniform1f(entry.builtins.scale, view.scale);
      if (entry.builtins.origin) gl!.uniform2f(entry.builtins.origin, 0, 0);
      if (entry.builtins.viewport) gl!.uniform2f(entry.builtins.viewport, viewport.left, viewport.top);
      if (entry.builtins.time) gl!.uniform1f(entry.builtins.time, time);
      const ctx = makeContext(surface, entry, view, viewport, { x: 0, y: 0 }, surface.underProvider, time, dt, fresh && loops === 0, settle);
      try { result = materialDef.draw(ctx, surface.params as never); surface.consecutiveFailures = 0; }
      catch (error) {
        surface.consecutiveFailures++;
        if (surface.consecutiveFailures >= 3) { enterFallback(surface, 'material-error'); return; }
        if (typeof console !== 'undefined') console.error('simple-liquid-glass/engine: material draw failed', error);
        result = 'unchanged';
        errored = true;
        break;
      }
      if (result !== 'resized') break;
    }

    // A thrown draw stays dirty so the engine retries it next frame (the fallback is reached by
    // three CONSECUTIVE throws across consecutive frames, not three attempts in one frame).
    if (errored) { surface.dirty = true; return; }

    if (result === 'drawn' || result === 'pending' || result === 'resized') {
      const canvasW = Math.max(1, Math.round(view.width * view.scale)), canvasH = Math.max(1, Math.round(view.height * view.scale));
      if (surface.canvas.width !== canvasW || surface.canvas.height !== canvasH) { surface.canvas.width = canvasW; surface.canvas.height = canvasH; }
      surface.canvas.style.width = `${view.width}px`; surface.canvas.style.height = `${view.height}px`;
      surface.canvas.style.left = `${viewport.left}px`; surface.canvas.style.top = `${viewport.top}px`;
      const output = surface.canvas.getContext('2d');
      if (output) { output.globalCompositeOperation = 'copy'; output.drawImage(gl!.canvas as HTMLCanvasElement, 0, 0, canvasW, canvasH); }
      surface.drawnFrames++;
      statsAccum.drawn++;
      surface.pendingRedraw = result === 'pending';
      surface.dirty = false;
      setStatus(surface, result === 'pending' ? { state: 'pending' } : { state: 'active' });
    } else {
      surface.dirty = false; surface.pendingRedraw = false;
    }
  }

  /** One member's draw into the layer's shared buffer (already cleared by `drawLayer`, below). Unlike
   * `drawSurface`, this does not resize or clear the shared GL canvas, and does not copy anything out —
   * the layer presents once, after every member has drawn. `gl.viewport`/`slg_origin` move to the
   * member's own offset within the buffer (G7), matching `hudShader.ts`'s `ox,oy`/`uOrigin`. */
  function drawLayerMember(layer: LayerInternal, surface: InternalSurface, rect: DOMRect, bufferHeight: number,
    underProvider: UnderProvider | null, time: number, dt: number) {
    const materialId = surface.options.material.id;
    let entry: ProgramEntry;
    try { entry = getProgram(materialId); }
    catch { enterFallback(surface, 'material-error'); return; }
    const fresh = entry.fresh; entry.fresh = false;
    const materialDef = materialDefs.get(materialId)!;
    const settle = reducedMotion();
    const scale = layer.options.scale;

    let result: DrawResult = 'unchanged';
    let errored = false;
    let view = { width: 0, height: 0, scale }, viewport = { left: 0, top: 0 };
    for (let loops = 0; loops < 4; loops++) {
      const bleed = resolveBleed(surface.options.bleed);
      view = { width: rect.width + bleed * 2, height: rect.height + bleed * 2, scale };
      viewport = { left: rect.left - bleed, top: rect.top - bleed };
      surface.lastScale = scale;
      const w = Math.max(1, Math.round(view.width * scale)), h = Math.max(1, Math.round(view.height * scale));
      // The layer's canvas always covers exactly the current browser viewport (see drawLayer), so a
      // member's CSS position within it is its own `viewport` directly — no extra root-relative math.
      const ox = Math.round(viewport.left * scale);
      const oy = Math.round(bufferHeight - (viewport.top + view.height) * scale);
      gl!.viewport(ox, oy, w, h);
      gl!.useProgram(entry.program);
      if (entry.builtins.view) gl!.uniform2f(entry.builtins.view, view.width, view.height);
      if (entry.builtins.scale) gl!.uniform1f(entry.builtins.scale, scale);
      if (entry.builtins.origin) gl!.uniform2f(entry.builtins.origin, ox, oy);
      if (entry.builtins.viewport) gl!.uniform2f(entry.builtins.viewport, viewport.left, viewport.top);
      if (entry.builtins.time) gl!.uniform1f(entry.builtins.time, time);
      const ctx = makeContext(surface, entry, view, viewport, { x: ox, y: oy }, underProvider, time, dt, fresh && loops === 0, settle);
      try { result = materialDef.draw(ctx, surface.params as never); surface.consecutiveFailures = 0; }
      catch (error) {
        surface.consecutiveFailures++;
        if (surface.consecutiveFailures >= 3) { enterFallback(surface, 'material-error'); return; }
        if (typeof console !== 'undefined') console.error('simple-liquid-glass/engine: material draw failed', error);
        result = 'unchanged';
        errored = true;
        break;
      }
      if (result !== 'resized') break;
    }
    if (errored) { surface.dirty = true; return; }
    if (result === 'drawn' || result === 'pending' || result === 'resized') {
      surface.drawnFrames++;
      statsAccum.drawn++;
      surface.pendingRedraw = result === 'pending';
      surface.dirty = false;
      setStatus(surface, result === 'pending' ? { state: 'pending' } : { state: 'active' });
    } else {
      surface.dirty = false; surface.pendingRedraw = false;
    }
  }

  /** Redraws every member of `layer`, in DOM order, into its one shared canvas. A layer with at least one
   * member redraws every frame it is visited from `tick()` below — there is no fine-grained per-layer
   * dirty tracking in this release (each member's own dirty/active/pendingRedraw bookkeeping still runs
   * and still feeds `stats()`, it just does not gate whether the layer redraws). */
  function drawLayer(layer: LayerInternal, time: number, dt: number) {
    const rootRect = frameRect(layer.root);
    const cssWidth = innerWidth, cssHeight = innerHeight;
    layer.lastCssSize = { width: cssWidth, height: cssHeight };
    const scale = layer.options.scale;
    const bufferW = Math.max(1, Math.round(cssWidth * scale)), bufferH = Math.max(1, Math.round(cssHeight * scale));
    const glCanvas = gl!.canvas as HTMLCanvasElement;
    glCanvas.width = bufferW; glCanvas.height = bufferH;
    gl!.viewport(0, 0, bufferW, bufferH);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    // position:absolute inside an isolated root (see createLayer); tracks the viewport via transform each
    // frame instead of native scroll, so the canvas is never larger than what is on screen right now.
    layer.canvas.style.transform = `translate(${-rootRect.left}px, ${-rootRect.top}px)`;
    if (layer.canvas.width !== bufferW || layer.canvas.height !== bufferH) { layer.canvas.width = bufferW; layer.canvas.height = bufferH; }
    layer.canvas.style.width = `${cssWidth}px`;
    layer.canvas.style.height = `${cssHeight}px`;

    const underRegion = regionFor(0, 0, cssWidth, cssHeight);
    const underProvider: UnderProvider | null = layer.options.under ? {
      resolve: () => layer.underTexture ? { texture: layer.underTexture, region: underRegion } : null,
    } : null;

    for (const member of sortByDocumentOrder([...layer.members])) {
      if (member.destroyed || member.status.state === 'fallback') continue;
      let rect: DOMRect;
      try { rect = frameRect(member.options.host); } catch { continue; }
      if (!rect.width || !rect.height) continue;
      if (rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight) statsAccum.visible++;

      if (layer.options.under) {
        if (!layer.underTexture) {
          layer.underTexture = gl!.createTexture();
          gl!.bindTexture(gl!.TEXTURE_2D, layer.underTexture);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
        }
        // Copies the buffer as drawn so far (everything before this member, in document order) — the
        // mechanism behind glass on glass, matching compositor.ts's copyTexSubImage2D "under" copy.
        gl!.bindTexture(gl!.TEXTURE_2D, layer.underTexture);
        gl!.copyTexImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, 0, 0, bufferW, bufferH, 0);
      }
      drawLayerMember(layer, member, rect, bufferH, underProvider, time, dt);
    }

    const output = layer.canvas.getContext('2d');
    if (output) { output.globalCompositeOperation = 'copy'; output.drawImage(glCanvas, 0, 0, bufferW, bufferH); }

    if (layer.options.snapshots) {
      const snapW = Math.max(1, Math.round(cssWidth * .5)), snapH = Math.max(1, Math.round(cssHeight * .5));
      if (!layer.snapshotCanvas) layer.snapshotCanvas = document.createElement('canvas');
      if (layer.snapshotCanvas.width !== snapW || layer.snapshotCanvas.height !== snapH) { layer.snapshotCanvas.width = snapW; layer.snapshotCanvas.height = snapH; }
      const snapshotCtx = layer.snapshotCanvas.getContext('2d');
      if (snapshotCtx) {
        snapshotCtx.clearRect(0, 0, snapW, snapH);
        snapshotCtx.drawImage(layer.canvas, 0, 0, snapW, snapH);
        layer.snapshotVersion++;
      }
    }
  }

  const measured = new Map<InternalSurface, DOMRect>();
  function measurePhase() {
    measured.clear();
    for (const surface of surfaces) {
      if (surface.destroyed || surface.status.state === 'fallback') continue;
      try { measured.set(surface, frameRect(surface.options.host)); } catch { /* detached */ }
    }
    for (const callback of frameCallbacks.measure) callback(frameInfo());
  }

  function frameInfo(): FrameInfo {
    return { frame: frameNumber, dt: Math.max(0, (performance.now() - lastTime)), now: performance.now(), scrolling: false };
  }

  function tick() {
    if (lost || (typeof document !== 'undefined' && document.hidden)) return;
    frameNumber++;
    const now = performance.now(); const dt = Math.max(0, now - lastTime); lastTime = now;
    glStats.on = true;
    const u0 = glStats.frame[UPLOADS], b0 = glStats.frame[UPLOAD_BYTES];
    statsAccum = { contexts: 1, layers: layers.size, surfaces: surfaces.size, visible: 0, drawn: 0, missed: 0, uploads: 0, uploadBytes: 0, frameMs: 0 };
    const info: FrameInfo = { frame: frameNumber, dt, now, scrolling: false };
    for (const callback of frameCallbacks.before) callback(info);
    for (const surface of surfaces) {
      if (surface.destroyed || surface.status.state === 'fallback' || surface.layer) continue;
      const rect = measured.get(surface);
      if (!rect || !rect.width || !rect.height) continue;
      const visible = rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
      const isActive = !!surface.options.active?.();
      if (!visible && !isActive) continue;
      if (visible) statsAccum.visible++;
      const bleed = resolveBleed(surface.options.bleed);
      const scale = Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1, surface.options.maxScale ?? (caps.tier === 'lite' ? 1.5 : 2));
      const geometryKey = `${rect.width + bleed * 2}:${rect.height + bleed * 2}:${scale}:${rect.left - bleed}:${rect.top - bleed}`;
      const backdropLive = !!surface.backdropBinding?.live;
      const due = isActive || surface.dirty || surface.pendingRedraw || backdropLive || geometryKey !== surface.lastGeometryKey;
      surface.lastGeometryKey = geometryKey;
      if (!due) continue;
      const start = performance.now();
      drawSurface(surface, rect, now / 1000, dt / 1000);
      surface.lastDrawMs = performance.now() - start;
      statsAccum.frameMs += surface.lastDrawMs;
    }
    for (const layer of layers) {
      if (layer.destroyed || !layer.members.size) continue;
      const start = performance.now();
      drawLayer(layer, now / 1000, dt / 1000);
      statsAccum.frameMs += performance.now() - start;
    }
    statsAccum.uploads = glStats.frame[UPLOADS] - u0;
    statsAccum.uploadBytes = glStats.frame[UPLOAD_BYTES] - b0;
    for (const callback of frameCallbacks.after) callback(info);
  }

  const canvasElement = gl.canvas as HTMLCanvasElement;
  const onLost = (event: Event) => {
    event.preventDefault(); lost = true; invalidateTextures(gl!); invalidateQuadBuffer(gl!); programs.clear();
    for (const layer of layers) layer.underTexture = null;
    for (const surface of surfaces) setStatus(surface, { state: 'pending' });
  };
  const onRestored = () => {
    lost = false;
    invalidateTextures(gl!); invalidateQuadBuffer(gl!);
    for (const materialId of materialsUsed) materialDefs.get(materialId)?.reset?.(gl!);
    programs.clear(); materialsUsed.clear(); resourceInstances.clear();
    for (const layer of layers) layer.underTexture = null;
    for (const surface of surfaces) { surface.consecutiveFailures = 0; surface.dirty = true; rebindBackdrop(surface); setStatus(surface, { state: 'pending' }); }
  };
  canvasElement.addEventListener('webglcontextlost', onLost);
  canvasElement.addEventListener('webglcontextrestored', onRestored);

  const stopFrame = subscribeFrame(tick, measurePhase);
  void stopFrame; // the engine is a page singleton; it never unsubscribes.

  const engine: GlassEngine = {
    api: ENGINE_API,
    version: PACKAGE_VERSION,
    capabilities() { return { ...caps }; },
    defineMaterial<P>(definition: MaterialDefinition<P>): Material<P> {
      if (!materialDefs.has(definition.id)) materialDefs.set(definition.id, definition as MaterialDefinition<unknown>);
      return { id: definition.id };
    },
    defineResource<T>(definition: ResourceDefinition<T>): Resource<T> {
      if (!resourceDefs.has(definition.id)) resourceDefs.set(definition.id, definition as ResourceDefinition<unknown>);
      return {
        id: definition.id,
        each(callback) { if (resourceInstances.has(definition.id)) callback(gl!, resourceInstances.get(definition.id) as T); },
      };
    },
    createSurface<P>(options: SurfaceOptions<P>): Surface<P> {
      // Resolved once, at creation (not re-checked every frame — a documented simplification): an
      // explicit `layer` wins, `null` forces 'own', otherwise the nearest enclosing layer, if any.
      const explicitLayer = options.layer;
      const candidateLayer: LayerInternal | null = explicitLayer === null ? null
        : explicitLayer !== undefined ? layerInternalOf(explicitLayer)
        : findLayerForHost(options.host);
      const memberLayer = options.composition === 'own' ? null : candidateLayer;
      const surface: InternalSurface = {
        id: nextSurfaceId++, options: options as SurfaceOptions<unknown>, params: options.params,
        canvas: memberLayer ? detachedCanvas() : presentationCanvas(), backdropBinding: null, backdropVersion: options.backdropVersion,
        dirty: true, pendingRedraw: false, consecutiveFailures: 0, status: { state: 'pending' },
        destroyed: false, lastGeometryKey: '', drawnFrames: 0, lastDrawMs: 0, uploadsLastFrame: 0, lastScale: 1,
        layer: memberLayer, underProvider: !memberLayer && candidateLayer?.options.snapshots ? makeSnapshotUnderProvider(candidateLayer) : null,
      };
      if (memberLayer) memberLayer.members.add(surface);
      rebindBackdrop(surface);
      surfaces.add(surface);
      const handle: Surface<P> = {
        update(partial) { Object.assign(surface.params as object, partial); surface.dirty = true; },
        invalidate() { surface.dirty = true; },
        setBackdrop(backdrop, version) { surface.options.backdrop = backdrop; surface.backdropVersion = version; rebindBackdrop(surface); surface.dirty = true; },
        get status() { return surface.status; },
        diagnostics(): SurfaceDiagnostics {
          return { composition: surface.layer ? 'layer' : 'own', scale: surface.lastScale, uploadsLastFrame: surface.uploadsLastFrame, lastDrawMs: surface.lastDrawMs, drawnFrames: surface.drawnFrames };
        },
        destroy() {
          if (surface.destroyed) return;
          surface.destroyed = true; surfaces.delete(surface); surfaceById.delete(surface.id);
          surface.layer?.members.delete(surface);
          surface.backdropBinding?.destroy();
          surface.canvas.remove(); surface.canvas.width = surface.canvas.height = 0;
        },
      };
      Object.defineProperty(handle, '__id', { value: surface.id, enumerable: false });
      surfaceById.set(surface.id, surface);
      return handle;
    },
    createLayer(root: HTMLElement, options?: LayerOptions): Layer {
      if (layersByRoot.has(root)) throw new Error('simple-liquid-glass/engine: this root already has a layer');
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.dataset.liquidGlassEngineLayer = '';
      canvas.style.cssText = 'position:absolute;top:0;left:0;z-index:-1;pointer-events:none;display:block';
      const computed = getComputedStyle(root);
      // getComputedStyle reports '' (not the initial value) for a property no rule ever set, in some
      // engines (including jsdom) — treat that the same as the property's own initial value.
      if (!computed.position || computed.position === 'static') root.style.position = 'relative';
      if (!computed.isolation || computed.isolation === 'auto') root.style.isolation = 'isolate';
      root.insertBefore(canvas, root.firstChild);
      const internal: LayerInternal = {
        root, canvas,
        options: { scale: options?.scale ?? (caps.tier === 'lite' ? 1.5 : 2), under: !!options?.under, snapshots: !!options?.snapshots },
        members: new Set(), destroyed: false, underTexture: null, underTextureSize: { w: 0, h: 0 },
        snapshotCanvas: null, snapshotVersion: 0, lastCssSize: { width: 0, height: 0 },
        handle: null as unknown as Layer,
      };
      const handle: Layer = {
        root, canvas,
        destroy() {
          if (internal.destroyed) return;
          internal.destroyed = true;
          layers.delete(internal); layersByRoot.delete(root);
          for (const member of internal.members) {
            member.layer = null;
            member.canvas = presentationCanvas();
            member.dirty = true;
            member.lastGeometryKey = '';
          }
          internal.members.clear();
          canvas.remove();
          if (internal.underTexture && !gl!.isContextLost()) gl!.deleteTexture(internal.underTexture);
          internal.underTexture = null;
          internal.snapshotCanvas = null;
        },
      };
      internal.handle = handle;
      Object.defineProperty(handle, '__internal', { value: internal, enumerable: false });
      layers.add(internal); layersByRoot.set(root, internal);
      return handle;
    },
    registerBackdropSource(source: BackdropSource) {
      backdropSources.set(source.id, source);
      for (const surface of surfaces) {
        const input = surface.options.backdrop;
        if (input && typeof input === 'object' && 'source' in input && input.source === source.id && !surface.backdropBinding) {
          rebindBackdrop(surface);
          surface.dirty = true;
        }
      }
      return () => { if (backdropSources.get(source.id) === source) backdropSources.delete(source.id); };
    },
    onFrame(callback, phase = 'before') {
      frameCallbacks[phase].add(callback);
      return () => frameCallbacks[phase].delete(callback);
    },
    invalidate(targetSurfaces) {
      if (!targetSurfaces) { for (const surface of surfaces) surface.dirty = true; return; }
      for (const handle of targetSurfaces) {
        const id = (handle as unknown as { __id?: number }).__id;
        const surface = id !== undefined ? surfaceById.get(id) : undefined;
        if (surface) surface.dirty = true;
      }
    },
    stats(): EngineStats { return { ...statsAccum }; },
  };
  return engine;
}

function layerInternalOf(handle: Layer): LayerInternal | null {
  return (handle as unknown as { __internal?: LayerInternal }).__internal ?? null;
}

export function getGlassEngine(): GlassEngine | null {
  if (typeof document === 'undefined') return null;
  return sharedValue(`engine.v${ENGINE_API}`, () => createEngine());
}
