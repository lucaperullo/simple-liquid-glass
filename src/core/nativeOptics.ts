import { createLensMapGenerator } from '../vendor/samasante/displacement';
import { cacheGet, cacheSet } from '../displacementCache';
export const NATIVE_PROFILES = {
  material: { strength: .05, specular: 1, depth: .5, curvature: .3, bend: .45, bendWidth: .16,
    sheen: .32, sheenWidth: 3, sheenFalloff: 1.5, sheenAngle: 45, glowFalloff: .5, glow: .1 },
  loupe: { strength: .14, specular: 1.55, depth: .95, curvature: .5, bend: .4, bendWidth: .07,
    sheen: 1.2, sheenWidth: 3.5, sheenFalloff: 1.7, sheenAngle: 0, glowFalloff: .6, glow: .1 },
  player: { strength: .16, specular: 1, depth: .2, curvature: .55, bend: .25, bendWidth: .08,
    sheen: .95, sheenWidth: 2, sheenFalloff: 1.5, sheenAngle: 50, glowFalloff: 1.5, glow: .15 },
  track: { strength: .03, specular: 1, depth: .3, curvature: .25, bend: .05, bendWidth: .06,
    sheen: .35, sheenWidth: 3, sheenFalloff: 1.5, sheenAngle: 45, glowFalloff: 1.5, glow: .1 }
} as const;
export type LensProfile = keyof typeof NATIVE_PROFILES;

/** Public rounded-lens controls. Omitted values inherit the selected profile. */
export interface LensOptions {
  /** Maximum displacement as a fraction of the lens normalization size. 0–0.5. */
  strength?: number;
  /** How far refraction reaches into the lens. 0–1. */
  depth?: number;
  /** Body dome curvature. 0–1. */
  curvature?: number;
  /** Inner-edge bend intensity. 0–1. */
  bend?: number;
  /** Edge bend width as a fraction of the smaller dimension. 0.001–0.5. */
  bendWidth?: number;
  /** Directional sheen intensity. 0–2. */
  sheen?: number;
  /** Sheen thickness in CSS pixels. 0–10. */
  sheenWidth?: number;
  /** Sheen falloff exponent. 0.1–5. */
  sheenFalloff?: number;
  /** Directional light angle, degrees. -360–360. */
  sheenAngle?: number;
  /** Overall highlight gain. 0–3. */
  specular?: number;
  /** Inner glow intensity. 0–1. */
  glow?: number;
  /** Inner glow reach. 0.01–2. */
  glowSpread?: number;
  /** Inner glow falloff exponent. 0.1–5. */
  glowFalloff?: number;
  /** White (positive) or black (negative) veil opacity. -1–1. */
  brightness?: number;
}
export const LENS_OPTION_RANGES = {
  strength: [0,.5], depth: [0,1], curvature: [0,1], bend: [0,1], bendWidth: [.001,.5],
  sheen: [0,2], sheenWidth: [0,10], sheenFalloff: [.1,5], sheenAngle: [-360,360],
  specular: [0,3], glow: [0,1], glowSpread: [.01,2], glowFalloff: [.1,5], brightness: [-1,1]
} as const;
export function resolveLensOptions(profile: LensProfile = 'player', options: LensOptions = {}): Required<LensOptions> {
  const result: Required<LensOptions> = { ...NATIVE_PROFILES[profile] ?? NATIVE_PROFILES.player, glowSpread: 1, brightness: 0 };
  for (const key of Object.keys(LENS_OPTION_RANGES) as (keyof LensOptions)[]) {
    const value = options?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const [min,max] = LENS_OPTION_RANGES[key]; result[key] = Math.max(min,Math.min(max,value));
    }
  }
  return result;
}
/** Only map-generating values invalidate the shared geometry cache. */
export function buildNativeMap(width: number, height: number, radius: number, profile: LensProfile = 'material', options?: LensOptions) {
  const {strength: _strength, specular: _specular, brightness: _brightness, ...geometry} = resolveLensOptions(profile, options);
  const key = `material-v2:${width}:${height}:${radius}:${JSON.stringify(geometry)}`;
  const cached = cacheGet(key); if (cached) return cached;
  if (typeof document === 'undefined') return '';
  const generator = createLensMapGenerator(512);
  try {
    const uri = generator.generate({ lensHalfWidth: width / 2, lensHalfHeight: height / 2,
      borderRadius: radius, ...geometry, clipToShape: true, softEdge: true });
    cacheSet(key, uri); return uri;
  } finally { generator.dispose(); }
}
