---
title: Real Glass Refraction in React That Actually Works on iPhone Safari
published: false
tags: [react, webdev, css, javascript]
cover_image: https://images.unsplash.com/photo-1619983081563-430f63602796?w=1200&h=630&fit=crop
---

# Real Glass Refraction in React That Actually Works on iPhone Safari

If you've scrolled through social media in the past year, you've seen Apple's "Liquid Glass" design trend everywhere. iOS 26 launched it at WWDC 2025, and now it's on a billion devices. Every developer wants to ship it to the web.

The problem? Almost every web implementation is a lie. On Chrome, you get real refraction. On iPhone, iPad, and Safari? You get a blurry fallback that looks flat — if it works at all. The reason isn't complicated, but the solution requires rethinking what "refraction" actually means in the browser.

This post walks through the technical barrier, the overlooked workaround that fixes it, and how to use it in production React.

---

## The Setup: Why Safari Can't Copy Chromium

Let me show you the standard approach first. Most glassmorphism libraries use this:

```jsx
import { LiquidGlass } from 'some-library';

<LiquidGlass>
  <div>Content here</div>
</LiquidGlass>
```

Under the hood, they apply an SVG `<feDisplacementMap>` filter inside CSS `backdrop-filter`:

```css
.glass {
  backdrop-filter: url(#displacement-svg);
  /* Displaces the pixel colors from the layer behind */
}
```

On Chromium? Perfect. The GPU processes it instantly. The pixels *behind* the glass shift — light bends, colors refract, the glass looks alive.

On Safari, iOS, and Firefox? Nothing happens. The `backdrop-filter` simply ignores the SVG filter reference. (This is WebKit bug 245510, and it's been open for years.)

What you get instead is a hardcoded blur:

```css
.glass {
  backdrop-filter: blur(15px);
  /* A weak fallback, not refraction */
}
```

It's not refraction. It's not even real motion parallax. It's an image smudged sideways. On a bright iPhone screen, it looks flat.

---

## The Workaround: SVG Filters Outside backdrop-filter

Here's the insight that changes everything: **Safari can't run SVG filters *inside* `backdrop-filter`, but it CAN run them in a regular element's `filter` property.**

```css
.element {
  filter: url(#displacement-svg);
  /* This works on Safari. */
}
```

The caveat? `filter` doesn't blur the layer *behind* an element — it distorts the element itself. So you need to give the glass something to distort: a *copy* of the background.

On Chromium, you ignore this copy. The real `backdrop-filter` refraction is free; you don't pay for a duplicate DOM.

On Safari/iOS/Firefox, you activate the copy — a **live-DOM mirror** of the element sitting behind the glass. When the user moves the lens or the background updates, the mirror updates too. Then the SVG `feDisplacementMap` distorts this clone, and boom — real refraction, no WebGL, no Three.js.

---

## The Live-DOM Mirror Explained

Let me walk through the flow with a concrete example. Say your page looks like this:

```jsx
function Card() {
  const bgRef = useRef(null);

  return (
    <div style={{ position: 'relative' }}>
      {/* This is what sits behind the glass */}
      <div ref={bgRef} style={{ width: '300px', height: '200px' }}>
        <img src="background.jpg" style={{ width: '100%', height: '100%' }} />
      </div>

      {/* This is the glass overlay */}
      <div style={{ position: 'absolute', top: '20px', left: '20px' }}>
        <LiquidGlass backdropRef={bgRef}>
          <div style={{ padding: '20px' }}>
            <h2>Refracted Text</h2>
          </div>
        </LiquidGlass>
      </div>
    </div>
  );
}
```

**On Chromium:**
- `backdropRef` is ignored.
- The glass uses `backdrop-filter: url(#svg-displacement)`.
- The background image refracts naturally. Zero overhead.

**On Safari/iOS/Firefox:**
- The component detects the engine and activates the mirror.
- It clones the element referenced by `backdropRef` (the background div with the image).
- The clone is positioned *inside* the glass, behind the text content.
- An SVG `feDisplacementMap` distorts this clone in real time.
- When the background updates, the mirror updates. When the glass moves, the clone tracks it.
- Result: real, animated refraction.

The reason you must pass `backdropRef` explicitly is safety. Auto-detecting the background means cloning ancestors, which on iOS Safari can exhaust memory and crash the tab. So it's a required opt-in, not magic.

---

## Performance: It's Lean Because It's Tiny

A common worry: isn't cloning the DOM expensive?

The answer depends on what's behind the glass. If it's a small card or gradient, the clone is negligible. If it's a 4K photo, it still renders at the lens size — not the full image size.

The refraction filter itself is also lens-sized. A 200×200px glass button has a 200×200px displacement shader, not a page-wide one. The iOS cost scales linearly with lens area, not viewport size.

Plus:
- **Off-screen lenses pause**: If the glass scrolls out of view, the mirror and filter pause.
- **Re-alignment is throttled**: When the lens moves, the mirror repositions at roughly 30fps, not every frame — enough to feel smooth without the overhead.
- **The clone only exists on Safari/iOS/Firefox**: On Chromium, the extra DOM is zero.

For a typical app with a few glass elements, the performance cost is unnoticeable.

---

## Quick Start: Three Lines to Real iPhone Refraction

If you want the real refraction on iOS without the deep dive, here's the recipe:

```jsx
import { useRef } from 'react';
import { LiquidGlass } from 'simple-liquid-glass';

function MyCard() {
  const bg = useRef(null);

  return (
    <div style={{ position: 'relative', width: '300px', height: '200px' }}>
      {/* The background behind the glass */}
      <div 
        ref={bg} 
        style={{
          backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          width: '100%',
          height: '100%'
        }}
      />

      {/* The glass — refracted on iOS, native backdrop-filter on Chrome */}
      <LiquidGlass 
        backdropRef={bg}
        radius={24}
        track
        style={{
          position: 'absolute',
          top: '50px',
          left: '50px',
          width: '200px',
          height: '100px'
        }}
      >
        <div style={{ padding: '20px', fontSize: '14px', fontWeight: '500' }}>
          Real refraction on iPhone
        </div>
      </LiquidGlass>
    </div>
  );
}

export default MyCard;
```

The props you're seeing:
- `backdropRef`: Points to the element behind the glass.
- `radius`: Rounded corners (matches the glass size for consistency).
- `track`: Re-aligns the mirror when the lens moves (animations, drag).

That's it. On iOS, you get true distortion. On Chrome, you get native refraction. On Android Firefox, you also get the mirror.

---

## Beyond the Basics: Interactive & Web Components

If you want the glass to respond to the user's pointer — leaning slightly toward the cursor, a gloss highlight tracking movement — there's an opt-in export:

```jsx
import { LiquidGlassInteractive } from 'simple-liquid-glass/interactive';

<LiquidGlassInteractive elasticity={0.3}>
  {/* Follows pointer, respects prefers-reduced-motion */}
</LiquidGlassInteractive>
```

Not building in React? No problem. There's a framework-agnostic web component:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>

<liquid-glass 
  radius="20" 
  frost="0.15" 
  style="width:320px; height:200px; display:block"
>
  Works in Vue, Svelte, Astro, or vanilla HTML
</liquid-glass>
```

---

## Real-World Gotchas & Limitations

Be honest with yourself: the live-DOM mirror isn't magic, and it has constraints.

**The `backdropRef` is required on Safari/iOS/Firefox.** You can't auto-detect it safely. If you don't pass it, the library falls back to a frosted-blur effect — still polished, but not refraction.

**The backdrop must be a sibling or background element, not an ancestor.** If you try to mirror the glass's parent, you get a circular dependency (the clone references itself), which degrades to blur. Think of the backdrop as a separate layer, not a container.

**The larger the lens, the more work iOS does.** A 600×400px glass panel does real work on iOS. A 100px button is free. Size your lenses sensibly.

**Updates must be natural DOM mutations.** If the background changes (image swap, CSS update), the mirror sees it. But if you're rendering a WebGL canvas or Video element as the backdrop, the clone won't capture that — it'll show the last static frame. For most apps (cards, gradients, images), this is fine.

**It works on iPad too.** Full refraction, same performance profile as iPhone.

---

## Why This Matters Now

The Apple Liquid Glass trend is on a billion devices as of mid-2026. Users expect glass on their iPhones. If your web app has a dull blur or no effect at all on Safari, it feels unfinished next to native apps.

The refraction technique doesn't require WebGL, Three.js, or a 6MB bundle. It's a small SVG filter, a DOM clone, and a bit of positioning math. If you're already using React, you have all the tools you need.

---

## One More Thing: The Bundle Size

The core library is ~6.5 KB (gzip, excluding React). That includes the SVG displacement engine, the iOS mirror logic, all the props for customization, and the TypeScript types. If you add the interactive pointer-tracking variant, you're at ~9 KB. The web component is ~6 KB on its own.

No runtime dependencies. Just React (which you're already using).

---

## Wrapping Up

Real glass refraction on the web isn't a myth, and it doesn't require abandoning Safari users or shipping heavy bundles. It's a clever browser API trick — running SVG filters outside `backdrop-filter` on the fallback engines — that delivers the same visual on every platform.

If you're building with React and want your liquid glass to look professional on iPhone, the pieces are here. Pass `backdropRef`, set `track` if the lens moves, and let the browser do the heavy lifting.

The live demo is on [simple-liquid-glass.vercel.app](https://simple-liquid-glass.vercel.app/). Pull it up on your iPhone and watch the refraction work. Then check it on Chrome. Same component, two different techniques under the hood — both honest, both fast.

Happy building.

---

**Links:**
- [simple-liquid-glass on npm](https://www.npmjs.com/package/simple-liquid-glass)
- [GitHub repo](https://github.com/lucaperullo/simple-liquid-glass)
- [Live demo](https://simple-liquid-glass.vercel.app/)
- [WebKit bug 245510 (backdrop-filter SVG)](https://bugs.webkit.org/show_bug.cgi?id=245510)
- [caniuse: filter](https://caniuse.com/css-filters) (filter property on elements)
