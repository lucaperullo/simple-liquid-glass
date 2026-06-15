# Liquid Glass in Astro: Web Component Integration Guide

**Astro** is an ideal host for the `<liquid-glass>` web component — your site ships zero JavaScript by default, and the component **upgrades itself** in the browser, asking nothing of the framework.

## Why web components in Astro?

Astro's default is HTML-only. When you need interactivity you opt into **islands**. The `<liquid-glass>` custom element is a third option: a custom HTML element that needs **no framework runtime**, self-registers when its script loads, and upgrades itself via the Web Components API — effectively zero overhead.

## Installation

### Option A: ESM + bundler (recommended)

```bash
npm install simple-liquid-glass
```

```astro
---
// src/components/HeroGlass.astro — registers <liquid-glass> globally
import 'simple-liquid-glass/web-component'
---

<liquid-glass radius="20" frost="0.15" style="width:320px;height:200px;display:block">
  <div style="padding:20px;">Your content here</div>
</liquid-glass>
```

The import is side-effect only. Once imported on a page, `<liquid-glass>` is available everywhere on it.

### Option B: CDN (no build step)

```astro
<script is:inline type="module">
  import 'https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component'
</script>

<liquid-glass radius="20" frost="0.15" style="width:320px;height:200px;display:block">
  <div style="padding:20px;">Your content here</div>
</liquid-glass>
```

`is:inline` tells Astro not to bundle the script, so registration happens early.

## Real example: hero with a background

```astro
---
import 'simple-liquid-glass/web-component'
---

<section class="hero">
  <div class="hero-background"><img src="hero.jpg" alt="" /></div>
  <div class="hero-content">
    <liquid-glass radius="24" frost="0.1" blur="8" saturation="150"
      style="width:100%;max-width:600px;display:block;padding:40px">
      <h1>Your Amazing Product</h1>
      <p>Built with Astro and liquid glass — zero JavaScript overhead.</p>
      <a href="/docs" class="btn">Get Started</a>
    </liquid-glass>
  </div>
</section>

<style>
  .hero { position: relative; width: 100%; height: 600px; overflow: hidden; }
  .hero-background { position: absolute; inset: 0; z-index: 0; }
  .hero-background img { width: 100%; height: 100%; object-fit: cover; }
  .hero-content { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 1; }
</style>
```

On Chromium you get real SVG-displacement refraction; on Safari/iOS/Firefox a polished frosted-glass fallback.

## Attributes

| Attribute | Type | Default | Notes |
|-----------|------|---------|-------|
| `radius` | number | `50` | Border radius (px) |
| `frost` | number (0–1) | `0.1` | Frosted-glass opacity |
| `blur` | number | `0` | Blur radius (px) |
| `saturation` | number | `140` | Saturation (%) |
| `displace` | number | `5` | Displacement strength (SVG) |
| `scale` | number | `160` | Refraction scale (SVG) |
| `lightness` | number (0–100) | `53` | Glass lightness |
| `alpha` | number (0–1) | `0.9` | Overall opacity |
| `border-color` | CSS color | `rgba(120,120,120,0.7)` | Border color |

> Because it's a web component (not tied to Astro's reactivity), attribute changes after load won't re-render unless you set them via JS: `document.querySelector('liquid-glass').setAttribute('frost','0.25')`.

## Browser support

- **Chromium** → real SVG-displacement refraction.
- **Safari / iOS / Firefox** → polished frosted-glass fallback (WebKit can't run SVG filters inside `backdrop-filter`, bug #245510). For **real refraction on iOS/Safari**, use the **React component** with `backdropRef` (see the main README); the web component doesn't include the mirror.

## Performance

~6 KB gzip, zero dependencies, SSR-safe (only touches the DOM in the browser). Register once per page, use unlimited times.

## Troubleshooting

- **Glass doesn't show** → give it explicit `width`/`height`, place it over a background, and ensure the import runs.
- **Text hard to read** → set explicit text color in slotted content and a `text-shadow`.

## Links

- Demo: https://simple-liquid-glass.vercel.app/
- GitHub: https://github.com/lucaperullo/simple-liquid-glass
- npm: https://www.npmjs.com/package/simple-liquid-glass
