# Phase 1 — Performance Hardening (v2.2.0)

**Date:** 2026-06-14
**Status:** Approved — implementation
**Scope:** Workstream A (A1–A6) from the improvement roadmap. Behavior-preserving perf
hardening only. No visual changes. Interactivity (B) and reach (C) are out of scope.

## Goal

Reduce the runtime and memory cost of `LiquidGlass` without changing what it renders,
and add CI guardrails so the bundle budget is enforced. Every change obeys the
"stay lightweight" contract: zero runtime deps, SSR-safe, core stays well under 10 KB gzip.

## Baseline (measured 2026-06-14, v2.1.0)

- `dist/index.esm.js`: **6.04 KB gzip** (6,195 B) / 17.5 KB raw. *(The roadmap header's
  9.34 KB / 26 KB figure was stale/unsourced — corrected here.)*
- Zero runtime dependencies. React peer range 16.8 → 19.
- Tests: 5 passing (`cssColor.test.ts`), `testEnvironment: 'node'` (pure functions only,
  no jsdom).

## Structural approach

Targeted extraction of the two pieces that contain genuinely pure, testable logic;
everything else stays inline in `src/index.tsx`:

- `src/displacementCache.ts` — LRU for the displacement-map data-URIs (A1).
- `src/quality.ts` — pure device→quality tier resolution (A5).

These are unit-tested in the existing node environment and double as a down-payment on
the eventual C3 core extraction. DOM/effect-bound changes (A2–A4) stay inline and are
verified in the browser (Storybook), since jsdom is not configured.

## Items

### A1 — Bound the displacement cache (LRU)

`DISPLACEMENT_CACHE` (a module-level `Map`) never evicts; every distinct
size/param combo adds a permanent entry. New `displacementCache.ts` exports
`cacheGet(key)` / `cacheSet(key, val)` with `CACHE_MAX = 64`: `get` refreshes recency
(delete+reinsert), `set` evicts the oldest entry when at capacity. Replaces the inline
`.get`/`.set` at `index.tsx:491`/`:515`. Behavior-preserving (bounded memory only).

### A2 — Throttle + narrow the auto-text-color listeners

Today the `autoTextColor` effect attaches a non-passive, capture-phase `scroll`
listener and a non-passive `resize` listener; each fires `update()` synchronously
(DOM walk + luminance math).

- Coalesce `update()` to **one run per frame** via `requestAnimationFrame`.
- Make both listeners `{ passive: true }`.
- **Refinement vs roadmap:** keep `capture: true` on `scroll`. The jank fix is
  passive + rAF coalescing; dropping capture would silently stop reacting to
  inner-scroll-container scrolls — an unnecessary behavior change. Final:
  `addEventListener('scroll', onChange, { passive: true, capture: true })`.

### A3 — Shrink the MutationObserver fan-out

Today one `MutationObserver` is created per ancestor up to `<body>`. Replace with a
**single** observer watching `document.body` + the nearest opaque ancestor (resolved via
`findNearestOpaqueBackground`), re-pointed inside `update()` if the nearest-opaque node
changes.

- **Accepted trade-off:** a mid-chain ancestor toggling to opaque (via class/style)
  without any *watched* node mutating won't be detected. The roadmap accepts this; it is
  documented in code.

### A4 — Make `willChange` dynamic

`glassMorphismStyle` sets `willChange: 'backdrop-filter, filter'` permanently, holding a
promoted compositor layer alive for every instance forever.

- Default to `willChange: 'auto'`.
- **Refinement vs roadmap:** since interactivity (B1) is deferred, there is no
  pointer/hover source in core. Promote transiently to `'backdrop-filter, filter'` only
  while the existing `ResizeObserver` is firing, clearing ~200 ms after the last resize
  (debounced). No new listeners. No effect on first-paint correctness.

### A5 — Trim the mount-time micro-benchmark

Today the autodetect path busy-loops ~50 ms on the main thread before caching to
`sessionStorage`; navigator hints only refine the result, never skip the loop.

- **Decisive-hint short-circuit** before the loop (pure, in `quality.ts`): skip the
  benchmark only when the resolved tier is invariant of both `opsPerMs` and `isMobile`.
  That is **low-end only** — `cores ≤ 2 || deviceMemory ≤ 1 ⇒ 'low'`. There is
  deliberately **no** high-end short-circuit: a strong device can still be throttled (low
  `opsPerMs`) or mobile, both of which the benchmark path must observe to stay
  behaviour-identical to the original logic. (An earlier `cores ≥ 8 && deviceMemory ≥ 8 ⇒
  'high'` rule was dropped in review — it changed the tier for high-end mobiles and
  throttled devices, a behaviour regression.)
- Cut the loop budget **50 ms → 12 ms**.
- Run the benchmark inside `requestIdleCallback` (fallback `setTimeout(…, 1)`).
- Persist to **both `localStorage` and `sessionStorage`** (24 h TTL; read either,
  prefer fresh). All wrapped in try/catch + `typeof` guards (SSR / Safari private mode).
- Safe: quality starts at the `'low'` first-paint default and only ever upgrades — no
  downgrade flash.

### A6 — CI bundle budget

- Add `size-limit` + `@size-limit/preset-small-lib` (devDeps) and an `npm run size`
  script. Budget the `.` entry at **7 KB gzip** (actual 6.04 KB → tight enough to catch
  real regressions, well under the 10 KB contract ceiling).
- Add `.github/workflows/ci.yml` running `npm test` + `npm run size` on push/PR.
- **Deferred:** the roadmap's "100-instances Storybook story + Playwright FPS check"
  (pulls in Playwright; separate, heavier effort). Tracked as follow-up.

## Testing

- **Unit (node, TDD):** `displacementCache.test.ts` (eviction at cap, recency refresh);
  `quality.test.ts` (decisive hints, benchmark-result classification, tier boundaries,
  reduced-motion → low).
- **Browser (Storybook):** `autoTextColor` still adapts to background (A2/A3 correctness);
  computed `will-change` is `auto` at rest (A4); no new console errors; component renders
  unchanged.
- **Build/size:** rollup build succeeds; `npm run size` passes the 7 KB budget.

## Out of scope / non-goals

- No visual/output changes. No new props. No interactivity (B). No core extraction (C3).
- Public API (`LiquidGlassProps`, `LiquidGlassHandle`) unchanged — byte-for-byte
  compatible.

## Version

`v2.2.0` (minor — adds CI tooling + behavior-internal perf changes; no API change).
