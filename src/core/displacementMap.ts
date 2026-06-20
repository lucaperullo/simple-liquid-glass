/**
 * Canonical, framework-agnostic displacement-map generator (shared by the React component
 * and the web component). Pure: given size + shape params, returns the SVG / data-URI used
 * as the feImage in the refraction filter. No DOM, no React.
 */

import { classicBandFraction, classicAmpScale } from './displacementField';

/**
 * Lens field shape:
 * - `classic` — linear radial field (the historical look; reads as a split/mirror at high scale).
 * - `convex`  — one coherent dome magnifier (a radial field windowed to neutral at the rim).
 * - `shift`   — a uniform directional offset (whole pane slides one way; straight stays straight).
 * - `rim`     — flat clear center, refraction only in a soft band hugging the perimeter.
 */
export type LensMode = 'classic' | 'convex' | 'shift' | 'rim';

export interface DisplacementParams {
  width: number;
  height: number;
  /** Quality divisor (lower = higher internal resolution). */
  divisor: number;
  /** Quantization step for the internal size (keeps the cache key space coarse). */
  quantStep: number;
  radius: number;
  border: number;
  lightness: number;
  alpha: number;
  displace: number;
  blend?: string;
  /**
   * Refraction direction in degrees. `0` = baseline (current look). Positive rotates the lean
   * clockwise on screen (SVG y-down). For `lens: 'shift'`, this is the direction of the offset.
   */
  angle?: number;
  /**
   * Aspect-faithful + isotropic refraction so the lens reads like glass cut to the element's
   * shape. `true` (default, 3.0.0) builds the map in aspect-true pixel space. `false` emits the
   * legacy (≤2.x) objectBoundingBox map, byte-for-byte unchanged. Applies to `lens: 'classic'`.
   */
  shapeAdapt?: boolean;
  /** Lens field shape (default `'classic'`). */
  lens?: LensMode;
  /** Manual magnitude for the lens field (default 1). 0 = no lens displacement. */
  lensStrength?: number;
  /** Lens center for `convex`/`rim`, normalized 0..1 (default `[0.5, 0.5]`). */
  lensCenter?: [number, number];
  /** Effective displacement scale (largest of the aberration nodes); sizes the fold-free edge band. */
  scale?: number;
  /** Override the auto edge-band width as a fraction of the short side (else derived from `scale`). */
  edgeFeather?: number;
}

/** Quantized internal map dimensions for a given rendered size + quality. */
export function quantizedSize(width: number, height: number, divisor: number, quantStep: number) {
  const newwidth = Math.max(8, Math.round(width / divisor / quantStep) * quantStep);
  const newheight = Math.max(8, Math.round(height / divisor / quantStep) * quantStep);
  return { newwidth, newheight };
}

/**
 * Canonicalize an angle: non-finite → 0, wrapped to [0, 360), rounded to 3 decimals. Used for
 * both the emitted SVG and the cache key so `360`, `NaN`, `Infinity`, and float noise like
 * `45.0000001` collapse to a single stable value (and `0`/`360` to the no-transform fast path).
 */
export function normalizeAngle(angle?: number): number {
  const a = typeof angle === 'number' && Number.isFinite(angle) ? angle : 0;
  const wrapped = ((a % 360) + 360) % 360;
  return Math.round(wrapped * 1000) / 1000;
}

/** Legacy (≤2.x) gradients in objectBoundingBox units. `angle` rotates both about the box center. */
function legacyGradients(angle: number): string {
  const gt = angle !== 0 ? ` gradientTransform="rotate(${angle} 0.5 0.5)"` : '';
  return `          <linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%"${gt}>
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="blue" x1="0%" y1="0%" x2="0%" y2="100%"${gt}>
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>`;
}

/**
 * Shape-adapted gradients in aspect-true pixel space (userSpaceOnUse over the viewBox).
 * - Faithful angle: rotate about the pixel center, so an on-screen angle is preserved on any aspect.
 * - Isotropic refraction: scale each ramp's amplitude so the per-pixel displacement slope matches
 *   on both axes (long axis = full amplitude, short axis scaled by shortExtent/longestExtent),
 *   removing the over-bending on the short axis of a wide/tall element. On a square this is identical
 *   to the legacy ramps (both amplitudes = full).
 */
function adaptedGradients(newwidth: number, newheight: number, angle: number): string {
  const cx = newwidth / 2;
  const cy = newheight / 2;
  const longest = Math.max(newwidth, newheight);
  const redAmp = Math.round((255 * newwidth) / longest); // horizontal ramp amplitude
  const blueAmp = Math.round((255 * newheight) / longest); // vertical ramp amplitude
  const gt = angle !== 0 ? ` gradientTransform="rotate(${angle} ${cx} ${cy})"` : '';
  return `          <linearGradient id="red" gradientUnits="userSpaceOnUse" x1="${newwidth}" y1="${cy}" x2="0" y2="${cy}"${gt}>
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="rgb(${redAmp},0,0)"/>
          </linearGradient>
          <linearGradient id="blue" gradientUnits="userSpaceOnUse" x1="${cx}" y1="0" x2="${cx}" y2="${newheight}"${gt}>
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="rgb(0,0,${blueAmp})"/>
          </linearGradient>`;
}

interface LensInner {
  defs: string;
  body: string;
}

// Tunable amplitude budgets (kept conservative so the default scale stays fold-free; see the
// fold analysis in the design spec). lensStrength scales these; the channel deviation is capped
// at 0.5 (the encodable maximum).
const CONVEX_AMP = 0.3; // peak channel deviation at strength 1
const CONVEX_REACH = 0.66; // dome radius as a fraction of the short side
const RIM_AMP = 0.42; // peak rim channel deviation at strength 1 (× 127 bytes)
const SHIFT_GAIN = 0.5; // half the channel swing at strength 1

/**
 * `convex` — one coherent radial magnifier centered at the lens. Two channel groups carry R and B
 * independently (red source-over a 0.5 baseline, blue via difference), each an INWARD ramp (R high
 * toward the center side → converging → magnify), windowed by a radial dome mask that fades the
 * field to neutral at the rim so the pane reads as a single lens instead of a split.
 */
function buildConvexInner(
  w: number,
  h: number,
  er: number,
  angle: number,
  strength: number,
  lcx: number,
  lcy: number
): LensInner {
  const Lx = lcx * w;
  const Ly = lcy * h;
  const Rlens = Math.max(8, Math.min(w, h) * CONVEX_REACH);
  const dev = strength > 0 ? Math.min(0.5, CONVEX_AMP * strength) : 0;
  const hi = Math.round((0.5 + dev) * 255);
  const lo = Math.round((0.5 - dev) * 255);
  const gt = angle !== 0 ? ` gradientTransform="rotate(${angle} ${Lx} ${Ly})"` : '';
  const redRamp =
    dev > 0
      ? `<linearGradient id="cvxRed" gradientUnits="userSpaceOnUse" x1="${Lx - Rlens}" y1="${Ly}" x2="${Lx + Rlens}" y2="${Ly}"${gt}><stop offset="0%" stop-color="rgb(${hi},0,0)"/><stop offset="100%" stop-color="rgb(${lo},0,0)"/></linearGradient>`
      : `<linearGradient id="cvxRed"><stop offset="0%" stop-color="rgb(128,0,0)"/></linearGradient>`;
  const blueRamp =
    dev > 0
      ? `<linearGradient id="cvxBlue" gradientUnits="userSpaceOnUse" x1="${Lx}" y1="${Ly - Rlens}" x2="${Lx}" y2="${Ly + Rlens}"${gt}><stop offset="0%" stop-color="rgb(0,0,${hi})"/><stop offset="100%" stop-color="rgb(0,0,${lo})"/></linearGradient>`
      : `<linearGradient id="cvxBlue"><stop offset="0%" stop-color="rgb(0,0,128)"/></linearGradient>`;
  const defs = `${redRamp}
          ${blueRamp}
          <radialGradient id="cvxEnv" gradientUnits="userSpaceOnUse" cx="${Lx}" cy="${Ly}" r="${Rlens}" fx="${Lx}" fy="${Ly}"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="#fff"/><stop offset="100%" stop-color="#000"/></radialGradient>
          <mask id="cvxMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="url(#cvxEnv)"/></mask>`;
  const body = `<rect x="0" y="0" width="${w}" height="${h}" fill="black"/>
        <g>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${er}" fill="rgb(128,0,0)"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${er}" fill="url(#cvxRed)" mask="url(#cvxMask)"/>
        </g>
        <g style="mix-blend-mode: difference">
          <rect x="0" y="0" width="${w}" height="${h}" rx="${er}" fill="rgb(0,0,128)"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${er}" fill="url(#cvxBlue)" mask="url(#cvxMask)"/>
        </g>`;
  return { defs, body };
}

/**
 * `shift` — a uniform directional refraction. R and B are flat constants (0.5 ± offset) across the
 * whole pane, soft-feathered to neutral at the edge, so the displacement is a rigid translation:
 * straight backdrop lines stay straight, just offset. `angle` is the offset direction. Fold-free in
 * the interior (constant field). No blend mode needed.
 */
function buildShiftInner(w: number, h: number, bw: number, er: number, angle: number, strength: number): LensInner {
  const rad = (angle * Math.PI) / 180;
  const off = Math.max(0, Math.min(0.5, 0.5 * SHIFT_GAIN * strength));
  const rByte = Math.round((0.5 + off * Math.cos(rad)) * 255); // RED → horizontal
  const bByte = Math.round((0.5 + off * Math.sin(rad)) * 255); // BLUE → vertical
  // Cap the feather to ~1/3 of the half-extent so a full-alpha interior plateau always exists
  // (otherwise thin maps collapse the white rect to a sub-blur strip and the field is too weak).
  const halfMin = Math.min(w, h) / 2 - 0.5;
  const feather = Math.max(1, Math.min(bw, halfMin / 3));
  const defs = `<mask id="shiftMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="black"/><rect x="${feather}" y="${feather}" width="${w - feather * 2}" height="${h - feather * 2}" rx="${Math.max(0, er - feather)}" fill="white" style="filter:blur(${feather}px)"/></mask>`;
  const body = `<rect x="0" y="0" width="${w}" height="${h}" fill="rgb(128,0,128)"/>
        <rect x="0" y="0" width="${w}" height="${h}" rx="${er}" fill="rgb(${rByte},0,${bByte})" mask="url(#shiftMask)"/>`;
  return { defs, body };
}

/**
 * `rim` — flat clear center, refraction only in a band hugging the perimeter. A signed 3-stop ramp
 * per channel (anchored at neutral 0.5 on the lens axis) is confined by a soft radial mask whose
 * feather WIDENS with strength (so more strength is gentler, not steeper). Channels are separated
 * with `screen` over a black plate so both survive without corrupting the 0.5 baseline.
 */
function buildRimInner(
  w: number,
  h: number,
  bw: number,
  er: number,
  angle: number,
  strength: number,
  lcx: number,
  lcy: number
): LensInner {
  const Lx = lcx * w;
  const Ly = lcy * h;
  const amp = Math.min(1, Math.max(0, strength));
  const d = Math.round(127 * RIM_AMP * amp);
  const hi = Math.min(255, 128 + d);
  const lo = Math.max(0, 128 - d);
  const outerR = Math.min(w, h) / 2;
  // Band width is a visible fraction of the half-extent (not the tiny CSS border), widening with
  // strength so more strength = gentler edge (fold-safe), per the verified design.
  const rimReach = Math.max(bw * 1.6, Math.min(w, h) * 0.4);
  const innerR = Math.max(0, outerR - rimReach * amp);
  const innerPct = ((100 * innerR) / outerR).toFixed(2);
  const gt = angle !== 0 ? ` gradientTransform="rotate(${angle} ${Lx} ${Ly})"` : '';
  const defs = `<linearGradient id="rimRed" gradientUnits="userSpaceOnUse" x1="0" y1="${Ly}" x2="${w}" y2="${Ly}"${gt}><stop offset="0%" stop-color="rgb(${lo},0,0)"/><stop offset="50%" stop-color="rgb(128,0,0)"/><stop offset="100%" stop-color="rgb(${hi},0,0)"/></linearGradient>
          <linearGradient id="rimBlue" gradientUnits="userSpaceOnUse" x1="${Lx}" y1="0" x2="${Lx}" y2="${h}"${gt}><stop offset="0%" stop-color="rgb(0,0,${lo})"/><stop offset="50%" stop-color="rgb(0,0,128)"/><stop offset="100%" stop-color="rgb(0,0,${hi})"/></linearGradient>
          <radialGradient id="rimRadial" gradientUnits="userSpaceOnUse" cx="${Lx}" cy="${Ly}" r="${outerR}"${gt}><stop offset="0%" stop-color="#000"/><stop offset="${innerPct}%" stop-color="#000"/><stop offset="100%" stop-color="#fff"/></radialGradient>
          <mask id="rimMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="url(#rimRadial)"/></mask>`;
  const body = `<rect x="0" y="0" width="${w}" height="${h}" fill="rgb(128,0,128)"/>
        <g mask="url(#rimMask)">
          <rect x="0" y="0" width="${w}" height="${h}" fill="black"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${er}" fill="url(#rimRed)"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${er}" fill="url(#rimBlue)" style="mix-blend-mode: screen"/>
        </g>`;
  return { defs, body };
}

export function buildDisplacementSvg(p: DisplacementParams): string {
  const { width, height, divisor, quantStep, radius, border, lightness, alpha, displace } = p;
  const blend = p.blend ?? 'difference';
  const angle = normalizeAngle(p.angle);
  const shapeAdapt = p.shapeAdapt !== false;
  const lens: LensMode = p.lens ?? 'classic';
  const strength = typeof p.lensStrength === 'number' && Number.isFinite(p.lensStrength) ? Math.max(0, p.lensStrength) : 1;
  const lcx = p.lensCenter ? p.lensCenter[0] : 0.5;
  const lcy = p.lensCenter ? p.lensCenter[1] : 0.5;
  const { newwidth, newheight } = quantizedSize(width, height, divisor, quantStep);
  const borderWidth = Math.min(newwidth, newheight) * (border * 0.5);
  const effectiveRadius = Math.min(radius, width / 2, height / 2) / divisor;

  if (lens !== 'classic') {
    const band = `<rect x="${borderWidth}" y="${borderWidth}" width="${newwidth - borderWidth * 2}" height="${newheight - borderWidth * 2}" rx="${effectiveRadius}" fill="hsl(0 0% ${lightness}% / ${alpha})" style="filter:blur(${displace}px)" />`;
    let inner: LensInner;
    if (lens === 'convex') inner = buildConvexInner(newwidth, newheight, effectiveRadius, angle, strength, lcx, lcy);
    else if (lens === 'shift') inner = buildShiftInner(newwidth, newheight, borderWidth, effectiveRadius, angle, strength);
    else inner = buildRimInner(newwidth, newheight, borderWidth, effectiveRadius, angle, strength, lcx, lcy);
    // The blurred neutral band is the glass-edge highlight for convex/shift; `rim` owns its own
    // edge, so adding the band there would overwrite the rim field.
    const body = lens === 'rim' ? inner.body : `${inner.body}
        ${band}`;
    return `
      <svg viewBox="0 0 ${newwidth} ${newheight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${inner.defs}
        </defs>
        ${body}
      </svg>
    `;
  }

  const band = `<rect x="${borderWidth}" y="${borderWidth}" width="${newwidth - borderWidth * 2}" height="${newheight - borderWidth * 2}" rx="${effectiveRadius}" fill="hsl(0 0% ${lightness}% / ${alpha})" style="filter:blur(${displace}px)" />`;

  if (shapeAdapt) {
    // Fold-free classic: window the affine ramp by a boundary-conformant envelope (mask, inset+blurred
    // rounded rect = an SDF level set, radial-normal at corners) over a NEUTRAL plate so the field
    // fades to neutral at the rim instead of cliffing. The band widens with `scale`; when even the
    // bounded band can't carry full amplitude fold-free, a group `opacity` attenuates the ramp.
    const defs = adaptedGradients(newwidth, newheight, angle);
    const minElem = Math.min(width, height);
    const scaleEff = Number.isFinite(p.scale as number) ? (p.scale as number) : 0;
    const bandFrac = classicBandFraction(scaleEff, minElem, p.edgeFeather);
    const att = classicAmpScale(scaleEff, minElem, p.edgeFeather);
    const minMap = Math.min(newwidth, newheight);
    const W = Math.max(0.5, bandFrac * minMap);
    const innerRx = Math.max(0, effectiveRadius - W);
    const envBlur = Math.max(0.5, W * 0.5);
    const rimSoft = Math.max(0.6, minMap * 0.01);
    const attOpacity = att < 0.999 ? ` opacity="${Math.round(att * 1000) / 1000}"` : '';
    return `
      <svg viewBox="0 0 ${newwidth} ${newheight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
${defs}
          <mask id="clsEnv" maskUnits="userSpaceOnUse" x="0" y="0" width="${newwidth}" height="${newheight}">
            <rect x="0" y="0" width="${newwidth}" height="${newheight}" fill="#000"/>
            <rect x="${W}" y="${W}" width="${newwidth - W * 2}" height="${newheight - W * 2}" rx="${innerRx}" fill="white" style="filter:blur(${envBlur}px)"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="${newwidth}" height="${newheight}" fill="rgb(128,128,128)"/>
        <g${attOpacity}>
          <g mask="url(#clsEnv)" style="filter:blur(${rimSoft}px)">
            <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#red)" />
            <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#blue)" style="mix-blend-mode: ${blend}" />
          </g>
        </g>
        ${band}
      </svg>
    `;
  }

  // shapeAdapt:false — legacy (≤2.x) block, byte-for-byte unchanged.
  const defs = legacyGradients(angle);
  const rimSoft = Math.max(0.6, Math.min(newwidth, newheight) * 0.01);
  return `
      <svg viewBox="0 0 ${newwidth} ${newheight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
${defs}
        </defs>
        <rect x="0" y="0" width="${newwidth}" height="${newheight}" fill="black"/>
        <g style="filter:blur(${rimSoft}px)">
          <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#red)" />
          <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#blue)" style="mix-blend-mode: ${blend}" />
        </g>
        ${band}
      </svg>
    `;
}

export function buildDisplacementDataUri(p: DisplacementParams): string {
  return `data:image/svg+xml,${encodeURIComponent(buildDisplacementSvg(p))}`;
}
