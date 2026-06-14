# Product Hunt launch copy

> Paste-ready. Launch Tue/Wed 00:01 PST, category Developer Tools. **Verify the demo on a real
> iPhone first.** Frame it as "iOS 26 Liquid Glass for the web," not "a React component."

## Name + Tagline

**Simple Liquid Glass — Real iOS refraction, zero dependencies, 6.5KB**

(alt: **Simple Liquid Glass — The only liquid-glass library with real refraction on iPhone & Safari**)

## What Is It

A tiny React component that renders Apple-style liquid glass — the glassmorphic overlay effect
shipping in iOS 26 and refreshed at WWDC 2026. What sets it apart: **real refraction on iPhone and
Safari**, not a blur fallback. While every other library falls back to a frosted blur on WebKit,
Simple Liquid Glass delivers actual light distortion via a live-DOM mirror on iOS, Safari, and
Firefox — and SVG displacement on Chromium. All in ~6.5 KB gzip, with zero runtime dependencies,
full TypeScript support, and SSR-safe code.

Built for React 16.8 through React 19. Works as a React component, a pointer-reactive interactive
variant with spring elasticity, or a framework-agnostic web component (`<liquid-glass>`) for Vue,
Svelte, Astro, and plain HTML. You get chromatic aberration, gradient borders, auto text-color
detection, and fine-grained refraction tuning — with sensible defaults that work out of the box.

The engineering story: WebKit (Safari/iOS/Firefox) can't run SVG filters inside CSS
`backdrop-filter` (WebKit bug 245510). But those engines *can* run `feDisplacementMap` in a regular
element's `filter` style. So the component includes a built-in mirror: when you point it at the
backdrop element, it renders a live, distorted clone of that content — true refraction, no extra
work. On Chromium it uses native SVG displacement. Off-screen lenses pause. Filter sizes scale with
the lens. All throttled to ~30fps on iOS for battery life. No WebGL, no Three.js, no heavy frameworks.

## The Maker's First Comment (the most important PH asset)

Hi! Luca here (@lucaperullo). I built this because I got tired of shipping liquid-glass UI that
looked broken on iPhones.

Last year Apple previewed their "Liquid Glass" design language — it's now shipping on 1B+ devices
across iOS 26. Designers love it. But every glass library I found either dropped Safari support (the
popular liquid-glass-react only targets React 19), or relied on WebGL/Three.js (6.8 MB) and *still*
degraded to a blur on iOS.

The wedge was WebKit bug 245510: SVG filters just don't work inside `backdrop-filter` on Safari. A
year ago that felt unsolvable. Then I realized WebKit *can* run `feDisplacementMap` in a regular DOM
element's `filter`. That's the real trick — the component detects iOS/Safari/Firefox and swaps to
rendering a live, displaced *clone* of the element behind the glass. Actual refraction, not a blur
approximation, and zero-cost when you don't need it (Chromium uses native CSS).

You pass `backdropRef` pointing at the element behind the lens. I made it explicit (not
auto-detected) because auto-detection on iOS would mean cloning page-sized ancestors, which crashes
Safari. Learned that one in the field.

The result: 6.5 KB, zero deps, React 16.8 to 19, SSR-safe, full TS, plus an interactive variant that
leans toward your cursor with spring elasticity, and a web component so Vue/Svelte/Astro folks get
the same thing.

Honest framing: this isn't a graphics engine. It's a smart rendering strategy for a specific UX
pattern that's now very much alive on iPhones. The demo is live at simple-liquid-glass.vercel.app
and validated on a real iPhone — open it on Chromium and iOS side by side and you'll see real
refraction on both.

**GitHub**: github.com/lucaperullo/simple-liquid-glass · **npm**: `npm install simple-liquid-glass`

Hope it saves you a few MB and a few headaches. Ship glass with confidence.

## 5 gallery / thumbnail captions (each = one screenshot or GIF to show)

1. **"Liquid glass with real refraction on iPhone — not blur."** *(Side-by-side video: the effect on
   Chromium desktop vs iOS Safari, the displaced clone visibly tracking the background.)*
2. **"Pointer-reactive glass that leans toward your cursor. Honors prefers-reduced-motion."** *(GIF of
   the interactive variant responding to the mouse, with a subtle specular highlight.)*
3. **"Gradient borders, chromatic aberration, auto text-color — in ~6.5 KB gzip."** *(Card on a
   gradient background showing colored edge separation and legible text.)*
4. **"React 16.8–19, web component for Vue/Svelte/Astro, SSR-safe. One component, everywhere."**
   *(Split screen: React `<LiquidGlass>` and the same effect as `<liquid-glass>` in HTML.)*
5. **"Zero runtime dependencies. No Three.js, no WebGL hacks. Just smart refraction."** *(Bundle-size
   bar chart: 6.5 KB vs competitors' 6.8 MB / 33 KB.)*

## Topics / categories

React UI Components · Glassmorphism / Glass UI · CSS & Web Design · Design System Utilities ·
Developer Tools · Web Components · Open Source

## "We're live on PH" share (X / Bluesky / Reddit)

> We shipped the only liquid-glass library with real refraction on iPhone & Safari — no blur
> fallback, no dependencies, 6.5 KB. Live now on Product Hunt → simple-liquid-glass.vercel.app

(shorter, for X) — Real iPhone refraction in a 6.5 KB, zero-dep React component. simple-liquid-glass
is live on Product Hunt.
