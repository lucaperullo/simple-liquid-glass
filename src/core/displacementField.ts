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
export const BAND_MAX = 2.6; // ceiling: the band must not swallow the pane

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Signed distance to a centered rounded rect (negative inside). */
function sdfRoundRect(x: number, y: number, hw: number, hh: number, r: number): number {
  const rr = Math.max(0, Math.min(r, hw, hh));
  const qx = Math.abs(x) - (hw - rr);
  const qy = Math.abs(y) - (hh - rr);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - rr;
}

export interface FieldOpts {
  w: number; h: number; r: number; scaleEff: number;
  legacy?: boolean; edgeFeather?: number;
}

/**
 * Canonical channel-deviation field at normalized (nx,ny) ∈ [0,1]². Returns [rDev, bDev] ∈ [-0.5,0.5].
 * legacy=true models the current hard-clip-to-black-plate behavior (the thing that folds).
 */
export function sampleClassicField(nx: number, ny: number, o: FieldOpts): [number, number] {
  const long = Math.max(o.w, o.h);
  const ampX = CLASSIC_PEAK_AMP * (o.w / long);
  const ampY = CLASSIC_PEAK_AMP * (o.h / long);
  const rampX = ampX * (2 * nx - 1);
  const rampY = ampY * (2 * ny - 1);
  // depth inside the boundary, in px (negative outside)
  const cx = (nx - 0.5) * o.w;
  const cy = (ny - 0.5) * o.h;
  const depth = -sdfRoundRect(cx, cy, o.w / 2, o.h / 2, o.r);
  if (o.legacy) {
    const rimPx = Math.max(0.6, 0.01 * Math.min(o.w, o.h)); // current, scale-blind
    const t = smoothstep(0, rimPx, depth);                  // 1 inside → 0 outside, STEEP
    const plate = -CLASSIC_PEAK_AMP;                         // black plate = -0.5 deviation
    return [rampX * t + plate * (1 - t), rampY * t + plate * (1 - t)];
  }
  const bandFrac = classicBandFraction(o.scaleEff, Math.min(o.w, o.h), o.edgeFeather);
  const Wpx = bandFrac * Math.min(o.w, o.h);
  const env = smoothstep(0, Wpx, depth); // 0 at boundary → 1 at depth Wpx, GENTLE & scale-driven
  return [rampX * env, rampY * env];     // fades to neutral (0) at the rim
}

/**
 * Minimum determinant of the Jacobian of p ↦ p + scaleEff·field(p), in normalized coords, over an
 * N×N interior grid. > 0 everywhere ⇒ the map is locally injective ⇒ no fold/tear.
 */
export function jacobianMinDet(o: FieldOpts, N = 64): number {
  const F = (nx: number, ny: number): [number, number] => {
    const [dx, dy] = sampleClassicField(nx, ny, o);
    return [nx + (o.scaleEff * dx) / o.w, ny + (o.scaleEff * dy) / o.h];
  };
  const eps = 0.5 / N;
  let min = Infinity;
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const nx = i / N;
      const ny = j / N;
      const [fxpx, fypx] = F(nx + eps, ny);
      const [fxmx, fymx] = F(nx - eps, ny);
      const [fxpy, fypy] = F(nx, ny + eps);
      const [fxmy, fymy] = F(nx, ny - eps);
      const dFx_dnx = (fxpx - fxmx) / (2 * eps);
      const dFy_dnx = (fypx - fymx) / (2 * eps);
      const dFx_dny = (fxpy - fxmy) / (2 * eps);
      const dFy_dny = (fypy - fymy) / (2 * eps);
      const det = dFx_dnx * dFy_dny - dFx_dny * dFy_dnx;
      if (det < min) min = det;
    }
  }
  return min;
}
