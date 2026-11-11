# Migration guide

## v5.x → v6.0

6.0 adds a second way to draw glass and changes one default. No 5.x component, prop or entry point is removed:
`<LiquidGlass>`, `LiquidGlassInteractive`, `LiquidGlassMirror`, the web component, `simple-liquid-glass/webgl`,
`/backdrop` and `/engine` work as in 5.7.

### What changes without you doing anything

- **Android refracts by default.** `renderer="auto"` uses WebGL on Android Chromium (as it already did on iOS)
  when the glass has a `backdropRef`, a `backdropSelector` or a `LiquidGlassScene`. Without a source it keeps the
  frosted CSS it had. To keep the 5.x behaviour:

  ```diff
  - <LiquidGlass backdropRef={bg} />
  + <LiquidGlass backdropRef={bg} mobileFallback="css-only" />
  ```

  Diagnostics report the new reason `mobile-webgl`.

### What is new: `simple-liquid-glass/next`

A renderer that takes the scene as data and draws it from a worker where the browser can (the page thread
otherwise), with springs on its own clock. Use it where glass must keep the display's rate while the page is busy
or capped (Chrome on Android gives a page 60 frames a second on a 120 Hz screen; a worker canvas gets 120), or
where you want your own GLSL material. It is plain DOM and canvas: no React import.

| In 5.x | In `simple-liquid-glass/next` |
| --- | --- |
| `<LiquidGlass backdropRef={bg}>` around content | A `<canvas>` you place and size with CSS, `host.addLayer(canvas)`, `layer.addShape(box)`; content goes in the page over the canvas, or on the shape with `content` |
| The library captures the page behind the glass | You hand the picture over: `layer.setBackdrop(await createImageBitmap(img))`, `layer.streamBackdrop(video)`, `layer.moveBackdrop()` when only its place changes |
| CSS transitions or your own frame loop move the glass | `shape.set(box)` springs there in the renderer; `{ jump: true }` puts it there |
| `renderer`, `effectMode`, `mobileFallback` choose a path | One path: WebGL in a worker, else WebGL on the page thread. `layer.status === 'unsupported'` (or `onStatus`) tells you to show your CSS fallback |
| `simple-liquid-glass/engine` `defineMaterial({ fragment, draw })` | `host.defineMaterial({ id, shade, uniforms, textures })`: GLSL defining `slg_shade`, no draw callback; uniforms change with `layer.setParams()` |
| `createLayer(root)` with member surfaces and `slg_under` | `simple-liquid-glass/next/stack`: `layer.stack()` and `slg_below(screen)` |

Things to know before moving a component over:

- A worker keeps **four canvases**. Put glass that belongs together in one layer (24 shapes each), or stack layers
  in one canvas with `simple-liquid-glass/next/stack`.
- A canvas given to a worker is handed over for good: size it with CSS, never with `width` and `height`, and do
  not ask it for a context yourself.
- The backdrop is a picture you own the timing of. For a picture that changes, send it again; the layer takes the
  `ImageBitmap` or `VideoFrame`, so do not use or close it afterwards.
- Server rendering: `createGlassHost()` needs a browser. Importing the entry on a server is safe; call it in an
  effect.
- Reduced motion is followed by default (`reducedMotion` overrides it): springs jump.
- A site whose Content-Security-Policy forbids `blob:` workers hosts `simple-liquid-glass/next/worker` (or
  `/next/stack/worker`) and passes its address as `workerUrl`.

The whole surface, as built, is in [`api/next.api.md`](../api/next.api.md).

### `simple-liquid-glass/engine` (5.7, experimental)

Unchanged in 6.0 and still experimental. New work should use `simple-liquid-glass/next`: it is where materials,
layers and glass on glass are developed from here on.

## v1.x → v2.x

v2 is a near drop-in upgrade. The one breaking change is the removal of the experimental **WebGL**
renderer; everything else is additive.

### What changed

- **WebGL renderer removed.** The old `effectMode="webgl"` (and the WebGL code path) is gone. It was
  heavy, fragile across browsers, and depended on a runtime that pushed the bundle far past the
  library's "tiny, zero-dependency" goal. v2 renders with a pure **SVG displacement filter** on
  Chromium and a **live-DOM mirror** (real refraction) or **frosted-blur** fallback on
  Safari/iOS/Firefox — no WebGL, no runtime dependencies.

### If you used `effectMode="webgl"`

Remove it. Pick the v2 equivalent:

```diff
- <LiquidGlass effectMode="webgl" />
+ <LiquidGlass />                      {/* SVG refraction on Chromium, frosted fallback elsewhere */}
```

For **real refraction on iOS / Safari / Firefox**, give the lens the element behind it:

```jsx
const bg = useRef(null);
// ...
<div ref={bg}>{/* the background behind the glass */}</div>
<LiquidGlass backdropRef={bg} />
```

`effectMode` still exists for choosing the strategy — valid values are now `'auto' | 'svg' |
'blur' | 'off'` (no `'webgl'`).

### Everything else is compatible

- `LiquidGlassProps` and `LiquidGlassHandle` are unchanged except for the removed `'webgl'` value
  and the **added** mirror props (`mirror`, `backdropRef`, `backdropSelector`, `mirrorScale`,
  `track`) introduced in 2.4.0.
- Without a `backdropRef`, `<LiquidGlass>` behaves exactly as before (blur fallback on iOS).
- Core import path, named exports, and SSR behavior are the same.

### New in v2 (opt-in subpaths)

- `simple-liquid-glass/interactive` — pointer-reactive elasticity (`<LiquidGlassInteractive>`).
- `simple-liquid-glass/web-component` — framework-agnostic `<liquid-glass>` for Vue/Svelte/Astro/vanilla.
- `simple-liquid-glass/mirror` — thin back-compat wrapper (the mirror now lives in the core component).

See the [CHANGELOG](../CHANGELOG.md) for the full version-by-version history.
