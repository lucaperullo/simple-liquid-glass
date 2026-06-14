# Competitive analysis & roadmap to best-in-class

**Date:** 2026-06-14. Researched against primary sources (npm registry, GitHub APIs,
bundlephobia, MDN, WebKit Bugzilla, caniuse, Apple HIG), fact-checked.

## TL;DR

The "liquid glass on the web" market is **bifurcated and its leaders are vulnerable**.
The capable, interactive incumbents are ~5× heavier, Chromium-only with no real fallback,
SSR-fragile, narrow on React versions, and **unmaintained for ~a year**. The lightweight
options are low-fidelity. `simple-liquid-glass` already wins the "production-shippable"
axis (tiny, zero-dep, SSR-safe, broad React, the only polished Safari/Firefox/iOS fallback)
— the path to #1 is to **add the "feels alive" interactivity layer while keeping the
lightweight crown**, via opt-in subpath exports.

## Landscape

| Library | Bundle (gzip) | Deps | React | Safari/FF | SSR | Interactivity | Maintained | Adoption |
|---|---|---|---|---|---|---|---|---|
| **simple-liquid-glass** | **~6.5 KB** | **0** | **16.8–19** | **masked-edge fallback** | **safe** | none (planned) | **active** | growing |
| liquid-glass-react (rdev) | ~33 KB | 0 | **19 only** | none | dubious | elasticity + 4 modes | stale ~1 yr | 5.2k★ · 26k/wk |
| @nkzw/liquid-glass | ~34 KB | 0 | 18+ ESM-only | none | **crashes SSR** | elasticity | stale | 49★ · 449/wk |
| @specy/liquid-glass | multi-MB | Three.js | vanilla + React | **real refraction** | no | manual refresh | semi | 145★ · 2.1k/wk |
| @developer-hub/liquid-glass | ~5.5 KB + deps | **lodash, react-draggable** | 18+ | partial | ? | mouse + drag | stale | 18★ |
| @creativoma/liquid-glass | ~4 KB | 0 | 18+ (Tailwind) | has fallback | ? | none | recent | 11★ |
| @liquidglass/react | ~2.3 KB | 0 | 16.8+ | ? | ? | none | stale | 16★ |
| liquid-web | ? (235 KB unpacked) | 0 | vanilla+Vue+React | none (Chromium) | no | pointer | stale | ~30★ |
| @callstack/liquid-glass | n/a (native) | 0 | **React Native** | n/a (iOS 26) | n/a | native | **active** | 1.5k★ · 71k/wk |
| css.glass / ui.glass | ~0 (copy CSS) | 0 | any | broad | safe | none | — | glassmorphism only |

## The platform reality (decisive)

**SVG filters inside `backdrop-filter` are Chromium-only, and that will not change soon.**
WebKit bug [245510](https://bugs.webkit.org/show_bug.cgi?id=245510) (filed 2022-09-21) is
still `NEW`/open, last touched 2026-06-12. The root cause, per WebKit engineer Simon Fraser
on the duplicate [297770](https://bugs.webkit.org/show_bug.cgi?id=297770): *"Accelerated
filters (including backdrop-filter) can't use SVG filters, sadly."* — an architectural
limit of WebKit's GPU filter pipeline, not a quick fix. Firefox is also affected
([MDN BCD #24110](https://github.com/mdn/browser-compat-data/issues/24110), closed
"not planned").

Consequences:
- Our Chromium-only refraction + masked-edge fallback architecture is **correct and
  vindicated** — most competitors ship *no* fallback (the effect just vanishes on Safari/FF).
- True backdrop refraction on iOS/Safari is only achievable via **WebGL/screenshot**
  (heavy, sync issues — what `@specy` does) or a **live-DOM-mirror + element `filter:url()`**
  (Safari *does* support SVG filters in the regular `filter` property — just not `backdrop-filter`).
- No native CSS `liquid-glass` primitive is on any standards track. The moat is **DX, size,
  fallback quality, framework reach, and interactivity** — not a secret rendering primitive.

## The fidelity bar (7 techniques)

Apple's Liquid Glass (WWDC25, "lensing") uses all seven; web clones pick a subset:
1. Backdrop refraction (feDisplacementMap) — **we have it**
2. Per-channel chromatic aberration — **we have it**
3. Edge/rim lensing — partial (in fallback); a dedicated mode would strengthen it
4. Specular highlights (ideally light/pointer-tracked) — **missing**
5. Environmental tint adaptation — we adapt *text* color; not glass tint
6. Magnification / bulge — **missing**
7. Pointer-reactive elastic deformation — **missing** (the headline gap vs rdev/@nkzw)

## Where simple-liquid-glass already leads

- **5× smaller** than the leaders (~6.5 KB vs ~33 KB); near-smallest with real fidelity.
- **Zero runtime deps**; **SSR-safe** (rdev dubious; `@nkzw` throws on SSR).
- **Broadest React range** (16.8–19; rdev is 19-only, `@nkzw` 18+).
- **Only polished Safari/Firefox/iOS fallback** in the category.
- **Quality presets + device autodetect** and **auto text-color contrast** — unique.
- **Actively maintained** (the leaders are ~1 year stale).

## Gaps to close (the roadmap to #1)

1. **Pointer-reactive elasticity** → `simple-liquid-glass/interactive` (opt-in, core stays
   ~6.5 KB). rAF spring, `prefers-reduced-motion`-gated. Closes the headline gap.
2. **Pointer/motion-tracked specular highlight** — cheap, Apple-core, and works in *both*
   the Chromium path and the Safari/FF fallback (uplifts the traffic competitors abandon).
3. **Refraction modes** (`polar`/`prominent`/`bulge`/`magnify`) — displacement-map
   generators, runtime ≈ 0 (cached). Matches rdev's 4 modes.
4. **Best-in-class CSS fallback** — chromatic dual-color edge ring, specular, per-tier
   tuning. Directly fixes "the CSS version looks poor" and the iOS experience.
5. **Multi-instance performance** — dedupe identical SVG filter defs across instances into
   one shared `<defs>`; disable the effect when offscreen (IntersectionObserver /
   `content-visibility`). Fixes "many components make the UI lag." Add a 100-instances story
   + FPS check.
6. **iOS workaround** — realistic options, in order of effort: (a) the much-improved CSS
   fallback (#4) so iOS looks great without true backdrop refraction; (b) a research spike
   on a live-DOM-mirror layer with element `filter:url(#displacement)` for *true-ish*
   refraction on Safari/iOS (Safari supports SVG in regular `filter`). Honest framing: true
   *backdrop* refraction on iOS is blocked by WebKit; we get as close as the platform allows.
7. **`<liquid-glass>` web component** (framework-agnostic core) → Vue/Svelte/Angular/vanilla.
   Non-React is poorly served (heavy/stale `@specy`, `liquid-web`, `GlassiFy`).
8. **Imperative API** — `getQuality()` shipped (2.2.0); add `setPointer()` + `refresh()`.

**Explicit non-goal:** core WebGL (keeps us out of the multi-MB trap; the parked
live-DOM-mirror is the only WebGL-adjacent idea worth a *spike*, not the core path).

## Positioning statement

> liquid-glass-react's fidelity and feel, at 1/5 the size — SSR-safe, works on Safari,
> React 16.8–19, and actually maintained.

## Key sources

- WebKit 245510 / 297770 (SVG-in-backdrop-filter, architectural); MDN BCD #24110
- Apple HIG "Materials" + WWDC25 session 219 "Meet Liquid Glass"
- npm registry + GitHub APIs + bundlephobia for each package (sizes/deps/maintenance)
- kube.io, FrontendMasters (Coyier), LogRocket, specy.app — technique references
