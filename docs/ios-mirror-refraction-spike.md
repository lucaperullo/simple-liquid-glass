# Spike: true refraction on iOS / Safari via a live DOM mirror (P4)

**Status:** productized as the opt-in `simple-liquid-glass/mirror` export
([src/mirror/index.tsx](../src/mirror/index.tsx)) — mechanism verified in Chromium,
**awaiting real-device validation on iOS Safari**. (The original `src/experimental/MirrorGlass.tsx`
POC has been retired in favor of the production component.)

## The problem

Safari/iOS cannot run SVG filters inside `backdrop-filter` (WebKit bug
[245510](https://bugs.webkit.org/show_bug.cgi?id=245510); it's architectural — "accelerated
filters can't use SVG filters"). So the core component's refraction is Chromium-only, and on
iOS it degrades to the (now much nicer) frosted CSS fallback — but not *true* refraction.

## The technique

Safari **does** run SVG filters in the regular `filter` property (just not in `backdrop-filter`).
So instead of filtering the backdrop, we:

1. Render a **clone of the element behind the lens** (the `source`) into a layer inside the lens.
2. Position the clone so the slice behind the lens lines up 1:1 (`translate(sourceLeft - lensLeft, sourceTop - lensTop)`, re-synced on scroll/resize via rAF).
3. Apply `filter: url(#displacement)` (feTurbulence + feDisplacementMap) to that clone.
4. Re-clone on source mutations (MutationObserver).

This yields real, per-pixel refraction of the underlying content on Safari/iOS.

Implementation: [src/experimental/MirrorGlass.tsx](../src/experimental/MirrorGlass.tsx).
Demo: Storybook story **IOSMirrorRefraction**.

## How to validate on a real device

1. With the dev server running (`npm run storybook`), Storybook prints a LAN URL
   (e.g. `http://192.168.1.36:6006`).
2. On an iPhone on the **same Wi-Fi**, open that URL → *LiquidGlass / IOSMirrorRefraction*.
3. Confirm the colored blocks **bend/ripple** inside the lens. If they do, the technique works
   on iOS and we can promote it to a real export.

## Verified so far (Chromium only)

- Clone preserves the source's layout (clone the *element*, not `innerHTML`, or flex/grid context is lost — fixed during the spike).
- Alignment via `getBoundingClientRect` deltas; re-synced on scroll/resize.
- `feDisplacementMap` visibly distorts the cloned content (column boundaries ripple, text warps).

## Known limitations (to resolve before shipping)

- The clone is a **snapshot** (re-cloned on mutations); live video/canvas/animations behind the
  lens won't update continuously.
- Alignment assumes `source` is the element actually behind the lens; nested scroll containers
  and transformed ancestors aren't fully handled.
- Cloning a large DOM subtree has a cost — needs a perf pass (and likely a cap / opt-in).
- Cross-origin images in the clone are fine (it's a DOM clone, not a canvas snapshot — no taint),
  unlike the removed html2canvas/WebGL approach.

## Integration plan (once device-validated)

- Promote to an opt-in export `simple-liquid-glass/ios` (or an `effectMode="mirror"` / `sourceRef` prop on the core).
- Reuse the core's rounded-rect displacement map (edge lensing + chromatic aberration) instead of
  plain turbulence, so it matches the Chromium look.
- Chain after the existing engine gating: Chromium → `backdrop-filter` SVG; Safari/iOS → mirror;
  otherwise → frosted CSS fallback.

See [[webgl-removed-2-0-0]] for why the earlier html2canvas/WebGL snapshot approach was removed
(this DOM-mirror is the cheaper, sharper, no-taint successor).
