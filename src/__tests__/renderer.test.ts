import { wantsWebGL, isIOSDevice } from '../core/renderer';

describe('renderer selection', () => {
  it('forces WebGL on iOS while preserving explicit blur/off', () => {
    for (const renderer of ['auto', 'svg', 'webgl'] as const) {
      expect(wantsWebGL(renderer, 'auto', true)).toBe(true);
      expect(wantsWebGL(renderer, 'svg', true)).toBe(true);
      expect(wantsWebGL(renderer, 'blur', true)).toBe(false);
      expect(wantsWebGL(renderer, 'off', true)).toBe(false);
    }
  });
  it('leaves Android and desktop selection to the developer', () => {
    expect(wantsWebGL('auto', 'auto', false)).toBe(false);
    expect(wantsWebGL('svg', 'auto', false)).toBe(false);
    expect(wantsWebGL('webgl', 'auto', false)).toBe(true);
  });
  it('recognizes iOS browsers and desktop-mode iPads without window.webkit', () => {
    expect(isIOSDevice('iPhone CriOS/123 Mobile', 5)).toBe(true);
    expect(isIOSDevice('Macintosh Intel Mac OS X', 5)).toBe(true);
    expect(isIOSDevice('Macintosh Intel Mac OS X', 0)).toBe(false);
    expect(isIOSDevice('Linux Android Chrome Mobile', 5)).toBe(false);
  });
});
