# Framework integration guides

`simple-liquid-glass` ships a framework-agnostic `<liquid-glass>` web component
(`simple-liquid-glass/web-component`), so you get the glass in **any** stack — not just React.

| Framework | Guide |
|---|---|
| Vue 3 / Nuxt | [vue.md](./vue.md) |
| Svelte / SvelteKit | [svelte.md](./svelte.md) |
| Astro | [astro.md](./astro.md) |
| Plain HTML / vanilla JS / Angular | [vanilla.md](./vanilla.md) |
| React | use the package directly — see the [main README](../../README.md) |

## The one honest caveat

The web component renders **real SVG-displacement refraction on Chromium** and a **polished
frosted-glass fallback on Safari / iOS / Firefox** (those engines can't run SVG filters inside
`backdrop-filter`). **Real refraction on iOS/Safari** currently requires the **React** component
with `backdropRef` (the live-DOM mirror isn't in the web component yet). Every guide says so plainly
— don't let anyone ship overclaimed glass.

## Quick reference

```html
<!-- CDN, no build step -->
<script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
<liquid-glass radius="20" frost="0.15" style="width:320px;height:200px;display:block">
  Glass anywhere
</liquid-glass>
```

Attributes: `radius`, `frost`, `blur`, `saturation`, `displace`, `scale`, `lightness`, `alpha`,
`border-color`, `angle`, `shape-adapt`, `lens`, `lens-strength`, `lens-center`, `liquid`,
`liquid-speed`, `liquid-scale`. Give it an explicit size and place it over a background.

3.0.0 adds directional/shape-adaptive refraction (`angle`, `shape-adapt`), lens modes
(`lens`, `lens-strength`, `lens-center`), and real animated "liquid" refraction
(`liquid`, `liquid-speed`, `liquid-scale`).
