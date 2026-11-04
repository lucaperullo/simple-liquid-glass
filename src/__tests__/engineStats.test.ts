/** @jest-environment jsdom */
import { DRAWN, UPLOADS, countUpload, endFrame, stats } from '../core/webgl/stats';
import { getGlassEngineStats } from '../webgl/stats';

const surface = (strategy: string, reason?: string) => {
  const element = document.createElement('div');
  element.dataset.glassStrategy = strategy; if (reason) element.dataset.glassReason = reason;
  document.body.append(element); return element;
};

afterEach(() => { document.body.innerHTML = ''; stats.surfaces.clear(); });

test('counts nothing until the first read', () => {
  expect(stats.on).toBe(false);
  countUpload(400);
  expect(stats.frame[UPLOADS]).toBe(0);
  expect(getGlassEngineStats()).toMatchObject({ frames: 0, uploads: 0, frameMs: 0 });
  // The shared ticker closes each frame once a reader turned counting on.
  countUpload(400); countUpload(100); stats.frame[DRAWN] = 3; endFrame(performance.now() - 2);
  const read = getGlassEngineStats();
  expect(read).toMatchObject({ uploads: 2, uploadBytes: 500, drawn: 3, frames: 1, total: { uploads: 2, uploadBytes: 500, drawn: 3 } });
  expect(read.frameMs).toBeGreaterThanOrEqual(2);
});

test('lists WebGL engines and DOM-reported strategies once each', () => {
  const svg = surface('svg', 'native-svg'), blur = surface('blur', 'missing-backdrop'), paused = surface('paused', 'offscreen');
  const scene = surface('webgl', 'webgl-requested'), single = document.createElement('span'), failed = surface('pending', 'initializing');
  const gl = {} as WebGLRenderingContext, other = {} as WebGLRenderingContext;
  stats.surfaces.add({ panel: scene, gl, scene: true, status: 'active' });
  stats.surfaces.add({ panel: single, gl: other, scene: false, status: 'active' });
  stats.surfaces.add({ panel: failed, gl, scene: false, status: 'capture-failed' });
  const read = getGlassEngineStats();
  expect(read).toMatchObject({ contexts: 2, surfaces: 6, webgl: 3, refracting: 3,
    strategies: { 'webgl-scene': 1, 'webgl-single': 1, svg: 1, 'css-fallback': 2, pending: 0, paused: 1, off: 0 } });
  const of = (element: HTMLElement) => read.list.find(entry => entry.element === element);
  expect(of(scene)).toEqual({ element: scene, strategy: 'webgl-scene', reason: 'webgl-requested' });
  expect(of(single)).toEqual({ element: single, strategy: 'webgl-single', reason: 'webgl' });
  expect(of(failed)).toEqual({ element: failed, strategy: 'css-fallback', reason: 'capture-failed' });
  expect(of(svg)?.strategy).toBe('svg'); expect(of(blur)).toMatchObject({ strategy: 'css-fallback', reason: 'missing-backdrop' }); expect(of(paused)?.strategy).toBe('paused');
});
