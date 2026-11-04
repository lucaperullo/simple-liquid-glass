/** @jest-environment jsdom */
/**
 * `simple-liquid-glass/engine` conformance tests against a mocked WebGL context (fast, no real
 * GPU). `getGlassEngine()` is a per-document singleton (`sharedValue`), so every test in this
 * file necessarily runs against the SAME engine instance and the SAME mocked `gl` — the tests
 * below are intentionally ordered and build on each other rather than being independent. A
 * second, real-browser pass (`experiments/engine`, run by `npm run test:webgl`) exercises the
 * same scenarios against a real GPU in Chromium and WebKit.
 */
import { getGlassEngine } from '../engine';
import type { GlassEngine, Material } from '../engine';
import { defineTintMaterial, type TintParams } from '../../tests/engine/tint-material';

// jsdom has no DOMRect global; a plain object with the same shape is what every caller reads.
function rect(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this; } }) as DOMRect;
}

// GL type constants used only to simulate getActiveUniform's reflection below (real WebGL1 values
// don't matter here, only that they're distinct and match what engine.ts's isIntegerUniformType
// compares against on this same mock gl object).
const GL_FLOAT = 7, GL_FLOAT_VEC2 = 33, GL_FLOAT_VEC3 = 34, GL_FLOAT_VEC4 = 35,
  GL_INT = 36, GL_BOOL = 40, GL_SAMPLER_2D = 44, GL_SAMPLER_CUBE = 45, GL_ACTIVE_UNIFORMS = 46;
const GLSL_TYPES: Record<string, number> = {
  float: GL_FLOAT, vec2: GL_FLOAT_VEC2, vec3: GL_FLOAT_VEC3, vec4: GL_FLOAT_VEC4,
  int: GL_INT, bool: GL_BOOL, sampler2D: GL_SAMPLER_2D, samplerCube: GL_SAMPLER_CUBE,
};
/** A tiny stand-in for the real GLSL compiler's reflection: scans a fragment shader's source text for
 * `uniform <type> <name>[;[N]]` declarations, the same shape getActiveUniform reports them in a real
 * browser (array uniforms as `name[0]` with `size` = the array length). Good enough to let the mock
 * exercise engine.ts's actual type-detection code, not a hand-picked substitute for it. */
function parseUniforms(source: string): Array<{ name: string; type: number; size: number }> {
  const out: Array<{ name: string; type: number; size: number }> = [];
  const re = /uniform\s+(float|vec2|vec3|vec4|int|bool|sampler2D|samplerCube)\s+(\w+)\s*(?:\[(\d+)\])?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const [, glslType, name, arraySize] = m;
    const size = arraySize ? Number(arraySize) : 1;
    out.push({ name: size > 1 ? `${name}[0]` : name, type: GLSL_TYPES[glslType], size });
  }
  return out;
}

function createMockGl() {
  let serial = 0;
  const shaders = new Map<object, { type: number; source: string }>();
  const programs = new Map<object, { ok: boolean; fragmentSource: string }>();
  const locations = new Map<string, object>();
  const gl: Record<string, unknown> = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLE_STRIP: 8,
    COLOR_BUFFER_BIT: 9, SCISSOR_TEST: 10, TEXTURE_2D: 11, TEXTURE0: 100,
    MAX_FRAGMENT_UNIFORM_VECTORS: 20, MAX_TEXTURE_SIZE: 21,
    UNPACK_FLIP_Y_WEBGL: 22, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 23, RGBA: 24, UNSIGNED_BYTE: 25,
    TEXTURE_MIN_FILTER: 26, TEXTURE_MAG_FILTER: 27, TEXTURE_WRAP_S: 28, TEXTURE_WRAP_T: 29,
    LINEAR: 30, CLAMP_TO_EDGE: 31, NEAREST: 32,
    FLOAT_VEC2: GL_FLOAT_VEC2, FLOAT_VEC3: GL_FLOAT_VEC3, FLOAT_VEC4: GL_FLOAT_VEC4,
    INT: GL_INT, INT_VEC2: 37, INT_VEC3: 38, INT_VEC4: 39,
    BOOL: GL_BOOL, BOOL_VEC2: 41, BOOL_VEC3: 42, BOOL_VEC4: 43,
    SAMPLER_2D: GL_SAMPLER_2D, SAMPLER_CUBE: GL_SAMPLER_CUBE, ACTIVE_UNIFORMS: GL_ACTIVE_UNIFORMS,
    getParameter: (p: number) => (p === 20 ? 256 : p === 21 ? 4096 : 0),
    createShader: (type: number) => { const s = { serial: ++serial }; shaders.set(s, { type, source: '' }); return s; },
    shaderSource: (shader: object, source: string) => { const s = shaders.get(shader); if (s) s.source = source; },
    compileShader: jest.fn(),
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: jest.fn(),
    createProgram: () => { const p = { serial: ++serial }; programs.set(p, { ok: true, fragmentSource: '' }); return p; },
    attachShader: (program: object, shader: object) => {
      const p = programs.get(program), s = shaders.get(shader);
      if (p && s && s.type === 2 /* FRAGMENT_SHADER */) p.fragmentSource = s.source;
    },
    bindAttribLocation: jest.fn(), linkProgram: jest.fn(),
    getProgramParameter: (program: object, pname: number) => {
      if (pname === GL_ACTIVE_UNIFORMS) return parseUniforms(programs.get(program)?.fragmentSource ?? '').length;
      return true;
    },
    getActiveUniform: (program: object, index: number) => parseUniforms(programs.get(program)?.fragmentSource ?? '')[index] ?? null,
    getProgramInfoLog: () => '',
    deleteProgram: jest.fn(),
    useProgram: jest.fn(),
    getUniformLocation: (program: object, name: string) => {
      const key = `${(program as { serial: number }).serial}:${name}`;
      if (!locations.has(key)) locations.set(key, { name, serial: ++serial });
      return locations.get(key)!;
    },
    uniform1f: jest.fn(), uniform2f: jest.fn(), uniform3f: jest.fn(), uniform4f: jest.fn(),
    uniform1i: jest.fn(), uniform2i: jest.fn(), uniform3i: jest.fn(), uniform4i: jest.fn(),
    uniform1fv: jest.fn(), uniform2fv: jest.fn(), uniform3fv: jest.fn(), uniform4fv: jest.fn(),
    uniform1iv: jest.fn(), uniform2iv: jest.fn(), uniform3iv: jest.fn(), uniform4iv: jest.fn(),
    createBuffer: () => ({ serial: ++serial }),
    bindBuffer: jest.fn(), bufferData: jest.fn(), enableVertexAttribArray: jest.fn(), vertexAttribPointer: jest.fn(),
    viewport: jest.fn(), clearColor: jest.fn(), clear: jest.fn(), enable: jest.fn(), disable: jest.fn(),
    scissor: jest.fn(), activeTexture: jest.fn(), bindTexture: jest.fn(), drawArrays: jest.fn(),
    createTexture: () => ({ serial: ++serial }), deleteTexture: jest.fn(),
    pixelStorei: jest.fn(), texImage2D: jest.fn(), texParameteri: jest.fn(), copyTexImage2D: jest.fn(),
    isContextLost: () => false,
  };
  return gl as unknown as WebGLRenderingContext;
}

let mockGl: WebGLRenderingContext;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  mockGl = createMockGl();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function (type: string) {
    if (type !== 'webgl') return null;
    Object.defineProperty(mockGl, 'canvas', { value: this, configurable: true });
    return mockGl;
  };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = originalGetContext; });

let engine: GlassEngine;
let tint: { material: Material<TintParams> };

test('getGlassEngine() returns the page singleton with ENGINE_API 1 and sane capabilities', () => {
  const found = getGlassEngine();
  expect(found).not.toBeNull();
  engine = found!;
  expect(engine.api).toBe(1);
  const caps = engine.capabilities();
  expect(caps.webgl).toBe(1);
  expect(caps.maxFragmentUniformVectors).toBe(256);
  expect(caps.maxTextureSize).toBe(4096);
  expect(typeof caps.bitmapTransfer).toBe('boolean');
  expect(['full', 'lite']).toContain(caps.tier);
});

test('defineMaterial is idempotent by id', () => {
  tint = defineTintMaterial(engine);
  const again = defineTintMaterial(engine);
  expect(again.material.id).toBe(tint.material.id);
});

test('createSurface draws into its own presentation canvas sized to the host plus bleed', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 10, 20, 100, 50);
  const surface = engine.createSurface<TintParams>({
    host, material: tint.material, params: { color: [1, 0, 0, 1], mix: 0 }, bleed: 8,
  });
  await new Promise(requestAnimationFrame);
  expect(surface.status.state).toBe('active');
  const canvas = document.querySelector('canvas[data-liquid-glass-engine]') as HTMLCanvasElement;
  expect(canvas).not.toBeNull();
  // host 100x50 + bleed 8 on every side = 116x66 CSS px.
  expect(canvas.style.width).toBe('116px');
  expect(canvas.style.height).toBe('66px');
  expect(canvas.style.left).toBe('2px'); // 10 - 8
  expect(canvas.style.top).toBe('12px'); // 20 - 8
  const diagnostics = surface.diagnostics();
  expect(diagnostics.composition).toBe('own');
  expect(diagnostics.drawnFrames).toBeGreaterThan(0);
  surface.destroy();
  host.remove();
});

test('an inactive, unchanged surface is not redrawn; active() forces every frame', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 40, 40);
  let active = false;
  const surface = engine.createSurface<TintParams>({ host, material: tint.material, params: { color: [0, 1, 0, 1], mix: 0 }, active: () => active });
  await new Promise(requestAnimationFrame);
  const firstCount = surface.diagnostics().drawnFrames;
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().drawnFrames).toBe(firstCount); // idle: no geometry/param change, active() false
  active = true;
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().drawnFrames).toBeGreaterThan(firstCount); // active(): drawn every frame
  surface.destroy();
  host.remove();
});

test('update() marks a surface dirty and redraws it once', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 20, 20);
  const surface = engine.createSurface<TintParams>({ host, material: tint.material, params: { color: [0, 0, 1, 1], mix: 0 } });
  await new Promise(requestAnimationFrame);
  const before = surface.diagnostics().drawnFrames;
  surface.update({ mix: 1 });
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().drawnFrames).toBe(before + 1);
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().drawnFrames).toBe(before + 1); // settled again
  surface.destroy();
  host.remove();
});

test("draw() returning 'pending' presents the frame and asks again next frame", async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 20, 20);
  const surface = engine.createSurface<TintParams>({ host, material: tint.material, params: { color: [1, 1, 0, 1], mix: 0, settling: true } });
  await new Promise(requestAnimationFrame);
  expect(surface.status).toEqual({ state: 'pending' });
  const drawnWhilePending = surface.diagnostics().drawnFrames;
  expect(drawnWhilePending).toBeGreaterThan(0); // 'pending' still presents the frame it drew
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().drawnFrames).toBeGreaterThan(drawnWhilePending); // redrawn without any other change
  surface.update({ settling: false });
  await new Promise(requestAnimationFrame);
  expect(surface.status).toEqual({ state: 'active' });
  surface.destroy();
  host.remove();
});

test('three consecutive throws from a material fall back and stop drawing', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 20, 20);
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const surface = engine.createSurface<TintParams>({ host, material: tint.material, params: { color: [1, 1, 1, 1], mix: 0, explode: true } });
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  expect(surface.status).toEqual({ state: 'fallback', reason: 'material-error' });
  expect(errorSpy).toHaveBeenCalledTimes(2); // the first two throws log and retry; the third enters fallback.
  const before = surface.diagnostics().drawnFrames;
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().drawnFrames).toBe(before); // stays in fallback, no further draw attempts
  errorSpy.mockRestore();
  surface.destroy();
  host.remove();
});

test('bleed and resize-in-frame: a function bleed is re-read on a resized result', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 20, 20);
  let bleedAmount = 4, resizedOnce = false;
  const resizing = engine.defineMaterial<Record<string, never>>({
    id: 'tests/engine/resize@1',
    fragment: () => 'vec4 slg_shade(vec2 p) { return vec4(0.0); }',
    draw(ctx) {
      ctx.draw();
      if (!resizedOnce) { resizedOnce = true; bleedAmount = 30; return 'resized'; }
      return 'drawn';
    },
  });
  const surface = engine.createSurface({ host, material: resizing, params: {}, bleed: () => bleedAmount });
  await new Promise(requestAnimationFrame);
  const canvas = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-liquid-glass-engine]')].find(c => c.style.left === '-30px');
  expect(canvas).toBeDefined();
  expect(canvas!.style.width).toBe('80px'); // 20 + 2*30
  surface.destroy();
  host.remove();
});

test('draw(rects) moves gl.viewport (not gl.scissor) to each device-pixel rect derived from the view scale', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 10, 10);
  const viewportCalls: number[][] = [];
  (mockGl as unknown as { viewport: jest.Mock }).viewport.mockImplementation((...args: number[]) => viewportCalls.push(args));
  const scissored = engine.defineMaterial<Record<string, never>>({
    id: 'tests/engine/scissor@1',
    fragment: () => 'vec4 slg_shade(vec2 p) { return vec4(0.0); }',
    draw(ctx) { ctx.draw([[0, 0, 5, 5]]); return 'drawn'; },
  });
  viewportCalls.length = 0;
  const surface = engine.createSurface({ host, material: scissored, params: {}, maxScale: 1 });
  await new Promise(requestAnimationFrame);
  // A fixed viewport (the surface's own view) plus a scissor cannot let a quad reach past it — only
  // shrink it — so a rect is drawn through its own gl.viewport call instead (restored to the surface's
  // own view afterwards): [initial surface viewport, this rect's viewport, the restored viewport].
  const rectCall = viewportCalls.find(([, , w, h]) => w === 5 && h === 5);
  expect(rectCall).toBeDefined();
  const [sx, sy, sw, sh] = rectCall!;
  expect(sw).toBe(5); expect(sh).toBe(5); expect(sx).toBe(0);
  expect(sy).toBe(5); // bottom-left origin: a 10px-tall canvas, a 5px rect pinned to the top -> y=5
  expect(viewportCalls[viewportCalls.length - 1]).toEqual([0, 0, 10, 10]); // restored to the surface's own view
  surface.destroy();
  host.remove();
});

test('draw(rects) past the surface\'s own view still draws: gl.viewport moves to reach it, not just gl.scissor within a fixed one', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 10, 10);
  const viewportCalls: number[][] = [];
  (mockGl as unknown as { viewport: jest.Mock }).viewport.mockImplementation((...args: number[]) => viewportCalls.push(args));
  // Mimics clusters(slots, merge + REFRACT_REACH): a rect padded past the surface's own [0,10]x[0,10]
  // box on every side, the exact shape that used to lose its near-edge bleed (the engine bug this
  // conformance test is for — see engine.ts's draw(rects) comment).
  const padded = engine.defineMaterial<Record<string, never>>({
    id: 'tests/engine/padded-bleed@1',
    fragment: () => 'vec4 slg_shade(vec2 p) { return vec4(0.0); }',
    draw(ctx) { ctx.draw([[-4, -4, 18, 18]]); return 'drawn'; },
  });
  viewportCalls.length = 0;
  const surface = engine.createSurface({ host, material: padded, params: {}, maxScale: 1 });
  await new Promise(requestAnimationFrame);
  // (maxScale: 1, matching the host's own 10x10 box, so the device-px rect below is exactly the
  // CSS-px one.) Negative x and a width/height past the 10x10 view: the old, clamped implementation would have
  // shifted this to start at (0, 0) instead of (-4, -4), silently losing 4px of bleed on the near
  // edge. The fix lets gl.viewport's x/y go negative (WebGL itself clips it to the real framebuffer).
  const rectCall = viewportCalls.find(([, , w, h]) => w === 18 && h === 18);
  expect(rectCall).toBeDefined();
  const [sx, sy] = rectCall!;
  expect(sx).toBe(-4);
  expect(sy).toBe(-4); // y is pre-flip symmetric here: top -4 and height 18 over a 10-tall view -> -4 too
  surface.destroy();
  host.remove();
});

test('uniform() detects int/sampler GLSL types; uniformArray() sends a whole array with one call (G1 fix)', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 10, 10);
  const material = engine.defineMaterial<Record<string, never>>({
    id: 'tests/engine/uniform-types@1',
    // A plain uniform1f/uniformNf on uMode (an int) would raise GL_INVALID_OPERATION in a real
    // browser; uRect is an array, which uniform() alone cannot address (one call per slot).
    fragment: () => `
      uniform int uMode;
      uniform vec4 uRect[3];
      vec4 slg_shade(vec2 p) { return uRect[0] * float(uMode); }
    `,
    draw(ctx) {
      ctx.uniform('uMode', 2);
      ctx.uniformArray('uRect', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 4);
      ctx.draw();
      return 'drawn';
    },
  });
  const surface = engine.createSurface({ host, material, params: {} });
  await new Promise(requestAnimationFrame);

  const byName = (mock: jest.Mock, name: string) => mock.mock.calls.find(([loc]) => (loc as { name?: string } | null)?.name === name);
  const uniform1i = (mockGl as unknown as { uniform1i: jest.Mock }).uniform1i;
  const uniform1f = (mockGl as unknown as { uniform1f: jest.Mock }).uniform1f;
  const uniform4fv = (mockGl as unknown as { uniform4fv: jest.Mock }).uniform4fv;

  const modeCall = byName(uniform1i, 'uMode');
  expect(modeCall).toBeDefined(); // an int uniform goes through uniform1i, not uniformNf
  expect(modeCall![1]).toBe(2);
  expect(byName(uniform1f, 'uMode')).toBeUndefined(); // never the float entry point: that's the bug this fixes

  const rectCall = byName(uniform4fv, 'uRect');
  expect(rectCall).toBeDefined();
  expect(Array.from(rectCall![1] as Float32Array)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  // Location caching: a second frame's uniformArray() call for the same uniform reuses the same
  // WebGLUniformLocation object rather than calling getUniformLocation again.
  uniform4fv.mock.calls.length = 0;
  surface.update({});
  await new Promise(requestAnimationFrame);
  const secondCall = byName(uniform4fv, 'uRect');
  expect(secondCall).toBeDefined();
  expect(secondCall![0]).toBe(rectCall![0]); // same location object: proves it came from the cache

  surface.destroy();
  host.remove();
});

test('defineResource (G10): one instance per context, shared across surfaces', async () => {
  const createSpy = jest.fn((gl: WebGLRenderingContext) => gl.createTexture());
  const resource = engine.defineResource<WebGLTexture | null>({ id: 'tests/engine/shared-resource@1', create: createSpy });
  const seen: unknown[] = [];
  const material = engine.defineMaterial<Record<string, never>>({
    id: 'tests/engine/uses-resource@1',
    fragment: () => 'vec4 slg_shade(vec2 p) { return vec4(0.0); }',
    draw(ctx) { seen.push(ctx.resource(resource)); ctx.draw(); return 'drawn'; },
  });
  const a = document.createElement('div'); document.body.append(a); rect(a, 0, 0, 5, 5);
  const b = document.createElement('div'); document.body.append(b); rect(b, 50, 50, 5, 5);
  const sa = engine.createSurface({ host: a, material, params: {} });
  const sb = engine.createSurface({ host: b, material, params: {} });
  await new Promise(requestAnimationFrame);
  expect(createSpy).toHaveBeenCalledTimes(1);
  expect(seen.length).toBe(2);
  expect(seen[0]).toBe(seen[1]);
  sa.destroy(); sb.destroy(); a.remove(); b.remove();
});

test('context loss pauses surfaces; restore rebuilds programs and resources', async () => {
  const resetSpy = jest.fn();
  const createSpy = jest.fn((gl: WebGLRenderingContext) => gl.createTexture());
  const resource = engine.defineResource<WebGLTexture | null>({ id: 'tests/engine/loss-resource@1', create: createSpy });
  const material = engine.defineMaterial<Record<string, never>>({
    id: 'tests/engine/loss@1',
    fragment: () => 'vec4 slg_shade(vec2 p) { return vec4(0.0); }',
    draw(ctx) { ctx.resource(resource); ctx.draw(); return 'drawn'; },
    reset: resetSpy,
  });
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 10, 10);
  const surface = engine.createSurface({ host, material, params: {} });
  await new Promise(requestAnimationFrame);
  expect(surface.status).toEqual({ state: 'active' });
  expect(createSpy).toHaveBeenCalledTimes(1);

  const canvasEl = (mockGl as unknown as { canvas: HTMLCanvasElement }).canvas;
  const lostEvent = new Event('webglcontextlost', { cancelable: true });
  canvasEl.dispatchEvent(lostEvent);
  expect(lostEvent.defaultPrevented).toBe(true);
  expect(surface.status).toEqual({ state: 'pending' });

  canvasEl.dispatchEvent(new Event('webglcontextrestored'));
  expect(resetSpy).toHaveBeenCalledTimes(1);
  await new Promise(requestAnimationFrame);
  expect(surface.status).toEqual({ state: 'active' });
  expect(createSpy).toHaveBeenCalledTimes(2); // recreated lazily after the restore
  surface.destroy();
  host.remove();
});

test('stats() reports surfaces and drawn counts for the last completed frame', async () => {
  const before = engine.stats();
  expect(before.surfaces).toBeGreaterThanOrEqual(0);
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 10, 10);
  const surface = engine.createSurface({ host, material: tint.material, params: { color: [1, 1, 1, 1], mix: 0 } });
  await new Promise(requestAnimationFrame);
  const after = engine.stats();
  expect(after.drawn).toBeGreaterThanOrEqual(1);
  expect(after.layers).toBe(0); // no Layer created in this test file (see engineLayers.test.ts for G7's own count).
  surface.destroy();
  host.remove();
});
