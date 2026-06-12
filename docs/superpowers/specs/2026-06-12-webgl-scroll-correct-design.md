# WebGL scroll-correct glass — design

**Date:** 2026-06-12
**Status:** superseded — WebGL support was removed entirely in 2.0.0 (user decision,
2026-06-13). Phase 1 was implemented and verified on the parked branch
`feat/webgl-scroll-correct`; see that branch for the anchor-tracking work and
the live DOM mirror research if refraction-on-iOS is ever revisited.
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

At **every** capture (libraries like ScrollSmoother apply `transform` lazily, so a one-time
scan can miss), when no anchor is supplied: scan source descendants (depth ≤ 3) for elements
with a non-`none` computed transform **or** `will-change: transform`, whose height exceeds the
viewport **and** whose width is ≥ ⅔ of the source width (excludes parallax heroes and
decorative layers). Multiple candidates → pick the largest by area. None → anchor = source.
Generic detection (no hard-coded library selectors) plus an explicit `backdropAnchor` escape
hatch. If the anchor becomes disconnected, fall back to source for mapping and re-detect at the
next capture.

### 3. Fallback fill

Shader composites every tap over `u_fallback`: `tex.rgb·a + fallback·(1−a)`. Taps outside the
texture return the fallback, with a short smoothstep fade replacing the current edge-clamp
smearing. Fallback color auto-detected at capture time (nearest opaque `background-color`
walking up from the source — same approach as the component's `autoTextColor` logic);
overridable via `snapshotFallbackColor`.

### 4. Scroll-aware re-capture policy (phase 1 — correctness-critical)

On wrapper-mode sites the source box (`<body>`) is often only viewport-height — content scrolls
*virtually* inside it, so any capture covers roughly one viewport of content no matter what.
Re-capturing when scrolling leaves the captured region is therefore a **correctness**
requirement, not an optimization:

- **Coverage trigger:** each frame, `renderLens()` knows the sampled region. When it exits (or
  nears) the texture's coverage, schedule a debounced single-flight re-capture, which re-bases
  per §1. Until it lands, out-of-coverage taps show the §3 fallback.
- **Velocity gate:** while the anchor delta is changing fast (active fling), defer captures —
  html2canvas is main-thread-heavy and mid-fling captures cause jank and land stale.
- **Scroll-idle re-true:** when the anchor delta has changed and then been stable for ~300ms,
  run one re-capture. This self-heals everything a rigid delta can't model (parallax layers,
  sticky sections, fixed backgrounds) and picks up CSS-animation/video changes invisible to the
  MutationObserver.
- **Stale-capture guard:** when a capture completes whose coverage no longer contains the
  currently sampled region, immediately schedule one follow-up (single-flight prevents
  thrashing).
- **Mutation filtering:** the auto-refresh MutationObserver ignores `style`-attribute mutations
  whose target is the anchor element (the scroll library's per-frame transforms).

### 5. Sliding-window snapshot (phase 2 — sharpness)

Capture a band ~3 viewport-heights tall around the current viewport instead of the full source
box (html2canvas `y`/`height` crop). `SnapshotEntry` gains `bandOffsetY`. The §4 triggers stay
unchanged — the band only changes *what* a capture covers, so refraction stays sharp regardless
of page length. Band height clamps so `band × resolution ≤ maxTex` — bands always capture at
full sharpness. Horizontal scrolling uses the same delta math and clamping on the x axis.

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
  §4's coverage trigger is part of phase 1 because wrapper-mode sites capture only ~one
  viewport of content per snapshot regardless of band logic.
- **Phase 2 (sharpness):** §5. Fixes "blurry on long pages". Independently releasable
  (1.5.0, then 1.5.x).

## Known trade-offs

- During a fast fling past the captured region, the lens shows the correctly-colored fallback
  fill until a re-capture lands (~100–400ms, deferred further by the velocity gate). Inherent
  to snapshot-based refraction; no library can read a live backdrop cross-platform.
- Content that moves independently of the anchor (parallax, sticky, fixed backgrounds) is only
  exactly right at capture instants; between scroll-idle re-trues it shifts rigidly with the
  anchor. Acceptable for glass refraction, where the backdrop is heavily distorted anyway.
