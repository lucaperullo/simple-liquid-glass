# Fold-free displacement field (SDF-envelope `classic`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `classic` displacement field from shearing/tearing the backdrop along the rounded-rect corner arc at any `scale`, by windowing the affine ramp with a boundary-conformant envelope whose width grows with the effective displacement, over a neutral plate.

**Architecture:** A pure helper `classicBandFraction(scaleEff, minElem, edgeFeather?)` sets a boundary-band width as a fraction of the element's short side, growing with `scaleEff` so the per-pixel slope stays bounded (`scaleEff·slope ≈ 1/k < 1` → injective → fold-free). `buildDisplacementSvg`'s `classic` + `shapeAdapt:true` branch renders `ramp · envelope` over a neutral `rgb(128,128,128)` plate via an SVG `mask` (inset+blurred rounded rect = an SDF level set, radial-normal at corners). `shapeAdapt:false` stays byte-for-byte legacy. The design is gated by a numerical Jacobian-injectivity sweep (jest, fast) and confirmed by a browser pixel-Jacobian on the real rasterized map (ground truth).

**Tech Stack:** TypeScript, SVG (static gradients + mask + mix-blend-mode), Jest (jsdom), Rollup, the existing `displacementCache`, the `verify/` HTML harness + `preview_*` tools.

**Spec:** `docs/superpowers/specs/2026-06-20-fold-free-displacement-field-design.md`

---

## File Structure

- **Create** `src/core/displacementField.ts` — pure math: `classicBandFraction()` (production, used by the SVG **and** the fold test), plus `sampleClassicField()` + `jacobianMinDet()` (the canonical field model + the fold metric). One responsibility: the field's math, isolated from SVG-string concerns.
- **Create** `src/__tests__/displacementField.fold.test.ts` — the fold-injectivity sweep (design gate) + `classicBandFraction` unit tests.
- **Modify** `src/core/displacementMap.ts` — split the `classic` branch: `shapeAdapt:true` → new envelope construction (imports `classicBandFraction`); `shapeAdapt:false` → unchanged legacy block. Add `scale?` and `edgeFeather?` to `DisplacementParams`.
- **Modify** `src/__tests__/displacementMap.test.ts` — update the classic structural expectations intentionally (neutral plate + envelope mask), assert legacy unchanged.
- **Modify** `src/index.tsx` — compute `scaleEff`, add it (quantized) to the cache key, pass it into the build call.
- **Modify** `src/web-component/index.ts` — pass `scale` into the build call (`scaleEff = scale`; no aberration there).
- **Modify** `verify/lens.html` — a side-by-side / scale-slider classic before-after for the browser ground-truth check.

> **Convention used throughout:** `scaleEff = scale + dispersion·aberrationIntensity` (the largest of the four chromatic-aberration `feDisplacementMap` nodes). `peakAmp = 0.5` (the classic ramp's peak channel deviation; `R` spans `0→1`).

---

## Task 1: `classicBandFraction` helper

**Files:**
- Create: `src/core/displacementField.ts`
- Test: `src/__tests__/displacementField.fold.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/displacementField.fold.test.ts`:

```ts
import { classicBandFraction } from '../core/displacementField';

describe('classicBandFraction', () => {
  it('grows with scaleEff and shrinks with element size', () => {
    const small = classicBandFraction(160, 300);
    const big = classicBandFraction(480, 300);
    expect(big).toBeGreaterThan(small);
    expect(classicBandFraction(160, 600)).toBeLessThan(classicBandFraction(160, 300));
  });

  it('clamps to [BAND_MIN, BAND_MAX]', () => {
    expect(classicBandFraction(0, 300)).toBeCloseTo(0.06, 5);      // floor
    expect(classicBandFraction(100000, 100)).toBeCloseTo(0.48, 5); // ceiling
  });

  it('coerces non-finite inputs to the floor', () => {
    expect(classicBandFraction(NaN, 300)).toBeCloseTo(0.06, 5);
    expect(classicBandFraction(160, 0)).toBeCloseTo(0.06, 5);
  });

  it('lets edgeFeather override the auto width (clamped to BAND_MAX)', () => {
    expect(classicBandFraction(160, 300, 0.2)).toBeCloseTo(0.2, 5);
    expect(classicBandFraction(160, 300, 0.9)).toBeCloseTo(0.48, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest displacementField.fold -t classicBandFraction`
Expected: FAIL — `Cannot find module '../core/displacementField'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/displacementField.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest displacementField.fold -t classicBandFraction`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add src/core/displacementField.ts src/__tests__/displacementField.fold.test.ts
git commit -m "feat(field): scale-aware envelope band width for fold-free classic"
```

---

## Task 2: Numerical fold metric (the design gate)

**Files:**
- Modify: `src/core/displacementField.ts`
- Test: `src/__tests__/displacementField.fold.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/displacementField.fold.test.ts`:

```ts
import { jacobianMinDet } from '../core/displacementField';

describe('fold metric (Jacobian injectivity sweep)', () => {
  // aspect 1, 3:1, 1:3, 4:1
  const sizes: Array<[number, number]> = [[320, 320], [480, 160], [160, 480], [600, 150]];
  const scales = [160, 320, 480, 640];
  const cases: Array<{ w: number; h: number; r: number; scale: number }> = [];
  for (const [w, h] of sizes) {
    for (const r of [0, 24, 80, Math.min(w, h) / 2]) {
      for (const scale of scales) cases.push({ w, h, r, scale });
    }
  }

  it('the new envelope field stays injective (min-det > 0) across the whole sweep', () => {
    for (const c of cases) {
      const min = jacobianMinDet({ ...c, scaleEff: c.scale, legacy: false }, 64);
      expect({ ...c, min: Number(min.toFixed(4)) }).toMatchObject({ min: expect.any(Number) });
      expect(min).toBeGreaterThan(0);
    }
  });

  it('the legacy field folds somewhere in the same sweep (proves the test has teeth)', () => {
    const mins = cases.map((c) => jacobianMinDet({ ...c, scaleEff: c.scale, legacy: true }, 64));
    expect(Math.min(...mins)).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest displacementField.fold -t "fold metric"`
Expected: FAIL — `jacobianMinDet is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/core/displacementField.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest displacementField.fold -t "fold metric"`
Expected: the **teeth** test PASSES immediately. The **injective** test PASSES if `BAND_K`/`BAND_MAX` are sufficient; if a case fails, that is the calibration signal — see Task 6 "Calibration". For Task 2's green bar, raise `BAND_MAX` toward `0.5` and/or `BAND_K` until all cases pass, then proceed. (Do not weaken the sweep.)

- [ ] **Step 5: Commit**

```bash
git add src/core/displacementField.ts src/__tests__/displacementField.fold.test.ts
git commit -m "test(field): Jacobian-injectivity fold sweep — new field injective, legacy folds"
```

---

## Task 3: Render the envelope field in the `classic` SVG

**Files:**
- Modify: `src/core/displacementMap.ts` (the `classic` tail of `buildDisplacementSvg`, ~lines 226-281 on this branch; `DisplacementParams` interface)
- Test: `src/__tests__/displacementMap.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/displacementMap.test.ts`, **replace** the `it('defaults to classic (linear ramps) ...')` block (currently lines ~104-110) with:

```ts
  it('defaults to classic and renders the fold-free envelope (neutral plate + edge mask)', () => {
    const svg = buildDisplacementSvg(base);
    expect(svg).toContain('linearGradient id="red"');
    expect(svg).toContain('mask id="clsEnv"');             // boundary envelope
    expect(svg).toContain('fill="rgb(128,128,128)"');      // neutral plate, not black
    expect(svg).not.toContain('fill="black"');             // shapeAdapt:true never uses the black plate
    expect(svg).not.toContain('cvxMask');
    expect(svg).not.toContain('shiftMask');
    expect(svg).not.toContain('rimMask');
  });

  it('widens the classic envelope band as scale rises', () => {
    const inset = (svg: string) => Number(/mask id="clsEnv"[^]*?<rect x="([0-9.]+)"/.exec(svg)![1]);
    const lo = buildDisplacementSvg({ ...base, scale: 120 });
    const hi = buildDisplacementSvg({ ...base, scale: 600 });
    expect(inset(hi)).toBeGreaterThan(inset(lo));
  });

  it('keeps shapeAdapt:false byte-for-byte legacy (black plate, no envelope mask)', () => {
    const svg = buildDisplacementSvg({ ...base, shapeAdapt: false });
    expect(svg).toContain('fill="black"');
    expect(svg).not.toContain('clsEnv');
    // unchanged from ≤2.x regardless of the new scale param
    expect(buildDisplacementSvg({ ...base, shapeAdapt: false })).toBe(
      buildDisplacementSvg({ ...base, shapeAdapt: false, scale: 999 })
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest displacementMap -t "classic"`
Expected: FAIL — emitted SVG still has `fill="black"` and no `clsEnv` mask.

- [ ] **Step 3: Implement — split the classic branch**

In `src/core/displacementMap.ts`, add to the `DisplacementParams` interface:

```ts
  /** Effective displacement scale (largest of the aberration nodes); sizes the fold-free edge band. */
  scale?: number;
  /** Override the auto edge-band width as a fraction of the short side (else derived from `scale`). */
  edgeFeather?: number;
```

Add the import at the top:

```ts
import { classicBandFraction } from './displacementField';
```

Then **replace** the current classic tail (from `const defs = shapeAdapt ? adaptedGradients(...) : legacyGradients(angle);` through the final `return \`...\`` of the function) with:

```ts
  const band = `<rect x="${borderWidth}" y="${borderWidth}" width="${newwidth - borderWidth * 2}" height="${newheight - borderWidth * 2}" rx="${effectiveRadius}" fill="hsl(0 0% ${lightness}% / ${alpha})" style="filter:blur(${displace}px)" />`;

  if (shapeAdapt) {
    // Fold-free: window the affine ramp by a boundary-conformant envelope over a NEUTRAL plate, so
    // the field fades to neutral at the rim (no cliff) over a band that widens with displacement.
    const defs = adaptedGradients(newwidth, newheight, angle);
    const minElem = Math.min(width, height);
    const scaleEff = Number.isFinite(p.scale as number) ? (p.scale as number) : 0;
    const bandFrac = classicBandFraction(scaleEff, minElem, p.edgeFeather);
    const minMap = Math.min(newwidth, newheight);
    const W = Math.max(0.5, bandFrac * minMap);
    const innerRx = Math.max(0, effectiveRadius - W);
    const envBlur = Math.max(0.5, W * 0.5);
    const rimSoft = Math.max(0.6, minMap * 0.01); // fine-grain AA, harmless
    return `
      <svg viewBox="0 0 ${newwidth} ${newheight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
${defs}
          <mask id="clsEnv" maskUnits="userSpaceOnUse" x="0" y="0" width="${newwidth}" height="${newheight}">
            <rect x="0" y="0" width="${newwidth}" height="${newheight}" fill="black"/>
            <rect x="${W}" y="${W}" width="${newwidth - W * 2}" height="${newheight - W * 2}" rx="${innerRx}" fill="white" style="filter:blur(${envBlur}px)"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="${newwidth}" height="${newheight}" fill="rgb(128,128,128)"/>
        <g mask="url(#clsEnv)" style="filter:blur(${rimSoft}px)">
          <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#red)" />
          <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#blue)" style="mix-blend-mode: ${blend}" />
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
```

> Note: the non-`classic` `lens !== 'classic'` block above this code is unchanged. Only the classic tail is split.

- [ ] **Step 4: Run the displacement-map tests**

Run: `npx jest displacementMap`
Expected: PASS, including the unchanged `shapeAdapt:false` byte-identity and angle/amplitude tests. If the legacy byte-identity test fails, diff the legacy return block against the pre-change version — it must be character-identical.

- [ ] **Step 5: Commit**

```bash
git add src/core/displacementMap.ts src/__tests__/displacementMap.test.ts
git commit -m "feat(classic): fold-free envelope field over a neutral plate (shapeAdapt only)"
```

---

## Task 4: Thread `scaleEff` through the React component

**Files:**
- Modify: `src/index.tsx` (cache key ~line 624; build call ~lines 628-644)

- [ ] **Step 1: Add `scaleEff` and put it (quantized) in the cache key**

In `src/index.tsx`, inside the `displacementDataUri` `useMemo` (just before `const cacheKey = ...` at ~line 624), add:

```tsx
    // Largest of the four chromatic-aberration feDisplacementMap nodes; sizes the fold-free edge band.
    const scaleEff = config.scale + config.dispersion * config.aberrationIntensity;
    const qScale = Math.round(scaleEff / 8) * 8; // quantize so continuous scale doesn't explode the cache
```

Change the `cacheKey` template to append `|sc:${qScale}` at the end of the string (after `lc:${lcKey}`).

- [ ] **Step 2: Pass `scale: scaleEff` into the build call**

In the `buildDisplacementDataUri({ ... })` call (~line 628), add the property:

```tsx
      scale: scaleEff,
```

(`config` is already a `useMemo` dependency, so `scaleEff` is covered — no dep-array change.)

- [ ] **Step 3: Build to verify types and wiring**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (`scale` is now a known optional field on `DisplacementParams`.)

- [ ] **Step 4: Run the full unit suite**

Run: `npx jest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.tsx
git commit -m "feat(react): thread scaleEff into the displacement map + cache key"
```

---

## Task 5: Thread `scale` through the web component

**Files:**
- Modify: `src/web-component/index.ts` (build call ~line 110-112)

- [ ] **Step 1: Pass `scale` into the build call**

In `src/web-component/index.ts`, the web component has a single `feDisplacementMap` (no chromatic aberration), so `scaleEff = scale`. Change the build object (~line 111) to include `scale`:

```ts
      const uri = buildDisplacementDataUri({
        width, height, divisor: 3, quantStep: 24, radius, border, lightness, alpha, displace, blend: 'difference', angle, shapeAdapt, lens, lensStrength, lensCenter, scale
      });
```

- [ ] **Step 2: Build to verify wiring**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web-component/index.ts
git commit -m "feat(wc): pass scale into the displacement map for the fold-free band"
```

---

## Task 6: Browser ground-truth — pixel Jacobian + calibration (+ conditional corner term)

**Files:**
- Modify: `verify/lens.html`
- Possibly modify: `src/core/displacementMap.ts`, `src/core/displacementField.ts` (constants / corner term)

This is the truth check: the jest fold test grades the design *model*; here we rasterize the **real** emitted SVG, sample its pixels, and confirm both that the SVG matches the model and that the rasterized field is injective.

- [ ] **Step 1: Add a measurable classic before/after to `verify/lens.html`**

Add a panel that renders `LiquidGlass`/the web component as `classic` over a high-frequency checkerboard backdrop, with a `scale` slider (120→640) and a `radius` slider, plus a button that runs the pixel-Jacobian readout below. Use this in-page measurement script (rasterize the map data-URI to a canvas, compute the discrete Jacobian min-det of `p ↦ p + scale·(channel−0.5)`):

```html
<script type="module">
  async function rasterMap(dataUri, n) {
    const img = new Image(); img.src = dataUri;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: n, height: n });
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, n);
    return ctx.getImageData(0, 0, n, n).data; // RGBA
  }
  // F(i,j) = p + scale·(channel-0.5)/dim, det J via central differences; returns min det.
  window.foldMinDet = async (dataUri, scale, w, h, n = 96) => {
    const d = await rasterMap(dataUri, n);
    const R = (i, j) => d[(j * n + i) * 4] / 255 - 0.5;
    const B = (i, j) => d[(j * n + i) * 4 + 2] / 255 - 0.5;
    const Fx = (i, j) => i / n + (scale * R(i, j)) / w;
    const Fy = (i, j) => j / n + (scale * B(i, j)) / h;
    let min = Infinity;
    for (let i = 1; i < n - 1; i++) for (let j = 1; j < n - 1; j++) {
      const det =
        ((Fx(i + 1, j) - Fx(i - 1, j)) * (Fy(i, j + 1) - Fy(i, j - 1)) -
         (Fx(i, j + 1) - Fx(i, j - 1)) * (Fy(i + 1, j) - Fy(i - 1, j))) / 4;
      if (det < min) min = det;
    }
    return min;
  };
</script>
```

- [ ] **Step 2: Serve and drive with the preview tools**

Run the verify server (`node verify/serve.mjs`) via `preview_start`, then `preview_eval` `window.foldMinDet(<classicMapDataUri>, scale, w, h)` at `scale ∈ {160, 320, 480, 640}` for the **new** map and (temporarily forcing `shapeAdapt:false`) the **legacy** map.
Expected: new map min-det `> 0` at every scale; legacy `< 0` at high scale. Capture `preview_screenshot` of the checkerboard through the lens at `scale 480` — the corner arc/tear must be gone (graceful soft edge instead).

- [ ] **Step 3: Calibrate constants if needed**

If any `foldMinDet` comes back `≤ 0`, raise `BAND_K` (then `BAND_MAX`) in `displacementField.ts` and re-run Steps 2 + the jest sweep until both pass. If the look at `scale 160` is too soft (band too wide), lower `BAND_MIN`. Re-run `npx jest displacementField.fold` after every constant change — the jest model and the browser truth must agree in direction.

- [ ] **Step 4: Conditional — add the radial corner term ONLY if a residual corner fold survives**

If, after calibration, the browser pixel-Jacobian still dips `≤ 0` *specifically at the corners* (axis-locked ramp shear), add per-corner affine-radial fields: for each corner quadrant, a `linearGradient` for R about the arc center `x` and one for B about the arc center `y`, masked to that quadrant's band — mirroring `buildConvexInner`'s `linear-x→R + linear-y→B masked by a radial window`. Re-verify Steps 2-3. (Skip entirely if envelope-only already holds `min-det > 0`.)

- [ ] **Step 5: Commit**

```bash
git add verify/lens.html src/core/displacementField.ts src/core/displacementMap.ts
git commit -m "test(verify): browser pixel-Jacobian for classic + calibrate fold-free band"
```

---

## Task 7: Changelog, size budget, finalize

**Files:**
- Modify: `CHANGELOG.md` (if present), `docs/superpowers/specs/2026-06-20-fold-free-displacement-field-design.md` (mark Implemented)

- [ ] **Step 1: Full suite + size budget**

Run: `npx jest && npm run size`
Expected: all tests pass; `size-limit` within budget (the extra mask string is small and cached — confirm no regression beyond a few bytes gzip).

- [ ] **Step 2: Note the change in the changelog**

Add a CHANGELOG entry under the unreleased/next section: "classic refraction is now fold-free by construction — the corner arc/edge tear is gone at any `scale`; `shapeAdapt:false` is unchanged." (Match the file's existing format.)

- [ ] **Step 3: Mark the spec implemented**

In the design spec, change `**Status:** design / approved direction` → `**Status:** implemented`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: changelog + mark fold-free displacement spec implemented"
```

---

## Self-Review (completed)

**Spec coverage:**
- Brief #1 (softening ∝ amplitude, not fixed) → Task 1 `classicBandFraction` (∝ `scaleEff·peakAmp`) + Task 3 render + Task 4/5 threading. ✓
- Brief #2 (curvature-aware corner feather) → subsumed: the envelope's iso-contours are concentric offset rounded-rects (radial-normal at corners) by construction; residual shear handled by Task 6 Step 4. ✓
- Brief #3 (decouple field radius) → partially: `innerRx = effectiveRadius − W` gives the field a gentler corner than the CSS border; full squircle is explicit out-of-scope in the spec. ✓ (bounded)
- Brief #5 (expose edgeFeather) → `edgeFeather` on `DisplacementParams` (internal-only for v1, per the approved decision); auto-derived otherwise. ✓
- Brief #6 (SDF field) → realized as the pure-SVG envelope (SDF level set via inset+blur) + optional radial corner term; canvas avoided per the approved constraint. ✓
- Acceptance gate (Jacobian sweep, new injective + legacy teeth) → Task 2 (jest) + Task 6 (browser truth). ✓
- Out-of-scope (#4 shift, squircle, convex/rim adoption) → not implemented, matching the spec. ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code; the only conditional (Task 6 Step 4) has explicit trigger criteria. ✓

**Type consistency:** `classicBandFraction(scaleEff, minElem, edgeFeather?)`, `sampleClassicField`, `jacobianMinDet`, `FieldOpts`, `DisplacementParams.scale`/`.edgeFeather`, mask id `clsEnv`, plate `rgb(128,128,128)`, `scaleEff = scale + dispersion·aberrationIntensity` — used identically across Tasks 1-7. ✓
