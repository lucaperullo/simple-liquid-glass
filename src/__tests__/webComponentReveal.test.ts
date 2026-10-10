/** @jest-environment jsdom */
const statuses: Array<(s: string) => void> = [];
jest.mock('../core/webgl/runtime', () => ({
  createWebGLEngine: (_p: unknown, _h: unknown, _s: unknown, _o: unknown, status: (s: string) => void) => {
    statuses.push(status);
    return { update() {}, refresh: async () => {}, destroy() {} };
  }
}));
jest.mock('../core/nativeOptics', () => ({
  ...jest.requireActual('../core/nativeOptics'),
  buildNativeMap: () => 'data:image/png;base64,'
}));

beforeEach(() => { jest.useFakeTimers(); document.body.innerHTML = '<div id="scene"></div>'; statuses.length = 0; });
afterEach(() => jest.useRealTimers());

const spawn = (attrs = '') => {
  document.body.insertAdjacentHTML('beforeend', `<liquid-glass backdrop-selector="#scene" ${attrs}>Toast</liquid-glass>`);
  return document.body.lastElementChild as HTMLElement;
};

test('glass already in the page when the element is defined is never hidden', () => {
  const page = spawn();
  require('../web-component');
  expect(page.hasAttribute('data-glass-awaiting')).toBe(false);
});

test('a spawned element waits for WebGL, then reveals', () => {
  require('../web-component');
  const toast = spawn();
  expect(toast.hasAttribute('data-glass-awaiting')).toBe(true);
  statuses[statuses.length - 1]('active');
  expect(toast.hasAttribute('data-glass-awaiting')).toBe(false);
});

test('a slow renderer is revealed after the safety timeout', () => {
  require('../web-component');
  const toast = spawn();
  jest.advanceTimersByTime(400);
  expect(toast.hasAttribute('data-glass-awaiting')).toBe(false);
});

test('reveal="immediate" and a missing backdrop never hide content', () => {
  require('../web-component');
  expect(spawn('reveal="immediate"').hasAttribute('data-glass-awaiting')).toBe(false);
  document.body.insertAdjacentHTML('beforeend', '<liquid-glass backdrop-selector="#absent">x</liquid-glass>');
  expect(document.body.lastElementChild!.hasAttribute('data-glass-awaiting')).toBe(false);
});
