export type GlassRenderer = 'auto' | 'svg' | 'webgl';

export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  return !/Android/i.test(userAgent) && (/iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1));
}

/** Only Chromium (Blink) runs SVG filters in backdrop-filter. WebKit (bug 245510) and Gecko
 * silently ignore url(#...), and every iOS browser is WebKit regardless of its brand. */
export function supportsSvgBackdrop(userAgent: string, maxTouchPoints: number): boolean {
  if (isIOSDevice(userAgent, maxTouchPoints) || /firefox|fxios/i.test(userAgent)) return false;
  return /(chrome|chromium|edg|opr)\//i.test(userAgent);
}

/** Engines without SVG backdrop filters always refract through WebGL; Chromium opts in. */
export function wantsWebGL(renderer: GlassRenderer, effect: 'auto' | 'svg' | 'blur' | 'off', svgBackdrop: boolean): boolean {
  return effect !== 'off' && effect !== 'blur' && (!svgBackdrop || renderer === 'webgl');
}
