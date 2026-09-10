import type { LiquidGlassProps } from './index';

type MaterialSettings = Required<Pick<LiquidGlassProps,
  'lensProfile' | 'blur' | 'saturation' | 'aberrationIntensity' | 'frost' | 'glassColor' | 'borderColor'>>;

/** Coordinated surface and optical defaults. Explicit component props always win. */
export const MATERIAL_PRESETS = Object.freeze({
  clear: Object.freeze({ lensProfile: 'player', blur: 0, saturation: 115, aberrationIntensity: .12,
    frost: 0, glassColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.45)' }),
  frosted: Object.freeze({ lensProfile: 'material', blur: 8, saturation: 110, aberrationIntensity: .03,
    frost: .25, glassColor: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.5)' }),
  smoked: Object.freeze({ lensProfile: 'material', blur: 3, saturation: 90, aberrationIntensity: .04,
    frost: .1, glassColor: 'rgba(20,24,32,0.35)', borderColor: 'rgba(255,255,255,0.2)' }),
  subtle: Object.freeze({ lensProfile: 'track', blur: 1, saturation: 105, aberrationIntensity: 0,
    frost: .04, glassColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.18)' }),
} satisfies Record<string, MaterialSettings>);
export type MaterialPreset = keyof typeof MATERIAL_PRESETS;

export function resolveMaterialProps(props: LiquidGlassProps): LiquidGlassProps {
  const preset = props.material && Object.prototype.hasOwnProperty.call(MATERIAL_PRESETS, props.material)
    ? MATERIAL_PRESETS[props.material] : undefined;
  if (!preset) return props;
  const resolved = { ...props };
  for (const key of Object.keys(preset) as (keyof MaterialSettings)[]) {
    if (resolved[key] === undefined) (resolved as Record<string, unknown>)[key] = preset[key];
  }
  return resolved;
}
