# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

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
