# Liquid refraction: shape adaptation + directional angle + animated/interactive motion

**Date:** 2026-06-17
**Status:** approved — building
**Package:** `simple-liquid-glass` → **3.0.0** (major: default visual change on non-square elements)
**Extends / supersedes:** `2026-06-17-refraction-angle-design.md` (folds in that spec's review fixes)

## Summary

Three layered capabilities, built together:

1. **Directional refraction** — `angle` (degrees), shape-adapted so the lean is *faithful on any aspect ratio* (a 45° reads as 45° on a wide navbar, not a flattened ~18°).
2. **Shape adaptation (default ON)** — the lens reads like glass *cut to the element's shape*: faithful angle + isotropic refraction (equal lensing strength on both axes). This changes how existing **non-square** lenses look even at `angle: 0` → hence the major version. `shapeAdapt={false}` restores the legacy map byte-for-byte.
3. **Real animated refraction** — GPU-driven liquid motion presets (`ripple | flow | wobble`) plus pointer interaction (`liquidTrigger`, `followPointer`) on `LiquidGlassInteractive`. The backdrop genuinely warps; this is not a compositor overlay trick.

## API surface

### `LiquidGlass` (base) — static + autoplay motion
| prop | type | default | meaning |
|---|---|---|---|
| `angle` | `number` | `0` | refraction direction in degrees; `0` = baseline; positive = clockwise (SVG y-down). In-plane rotation of the lean, not light-incidence. For `lens: 'shift'` it is the offset direction. |
| `shapeAdapt` | `boolean` | `true` | aspect-faithful + isotropic refraction. `false` = legacy non-adapted map (byte-identical to ≤2.x). |
| `lens` | `'classic' \| 'convex' \| 'shift' \| 'rim'` | `'classic'` | lens field shape (see Lens modes below). |
| `lensStrength` | `number` | `1` | manual magnitude of the lens field; `0` disables it. |
| `lensCenter` | `[number, number]` | `[0.5, 0.5]` | normalized center for `convex` / `rim`. |
| `liquid` | `'ripple' \| 'flow' \| 'wobble' \| false` | `false` | real animated refraction preset (opt-in, GPU-real). |
| `liquidSpeed` | `number` | `1` | motion rate multiplier. |
| `liquidScale` | `number` | preset | distortion amplitude (px of displacement). |

### `LiquidGlassInteractive` — adds pointer reactivity (already owns pointer tracking)
| prop | type | default | meaning |
|---|---|---|---|
| `liquidTrigger` | `'always' \| 'hover' \| 'press'` | `'always'` | when the liquid animates; `hover`/`press` are idle (zero cost) until interaction. |
| `followPointer` | `boolean` | `false` | a refractive bump that distorts toward the cursor (eased). |

## Mechanism

### Shape-adapted directional map — FREE (`src/core/displacementMap.ts`)
The cost-free half. Lives entirely in the baked displacement map; the GPU filter graph is unchanged.

- **Gradients move to `gradientUnits="userSpaceOnUse"`** in the aspect-preserving viewBox pixel space.
- **Faithful angle:** `gradientTransform="rotate(angle cx cy)"` about the pixel center → a true on-screen angle on any aspect ratio (rotation happens in real pixel space, not the normalized unit square).
- **Isotropic refraction:** each ramp's amplitude is scaled so the per-pixel displacement *slope* matches on both axes — the long axis keeps full amplitude, the short axis is scaled by `shortExtent / longestExtent`. This removes the over-bending on the short axis of a wide/tall element.
- **`normalizeAngle(angle)`**: non-finite → 0; wrap to `[0,360)`; round to 3 decimals. Used for both the SVG and the React cache key, so `360`/`NaN`/`45.0000001` collapse correctly and never spawn duplicate-look cache entries.
- `shapeAdapt:false` emits the **legacy** gradients (objectBoundingBox), byte-identical to ≤2.x, with an optional `rotate(angle 0.5 0.5)` for `angle`.

### Lens field modes — FREE (`src/core/displacementMap.ts`)
Each mode encodes a different displacement field into the R/B channels (R→x, B→y; displacement =
`scale·(channel−0.5)`). All are static-SVG only (gradients, radialGradient, mask, mix-blend-mode,
blur) — no new filter primitives, so they cost nothing at runtime. Derived + adversarially
channel-math-verified before implementation (the convex sign and rim fold/monotonicity bugs were
caught and corrected in that pass).
- **classic** — the historical linear radial ramps (shape-adapted). Reads as a split/mirror at high `scale`.
- **convex** — inward ramps (converging → magnify) windowed by a radial dome mask that fades the
  field to neutral at the rim, so the pane reads as ONE coherent lens. Fold-safe: `CONVEX_AMP=0.3`,
  reach `0.66·min(w,h)`.
- **shift** — a uniform fill `rgb(0.5±off·cosθ, _, 0.5±off·sinθ)` soft-feathered to neutral at the
  edge → rigid translation, fold-free interior. `angle` = direction.
- **rim** — signed 3-stop ramps (anchored at neutral on the lens axis) confined by a soft radial
  mask whose feather widens with strength; channels separated by `screen` over a black plate, over a
  neutral plate. Clear flat center, refraction only at the perimeter band (`rimReach=0.4·min(w,h)`).
- Fold guardrail: the lens amplitudes are capped so the field stays monotonic at the default `scale`
  (≈160); cranking `lensStrength` × `scale` past the fold threshold can duplicate the image (documented).

### Real animated refraction — GPU-REAL, gated (`src/core/liquid.ts` + React/WC wiring)
- Adds an animated `feTurbulence` → `feDisplacementMap` stage to the **live inline Chromium filter** (same primitive the iOS/Safari mirror already uses). No per-frame data-URI regeneration.
- Presets (pure param map in `liquid.ts`): **ripple** (fine isotropic boil), **flow** (anisotropic drift; direction follows `angle`), **wobble** (low-frequency, high-amplitude, slow).
- A `requestAnimationFrame` driver updates the live turbulence node's `baseFrequency`/offset. **Gated:** runs only while visible (existing `IntersectionObserver`), paused on `prefers-reduced-motion`, Chromium-only, amplitude capped on mobile/low quality. Idle when `liquid` is unset.

### Interaction (`src/interactive/index.tsx`)
- `liquidTrigger: hover|press` ramps the displacement `scale` on the live filter via rAF easing (no cost when idle).
- `followPointer`: a refractive bump element tracks the cursor (moved via compositor `transform`, eased), distorting the backdrop beneath it.

## Components / data flow
1. `src/core/displacementMap.ts` — `angle`, `shapeAdapt`, `normalizeAngle` (exported). [done first, TDD]
2. `src/core/liquid.ts` (new) — preset → turbulence params + per-frame attribute helpers. Pure, tested.
3. `src/index.tsx` — new props on the **interface (lines 25-62)** and the **inline `config` type (265-282)**; add the turbulence stage to the inline filter; rAF driver gated on visibility/reduced-motion; cache key `+= |ang:${normalizeAngle}|sa:${shapeAdapt}|lq:${liquid}`.
4. `src/web-component/index.ts` — `angle`, `liquid`, `liquid-speed`, `liquid-scale`, `shape-adapt` attributes (+ `observedAttributes`); rAF driver.
5. `src/interactive/index.tsx` — `liquidTrigger`, `followPointer`.
6. Types — `src/index.d.ts` (hand-written; manual add) + `src/interactive/index.d.ts` (inherits via `extends LiquidGlassProps`) + web-component types.
7. Tests — `displacementMap.test.ts` (faithful angle, isotropic amplitude, normalize, both gradients, square@0 ≈ legacy, `shapeAdapt:false` identical) + `liquid.test.ts`.
8. Docs — README prop table, framework guides (vue/svelte/astro/vanilla), Storybook argTypes+args, examples landing.

## Backward compatibility / versioning
- **3.0.0.** Shape adaptation ON by default changes non-square visuals at `angle:0`. Square elements at `angle:0` are visually unchanged. `angle`/`liquid`/interaction are additive.
- **Escape hatch:** `shapeAdapt={false}` → legacy map, byte-identical to 2.x.

## Cost contract
- **Free:** shape adaptation + `angle` (baked into the existing map; identical GPU graph).
- **GPU-real, gated:** `liquid` presets + `followPointer`. `liquidTrigger: hover|press` cost nothing until interaction.

## Caveats (folded from the prior review)
- `angle` is exact only at 0° (identity) and 180° (negation); 90°/270° are a transpose; in-between is an artistic lean. Aspect adaptation makes the lean's *direction* faithful, not the displacement a pure vector rotation.
- Liquid motion is the Chromium SVG-backdrop path only; fallback engines keep the (turbulence-based) mirror unchanged — optionally drive its motion in a later pass.
- Non-cardinal angles can clamp box corners (pad spread); mitigated by the rotation living in aspect-true space and tuned visually.
