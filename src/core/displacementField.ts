/**
 * Pure math for the fold-free `classic` displacement field — no DOM, no SVG strings.
 * `classicBandFraction` is the production lever used by `buildDisplacementSvg`; the
 * `sampleClassicField` / `jacobianMinDet` pair is the canonical field model the fold
 * test grades for injectivity. The SVG in `displacementMap.ts` renders this same math;
 * the browser pixel-Jacobian (verify/lens.html) confirms the rendering matches.
 */

// Peak channel deviation of the classic ramp (R spans 0..1 → ±0.5).
export const CLASSIC_PEAK_AMP = 0.5;
// Fold-safety factor: band ≥ k × max-displacement so scaleEff·slope ≈ 1/k < 1. Calibrated in Task 6.
export const BAND_K = 1.2;
export const BAND_MIN = 0.06; // floor: a soft edge even at low scale
export const BAND_MAX = 0.48; // ceiling: the band must not swallow the pane

/** Envelope band width as a fraction of the element's short side. */
export function classicBandFraction(scaleEff: number, minElem: number, edgeFeather?: number): number {
  if (typeof edgeFeather === 'number' && Number.isFinite(edgeFeather)) {
    return Math.max(0, Math.min(BAND_MAX, edgeFeather));
  }
  if (!Number.isFinite(scaleEff) || scaleEff <= 0 || !Number.isFinite(minElem) || minElem <= 0) {
    return BAND_MIN;
  }
  const frac = (BAND_K * CLASSIC_PEAK_AMP * scaleEff) / minElem;
  return Math.max(BAND_MIN, Math.min(BAND_MAX, frac));
}
