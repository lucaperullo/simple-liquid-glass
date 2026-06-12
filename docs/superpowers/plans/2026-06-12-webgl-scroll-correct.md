# Scroll-Correct WebGL Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `effectMode="webgl"` track scrolling correctly on fixed navbars/cards over any page — native scroll, Lenis, Locomotive, ScrollSmoother — with no black regions, per spec `docs/superpowers/specs/2026-06-12-webgl-scroll-correct-design.md`.

**Architecture:** Capture-time rect bookkeeping + an "anchor" element that moves with content gives a per-frame `anchorDelta` that maps pane→texture correctly under both native and transform scrolling. The shader composites every tap over a detected fallback color (kills black). A scroll-aware re-capture policy (coverage trigger, velocity gate, idle re-true) keeps the snapshot fresh. Phase 2 crops captures to a sharp band around the viewport.

**Tech Stack:** TypeScript, raw WebGL1 (existing `SharedRenderer`), html2canvas (CDN), React 18, Jest (babel-jest, node env — pure functions only), Storybook 10 for visual verification.

**Pure-math modules are new files so they are jest-testable without DOM/WebGL.** The repo has zero tests today; Task 1 sets up jest.

**Conventions used below:**
- Run all commands from the repo root.
- `npm test` = jest. `npm run build` = rollup library build. Storybook verification uses the dev server on port 6006.
- Constants live in `src/webglRenderer.ts`: `RECAPTURE_DEBOUNCE_MS = 80`, `FAST_SCROLL_PX_PER_FRAME = 30`, `IDLE_RETRUE_MS = 300`, `ANCHOR_SCAN_DEPTH = 6`, `BAND_FACTOR = 3`.

---

### Task 1: Jest infrastructure + shared CSS color module

The color parsing currently lives *inside* the React component function ([src/index.tsx](../../src/index.tsx) ~lines 415–479: `parseCssColorToRgba`, `findNearestOpaqueBackground`, `isRgbColorDark`). The WebGL renderer needs the same logic for fallback-color detection. Extract to one module (house style: declared once, referenced everywhere).

**Files:**
- Create: `jest.config.cjs`
- Create: `src/cssColor.ts`
- Create: `src/__tests__/cssColor.test.ts`
- Modify: `src/index.tsx` (delete the three inner functions, import from `./cssColor`)

- [ ] **Step 1: Create jest config**

```js
// jest.config.cjs
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript'
        ]
      }
    ]
  }
};
```

(Inline presets on purpose — no root `babel.config.*`, so the rollup build's browser-targeted babel config is unaffected.)

- [ ] **Step 2: Write the failing test**

```ts
// src/__tests__/cssColor.test.ts
import { parseCssColorToRgba, isRgbColorDark } from '../cssColor';

describe('parseCssColorToRgba', () => {
  it('parses rgb()', () => {
    expect(parseCssColorToRgba('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });
  it('parses rgba()', () => {
    expect(parseCssColorToRgba('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });
  it('parses #rgb, #rgba, #rrggbb, #rrggbbaa', () => {
    expect(parseCssColorToRgba('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColorToRgba('#f00a')).toEqual({ r: 255, g: 0, b: 0, a: 170 / 255 });
    expect(parseCssColorToRgba('#102030')).toEqual({ r: 16, g: 32, b: 48, a: 1 });
    expect(parseCssColorToRgba('#10203080')).toEqual({ r: 16, g: 32, b: 48, a: 128 / 255 });
  });
  it('returns null for unparseable input', () => {
    expect(parseCssColorToRgba('not-a-color')).toBeNull();
    expect(parseCssColorToRgba('')).toBeNull();
  });
});

describe('isRgbColorDark', () => {
  it('classifies black dark and white light', () => {
    expect(isRgbColorDark({ r: 0, g: 0, b: 0 })).toBe(true);
    expect(isRgbColorDark({ r: 255, g: 255, b: 255 })).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/__tests__/cssColor.test.ts`
Expected: FAIL — `Cannot find module '../cssColor'`

- [ ] **Step 4: Create `src/cssColor.ts`**

Move the three functions verbatim from `src/index.tsx` (they are currently inside the component body) into module scope, with exports. The bodies are identical to the existing code:

```ts
// src/cssColor.ts
/** Shared CSS color helpers (single source of truth for component + WebGL renderer). */

export interface Rgba { r: number; g: number; b: number; a: number }

export function parseCssColorToRgba(color: string): Rgba | null {
  const c = color.trim();
  let m: RegExpExecArray | null;
  if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i.exec(c))) {
    const r = parseInt(m[1], 10);
    const g = parseInt(m[2], 10);
    const b = parseInt(m[3], 10);
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    return { r, g, b, a };
  }
  if ((m = /^#([0-9a-f]{3})$/i.exec(c))) {
    const hex = m[1];
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: 1
    };
  }
  if ((m = /^#([0-9a-f]{4})$/i.exec(c))) {
    const hex = m[1];
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: parseInt(hex[3] + hex[3], 16) / 255
    };
  }
  if ((m = /^#([0-9a-f]{6})$/i.exec(c))) {
    const hex = m[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1
    };
  }
  if ((m = /^#([0-9a-f]{8})$/i.exec(c))) {
    const hex = m[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16) / 255
    };
  }
  // hsla/hsl not needed: computed styles return rgb/rgba
  return null;
}

export function findNearestOpaqueBackground(element: HTMLElement | null): Rgba | null {
  let el: HTMLElement | null = element;
  while (el) {
    const style = getComputedStyle(el);
    const bg = style.backgroundColor;
    const parsed = bg ? parseCssColorToRgba(bg) : null;
    if (parsed && parsed.a > 0) return parsed;
    el = el.parentElement;
  }
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  return bodyBg ? parseCssColorToRgba(bodyBg) : null;
}

export function isRgbColorDark(rgb: { r: number; g: number; b: number }): boolean {
  const srgb = [rgb.r, rgb.g, rgb.b].map(v => v / 255);
  const linear = srgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance < 0.5;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/cssColor.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Use the module from index.tsx**

In `src/index.tsx`:
1. Add to imports at top: `import { parseCssColorToRgba, findNearestOpaqueBackground, isRgbColorDark } from './cssColor';`
2. Delete the three function declarations inside the component body (search for `function parseCssColorToRgba`, `function findNearestOpaqueBackground`, `function isRgbColorDark` — ~lines 415–479). Call sites stay unchanged.

- [ ] **Step 7: Verify build and full test suite**

Run: `npm run build && npm test`
Expected: build succeeds; jest passes. (`npm test` exits 0 now that tests exist.)

- [ ] **Step 8: Commit**

```bash
git add jest.config.cjs src/cssColor.ts src/__tests__/cssColor.test.ts src/index.tsx
git commit -m "refactor: extract shared cssColor module, add jest infrastructure"
```

---

### Task 2: Pure geometry module (`webglGeometry.ts`)

All coordinate math as pure functions: per-frame sample mapping, anchor delta, coverage check, anchor candidate scoring, capture-band placement (used in Task 8).

**Files:**
- Create: `src/webglGeometry.ts`
- Create: `src/__tests__/webglGeometry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/webglGeometry.test.ts
import {
  anchorDelta,
  computeSampleRect,
  coverageNeedsRecapture,
  recaptureWouldHelp,
  isAnchorCandidate,
  computeCaptureBand
} from '../webglGeometry';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe('anchorDelta', () => {
  it('is zero when the anchor has not moved', () => {
    expect(anchorDelta(rect(0, -100, 800, 3000), rect(0, -100, 800, 3000))).toEqual({ dx: 0, dy: 0 });
  });
  it('is negative dy when content moved up (scrolled down)', () => {
    expect(anchorDelta(rect(0, -400, 800, 3000), rect(0, -100, 800, 3000))).toEqual({ dx: 0, dy: -300 });
  });
});

describe('computeSampleRect', () => {
  const region = { left: 0, top: 0, width: 800, height: 3000 };

  it('reduces to the legacy formula when anchor === source (native scroll)', () => {
    // page scrolled 500px since capture: src rect moved up 500, delta = -500
    const pane = rect(100, 0, 600, 80); // fixed navbar
    const capturedSrc = rect(0, 0, 800, 3000); // captured at scroll 0
    const sample = computeSampleRect(pane, capturedSrc, region, { dx: 0, dy: -500 }, 800, 3000);
    // legacy: pane.top - liveSrc.top = 0 - (-500) = 500
    expect(sample).toEqual({ x: 100, y: 500, w: 600, h: 80 });
  });

  it('maps through a transform-scrolled wrapper (source static)', () => {
    // body box static at (0,0,800,900); wrapper translated up 500 since capture
    const pane = rect(100, 0, 600, 80);
    const capturedSrc = rect(0, 0, 800, 900);
    const region900 = { left: 0, top: 0, width: 800, height: 900 };
    const sample = computeSampleRect(pane, capturedSrc, region900, { dx: 0, dy: -500 }, 800, 900);
    expect(sample).toEqual({ x: 100, y: 500, w: 600, h: 80 });
  });

  it('scales into snapshot pixels and offsets by the captured region', () => {
    const pane = rect(0, 100, 400, 100);
    const capturedSrc = rect(0, -1000, 800, 3000);
    const band = { left: 0, top: 800, width: 800, height: 1200 };
    // texture is 1600x2400 -> 2x scale
    const sample = computeSampleRect(pane, capturedSrc, band, { dx: 0, dy: 0 }, 1600, 2400);
    // y in source box = 100 - (-1000) = 1100; minus band top 800 = 300; x2 = 600
    expect(sample).toEqual({ x: 0, y: 600, w: 800, h: 200 });
  });
});

describe('coverageNeedsRecapture', () => {
  it('is false when the sample is inside the texture', () => {
    expect(coverageNeedsRecapture({ x: 10, y: 10, w: 100, h: 100 }, 800, 3000, 0, 0)).toBe(false);
  });
  it('is true when the sample exits the bottom', () => {
    expect(coverageNeedsRecapture({ x: 10, y: 2950, w: 100, h: 100 }, 800, 3000, 0, 0)).toBe(true);
  });
  it('respects the proactive y margin', () => {
    expect(coverageNeedsRecapture({ x: 10, y: 2850, w: 100, h: 100 }, 800, 3000, 0, 100)).toBe(true);
    expect(coverageNeedsRecapture({ x: 10, y: 2850, w: 100, h: 100 }, 800, 3000, 0, 0)).toBe(false);
  });
  it('y margin does not false-trigger on x (navbar at the left edge)', () => {
    // full-width capture: x≈0 is normal and must not trip the y margin
    expect(coverageNeedsRecapture({ x: 0, y: 1500, w: 100, h: 100 }, 800, 3000, 0, 400)).toBe(false);
  });
});

describe('recaptureWouldHelp', () => {
  it('is false at rest (prevents recapture loops at page top)', () => {
    expect(recaptureWouldHelp({ dx: 0, dy: 0 })).toBe(false);
    expect(recaptureWouldHelp({ dx: 0.5, dy: -0.5 })).toBe(false);
  });
  it('is true once the anchor has moved', () => {
    expect(recaptureWouldHelp({ dx: 0, dy: -2 })).toBe(true);
  });
});

describe('isAnchorCandidate', () => {
  const vp = 900;
  it('accepts a transformed full-width wrapper taller than the viewport', () => {
    expect(isAnchorCandidate({ transformed: true, willChangeTransform: false, width: 800, height: 4000 }, 800, vp)).toBe(true);
  });
  it('accepts will-change: transform even before any transform applies', () => {
    expect(isAnchorCandidate({ transformed: false, willChangeTransform: true, width: 800, height: 4000 }, 800, vp)).toBe(true);
  });
  it('rejects a parallax hero (narrow or short)', () => {
    expect(isAnchorCandidate({ transformed: true, willChangeTransform: false, width: 400, height: 4000 }, 800, vp)).toBe(false);
    expect(isAnchorCandidate({ transformed: true, willChangeTransform: false, width: 800, height: 600 }, 800, vp)).toBe(false);
  });
  it('rejects untransformed elements', () => {
    expect(isAnchorCandidate({ transformed: false, willChangeTransform: false, width: 800, height: 4000 }, 800, vp)).toBe(false);
  });
});

describe('computeCaptureBand', () => {
  it('centers the band on the viewport', () => {
    // viewport at 5000 in a 20000 box, 900 viewport, 3x band = 2700
    expect(computeCaptureBand(5000, 900, 20000, 3, 10000)).toEqual({ top: 4100, height: 2700 });
  });
  it('clamps to the top of the box', () => {
    expect(computeCaptureBand(0, 900, 20000, 3, 10000)).toEqual({ top: 0, height: 2700 });
  });
  it('clamps to the bottom of the box', () => {
    expect(computeCaptureBand(19500, 900, 20000, 3, 10000)).toEqual({ top: 17300, height: 2700 });
  });
  it('never exceeds the box height (wrapper-mode viewport-sized body)', () => {
    expect(computeCaptureBand(0, 900, 900, 3, 10000)).toEqual({ top: 0, height: 900 });
  });
  it('respects the max texture limit', () => {
    expect(computeCaptureBand(5000, 900, 20000, 3, 2000)).toEqual({ top: 4450, height: 2000 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/webglGeometry.test.ts`
Expected: FAIL — `Cannot find module '../webglGeometry'`

- [ ] **Step 3: Implement `src/webglGeometry.ts`**

```ts
// src/webglGeometry.ts
/*
 * Pure coordinate math for the WebGL glass renderer.
 * All functions are side-effect free and DOM-free so they are unit-testable.
 *
 * Coordinate model (spec §1):
 *   anchorDelta = anchorRectNow − capturedAnchorRect
 *   samplePos   = (paneRect − capturedSrcRect − region.origin) − anchorDelta   [× texture scale]
 * When the anchor is the source itself this reduces to the legacy live-rect formula.
 */

export interface RectLike { left: number; top: number; width: number; height: number }

/** Captured region in source-box CSS px (full box in phase 1, a band in phase 2). */
export interface CapturedRegion { left: number; top: number; width: number; height: number }

export interface SampleRect { x: number; y: number; w: number; h: number }

export interface Delta { dx: number; dy: number }

export function anchorDelta(now: RectLike, captured: RectLike): Delta {
  return { dx: now.left - captured.left, dy: now.top - captured.top };
}

export function computeSampleRect(
  pane: RectLike,
  capturedSrc: RectLike,
  region: CapturedRegion,
  delta: Delta,
  texW: number,
  texH: number
): SampleRect {
  const sx = texW / Math.max(1, region.width);
  const sy = texH / Math.max(1, region.height);
  return {
    x: (pane.left - capturedSrc.left - region.left - delta.dx) * sx,
    y: (pane.top - capturedSrc.top - region.top - delta.dy) * sy,
    w: pane.width * sx,
    h: pane.height * sy
  };
}

/**
 * True when the sampled rect exits (or comes within the per-axis margin of)
 * the texture. Margins are separate per axis: vertical bands capture the full
 * source width, so a navbar legitimately sitting at x≈0 must not trip a
 * y-axis proactive margin.
 */
export function coverageNeedsRecapture(
  s: SampleRect,
  texW: number,
  texH: number,
  marginX: number,
  marginY: number
): boolean {
  return s.x < marginX || s.y < marginY || s.x + s.w > texW - marginX || s.y + s.h > texH - marginY;
}

/**
 * A recapture re-bases the delta to zero. If the delta is already ~zero a new
 * capture reproduces the same coverage — returning false here prevents
 * infinite recapture loops (e.g. a navbar sitting at the page top at rest).
 */
export function recaptureWouldHelp(delta: Delta): boolean {
  return Math.abs(delta.dx) > 1 || Math.abs(delta.dy) > 1;
}

export interface AnchorCandidateMetrics {
  transformed: boolean;
  willChangeTransform: boolean;
  width: number;
  height: number;
}

/** Spec §2: moving wrapper = (transform or will-change) + taller than viewport + ≥ ⅔ source width. */
export function isAnchorCandidate(c: AnchorCandidateMetrics, srcWidth: number, viewportH: number): boolean {
  if (!c.transformed && !c.willChangeTransform) return false;
  if (c.height <= viewportH) return false;
  return c.width >= srcWidth * (2 / 3);
}

/**
 * Spec §5: place a capture band of ~`factor` viewport-heights centered on the
 * visible area, clamped to the source box and the GPU texture limit.
 * `visibleTop` is the viewport top in source-box CSS px (= −srcRect.top).
 */
export function computeCaptureBand(
  visibleTop: number,
  viewportH: number,
  srcBoxH: number,
  factor: number,
  maxCssH: number
): { top: number; height: number } {
  const height = Math.max(viewportH, Math.min(srcBoxH, viewportH * factor, maxCssH));
  const top = Math.min(Math.max(visibleTop - (height - viewportH) / 2, 0), Math.max(0, srcBoxH - height));
  return { top, height };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/webglGeometry.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add src/webglGeometry.ts src/__tests__/webglGeometry.test.ts
git commit -m "feat(webgl): pure geometry module — anchor delta mapping, coverage checks, capture band"
```

---

### Task 3: Shader fallback fill (spec §3)

Composite every texture tap over `u_fallback`; taps outside the texture fade to the fallback over 8 snapshot px (replaces edge-clamp smearing). New `fallbackColor` option; auto-detect via `findNearestOpaqueBackground`.

**Files:**
- Modify: `src/webglRenderer.ts` (FRAG shader, uniforms list, options, Lens, capture, renderLens)

- [ ] **Step 1: Add the option and Lens field**

In `WebGLGlassOptions` (after `autoRefresh`):

```ts
  /**
   * Color shown where the snapshot has no data (transparent pixels, or
   * outside the captured region during fast scrolls). Any CSS color string.
   * Default: nearest opaque background-color above the snapshot source.
   */
  fallbackColor?: string;
```

In `interface Lens` (after `autoRefresh: boolean;`): `fallbackColor?: string;`

In `createWebGLGlass`'s lens literal (after `autoRefresh: ...`): `fallbackColor: options.fallbackColor,`

- [ ] **Step 2: Add the fallback color to SnapshotEntry and capture()**

Add import at top of `src/webglRenderer.ts`:

```ts
import { parseCssColorToRgba, findNearestOpaqueBackground } from './cssColor';
```

In `interface SnapshotEntry`, add: `fallback: [number, number, number];`

In `snapshotFor()`'s entry literal, add: `fallback: [1, 1, 1],`

At the top of `capture()` (right after the `bgSig` try block), add:

```ts
    // Fallback color for no-data regions (spec §3): explicit option, else
    // nearest opaque background-color above the source, else white.
    try {
      const rgba =
        (lens.fallbackColor ? parseCssColorToRgba(lens.fallbackColor) : null) ??
        findNearestOpaqueBackground(lens.source);
      if (rgba) entry.fallback = [rgba.r / 255, rgba.g / 255, rgba.b / 255];
    } catch {}
```

- [ ] **Step 3: Update the fragment shader**

In `FRAG`, add after the `u_frost` uniform declaration:

```glsl
uniform vec3  u_fallback; // shown where the snapshot has no data
```

Replace the existing `sampleTex` function with:

```glsl
vec3 sampleTex(vec2 px) {
  // px is in y-down snapshot coordinates; row 0 (image top) sits at v = 0.
  vec2 uv = px / u_texSize;
  // Distance (in snapshot px) outside the texture; fade to fallback over 8px
  // instead of edge-clamp smearing.
  vec2 d2 = max(-px, px - u_texSize);
  float outside = max(max(d2.x, d2.y), 0.0);
  float fade = smoothstep(0.0, 8.0, outside);
  vec4 t = texture2D(u_tex, clamp(uv, vec2(0.001), vec2(0.999)));
  // Transparent (uncaptured) pixels composite over the fallback color.
  vec3 col = mix(u_fallback, t.rgb, t.a);
  return mix(col, u_fallback, fade);
}
```

- [ ] **Step 4: Wire the uniform**

In the constructor's uniform-name loop, add `'u_fallback'` to the array.

In `renderLens()`, with the other `gl.uniform*` calls:

```ts
    gl.uniform3f(u.u_fallback, entry.fallback[0], entry.fallback[1], entry.fallback[2]);
```

Also add `entry.fallback.join(',')` to the `key` array in `renderLens` so a fallback change invalidates the frame cache:

```ts
    const key = [x, y, w, h, cw, ch, entry.fallback.join(','), JSON.stringify(lens.params)].join('|');
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: tests pass, build succeeds.

Storybook check (server on :6006): open the `WebGLRefraction` story, confirm it renders as before (background present, no black fringes at pane edges).

- [ ] **Step 6: Commit**

```bash
git add src/webglRenderer.ts
git commit -m "feat(webgl): fallback fill for uncaptured/transparent regions (no more black)"
```

---

### Task 4: Anchor tracking + capture-time rect bookkeeping (spec §1–§2)

**Files:**
- Modify: `src/webglRenderer.ts`

- [ ] **Step 1: Add options, imports, constants**

Import (extend the Task 2 module import):

```ts
import {
  anchorDelta,
  computeSampleRect,
  coverageNeedsRecapture,
  recaptureWouldHelp,
  isAnchorCandidate,
  computeCaptureBand
} from './webglGeometry';
import type { RectLike, CapturedRegion } from './webglGeometry';
```

(`import type` matters: the interfaces vanish at compile time, and a value-position
import of a non-existent runtime export is an ESM linking error under rollup.)

```ts
```

Constants (module scope, near `H2C_CDN`):

```ts
const RECAPTURE_DEBOUNCE_MS = 80;
const FAST_SCROLL_PX_PER_FRAME = 30;
const IDLE_RETRUE_MS = 300;
const ANCHOR_SCAN_DEPTH = 6;
const BAND_FACTOR = 3;
```

In `WebGLGlassOptions` (after `fallbackColor`):

```ts
  /**
   * The element that moves with the page content (smooth-scroll wrapper).
   * Auto-detected when omitted: largest descendant of the snapshot source
   * with transform/will-change:transform, taller than the viewport and
   * ≥ ⅔ of the source width. Pass explicitly when detection misses.
   */
  anchor?: HTMLElement | null;
```

In `interface Lens`: `anchor?: HTMLElement | null;` — and in `createWebGLGlass`'s lens literal: `anchor: options.anchor,`

- [ ] **Step 2: Extend SnapshotEntry**

Add fields to `interface SnapshotEntry`:

```ts
  /** capture-time bookkeeping (spec §1) */
  capturedSrcRect: RectLike | null;
  capturedAnchorRect: RectLike | null;
  anchorEl: HTMLElement | null;
  region: CapturedRegion | null;
  /** motion bookkeeping for §4 policy (updated from the render loop) */
  lastAnchorX: number;
  lastAnchorY: number;
  lastMoveAt: number;
  velocity: number;
  movedSinceCapture: boolean;
  idleRetrueDone: boolean;
```

And to `snapshotFor()`'s entry literal:

```ts
        capturedSrcRect: null,
        capturedAnchorRect: null,
        anchorEl: null,
        region: null,
        lastAnchorX: 0,
        lastAnchorY: 0,
        lastMoveAt: 0,
        velocity: 0,
        movedSinceCapture: false,
        idleRetrueDone: true,
```

- [ ] **Step 3: Anchor detection (DOM walker, pure scoring from Task 2)**

Module scope (near `loadImage`):

```ts
/** Spec §2: find the element that moves with content under transform-based scrolling. */
function detectAnchor(source: HTMLElement): HTMLElement {
  const viewportH = window.innerHeight || 800;
  const srcW = source.getBoundingClientRect().width || 1;
  let best: HTMLElement | null = null;
  let bestArea = 0;
  const scan = (el: Element, depth: number): void => {
    if (depth > ANCHOR_SCAN_DEPTH) return;
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      if (!(child instanceof HTMLElement)) continue;
      try {
        const cs = getComputedStyle(child);
        const r = child.getBoundingClientRect();
        const metrics = {
          transformed: !!cs.transform && cs.transform !== 'none',
          willChangeTransform: /transform/.test(cs.willChange || ''),
          width: r.width,
          height: r.height
        };
        const area = r.width * r.height;
        if (isAnchorCandidate(metrics, srcW, viewportH) && area > bestArea) {
          best = child;
          bestArea = area;
        }
      } catch {}
      scan(child, depth + 1);
    }
  };
  scan(source, 1);
  return best ?? source;
}
```

- [ ] **Step 4: Record rects at capture time**

In `capture()`, immediately before the `try` block that calls `lens.getSnapshot` / html2canvas (i.e. after the fallback-color block from Task 3), add:

```ts
    // Spec §1/§2: re-detect the anchor at every capture (libraries apply
    // transforms lazily) and record capture-time rects. html2canvas clones the
    // document synchronously at call time, so rects recorded here match the
    // captured pixels.
    const anchorEl =
      lens.anchor && lens.anchor.isConnected ? lens.anchor : detectAnchor(lens.source);
    const srcRectAtCapture = lens.source.getBoundingClientRect();
    entry.anchorEl = anchorEl;
    entry.capturedSrcRect = {
      left: srcRectAtCapture.left,
      top: srcRectAtCapture.top,
      width: srcRectAtCapture.width,
      height: srcRectAtCapture.height
    };
    const aRect = anchorEl.getBoundingClientRect();
    entry.capturedAnchorRect = { left: aRect.left, top: aRect.top, width: aRect.width, height: aRect.height };
    entry.movedSinceCapture = false;
    entry.idleRetrueDone = true;
```

And right after the existing `const srcW = ...; const srcH = ...;` lines (html2canvas path), set the captured region (phase 1 = full box; Task 8 narrows it):

```ts
          entry.region = { left: 0, top: 0, width: srcW, height: srcH };
```

For the custom-`getSnapshot` path, set the region after `img = await lens.getSnapshot();`:

```ts
        entry.region = {
          left: 0,
          top: 0,
          width: Math.max(1, lens.source.scrollWidth),
          height: Math.max(1, lens.source.scrollHeight)
        };
```

Note: the existing `compositeSourceBackground(..., lens.source.getBoundingClientRect())` call should use `srcRectAtCapture` instead — replace that argument.

- [ ] **Step 5: Rewrite the mapping in renderLens()**

Replace this block:

```ts
    const srcRect = lens.source.getBoundingClientRect();
    const sx = entry.texW / Math.max(1, srcRect.width);
    const sy = entry.texH / Math.max(1, srcRect.height);
    // pane position relative to the snapshot source, in snapshot px (y-down)
    const x = (rect.left - srcRect.left) * sx;
    const y = (rect.top - srcRect.top) * sy;
    const w = rect.width * sx;
    const h = rect.height * sy;
```

with:

```ts
    if (!entry.capturedSrcRect || !entry.capturedAnchorRect || !entry.region) return;
    const anchorEl =
      entry.anchorEl && entry.anchorEl.isConnected ? entry.anchorEl : lens.source;
    const aNow = anchorEl.getBoundingClientRect();
    const delta = anchorDelta(aNow, entry.capturedAnchorRect);
    this.trackMotion(lens.source, entry, aNow);

    const sample = computeSampleRect(rect, entry.capturedSrcRect, entry.region, delta, entry.texW, entry.texH);
    const x = sample.x;
    const y = sample.y;
    const w = sample.w;
    const h = sample.h;
    const sx = entry.texW / Math.max(1, entry.region.width);

    // Spec §4 coverage trigger: recapture when sampling exits the texture —
    // but only when a recapture would change anything (anchor moved), the
    // scroll is not mid-fling, and no capture is already in flight.
    if (
      lens.autoRefresh &&
      coverageNeedsRecapture(sample, entry.texW, entry.texH, 0, 0) &&
      recaptureWouldHelp(delta) &&
      entry.velocity < FAST_SCROLL_PX_PER_FRAME &&
      !entry.capturing
    ) {
      this.scheduleRefresh(lens.source, RECAPTURE_DEBOUNCE_MS);
    }
```

Then in the uniform block below, replace the old `const px = sx;` line's dependency — it already reads `sx`, which is now region-based. No other uniform code changes.

- [ ] **Step 6: Motion tracking + idle re-true (spec §4)**

Add as a private method on `SharedRenderer` (near `checkBackgroundSignatures`):

```ts
  /**
   * Per-frame anchor motion bookkeeping (spec §4): velocity for the fling
   * gate, and a one-shot re-capture after IDLE_RETRUE_MS of stillness to
   * re-true layers that do not move rigidly with the anchor (parallax,
   * sticky, fixed backgrounds, CSS animation).
   */
  private trackMotion(source: HTMLElement, entry: SnapshotEntry, aNow: DOMRect): void {
    const moved = Math.abs(aNow.top - entry.lastAnchorY) + Math.abs(aNow.left - entry.lastAnchorX);
    const now = performance.now();
    entry.velocity = moved;
    if (moved > 1) {
      entry.lastMoveAt = now;
      entry.movedSinceCapture = true;
      entry.idleRetrueDone = false;
    } else if (
      entry.movedSinceCapture &&
      !entry.idleRetrueDone &&
      !entry.capturing &&
      now - entry.lastMoveAt > IDLE_RETRUE_MS
    ) {
      entry.idleRetrueDone = true;
      this.scheduleRefresh(source, 0);
    }
    entry.lastAnchorX = aNow.left;
    entry.lastAnchorY = aNow.top;
  }
```

Note the stale-capture guard needs no code: when a capture lands stale, the next frame's coverage check (delta re-based but still out of coverage is impossible — delta = 0 right after capture; coverage gaps re-open only when the anchor moves again, which re-arms the trigger). The single-flight `entry.capturing` promise plus the debounce already prevent thrashing.

- [ ] **Step 7: Mutation filtering (spec §4)**

In `observeSource()`'s MutationObserver callback, before the existing `for (const r of records)` loop's `isOwnedNode` check, skip the scroll library's per-frame transforms:

```ts
      for (const r of records) {
        // Spec §4: ignore the scroll library's per-frame style mutations on
        // the anchor (Lenis/Locomotive/ScrollSmoother transform updates).
        if (r.type === 'attributes' && r.attributeName === 'style' && r.target === entry.anchorEl) continue;
        const nodes: Node[] = [r.target];
```

(The `continue` replaces falling through to the nodes check for that record; the rest of the loop body is unchanged.)

- [ ] **Step 8: Verify**

Run: `npm test && npm run build`
Expected: all green.

Storybook check: `WebGLRefraction` story renders identically to before (anchor = source there; the delta is zero, so the legacy mapping reproduces).

- [ ] **Step 9: Commit**

```bash
git add src/webglRenderer.ts
git commit -m "feat(webgl): anchor-tracked scroll mapping + scroll-aware recapture policy"
```

---

### Task 5: Component props wiring (spec §6)

**Files:**
- Modify: `src/index.tsx` (props interface, destructuring, `createWebGLGlass` call, effect deps)
- Modify: `src/index.d.ts` (public types)

- [ ] **Step 1: Add props to the interface in `src/index.tsx`**

Find the props interface (search `effectMode?:` in the interface near the top) and add after `getSnapshot`:

```ts
  /**
   * WebGL mode: element that moves with the page content (smooth-scroll
   * wrapper, e.g. Lenis wrapper-mode content or ScrollSmoother's
   * #smooth-content). Auto-detected when omitted.
   */
  backdropAnchor?: HTMLElement | null;
  /**
   * WebGL mode: color shown where the snapshot has no data (during fast
   * scrolls past the captured region). Default: detected page background.
   */
  snapshotFallbackColor?: string;
```

Add `backdropAnchor`, `snapshotFallbackColor` to the component's prop destructuring (same place `getSnapshot` is destructured).

- [ ] **Step 2: Pass through to the renderer**

In the `createWebGLGlass({...})` call (~line 680), add:

```ts
        anchor: backdropAnchor,
        fallbackColor: snapshotFallbackColor,
```

Update that effect's dependency array from `[wantsWebGL]` to `[wantsWebGL, backdropAnchor, snapshotFallbackColor]` (changing either prop recreates the instance — they are capture-time inputs).

- [ ] **Step 3: Mirror in `src/index.d.ts`**

In `LiquidGlassProps` after `getSnapshot`:

```ts
  /**
   * WebGL mode: element that moves with the page content (smooth-scroll
   * wrapper). Auto-detected when omitted; pass explicitly when detection
   * misses your setup.
   */
  backdropAnchor?: HTMLElement | null;
  /**
   * WebGL mode: color shown where the snapshot has no data (during fast
   * scrolls past the captured region). Default: detected page background.
   */
  snapshotFallbackColor?: string;
```

In `WebGLGlassOptions` after `autoRefresh`:

```ts
  /** Color for regions with no snapshot data. Default: detected page background. */
  fallbackColor?: string;
  /** Element that moves with the content (smooth-scroll wrapper). Auto-detected when omitted. */
  anchor?: HTMLElement | null;
```

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build`
Expected: green.

```bash
git add src/index.tsx src/index.d.ts
git commit -m "feat: backdropAnchor + snapshotFallbackColor props for scroll-correct webgl"
```

---

### Task 6: TransformScroll Storybook story (end-to-end verification)

A Lenis-like wrapper (wheel → lerped `translateY` on a `will-change: transform` content div) with a fixed glass navbar — the exact scenario from the bug report.

**Files:**
- Modify: `src/LiquidGlass.stories.tsx` (append the story)

- [ ] **Step 1: Append the story**

```tsx
/**
 * Simulates a smooth-scroll library (Lenis wrapper mode / Locomotive /
 * ScrollSmoother): content moves via a lerped translateY on a
 * will-change:transform wrapper, NOT native scrolling. The glass navbar must
 * keep refracting the content that is visually behind it, and scrolling past
 * the captured region must show the page background color — never black.
 * Scroll with the mouse wheel over the box.
 */
function TransformScrollPage(args: React.ComponentProps<typeof LiquidGlass>) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const target = useRef(0);
  const current = useRef(0);

  useEffect(() => {
    const max = 2200;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      target.current = Math.max(0, Math.min(max, target.current + e.deltaY));
    };
    let raf = 0;
    const tick = () => {
      current.current += (target.current - current.current) * 0.08;
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(0, ${-current.current}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(raf);
    };
  }, []);

  const sections = [
    { bg: 'linear-gradient(135deg, #0ea5e9, #6366f1)', label: 'Section 1' },
    { bg: 'repeating-linear-gradient(45deg, #fbbf24 0 40px, #f59e0b 40px 80px)', label: 'Section 2' },
    { bg: 'radial-gradient(circle at 30% 40%, #f43f5e, #7c3aed)', label: 'Section 3' },
    { bg: 'repeating-conic-gradient(#0f172a 0% 12.5%, #e2e8f0 0% 25%)', label: 'Section 4' },
    { bg: 'linear-gradient(180deg, #16a34a, #052e16)', label: 'Section 5' }
  ];

  return (
    <div
      style={{
        width: '92vw',
        height: '85vh',
        overflow: 'hidden',
        position: 'relative',
        borderRadius: 12,
        background: '#e8e4da'
      }}
    >
      <div ref={contentRef} style={{ willChange: 'transform' }}>
        {sections.map((s) => (
          <div
            key={s.label}
            style={{
              height: '55vh',
              background: s.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 40,
              fontWeight: 700,
              textShadow: '0 2px 8px rgba(0,0,0,.4)'
            }}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* fixed glass navbar over the transform-scrolled content */}
      <div style={{ position: 'absolute', top: 16, left: 16, right: 16, height: 72 }}>
        <LiquidGlass {...args}>
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              fontWeight: 600
            }}
          >
            <span>liquid-nav</span>
            <span>scroll the page ↓</span>
          </div>
        </LiquidGlass>
      </div>
    </div>
  );
}

export const TransformScroll: Story = {
  args: {
    effectMode: 'webgl',
    aberrationIntensity: 1,
    blur: 2
  },
  parameters: { layout: 'fullscreen' },
  render: (args) => <TransformScrollPage {...args} />
};
```

- [ ] **Step 2: Build + visual verification in Storybook**

Run: `npm run build` (type errors surface here), then with Storybook running open
`/?path=/story/liquidglass-draggable--transform-scroll`.

Verify, in order:
1. Navbar shows refracted Section 1 content at load.
2. Wheel-scroll slowly: the refracted content **moves behind the glass in real time** (anchor delta mapping).
3. Scroll far/fast: any uncovered region shows the **container background tone** (`#e8e4da` family), never black.
4. Stop scrolling: within ~0.5s a re-capture lands and the refraction shows the correct current content (idle re-true + coverage trigger).
5. Scroll back to the top: same correctness, no black (the original bug).
6. Open `WebGLRefraction` and `Draggable` stories: unchanged (regression check).

- [ ] **Step 3: Commit**

```bash
git add src/LiquidGlass.stories.tsx
git commit -m "test(storybook): TransformScroll story — smooth-scroll navbar verification"
```

---

### Task 7: Spec sync — anchor scan depth

Implementation uses depth ≤ 6 (Storybook/portal DOMs nest the wrapper deeper than 3). Update the spec so it matches reality.

**Files:**
- Modify: `docs/superpowers/specs/2026-06-12-webgl-scroll-correct-design.md`

- [ ] **Step 1: Edit the spec**

In §2, change "scan source descendants (depth ≤ 3)" to "scan source descendants (depth ≤ 6)".

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-12-webgl-scroll-correct-design.md
git commit -m "docs: spec sync — anchor scan depth 6"
```

---

### Task 8: Phase 2 — sliding-window band capture (spec §5)

Captures crop to a sharp band (~3 viewport heights) around the viewport instead of the full page. All §4 triggers are already in place from Task 4; this task only changes *what* a capture covers.

**Files:**
- Modify: `src/webglRenderer.ts` (`capture()` html2canvas path)

- [ ] **Step 1: Compute the band and crop the capture**

In `capture()`, html2canvas path — replace:

```ts
          const srcW = Math.max(1, lens.source.scrollWidth);
          const srcH = Math.max(1, lens.source.scrollHeight);
          const scale = Math.max(0.25, Math.min(lens.resolution, this.maxTex / srcW, this.maxTex / srcH));
```

with:

```ts
          const srcW = Math.max(1, lens.source.scrollWidth);
          const srcH = Math.max(1, lens.source.scrollHeight);
          // Spec §5: capture a sharp band around the viewport instead of the
          // whole page. visibleTop = viewport top in source-box CSS px.
          const viewportH = window.innerHeight || 800;
          const maxCssH = this.maxTex / Math.max(0.25, lens.resolution);
          const band = computeCaptureBand(-srcRectAtCapture.top, viewportH, srcH, BAND_FACTOR, maxCssH);
          const scale = Math.max(0.25, Math.min(lens.resolution, this.maxTex / srcW, this.maxTex / band.height));
```

And in the `h2c(lens.source, {...})` options object, add (html2canvas crop coordinates are document-relative):

```ts
              y: srcRectAtCapture.top + window.scrollY + band.top,
              height: band.height,
```

Then change the Task 4 region assignment in this path from the full box to the band:

```ts
          entry.region = { left: 0, top: band.top, width: srcW, height: band.height };
```

(`srcRectAtCapture` exists from Task 4 Step 4. The custom-`getSnapshot` path keeps its full-box region — external snapshots are whole-source by contract.)

- [ ] **Step 2: Proactive margin for the coverage trigger**

In `renderLens()` (Task 4 Step 5 block), change the `coverageNeedsRecapture(sample, entry.texW, entry.texH, 0, 0)` call to use a half-viewport **y-axis** margin so re-captures start *before* the band edge becomes visible — but only when the captured region is actually a crop (full-box captures keep margin 0, preventing false triggers on short pages). The x margin stays 0: bands span the full source width, so x≈0 is normal for a left-edge pane.

```ts
      const cropped = entry.region.height < Math.max(1, lens.source.scrollHeight) - 1;
      const marginY = cropped
        ? 0.5 * (window.innerHeight || 800) * (entry.texH / Math.max(1, entry.region.height))
        : 0;
```

and call `coverageNeedsRecapture(sample, entry.texW, entry.texH, 0, marginY)`.

- [ ] **Step 3: Verify**

Run: `npm test && npm run build`
Expected: green.

Storybook checks:
1. `TransformScroll` story: behavior from Task 6 still holds; refraction noticeably sharper if you compare against the pre-band build (band ≤ 3·vh is captured at full resolution).
2. `WebGLRefraction` story (short page): renders as before — band degenerates to the full box (`computeCaptureBand` clamps to `srcBoxH`).
3. Native-scroll spot check: in `TransformScroll`, the band math also covers the native path (anchor = source) — scroll, stop, confirm re-capture lands with correct content.

- [ ] **Step 4: Commit**

```bash
git add src/webglRenderer.ts
git commit -m "feat(webgl): sliding-window band capture — sharp refraction on long pages"
```

---

### Task 9: README — smooth-scroll documentation (spec §6)

**Files:**
- Modify: `README.md` (add a section after the existing WebGL/effectMode docs)

- [ ] **Step 1: Add the section**

Find the WebGL section in README.md (search for `effectMode`) and append:

```markdown
### Smooth-scroll libraries (Lenis, Locomotive Scroll, GSAP ScrollSmoother)

`effectMode="webgl"` tracks scrolling per-frame:

- **Native scrolling** — including Lenis in its default mode (it animates real
  `scrollTop`) — works out of the box.
- **Transform-based scrolling** (Lenis wrapper mode, Locomotive Scroll, GSAP
  ScrollSmoother) is auto-detected: the renderer finds the moving wrapper and
  tracks it. If detection misses your setup, point the component at the wrapper
  explicitly:

```tsx
<LiquidGlass effectMode="webgl" backdropAnchor={smoothContentEl}>
  <Nav />
</LiquidGlass>
```

- Regions the snapshot hasn't covered yet (e.g. during a fast fling) render in
  the detected page background color; override with
  `snapshotFallbackColor="#0b1020"`.

The backdrop still cannot be read live (browser security): the glass refracts
periodically refreshed snapshots. Snapshots refresh automatically when you
scroll beyond the captured band and ~300 ms after scrolling settles.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: smooth-scroll guidance for webgl mode (backdropAnchor, snapshotFallbackColor)"
```

---

## Final verification (after all tasks)

1. `npm test` — all jest suites pass.
2. `npm run build` — clean.
3. Storybook: walk `Draggable`, `WebGLRefraction`, `TransformScroll`; console free of errors.
4. The TransformScroll acceptance list (Task 6 Step 2) passes end-to-end.

Release (1.5.0) is a separate user decision — not part of this plan.
