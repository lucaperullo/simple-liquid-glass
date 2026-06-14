# Migration guide

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
