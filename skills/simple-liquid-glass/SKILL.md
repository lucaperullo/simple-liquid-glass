---
name: simple-liquid-glass
description: Use when building or editing UI with the `simple-liquid-glass` library — its React `<LiquidGlass>` / `<LiquidGlassInteractive>` components or the framework-agnostic `<liquid-glass>` web component. Covers Apple-style liquid glass with real SVG-displacement refraction, lens modes, animated "liquid" refraction, and pointer interaction. Trigger when code imports `simple-liquid-glass`, uses any of those elements, or the user asks to add a glass / frosted / refractive surface, glassmorphism, or an Apple-style lens.
---

# simple-liquid-glass

Zero-dependency React liquid glass with REAL refraction (SVG displacement map in `backdrop-filter`),
plus a framework-agnostic `<liquid-glass>` web component. React 16.8–19, SSR-safe.

The exhaustive API + recipes live in the package's **`llms.txt`** — read it for the full prop table.
This skill is the working summary + the rules that prevent the common mistakes.

## Imports

- `import { LiquidGlass } from 'simple-liquid-glass'` — the core component.
- `import { LiquidGlassInteractive } from 'simple-liquid-glass/interactive'` — adds pointer reactivity.
- `import 'simple-liquid-glass/web-component'` — registers `<liquid-glass>` (Vue/Svelte/Astro/HTML).

## The rules (get these right)

1. **Refraction (SVG displacement) is Chromium-only;** on Safari/iOS/Firefox it renders a frosted-glass
   fallback (no refraction, no workaround).
2. **Always give the element an explicit size** (the effect fills 100% of its box).
3. **`liquid` and the interactive `followPointer`/`clickRipple` are GPU-real and gated** (in-view only,
   pause on `prefers-reduced-motion`, Chromium). Use `liquid` per hero/element, not on hundreds of cards.
4. **`glassColor` must be semi-transparent** (rgba/hsla/hex+alpha) or it falls back to frost.
5. **`clickRipple`, `rippleIntensity`, `followPointer`, `liquidTrigger`, `elasticity`** are on
   `LiquidGlassInteractive` only — not the base component, not the web component.
6. **3.0 default change:** `shapeAdapt` defaults to `true` (refraction adapts to the element's shape).
   Pass `shapeAdapt={false}` only to reproduce the exact ≤2.x look.

## Key props (defaults)

Core: `radius` (50), `scale` (160, displacement strength), `frost` (0.1), `blur` (0),
`saturation` (140), `aberrationIntensity` (0), `borderColor`, `glassColor`, `autoTextColor` (false),
`quality` (`'low'`), `effectMode` (`'auto'`).

3.0 core: `angle` (0, degrees — directional, shape-true), `shapeAdapt` (true),
`lens` (`'classic' | 'convex' | 'shift' | 'rim'`), `lensStrength` (1), `lensCenter` ([0.5,0.5]),
`liquid` (`'ripple' | 'flow' | 'wobble' | false`), `liquidSpeed` (1), `liquidScale`.

Interactive extras: `elasticity` (0.15), `maxShift` (18), `specular` (false), `followPointer` (false),
`clickRipple` (`false | 'ripple' | 'drop'`), `rippleIntensity` (1),
`liquidTrigger` (`'always' | 'hover' | 'press'`).

Web component attributes are kebab-case (`shape-adapt`, `lens-strength`, `lens-center`, `liquid-speed`, …).

## Recipes

```tsx
// Basic
<LiquidGlass radius={24} style={{ width: 320, height: 180 }}>content</LiquidGlass>

// Lens modes + directional angle (3.0)
<LiquidGlass lens="convex" lensStrength={1.2} style={{ width: 200, height: 200 }} />
<LiquidGlass lens="shift" angle={30} style={{ width: 420, height: 64 }} /> {/* navbar */}

// Animated "liquid" refraction (3.0)
<LiquidGlass liquid="ripple" liquidSpeed={1} style={{ width: 320, height: 200 }} />

// Interactive: follow pointer + click ripples (3.0)
import { LiquidGlassInteractive } from 'simple-liquid-glass/interactive'
<LiquidGlassInteractive elasticity={0.3} followPointer clickRipple="drop">content</LiquidGlassInteractive>
```

```html
<!-- Web component (Vue/Svelte/Astro/HTML) -->
<script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
<liquid-glass radius="20" frost="0.15" lens="convex" style="width:320px;height:200px;display:block">Glass</liquid-glass>
```

## When verifying

Refraction only renders on Chromium; if you preview on WebKit/Firefox you'll see the frosted
fallback — that's expected, not a bug. Check `prefers-reduced-motion` is off when testing animated
`liquid` / ripples.
