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

/** Phones and tablets, by user agent (an iPad in desktop mode is caught by isIOSDevice instead). */
export function isMobileDevice(userAgent: string): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
}

/**
 * What `renderer="auto"` means on this device. Every phone refracts through WebGL: iOS because WebKit has no SVG
 * backdrop filters, Android Chromium because SVG filters there cost too much per frame (they used to fall back to
 * CSS blur, which does not refract). Desktop Chromium keeps SVG, which samples the live page without a backdrop.
 * A `mobileFallback` choice keeps the old mobile behaviour. WebGL without a backdrop source still ends in CSS blur.
 */
export function resolveRenderer(requested: GlassRenderer, svgBackdrop: boolean, mobile: boolean, mobileFallback?: 'css-only' | 'svg'): GlassRenderer {
  return requested === 'auto' && svgBackdrop && mobile && !mobileFallback ? 'webgl' : requested;
}

/** Engines without SVG backdrop filters always refract through WebGL; Chromium opts in. */
export function wantsWebGL(renderer: GlassRenderer, effect: 'auto' | 'svg' | 'blur' | 'off', svgBackdrop: boolean): boolean {
  return effect !== 'off' && effect !== 'blur' && (!svgBackdrop || renderer === 'webgl');
}
