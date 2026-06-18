# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## What's new — highlights

A quick tour of the big moments (newest first). Full per-version detail follows below.

- **3.1.0 — Water ripples & polish.** Click ripples (`clickRipple: 'ripple' | 'drop'`) on
  `LiquidGlassInteractive`, a smoother pointer bump, `specular` now opt-in, and a sharper-by-default
  base refraction (clean edges at the same cost). Plus LLM onboarding (`llms.txt` + a Claude skill).
- **3.0.0 — Shape & motion.** Refraction that *adapts to the element's shape*, a directional `angle`,
  four lens modes (`classic` / `convex` / `shift` / `rim`), real animated **liquid** refraction
  (`ripple` / `flow` / `wobble`), and pointer interaction on `LiquidGlassInteractive` (follow-pointer
  bump, hover/press triggers).
- **2.3.0 – 2.4.0 — Real refraction everywhere.** True refraction on **Safari / iOS / Firefox** via a
  live displaced DOM clone (not just a blur) — folded into the core `<LiquidGlass>` — plus an opt-in
  pointer-reactive `/interactive` build and a framework-agnostic `<liquid-glass>` **web component**
  for Vue / Svelte / Astro / vanilla.
- **2.0.0 – 2.2.0 — Lean & fast.** Dropped the heavy WebGL + html2canvas path, added **React 19**
  support, and hardened performance (bounded LRU map cache, passive/coalesced listeners, dynamic
  `will-change`, faster device auto-detect) behind a CI bundle-size budget.
- **1.3.0 – 1.4.x — Quality tiers & the WebGL era.** Quality presets + device auto-detection,
  mobile/`effectMode` fallbacks, and a (later-removed) WebGL refraction path for iOS/Firefox.
- **1.2.x — Foundations.** The SVG-displacement core: `saturation` + chromatic aberration, automatic
  text color, `glassColor` / `background` props, iOS blur fallbacks, and the radius/blur fixes that
  made it solid.

## 3.1.0 — 2026-06-18

### Added

- **Click ripples on `LiquidGlassInteractive` (`clickRipple`, `rippleIntensity`).** Each click sends a
  real water-like ripple from the click point — `clickRipple="ripple"` (a single wave) or `"drop"`
  (a splash + concentric waves). Compositor-driven and spawned imperatively, so it stays lag-free even
  under rapid clicking; pauses on `prefers-reduced-motion`.
- **LLM / agent onboarding.** A paste-anywhere [`llms.txt`](llms.txt) (full API + recipes + gotchas)
  and a Claude Code skill (`skills/simple-liquid-glass/SKILL.md`), both shipped in the package.

### Changed

- **`specular` now defaults to `false`** on `LiquidGlassInteractive` (was `true` in 3.0.0) — the
  pointer-tracked highlight is opt-in. Pass `specular` if you relied on the old default.
- The default **`low`** quality tier now uses a **full-resolution** displacement map at the same
  single-pass render cost — cleaner refraction by default, with no per-frame cost change.

### Fixed

- **Interactive overlays are clipped to the glass radius** — the specular highlight, follow-pointer
  bump, and click ripples no longer overflow the rounded corners as squares.
- **Smoother follow-pointer bump** — gentler, blurred turbulence + a feathered edge remove the hard
  fringe around the cursor.
- **Click ripple reads like water** — a subtle `soft-light` caustic instead of a visible white ring.
- **No more frizzy/folded edge on the base refraction** — a baked rim-blur keeps the displacement
  gradient gentle at the rounded perimeter (zero per-frame cost).

## 3.0.0 — 2026-06-17

### Added

- **Shape-adaptive refraction (`shapeAdapt`, default on).** The displacement map is now built in
  aspect-true pixel space, so the lens reads like glass *cut to the element's shape* — a long
  navbar or tall sidebar refracts evenly instead of over-bending on its short axis. Free: it lives
  entirely in the baked map; the GPU filter graph is unchanged.
- **Directional refraction (`angle`, degrees).** Point the refraction lean any direction. It's
  shape-adapted, so `45°` reads as a true 45° on any aspect ratio (not a flattened lean). `0` =
  baseline; positive = clockwise. Chromium SVG path.
- **Lens field modes (`lens`) + manual tuning (`lensStrength`, `lensCenter`).** Choose how the glass
  bends light: `classic` (linear radial), `convex` (one coherent dome magnifier — no top/bottom
  split), `shift` (uniform directional offset; straight lines stay straight), or `rim` (clear flat
  center, refraction only at a soft perimeter band). Each is a distinct displacement field with
  fold-safe defaults at the standard `scale`.
- **Real animated refraction (`liquid: 'ripple' | 'flow' | 'wobble'`).** The backdrop genuinely
  warps via a live `feTurbulence` → `feDisplacementMap` stage — not a compositor overlay. Tunable
  with `liquidSpeed` / `liquidScale`. Opt-in and GPU-gated: animates only while on-screen, pauses on
  `prefers-reduced-motion`, Chromium-only, amplitude-capped on mobile/low quality.
- **Pointer interaction on `LiquidGlassInteractive`:** `liquidTrigger` (`'always' | 'hover' |
  'press'` — `hover`/`press` stay idle, zero cost, until you interact) and `followPointer` (a
  refractive bump that distorts the backdrop toward the cursor).
- New shared core modules `core/liquid` (preset → turbulence params, pure/tested) and
  `normalizeAngle` in `core/displacementMap`.

### Changed

- **BREAKING (visual):** `shapeAdapt` defaults to `true`, which changes how **non-square** lenses
  refract at `angle: 0` (square lenses are visually unchanged). Set `shapeAdapt={false}` to restore
  the byte-for-byte legacy ≤2.x map.

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

## 1.4.2 — 2026-06-12

### Fixed

- WebGL: detect **late-applied backgrounds** (e.g. Storybook's backgrounds addon) so the captured
  snapshot isn't stale when the page background changes after first paint.

### Internal

- Migrated Storybook to v10 (react-vite).

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

## 1.3.0 — 2025-09-03

### Added

- **Rendering quality presets** — `quality: 'low' | 'standard' | 'high' | 'extreme'` controlling the
  internal displacement-map resolution, plus **`autodetectquality`** (device-performance detection).
  Default tier is `'low'`.
- **`mobileFallback`** and **`effectMode`** controls; mobile defaults to a CSS-only fallback.

### Improved

- Multi-instance performance at the `'low'` tier.

## 1.2.9 — 2025-08-25

### Added

- **`background` prop** — accepts a solid color or gradient and automatically converts it to
  semi-transparent. Default tuning updated.

## 1.2.8 — 2025-08-15

### Docs

- README bundle-size badge update.

## 1.2.7 — 2025-08-15

### Added

- **`autoTextColorMode`** and **`perPixelTargetSelector`** for richer automatic text-color adaptation.

## 1.2.6 — 2025-08-10

### Fixed

- Stricter iOS **real-device detection** (excludes emulators / Android) for the iOS blur fallback.

## 1.2.5 — 2025-08-10

### Added

- **iOS blur fallback** controls — `iosMinBlur` and `iosBlurMode` (force a minimal blur on iOS where
  SVG `backdrop-filter` refraction is unsupported).

## 1.2.4 — 2025-08-10

### Changed

- Default values updated to `blur=0`, `displace=5`.

## 1.2.3 — 2025-08-10

### Fixed

- Sync the border radius between the SVG filter and the CSS; clamp `radius`; add
  `-webkit-backdrop-filter` and `overflow: hidden` (iOS fixes).

## 1.2.2 — 2025-08-10

### Fixed

- Correct the blur/displace mapping — the inner frost uses `displace`, the final blur uses `blur`.

## 1.2.1 — 2025-08-10

### Added

- **`saturation`** and **`aberrationIntensity`** props on the SVG path.

### Changed

- Pruned non-SVG dependencies.

## 1.2.0 — 2025-08-10

Earliest release in this tracked history (any 1.0 / 1.1 releases predate it).

### Added

- **Automatic text color** (`autoTextColor`, `forceTextColor`), a semi-transparent **`glassColor`**,
  and Storybook controls.
