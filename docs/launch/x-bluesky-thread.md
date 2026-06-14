# X / Bluesky copy

> Demo-first. Attach the 20s iPhone refraction clip to post 1. **Put links in a REPLY, not post 1**
> (protects reach). Space thread posts 2–5 min apart. Verify the demo on a real iPhone first.

## Thread (attach the iPhone clip to 1/)

**1/** Dragging a glass pane over a busy photo on a real iPhone — the background *bends and refracts*
through it in real time. Not a blur. Not a fallback. Real distortion.

The only zero-dependency liquid-glass library with actual refraction on iPhone & Safari. React
16.8–19. ~6.5KB.

**2/** Safari/iOS/Firefox can't run SVG filters inside CSS `backdrop-filter` (WebKit bug 245510).
Every other library hits that wall and falls back to blur.

So we asked: what *can* those engines do?

**3/** They CAN run `feDisplacementMap` on a regular element's `filter`. So when you pass
`backdropRef` (the element behind the lens), the component renders a live, displaced clone of it.
Refractive distortion, not CSS blur.

~30fps on iPhone. Off-screen lenses pause. The filter scales to the lens, not the page.

**4/** Chromium gets native SVG displacement in `backdrop-filter`. iOS/Safari/Firefox gets the
live-DOM mirror. All three get real glass — different rendering paths, one component.

**5/** Chromatic aberration. Gradient borders. Auto text-color. Pointer elasticity (interactive
variant). A framework-agnostic web component. React 16 → 19. SSR-safe. TypeScript. ~6.5KB.

**6/** For contrast: liquid-glass-react (~33KB) hasn't shipped since June 2025 and is React-19-only;
@specy/liquid-glass pulls in Three.js (6.8MB). We went zero-deps + real refraction instead.

**7/** Drop it into React, or use the web component in Vue/Svelte/Astro.
↓ links in the reply. If it helps, a GitHub star means a lot.

**Reply to 1/:** github.com/lucaperullo/simple-liquid-glass · npm: simple-liquid-glass · demo:
simple-liquid-glass.vercel.app

## Standalone single-post variants

**Trend angle —** Apple shipped "Liquid Glass" to a billion iOS devices and designers are asking for
it. Here's a zero-dependency React component that delivers *real refraction on iPhone & Safari* — not
blur. 6.5KB. React 16–19. `simple-liquid-glass` on npm.

**Competitor-reality angle (classy) —** Other liquid-glass libraries look great on Chromium. On
Safari/iOS? Blur fallback. So we solved WebKit bug 245510 with a live-DOM mirror — real distortion
where the others gave up. Zero deps, 6.5KB. github.com/lucaperullo/simple-liquid-glass

**Tiny + everywhere angle —** A glassmorphism library that's 6.5KB, zero runtime deps, supports React
16–19, ships a web component for Vue/Svelte/Astro, AND does real refraction on iOS. Most pick two.
`simple-liquid-glass` on npm.
