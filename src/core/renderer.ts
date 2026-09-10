export type GlassRenderer = 'auto' | 'svg' | 'webgl';

export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  return !/Android/i.test(userAgent) && (/iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1));
}

export function wantsWebGL(renderer: GlassRenderer, effect: 'auto' | 'svg' | 'blur' | 'off', ios: boolean): boolean {
  return effect !== 'off' && effect !== 'blur' && (ios || renderer === 'webgl');
}
