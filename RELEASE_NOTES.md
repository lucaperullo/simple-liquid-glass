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
