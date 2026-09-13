import type {LiquidGlassProps} from 'simple-liquid-glass'

/** Every showcase demo uses the highest quality with native SVG and automatic iOS WebGL refraction. */
export const SCENE_GLASS = {
  quality: 'extreme',
  autodetectquality: false,
  mobileFallback: 'svg',
} as const satisfies Readonly<Pick<LiquidGlassProps, 'quality' | 'autodetectquality' | 'mobileFallback'>>
