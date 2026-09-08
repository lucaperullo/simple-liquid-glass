# Simple Liquid Glass

> **Zero-dependency liquid glass for React 16.8–19, with SVG refraction and an explicit backdrop mirror for Safari and Firefox.**

An Apple-style glass effect with displacement, chromatic aberration, gradient borders, and automatic text color. Includes an optional interactive component and a framework-agnostic web component. Server-rendering and hydration are tested alongside browser behavior.

[![npm version](https://img.shields.io/npm/v/simple-liquid-glass)](https://www.npmjs.com/package/simple-liquid-glass)
[![npm downloads](https://img.shields.io/npm/dw/simple-liquid-glass)](https://www.npmjs.com/package/simple-liquid-glass)
[![bundle size](https://deno.bundlejs.com/badge?q=simple-liquid-glass)](https://bundlejs.com/?q=simple-liquid-glass)
[![GitHub stars](https://img.shields.io/github/stars/lucaperullo/simple-liquid-glass?style=flat)](https://github.com/lucaperullo/simple-liquid-glass)
[![license](https://img.shields.io/npm/l/simple-liquid-glass)](https://github.com/lucaperullo/simple-liquid-glass/blob/main/LICENSE)

**[🔗 Live demo](https://simple-liquid-glass.vercel.app/)** · **[📦 npm](https://www.npmjs.com/package/simple-liquid-glass)** · **[📖 Changelog](CHANGELOG.md)**

> [!IMPORTANT]
> **For Safari/iOS rim magnification or Firefox mirror refraction, pass `backdropRef`** pointing to a sibling background element. Without an explicit source the component uses frosted CSS.

## Why simple-liquid-glass?

- No runtime dependencies; React is a peer dependency for the React entry points.
- Chromium SVG backdrop refraction, plus an explicit DOM mirror on Safari/Firefox.
- React 16.8–19 compatibility checked with server rendering, hydration, and unmount tests.
- A separate web component for other frameworks, with a frosted fallback on Safari/Firefox.
- Enforced bundle budgets and browser integration tests in Chromium, Firefox, and WebKit.

### Choose your path

- **React, simple** → `import { LiquidGlass } from 'simple-liquid-glass'`
- **Pointer-reactive / “alive”** → `import { LiquidGlassInteractive } from 'simple-liquid-glass/interactive'`
- **Vue / Svelte / Astro / plain HTML** → `import 'simple-liquid-glass/web-component'` → `<liquid-glass>`

## Features

- **Liquid glassmorphism** with SVG displacement
- **Auto text color**: detects dark/light backgrounds to keep text legible
- **Custom glass color**: accepts only semi‑transparent colors (`rgba`, `hsla`, hex with alpha)
- **Background support**: solid colors and gradients with automatic transparency conversion
- **Chromatic dispersion** and **blur** with fine‑grained controls
- **Adjustable saturation** to boost or tame color vibrancy
- **Chromatic aberration intensity** control to tune the vividness of the edge colors
- **Gradient border** with masking
- **Responsive** and content‑agnostic
- **TypeScript** and tree‑shakable builds (ESM and CJS)

## Installation

```bash
npm install simple-liquid-glass
```

or with yarn:

```bash
yarn add simple-liquid-glass
```

## Usage

### Basic Usage

```jsx
import React from 'react';
import { LiquidGlass } from 'simple-liquid-glass';

function App() {
  return (
    <div style={{ width: '300px', height: '200px' }}>
      <LiquidGlass autoTextColor background="rgba(255,255,255,0.4)">
        <div style={{ padding: '20px' }}>
          <h2>Your Content Here</h2>
          <p>This content has a liquid glass effect!</p>
        </div>
      </LiquidGlass>
    </div>
  );
}
```

### Backdrop mirrors on Safari / iOS / Firefox

The built-in mirror copies an explicit background element. Firefox uses SVG displacement on
that copy. Safari/iOS uses **CSS rim magnification** to avoid native Safari's incorrectly positioned
SVG displacement textures. A masked, mildly magnified copy appears only around the rounded rim;
the original background remains visible through the clear center. This is an optical approximation,
not arbitrary per-pixel refraction, and high-contrast edges can show blending.

```jsx
import { useRef } from 'react';
import { LiquidGlass } from 'simple-liquid-glass';

function Card() {
  const bg = useRef(null);
  return (
    <div style={{ position: 'relative' }}>
      <div ref={bg}>{/* the background that sits behind the glass */}</div>
      <LiquidGlass backdropRef={bg} radius={24} track>
        <div style={{ padding: 20 }}>Glass with optical rims on iOS</div>
      </LiquidGlass>
    </div>
  );
}
```

Per engine:

- **Chromium** → real `backdrop-filter` refraction (the mirror stays off — nothing to pay for)
- **Safari / iOS** with a `backdropRef` → CSS rim magnification over a live copy
- **Firefox** with a `backdropRef` → SVG displacement over a live copy
- **Safari / iOS / Firefox** without a usable backdrop → frosted-blur fallback

**Why you must pass `backdropRef`.** The library can't safely *guess* what's behind a floating
glass panel. Auto-detecting it means cloning a page-sized ancestor, which exhausts iOS Safari's
memory and crashes the tab — so it's required, not magic. Point `backdropRef` (or `backdropSelector`)
at the element behind the lens; it must be a **sibling/background**, **not an ancestor** of the lens
(an ancestor would mirror the glass into itself — that case degrades to blur). Notes:

- `track` — re-align the clone at approximately 30 Hz when the lens or background **moves** (translation/animation).
- `mirrorScale` — requested distortion strength (default 26), capped to half the optical rim width to avoid folds. `0` disables displacement. `mirror={false}` — opt out (blur on iOS).
- Keep lenses modest in size — the iOS filter cost scales with lens area.

> `LiquidGlassMirror` from `simple-liquid-glass/mirror` still exists as a thin back-compat wrapper
> (it just forwards to `<LiquidGlass>`), but it's no longer needed — the core does this directly.

### Pointer‑reactive elasticity — `LiquidGlassInteractive`

```jsx
import { LiquidGlassInteractive } from 'simple-liquid-glass/interactive';

// Leans toward the cursor with a tiny spring + a pointer‑tracked specular highlight.
// Honors prefers-reduced-motion. Core import is unaffected (this is opt‑in).
<LiquidGlassInteractive elasticity={0.3}>…</LiquidGlassInteractive>
```

### Framework‑agnostic web component — `<liquid-glass>`

For Vue / Svelte / Angular / Astro / plain HTML (no React):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
<liquid-glass radius="20" frost="0.15" style="width:320px;height:200px;display:block">
  Glass anywhere
</liquid-glass>
```

**Per-framework guides:** [Vue 3 / Nuxt](docs/frameworks/vue.md) · [Svelte / SvelteKit](docs/frameworks/svelte.md) · [Astro](docs/frameworks/astro.md) · [plain HTML / vanilla JS / Angular](docs/frameworks/vanilla.md). (The web component does Chromium refraction + a frosted fallback on Safari/iOS; for real iOS refraction use the React `backdropRef` path above.)

### Advanced Usage with Custom Settings

```jsx
import React from 'react';
import { LiquidGlass } from 'simple-liquid-glass';

function App() {
  return (
    <div style={{ width: '400px', height: '300px' }}>
      <LiquidGlass
        mode="custom"
        scale={200}
        radius={20}
        border={0.1}
        lightness={60}
        displace={0.5}
        alpha={0.8}
        blur={10}
        dispersion={30}
        frost={0.2}
        background="linear-gradient(45deg, #ff6b6b, #4ecdc4)"
        autoTextColor
        textOnDark="#ffffff"
        textOnLight="#111111"
        forceTextColor
        borderColor="rgba(255, 255, 255, 0.5)"
        className="my-glass-container"
        style={{ boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)' }}
      >
        <div style={{ padding: '30px' }}>
          <h1>Custom Glass Effect</h1>
          <p>Fully customized liquid glass morphism with gradient background</p>
        </div>
      </LiquidGlass>
    </div>
  );
}
```

### Preset Mode

The component comes with a beautiful preset that works out of the box:

```jsx
<LiquidGlass mode="preset">
  <YourContent />
</LiquidGlass>
```

Note: In `preset` mode, incoming props still override the preset defaults (e.g., `scale`, `radius`, `blur`, etc.).
On iOS, when `iosBlurMode` is `'auto'`, a minimal blur (`iosMinBlur`, default 7px) is applied even if `blur` is 0 to ensure a visible fallback effect.

The `background` prop automatically converts solid colors and gradients to semi-transparent (30% opacity) for better glass effects. Images (URLs) are left unchanged.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Content to display inside the glass effect |
| `mode` | `'preset' \| 'custom'` | `'preset'` | Use preset values or custom configuration |
| `scale` | `number` | `160` | Scale of the displacement effect (-360 to 360) |
| `radius` | `number` | `50` | Border radius of the glass effect |
| `border` | `number` | `0.05` | Border thickness (0 to 0.5) |
| `lightness` | `number` | `53` | Lightness of the glass (0 to 100) |
| `displace` | `number` | `5` | Displacement blur amount (0 to 10) |
| `alpha` | `number` | `0.9` | Alpha transparency (0 to 1) |
| `blur` | `number` | `0` | Blur amount for the glass effect |
| `dispersion` | `number` | `50` | Chromatic dispersion amount |
| `saturation` | `number` | `140` | Color saturation multiplier (%) applied via CSS `saturate()` |
| `aberrationIntensity` | `number` | `0` | Multiplier for chromatic aberration (red/blue separation) |
| `frost` | `number` | `0.1` | Frost effect intensity (0 to 1) |
| `borderColor` | `string` | `'rgba(120, 120, 120, 0.7)'` | Border color in CSS format |
| `glassColor` | `string` | `'rgba(255, 255, 255, 0.4)'` | Semi‑transparent glass color (`rgba`, `hsla`, `hsl(.../a)`, `#RGBA`, `#RRGGBBAA`). Invalid/opaque values fall back to frost‑based default |
| `background` | `string` | - | Background color or gradient (automatically made semi-transparent) |
| `autoTextColor` | `boolean` | `false` | Automatically detect background luminance and set text color |
| `textOnDark` | `string` | `'#ffffff'` | Text color used when background is detected as dark |
| `textOnLight` | `string` | `'#111111'` | Text color used when background is detected as light |
| `forceTextColor` | `boolean` | `false` | Force the computed text color on all descendants (`!important`) to override nested styles |
| `className` | `string` | - | Additional CSS class names |
| `style` | `CSSProperties` | - | Additional inline styles |
| `quality` | `'low' \| 'standard' \| 'high' \| 'extreme'` | `'low'` | Rendering quality preset. `'extreme'` matches previous versions' visuals |
| `autodetectquality` | `boolean` | `false` | Auto-detect device performance and pick a quality preset |
| `mobileFallback` | `'css-only' \| 'svg'` | CSS-only on mobile | Control mobile rendering strategy |
| `effectMode` | `'auto' \| 'svg' \| 'blur' \| 'off'` | `'auto'` | Control effect: auto, force SVG, force CSS blur, or disable |

## Examples

### Background with Gradient

```jsx
<LiquidGlass 
  background="linear-gradient(45deg, #ff6b6b, #4ecdc4)"
  autoTextColor
>
  <div style={{ padding: '20px' }}>
    <h2>Gradient Background</h2>
    <p>This uses a gradient background that's automatically made semi-transparent!</p>
  </div>
</LiquidGlass>
```

### Quality Presets and Autodetection

```jsx
// Manual quality
<LiquidGlass quality="high" background="rgba(255,255,255,0.35)">
  <Content />
</LiquidGlass>

// Autodetect device performance and choose quality automatically
<LiquidGlass autodetectquality background="rgba(255,255,255,0.35)">
  <Content />
</LiquidGlass>

// Note:
// - Default quality is 'low'.
// - 'extreme' produces the same visual fidelity as previous versions of this component.
// - For many instances on the same page, prefer quality='low' or autodetectquality.
```

### Mobile Fallback Control

```jsx
// Force CSS-only (strongest performance) even on desktop
<LiquidGlass mobileFallback="css-only" />

// Force SVG filter on mobile (may impact performance)
<LiquidGlass mobileFallback="svg" />

// Default behavior: CSS-only on mobile, SVG on desktop
<LiquidGlass />
```

## Browser Support & Rendering Strategies

SVG filters inside `backdrop-filter` (`url(#...)`) only work in **Chromium** (Chrome, Edge, Opera, Android Chrome). Safari/iOS WebKit ([bug 245510](https://bugs.webkit.org/show_bug.cgi?id=245510)) and Firefox silently ignore them, so the component picks a strategy per engine:

| Engine | `effectMode="auto"` |
|--------|--------------------|
| Chromium desktop | SVG displacement (full effect) |
| Chromium Android | Layered CSS (perf) — opt into SVG with `mobileFallback="svg"` |
| Safari / iOS browsers | CSS rim magnification with `backdropRef`; frosted CSS otherwise |
| Firefox | DOM mirror with `backdropRef`; frosted CSS otherwise |

**Frosted CSS fallback:** blur, tint, saturation, and inset highlights provide the glass appearance when no usable mirror backdrop is provided. Performance depends on lens size, scene complexity, and device.

The experimental WebGL mode from 1.4.x was removed in 2.0.0. Current React builds use the explicit DOM mirror described above for fallback-engine refraction.

## Performance and Fallbacks

- **Default behavior**: on mobile devices the component uses a CSS-only effect to avoid jank; on desktop it uses the SVG filter.
- **Quality presets**: `'low'` is the default and optimized for many instances; `'extreme'` matches previous visuals.
- **Autodetection**: set `autodetectquality` to let the component choose a preset based on device performance.
- **Effect Mode**: use `effectMode` to force the strategy.

```jsx
// Force CSS-only blur (no SVG) — recommended on very low-end devices
<LiquidGlass effectMode="blur" />

// Disable all filter effects (keeps border/frost/background)
<LiquidGlass effectMode="off" />

// Request SVG refraction on supported engines
<LiquidGlass effectMode="svg" />
```

### Card with Glass Effect

```jsx
<div className="card-container" style={{ 
  width: '350px', 
  height: '200px'
}}>
  <LiquidGlass 
    radius={15} 
    frost={0.15} 
    autoTextColor 
    background="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
  >
    <div style={{ padding: '24px', height: '100%' }}>
      <h3 style={{ marginBottom: '12px' }}>
        Glass Card
      </h3>
      <p>
        This is a beautiful glass morphism card with liquid distortion effects and gradient background.
      </p>
    </div>
  </LiquidGlass>
</div>
```

### Overlay Effect

```jsx
<div style={{ position: 'relative', width: '100%', height: '400px' }}>
  <img src="background.jpg" alt="Background" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  
  <div style={{ 
    position: 'absolute', 
    top: '50%', 
    left: '50%', 
    transform: 'translate(-50%, -50%)',
    width: '300px',
    height: '150px'
  }}>
    <LiquidGlass autoTextColor background="rgba(255,255,255,0.4)">
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Overlay Content</h2>
        <p>Glass effect over image</p>
      </div>
    </LiquidGlass>
  </div>
</div>
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

The component leverages modern CSS (`backdrop-filter`) and SVG filters. Older browsers may not support all effects.

## Performance Tips

1. The component uses `ResizeObserver` to adapt to size changes efficiently
2. SVG filters are hardware-accelerated in modern browsers
3. For best performance, avoid animating the glass parameters rapidly
4. Use the `preset` mode for optimal default settings

## Accessibility

- `autoTextColor` uses computed styles from the nearest opaque ancestor to decide between `textOnDark` and `textOnLight`. This helps maintain readable contrast automatically. You can set `forceTextColor` to enforce the computed color on deeply nested content.

## Storybook

Run a live playground:

```bash
npm run storybook
```

Switch the Backgrounds toolbar between light/dark to see text color adapt in real time.

## License

MIT © [lucaperullo]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Support

If you find this package helpful, please consider giving it a star on GitHub!

## Keywords

react, react component, react ui, glassmorphism, glass morphism, liquid glass, liquid-glass, glass effect,
frosted glass, frosted-glass, blur, blur effect, backdrop-filter, svg filter, displacement, displacement map,
chromatic aberration, ui effects, card, overlay, glass ui, glass card, glass panel, glassmorphism react

For issues and feature requests, please [create an issue](https://github.com/lucaperullo/simple-liquid-glass/issues).
## Compatibility and validation

React 16.8/17 uses a mount-time ID fallback; React 18/19 uses React's hydration-safe IDs. Browser-dependent effects activate after hydration. When using multiple React 18+ roots, provide distinct React `identifierPrefix` values on the server and client.

The JavaScript build targets Chrome 64, Firefox 69, and Safari 12 syntax. Actual visual effects depend on browser CSS/SVG support; automated browser checks run against current Chromium, Firefox, and WebKit, not every historical release. Missing `ResizeObserver` falls back to window resize events.

The mirror is a decorative DOM snapshot. Use a small, explicit sibling backdrop. Canvas pixels, video playback, shadow-root contents, inherited contextual styles, and CSS animations are not guaranteed to match the source. The root’s computed presentation is copied before IDs are namespaced; descendant contextual styles can still differ. Prefer class-based styling. A six-panel scene was measured on an iPhone 15 Pro (Safari 26.6.1); complex scenes still require their own physical-device visual and performance checks.

`effectMode="off"` removes backdrop filtering. `effectMode="blur"` disables the mirror and uses the CSS fallback. The web component can be imported during SSR; instantiate it only in a browser. Install React and React DOM explicitly when using a React entry point; the web component needs neither.

### Development checks

```sh
npm ci
npm run typecheck
npm test -- --runInBand
npm run build
npm run size
npm run test:compat
npx playwright install chromium firefox webkit
npm run test:browser
```

Public TypeScript declarations are generated from source during the build. Bundle budgets use **Brotli**, not gzip. CI also checks React 16.8.6, 17.0.2, 18.3.1, and 19 in isolated installations.

### Safari lens optics

Safari/iOS bypasses SVG filters for the mirror. A cached alpha mask reveals a magnified source copy at the rounded rim, leaving the center clear. `mirrorScale` controls the magnification and is bounded by panel geometry; zero gives no optical offset. Firefox retains the rounded-rectangle SVG displacement map. Both maps are generated only for active mirrors, with neither dimension above 256 pixels.

Use `track` for translated lenses or backgrounds. Root transforms are represented by the copy's alignment and are not replayed on the copy. Rotation, scaling, and animations inside the backdrop remain outside the supported alignment contract. The web component still uses its frosted Safari fallback.

Core is 8.79 kB Brotli, interactive 9.74 kB, and mirror 8.86 kB. Existing 9/10/9 kB budgets pass.

The prior SVG mirror failed physical iPhone visual validation despite automated WebKit pixel checks passing. The replacement CSS path visibly renders all six rims in native Safari 26.5 in the iPhone simulator, with sharp centers; physical-device aesthetic acceptance remains pending. Blending near high-contrast text is a known limitation of the approximation. Earlier device timings are retained as historical measurements, not evidence that the failed SVG visuals worked. See [validation notes](docs/superpowers/plans/2026-09-08-safari-lens.md).

### Rounded native refraction (Chromium)

`refraction="lens"` uses the MIT-licensed rounded lens generator and native SVG
material filter adapted from samasante/liquid-glass. The pinned source revision,
adaptations and license are recorded in THIRD_PARTY_NOTICES.md and included in
the published package. No UI branding or runtime dependency is added.

```tsx
<LiquidGlass refraction="lens" quality="high" radius={32} scale={160}
  blur={2} saturation={115} aberrationIntensity={0.32}
  glassColor="rgba(255,255,255,0.06)">
  Navigation
</LiquidGlass>
```

Set `lensProfile="loupe"` for the stronger playground optics (14% baseline strength, deeper curvature and brighter sheen). The default `lensProfile="player"` uses the stronger player shape at 80 CSS pixels of displacement. `lensProfile="material"` remains available for gentler surface settings.

The existing prop names remain. For this mode, `scale={160}` maps to the material's
baseline strength (80 CSS pixels for the default player profile); 0 disables displacement,
and 320 doubles it. `dispersion={50}` with `aberrationIntensity={0.32}` produces
0.32 normalized color separation. Low quality uses one displacement pass.
Blur precedes refraction, and the map's blue channel supplies the directional sheen.
The 512×512 map is cached by geometry; strength, blur and color adjustments reuse it.

The rounded lens is now the default. The original gradient look is available with `refraction="classic"`, with
strength bounded to 10% of the shorter side to prevent extreme tearing. Native
filters have explicit sampling bounds and neutral padding. This does not add iOS
refraction support. The experimental GPU and video demos have been removed.

For matching a video surface's refraction strength, set `displacementScale` to
`strength * Math.hypot(surfaceWidth, surfaceHeight) / Math.SQRT2`. This optional
CSS-pixel override applies only to `refraction="lens"`, bypassing the
preset `scale` calculation. Omit it to retain existing behavior.

### Upgrading from 4.1

Version 5 changes the React default to a rounded player lens with 80px base
displacement. `scale={160}` is the baseline; `0` disables it and `320` doubles it.
Existing `angle`, `shapeAdapt`, `lens`, `lensStrength`, and `lensCenter` props
select the compatible 4.x renderer automatically. `liquid`, `liquidSpeed`, and
`liquidScale` remain supported, including reduced-motion handling. The web
component retains its 4.1 directional and animated controls and appearance.
Experimental GPU/video components are not included.

### Individual lens controls (5.1)

Use `lensOptions` to override any part of a rounded lens. Unset values inherit
`lensProfile` (default: `player`); existing applications retain their appearance.

```tsx
import { LiquidGlass, type LensOptions } from 'simple-liquid-glass';

const optics: LensOptions = {
  strength: 0.14, depth: 0.15, curvature: 0.45,
  bend: 0.55, bendWidth: 0.3,
  sheen: 2, sheenWidth: 10, specular: 1.6, sheenAngle: 0,
  glow: 0.1, brightness: 0,
};

<LiquidGlass refraction="lens" lensProfile="player" lensOptions={optics}
  quality="extreme" blur={1} radius={32}>
  <YourContent />
</LiquidGlass>
```

| Option | Range | Meaning |
| --- | --- | --- |
| `strength` | 0–0.5 | Relative displacement strength |
| `depth` | 0–1 | How far refraction reaches inward |
| `curvature` | 0–1 | Body dome curvature |
| `bend` | 0–1 | Inner-edge bend intensity |
| `bendWidth` | 0.001–0.5 | Edge-band width relative to the smaller dimension |
| `sheen` | 0–2 | Directional sheen intensity |
| `sheenWidth` | 0–10 | Sheen thickness in pixels |
| `sheenFalloff` | 0.1–5 | Sheen falloff exponent |
| `sheenAngle` | -360–360 | Light direction in degrees |
| `specular` | 0–3 | Overall highlight gain |
| `glow` | 0–1 | Inner glow intensity |
| `glowSpread` | 0.01–2 | Inner glow reach |
| `glowFalloff` | 0.1–5 | Inner glow falloff exponent |
| `brightness` | -1–1 | Black-to-white surface veil opacity |

`displacementScale`, when provided, takes precedence over `lensOptions.strength`.
The existing `scale` multiplier still applies to relative strength. `blur`,
`frost`, `dispersion`, and `aberrationIntensity` remain top-level props.
`lensOptions` affects `refraction="lens"` on React components, including the
interactive export. It does not alter the classic renderer or add optical
refraction to Safari/Firefox's blur fallback. The brightness veil also works on
that fallback. The web component does not expose this API.

`LENS_PROFILES`, `LENS_OPTION_RANGES`, and `resolveLensOptions(profile, overrides)`
are exported for building settings panels without duplicating defaults. Values
are clamped to these ranges; non-finite values inherit the selected profile.
Geometry changes invalidate cached maps; strength, specular, and brightness do not.
