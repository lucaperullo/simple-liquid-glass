# Liquid Glass in Svelte & SvelteKit

> **Real refraction on Chromium. Polished frosted-glass fallback on Safari/iOS/Firefox.** Zero dependencies, ~6 KB gzip.

The `<liquid-glass>` custom element works seamlessly in Svelte and SvelteKit. This guide covers npm bundler setup, CDN usage, SvelteKit SSR safety, and practical examples.

## Quick Start (SvelteKit + Bundler)

### Install

```bash
npm install simple-liquid-glass
```

### Import (side-effect)

In your `+layout.svelte` (or a client-only component):

```svelte
<script>
  import 'simple-liquid-glass/web-component';
</script>
```

That import auto-registers the `<liquid-glass>` element globally. Now you can use it anywhere.

### Minimal example

```svelte
<div style="width: 320px; height: 200px; background: linear-gradient(135deg, #667eea, #764ba2); position: relative;">
  <liquid-glass radius="20" frost="0.15" style="position: absolute; inset: 0; width: 100%; height: 100%;">
    <div style="padding: 20px;">
      <h2>Hello, Glass</h2>
      <p>This refractor lives over the gradient.</p>
    </div>
  </liquid-glass>
</div>
```

## Installation methods

### ESM / bundler (recommended)

```bash
npm install simple-liquid-glass
```

```svelte
<script>
  import 'simple-liquid-glass/web-component';
</script>
```

### CDN (no build)

```svelte
<svelte:head>
  <script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
</svelte:head>
```

## SvelteKit SSR safety

`<liquid-glass>` is safe to render server-side — the custom element doesn't touch the DOM until the browser runs it. To be explicit (and avoid hydration mismatches on slow devices), guard the import with `browser`:

```svelte
<script>
  import { browser } from '$app/environment';
  if (browser) {
    import('simple-liquid-glass/web-component');
  }
</script>

<slot />
```

Or use `onMount`:

```svelte
<script>
  import { onMount } from 'svelte';
  onMount(async () => {
    await import('simple-liquid-glass/web-component');
  });
</script>

<slot />
```

For most projects a single top-level import in `+layout.svelte` is fine.

## Attributes

All attributes are optional. Pass them as strings; the component parses numeric values internally.

| Attribute | Type | Default | Range / Notes |
|-----------|------|---------|---------------|
| `radius` | number | `50` | Border radius in px |
| `frost` | number | `0.1` | Frosted-glass opacity; `0`–`1` |
| `blur` | number | `0` | Extra blur (px) |
| `saturation` | number | `140` | Color saturation; `%` multiplier |
| `displace` | number | `5` | Displacement blur; `0`–`10` |
| `scale` | number | `160` | Refraction intensity on Chromium |
| `lightness` | number | `53` | Glass lightness; `0`–`100` |
| `alpha` | number | `0.9` | Glass opacity; `0`–`1` |
| `border-color` | string | `rgba(120,120,120,0.7)` | CSS color (any format) |

## Reactive attributes

Svelte reactivity works naturally with custom-element attributes:

```svelte
<script>
  let glassRadius = 20;
  let glassFrost = 0.1;
</script>

<liquid-glass radius={glassRadius} frost={glassFrost} style="width: 300px; height: 200px; display: block;">
  <div style="padding: 20px;">Content</div>
</liquid-glass>

<button on:click={() => glassRadius += 5}>Increase radius</button>
```

The component watches all attributes via `observedAttributes`, so changes re-render automatically. (Bind a variable with `radius={x}` — a string literal `radius="x"` won't update.)

## Browser behavior

| Browser | Effect |
|---------|--------|
| Chromium (Chrome/Edge/Brave/Opera) | SVG displacement — real refraction |
| Safari / iOS | Frosted blur + sheen fallback |
| Firefox | Frosted blur + sheen fallback |

For **real refraction on iOS/Safari**, use the **React component** with `backdropRef` (the web component doesn't include the live-DOM mirror). See the [main README](https://github.com/lucaperullo/simple-liquid-glass#real-refraction-on-ios--safari--firefox--built-into-liquidglass).

## Troubleshooting

- **Nothing renders** → ensure the import runs client-side, the element has explicit `width`/`height`, and there's a background behind it.
- **Blurry on iOS** → that's the fallback; real iOS refraction needs the React `backdropRef` path.
- **Attribute not updating** → bind a variable (`radius={x}`), not a string literal.

## Links

- Live demo: https://simple-liquid-glass.vercel.app/
- GitHub: https://github.com/lucaperullo/simple-liquid-glass
- npm: https://www.npmjs.com/package/simple-liquid-glass
