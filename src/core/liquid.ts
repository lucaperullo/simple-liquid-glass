/**
 * Liquid motion presets for the real animated refraction. Pure: maps a preset name + options to
 * the static `feTurbulence`/`feDisplacementMap` config and the per-frame `baseFrequency` values.
 * No DOM, no rAF — the React/web-component layer owns the loop and just calls these. Keeping the
 * math here makes it unit-testable and identical across both renderers.
 */

export type LiquidPreset = 'ripple' | 'flow' | 'wobble';

export const LIQUID_PRESETS: readonly LiquidPreset[] = ['ripple', 'flow', 'wobble'];

export function isLiquidPreset(v: unknown): v is LiquidPreset {
  return typeof v === 'string' && (LIQUID_PRESETS as readonly string[]).includes(v);
}

/** Static turbulence/displacement config (the values that don't change per frame). */
export interface LiquidConfig {
  baseFrequencyX: number;
  baseFrequencyY: number;
  numOctaves: number;
  /** Displacement amplitude in px (feeds feDisplacementMap@scale). */
  scale: number;
  seed: number;
}

export interface LiquidOptions {
  /** Motion rate multiplier (default 1). */
  speed?: number;
  /** Override the preset's displacement amplitude. */
  scale?: number;
  /** Hard cap on amplitude (mobile / low quality). */
  maxScale?: number;
}

interface PresetSpec extends LiquidConfig {
  /** baseFrequency oscillation amplitude per axis. */
  ampX: number;
  ampY: number;
  /** oscillation rate per axis (rad/s at speed 1). */
  rateX: number;
  rateY: number;
}

const PRESETS: Record<LiquidPreset, PresetSpec> = {
  // fine, isotropic water-surface boil
  ripple: { baseFrequencyX: 0.012, baseFrequencyY: 0.012, numOctaves: 2, scale: 15, seed: 3, ampX: 0.004, ampY: 0.004, rateX: 1.3, rateY: 1.1 },
  // anisotropic drift — the distortion streams across one axis
  flow: { baseFrequencyX: 0.01, baseFrequencyY: 0.016, numOctaves: 2, scale: 18, seed: 7, ampX: 0.006, ampY: 0, rateX: 0.7, rateY: 0 },
  // slow, low-frequency, high-amplitude gel wobble
  wobble: { baseFrequencyX: 0.006, baseFrequencyY: 0.006, numOctaves: 1, scale: 28, seed: 11, ampX: 0.0022, ampY: 0.0022, rateX: 0.55, rateY: 0.5 },
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Resolve the static config for a preset, applying scale override / cap. */
export function liquidConfig(preset: LiquidPreset, opts: LiquidOptions = {}): LiquidConfig {
  const p = PRESETS[preset] ?? PRESETS.ripple;
  let scale = opts.scale != null && Number.isFinite(opts.scale) ? opts.scale : p.scale;
  if (opts.maxScale != null && Number.isFinite(opts.maxScale)) scale = Math.min(scale, opts.maxScale);
  scale = Math.max(0, scale);
  return { baseFrequencyX: p.baseFrequencyX, baseFrequencyY: p.baseFrequencyY, numOctaves: p.numOctaves, scale, seed: p.seed };
}

/**
 * Per-frame `baseFrequency` for the live turbulence node, given elapsed seconds. The value always
 * stays within `[base - amp, base + amp]` of the preset so the noise never collapses or explodes.
 */
export function liquidBaseFrequency(preset: LiquidPreset, tSeconds: number, speed = 1): [number, number] {
  const p = PRESETS[preset] ?? PRESETS.ripple;
  const s = (Number.isFinite(tSeconds) ? tSeconds : 0) * (Number.isFinite(speed) ? speed : 1);
  const x = p.baseFrequencyX + p.ampX * Math.sin(s * p.rateX);
  const y = p.ampY ? p.baseFrequencyY + p.ampY * Math.cos(s * p.rateY) : p.baseFrequencyY;
  return [round4(Math.max(0.0001, x)), round4(Math.max(0.0001, y))];
}
