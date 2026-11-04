/** @jest-environment jsdom */
import { defineLiquidGlass } from '../web-component';

test('supports multiple custom tag names', () => {
  expect(() => { defineLiquidGlass('test-glass-one'); defineLiquidGlass('test-glass-two'); }).not.toThrow();
  expect(document.createElement('test-glass-one').shadowRoot).not.toBeNull();
});

test('border color is treated as CSS, never HTML', () => {
  const el = document.createElement('liquid-glass');
  el.setAttribute('border-color', '</style><img src=x onerror="alert(1)"><style>');
  document.body.append(el);
  expect(el.shadowRoot?.querySelector('img')).toBeNull();
  el.remove();
});

test('max-scale reaches the WebGL options and re-renders when it changes', () => {
  jest.isolateModules(() => {
    const update = jest.fn(), created: Array<{ maxScale?: number }> = [];
    jest.doMock('../core/webgl/runtime', () => ({ createWebGLEngine: (_e: unknown, _h: unknown, _s: unknown, options: { maxScale?: number }) => { created.push(options); return { update, refresh: async () => {}, destroy() {} }; } }));
    // jsdom has no 2D canvas to build lens maps with.
    jest.doMock('../core/nativeOptics', () => ({ ...jest.requireActual('../core/nativeOptics'), buildNativeMap: () => '' }));
    const { defineLiquidGlass: define } = require('../web-component');
    define('scaled-glass');
    const source = document.createElement('div'); source.id = 'scaled-source'; document.body.append(source);
    const el = document.createElement('scaled-glass');
    el.setAttribute('renderer', 'webgl'); el.setAttribute('backdrop-selector', '#scaled-source');
    document.body.append(el);
    expect(created[0].maxScale).toBe(0); // unset: no cap
    el.setAttribute('max-scale', '1.5');
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ maxScale: 1.5 }));
    el.remove(); source.remove();
  });
});
