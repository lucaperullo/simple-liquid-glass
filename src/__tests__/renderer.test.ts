import { wantsWebGL, isIOSDevice, isMobileDevice, resolveRenderer, supportsSvgBackdrop } from '../core/renderer';

const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Z2357N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1';

describe('renderer selection', () => {
  it('only Chromium (Blink) outside iOS runs SVG filters in backdrop-filter', () => {
    expect(supportsSvgBackdrop(CHROME, 0)).toBe(true);
    expect(supportsSvgBackdrop(SAFARI, 0)).toBe(false);
    expect(supportsSvgBackdrop(FIREFOX, 0)).toBe(false);
    expect(supportsSvgBackdrop(IOS_CHROME, 5)).toBe(false);
  });
  it('forces WebGL wherever SVG backdrop filters are unsupported, preserving explicit blur/off', () => {
    for (const renderer of ['auto', 'svg', 'webgl'] as const) {
      expect(wantsWebGL(renderer, 'auto', false)).toBe(true);
      expect(wantsWebGL(renderer, 'svg', false)).toBe(true);
      expect(wantsWebGL(renderer, 'blur', false)).toBe(false);
      expect(wantsWebGL(renderer, 'off', false)).toBe(false);
    }
  });
  it('leaves Chromium selection to the developer', () => {
    expect(wantsWebGL('auto', 'auto', true)).toBe(false);
    expect(wantsWebGL('svg', 'auto', true)).toBe(false);
    expect(wantsWebGL('webgl', 'auto', true)).toBe(true);
  });
  it('refracts through WebGL on every phone by default, unless a mobile fallback is chosen', () => {
    const svg = supportsSvgBackdrop(ANDROID_CHROME, 5), mobile = isMobileDevice(ANDROID_CHROME);
    expect(svg && mobile).toBe(true);
    expect(wantsWebGL(resolveRenderer('auto', svg, mobile), 'auto', svg)).toBe(true);
    expect(resolveRenderer('svg', svg, mobile)).toBe('svg');
    expect(resolveRenderer('auto', svg, mobile, 'css-only')).toBe('auto');
    expect(resolveRenderer('auto', svg, mobile, 'svg')).toBe('auto');
    // Desktop Chromium keeps SVG backdrop filters.
    expect(isMobileDevice(CHROME)).toBe(false);
    expect(resolveRenderer('auto', true, false)).toBe('auto');
  });
  it('recognizes iOS browsers and desktop-mode iPads without window.webkit', () => {
    expect(isIOSDevice('iPhone CriOS/123 Mobile', 5)).toBe(true);
    expect(isIOSDevice('Macintosh Intel Mac OS X', 5)).toBe(true);
    expect(isIOSDevice('Macintosh Intel Mac OS X', 0)).toBe(false);
    expect(isIOSDevice('Linux Android Chrome Mobile', 5)).toBe(false);
  });
});
