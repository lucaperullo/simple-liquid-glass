/** @jest-environment jsdom */
/**
 * `simple-liquid-glass/engine` conformance tests for G7 (document-order layers), G8 (glass on
 * glass: `under` and `snapshots`) and G12 (backdrop-source providers), against a mocked WebGL
 * context. Same caveat as `engineMaterials.test.ts`: `getGlassEngine()` is a per-document
 * singleton, so the tests in this file are ordered and share one engine instance — but this file
 * gets its own fresh jsdom environment (Jest gives every test file its own), so it does not
 * interact with `engineMaterials.test.ts`'s engine instance. `experiments/engine` (real Chromium
 * and WebKit, run by `npm run test:webgl`) proves the actual pixels and stacking.
 */
import { getGlassEngine } from '../engine';
import type { BackdropSource, GlassEngine, Layer, Material } from '../engine';

function rect(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this; } }) as DOMRect;
}

interface MockLocation { name: string; serial: number }

function createMockGl() {
  let serial = 0;
  const locations = new Map<string, MockLocation>();
  const gl: Record<string, unknown> = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLE_STRIP: 8,
    COLOR_BUFFER_BIT: 9, SCISSOR_TEST: 10, TEXTURE_2D: 11, TEXTURE0: 100,
    MAX_FRAGMENT_UNIFORM_VECTORS: 20, MAX_TEXTURE_SIZE: 21,
    UNPACK_FLIP_Y_WEBGL: 22, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 23, RGBA: 24, UNSIGNED_BYTE: 25,
    TEXTURE_MIN_FILTER: 26, TEXTURE_MAG_FILTER: 27, TEXTURE_WRAP_S: 28, TEXTURE_WRAP_T: 29,
    LINEAR: 30, CLAMP_TO_EDGE: 31, NEAREST: 32, ACTIVE_UNIFORMS: 42,
    getParameter: (p: number) => (p === 20 ? 256 : p === 21 ? 4096 : 0),
    createShader: () => ({ serial: ++serial }),
    shaderSource: jest.fn(), compileShader: jest.fn(),
    getShaderParameter: () => true, getShaderInfoLog: () => '', deleteShader: jest.fn(),
    createProgram: () => ({ serial: ++serial }),
    attachShader: jest.fn(), bindAttribLocation: jest.fn(), linkProgram: jest.fn(),
    // None of this file's materials use int/bool/sampler/array uniforms, so reporting zero active
    // uniforms keeps every one of them on the pre-existing float uniformNf path (see engine.ts's
    // isIntegerUniformType): getProgramParameter(p, LINK_STATUS) still needs to read as truthy.
    getProgramParameter: (_p: unknown, pname: number) => (pname === 42 ? 0 : true),
    getActiveUniform: () => null,
    getProgramInfoLog: () => '', deleteProgram: jest.fn(),
    useProgram: jest.fn(),
    getUniformLocation: (program: { serial: number }, name: string) => {
      const key = `${program.serial}:${name}`;
      if (!locations.has(key)) locations.set(key, { name, serial: ++serial });
      return locations.get(key)!;
    },
    uniform1f: jest.fn(), uniform2f: jest.fn(), uniform3f: jest.fn(), uniform4f: jest.fn(), uniform1i: jest.fn(),
    createBuffer: () => ({ serial: ++serial }),
    bindBuffer: jest.fn(), bufferData: jest.fn(), enableVertexAttribArray: jest.fn(), vertexAttribPointer: jest.fn(),
    viewport: jest.fn(), clearColor: jest.fn(), clear: jest.fn(), enable: jest.fn(), disable: jest.fn(),
    scissor: jest.fn(), activeTexture: jest.fn(), bindTexture: jest.fn(), drawArrays: jest.fn(),
    createTexture: jest.fn(() => ({ serial: ++serial })), deleteTexture: jest.fn(),
    pixelStorei: jest.fn(), texImage2D: jest.fn(), texParameteri: jest.fn(), copyTexImage2D: jest.fn(),
    isContextLost: () => false,
  };
  return gl as unknown as WebGLRenderingContext;
}

// jsdom has no real 2D canvas rendering (getContext('2d') returns null); a minimal no-op fake lets
// bindSource/drawLayer's 2D-canvas code paths run (and call BackdropSource.paint) without crashing.
function createMock2d() {
  return {
    fillStyle: '', save: jest.fn(), restore: jest.fn(), scale: jest.fn(), translate: jest.fn(),
    fillRect: jest.fn(), clearRect: jest.fn(), drawImage: jest.fn(),
  } as unknown as CanvasRenderingContext2D;
}

let mockGl: WebGLRenderingContext;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  mockGl = createMockGl();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function (type: string) {
    if (type === '2d') return createMock2d();
    if (type !== 'webgl') return null;
    Object.defineProperty(mockGl, 'canvas', { value: this, configurable: true });
    return mockGl;
  };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = originalGetContext; });

const hasUniformCall = (name: string, value: number) =>
  (mockGl as unknown as { uniform1f: jest.Mock }).uniform1f.mock.calls.some(([loc, v]: [MockLocation, number]) => loc.name === name && v === value);

let engine: GlassEngine;
let flatMaterial: Material<Record<string, never>>;
const drawOrder: string[] = [];

test('getGlassEngine() is available', () => {
  const found = getGlassEngine();
  expect(found).not.toBeNull();
  engine = found!;
  flatMaterial = engine.defineMaterial<Record<string, never>>({
    id: 'tests/engine/layers-flat@1',
    fragment: () => 'vec4 slg_shade(vec2 p) { return vec4(0.0); }',
    draw(ctx) { ctx.draw(); return 'drawn'; },
  });
});

test('G7: createLayer inserts one canvas as root\'s first child, z-index -1, and establishes a stacking context', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const before = document.createElement('span'); // will NOT be first child once the layer inserts its canvas
  root.append(before);
  const layer = engine.createLayer(root);
  expect(root.firstChild).toBe(layer.canvas);
  expect(layer.canvas.style.zIndex).toBe('-1');
  expect(root.style.position).toBe('relative');
  expect(root.style.isolation).toBe('isolate');
  layer.destroy();
  root.remove();
});

test('G7: two members in document order draw into exactly one shared canvas, in that order', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const hostA = document.createElement('div'), hostB = document.createElement('div');
  root.append(hostA, hostB); // A before B in the document
  rect(hostA, 0, 0, 50, 50);
  rect(hostB, 100, 100, 50, 50);
  const layer = engine.createLayer(root);
  drawOrder.length = 0;
  // Each member's own draw() records its identity via a closure, since params carry no id.
  const makeTracked = (label: string) => engine.defineMaterial<Record<string, never>>({
    id: `tests/engine/layers-ordered-${label}@1`,
    fragment: () => 'vec4 slg_shade(vec2 p) { return vec4(0.0); }',
    draw(ctx) { drawOrder.push(label); ctx.draw(); return 'drawn'; },
  });
  const a = engine.createSurface({ host: hostA, material: makeTracked('A'), params: {}, layer });
  const b = engine.createSurface({ host: hostB, material: makeTracked('B'), params: {}, layer });
  await new Promise(requestAnimationFrame);
  expect(drawOrder).toEqual(['A', 'B']);
  expect(a.diagnostics().composition).toBe('layer');
  expect(b.diagnostics().composition).toBe('layer');
  expect(document.querySelectorAll('canvas[data-liquid-glass-engine]').length).toBe(0); // no per-member canvas
  expect(document.querySelectorAll('canvas[data-liquid-glass-engine-layer]').length).toBeGreaterThanOrEqual(1);
  a.destroy(); b.destroy(); layer.destroy(); root.remove();
});

test('G7: an auto-detected layer (no explicit `layer` option) is found by walking ancestors', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const wrapper = document.createElement('div');
  root.append(wrapper);
  const host = document.createElement('div');
  wrapper.append(host); // host is a grandchild of root, not a direct child
  rect(host, 0, 0, 20, 20);
  const layer = engine.createLayer(root);
  const surface = engine.createSurface({ host, material: flatMaterial, params: {} }); // no `layer` option
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().composition).toBe('layer');
  surface.destroy(); layer.destroy(); root.remove();
});

test('G7: composition: "own" opts a host out of an enclosing layer', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const host = document.createElement('div');
  root.append(host);
  rect(host, 0, 0, 20, 20);
  const layer = engine.createLayer(root);
  const surface = engine.createSurface({ host, material: flatMaterial, params: {}, composition: 'own' });
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().composition).toBe('own');
  expect(document.querySelectorAll('canvas[data-liquid-glass-engine]').length).toBeGreaterThanOrEqual(1);
  surface.destroy(); layer.destroy(); root.remove();
});

test('G8: under copies the buffer once per member, only when LayerOptions.under is true', async () => {
  const copySpy = (mockGl as unknown as { copyTexImage2D: jest.Mock }).copyTexImage2D;
  const root = document.createElement('div');
  document.body.append(root);
  const hostA = document.createElement('div'), hostB = document.createElement('div');
  root.append(hostA, hostB);
  rect(hostA, 0, 0, 20, 20); rect(hostB, 50, 50, 20, 20);
  const layerOff = engine.createLayer(root); // under defaults to false
  const a = engine.createSurface({ host: hostA, material: flatMaterial, params: {}, layer: layerOff });
  const b = engine.createSurface({ host: hostB, material: flatMaterial, params: {}, layer: layerOff });
  await new Promise(requestAnimationFrame);
  expect(copySpy).not.toHaveBeenCalled();
  a.destroy(); b.destroy(); layerOff.destroy();

  const layerOn = engine.createLayer(root, { under: true });
  copySpy.mockClear();
  const c = engine.createSurface({ host: hostA, material: flatMaterial, params: {}, layer: layerOn });
  const d = engine.createSurface({ host: hostB, material: flatMaterial, params: {}, layer: layerOn });
  await new Promise(requestAnimationFrame);
  expect(copySpy).toHaveBeenCalledTimes(2); // once before each of the 2 members
  c.destroy(); d.destroy(); layerOn.destroy(); root.remove();
});

test('G8: a floating surface over a layer with snapshots: true reads slg_hasUnderFlag once the layer has a frame', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const member = document.createElement('div');
  root.append(member);
  rect(member, 0, 0, 20, 20);
  const layer = engine.createLayer(root, { snapshots: true });
  const memberSurface = engine.createSurface({ host: member, material: flatMaterial, params: {}, layer });

  const floatingHost = document.createElement('div');
  document.body.append(floatingHost);
  rect(floatingHost, 5, 5, 10, 10);
  const underMaterial = engine.defineMaterial<Record<string, never>>({
    id: 'tests/engine/layers-under-reader@1',
    fragment: () => 'vec4 slg_shade(vec2 p) { return slg_under(slg_toScreen(p)); }',
    draw(ctx) { ctx.draw(); return 'drawn'; },
  });
  const floating = engine.createSurface({ host: floatingHost, material: underMaterial, params: {}, composition: 'own', layer });
  expect(floating.diagnostics().composition).toBe('own');

  await new Promise(requestAnimationFrame); // frame 1: the layer has not drawn yet this session
  await new Promise(requestAnimationFrame); // frame 2: the layer's frame-1 snapshot now exists
  expect(hasUniformCall('slg_hasUnderFlag', 1)).toBe(true);

  floating.destroy(); memberSurface.destroy(); layer.destroy(); root.remove(); floatingHost.remove();
});

test('G7: destroying a layer returns its members to their own presentation canvas', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const host = document.createElement('div');
  root.append(host);
  rect(host, 0, 0, 20, 20);
  const layer = engine.createLayer(root);
  const surface = engine.createSurface({ host, material: flatMaterial, params: {}, layer });
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().composition).toBe('layer');
  layer.destroy();
  await new Promise(requestAnimationFrame);
  expect(surface.diagnostics().composition).toBe('own');
  surface.destroy(); root.remove();
});

test('G12: a registered BackdropSource paints a region and is sampled as slg_backdrop', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 10, 20, 100, 50);
  const paintCalls: Array<{ region: DOMRectReadOnly; scale: number; exclude: readonly Element[] }> = [];
  const source: BackdropSource = {
    id: 'tests/engine/custom-source@1',
    paint(ctx, region, scale, exclude) {
      paintCalls.push({ region, scale, exclude });
      ctx.fillStyle = '#123456';
      ctx.fillRect(0, 0, 10, 10);
      return { drew: true, live: false };
    },
    version: () => 1,
  };
  const unregister = engine.registerBackdropSource(source);
  const surface = engine.createSurface({ host, material: flatMaterial, params: {}, backdrop: { source: source.id } });
  await new Promise(requestAnimationFrame);
  expect(paintCalls.length).toBeGreaterThan(0);
  expect(paintCalls[0].exclude).toContain(host);
  expect(hasUniformCall('slg_hasBackdropFlag', 1)).toBe(true);
  surface.destroy();
  unregister();
  host.remove();
});

test('G12: a surface requesting an id that registers later is wired up once it appears', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  rect(host, 0, 0, 30, 30);
  const surface = engine.createSurface({ host, material: flatMaterial, params: {}, backdrop: { source: 'tests/engine/late-source@1' } });
  await new Promise(requestAnimationFrame);
  let painted = false;
  const unregister = engine.registerBackdropSource({
    id: 'tests/engine/late-source@1',
    paint(ctx) { painted = true; ctx.fillRect(0, 0, 1, 1); return { drew: true, live: false }; },
    version: () => 1,
  });
  await new Promise(requestAnimationFrame);
  expect(painted).toBe(true);
  surface.destroy();
  unregister();
  host.remove();
});

test('context loss clears a layer\'s under texture; it is recreated lazily after restore', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const host = document.createElement('div');
  root.append(host);
  rect(host, 0, 0, 20, 20);
  const layer = engine.createLayer(root, { under: true });
  const surface = engine.createSurface({ host, material: flatMaterial, params: {}, layer });
  await new Promise(requestAnimationFrame);
  const createSpy = (mockGl as unknown as { createTexture: jest.Mock }).createTexture;
  const callsBefore = createSpy.mock.calls.length;

  const canvasEl = (mockGl as unknown as { canvas: HTMLCanvasElement }).canvas;
  canvasEl.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  expect(surface.status).toEqual({ state: 'pending' });
  canvasEl.dispatchEvent(new Event('webglcontextrestored'));
  await new Promise(requestAnimationFrame);
  expect(surface.status).toEqual({ state: 'active' });
  expect(createSpy.mock.calls.length).toBeGreaterThan(callsBefore); // the under texture was recreated

  surface.destroy(); layer.destroy(); root.remove();
});
