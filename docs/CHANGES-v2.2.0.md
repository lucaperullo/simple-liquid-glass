# v2.2.0 — changes at a glance (before → after)

Behaviour-preserving performance hardening. No public API change, no visual/output change.
Bundle: **6.04 → 6.53 KB gzip** (budget 7 KB). Tests: **5 → 21**. All green.

| # | Area | Before | After | File |
|---|------|--------|-------|------|
| A1 | Displacement cache | unbounded module `Map` | LRU, 64 entries | [displacementCache.ts](../src/displacementCache.ts) |
| A2 | `autoTextColor` listeners | sync + capture, every scroll | passive + capture, 1 rAF/frame | [index.tsx](../src/index.tsx) |
| A3 | `autoTextColor` observers | one `MutationObserver` per ancestor | single observer (body + nearest opaque) | [index.tsx](../src/index.tsx) |
| A4 | `will-change` | permanent on every instance | `auto`; promoted only while resizing | [index.tsx](../src/index.tsx) |
| A5 | Quality auto-detect | ~50 ms blocking, `sessionStorage` | low-end skip + 12 ms idle, `local`+`session` | [quality.ts](../src/quality.ts) |
| A6 | Bundle budget | none | `size-limit` (7 KB) + CI | [ci.yml](../.github/workflows/ci.yml) |

---

## A1 — bound the displacement cache (LRU)

```diff
- const DISPLACEMENT_CACHE: Map<string, string> = new Map();   // never evicts
- const cached = DISPLACEMENT_CACHE.get(cacheKey);
- DISPLACEMENT_CACHE.set(cacheKey, uri);
+ import { cacheGet, cacheSet } from './displacementCache';     // LRU(64), evicts oldest
+ const cached = cacheGet(cacheKey);
+ cacheSet(cacheKey, uri);
```

**Why:** every distinct size/param combo (resizing makes many) added a permanent entry — a slow memory leak on long-lived SPAs.

## A2 — throttle the auto-text-color listeners

```diff
- const onWindowChange = () => update();                 // runs DOM walk + luminance every event
- window.addEventListener('resize', onWindowChange);
- window.addEventListener('scroll', onWindowChange, true);
+ let rafId = 0;
+ const onChange = () => { if (rafId) return; rafId = requestAnimationFrame(() => { rafId = 0; update(); }); };
+ window.addEventListener('resize', onChange, { passive: true });
+ window.addEventListener('scroll', onChange, { passive: true, capture: true });
```

**Why:** the old handler was synchronous, non-passive, and fired on every scroll tick. Now it never blocks scrolling and recomputes at most once per frame. Capture is kept so inner scroll containers still trigger it.

## A3 — shrink the MutationObserver fan-out

```diff
- // one observer per ancestor, all the way up to <body>
- while (el) { observedNodes.push(el); el = el.parentElement; }
- observedNodes.push(document.body);
- for (const node of observedNodes) { new MutationObserver(update).observe(node, …); }
+ // a single observer on <body> + the nearest opaque ancestor, re-pointed when it changes
+ const observer = new MutationObserver(() => onChange());
+ const repointObserver = (opaque) => { observer.disconnect(); observer.observe(document.body, …); if (opaque && opaque !== document.body) observer.observe(opaque, …); };
```

**Trade-off (documented):** a mid-chain ancestor toggling to opaque without mutating its own class/style is picked up on the next scroll/resize rather than instantly.

## A4 — make `will-change` dynamic

```diff
- willChange: 'backdrop-filter, filter'                  // permanent → a GPU layer per instance, forever
+ willChange: isResizing ? 'backdrop-filter, filter' : 'auto'
```

`isResizing` is set true only on genuine resizes (after the initial measurement) and cleared ~200 ms after the last one, reusing the existing `ResizeObserver`.

## A5 — trim the mount-time benchmark

```diff
- while (performance.now() - start < 50) { …blocking… }  // ~50 ms main-thread stall
- sessionStorage.setItem(CACHE_KEY, …);                  // session only
+ const decisive = decisiveTier({ cores, deviceMemory }); // skip benchmark for low-end devices
+ if (decisive) { setResolvedQuality(decisive); persistQuality(decisive); return; }
+ requestIdleCallback(runBenchmark, { timeout: 200 });    // ~12 ms, off the critical path
+ // persistQuality writes both localStorage + sessionStorage (24 h TTL)
```

**Behaviour-preserving:** `decisiveTier` only short-circuits when the tier is invariant of the benchmark *and* `isMobile` (low-end only). The benchmark path (`classifyQuality`) keeps the original thresholds exactly. A property test asserts the short-circuit never disagrees with the full logic across the full input grid.

## A6 — CI bundle budget

```jsonc
// package.json
"scripts": { "size": "size-limit" },
"size-limit": [{ "name": "core — import { LiquidGlass } (gzip)", "path": "dist/index.esm.js", "limit": "7 KB", "ignore": ["react", "react-dom"] }]
```

Plus `.github/workflows/ci.yml` running `npm install` → `npm test` → `npm run build` → `npm run size` on push/PR. (`npm install`, not `npm ci`, because `package-lock.json` is gitignored in this repo.)

---

## Fixed during adversarial review

1. **High — autodetect tier regression.** An earlier `cores ≥ 8 && deviceMemory ≥ 8 ⇒ 'high'` short-circuit overrode `isMobile` and throttling, changing the resolved tier (and thus the rendered map) for high-end phones and throttled machines. Removed; only the low-end skip remains, guarded by a property test.
2. **Low — `will-change` promoted on mount.** Now promotes only on genuine post-mount resizes (and dedupes the `ResizeObserver`'s initial fire).
3. **Low — idle quality flip could lag up to 500 ms.** Idle deadline tightened to 200 ms.
4. **CI — `npm ci` with a gitignored lockfile would fail.** Switched to `npm install` without the lockfile cache.

Four further lifecycle/cleanup concerns (rAF guard, timer/observer cleanup, listener add/remove symmetry) were checked and verified safe.

## Files

- New: `src/displacementCache.ts`, `src/quality.ts`, `src/__tests__/displacementCache.test.ts`, `src/__tests__/quality.test.ts`, `.github/workflows/ci.yml`, `RELEASE_NOTES.md`, this file, the design spec.
- Modified: `src/index.tsx`, `package.json` (size-limit + version 2.2.0), `CHANGELOG.md`.
