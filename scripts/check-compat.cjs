const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const base = process.env.COMPAT_ROOT || path.resolve(__dirname, '..');
const from = Module.createRequire(path.join(base, 'package.json'));
const React = from('react');
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'react') return React;
  return originalLoad.call(this, name, ...args);
};
const { renderToString } = from('react-dom/server');
const { LiquidGlass } = require('../dist/index.cjs');
const { LiquidGlassInteractive } = require('../dist/interactive.cjs');
const { LiquidGlassMirror } = require('../dist/mirror.cjs');
require('../dist/web-component.cjs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost' });
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
// JSDOM has no raster backend; real map rendering is covered by Chromium tests.
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return { createImageData: (w, h) => ({data:new Uint8ClampedArray(w*h*4),width:w,height:h}), putImageData() {} };
};
dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
const errors = [];
const oldError = console.error;
console.error = (...args) => {
  if (String(args[0]).startsWith('(node:')) return oldError(...args);
  errors.push(args.join(' '));
};
(async () => {
  const legacyIds = new Set();
  for (const Component of [LiquidGlass, LiquidGlassInteractive, LiquidGlassMirror]) {
    const app = React.createElement(Component, { autoTextColor: true, forceTextColor: true, mirror: false }, 'Content');
    const el = document.createElement('div');
    const html = renderToString(app);
    assert.equal(html, renderToString(app));
    el.innerHTML = html;
    document.body.append(el);
    let unmount;
    if (parseInt(React.version) >= 18) {
      const root = from('react-dom/client').hydrateRoot(el, app);
      unmount = () => root.unmount();
    } else {
      const ReactDOM = from('react-dom');
      from('react-dom/test-utils').act(() => { ReactDOM.hydrate(app, el); });
      unmount = () => ReactDOM.unmountComponentAtNode(el);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(el.textContent.includes('Content'));
    assert.ok(el.querySelector('[data-liquid-glass]'));
    if (parseInt(React.version) < 18) {
      const id = el.querySelector('[class^=lg-text-]').className;
      assert.ok(!legacyIds.has(id), 'entry points must not reuse legacy IDs');
      legacyIds.add(id);
    }
    unmount(); el.remove();
  }
  console.error = oldError;
  assert.deepEqual(errors, [], 'SSR/hydration must not emit React errors');
  console.log(`React ${React.version}: all React entries render, hydrate and unmount; web component imports without a DOM.`);
  dom.window.close();
  // React 16 scheduler keeps a MessageChannel alive in Node after the DOM is closed.
  process.exit(0);
})().catch(error => { console.error = oldError; oldError(error); dom.window.close(); process.exit(1); });
