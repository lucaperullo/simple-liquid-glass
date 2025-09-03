# Simple Liquid Glass

A tiny, zero-dependency React component that renders a beautiful “liquid” glassmorphism panel using an SVG displacement map. It supports chromatic aberration, adjustable saturation, gradient borders, a configurable semi‑transparent glass color, and automatic text color based on the surrounding background.

![npm version](https://img.shields.io/npm/v/simple-liquid-glass)
![license](https://img.shields.io/npm/l/simple-liquid-glass)
![bundle size](https://deno.bundlejs.com/badge?q=simple-liquid-glass)

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

### Blur-only Preset (no SVG)

To maximize performance and avoid any SVG generation, enable the blur-only preset:

```jsx
<LiquidGlass preset="blur" blur={2}>
  <YourContent />
</LiquidGlass>
```

- Forces CSS-only blur (no SVG filters) for minimal GPU/CPU overhead
- Automatically uses low quality heuristics internally
- Respects iOS fallback rules (may enforce a minimum blur when `iosBlurMode` is `'auto'`)

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Content to display inside the glass effect |
| `mode` | `'preset' \| 'custom'` | `'preset'` | Use preset values or custom configuration |
| `preset` | `'blur'` | - | Blur-only mode: disables SVG filter and uses CSS blur only |
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