/**
 * The page's `GlassEngine` singleton (`getGlassEngine()`), shared by every bundle of
 * simple-liquid-glass on the page via `sharedValue('engine.v1')`.
 *
 * Reuses, rather than reimplements: `acquireContextCanvas`/`frameRect`/`subscribeFrame`
 * (`contextPool.ts`, the one shared offscreen WebGL context and the one shared rAF ticker) and
 * `acquireTexture`/`acquireSource` (via `backdrop.ts`) for backdrop leases. It does not reuse
 * `sharedScene.ts`: that module's eligibility rules and blit pipeline are specific to
 * `<LiquidGlass>` panels and to document-order layering (G7/G8), which is out of scope here —
 * see the "composition" note in `types.ts`.
 */
import { sharedValue } from '../shared';
import { acquireContextCanvas, frameRect, subscribeFrame } from '../webgl/contextPool';
import { invalidateTextures } from '../webgl/textureCache';
import { installLiquidGLOptics } from '../webgl/liquidGLOptics';
import { stats as glStats, UPLOADS, UPLOAD_BYTES } from '../webgl/stats';
import { PRELUDE, VERTEX_SHADER, linkProgram, drawQuad, invalidateQuadBuffer } from './glsl';
import { bindBackdrop, type BackdropBinding } from './backdrop';
import {
  ENGINE_API,
  type DrawContext,
  type DrawResult,
  type EngineCapabilities,
  type EngineStats,
  type FrameInfo,
  type GlassEngine,
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
const PACKAGE_VERSION = '5.7.0-engine-experimental';

interface BuiltinLocations {
  view: WebGLUniformLocation | null;
  scale: WebGLUniformLocation | null;
  origin: WebGLUniformLocation | null;
  viewport: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  backdropTex: WebGLUniformLocation | null;
  backdropRegion: WebGLUniformLocation | null;
  hasBackdrop: WebGLUniformLocation | null;
}

interface ProgramEntry {
  program: WebGLProgram;
  builtins: BuiltinLocations;
  locations: Map<string, WebGLUniformLocation | null>;
  lastValues: Map<string, readonly number[]>;
  samplerUnits: Map<string, number>;
  nextUnit: number;
  fresh: boolean;
}

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
}

let nextSurfaceId = 1;

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
    entry = {
      program,
      builtins: {
        view: location('slg_view'), scale: location('slg_scale'), origin: location('slg_origin'),
        viewport: location('slg_viewport'), time: location('slg_time'),
        backdropTex: location('slg_backdropTex'), backdropRegion: location('slg_backdropRegion'),
        hasBackdrop: location('slg_hasBackdropFlag'),
      },
      locations: new Map(), lastValues: new Map(), samplerUnits: new Map(), nextUnit: 1, fresh: true,
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
    switch (values.length) {
      case 1: gl!.uniform1f(location, values[0]); break;
      case 2: gl!.uniform2f(location, values[0], values[1]); break;
      case 3: gl!.uniform3f(location, values[0], values[1], values[2]); break;
      case 4: gl!.uniform4f(location, values[0], values[1], values[2], values[3]); break;
      default: throw new Error('simple-liquid-glass/engine: uniform() takes 1-4 numbers');
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

  function rebindBackdrop(surface: InternalSurface) {
    surface.backdropBinding?.destroy();
    const input = surface.options.backdrop ?? null;
    surface.backdropBinding = bindBackdrop(surface.options.host, input, () => { surface.dirty = true; }, surface.backdropVersion);
  }

  function makeContext(surface: InternalSurface, entry: ProgramEntry, view: { width: number; height: number; scale: number },
    viewport: { left: number; top: number }, time: number, dt: number, fresh: boolean, settle: boolean): DrawContext {
    const canvasW = Math.max(1, Math.round(view.width * view.scale)), canvasH = Math.max(1, Math.round(view.height * view.scale));
    let backdropInfo: DrawContext['backdrop'] = null;
    let bound = false;
    const bindBackdropUniforms = () => {
      if (bound) return;
      bound = true;
      const sample = surface.backdropBinding?.resolve(gl!);
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
    };
    return {
      gl: gl!,
      view: { width: view.width, height: view.height, scale: view.scale },
      viewport,
      frame: frameNumber, dt, time,
      fresh, settle,
      get backdrop() { bindBackdropUniforms(); return backdropInfo; },
      tier: caps.tier,
      uniform(name, ...values) { setUniform(entry, name, values); },
      bind(name, texture) {
        const unit = samplerUnit(entry, name);
        gl!.activeTexture(gl!.TEXTURE0 + unit);
        gl!.bindTexture(gl!.TEXTURE_2D, texture);
      },
      resource(resource) { return getResourceInstance(resource); },
      draw(rects) {
        bindBackdropUniforms();
        if (!rects || !rects.length) { gl!.disable(gl!.SCISSOR_TEST); drawQuad(gl!); return; }
        gl!.enable(gl!.SCISSOR_TEST);
        for (const [x, y, w, h] of rects) {
          const sx = Math.max(0, Math.round(x * view.scale)), sw = Math.max(0, Math.round(w * view.scale));
          const topPx = Math.round(y * view.scale), sh = Math.max(0, Math.round(h * view.scale));
          const sy = Math.max(0, canvasH - topPx - sh);
          gl!.scissor(sx, sy, sw, sh);
          drawQuad(gl!);
        }
        gl!.disable(gl!.SCISSOR_TEST);
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
      const ctx = makeContext(surface, entry, view, viewport, time, dt, fresh && loops === 0, settle);
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
    statsAccum = { contexts: 1, layers: 0, surfaces: surfaces.size, visible: 0, drawn: 0, missed: 0, uploads: 0, uploadBytes: 0, frameMs: 0 };
    const info: FrameInfo = { frame: frameNumber, dt, now, scrolling: false };
    for (const callback of frameCallbacks.before) callback(info);
    for (const surface of surfaces) {
      if (surface.destroyed || surface.status.state === 'fallback') continue;
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
    statsAccum.uploads = glStats.frame[UPLOADS] - u0;
    statsAccum.uploadBytes = glStats.frame[UPLOAD_BYTES] - b0;
    for (const callback of frameCallbacks.after) callback(info);
  }

  const canvasElement = gl.canvas as HTMLCanvasElement;
  const onLost = (event: Event) => { event.preventDefault(); lost = true; invalidateTextures(gl!); invalidateQuadBuffer(gl!); programs.clear(); for (const surface of surfaces) setStatus(surface, { state: 'pending' }); };
  const onRestored = () => {
    lost = false;
    invalidateTextures(gl!); invalidateQuadBuffer(gl!);
    for (const materialId of materialsUsed) materialDefs.get(materialId)?.reset?.(gl!);
    programs.clear(); materialsUsed.clear(); resourceInstances.clear();
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
      const surface: InternalSurface = {
        id: nextSurfaceId++, options: options as SurfaceOptions<unknown>, params: options.params,
        canvas: presentationCanvas(), backdropBinding: null, backdropVersion: options.backdropVersion,
        dirty: true, pendingRedraw: false, consecutiveFailures: 0, status: { state: 'pending' },
        destroyed: false, lastGeometryKey: '', drawnFrames: 0, lastDrawMs: 0, uploadsLastFrame: 0, lastScale: 1,
      };
      rebindBackdrop(surface);
      surfaces.add(surface);
      const handle: Surface<P> = {
        update(partial) { Object.assign(surface.params as object, partial); surface.dirty = true; },
        invalidate() { surface.dirty = true; },
        setBackdrop(backdrop, version) { surface.options.backdrop = backdrop; surface.backdropVersion = version; rebindBackdrop(surface); surface.dirty = true; },
        get status() { return surface.status; },
        diagnostics(): SurfaceDiagnostics {
          return { composition: 'own', scale: surface.lastScale, uploadsLastFrame: surface.uploadsLastFrame, lastDrawMs: surface.lastDrawMs, drawnFrames: surface.drawnFrames };
        },
        destroy() {
          if (surface.destroyed) return;
          surface.destroyed = true; surfaces.delete(surface); surfaceById.delete(surface.id);
          surface.backdropBinding?.destroy();
          surface.canvas.remove(); surface.canvas.width = surface.canvas.height = 0;
        },
      };
      Object.defineProperty(handle, '__id', { value: surface.id, enumerable: false });
      surfaceById.set(surface.id, surface);
      return handle;
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

export function getGlassEngine(): GlassEngine | null {
  if (typeof document === 'undefined') return null;
  return sharedValue(`engine.v${ENGINE_API}`, () => createEngine());
}
