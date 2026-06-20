# Simple Liquid Glass

> **A zero-dependency liquid glass component with _real SVG refraction on Chromium_, and a polished frosted glass everywhere else. Works on React 16.8–19.**

A tiny, zero-dependency **React liquid glass component**. It renders Apple-style “liquid glass” with an SVG displacement map. On **Chromium browsers (Chrome, Edge, Android Chrome)** you get real refraction; on **Safari, iOS, and Firefox** it renders a deliberate, polished **frosted glass** (blur + saturation + subtle tint + gradient border) — real glass, just not refraction. The same behavior is available in the framework-agnostic `<liquid-glass>` web component too. Chromatic aberration, gradient borders, automatic text color, SSR-safe — the React core is ~10 KB (the web component ~6.5 KB).

### Browser support

| Engine | Refraction |
|---|---|
| Chrome / Edge / Android Chrome (Chromium) | ✅ real SVG refraction |
| Safari / iOS / Firefox | frosted glass (no refraction) |

Real refraction is an SVG displacement map inside CSS `backdrop-filter`, which renders only on Chromium. WebKit (Safari and all iOS browsers) and Firefox can't run SVG filters in `backdrop-filter`, so they fall back to the frosted-glass treatment.

[![npm version](https://img.shields.io/npm/v/simple-liquid-glass)](https://www.npmjs.com/package/simple-liquid-glass)
[![npm downloads](https://img.shields.io/npm/dw/simple-liquid-glass)](https://www.npmjs.com/package/simple-liquid-glass)
[![bundle size](https://deno.bundlejs.com/badge?q=simple-liquid-glass)](https://bundlejs.com/?q=simple-liquid-glass)
[![GitHub stars](https://img.shields.io/github/stars/lucaperullo/simple-liquid-glass?style=flat)](https://github.com/lucaperullo/simple-liquid-glass)
[![license](https://img.shields.io/npm/l/simple-liquid-glass)](https://github.com/lucaperullo/simple-liquid-glass/blob/main/LICENSE)

**[🔗 Live demo](https://simple-liquid-glass.vercel.app/)** · **[📦 npm](https://www.npmjs.com/package/simple-liquid-glass)** · **[📖 Changelog](CHANGELOG.md)**

## Why simple-liquid-glass?

|  | **simple-liquid-glass** | liquid-glass-react | @specy/liquid-glass |
|---|:--:|:--:|:--:|
| Real SVG refraction on **Chromium** | ✅ | ✅ | ❌ (WebGL) |
| React **16.8 – 19** | ✅ | ❌ (19 only) | ✅ |
| Bundle (gzip) | **~10 KB** (web component ~6.5 KB) | ~33 KB | 6.8 MB |
| Zero runtime deps | ✅ | ✅ | ❌ (Three.js) |
| SSR-safe (Next.js) | ✅ | ⚠️ | ❌ |
| Web component (Vue / Svelte / vanilla) | ✅ | ❌ | ❌ |
| Actively maintained (2026) | ✅ | ❌ (since Jun 2025) | ❌ |

### Choose your path

- **React, simple** → `import { LiquidGlass } from 'simple-liquid-glass'`
- **Pointer-reactive / “alive”** → `import { LiquidGlassInteractive } from 'simple-liquid-glass/interactive'`
- **Vue / Svelte / Astro / plain HTML** → `import 'simple-liquid-glass/web-component'` → `<liquid-glass>`

## ✨ New in 4.x

- **Fold-free corners (4.1)** — the `classic` lens no longer shears or tears the backdrop along rounded-rect corners at high `scale`; the edge field fades to neutral over a scale-aware band instead of cliffing (with graceful amplitude falloff at extreme scale/aspect).
- **Chromium-only refraction (4.0)** — real SVG refraction runs on Chrome / Edge / Android Chrome; Safari / iOS / Firefox get a polished frosted-glass fallback (the DOM-mirror engine was removed).

**Earlier (3.x):**

- **Shape-adaptive refraction** — the lens reads like glass *cut to the element's shape*; a long navbar or tall sidebar refracts evenly instead of skewing.
- **Directional `angle`** — point the refraction lean any direction; faithful on any aspect ratio.
- **Lens modes (`lens`)** — `classic` (radial), `convex` (one coherent dome magnifier), `shift` (uniform offset — straight stays straight), `rim` (clear center, refractive edge) + manual `lensStrength` / `lensCenter`.
- **Real animated “liquid” refraction (`liquid`)** — `ripple` / `flow` / `wobble`; the backdrop genuinely warps. GPU-gated: in-view only, pauses on reduced-motion.
- **Pointer interaction** (`LiquidGlassInteractive`) — `followPointer` refraction and water-like click ripples (`clickRipple` → `ripple` / `drop`).

> Earlier highlights and the full per-version history are in the **[Changelog](CHANGELOG.md)**.

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

On Chromium the web component renders real SVG refraction; on Safari, iOS, and Firefox it renders
the frosted-glass treatment — same as the React component.

**Per-framework guides:** [Vue 3 / Nuxt](docs/frameworks/vue.md) · [Svelte / SvelteKit](docs/frameworks/svelte.md) · [Astro](docs/frameworks/astro.md) · [plain HTML / vanilla JS / Angular](docs/frameworks/vanilla.md).

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
| `angle` | `number` | `0` | Refraction direction in degrees (in-plane lean, not light tilt). `0` = baseline; positive = clockwise. **Shape-adapted** so the on-screen angle is faithful on any aspect ratio. Chromium SVG path. |
| `shapeAdapt` | `boolean` | `true` | Aspect-faithful + isotropic refraction so the lens reads like glass cut to the element's shape (long navbar / tall sidebar refract evenly). `false` restores the legacy ≤2.x map. |
| `lens` | `'classic' \| 'convex' \| 'shift' \| 'rim'` | `'classic'` | Lens field shape. `classic` = linear radial; `convex` = one coherent dome magnifier (no top/bottom split); `shift` = uniform directional offset (straight stays straight); `rim` = clear flat center, refraction only at a soft perimeter band. |
| `lensStrength` | `number` | `1` | Manual magnitude of the lens field. `0` disables the lens displacement. |
| `lensCenter` | `[number, number]` | `[0.5, 0.5]` | Normalized `0..1` center for `convex` / `rim`. |
| `liquid` | `'ripple' \| 'flow' \| 'wobble' \| false` | `false` | **Real animated refraction** — the backdrop genuinely warps. Opt-in, GPU-real: runs only while on-screen, pauses on `prefers-reduced-motion`, Chromium SVG path only. |
| `liquidSpeed` | `number` | `1` | Motion rate multiplier for `liquid`. |
| `liquidScale` | `number` | preset | Distortion amplitude (px) for `liquid`. Defaults to the preset's amplitude. |

> **`LiquidGlassInteractive`** (from `simple-liquid-glass/interactive`) adds: `liquidTrigger` (`'always' \| 'hover' \| 'press'`, default `'always'` — `hover`/`press` stay idle until you interact), `followPointer` (`boolean`, a refractive bump that distorts the backdrop toward the cursor), and `clickRipple` (`boolean`, a real refractive ripple that expands + fades from each click). `specular` (the pointer-tracked highlight) is now **opt-in** (default `false`). All overlays are clipped to the glass radius.

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
| iOS Safari / all iOS browsers | Layered CSS fallback |
| Firefox | Layered CSS fallback |

**Layered CSS fallback** (automatic): instead of a flat blur, a masked edge ring with a stronger backdrop blur + brightness fakes the refraction band, plus a specular highlight. Zero dependencies, 60fps.

> **Note:** versions 1.4.x shipped an experimental snapshot-based WebGL refraction mode (`effectMode="webgl"`). It was removed in 2.0.0: snapshot-based refraction cannot track live page content reliably (smooth-scroll libraries, animations, html2canvas rendering gaps). On non-Chromium engines the component now always uses the layered CSS fallback.

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

// Force SVG filter everywhere
<LiquidGlass effectMode="svg" />
```

### Effect Mode Control

```jsx
// Force pure CSS blur (no SVG) — ideal per dispositivi molto low-end
<LiquidGlass effectMode="blur" />

// Disattiva totalmente l'effetto (mantiene solo saturazione/frost)
<LiquidGlass effectMode="off" />

// Forza sempre l'SVG
<LiquidGlass effectMode="svg" />

// Selezione automatica (default)
<LiquidGlass effectMode="auto" />
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

## Use with AI / LLMs

This library ships an LLM-friendly reference so any assistant can use it correctly and autonomously.

- **[`llms.txt`](llms.txt)** — the complete API, recipes, and gotchas in one paste-anywhere file
  (the [llms.txt convention](https://llmstxt.org)). Feed it to any model.
- **Claude Code skill** — [`skills/simple-liquid-glass/SKILL.md`](skills/simple-liquid-glass/SKILL.md).
  Install it so Claude auto-loads the API when you work with the library:

  ```bash
  # copy into your user skills (or a project's .claude/skills/)
  mkdir -p ~/.claude/skills/simple-liquid-glass
  curl -fsSL https://raw.githubusercontent.com/lucaperullo/simple-liquid-glass/main/skills/simple-liquid-glass/SKILL.md \
    -o ~/.claude/skills/simple-liquid-glass/SKILL.md
  ```

**Copy-paste prompt** (drop into any chat assistant):

```
You are helping me build UI with the npm package `simple-liquid-glass` (React + a <liquid-glass>
web component; Apple-style liquid glass with real SVG-displacement refraction). Use this reference
as the source of truth for its API and constraints:
https://raw.githubusercontent.com/lucaperullo/simple-liquid-glass/main/llms.txt

Key rules: real refraction is Chromium-only — Safari, iOS, and Firefox render a frosted-glass
fallback (no refraction); give the element an explicit size; `clickRipple`/`followPointer` are on
`LiquidGlassInteractive` only. Now: <your task>.
```

System-prompt one-liner (for agents): *"For `simple-liquid-glass`, follow its llms.txt; refraction is
Chromium-only (Safari/iOS/Firefox render a frosted-glass fallback); interaction props live on the
`/interactive` export."*

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