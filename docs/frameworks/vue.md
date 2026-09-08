# Using Liquid Glass in Vue 3: Complete Integration Guide

> **Real Apple-style liquid glass in Vue 3** — SVG refraction on Chrome/Chromium, polished frosted-glass fallback on Safari, Firefox, and iOS.

The `<liquid-glass>` web component brings frameworkless glass morphism to Vue 3, Nuxt, and any modern JavaScript app. No dependencies, no build complications, ships as a registered custom element ready to drop into templates.

## Quick Start

### 1. Install

```bash
npm install simple-liquid-glass
```

### 2. Register in Your Vue App

In `src/main.ts`:

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import 'simple-liquid-glass/web-component'

createApp(App).mount('#app')
```

The side-effect import automatically registers the `<liquid-glass>` custom element globally. Vue treats unknown HTML tags as custom elements by default (no configuration needed in Vue 3).

### 3. Use It

```vue
<template>
  <div class="bg-gradient-to-br from-blue-400 to-purple-600 p-8">
    <liquid-glass
      radius="24"
      frost="0.15"
      style="width: 320px; height: 200px; display: block"
    >
      <div class="p-6">
        <h2 class="text-white font-bold">Glass Over Gradient</h2>
        <p class="text-white/80">Real refraction on Chrome. Frosted fallback elsewhere.</p>
      </div>
    </liquid-glass>
  </div>
</template>
```

**Done.** The component renders into shadow DOM with refraction on Chromium or a frosted fallback on Safari/Firefox.

---

## Installation Methods

### NPM (Bundler)

```bash
npm install simple-liquid-glass
yarn add simple-liquid-glass
pnpm add simple-liquid-glass
```

Then import in `main.ts`:

```typescript
import 'simple-liquid-glass/web-component'
```

This side-effect import registers `<liquid-glass>` globally. Vue 3 automatically treats it as a custom element.

### CDN (No Build)

For quick prototypes or when you don't have a build step:

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="https://cdn.jsdelivr.net/npm/simple-liquid-glass/web-component"></script>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

Now `<liquid-glass>` is available in any Vue template on that page.

---

## Registering the Custom Element (Build Setup)

### Default: Vue 3 Just Works

Vue 3 treats unknown elements as custom elements by default. If your `<liquid-glass>` tags show warnings in your IDE, you can:

#### Add to `vite.config.ts` (if using Vite)

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'liquid-glass'
        }
      }
    })
  ]
})
```

This silences build warnings and provides better TypeScript support. Not required for runtime; it's for tooling.

#### Add TypeScript Definitions

Create `src/components.d.ts`:

```typescript
declare namespace JSX {
  interface IntrinsicElements {
    'liquid-glass': LiquidGlassElement
  }
}

interface LiquidGlassElement {
  children?: any
  radius?: string | number
  frost?: string | number
  blur?: string | number
  saturation?: string | number
  displace?: string | number
  scale?: string | number
  lightness?: string | number
  alpha?: string | number
  'border-color'?: string
  style?: string | Record<string, string | number>
  class?: string
  ref?: any
}
```

---

## Real-World Examples

### Example 1: Glass Card Over Image Background

```vue
<template>
  <div class="relative h-96 overflow-hidden rounded-lg">
    <!-- Background image -->
    <img
      src="/landscape.jpg"
      alt="Background"
      class="absolute inset-0 w-full h-full object-cover"
    />

    <!-- Glass overlay positioned absolutely -->
    <div class="absolute inset-0 flex items-center justify-center">
      <liquid-glass
        radius="20"
        frost="0.18"
        blur="2"
        style="width: 320px; height: 240px; display: block"
      >
        <div class="p-6 text-center">
          <h3 class="text-lg font-semibold text-white">Frosted Glass Panel</h3>
          <p class="mt-2 text-sm text-white/80">
            This glass refracts the image on Chrome.
            On Safari/iOS it shows a polished frosted effect.
          </p>
        </div>
      </liquid-glass>
    </div>
  </div>
</template>
```

### Example 2: Reactive Attributes with Refs

```vue
<template>
  <div class="space-y-8">
    <!-- Slider controls -->
    <div class="space-y-4">
      <label class="block">
        Frost: <span class="font-bold">{{ frostLevel }}</span>
      </label>
      <input
        v-model.number="frostLevel"
        type="range"
        min="0"
        max="1"
        step="0.05"
        class="w-full"
      />

      <label class="block">
        Radius: <span class="font-bold">{{ radiusLevel }}</span>
      </label>
      <input
        v-model.number="radiusLevel"
        type="range"
        min="0"
        max="60"
        step="2"
        class="w-full"
      />
    </div>

    <!-- Glass with bound attributes -->
    <div class="bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 p-8 rounded-lg">
      <liquid-glass
        :radius="radiusLevel.toString()"
        :frost="frostLevel.toString()"
        blur="1"
        saturation="120"
        style="width: 100%; max-width: 400px; height: 200px; display: block; margin: 0 auto"
      >
        <div class="p-4">
          <p class="text-sm font-medium">Adjust the sliders above</p>
          <p class="text-xs opacity-75 mt-2">
            Attributes update reactively in Vue.
          </p>
        </div>
      </liquid-glass>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const frostLevel = ref(0.15)
const radiusLevel = ref(20)
</script>
```

### Example 3: Glass Card with Slotted Content

```vue
<template>
  <liquid-glass
    radius="16"
    frost="0.12"
    saturation="130"
    style="width: 320px; height: auto; display: block; padding: 24px"
  >
    <!-- Everything inside becomes slotted content -->
    <div class="space-y-4">
      <h2 class="text-xl font-bold">Slotted Content</h2>

      <p class="text-sm opacity-90">
        You can nest any Vue component or HTML here. It all goes into the
        <code class="bg-black/20 px-2 py-1 rounded">&lt;slot&gt;</code>
        inside the shadow DOM.
      </p>

      <div class="flex gap-2 mt-4">
        <button class="px-3 py-1 bg-white/20 rounded text-sm font-medium">
          Action 1
        </button>
        <button class="px-3 py-1 bg-white/20 rounded text-sm font-medium">
          Action 2
        </button>
      </div>

      <MyNestedComponent />
    </div>
  </liquid-glass>
</template>

<script setup lang="ts">
import MyNestedComponent from './MyNestedComponent.vue'
</script>
```

**Key point:** Vue's slot projection works normally. The `<liquid-glass>` element renders slotted content in its shadow DOM, and the glass effect applies over whatever you put inside.

### Example 4: Multiple Instances in a Grid

```vue
<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
    <div v-for="card in cards" :key="card.id" class="space-y-2">
      <liquid-glass
        :radius="card.radius.toString()"
        frost="0.14"
        blur="1"
        style="width: 100%; height: 200px; display: block"
      >
        <div class="flex flex-col h-full p-6 justify-between">
          <div>
            <h3 class="font-semibold text-white">{{ card.title }}</h3>
            <p class="text-sm text-white/70 mt-1">{{ card.description }}</p>
          </div>
          <button class="self-start px-3 py-1 rounded text-xs font-medium bg-white/20 hover:bg-white/30">
            Learn More
          </button>
        </div>
      </liquid-glass>
    </div>
  </div>
</template>

<script setup lang="ts">
const cards = [
  { id: 1, title: 'Card 1', description: 'Glass effect', radius: 12 },
  { id: 2, title: 'Card 2', description: 'Reactive', radius: 16 },
  { id: 3, title: 'Card 3', description: 'Responsive', radius: 20 }
]
</script>
```

---

## Attributes and Properties

All attributes are optional and accept string or number values (custom elements receive attributes as strings).

| Attribute | Type | Default | Range | Notes |
|-----------|------|---------|-------|-------|
| `radius` | number | `50` | 0–60 | Border radius in pixels |
| `frost` | number | `0.1` | 0–1 | Frosted-glass intensity (non-Chromium fallback) |
| `blur` | number | `0` | 0–20 | Additional backdrop blur |
| `saturation` | number | `140` | 80–200 | CSS `saturate()` multiplier (%) |
| `displace` | number | `5` | 0–10 | SVG displacement blur (Chromium only) |
| `scale` | number | `160` | 50–360 | SVG displacement strength (Chromium only) |
| `lightness` | number | `53` | 0–100 | Glass brightness/lightness |
| `alpha` | number | `0.9` | 0–1 | Glass opacity |
| `border-color` | string | `rgba(120,120,120,0.7)` | CSS color | Border rim color |
| `angle` | number | `0` | 0–360 | **New in 3.0.0.** Refraction direction in degrees. Shape-adapted so the on-screen angle is faithful on any aspect ratio (Chromium SVG path) |
| `shape-adapt` | string | `on` | `on` / `false` | **New in 3.0.0.** Aspect-faithful + isotropic refraction so the lens reads like glass cut to the element's shape (a long navbar / tall sidebar refracts evenly). Set `"false"` for the legacy ≤2.x map |
| `lens` | string | `classic` | `classic` / `convex` / `shift` / `rim` | **New in 3.0.0.** Lens field shape. `classic` = linear radial; `convex` = one coherent dome magnifier (no top/bottom split); `shift` = uniform directional offset (straight lines stay straight); `rim` = clear flat center, refraction only at a soft perimeter band |
| `lens-strength` | number | `1` | — | **New in 3.0.0.** Manual magnitude of the lens field; `0` disables it |
| `lens-center` | string | `0.5,0.5` | each `0`–`1` | **New in 3.0.0.** Lens center as `"x,y"` for `convex`/`rim` |
| `liquid` | string | — | `ripple` / `flow` / `wobble` | **New in 3.0.0.** Real animated refraction — the backdrop genuinely warps. Opt-in, GPU-real: animates only while on-screen, pauses on `prefers-reduced-motion` (Chromium SVG path only) |
| `liquid-speed` | number | `1` | — | **New in 3.0.0.** Motion rate for `liquid` |
| `liquid-scale` | number | per preset | — | **New in 3.0.0.** Distortion amplitude in pixels for `liquid` |

### Binding Attributes in `<script setup>`

Custom-element attributes are always strings (or numbers coerced to strings). Use `:attr="value"` to bind:

```vue
<script setup lang="ts">
import { ref } from 'vue'

const radius = ref(20)
const frost = ref(0.15)
</script>

<template>
  <!-- These work the same way -->
  <liquid-glass :radius="radius.toString()" :frost="frost.toString()">
    Content
  </liquid-glass>

  <!-- Or simpler: Vue coerces to string automatically for custom elements -->
  <liquid-glass :radius="radius" :frost="frost">
    Content
  </liquid-glass>
</template>
```

---

## Browser Support & Rendering

### Real Refraction vs. Frosted Fallback

The component delivers different effects per engine:

| Engine | Rendering | Notes |
|--------|-----------|-------|
| **Chrome, Edge, Opera** | **Real SVG displacement refraction** | True live distortion; the most visually impressive |
| **Safari, iOS, all iOS browsers** | **Polished frosted-glass fallback** | Blur + sheen + rim highlight; no live refraction but still beautiful |
| **Firefox** | **Polished frosted-glass fallback** | Same as Safari; WebKit limitation |

**Why the difference?**
- Chromium's `backdrop-filter: url(#svg-filter)` supports SVG displacement maps.
- WebKit (Safari/iOS) and Firefox don't support SVG refs in `backdrop-filter` (browser limitation, not a flaw in this component).
- The fallback uses CSS blur, brightness, and layered rings to fake refraction—zero dependencies, solid performance.

**Real iOS Refraction (React only):**
The React `<LiquidGlass backdropRef={...}>` component includes a live-DOM-mirror feature that refracts a cloned element on iOS/Safari/Firefox. The web component doesn't include this (it requires React refs). If you need real refraction on iOS in Vue, you'd need to use the React component wrapped in an adapter—but in practice, the frosted fallback is polished enough for most use cases.

---

## SSR and Nuxt

### Next.js / Nuxt 3 Usage

The web component is **SSR-safe** — it only touches the DOM in the browser. However, you need to ensure the import happens client-side only.

#### In Nuxt 3

Create a plugin in `plugins/liquid-glass.client.ts`:

```typescript
// plugins/liquid-glass.client.ts
import 'simple-liquid-glass/web-component'

export default defineNuxtPlugin(() => {})
```

Then use in templates:

```vue
<template>
  <div>
    <liquid-glass radius="20" frost="0.15" style="width: 320px; height: 200px; display: block">
      <p>This only renders on the client.</p>
    </liquid-glass>
  </div>
</template>
```

Nuxt's `.client.ts` convention ensures the plugin (and therefore the custom element) is only registered in the browser, avoiding hydration mismatches.

#### In a Vue 3 App with Vite

If you're using `useHydration` or manual SSR, wrap the import:

```typescript
// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'

if (typeof window !== 'undefined') {
  import('simple-liquid-glass/web-component')
}

createApp(App).mount('#app')
```

Or in a component:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  import('simple-liquid-glass/web-component')
})
</script>
```

---

## Performance & Bundle Impact

- **Web component size**: ~6 KB gzip (no dependencies)
- **Side-effect import**: One-time registration; no per-instance cost
- **Rendering**: Hardware-accelerated `backdrop-filter` and SVG filters on supported browsers
- **Multiple instances**: No performance degradation; each instance is independent

### Tips

1. **Size:** The package is already minimal. Don't overthink it.
2. **Lazy loading:** For route-based usage, lazy-load the import:
   ```typescript
   const glassRoute = lazy(() => import('simple-liquid-glass/web-component').then(() => () => Promise.resolve()))
   ```
3. **Quality:** Use defaults (`frost="0.15"`, `radius="20"`) for best visual balance.

---

## TypeScript Support

The web component is vanilla JavaScript, but you can add type hints:

**Option 1: JSX types** (if using JSX anywhere)

```typescript
// src/components.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    'liquid-glass': {
      children?: any
      radius?: string | number
      frost?: string | number
      blur?: string | number
      saturation?: string | number
      displace?: string | number
      scale?: string | number
      lightness?: string | number
      alpha?: string | number
      'border-color'?: string
      style?: CSSProperties
    }
  }
}
```

**Option 2: Create a wrapper component** (optional, for extra type safety)

```vue
<!-- src/components/LiquidGlass.vue -->
<template>
  <liquid-glass v-bind="attrs" :style="style">
    <slot />
  </liquid-glass>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'

interface Props {
  radius?: number
  frost?: number
  blur?: number
  saturation?: number
  displace?: number
  scale?: number
  lightness?: number
  alpha?: number
  borderColor?: string
  style?: CSSProperties
}

const props = withDefaults(defineProps<Props>(), {
  radius: 50,
  frost: 0.1,
  blur: 0,
  saturation: 140,
  displace: 5,
  scale: 160,
  lightness: 53,
  alpha: 0.9
})

const attrs = computed(() => ({
  radius: props.radius?.toString(),
  frost: props.frost?.toString(),
  blur: props.blur?.toString(),
  saturation: props.saturation?.toString(),
  displace: props.displace?.toString(),
  scale: props.scale?.toString(),
  lightness: props.lightness?.toString(),
  alpha: props.alpha?.toString(),
  'border-color': props.borderColor
}))
</script>

<style scoped>
:deep(liquid-glass) {
  display: block;
}
</style>
```

Then import and use the wrapper:

```vue
<template>
  <LiquidGlass :radius="20" :frost="0.15">
    Content here
  </LiquidGlass>
</template>

<script setup lang="ts">
import LiquidGlass from '@/components/LiquidGlass.vue'
</script>
```

This gives full TypeScript autocomplete and prop validation.

---

## Common Patterns

### Overlay with Text

```vue
<template>
  <div class="relative w-full h-80 bg-cover" :style="{ backgroundImage: 'url(bg.jpg)' }">
    <div class="absolute inset-0 flex items-center justify-center">
      <liquid-glass radius="24" frost="0.2" style="width: 300px; height: 200px; display: block">
        <div class="flex flex-col justify-center items-center h-full p-8 text-center">
          <h1 class="text-3xl font-bold text-white">Hello Vue</h1>
          <p class="mt-4 text-white/80 text-sm">Liquid glass in Vue 3</p>
        </div>
      </liquid-glass>
    </div>
  </div>
</template>
```

### Responsive Grid

```vue
<template>
  <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 p-4">
    <liquid-glass
      v-for="i in 6"
      :key="i"
      radius="16"
      frost="0.15"
      style="width: 100%; height: 200px; display: block"
    >
      <div class="p-4">
        <p class="font-medium">Card {{ i }}</p>
      </div>
    </liquid-glass>
  </div>
</template>
```

### Modal/Dialog

```vue
<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center">
    <liquid-glass
      radius="12"
      frost="0.18"
      style="width: 90%; max-width: 500px; display: block"
    >
      <div class="p-8">
        <h2 class="text-xl font-bold mb-4">Modal Title</h2>
        <p class="mb-6">Modal content goes here.</p>
        <button class="px-4 py-2 rounded bg-white/20 text-white font-medium" @click="isOpen = false">
          Close
        </button>
      </div>
    </liquid-glass>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const isOpen = ref(true)
</script>
```

---

## Troubleshooting

### The `<liquid-glass>` Tag Is Not Recognized

**Problem:** IDE warning or not rendering.

**Solution:** Ensure the import is in `main.ts` (before `createApp`):
```typescript
import 'simple-liquid-glass/web-component'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

### No Glass Effect Visible

**Problem:** The component renders but looks like a plain div.

**Solution:** Ensure it has an explicit size and sits over a background:
```vue
<div style="background: url(image.jpg)">
  <liquid-glass style="width: 320px; height: 200px; display: block">
    Content
  </liquid-glass>
</div>
```

The `<liquid-glass>` element is `display: block` but needs explicit `width` and `height`.

### Attributes Not Updating

**Problem:** Changing a reactive ref doesn't update the glass.

**Solution:** Custom elements receive attributes as strings. Always bind with `:attr=`:
```vue
<!-- Wrong: attributes stay as the initial value -->
<liquid-glass radius="20" :frost="frostRef">
  ...
</liquid-glass>

<!-- Right: convert to string (Vue does this automatically for custom elements) -->
<liquid-glass :radius="radiusRef" :frost="frostRef">
  ...
</liquid-glass>
```

### Slotted Content Not Showing

**Problem:** Children disappear when wrapped in `<liquid-glass>`.

**Solution:** The component uses shadow DOM with a `<slot>`. Your content should appear. If it doesn't:
- Check that slotted content is not overflowing (add `overflow: hidden` to the glass container if needed).
- Ensure the glass element has a size and a background to see the effect.

### Different Visual on Safari vs. Chrome

**Expected behavior.** On Safari/iOS/Firefox, you see the frosted fallback (blur + sheen); on Chrome, you see real SVG refraction. Both are correct. This is not a bug—it's the browser limitation for `backdrop-filter: url(#svg)`.

---

## Links & Resources

- **GitHub Repository**: [github.com/lucaperullo/simple-liquid-glass](https://github.com/lucaperullo/simple-liquid-glass)
- **NPM Package**: [npmjs.com/package/simple-liquid-glass](https://www.npmjs.com/package/simple-liquid-glass)
- **Live Demo**: [simple-liquid-glass.vercel.app](https://simple-liquid-glass.vercel.app)
- **Changelog**: [CHANGELOG.md](https://github.com/lucaperullo/simple-liquid-glass/blob/main/CHANGELOG.md)
- **Issues & Feature Requests**: [GitHub Issues](https://github.com/lucaperullo/simple-liquid-glass/issues)

---

## FAQ

**Q: Does the web component work in Astro?**
A: Yes. The web component is framework-agnostic. Astro serves it as-is; use the CDN method or import in a client component.

**Q: Can I animate glass properties (radius, frost, etc.)?**
A: You can bind them to reactive refs and animate the underlying Vue values, but the component doesn't expose animation controls. Use CSS transitions or Vue's `<Transition>` component on the parent.

**Q: Do I need to pass a `backdropRef`?**
A: No. That's a React feature. The web component always uses the CSS fallback (frosted glass on Safari/Firefox) because it can't safely detect what's behind it without crashing on iOS.

**Q: What's the bundle impact?**
A: ~6 KB gzip, zero dependencies. Negligible.

**Q: Does it work in Nuxt?**
A: Yes. Use a `.client.ts` plugin to register it client-side only.

**Q: Can I use it with TypeScript?**
A: Yes. See the TypeScript Support section above for type definitions.

**Q: Is this production-ready?**
A: Yes. It ships in simple-liquid-glass v2.4.0, which is actively maintained and used in production.

---

**Version**: simple-liquid-glass v2.4.0 | **Updated**: June 2026
