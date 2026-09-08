## 5.1.0

- Add typed `lensOptions` overrides for strength, depth, curvature, edge bend, sheen, specular, glow, and brightness.
- Export lens profiles, ranges, and a resolver for settings panels.
- Preserve profile defaults and explicit pixel-displacement precedence; cache maps by effective geometry.
- Clamp finite overrides and ignore invalid numeric values.

# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## 5.0.0 — 2026-09-08

- Bundle budgets updated to 15/16/15/6 KB (core/interactive/mirror/web component) to retain the 4.1 optics alongside the new lens.

### Breaking default appearance

- React glass defaults to the rounded player profile with 80px base displacement.
- Add material/loupe/player/track profiles and the CSS-pixel displacementScale override.
- Retain 4.1 directional, lens-shape, and animated refraction props; explicit legacy optical controls select their compatible renderer.
- Preserve 4.1 web-component features. Add MIT notices for the adapted native lens generator and filter.
- Remove experimental GPU/video renderers and demos from the release.


### Safari lens optics

- Safari/iOS now bypasses the broken native SVG mirror with masked CSS rim magnification. This approximation preserves clear centers; high-contrast edges may blend. Firefox retains SVG displacement.
- Preserve backdrop root computed styling before namespacing cloned IDs.

- Replaced noise-based mirror distortion and whole-copy blur with a bounded-resolution, cached rounded-rectangle displacement field. The center remains clear, the rim bends inward, and strength is capped by geometry.
- Fixed doubled translation on mirrored backgrounds and tracking-frame cleanup. Added scrolling and six-panel animation regressions.
- Added an isolated Safari device test page. Increased core/interactive Brotli budgets to 9/10 kB to account for the new optics; mirror/web-component budgets remain unchanged.

### Fixed

- React 16.8/17 no longer calls the unavailable `useId` hook. Legacy IDs are assigned after mount and shared across bundled entry points.
- Server rendering and hydration now use stable text selectors and defer browser-specific markup until mount.
- Web-component imports are safe without a DOM; custom tag registration works; border colors are assigned through CSS rather than interpolated HTML.
- `effectMode="off"` removes backdrop filters; `blur` disables the mirror. Missing ResizeObserver falls back to window resize events.
- Mirror clones isolate IDs and interaction, preserve local SVG references, coalesce mutations, observe size changes, and clean up scheduled work. Invalid or nested backdrop sources fall back safely.
- Interactive glass preserves the initial caller transform and responds to reduced-motion changes.

### Changed

- Extracted background processing, geometry, text color, quality selection, and SVG rendering into focused modules.
- Public declarations are generated from source; React bundles include a client-component directive.
- Added component, browser, published-type, and React-version compatibility checks to CI. Dependency installs use a committed lockfile.
- Corrected documentation and bundle measurement labels; budgets remain unchanged. Updated compatible development dependencies to clear reported advisories.

## 2.4.0 — 2026-06-15

### Added

- **Real refraction on Safari / iOS / Firefox — now built into the core `<LiquidGlass>`.** The
  live-DOM-mirror that shipped in 2.3.0 as the opt-in `/mirror` export now lives in the core
  component: on the fallback engines, give `<LiquidGlass>` the element behind the lens
  (`backdropRef`/`backdropSelector`) and it refracts a live, displaced **clone** of it (true
  distortion) instead of just blurring — no separate import. New core props: `mirror` (default
  true), `backdropRef`, `backdropSelector`, `mirrorScale` (default 26), `track` (re-align for a
  moving/dragged lens). Off-screen-paused; the filter is applied to a lens-sized element and the
  re-align is throttled to ~30fps to keep iOS smooth. Engine extracted to a shared
  `core/mirrorEngine`. (Core grows 6.6 → ~7.5 KB gzip to include this.)

### Changed

- **`simple-liquid-glass/mirror` is now a thin back-compat wrapper.** `LiquidGlassMirror` just
  forwards to `<LiquidGlass>` (with `force` flipping it onto the fallback path for testing/demo).
  Existing `import { LiquidGlassMirror } from 'simple-liquid-glass/mirror'` keeps working; prefer
  importing `<LiquidGlass>` directly.

### Fixed

- **The backdrop is required, never auto-detected.** A zero-config auto-detect attempt (walk up to
  the nearest background-ish ancestor) **crashed iOS Safari** — the detected ancestor contains the
  lens, so it cloned a page-sized subtree every mutation (memory exhaustion) and re-triggered its
  own `MutationObserver` into a clone loop. The engine now hard-degrades to blur when the source is
  missing or is an ancestor of the lens. Point `backdropRef` at a **sibling/background** element.

## 2.3.0 — 2026-06-14

### Added

- **`simple-liquid-glass/interactive`** — opt-in subpath export with pointer-reactive
  elasticity (a tiny zero-dep rAF spring leans the glass toward the cursor) and a
  pointer-tracked specular highlight. Exposes `<LiquidGlassInteractive>` and the
  `usePointerElastic(ref, options)` hook. Honors `prefers-reduced-motion`. The core
  `import { LiquidGlass } from 'simple-liquid-glass'` is unchanged (still ~6.5 KB); the
  interactive bundle is self-contained (~7.5 KB gzip, under its 9 KB budget).
- **`simple-liquid-glass/web-component`** — a framework-agnostic `<liquid-glass>` custom
  element for vanilla JS / Vue / Svelte / Angular / Astro / plain HTML. Same refraction
  (Chromium) + frosted fallback (Safari/Firefox/iOS) as the React component, sharing the new
  canonical `core/displacementMap` generator. ~2.7 KB gzip, zero React.
- **`core/displacementMap`** — the displacement-map generator extracted into a pure,
  framework-agnostic, unit-tested module now shared by the React component and the web
  component (single source of truth).
- **`simple-liquid-glass/mirror`** — REAL refraction on Safari / iOS / Firefox, not just blur.
  Those engines can't run SVG filters in `backdrop-filter`, but they can in a regular element
  `filter`, so `<LiquidGlassMirror backdropRef={…}>` renders a live, displaced **clone** of the
  content behind the lens (true distortion). Opt-in subpath (~7.7 KB gzip; core unchanged),
  gated to the fallback engines, off-screen-paused, and degrades to blur when no backdrop
  source is given. **Validated on a real iPhone** (drag the lens to see the distortion). Supports
  `backdropRef`/`backdropSelector` (the element behind the lens), `mirrorScale`, and `track`
  (continuous re-align for a moving/dragged lens). The filter is applied to a lens-sized element +
  the re-align is throttled to ~30fps to keep iOS smooth. (Folded into the core `<LiquidGlass>` in
  v2.4.0 — see below.)

### Improved

- **Frosted CSS fallback (Safari/Firefox/iOS).** Redesigned to read as real, transparent
  frosted glass instead of a milky plastic rectangle: a blur frost floor on the centre (it was
  unblurred at the default `blur=0`), a top-lit gradient sheen, a bright specular rim, and a soft
  depth shadow — and the white-tint/brightness wash + the clunky masked "edge band" were both
  removed. Gated to the fallback path; the Chromium SVG path is unchanged. (Note: this path can
  only blur — true distortion on those engines needs `simple-liquid-glass/mirror` above.)
- **Multi-instance performance.** Off-screen instances now drop their `backdrop-filter`
  via an `IntersectionObserver` (200px margin, no pop-in), so a page with many glass cards
  only pays GPU cost for the ones in view (e.g. 60/100 disabled on a typical scroll).
  Defaults to visible for SSR / first paint / no-IntersectionObserver.

## 2.2.0 — 2026-06-14

Performance hardening. No public API changes; behavior-preserving. Core bundle ~6.5 KB gzip.

### Added

- **CI bundle-size budget** via `size-limit` (`npm run size`) and a GitHub Actions workflow. The core entry (`import { LiquidGlass }`) is capped at 7 KB gzip and fails CI if exceeded.
- **`LiquidGlassHandle.getQuality()`** — read the currently resolved rendering quality via `ref` (reflects `autodetectquality`). Additive; the existing `element` member is unchanged.

### Improved (performance)

- **Displacement-map cache is now a bounded LRU (64 entries).** Previously an unbounded module-level `Map` that gained a permanent entry for every distinct size/param combination — a slow memory leak on long-lived SPAs.
- **`autoTextColor` listeners are now passive and coalesced to one update per animation frame.** Previously a synchronous, non-passive, capture-phase `scroll` handler ran a DOM walk + luminance computation on every scroll event — a real source of scroll jank.
- **`autoTextColor` uses a single `MutationObserver`** watching `<body>` + the nearest opaque ancestor, re-pointed when it changes — instead of one observer per ancestor up the whole tree.
- **`will-change` is dynamic.** It defaults to `auto` and is promoted to `backdrop-filter, filter` only transiently while resizing. Previously it was set permanently on every instance, pinning a GPU compositor layer for each glass element on the page.
- **Faster device auto-detection (`autodetectquality`).** Skips the micro-benchmark for clearly low-end devices, runs the benchmark (now ~12 ms, was ~50 ms) inside `requestIdleCallback`, and caches the result to `localStorage` + `sessionStorage`. Previously a blocking ~50 ms main-thread loop cached only to `sessionStorage` — a first-paint stall. The resolved tier is unchanged from the previous logic.

### Internal

- Extracted two pure, unit-tested modules: `displacementCache.ts` (LRU) and `quality.ts` (tier resolution). Added 15 unit tests (20 total).
- `LiquidGlassProps` and `LiquidGlassHandle` are unchanged.

## 2.1.0 — 2026-06-13

### Added

- **React 19 support.** `peerDependencies` widened to `^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0`.

## 2.0.0 — 2026-06-13

### Removed (breaking)

- **WebGL refraction support.** Removed `effectMode="webgl"`, the framework-free `createWebGLGlass` export, the `getSnapshot` prop, the `WebGLGlassOptions` / `WebGLGlassInstance` types, and `LiquidGlassHandle.refresh()`. The auto-loaded html2canvas snapshot dependency is gone.

### Changed

- `effectMode` no longer accepts `'webgl'` — it is now `'auto' | 'svg' | 'blur' | 'off'`. The Chromium SVG-in-`backdrop-filter` path and the layered CSS fallback (masked edge ring + specular highlight) remain. `LiquidGlassHandle` now exposes only `element`.

## 1.4.1 — 2026-06-12

### Fixed

- WebGL: `background-image` with `cover`/`contain`/`fixed` on the snapshot source (e.g. hero images, Storybook's backgrounds addon) is now composited with correct geometry — html2canvas cannot rasterize these and produced a misaligned image with white bands.
- WebGL: removed ghost background layer under the canvas (glass tint is rendered by the shader).
- WebGL: snapshot auto-refreshes when page content changes (debounced MutationObserver + resize handler, `autoRefresh` option), preventing stale backgrounds.

## 1.4.0 — 2026-06-12

### Added

- **`effectMode="webgl"`** — true liquid-glass refraction on every WebGL-capable browser, including iOS Safari and Firefox (where SVG `backdrop-filter` is unsupported, WebKit bug 245510). Fragment-shader rendering of rounded-rect displacement, chromatic aberration, blur, saturation, frost tint and specular rim over a page snapshot.
- **Shared rendering architecture** — all WebGL panes share one WebGL context and one page snapshot per source; per-pane 2D canvases preserve normal DOM stacking/positioning semantics. Many panes scale without hitting browser context caps.
- **Auto-loading snapshot library** — html2canvas is loaded from cdnjs on first use when missing (opt out via `createWebGLGlass`'s `autoLoadSnapshotLib: false` or by passing `getSnapshot`).
- **Ref API** — `LiquidGlassHandle` exposed via `ref`: `refresh()` re-captures the background snapshot; `element` exposes the root container.
- **`getSnapshot` prop** — custom background snapshot provider for WebGL mode.
- **Layered CSS fallback** — on engines without SVG backdrop-filter support, a masked edge-refraction ring with stronger blur/brightness plus specular highlights replaces the old flat-blur fallback.
- Framework-free export: `createWebGLGlass(options)` for non-React usage.

### Fixed

- SVG filter path is now gated on actual engine support (Chromium) instead of iOS-only checks — Firefox previously rendered a silently broken filter.

### Changed

- `effectMode` accepts `'webgl'`.

### Unreleased — native optics refinement

- Add opt-in `refraction="lens"` to React components, using a cached convex lens field with neutral optical center and bounded strength/color separation.
- Skip redundant RGB displacement passes when dispersion is zero and omit zero-radius SVG blur.
- Include exact geometry in gradient-map cache keys to prevent different aspect ratios sharing an incorrect map.
- Classic optics remain available; no new native iOS refraction support.

- Fix oversized legacy refraction by clamping native strength to control dimensions; high existing scale values now render more gently. Set explicit filter/map bounds and neutral sampling padding to prevent distorted edge sampling.

- Replace the opt-in rounded native approximation with the licensed upstream generator and material filter; preserve component props via a documented parameter adapter. Package the MIT notice.

- React glass now defaults to the player lens profile with 80px displacement at scale 160; scale 0 disables it and 320 doubles it.
