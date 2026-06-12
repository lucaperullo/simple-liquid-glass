# WebGL scroll-correct glass — design

**Date:** 2026-06-12
**Status:** approved
**Scope:** `src/webglRenderer.ts`, `src/index.tsx`, stories, README

## Problem

The WebGL mode refracts a static html2canvas snapshot. On fixed navbars/cards over scrolling
content it breaks three ways:

1. **Transform-based scrolling** (Lenis wrapper mode, Locomotive, GSAP ScrollSmoother) moves
   content via a `transform` on a wrapper inside the snapshot source. The source's rect never
   moves, so `renderLens()` samples the same texture region forever, and each re-capture bakes
   a different scroll offset into the texture.
2. **Transparent/uncaptured pixels render black.** html2canvas runs with `backgroundColor: null`
   and the shader ignores alpha; missing data shows as pure black (the "scrolling backwards
   makes a black bg" report).
3. **Scroll libraries fight the auto-refresh.** Per-frame style mutations from the scroll
   library trigger debounced re-snapshots at every scroll stop.

A fourth, quieter limit: the whole page is squeezed into one GPU texture (typically ≤4096px),
so long pages refract blurrily.

Native scrolling (including Lenis default mode, which animates real `scrollTop`) already maps
correctly per frame via `getBoundingClientRect()`; that behavior must not regress.

## Design

### 1. Coordinate model

At capture time, `SnapshotEntry` additionally records:

- `capturedSrcRect` — source bounding rect when html2canvas ran
- `capturedAnchorRect` — same for the **anchor** (the element that moves with content)
- `anchorEl` — the anchor element

Per frame:

```
anchorDelta = anchorRectNow − capturedAnchorRect
samplePos   = (paneRect − capturedSrcRect) − anchorDelta     // in snapshot px
```

When `anchorEl === source` this reduces to the current formula (native scroll unchanged).
Re-captures re-base their own rects, so a capture taken mid- or post-scroll is correct by
construction.

### 2. Anchor detection

At capture time, when no anchor is supplied: scan source descendants (depth ≤ 3) for the first
element with a non-`none` computed transform whose height exceeds the viewport. Found → anchor;
not found → anchor = source. Generic detection (no hard-coded library selectors) plus an
explicit `backdropAnchor` escape hatch. If the anchor becomes disconnected, fall back to source
for mapping and re-detect at the next capture.

### 3. Fallback fill

Shader composites every tap over `u_fallback`: `tex.rgb·a + fallback·(1−a)`. Taps outside the
texture return the fallback, with a short smoothstep fade replacing the current edge-clamp
smearing. Fallback color auto-detected at capture time (nearest opaque `background-color`
walking up from the source — same approach as the component's `autoTextColor` logic);
overridable via `snapshotFallbackColor`.

### 4. Mutation filtering

The auto-refresh MutationObserver ignores `style`-attribute mutations whose target is the
anchor element. Optimization only — correctness no longer depends on when captures happen
(§1) — but it stops html2canvas re-runs at every scroll stop.

### 5. Sliding-window snapshot (phase 2)

Capture a band ~3 viewport-heights tall around the current viewport instead of the full page
(html2canvas `y`/`height` crop). `SnapshotEntry` gains `bandOffsetY`. `renderLens()` already
computes the sampled region; when it drifts within half a viewport of the band edge, schedule a
debounced (~80ms) single-flight re-capture, which re-bases per §1. Until it lands, out-of-band
taps show the §3 fallback. Band height clamps so `band × resolution ≤ maxTex` — bands always
capture at full sharpness.

### 6. Public API

- `backdropAnchor?: HTMLElement` — component prop → `WebGLGlassOptions.anchor`
- `snapshotFallbackColor?: string` — component prop → `WebGLGlassOptions.fallbackColor`
- No new dependencies. README gains a "Smooth-scroll libraries" section: Lenis default mode
  works out of the box; wrapper-mode auto-detected; `backdropAnchor` is the explicit override.

### 7. Error handling

- Anchor detection failure → source anchor (today's behavior).
- html2canvas failure during a band re-capture → keep the previous texture + fallback fill.
- Anchor removed from DOM → `isConnected` guard per frame, source fallback, re-detect next capture.

### 8. Testing

- First jest tests in the repo, for pure extracted functions: `computeSampleRect` mapping math,
  band placement/clamping, CSS color parsing.
- New Storybook story simulating transform scrolling (rAF-driven `translateY` wrapper + fixed
  glass navbar). Manual/preview verification: content tracks during scroll; scroll-back shows
  the background color, not black; band re-capture hands off seamlessly.

## Phasing

- **Phase 1 (correctness):** §1–§4 + tests + story. Fixes "broken on smooth-scroll navbars".
- **Phase 2 (sharpness):** §5. Fixes "blurry on long pages". Independently releasable
  (1.5.0, then 1.5.x).

## Known trade-off

During a very fast fling past the captured band, the lens shows the correctly-colored fallback
fill for the ~100–400ms an html2canvas re-capture takes. Inherent to snapshot-based refraction;
no library can read a live backdrop cross-platform.
