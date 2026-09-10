# simple-liquid-text

Selectable liquid-glass text in your own font, with glyph-shaped refraction over live video and scrolling content. React component with real-time iOS refraction through the shared `simple-liquid-glass` WebGL engine. No bundled typeface or font downloads.

[Live showcase](https://simple-liquid-text.vercel.app) · [Companion glass surfaces](https://simple-liquid-glass.vercel.app)

```sh
npm install simple-liquid-text
```

Version 0.3.0 adds shared `LiquidGlassScene` backgrounds alongside automatic WebGL refraction on iOS and opt-in WebGL on Android and desktop.

## Usage

```tsx
import { useRef } from 'react';
import { LiquidGlassText } from 'simple-liquid-text';
import 'simple-liquid-text/styles.css';

export function Heading() {
  const backdrop = useRef<HTMLVideoElement>(null);
  return (
    <section style={{ position: 'relative' }}>
    <video ref={backdrop} src="/film.mp4" autoPlay muted loop playsInline />
    <h1 style={{ fontFamily: 'Your Web Font, sans-serif', fontSize: 96, position: 'absolute', top: 0 }}>
      <LiquidGlassText backdropRef={backdrop} refraction={88} bevel={8} dispersion={1.5} blur={0.3}>
        Stay clear.
      </LiquidGlassText>
    </h1>
    </section>
  );
}
```

Load your font normally with `@font-face`, your framework's font loader, or an existing stylesheet. The component inherits its font family, size, weight, style, and letter spacing. Place it over a detailed or colorful background to see the effect.

## Props

| Prop | Default | Purpose |
| --- | --- | --- |
| `children` | required string | Single-line text |
| `renderer` | `auto` | iOS always uses WebGL; choose `webgl` to use it on Android/desktop too |
| `backdropRef` | — | Ref to the visible sibling HTML, image, video, or canvas sampled by WebGL |
| `backdropSelector` | — | CSS selector alternative to `backdropRef` |
| `backdropVersion` | — | Change to refresh HTML after external stylesheet or theme changes |
| `refraction` | `88` | Displacement scale in CSS pixels, 0–300; applied directly; zero disables displacement and dispersion |
| `bevel` | `8` | Width of the curved letter rim in CSS pixels, 1–32 |
| `dispersion` | `1.5` | Red/blue displacement offset in CSS pixels, 0–8 |
| `specular` | `0.8` | Directional rim highlight intensity, 0–2 |
| `blur` | `0.3` | Background blur radius in CSS pixels, 0–32 |
| `saturation` | `1.2` | Background saturation multiplier, 0–3 |
| `tint` | `rgb(255 255 255 / 0.04)` | Translucent color inside the letters |
| `borderWidth` | `1` | Letter outline width in CSS pixels, 0–6; zero removes it |
| `borderColor` | `rgb(255 255 255 / 0.75)` | Any CSS color for the outline |
| `fillColor` | `rgb(255 255 255 / 0.1)` | Fill over the glass; `transparent` removes it, opaque colors hide refraction |
| `shadow` | `0 2px 4px rgb(0 0 0 / 0.25)` | CSS text-shadow; `none` removes it |
| `className`, `style`, other span attributes | — | Styling and ordinary HTML attributes |

The outline, light fill, and soft shadow improve readability over moving backgrounds. These options do not change the lens geometry.

The component renders a span; use a surrounding heading for heading semantics. Keep important text sufficiently contrasted with its background.

The optical surface adapts the main library's material lens: a gentle spherical cap and a meniscus inside the rim. Exact Euclidean glyph distances and a smoothed height field keep joins and thin strokes from developing sharp seams. Displacement eases in at the contour rather than peaking on the cut edge.

The requested refraction strength is applied directly. The smooth surface controls how the light bends; it does not silently reduce the strength. High values intentionally exaggerate the distortion. Use the demo’s Refraction on/off button to compare the same backdrop with and without displacement.

## Live content

The default renderer selects WebGL automatically on iOS. Supply `backdropRef` or `backdropSelector` pointing to a visible background sibling. A video or canvas source is read directly each frame; HTML is captured once, then sampled on the GPU while scrolling. HTML mutations trigger a throttled refresh. Use `renderer="webgl"` for the same path on Android or desktop.

The source must not contain the text component or be contained by it. For nested scrolling, reference an inner content wrapper that moves inside the scroll container. For live video, reference the video element directly rather than its HTML parent. Use same-origin media or media served with appropriate CORS headers and `crossOrigin="anonymous"`.

The native Chromium renderer continues to sample pixels directly behind the letters without requiring a reference. Missing or unsupported WebGL sources retain frosted text. HTML captures do not reproduce every browser visual: CSS animations, pseudo-elements, nested video, cross-origin frames, and unsupported styles can differ. Keep the selected background focused on the content under the text.

Typography and glyph maps update when fonts, geometry, or text change. Actual text stays selectable and accessible in every renderer. Respect reduced-motion preferences when autoplaying media.

## Rendering and limits

- React 18 or 19. The package contains ESM, CommonJS, TypeScript declarations, and a CSS export. React is a peer dependency; the shared WebGL engine is installed automatically through `simple-liquid-glass`.
- Real HTML text remains selectable and accessible. A decorative canvas-generated glyph mask clips the backdrop effect; it is not a canvas replacement for the text. A smoothed glyph surface provides continuous gradients for SVG displacement and directional highlights, including the inner edges of letter counters.
- The mask is generated after mounting, resized with the text, and refreshed when fonts finish loading. Server rendering and the initial hydration frame use ordinary text.
- Browsers without the required CSS support use ordinary text. Printing, forced colors, and reduced transparency also restore solid text.
- **iOS** uses WebGL for real-time refraction. **Chromium (Chrome/Edge)** uses native SVG backdrop displacement by default. Android, desktop Safari, and Firefox can use WebGL with `renderer="webgl"` and an explicit source; browsers unable to initialize WebGL retain the frosted/highlight fallback. This is a visual lens simulation, not a physically exact optical solver.
- Single-line horizontal text only. Rich children, multiline layout, vertical writing, custom variable-font axes, and advanced text-transform modes are not supported. Standard font weights and italic styles are supported. Prefer literal text for casing transformations.
- Ancestor opacity, filters, or masks can limit the backdrop that browsers sample. See [MDN's backdrop-filter documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter).
- Strict content security policies must allow the component's inline styles and `data:` images for its locally generated mask.

## Local development

From this package directory:

```sh
npm install
npm run build
npm test
npm run dev
```

The demo opens at `http://127.0.0.1:4186`. Switch between Film and Scroll content; adjust font, text, refraction, color separation, blur, border width/color, fill opacity, and shadow opacity. Film media and its attribution are in `public/media` and are excluded from the npm tarball.

```sh
npx playwright install
npm run test:browser
npm pack
```

Install the resulting tarball in another project with `npm install /path/to/simple-liquid-text-0.2.0.tgz`. Packing runs the build, optical-field tests, and server-rendering tests automatically.

The browser suite covers font changes, glyph alignment, selection, print fallback, pixel-level clipping, refraction at zero blur, dispersion, live-video playback, and scrolling beneath a stationary lens. It also checks that the selected strength reaches the renderer without attenuation and that the comparison button restores it. Native refraction checks run in Chromium. WebGL glyph clipping, nested scrolling, and live video are tested in Chromium, Firefox, and WebKit. A separate plain-blur probe skips native blur checks when the graphics backend does not render CSS backdrop blur. Physical iPhone testing remains useful for device-specific browser behavior.

## Shared page backgrounds (0.3.0)

Wrap your page content and text in `LiquidGlassScene` from `simple-liquid-glass/backdrop` (5.3.0+). `LiquidGlassText` automatically uses the scene on iOS; choose `renderer="webgl"` on Android or desktop. No backdrop ref is needed. Glass panels and text share one capture cache. Explicit backdrop refs/selectors still override the scene.

```tsx
<LiquidGlassScene>
  <section>Background content</section>
  <LiquidGlassText renderer="webgl">Liquid type</LiquidGlassText>
</LiquidGlassScene>
```
