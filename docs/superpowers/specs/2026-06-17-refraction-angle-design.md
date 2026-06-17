# Refraction direction (`angle` prop) — design

**Date:** 2026-06-17
**Status:** approved (pending spec review)
**Package:** `simple-liquid-glass` (v2.4.0 → next minor)

## Problem

The lens refracts the backdrop along a fixed geometry baked into the displacement
map. There is no way to point the refraction in a chosen direction — e.g. for a
navbar where a designer wants the light to lean a particular way. Today the only
related knob is `scale` (negative inverts the bend), which is not a direction.

## Goal

Add a single, simple control that gives **freedom** (any direction) with a
**simple value** (one number): `angle` in degrees. `angle: 0` reproduces the
current look exactly. Other values rotate the refraction lean.

Non-goals (explicitly out of scope for this change):

- Keyword values (`'horizontal'` etc.) — numeric degrees only.
- Mathematically pure vector rotation (see "Caveats").
- Applying direction to the iOS/Safari mirror fallback (see "Caveats").

## How refraction is produced today

`buildDisplacementSvg` (`src/core/displacementMap.ts`) bakes two CSS linear
gradients into an SVG used as the `feImage` of the refraction filter:

- `red` gradient — **horizontal** ramp (`x1=100% … x2=0%`).
- `blue` gradient — **vertical** ramp (`y1=0% … y2=100%`).

The React component and web component both feed that map to
`feDisplacementMap` with `xChannelSelector="R"`, `yChannelSelector="B"`
(`src/index.tsx`, `src/web-component/index.ts`). So **Red drives horizontal
displacement, Blue drives vertical displacement** — that mapping is fixed and is
the constraint this feature works within.

## Design

### API

A new optional prop / attribute:

- React (`LiquidGlassProps`): `angle?: number` — degrees, default `0`.
- Web component (`<liquid-glass>`): `angle` attribute (number), default `0`.
- `LiquidGlassInteractive` inherits `LiquidGlassProps`, so it receives `angle`
  with **no code change**.

`angle: 0` (or omitted) must produce byte-for-byte identical output to today, so
existing snapshots, caches, and visual behavior are unchanged.

### Mechanism

When `angle !== 0`, add `gradientTransform="rotate(${angle} 0.5 0.5)"` to **both**
the `red` and `blue` `linearGradient` elements. Both gradients use
`objectBoundingBox` units (percentage coords), so `0.5 0.5` is the box center.
Rotating both by the same angle keeps them 90° apart in unit space, so the
surface still reads as glass — the bright refraction crescents lean toward the
chosen angle.

When `angle === 0`, emit **no** `gradientTransform` attribute at all, guaranteeing
identical output to the current implementation.

The `feDisplacementMap` channel selectors stay `R`/`B`. Nothing in the filter
graph changes; the rotation lives entirely in the baked map.

### Components / data flow

1. `src/core/displacementMap.ts`
   - Add `angle?: number` to `DisplacementParams`.
   - In `buildDisplacementSvg`, compute a transform attribute string
     (`''` when angle is falsy/0, else `gradientTransform="rotate(${angle} 0.5 0.5)"`)
     and apply it to both `linearGradient` tags.

2. `src/index.tsx` (React)
   - Add `angle = 0` to props + the `config` object.
   - Pass `angle` to `buildDisplacementDataUri`.
   - Add `angle` to the displacement memo **cache key** (so two lenses at
     different angles never collide).

3. `src/web-component/index.ts`
   - Add `'angle'` to `observedAttributes`.
   - Read `const angle = attrNum(this, 'angle', 0)` and pass to
     `buildDisplacementDataUri`.

4. `src/index.d.ts`
   - Add the `angle` doc block + type to the hand-written declarations.

### Testing

Extend `src/__tests__/displacementMap.test.ts`:

- `buildDisplacementSvg({ ...params, angle: 45 })` contains
  `gradientTransform="rotate(45 0.5 0.5)"` (applied to both gradients).
- `buildDisplacementSvg(params)` and `{ ...params, angle: 0 }` contain **no**
  `gradientTransform` (backward-compat guarantee).
- `buildDisplacementDataUri({ ...params, angle: 90 })` round-trips the transform
  through URI encode/decode.

Manual verification: a Storybook `angle` control (or the preview) to confirm the
lean is visually correct on a wide navbar-shaped element across a few angles
(0 / 45 / 90 / 180).

## Caveats (documented, intentional)

1. **Lean, not pure rotation.** Because `R`→x / `B`→y is rigid, rotating the
   ramps rotates the *magnitude pattern*, not the displacement *vectors*. The
   result is an exact rotation at 0/90/180/270° and an artistic lean in between.
   This is the standard, cheap trick and reads well for a glass effect. A
   mathematically pure rotation would require baking cos/sin mixing into the R/B
   channels (more SVG math + GPU cost) and is deferred as a possible follow-up.

2. **Aspect skew.** `objectBoundingBox` rotation happens in the normalized unit
   square, then stretches to the element's aspect ratio. On a wide navbar a
   "45°" is visually skewed by the aspect ratio. Consistent with the existing
   approximation (the current map is already aspect-dependent) and acceptable for
   a visual control.

3. **Chromium path only.** `angle` affects the SVG-in-`backdrop-filter`
   refraction (Chromium). The iOS/Safari/Firefox mirror fallback uses
   `feTurbulence` noise, a different mechanism, and is unchanged.

## Backward compatibility

Fully additive. Default `angle: 0` emits no transform → identical output, caches,
and snapshots. No existing prop changes.
