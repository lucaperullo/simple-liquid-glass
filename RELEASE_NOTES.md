# What's new in `simple-liquid-glass` v2.4.0

**Real refraction on iPhone — built right into `<LiquidGlass>`.** Safari/iOS and Firefox can't run
SVG filters inside `backdrop-filter`, so they used to only blur. Now the core component carries a
live-DOM **mirror**: give it the element behind the lens and, on those engines, it refracts a
displaced clone of that element — actual distortion, not a frosted rectangle. Chromium keeps its
native `backdrop-filter` refraction and pays nothing for the mirror.

```jsx
const bg = useRef(null);
<div ref={bg}>{/* the background behind the glass */}</div>
<LiquidGlass backdropRef={bg} track>…</LiquidGlass>
```

- **One component.** No separate import — the mirror lives in `<LiquidGlass>` (the `mirror` prop,
  on by default). `simple-liquid-glass/mirror` still works as a thin back-compat wrapper.
- **You point at the backdrop on purpose.** `backdropRef` must be a **sibling/background** element,
  not an ancestor of the lens. There's deliberately no auto-detect: guessing it meant cloning a
  page-sized ancestor, which crashes iOS Safari. Without a usable backdrop it falls back to blur.
- **New props:** `mirror` (default true), `backdropRef`, `backdropSelector`, `mirrorScale`
  (strength, default 26), `track` (re-align every frame for a moving/dragged lens).
- **Tuned for iOS:** off-screen lenses pause, the filter is applied to a lens-sized element, and the
  re-align is throttled to ~30fps. Validated on a real iPhone.
- **Bundle:** core 6.6 → ~7.5 KB gzip (still zero runtime dependencies, still SSR-safe). No
  breaking changes — without a `backdropRef`, behavior is identical to 2.3.0.

---

# What's new in `simple-liquid-glass` v2.2.0

**Performance hardening release.** Every glass element on your page now costs less CPU, GPU
memory, and main-thread time — with **no API changes** and **no visual difference**. Upgrading
is a drop-in: same props, same output.

- **Bundle:** ~6.5 KB gzip (still zero runtime dependencies, still SSR-safe)
- **React:** 16.8 → 19
- **Migration:** none. `LiquidGlassProps` and `LiquidGlassHandle` are unchanged.

---

## ✨ New

- **Enforced bundle-size budget.** A `size-limit` check (`npm run size`) and a GitHub Actions CI
  workflow now guard the core import at **7 KB gzip** and fail the build on any regression.

## 🚀 Improved

- **Lighter GPU usage with many cards.** `will-change` is no longer pinned on every instance
  forever — it defaults to `auto` and is promoted only for the brief moment an element is
  resizing. A page full of glass cards no longer holds a compositor layer per card at rest.
- **Smoother scrolling with `autoTextColor`.** Background detection now runs **passively** and at
  most **once per animation frame**, instead of synchronously on every scroll event.
- **Fewer observers on deep layouts.** `autoTextColor` now uses a **single** `MutationObserver`
  (watching `<body>` + the nearest opaque ancestor) instead of one per ancestor up the DOM tree.
- **Faster, smarter quality auto-detection** (`autodetectquality`). It skips the benchmark
  outright for clearly low-end devices, defers any benchmark to idle time, and remembers the
  result across sessions (`localStorage`). The resolved tier matches the previous logic exactly.

## 🐛 Fixed

- **Memory leak in the displacement-map cache.** The internal cache was unbounded and grew a
  permanent entry for every distinct size/param combination (resizing produced many) — it's now a
  bounded **LRU (64 entries)**, so memory stays flat on long-lived single-page apps.
- **Scroll jank from `autoTextColor`.** The old capture-phase, non-passive scroll handler ran a DOM
  walk + luminance math on every scroll tick. It's now passive and frame-coalesced.
- **~50 ms first-paint stall** when `autodetectquality` was on. The mount-time micro-benchmark was a
  blocking ~50 ms busy-loop on the main thread; it's now ~12 ms, deferred to `requestIdleCallback`,
  and frequently skipped outright via device hints.

## 🔧 Under the hood

- Extracted two pure, framework-agnostic modules — `displacementCache.ts` (LRU) and `quality.ts`
  (device → quality tier) — each fully unit-tested. Test count went from 5 to **20**.
- These extractions are also groundwork for a future framework-agnostic core.

---

For the complete history, see [CHANGELOG.md](./CHANGELOG.md).
