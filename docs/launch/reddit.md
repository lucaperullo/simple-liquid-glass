# Reddit posts (value-first — link last)

> Reddit punishes self-promo. Both posts lead with the technical problem/solution; the link is one
> line at the end. **Verify the demo on a real iPhone before posting.**

---

## Post 1 — r/reactjs ("Show & Tell" flair, Tue–Thu 9–11 AM PT)

**Title:** How we got real liquid-glass refraction working on iOS, where Safari's `backdrop-filter` fails

**Body:**

A while back I published **simple-liquid-glass**, a zero-dependency React glassmorphism component.
It hit a wall that every liquid-glass library hits: it falls back to a plain blur on Safari, iOS,
and Firefox — because WebKit can't run SVG filters *inside* a `backdrop-filter` (WebKit bug 245510).
Blur doesn't look like glass. It looks like fog.

**The problem.** `backdrop-filter: url(#svgFilter)` does nothing on iOS — WebKit silently ignores
the `url()`. On Chromium it refracts perfectly; on most mobile browsers it can't.

**The workaround.** Those engines *can* run `feDisplacementMap` in a regular element's `filter`
(caniuse #3803). So on the fallback engines the component renders a live, displaced **clone** of the
element behind the lens — not a screenshot, a real DOM mirror that updates as the page scrolls or
the background changes. True refraction, not blur.

```jsx
const bg = useRef(null);
<div style={{ position: 'relative' }}>
  <div ref={bg}>{/* background */}</div>
  <LiquidGlass backdropRef={bg} track>Glass that refracts on iOS</LiquidGlass>
</div>
```

Per engine:
- **Chromium** → native `backdrop-filter` refraction (mirror stays off, zero cost)
- **Safari / iOS / Firefox** → live-DOM mirror refraction
- **iOS without a usable backdrop** → frosted CSS fallback

**Honest scope.** This is a visual effect, not a layout tool. The mirror only works when you
explicitly pass `backdropRef` (auto-detection crashes iOS — it tries to clone the whole page). Keep
lenses modest; filter cost scales with area. Pointer elasticity is a separate opt-in import. For
full-page refraction, Chromium's native `backdrop-filter` is still cheaper. Tested on a real iPhone.

~6.5 KB gzip, zero npm deps, React 16.8–19, SSR-safe. There's a `<liquid-glass>` web component too.

Links: [npm](https://www.npmjs.com/package/simple-liquid-glass) · [GitHub](https://github.com/lucaperullo/simple-liquid-glass) · [Live demo](https://simple-liquid-glass.vercel.app/)

---

## Post 2 — r/webdev ("Tutorial" or "Show & Tell", Wed–Fri 10 AM–12 PM PT)

**Title:** How to ship real liquid-glass refraction on iOS (not blur) — and why most libraries miss it

**Body:**

**TL;DR:** SVG displacement filters don't work inside `backdrop-filter` on Safari/iOS/Firefox (WebKit
bug 245510). But they *do* work in a regular element's `filter`. So for true refraction on Apple
devices, render a live DOM clone of the background and displace *that*. Blur becomes real glass.

**Why you haven't seen this.** Liquid glass is everywhere — Apple is shipping it on 1B+ iOS 26+
devices. But the standard approach (CSS `backdrop-filter` + SVG filter) only works on Chromium. On
Safari/Firefox it falls back to blur. It's architectural: WebKit doesn't let filters reference SVG
`<defs>` from inside `backdrop-filter`, no spec requires it, so it never gets fixed. Most libraries
ship blur and call it a day; some use heavy WebGL snapshots; a few are abandoned.

**The solution.** Use each engine's actual capabilities:
- **Chromium** → native `backdrop-filter` refraction
- **Safari / iOS / Firefox** → a live, displaced **clone** of the background element via an SVG
  displacement map on the clone's `filter` — no canvas, no WebGL, just the DOM filtered in real time

```jsx
<div style={{ position: 'relative' }}>
  <div ref={backgroundRef}>{/* actual background */}</div>
  <LiquidGlass backdropRef={backgroundRef} track>Your glass content</LiquidGlass>
</div>
```

**Framework-agnostic.** React (16.8–19, SSR-safe), plus a web component for Vue/Svelte/Astro/vanilla:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
<liquid-glass radius="20" frost="0.15" style="width:300px;height:200px;display:block">Glass anywhere</liquid-glass>
```

Chromatic aberration, gradient borders, auto text color, ~6.5 KB gzip, zero runtime deps. Verified
on a real iPhone.

**Real talk.** Point to a valid background element explicitly — auto-detection would clone the whole
page on iOS and crash the tab. Keep lenses modest; cost scales with area. For full-page effects,
Chromium's native `backdrop-filter` is more efficient.

Links: [npm](https://www.npmjs.com/package/simple-liquid-glass) · [GitHub](https://github.com/lucaperullo/simple-liquid-glass) · [Demo](https://simple-liquid-glass.vercel.app/)

---

### Posting rules
- Lead with the problem (bug 245510), explain the solution, link last.
- No "I built this," no "check out my," no metrics, no emojis, no trash-talking competitors.
- r/webdev → lean on the web-component / framework-agnostic angle; r/reactjs → the React 16.8–19 span
  + zero-dependency angle.
