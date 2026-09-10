# Simple Liquid Glass

> **Liquid glass for React 16.8–19, with automatic iOS WebGL refraction, optional Android WebGL, and SVG optics.**

An Apple-style glass effect with displacement, chromatic aberration, gradient borders, and automatic text color. Includes an optional interactive component and a framework-agnostic web component. Server-rendering and hydration are tested alongside browser behavior.

[![npm version](https://img.shields.io/npm/v/simple-liquid-glass)](https://www.npmjs.com/package/simple-liquid-glass)
[![npm downloads](https://img.shields.io/npm/dw/simple-liquid-glass)](https://www.npmjs.com/package/simple-liquid-glass)
[![bundle size](https://deno.bundlejs.com/badge?q=simple-liquid-glass)](https://bundlejs.com/?q=simple-liquid-glass)
[![GitHub stars](https://img.shields.io/github/stars/lucaperullo/simple-liquid-glass?style=flat)](https://github.com/lucaperullo/simple-liquid-glass)
[![license](https://img.shields.io/npm/l/simple-liquid-glass)](https://github.com/lucaperullo/simple-liquid-glass/blob/main/LICENSE)

**[🔗 Live demo](https://simple-liquid-glass.vercel.app/)** · **[📦 npm](https://www.npmjs.com/package/simple-liquid-glass)** · **[📖 Changelog](CHANGELOG.md)**

> [!IMPORTANT]
> **For WebGL refraction on iOS (or any platform with `renderer="webgl"`), use `LiquidGlassScene` or pass `backdropRef`** pointing to a sibling background element. Without either source the component uses frosted CSS.

## Why simple-liquid-glass?

- No additional renderer installation: WebGL and HTML capture are bundled. React is a peer dependency for React entry points.
- Automatic WebGL refraction on iOS; opt into it on Android or desktop with `renderer="webgl"`. Chromium SVG and desktop Safari/Firefox mirrors remain available.
- React 16.8–19 compatibility checked with server rendering, hydration, and unmount tests.
- A separate web component for other frameworks, with the same iOS WebGL engine.
- Enforced bundle budgets and browser integration tests in Chromium, Firefox, and WebKit.

## Automatic page backgrounds with `LiquidGlassScene`

Available in 5.3.0 through the optional `simple-liquid-glass/backdrop` entry. Wrap the content you want to refract and the glass surfaces that use it:

```tsx
import LiquidGlass from 'simple-liquid-glass';
import { LiquidGlassScene } from 'simple-liquid-glass/backdrop';

export function Page() {
  return (
    <LiquidGlassScene>
      <section>{/* HTML, images, video, or canvas */}</section>
      <section>{/* More page content */}</section>
      <LiquidGlass style={{ position: 'fixed', bottom: 20 }}>
        Navigation
      </LiquidGlass>
    </LiquidGlassScene>
  );
}
```

iOS/iPadOS connects automatically. Use `renderer="webgl"` on a surface to opt in on Android or desktop. Existing `backdropRef` and `backdropSelector` props take precedence. SVG-only pages do not start a scene capture.

The scene shares section snapshots, fonts, mutation tracking, and a capture queue across its surfaces. Each visible lens gets a small moving canvas. Use direct-child sections to divide long pages into practical capture regions. A single large wrapper still works but is captured as one region. Keep sticky/parallax content in a separate explicit backdrop; continuously animated HTML styles cannot be reproduced at video-frame speed by cached snapshots.

`LiquidGlassScene` accepts normal div props and a div ref, plus `fontEmbedCSS`, `maxCacheBytes` (default 64 MiB, minimum 8 MiB), and `onCaptureError(error, section)`. Active snapshots may exceed the budget when needed to cover visible surfaces. Fonts/images must be accessible to browser capture; cross-origin media needs suitable CORS headers. Protected media, cross-origin iframes and shadow DOM are not guaranteed to capture.

Auto-connected surfaces are hidden in snapshots while retaining their layout footprint, preventing recursive rendering. Glass with an explicit source can be captured by other scene surfaces. Add `data-liquid-glass-ignore` to other content you want hidden in the capture. An initial CSS fallback is shown while the first snapshot is prepared.

Nested scenes bind to the nearest provider. Captures are released when the last consumer leaves. Call the glass handle's `refreshBackdrop()` after external theme/style changes; DOM edits and loads are tracked automatically.

### Liquid text and custom renderers

`simple-liquid-text` 0.3.0 automatically connects to the same provider:

```tsx
import LiquidGlass from 'simple-liquid-glass';
import { LiquidGlassScene } from 'simple-liquid-glass/backdrop';
import { LiquidGlassText } from 'simple-liquid-text';
import 'simple-liquid-text/styles.css';

<LiquidGlassScene>
  <section>{/* Background content */}</section>
  <LiquidGlassText renderer="webgl">Liquid type</LiquidGlassText>
  <LiquidGlass renderer="webgl">Shared background</LiquidGlass>
</LiquidGlassScene>
```

For a custom React renderer, `useLiquidGlassBackdrop(elementRef, enabled)` returns `{ backdropRef, connected, ready, refresh }`. Bind the returned canvas only when `connected && ready`, and disable this hook when supplying an explicit backdrop. `refresh` has stable identity.

For non-React integrations, `createLiquidGlassBackdrop(root, options)` returns a shared capture controller. Call `register(element, onReady)` to obtain `{ canvas, refresh, release }`, feed `canvas` to `createWebGLSurface`, then call `release()` and `destroy()` during teardown. The controller does not change renderer selection or mount WebGL outputs.

## Choose your path

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

### iOS refraction and Android opt-in

Pass the background element once. iOS automatically uses the optimized WebGL renderer,
including native overscroll tracking. For Android or desktop, add `renderer="webgl"`.
`renderer="auto"` preserves the existing choices on non-iOS devices. iOS uses WebGL even if
`renderer="svg"` or legacy `effectMode="svg"` is supplied; `effectMode="blur"` and `"off"`
still explicitly disable refraction.

```tsx
import { useRef } from 'react';
import { LiquidGlass } from 'simple-liquid-glass';

export function Page() {
  const background = useRef<HTMLDivElement>(null);
  return <>
    <div ref={background}>{/* Your page content */}</div>
    <LiquidGlass
      backdropRef={background}
      renderer="webgl" // Omit to enable WebGL automatically on iOS only.
      lensProfile="player"
      lensOptions={{ strength: 0.16 }}
      radius={36}
      style={{ position: 'fixed', bottom: 24, left: 16,
        width: 'calc(100% - 32px)', height: 72 }}
    >
      <nav>Home · Explore · Library</nav>
    </LiquidGlass>
  </>;
}
```

The source must be a sibling/background, never an ancestor of the glass. `backdropSelector`
is an alternative to a ref. Multiple panels can share the same source; HTML capture and its
observers are shared. Normal scrolling only changes the sample coordinates, without recapturing
HTML. React panels release their GPU resources when offscreen or unmounted. `track` is not
required for WebGL.

The WebGL renderer uses the package's canonical displacement map and existing `lensProfile`,
`lensOptions`, `scale`, `displacementScale`, `radius`, `dispersion`, `aberrationIntensity`, `blur`, and `saturation`
controls. As with SVG, low quality disables chromatic separation; otherwise it uses
`dispersion / 50 * aberrationIntensity` for rounded lenses. CSS tint, border, and brightness layers remain configurable. `mirror`/`mirrorScale`
only configure the older desktop Safari/Firefox mirror, not WebGL.

For live video, point `backdropRef` directly at a `<video muted autoPlay playsInline>` element.
A direct canvas source is live too. For HTML sources, text, attributes, images loading, inputs,
and size changes refresh the snapshot automatically at a bounded interval, including during continuous updates. Change
`backdropVersion` or call `ref.current.refreshBackdrop()` after changes outside the subtree,
such as a stylesheet/theme change. Refresh retains the previous frame until the new capture is
ready. `refreshBackdrop()` returns a promise and rejects if HTML capture fails.

Capture boundaries: this renders the explicit source, not arbitrary overlapping page layers.
Video/canvas nested inside an HTML source are snapshots; pass the media element itself for live
frames. Cross-origin media requires CORS permission; protected video and unsupported capture
content use the CSS fallback. CSS-only background animations require explicit refreshes; the
SVG `liquid` turbulence animation is not implemented in WebGL. Axis-aligned translation and scale
are supported; rotated/perspective source geometry and glass-through-glass compositing are not.
Long HTML sources use a bounded-resolution snapshot (up to 64 MiB). Keep backdrop regions focused
and panel counts modest: each visible panel owns a WebGL context.

Without a valid source, WebGL support, or a successful initial capture, the glass remains usable
with CSS blur. `onDiagnosticsChange`/`getDiagnostics()` report `webgl`, `ios-webgl`,
`webgl-requested`, or the fallback reason. Desktop Safari retains CSS rim magnification and
Firefox retains its DOM mirror when WebGL is not selected.

### Pointer‑reactive elasticity — `LiquidGlassInteractive`

```jsx
import { LiquidGlassInteractive } from 'simple-liquid-glass/interactive';

// Leans toward the cursor with a tiny spring. Pass specular to add a tracked highlight.
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

**Per-framework guides:** [Vue 3 / Nuxt](docs/frameworks/vue.md) · [Svelte / SvelteKit](docs/frameworks/svelte.md) · [Astro](docs/frameworks/astro.md) · [plain HTML / vanilla JS / Angular](docs/frameworks/vanilla.md). (The web component uses `backdrop-selector` for automatic iOS WebGL; `renderer="webgl"` enables it on other platforms.)

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
| `renderer` | `'auto' \| 'svg' \| 'webgl'` | `'auto'` | WebGL on iOS; opt in elsewhere with webgl |
| `backdropVersion` | `string \| number` | — | Change to refresh cached HTML |
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
| Chromium Android | Layered CSS — opt into WebGL with `renderer="webgl"` or SVG with `renderer="svg"` |
| iOS / iPadOS browsers | WebGL with `LiquidGlassScene` or `backdropRef`; frosted CSS otherwise |
| Desktop Safari | CSS rim mirror by default; WebGL with `renderer="webgl"` |
| Firefox | DOM mirror with `backdropRef`; frosted CSS otherwise |

**Frosted CSS fallback:** blur, tint, saturation, and inset highlights provide the glass appearance when no usable mirror backdrop is provided. Performance depends on lens size, scene complexity, and device.

The current WebGL renderer integrates the optimized direct-output pipeline tested in the scenario lab. It is distinct from the older removed experiment.

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

`effectMode="off"` removes backdrop filtering. `effectMode="blur"` disables WebGL and the mirror and uses the CSS fallback. The web component can be imported during SSR; instantiate it only in a browser. Install React and React DOM explicitly when using a React entry point; the web component needs neither.

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
npm run test:webgl
npm install --prefix packages/simple-liquid-glass-font
npm run build --prefix packages/simple-liquid-glass-font
npm run test:scene
```

Public TypeScript declarations are generated from source during the build. Bundle budgets use **Brotli**, not gzip. CI also checks React 16.8.6, 17.0.2, 18.3.1, and 19 in isolated installations.

### Safari lens optics

Desktop Safari bypasses SVG filters for its optional mirror. iOS uses the WebGL path above. A cached alpha mask reveals a magnified source copy at the rounded rim, leaving the center clear. `mirrorScale` controls the magnification and is bounded by panel geometry; zero gives no optical offset. Firefox retains the rounded-rectangle SVG displacement map. Both maps are generated only for active mirrors, with neither dimension above 256 pixels.

Use `track` for translated lenses or backgrounds. Root transforms are represented by the copy's alignment and are not replayed on the copy. Rotation, scaling, and animations inside the backdrop remain outside the supported alignment contract. The web component uses WebGL on iOS with an explicit backdrop; desktop Safari retains its CSS fallback unless WebGL is requested.

The 5.3.0 Brotli budgets are 30 KB for core, 33 KB for interactive, 31 KB for mirror, and 23 KB for the web component. The optional shared-scene entry is separate. Run `npm run size` to measure the current builds.

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
filters have explicit sampling bounds and neutral padding. iOS uses the integrated WebGL
renderer described above; the library demo covers both static HTML and live video.

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

### Interactive controls

The `/interactive` entry also accepts `liquidTrigger="always" | "hover" | "press"`, `followPointer`, `clickRipple={true | "ripple" | "drop"}`, and `rippleIntensity`. `specular` is opt-in and defaults to `false`. Click ripples are clipped surface overlays; they do not capture or refract the backdrop themselves.

### Material presets

```tsx
<LiquidGlass material="smoked">Your content</LiquidGlass>
<LiquidGlass material="frosted" blur={4} glassColor="rgba(220,230,255,0.3)">
  A customized finish
</LiquidGlass>
```

`material` accepts `clear`, `frosted`, `smoked`, or `subtle`. Each coordinates the
lens profile, blur, saturation, color separation, frost, tint, and border color.
Explicit props override individual preset settings; `undefined` inherits the preset.
Omitting `material` preserves the existing defaults. Rendering quality and browser
fallback rules still apply, including the low-quality blur cap. Material selection
does not choose text colors: set those for your content and background.

`MATERIAL_PRESETS` and the `MaterialPreset` type are exported for material pickers
and design tools. React wrappers inherit the same `material` prop. These additions
are currently part of the React API, not the web component.

### Rendering diagnostics

```tsx
<LiquidGlass
  onDiagnosticsChange={({ strategy, reason, quality }) => {
    console.log({ strategy, reason, quality });
  }}
/>
```

The callback runs after mounting and when the selected renderer, reason, or quality
changes. `ref.current.getDiagnostics()` reads the current snapshot; `getQuality()`
continues to work. The root also exposes `data-glass-strategy` and `data-glass-reason`
for inspection. These report the library's rendering decision, not a guarantee of
browser support, visual fidelity, or frame rate.

| Strategy | Meaning |
| --- | --- |
| `pending` | Waiting for client initialization |
| `off` | Effects explicitly disabled |
| `paused` | Offscreen effects paused |
| `svg` | Native SVG backdrop refraction |
| `css-rim` | Safari-style mirror rim magnification |
| `svg-mirror` | SVG displacement on a mirrored backdrop |
| `blur` | CSS fallback |

Reasons include `effect-disabled`, `offscreen`, `blur-requested`, `native-svg`,
`backdrop-mirror`, `mirror-disabled`, `missing-backdrop`, `invalid-selector`,
`invalid-backdrop`, `clone-failed`, `mirror-unavailable`, and `initializing`.
For `missing-backdrop`, supply a sibling background using `backdropRef` or
`backdropSelector`. For `invalid-backdrop`, move the source outside the lens and its
ancestors. `RenderingDiagnostics`, `RenderingStrategy`, and `RenderingReason` are
exported TypeScript types.


### WebGL in Vue, Svelte, Astro, Angular or plain HTML

```html
<script type="module">
  import 'simple-liquid-glass/web-component';
</script>
<div id="background">Your page content</div>
<liquid-glass backdrop-selector="#background" renderer="webgl"
  lens-profile="player" strength="0.16" radius="36"
  style="position:fixed;bottom:24px;left:16px;width:320px;height:72px">
  Home · Explore · Library
</liquid-glass>
```

Omit `renderer` for automatic iOS selection. WebGL attributes include `lens-profile`, `strength`,
`dispersion`, `radius`, `scale`, `blur`, `saturation`, `backdrop-selector`, and `backdrop-version`.
`effect-mode="blur"` or `"off"` explicitly disables refraction. Call
`element.refreshBackdrop()` for a manual capture refresh. Disconnecting the element releases
its context and source subscription.

The bundled renderer increases the React core to approximately **29 KB Brotli**, including HTML
capture (React excluded); the web component is approximately **22 KB Brotli**. No separate
runtime dependency installation is required. See `THIRD_PARTY_NOTICES.md` for bundled licenses.
Run `npm run test:webgl` for the library integration/overscroll tests in Chromium and WebKit.

### Shared WebGL surfaces

`simple-liquid-glass/webgl` exports the framework-independent `createWebGLSurface(element,
output, backdrop, options, onStatus)` engine and its TypeScript types. It accepts a displacement
map URI, scale, dispersion, radius, blur and saturation; the output holder can be CSS-masked.
`additiveDispersion` and `neutralPoint` support glyph maps. The returned surface exposes
`update(options)`, `refresh()` and `destroy()`. This is the canonical engine used by
`simple-liquid-text`, including overscroll tracking and background capture lifecycle.
