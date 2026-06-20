# Fold-free displacement field (SDF-envelope `classic`)

**Status:** design / approved direction
**Date:** 2026-06-20
**Branch:** `feat/refraction-angle`
**Extends / supersedes:** `2026-06-17-liquid-refraction-shape-and-motion-design.md` — replaces that spec's
"Fold guardrail" (cap amplitude + document that high `scale·lensStrength` can duplicate the image) with
**fold-free by construction** for the `classic` lens.

## Problem

The `classic` displacement field (`src/core/displacementMap.ts`) shears the backdrop along the
rounded-rect corner arc, and tears (folds) at the perimeter when `scale` / `lensStrength` is raised.

`feDisplacementMap` samples the backdrop at `p + scale·(channel − 0.5)`. A **fold** is that mapping
going non-injective — wherever `scale · ‖∂field/∂pixel‖ ≳ 1`. Two causes conspire at the boundary:

1. **The field is maximal exactly at the boundary, then cliffs to the opposite extreme outside it.**
   The affine ramp gives `R≈0` at the left edge (`−0.5·scale`) and `R≈255` at the right (`+0.5·scale`);
   outside the rounded rect the plate is `fill="black"` (`R=0,B=0` → `−0.5·scale`). So the rim sees a
   swing up to a full `scale` across the only softening in play — `rimSoft = max(0.6, min(w,h)·0.01)`,
   which is **independent of `scale`**. Raise `scale` and `scale·slope` crosses 1 → tear. (Brief #1.)
2. **The corner contours don't follow the boundary.** The field is `R=ramp(x)`, `B=ramp(y)` hard-clipped
   by a rounded rect; the clip's falloff contours at a corner are the axis-aligned ramp edges, not arcs
   concentric with the boundary, so the field shears tangentially along the quarter-circle. (Brief #2/#6.)

## Approach (chosen)

**A — make the fold-free field the `classic` + `shapeAdapt:true` default** (already the 3.0 default,
unreleased on this branch → no user churn), via a reusable internal `boundaryEnvelope()` helper so
`convex`/`rim` can adopt it later. `shapeAdapt:false` stays byte-for-byte legacy. Pure-SVG only (no
canvas / no DOM) so the generator stays SSR-safe and the data-URI stays cacheable.

Rejected: **B** (opt-in `'edge'` mode — leaves the *default* folding); **C** (unify all three lens
modes now — largest diff, regresses working modes, more than this bug needs). Both are reachable later
from A's helper.

### Mechanism

The displacement field is `field(p) = ramp(p) · envelope(p)`, neutral plate underneath.

1. **Boundary-conformant envelope, width ∝ scale (Brief #1, #3).** Window the affine `classic` ramp by
   an envelope that is `1` in the interior and fades to `0` (neutral) across a boundary band whose
   iso-contours hug the rounded-rect boundary (concentric offset rounded-rects → arcs at the corners).
   This is the `convex` mode's radial-dome trick generalized to the rounded-rect boundary.

   `peakAmp` = the ramp's peak channel deviation from neutral (`0.5` for `classic`: `R` spans `0→1`).
   The boundary displacement is `≈ scaleEff · peakAmp` px; for the field to fall from that to `0`
   without folding, `d(disp)/dpixel ≥ −1`, i.e. the band must satisfy `W_px ≥ scaleEff · peakAmp`. So
   define the band as a **fraction of the short side**, calibrated by the fold test:

   ```
   Wfrac = clamp( k · (scaleEff · peakAmp) / min(elemW, elemH),  Wmin, Wmax )   // k ≥ 1, tuned
   ```

   then `W = Wfrac · min(newwidth, newheight)` in map space. Per-pixel normal slope `≈ peakAmp/W`, so
   `scaleEff·slope ≈ 1/k` is bounded by construction → fold-free at any scale. `edgeFeather` overrides
   `Wfrac` directly. Realized as a `mask`: a white rounded-rect (`rx = effectiveRadius`) inset by `~W`
   and blurred by `~W/2` — its soft alpha contours are the concentric offset rounded-rects (an SDF
   level set), automatically radial-normal at corners.

   **`Wfrac` is bounded (`BAND_MAX = 0.45`) so the inset rounded-rect stays valid** (`min(w,h) − 2W > 0`).
   For extreme `scale × aspect`, a band alone can't absorb the full-amplitude edge displacement without
   exceeding that bound, so a second lever kicks in: **amplitude attenuation.** `classicAmpScale =
   clamp(0,1, W / (k · peakAmp · scaleEff))` (same `k`) pulls the ramp toward neutral *uniformly* just
   enough to stay injective — realized in SVG as a group `opacity` over the neutral plate, leaving the
   gradient encoding untouched. `att = 1` whenever the geometry has room (the common case: square-ish
   elements at default scale keep full refraction strength); `att < 1` only at high `scale` on thin
   elements, where the tradeoff is graceful strength loss instead of a tear. This is the honest
   consequence of "fold-free by design": at some `scale`, an element simply cannot carry full-amplitude
   refraction without folding, so the amplitude — not injectivity — is what yields.

2. **Neutral exterior plate (Brief, root-cause #1).** `fill="black"` → `fill="rgb(128,128,128)"` so the
   rim and everything outside the shape is zero-displacement instead of `−0.5·scale`. Removes the
   residual half-amplitude cliff at the rounded-rect edge.

3. **Conditional radial corner reconstruction (Brief #2/#6).** ONLY if the numerical fold metric still
   shows residual corner shear after (1)+(2): rebuild each corner quadrant's field as affine-radial
   about its arc center (`R` linear in `x−cx`, `B` linear in `y−cy`, centered at the arc center
   `(R,R)`/`(w−R,R)/…`) — the same `linear-x→R + linear-y→B masked by a radial window` primitive the
   `convex` mode already ships. The test decides; not assumed up front.

`W` is **auto-derived** from `scaleEff · peakAmp` and **overridable** via a new `edgeFeather` param
(Brief #5). An optional `cornerSoftness` extra-widening knob covers the tight-corner tangential-fanning
guard (`∝ 1/radius`, Brief #2) if the sweep needs it.

### `scaleEff` and the four-node aberration

The component renders **four** `feDisplacementMap` nodes for chromatic aberration at
`scale`, `scale ± dispersion·aberrationIntensity`. The single shared map must stay fold-free for the
largest, so band-sizing uses:

```
scaleEff = scale + dispersion · aberrationIntensity      // defaults: 160 + 50·0 = 160
```

## API / data flow changes

`DisplacementParams` (`src/core/displacementMap.ts`) gains:

- `scale?: number` — the effective displacement scale used to size the envelope band. Absent → current
  fixed-`rimSoft` behavior (keeps the function usable standalone / back-compatible).
- `edgeFeather?: number` — override band width `W` (normalized, e.g. fraction of `min(w,h)`). Absent →
  auto from `scaleEff · peakAmp`. (Brief #5.)
- `cornerSoftness?: number` — optional extra corner widening; absent → auto.

Consumers must thread `scaleEff` into the build **and the cache key** (quantized, so continuous `scale`
values don't explode the cache):

- React: `src/index.tsx` — add `sc:${quantScale}` to the `cacheKey` (line ~624), pass
  `scale: scaleEff` (+ any `edgeFeather`/`cornerSoftness`) to `buildDisplacementDataUri` (line ~628),
  and add the new deps to the `useMemo` dep array (line ~647).
- Web component: `src/web-component/index.ts` — mirror the same params/key.

No public React prop is *required* (the band auto-derives); `edgeFeather`/`cornerSoftness` MAY be
surfaced as optional props in a follow-up.

## Files

- `src/core/displacementMap.ts` — new `boundaryEnvelope()` helper; rewrite the `classic` +
  `shapeAdapt:true` branch to `ramp · envelope` over a neutral plate; legacy branch untouched.
- `src/index.tsx` — `scaleEff`, cache key, build call, deps.
- `src/web-component/index.ts` — same threading.
- `src/__tests__/displacementMap.fold.test.ts` (new) — numerical fold metric.
- `src/__tests__/displacementMap.test.ts` — assert `shapeAdapt:false` output unchanged; update classic
  expectations intentionally.
- `verify/lens.html` (+ siblings) — before/after at default and high scale.

## Testing / acceptance

**Fold metric (the acceptance gate).** A pure-math model of the field (same formulas the SVG encodes),
sampled on a grid; compute the discrete Jacobian determinant of `p ↦ p + scaleEff·field(p)`; the bar is:

- **min-det > 0 (injective)** for the new field across the sweep
  `scale ∈ [160, 640]` × `radius ∈ [0, 0.5·min(w,h)]` × `aspect ∈ [1, 4]`, AND
- a **teeth** assertion that the *current* field's min-det goes **< 0** somewhere in the same sweep
  (so the test can fail).

**Channel-math verification** (the convex/rim sign + monotonicity bugs were caught this way before): the
`ramp · envelope` blend composition must be verified to keep `R→x`, `B→y` orthogonal and the interior
neutral point at `0.5` before wiring.

**Regression / parity.** Legacy `shapeAdapt:false` output byte-identical (existing snapshot tests pass).
Existing `displacementMap.test.ts` passes or is updated intentionally.

**Visual.** `verify/` harness + preview screenshots, `classic` at `scale` 160 (look preserved) and
≥480 (tear gone, graceful widening), square + wide aspect, a few `radius` values.

## Out of scope (explicit follow-ups)

- **Brief #4 — `shift` smooth-backdrop degeneracy** (pure translation invisible over low-frequency
  backdrops). Separate concern; fix later by blending a faint interior convex term or doc-warning.
- **Brief #3 extended — squircle / superellipse field radius decoupling.** The `boundaryEnvelope()`
  architecture allows it (swap the rounded-rect mask for a superellipse path), but not in v1.
- **`convex` / `rim` adopting `boundaryEnvelope()`** (the C consolidation) — cheap follow-up once the
  helper exists.

## Risks

- Larger data-URI (mask + envelope) → fully cached, negligible per-frame.
- `classic` high-scale *look* changes from "tear" to "wide soft edge" — intended, and `classic` is
  unreleased on this branch.
- Blend composition is fiddly (hence the mandated channel-math + fold tests as gates).
