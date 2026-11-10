## Unreleased

- **`simple-liquid-glass/next`** (new, experimental): the first slice of the 6.0 renderer core. `createGlassHost()`
  takes a scene as data (layers, rounded-box shapes, a material and a backdrop picture per layer) and a renderer
  draws it: from a worker on canvases handed over with `transferControlToOffscreen` where the browser supports
  WebGL there, on the page thread otherwise, with the same code and the same picture. Springs run on the
  renderer's clock in fixed sub-steps, so motion is the same at 60 and 120 Hz and does not wait for the page
  thread. Each layer canvas has its own WebGL context and is drawn only when something in it changed; a scene at
  rest requests no frames. The worker ships inside the entry and starts from a Blob URL; `workerUrl` (with
  `simple-liquid-glass/next/worker`) covers sites that forbid `blob:` workers. No 5.x entry point changes.
  - **Materials.** A material is GLSL defining `slg_shade` (and optionally `slg_combine`, how two shapes' fields
    become one) plus its uniforms; `host.defineMaterial()` adds one, `layer.setParams()` changes its uniforms, and
    `lean: true` compiles a cheaper variant (`SLG_LEAN`). The built-in `glass` (`GLASS_MATERIAL`) is defined the
    same way, with a dark tuning (default) and `GLASS_LIGHT`. The engine shades two triangles around each shape
    and clears the rest: on a 120 Hz Android phone at 3× resolution that holds 116–118 fps where shading the whole
    canvas gives 88–91.
    Each shape also carries eight free attributes (a colour, a lift, a flag) that spring with its box and reach
    the material as two `vec4`s, and a material may define the whole field itself (`field`) instead of a pairwise
    `combine`. A layer draws before it has a backdrop (`slg_hasBackdrop()`); the built-in glass stays invisible
    until then.
  - **Content that stays on its glass.** `addShape(box, { content: element })` keeps an element's corner on the
    shape. Springs now run on absolute time, so the page thread can run the same spring ahead and hand its path
    to the compositor as a keyframe animation that starts when the glass's does. On a 120 Hz Android phone the
    content sits on worker-drawn glass in three mid-flight screenshots of four and is under half a frame ahead
    in the rest. A spring is now where the time says it is: after a long gap it has finished, not resumed.
  - **Four layers in a worker.** Browsers keep four WebGL contexts alive per worker and silently drop the oldest
    for a fifth. A fifth worker layer now comes back `'unsupported'` with its canvas untouched
    (`MAX_WORKER_LAYERS`), instead of blanking an earlier one.
  - **Scroll.** A layer and its backdrop are each placed in the document (default) or in the viewport
    (`fixed: true`). When the two move against each other (a fixed bar over a scrolling page), the host reports
    the window's scroll position once per page frame and the renderer predicts it in between, so the glass is
    redrawn at the display's rate. On a 120 Hz Android phone the glass stays within 1–3 device px of the page from
    the worker, against 9–36 px behind when drawn on the page thread. `scrollLead` shifts the prediction.
  - **Changing backdrops.** `setBackdrop()` takes an `ImageBitmap` or a `VideoFrame` and refills the layer's one
    texture; `streamBackdrop(video)` follows a playing video frame by frame without copying. A 720p 60 fps video
    behind animating glass is presented at 118–120 fps on the same phone.
- New code under `src/next` is linted (ESLint, `typescript-eslint` strict, type-checked) and formatted
  (Prettier) in CI, and compiled with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

- **Android refracts by default.** `renderer="auto"` now uses WebGL on Android Chromium, as it already did on iOS,
  instead of the CSS blur that did not refract. Glass with a `backdropRef`, `backdropSelector` or `LiquidGlassScene`
  bends its backdrop; without a source it keeps the same frosted CSS as before. On a low-end Android phone (ZTE
  Z2357N) the WebGL path kept 46 of 48 panels live at 43 fps. Set `mobileFallback="css-only"` (or `"svg"`) to keep
  the earlier behaviour. Diagnostics report the new reason `mobile-webgl`. Desktop Chromium is unchanged (SVG, or
  the shared WebGL scene for 16+ panels). The web component follows the same rule.

## 5.7.2

The official showcase and npm homepage are now https://simpleliquidglass.xyz/. Existing example routes use the interactive demo’s Vercel address.

## 5.7.1

The package README and example gallery now link to the Glass Pro component collection at https://simpleliquidglass.xyz/.

## 5.7.0

This release publishes `simple-liquid-glass/engine` as a public, **experimental** entry point with ESM,
CommonJS and TypeScript exports. Its types and behaviour may change in a minor release while `ENGINE_API`
stays `1`; consumers of this API should use `~5.7.0` and review the changelog before upgrading to another minor.

### Engine API (experimental)

- **`simple-liquid-glass/engine`** (new, `@experimental`): a framework-agnostic extension API for custom WebGL
  materials, built on the package's existing shared WebGL context, frame loop and backdrop leases — no React
  import. `ENGINE_API` is `1`. The page's engine is a singleton shared by every bundle of the package through
  `getGlassEngine()`.
  - **`defineMaterial({ id, fragment(caps), uniforms?, samplers?, inputs?, draw(ctx, params), reset? })`**: a
    private GLSL fragment that defines `vec4 slg_shade(vec2 p)` (premultiplied colour at the view point `p`, CSS
    px, y down), compiled once per WebGL context behind the stable `slg_*` prelude (`slg_view`, `slg_scale`,
    `slg_origin`, `slg_viewport`, `slg_time`, `slg_point()`, `slg_toScreen(p)`, `slg_hasBackdrop()`,
    `slg_backdrop(screen)`, `slg_hasUnder()`, `slg_under(screen)`). `draw()` returns
    `'drawn' | 'unchanged' | 'pending' | 'resized'`: `'pending'` still presents the frame and asks to be drawn
    again next frame (a backdrop still loading); `'resized'` redraws the surface at a freshly re-read `bleed()`
    in the same frame, up to 4 times.
  - **`defineResource({ id, create(gl), dispose? })`** and **`ctx.resource(resource)`**: one instance per WebGL
    context, created lazily and again (lazily) after a context restore — a shared LUT, noise texture or atlas.
  - **`createSurface({ host, material, params, backdrop?, backdropVersion?, bleed?, maxScale?, composition?, layer?, active?, onStatus? })`**:
    one drawn region, drawn either into its own presentation canvas sharing the package's one pooled WebGL
    context, or (`composition: 'auto'`, the default) into the nearest enclosing `Layer`'s shared canvas if the
    host sits inside one. `backdrop` is an `HTMLElement` (`<video>`/`<canvas>` sampled in place; anything else
    captured through the existing HTML-capture pipeline, loaded lazily — see Size, below), `{ scene: true }` for
    the nearest `LiquidGlassScene`, or `{ source: id }` for a registered `BackdropSource` (see below). `bleed`
    draws beyond the host's own box (CSS px, a function is read fresh every frame). `ctx.draw(rects?)` draws one
    or more view-space CSS-px rects, scissored within one `gl.viewport` for the whole call, widened (just once,
    not per rect) to the union of the view and every rect when one of them reaches past it — so a rect may
    legally extend past the view's own edges, see the bug fix below — or, with no `rects`, shades the whole
    surface. A surface whose material throws on 3 consecutive frames falls back (`status: { state: 'fallback',
    reason: 'material-error' }`) and stops drawing; every other surface keeps going.
  - **`createLayer(root, { scale?, under?, snapshots?, revealMs? })`** (G7): members (any descendant surface
    resolved through `createSurface`'s `'auto'`/`layer`) draw in document order into one shared canvas, inserted
    as `root`'s first child with `z-index: -1` (`root` gets `position: relative` and `isolation: isolate` if it
    does not already establish a stacking context, so ordinary sibling content paints over the canvas exactly
    where the DOM says it should — proven in `experiments/engine` with a real page screenshot, not just the
    canvas's own bitmap). There is no eligibility filter like `sharedScene.ts`'s `sceneIneligibility`: any
    descendant qualifies, including a `z-index: -1` host inside an isolated root. A layer with at least one
    member redraws every frame it has one — there is no fine-grained per-layer dirty tracking in this release
    (each member's own dirty/active/pendingRedraw bookkeeping still runs and still feeds `stats()`; it just does
    not gate whether the *layer* redraws). `SurfaceDiagnostics.composition` reports `'layer'` for a member,
    `'own'` otherwise; destroying a layer returns its members to their own canvas.
    - **Investigated, not a bug: a member's `ctx.draw(rects)` bleed can legitimately paint over a later
      member's own area.** Reported as a cross-member state leak ("member A shows member B's colour") from a
      minimal repro: two members in one layer, each padding `ctx.draw(rects)` past its own view. Confirmed to
      be exactly the documented "draw in document order, glass on glass" compositing, not a GL-state leak — a
      later member's own bleed/pad geometrically crosses an earlier one's area whenever `bleed + pad` reaches
      at least `gap + host/2` (the gap to the next member, plus half that member's own width/height), the same
      way a later DOM sibling with enough negative margin or reach would paint over an earlier one. Verified by
      sweeping that exact threshold (33 B/px either side of it flips the result) and by checking every member's
      actual colour across a 20-member layer, which matched "each shows its immediate successor's colour"
      precisely, not any other pattern a real state leak could produce. `src/__tests__/engineLayers.test.ts`
      adds a mechanism-level test (two members positioned far enough apart that neither's pad could ever
      reach the other) pinning that `gl.viewport`/`gl.scissor`/the colour uniform are each correctly scoped per
      member regardless; `experiments/engine` adds both a safe-geometry scenario (neither member's bleed comes
      close to the other) and the reported repro's own aggressive one (verifying the later member's bleed
      legitimately wins in the overlap, and the earlier member's own far-side bleed, outside that overlap,
      still correctly shows its own colour).
  - **`under`/`snapshots`** (G8, both opt-in and **off by default** — stock `<LiquidGlass>` never turns them on):
    `LayerOptions.under: true` copies the layer's buffer (`gl.copyTexImage2D`, one extra copy per member) right
    before each member draws, so a later member's `slg_under(screen)` reads the glass already drawn beneath it
    in document order — the mechanism behind glass on glass, matching `compositor.ts`'s `copyTexSubImage2D`
    "under" copy. `LayerOptions.snapshots: true` keeps a downscaled copy of the layer's last *completed* frame;
    any floating (`composition: 'own'`) surface whose nearest layer has `snapshots` on reads that same way
    through `slg_under`, automatically.
  - **`registerBackdropSource({ id, paint(ctx, region, scale, exclude), version(), covers? })`** (G12): a private
    provider — Pro's `pageScene`, say — paints a CSS-px strip into a 2D canvas the engine owns and uploads
    through the existing `acquireTexture` lease; `backdrop: { source: id }` on a surface samples it exactly like
    any other backdrop. The engine repaints only when `version()` changes or the surface's own view would read
    outside the last painted strip (margin 160 CSS px, painted at the surface's own scale × 0.75), not every
    frame. A surface naming an id that registers later is wired up automatically once it appears. `covers()` is
    accepted by the type but not yet consulted — a reasonable optimisation left for later.
  - **`ctx.uniform()` now detects the GLSL type**, read once per program via `getActiveUniform` right after
    linking: an `int`/`bool`/`sampler2D`/`samplerCube` uniform is sent with `uniformNi` (values rounded), a
    `float`/`vecN` one with `uniformNf` as before. Previously `uniform()` always called `uniformNf`, which
    raises `GL_INVALID_OPERATION` on a real driver for a GLSL `uniform int` (jsdom's mocked WebGL context never
    validated this, so the bug was invisible to the mocked-GL jest suite — only the real-browser pass, in a
    fresh test added for this fix, can actually prove a WebGL error is gone).
  - **`ctx.uniformArray(name, values, components)`**: one call for a whole GLSL array uniform (`uniform vec4
    uRect[8]`), instead of one `uniform()` per slot — `components` is the GLSL type's arity (1–4), `values` is
    every slot's components flattened in order (`Float32Array` or a plain array). Same type detection as
    `uniform()` (an `int[]`/`bool[]` array is sent through `uniformNiv`), and the same per-program location
    cache. Not value-diffed like `uniform()`: array data is expected to change every draw, so comparing it would
    typically cost more than just resending it.
  - **Bug fix: `ctx.draw(rects)` could not actually draw past a surface's own view**, even though a rect was
    always documented as "view-space CSS px" with no stated bound. The implementation drew one full-screen quad
    per rect, confined by a `gl.scissor` within one `gl.viewport` fixed to the surface's own view for the whole
    draw call — a scissor can only shrink what a quad already covers, never grow it past that viewport, so any
    rect reaching beyond the view (bleed/refraction reach past a material's own box, e.g. Pro's
    `clusters(slots, merge + REFRACT_REACH)` padding a slot's box for its soft rim) silently lost that overflow.
    Worse, the near edge was clamped to 0 instead of allowed to go negative, which *shifted* the rect rather than
    shrinking it: the near-edge overflow was lost while an equal amount was wasted past the far edge instead.
    Reported by the Pro port as `slg_backdrop()` reading transparent black below a consistent screen y on tall
    `GlassPanel`s inside a layer (G7) with `under`/`snapshots` on — those were a red herring; it reproduces for
    any material whose `ctx.draw(rects)` rect extends past `ctx.view`, in a layer or on a surface's own canvas
    alike.
    - A first fix gave each rect its own `gl.viewport` (and matching `slg_origin` uniform) for that one draw.
      This drew the padding correctly but was a **regression** found by the Pro port before it shipped: moving
      `slg_origin` per rect made `slg_point()` return a point relative to *each rect's own corner* instead of
      the surface's own view, for every fragment that rect drew — any material positioning a shape in surface
      coordinates (an SDF slot, exactly how Pro's `glass-pro/liquid@1` places its rounded rects/pills) came out
      shifted or torn apart across rects. A material that only samples the backdrop (this release's own first
      conformance test) cannot catch that: a uniform-colour backdrop looks the same shifted or not.
    - **Fixed properly** by widening `gl.viewport` once for the *whole* draw call, to the union of the view and
      every rect, then scissoring each rect inside that union exactly as before (unclamped, signed x/y) —
      `slg_origin`/`slg_view`/`slg_scale` are never touched by `ctx.draw` itself, so every fragment's
      `slg_point()` stays identical to the unpadded case, in the view and in the bleed alike (`gl_FragCoord` is
      an absolute framebuffer position; widening the viewport only changes which pixels the quad can reach, not
      what any of them compute). How far a rect can actually reach past the view depends on real room already
      there: a layer member's shared buffer typically has plenty; an own-canvas surface's canvas is sized to
      exactly its own (`bleed`-inclusive) view, so `ctx.draw(rects)` cannot reach further than that — `bleed` is
      the way to get more room there, not a `rects` entry.
    - Conformance: `src/__tests__/engineMaterials.test.ts` asserts `gl.viewport` widens exactly once for the
      whole call (not per rect) to the correct union, that `gl.scissor` still gets each rect's own unclamped
      coordinates, and that `slg_origin` is never written again while `ctx.draw` runs. `experiments/engine` adds
      two real-browser scenarios run by `npm run test:webgl`: a backdrop-sampling material (reproduces the
      original report) and, because that alone missed the regression, a fixed rounded-rect SDF material whose
      straight edges sit exactly on its own view's edges — its pixels inside the view must be bit-identical with
      and without the extra past-view rect, and the same shape must continue correctly into the bleed.
  - `capabilities()` reports `webgl`, `maxFragmentUniformVectors`, `maxTextureSize`, `bitmapTransfer` and a
    conservative `tier: 'full' | 'lite'` heuristic (low core count/memory or a small uniform budget) — enough for a
    material to size its own uniform arrays, not the full adaptive-quality proposal.
  - `onFrame(callback, 'measure' | 'before' | 'after')` hooks the shared frame loop; `invalidate(surfaces?)` marks
    one, several or every surface dirty (for example, a colour-scheme change); `stats()` reports
    `{ contexts, layers, surfaces, visible, drawn, missed, uploads, uploadBytes, frameMs }` for the current engine.
  - **Context loss and restore**: every cached program is dropped, each material's `reset?.(gl)` runs, resource
    instances are cleared (recreated lazily on next use), every layer's live "under" texture is dropped (also
    recreated lazily) and every surface's backdrop is rebound; surfaces and layers resume once the context
    restores.
  - **Known limits (by design, not oversights).** This release implements G1 (custom materials) with the two
    items its design bundles with it (G2 bleed/scissored draws, G3 the liveness/draw-result protocol), G10
    (per-context resources), G7 (document-order layers), G8 (`under`/`snapshots`, opt-in) and G12
    (backdrop-source providers). It does **not** implement G9 (a frost input) or G11 (pointer input): there is no
    `slg_frost`/`slg_pointer` and no pointer field anywhere in this API.
  - `slg_origin`'s meaning changed from the first release of this entry: it is **device px**, the same value
    passed to `gl.viewport` for the current draw (matching `hudShader.ts`'s `uOrigin`/`ox,oy`), not a CSS-px
    bleed offset. It was always `(0, 0)` before this change (bleed never needed a nonzero origin for an
    own-canvas surface), so nothing that shipped depended on the old reading — a layer member's own
    `gl.viewport` offset inside the shared buffer is the first real use of it.
  - An MIT example material, `tests/engine/tint-material.ts`, and conformance tests cover: its own canvas, a
    canvas/video/HTML/scene backdrop, context loss and restore, resize-in-frame, `'pending'`, the `material-error`
    fallback, scissored draws, bleed, `active()`'s idle cost, resources, document-order layers (including
    document-order stacking against real interleaved content), `under`/`snapshots`, a custom `BackdropSource`,
    and `uniform()`'s int/sampler type detection plus `uniformArray()` (`src/__tests__/engineMaterials.test.ts`
    and `engineLayers.test.ts`, a mocked WebGL context; `experiments/engine`, real Chromium and WebKit, run by
    `npm run test:webgl` — the `gl.getError()` check there is the one that actually proves the int-uniform bug
    is gone, since the mocked GL context never validated uniform types to begin with).
  - **Size.** The entry itself is a ~90 B re-export shim. The chunk every consumer actually loads (the engine,
    materials, resources, surfaces, layers and canvas/video/scene/custom-source backdrops) measures
    **≈ 13.55 KB Brotli** (`dist/engine-index.esm.js`, `npm run size`; up from ≈ 12.5 KB before this round's
    fixes, ≈ 11.2 KB before G7/G8/G12). The core budget is **13.6 KB** (previously 13.5 KB), accommodating the
    correct widen-once, scissor-per-rect implementation of `ctx.draw(rects)` with a small margin. A
    surface that uses a plain-HTML backdrop additionally loads the existing HTML-capture pipeline as a separate
    chunk on demand (`dist/engine-source.esm.js`, **≈ 18.3 KB Brotli**, unchanged by this work) — a surface that
    only ever uses a canvas/video/scene/custom-source backdrop, or none, never pays for it.
  - The engine never imports, detects or special-cases any other package. Materials, resources and backdrop
    sources are all plain strings and functions handed in by the caller at runtime.

- **A crowd of blurred panes shares one blur.** A playing video or canvas backdrop was already uploaded once per
  frame and sampled in place (see below); panes that also blur it each still ran their own full blit+Gaussian
  pipeline on their own small crop, so the cost still multiplied by the number of panes. Once at least 8 panes
  share the same backdrop and blur amount in a frame, the whole backdrop is blurred once and every pane samples a
  region of that result instead (the unblurred `direct` path already did this; blurred panes now can too). Below 8
  panes the per-pane pipeline is cheaper (it blurs a buffer sized to one pane, not the whole backdrop) and is kept
  unchanged — the two pipelines produce the same blur radius (both express the Gaussian spread as a fraction of the
  buffer they blur, and a pane's region is the same fraction of that buffer either way) but not bit-identical output
  (0 mean/255 diff below the crossover, since it is the same code path; 3.4 mean/255 at 48 panes, from the different
  buffer resolution — both still show the glass bending the backdrop). Output with `blur={0}` (webgl's default) is
  unaffected; this only changes frames that set a nonzero `blur`.

  Samsung Galaxy A54, Chrome 156, Android 16, Mali GPU, DPR 2.625, real device over adb, finger held on screen
  (Adaptive refresh idles at 60 Hz without touch), `blur={12}`, panes over one moving `<canvas>` backdrop, interleaved
  runs:

  | Panes | Before (per-pane blur) | After |
  |---|---|---|
  | 5 | 44–51 fps | 39–50 fps (same code path, unchanged) |
  | 48 | 8.7–9.2 fps | 42–43 fps |

  This does not change the `blur={0}` numbers already in this changelog's canvas-backdrop entry (5/48 panes,
  default blur): that path samples the shared texture in place already and never reaches the new code.
- **Canvas backdrops are sampled in place.** A `<canvas>` backdrop is uploaded once per WebGL context per frame (once per version for the canvases `LiquidGlassScene` paints), and every pane over it samples its own region of that texture, as video already did. Before, each pane copied its crop through a 2D canvas and uploaded it, so 48 panes over one live canvas cost 48 copies and 48 uploads per frame; now it is one upload per frame for the shared scene, or one for the shared offscreen context. `optics="liquidgl"` panes share the upload too (each used to upload its own copy every frame). No API change. Panes keep the crop when the canvas exceeds the context's `MAX_TEXTURE_SIZE`, uses `object-fit: none` or `scale-down`, is scaled non-uniformly, or when the pane extends past the canvas. Output matches the crop within 0.41/255 mean on Chromium, WebKit and Firefox, with and without blur (`experiments/canvas-backdrop/test.mjs`, run by `npm run test:webgl`).

  Panes over one animated 2560×1600 canvas (`experiments/canvas-backdrop`, shared scene, Apple M5, headless Playwright: Chromium 153, WebKit 26.6, Firefox 155; 1280×800 at 2×; median of 5 interleaved runs; frame rate · p95 frame interval · uploads per frame):

  | Browser | Panes | Before | After |
  |---|---|---|---|
  | Chromium | 5 | 60 fps · 16.8 ms · 5 | 60 fps · 16.8 ms · 1 |
  | Chromium | 48 | 60 fps · 16.8 ms · 48 | 60 fps · 16.7 ms · 1 |
  | WebKit | 5 | 54.9 fps · 22 ms · 5 | 58.3 fps · 20 ms · 1 |
  | WebKit | 48 | 25.1 fps · 55 ms · 48 | **50.0 fps · 23 ms · 1** |
  | Firefox | 5 | 49.6 fps · 25.7 ms · 5 | 67.6 fps · 17.6 ms · 1 |
  | Firefox | 48 | 46.9 fps · 25.1 ms · 48 | **76.4 fps · 16.8 ms · 1** |

  Headless Firefox is not capped at 60 Hz. Chromium's main-thread time per frame is unchanged (0.95 → 0.97 ms with 48 panes, 11 runs). Bytes uploaded per frame are those of the whole canvas (16.4 MB here) instead of the panes' crops (13.3 MB for 5 large panes, 18.6 MB for 48), so a few panes over a very large canvas can upload more than before; WebKit spends most of its frame in that one upload.
- **`maxScale`** (new, optional): `<LiquidGlass maxScale={1.5}>`, `WebGLSurfaceOptions.maxScale` and the `max-scale` attribute of `<liquid-glass>` cap the WebGL drawing scale in device pixels per CSS pixel. A shared scene composites at the largest cap among its panels (uncapped if any panel is). Defaults are unchanged: without it WebGL draws at the device pixel ratio, at most 3 (2 for liquidGL optics). SVG and CSS rendering ignore it.
- **Page-level stats** (new): `getGlassEngineStats()` from `simple-liquid-glass/webgl` returns the WebGL contexts in use, every glass surface on the page with its strategy (`webgl-scene`, `webgl-single`, `svg`, `css-fallback`, `pending`, `paused`, `off`) and reason, how many are refracting, and for the last engine frame the visible, drawn and missed surfaces, texture uploads and bytes and the frame's main-thread time, plus cumulative totals. Counting starts with the first call; nothing is counted before it. With `window.__benchExpose` set before the entry loads, it is also exposed as `window.__slgEngine.stats()`. New types: `GlassEngineStats`, `GlassEngineFrameStats`, `GlassSurfaceStats`, `GlassSurfaceStrategy`.
- **Bundle size grows** by about 0.4 KB Brotli (frame counters and surface registration in every entry, `maxScale`, the canvas path), then another ~0.3 KB for the shared-blur pipeline above and its context-loss cleanup: measured core 52.51 KB against a 52.2 KB budget (5.6: 51.8), interactive 54.56 KB / 54.3 KB (53.9), mirror 52.51 KB / 52.3 KB (51.9), web component 37.59 KB / 37.3 KB (36.9), experimental unchanged at 31.18 KB / 31.3 KB. The release budgets are core **52.6 KB**, interactive **54.7 KB**, mirror **52.6 KB**, and web component **37.7 KB**; experimental stays at **31.3 KB**. These budgets account for the measured growth with a small margin. The stats reader itself ships only in `simple-liquid-glass/webgl`.

### Shared scenes and liquid text integration

- Includes the six commits from `feat/5.7.0-glyph-scene`: shared-scene glyph masks and grouping roots,
  cached-backdrop animation, shared video frames, and scaled-ancestor support. The `/webgl` API exposes
  `joinGlassCrowd` so non-React integrations can use the same crowd switch.
- The repository also includes the companion liquid-text typing reveal and soft-edge changes. Those sources
  live in `packages/simple-liquid-glass-font`; publishing `simple-liquid-glass@5.7.0` does **not** publish a new
  version of the separate `simple-liquid-text` package.

## 5.6.0 — one canvas for a crowd of glass

- **Shared WebGL scene.** Sibling WebGL panes over the same backdrop render into per-pane framebuffers of one context and are composited into a single `canvas[data-liquid-glass-scene]` placed before the first pane, instead of one presentation canvas each. Panes carry `data-glass-composition="scene"`. A pane that is not eligible (static position, opacity, filters/blend/clip/mask, a non-translation transform, its own background, negative z-index, or inside its backdrop) keeps its own canvas. New prop `webglScene` (`'auto'` default, `'off'` restores one canvas per pane).
- **Crowds on Chrome.** On desktop Chromium, `renderer="auto"` moves 16 or more scene-eligible sibling panes over one backdrop to the shared scene and switches back to SVG below 12. Every SVG pane is its own GPU render pass, so Chrome's CPU grew with each one (829 ms/s for 24 scrolling panes against 347 in the scene). Backdrops containing video or iframes stay on SVG. Mobile and explicit `renderer` / `effectMode` values are unchanged.
- **Cached backdrops stay on the GPU.** Fractional pane sizes were read as a scale change, which re-cropped and re-uploaded the backdrop every frame; exact layout sizes keep the cached texture. Panes without blur sample it in place through a region uniform instead of copying a crop.
- Shader programs are shared per context and reference-counted, unchanged uniforms are not resent, and element rects and scroll offsets are read once per frame.
- Chrome 156, M5 Retina, 60 Hz, each library with its default look, scrolling panes (frame rate · Chrome process-tree CPU ms/s, median of 2):

  | Panes | **5.6** `renderer="auto"` | 5.5.1 SVG | 5.5.1 WebGL | liquidGL WebGL | liquidGL WebGPU |
  |---|---|---|---|---|---|
  | 24 | **60 fps · 369** | 60 fps · 841 | 36 fps · 648 | 60 fps · 567 | 60 fps · 393 |
  | 48 | **60 fps · 404** | 60 fps · 1495 | 21 fps · 1230 | 39 fps · 713 | 60 fps · 462 |
  | 64 | **60 fps · 444** | 60 fps · 1935 | 17 fps · 1369 | 30 fps · 578 | 60 fps · 484 |
  | 88 | **60 fps · 531** | 41 fps · 1803 | 12 fps · 1358 | 22 fps · 504 | 60 fps · 547 |
  | 104 | **60 fps · 531** | 35 fps · 1858 | 12 fps · 1400 | 18 fps · 428 | 60 fps · 587 |

- Known limits: grouped panes are drawn below every element between them in their parent, so content interleaved between sibling panes appears above all of their glass; use `webglScene="off"` for such layouts. Antialiasing of the outermost edge pixels differs slightly from a per-pane canvas. With changing HTML backdrops the scene uses more main-thread time than liquidGL WebGPU.
- **Bundle size grows**: Brotli budgets are core 50.5 KB (5.5: 47.3), interactive 52.6 KB (49.3), mirror 50.5 KB (47.3), web component 36.5 KB (35.7).

## 5.5.1 — moving glass

- **SVG displacement maps sized to the pane.** Chromium resends a backdrop filter's images to the GPU process with every frame in which the glass or its backdrop moves, so decoded map bytes were a per-frame cost. Native SVG maps were a fixed 512 px body (604×650 for a 180×120 pane); they now use 0.75 map pixels per CSS pixel of the longer side (64–512). `optics="liquidgl"` SVG maps drop from device resolution to 0.75 per CSS pixel. WebGL keeps 512 (uploaded once) and renders unchanged.
- **Frosted `optics="liquidgl"` SVG** uses one map and a `feGaussianBlur` matched to liquidGL's 16-sample jitter disk instead of 16 maps. Blur extent is unchanged; the grain of the jittered samples is gone.
- SVG `optics="liquidgl"`: a panel moving near the edge of its backdrop no longer rebuilds its map every frame. The refraction field is cached per panel shape, edge positions round to whole pixels, and position-only rebuilds run at most every 160 ms per encoded map, then settle on the exact map.
- WebGL presents through bitmap transfer for both optics, handing each frame to a `bitmaprenderer` canvas instead of copying the shared canvas into a 2D canvas (pixel output unchanged). Quad draws cache their attribute location.
- `optics="liquidgl"` SVG fills out-of-backdrop samples with one composite instead of an alpha mask and three composites (pixel-identical); GPU process CPU for 24 moving panels drops from about 1000 to 570 ms/s.
- Chrome 156, M5 Retina, six panels unless noted (median of 4, frame rate and renderer main-thread ms/s):

  | Scene | SVG 5.5.0 | SVG 5.5.1 | SVG liquidgl 5.5.0 | SVG liquidgl 5.5.1 | liquidGL WebGL |
  |---|---|---|---|---|---|
  | Moving panels | 60 fps · 20 | 60 fps · 19 | 26 fps · 797 | 60 fps · 33 | 60 fps · 26 |
  | 24 moving panels | 16 fps · 11 | **60 fps** · 33 | 9 fps · 677 | 44 fps · 61 | 60 fps · 82 |
  | Moving frosted panels | 60 fps · 23 | 60 fps · 20 | 1.5 fps · 802 | **60 fps** · 33 | 60 fps · 24 |
  | Scroll | 60 fps · 13 | 60 fps · 11 | 60 fps · 16 | 60 fps · 14 | 60 fps · 21 |

  CPU of the whole Chrome process tree for moving native SVG panels drops from 1212 to 463 ms/s and for scroll from 1093 to 350 ms/s. It remains higher than liquidGL with moving panels (463 vs 373 ms/s; 1013 vs 708 with 24 panels) because every SVG panel is its own GPU render pass. The WebGL renderer still draws 24 moving panels at about 31 fps.
- Pixel changes against 5.5.0 on still scenes: native SVG 0.1–0.3/255 mean (rim pixels), liquidgl SVG 0.2–1.1/255, frosted liquidgl SVG 1.2–3.4/255 (grain). WebGL is identical.

## 5.5.0 — analytical optics, shared rendering, experimental scene

- New `optics="liquidgl"` (SVG and WebGL) and WebGL-only `webglOptics="liquidgl"` select an analytical rounded-box refraction model adapted from naughtyduk/liquidGL (MIT, see `THIRD_PARTY_NOTICES.md`), configured with `liquidGLOptions`. Native optics remain the default.
- Visible WebGL panels share one offscreen context and identical source/map uploads instead of one context per panel; frames are presented on each panel's 2D canvas.
- HTML capture shares identical computed declarations inside a snapshot, patches changed opaque sections and uploads them as GPU sub-rectangles. Unsupported trees, relational selectors, masks, filters, overflow and uncertain styles keep the full capture.
- A changing plain-text leaf (any sibling position, optionally with a single RGB(A) `text-shadow`) can be redrawn with canvas text between cached static layers. This is enabled only after exact pixel calibration against the SVG rasterizer (four backgrounds plus ASCII probes); otherwise the SVG path remains. In WebKit and Firefox the calibration currently rejects it.
- New unstable entry `simple-liquid-glass/experimental` with `createExperimentalScene`: one shared canvas and instanced atlas for a fixed set of flat panels. For long changing HTML it may raise the capture scale by at most 1% to align section updates with device pixels; failed CPU/GPU allocations recover by recapturing at the original scale.
- `<liquid-glass>`: `lens-profile` and `strength` select the same native lens on Chromium and WebGL.
- **Bundle size grows**: Brotli budgets are core 47.3 KB (5.4.0: 30 KB), interactive 49.3 KB (33), mirror 47.3 KB (31), web component 35.7 KB (23); `experimental` 31 KB. The largest additions are the forked HTML capture pipeline (shared declarations, section patches, raster cache, native text: ~30 KB minified before compression) and the analytical liquidGL optics (~16 KB minified).
- Known limits: aligned captures change raster resampling/antialiasing compared with 5.4 (optical mapping unchanged); calibration adds a one-time main-thread cost (about 0.35 s for a 1200×4000 Retina source in Chrome); not every workload is faster than 5.4.

## 5.4.0 — WebGL on every non-Chromium engine

- Desktop Safari and Firefox now refract through WebGL, like iOS, instead of the DOM mirror. Engine detection lives in one place (`supportsSvgBackdrop`) for the component and the custom element. New diagnostics reason: `svg-unsupported`. `supportsSvgBackdrop` is exported from `simple-liquid-glass/webgl`.
- Removed the DOM mirror renderer. `mirror`, `mirrorScale`, `track` and `simple-liquid-glass/mirror` remain as deprecated no-ops / aliases.
- New `reveal` prop (default `'ready'`): glass mounted on the client after hydration stays transparent until its renderer is ready (max 400ms) instead of flashing the CSS placeholder. Server-rendered glass is never hidden. `reveal="immediate"` restores the old behaviour. `<liquid-glass>` gets the same gate (`reveal` attribute); elements already in the page when it is defined never wait.

## 5.3.0 — shared page scenes

## 5.3.1 — 2026-09-13

- Move package metadata, documentation and examples to the official `glass.lucaperullo.it` domain. Companion projects use `text.lucaperullo.it` and `launcher.lucaperullo.it`.
- This release updates links and documentation; the 5.3.0 rendering API and engine are unchanged.

- Added the optional `simple-liquid-glass/backdrop` entry with `LiquidGlassScene`, automatic WebGL binding, a shared React backdrop hook, and a framework-independent capture controller.
- Scene captures share HTML/media snapshots across surfaces, preserve excluded surfaces’ layout, track direct video/canvas sources, and release resources after the last consumer. Explicit backdrops retain precedence.
- `simple-liquid-text` 0.3.0 integrates with the same scene provider.

- Reuse WebGL staging buffers and upload already cropped frames directly, avoiding per-frame canvas resets and an intermediate copy for each surface.
- Render video-backed surfaces on newly presented video frames while keeping geometry and optics updates responsive at display refresh rate.

## 5.2.1

- Wait for initial viewport visibility before allocating React WebGL surfaces, preventing offscreen panels from exhausting browser context limits on first render.

## 5.2.0 — integrated WebGL refraction

- iOS/iPadOS automatically uses optimized WebGL when a sibling backdrop is supplied.
- Added `renderer="webgl"` for Android/desktop opt-in, shared capture, live video/canvas,
  automatic HTML refresh, `backdropVersion`, and `refreshBackdrop()`.
- Preserved native overscroll alignment, direct GPU output, half-resolution blur, and last-frame
  retention during capture. Added context recovery and explicit fallback diagnostics.
- Added the same runtime to the custom element through `backdrop-selector` and `renderer`.
- Added the framework-independent `simple-liquid-glass/webgl` surface API for masked renderers, including liquid text.
- Bundled HTML capture adds roughly 14 KB Brotli to the React build; size budgets reflect it.

## 5.1.2 — 2026-09-09

- Keep native pointer elasticity anchored to the resting element bounds, including scaled layouts, instead of feeding the animated position back into the target.
- Measure lens maps in layout CSS pixels so scaled entrance animations cannot leave refraction geometry undersized.

## 5.1.1 — 2026-09-09

- Fix #12: apply the web component’s glass shadow on Chromium as well as Safari/Firefox, including after resize and attribute updates.

- Integrate the 4.1 main history with the 5.1 renderer and generated types. Preserve interactive liquid triggers, pointer following, and click ripples.
- Use React 16.8-compatible IDs for the interactive pointer filter.
- Retain the improved low-tier classic map resolution.
- Set the interactive bundle budget to 17 KB to include the preserved pointer/ripple features (16.41 KB measured Brotli); other budgets are unchanged.

## 5.1.0

- Add typed `lensOptions` overrides for strength, depth, curvature, edge bend, sheen, specular, glow, and brightness.
- Export lens profiles, ranges, and a resolver for settings panels.
- Preserve profile defaults and explicit pixel-displacement precedence; cache maps by effective geometry.
- Clamp finite overrides and ignore invalid numeric values.

# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## 5.0.0 — 2026-09-08

- Bundle budgets updated to 15/16/15/6 KB (core/interactive/mirror/web component) to retain the 4.1 optics alongside the new lens.

### Breaking default appearance

- React glass defaults to the rounded player profile with 80px base displacement.
- Add material/loupe/player/track profiles and the CSS-pixel displacementScale override.
- Retain 4.1 directional, lens-shape, and animated refraction props; explicit legacy optical controls select their compatible renderer.
- Preserve 4.1 web-component features. Add MIT notices for the adapted native lens generator and filter.
- Remove experimental GPU/video renderers and demos from the release.


### Safari lens optics

- Safari/iOS now bypasses the broken native SVG mirror with masked CSS rim magnification. This approximation preserves clear centers; high-contrast edges may blend. Firefox retains SVG displacement.
- Preserve backdrop root computed styling before namespacing cloned IDs.

- Replaced noise-based mirror distortion and whole-copy blur with a bounded-resolution, cached rounded-rectangle displacement field. The center remains clear, the rim bends inward, and strength is capped by geometry.
- Fixed doubled translation on mirrored backgrounds and tracking-frame cleanup. Added scrolling and six-panel animation regressions.
- Added an isolated Safari device test page. Increased core/interactive Brotli budgets to 9/10 kB to account for the new optics; mirror/web-component budgets remain unchanged.

### Fixed

- React 16.8/17 no longer calls the unavailable `useId` hook. Legacy IDs are assigned after mount and shared across bundled entry points.
- Server rendering and hydration now use stable text selectors and defer browser-specific markup until mount.
- Web-component imports are safe without a DOM; custom tag registration works; border colors are assigned through CSS rather than interpolated HTML.
- `effectMode="off"` removes backdrop filters; `blur` disables the mirror. Missing ResizeObserver falls back to window resize events.
- Mirror clones isolate IDs and interaction, preserve local SVG references, coalesce mutations, observe size changes, and clean up scheduled work. Invalid or nested backdrop sources fall back safely.
- Interactive glass preserves the initial caller transform and responds to reduced-motion changes.

### Changed

- Extracted background processing, geometry, text color, quality selection, and SVG rendering into focused modules.
- Public declarations are generated from source; React bundles include a client-component directive.
- Added component, browser, published-type, and React-version compatibility checks to CI. Dependency installs use a committed lockfile.
- Corrected documentation and bundle measurement labels; budgets remain unchanged. Updated compatible development dependencies to clear reported advisories.

## 4.1.0 — 2026-06-20

### Fixed

- **`classic` refraction is now fold-free at the corners.** At higher `scale`, the classic
  displacement field used to shear/tear the backdrop along the rounded-rect corner arc — the field
  was maximal at the boundary and cliffed to the opposite extreme just outside it, softened only by a
  fixed, `scale`-blind blur. The field now fades to a **neutral** plate across a boundary-hugging band
  whose width grows with the effective displacement, so the per-pixel slope stays bounded → injective
  → no tear, at any `scale`. Verified by a Jacobian-injectivity sweep (the math model) and a browser
  pixel-Jacobian on the real emitted maps (legacy folds `−9e-4…−3.3e-3`; the new field is injective to
  the 8-bit map's quantization floor).

### Changed

- At extreme `scale × aspect` (e.g. a thin bar at very high `scale`), classic refraction **amplitude
  attenuates gracefully** instead of folding — the honest tradeoff of fold-free-by-design (an element
  can't carry full-amplitude refraction past a certain scale without tearing). Square-ish elements at
  default scale keep full strength. `shapeAdapt:false` (the legacy escape hatch) is unchanged.

## 4.0.0 — 2026-06-19

### Removed (breaking)

- **The live-DOM-mirror engine is gone.** Removed the `simple-liquid-glass/mirror` entry point and
  its `LiquidGlassMirror` export, the shared `core/mirrorEngine`, and the core/web-component mirror
  props/attributes: `backdropRef`, `backdropSelector`, `mirror`, `mirrorScale`, `track` (React) and
  `backdrop-selector`, `backdrop`, `mirror`, `mirror-scale`, `track` (`<liquid-glass>`). The
  displaced-clone path was never reliable on real iOS — cloning live page content can't track moving
  backdrops, and the ancestor/memory edge cases degraded to blur anyway — so it's removed rather than
  shipped half-working.

### Changed

- **BREAKING:** refraction is now **Chromium-only** with a deliberate **frosted-glass fallback** on
  Safari / iOS / Firefox. Real refraction is an SVG displacement map inside CSS `backdrop-filter`,
  which only WebKit-incompatible Chromium (Chrome / Edge / Android Chrome) can run; WebKit and Gecko
  can't run SVG filters in `backdrop-filter`, and no web API exposes a live page backdrop to refract.
  On those engines `<LiquidGlass>` and `<liquid-glass>` render polished frosted glass (blur +
  saturation + subtle tint + gradient border) — real glass, just not refraction.

  | Engine | Refraction |
  | --- | --- |
  | Chrome / Edge / Android Chrome (Chromium) | ✅ real SVG refraction |
  | Safari / iOS / Firefox | frosted glass (no refraction) |

  Everything else is unchanged: lens modes (`classic` / `convex` / `shift` / `rim`), `angle`,
  `shapeAdapt`, animated `liquid` (`ripple` / `flow` / `wobble`), the `/interactive` export
  (`followPointer`, `clickRipple`, `elasticity`), the `<liquid-glass>` web component, quality presets,
  and all visual props.

## 3.2.0 — 2026-06-18

### Added

- **Real refraction in the `<liquid-glass>` web component on iOS / Safari / Firefox.** Ported the
  live-DOM-mirror engine (clone + align + scroll/resize/track) from the React core into the custom
  element's shadow DOM, so the non-Chromium engines refract a displaced clone of the backdrop instead
  of only blurring. New attributes/property:
  - `backdrop-selector` — CSS selector for the element behind the lens (resolved against `document`).
  - `backdrop` — a JS **property** (`el.backdrop = node`), the ref-style equivalent of React's
    `backdropRef`; takes precedence over the selector.
  - `mirror` — `"false"` forces the blur fallback even with a backdrop set (default on).
  - `mirror-scale` — mirror displacement strength (default `26`).
  - `track` — boolean attribute; re-align the clone every frame for a moving/dragged lens.

  The same safety rule as the React engine is enforced: the backdrop **must not be an ancestor** of
  the lens (cloning a page-sized ancestor crashed iOS Safari) — a missing or ancestor backdrop
  hard-degrades to the frosted-blur fallback with a one-time console warning. Chromium is unchanged
  (it keeps the backdrop-filter SVG path).

### Changed

- The web-component bundle is now ~6.5 KB (was ~5 KB) — the live-mirror engine added ~1.2 KB; its
  size budget moved from 6 KB → 6.5 KB.

## 3.1.0 — 2026-06-18

### Added

- **Click ripples on `LiquidGlassInteractive` (`clickRipple`, `rippleIntensity`).** Each click sends a
  real water-like ripple from the click point — `clickRipple="ripple"` (a single wave) or `"drop"`
  (a splash + concentric waves). Compositor-driven and spawned imperatively, so it stays lag-free even
  under rapid clicking; pauses on `prefers-reduced-motion`.
- **LLM / agent onboarding.** A paste-anywhere [`llms.txt`](llms.txt) (full API + recipes + gotchas)
  and a Claude Code skill (`skills/simple-liquid-glass/SKILL.md`), both shipped in the package.

### Changed

- **`specular` now defaults to `false`** on `LiquidGlassInteractive` (was `true` in 3.0.0) — the
  pointer-tracked highlight is opt-in. Pass `specular` if you relied on the old default.
- The default **`low`** quality tier now uses a **full-resolution** displacement map at the same
  single-pass render cost — cleaner refraction by default, with no per-frame cost change.

### Fixed

- **Interactive overlays are clipped to the glass radius** — the specular highlight, follow-pointer
  bump, and click ripples no longer overflow the rounded corners as squares.
- **Smoother follow-pointer bump** — gentler, blurred turbulence + a feathered edge remove the hard
  fringe around the cursor.
- **Click ripple reads like water** — a subtle `soft-light` caustic instead of a visible white ring.
- **No more frizzy/folded edge on the base refraction** — a baked rim-blur keeps the displacement
  gradient gentle at the rounded perimeter (zero per-frame cost).

## 3.0.0 — 2026-06-17

### Added

- **Shape-adaptive refraction (`shapeAdapt`, default on).** The displacement map is now built in
  aspect-true pixel space, so the lens reads like glass *cut to the element's shape* — a long
  navbar or tall sidebar refracts evenly instead of over-bending on its short axis. Free: it lives
  entirely in the baked map; the GPU filter graph is unchanged.
- **Directional refraction (`angle`, degrees).** Point the refraction lean any direction. It's
  shape-adapted, so `45°` reads as a true 45° on any aspect ratio (not a flattened lean). `0` =
  baseline; positive = clockwise. Chromium SVG path.
- **Lens field modes (`lens`) + manual tuning (`lensStrength`, `lensCenter`).** Choose how the glass
  bends light: `classic` (linear radial), `convex` (one coherent dome magnifier — no top/bottom
  split), `shift` (uniform directional offset; straight lines stay straight), or `rim` (clear flat
  center, refraction only at a soft perimeter band). Each is a distinct displacement field with
  fold-safe defaults at the standard `scale`.
- **Real animated refraction (`liquid: 'ripple' | 'flow' | 'wobble'`).** The backdrop genuinely
  warps via a live `feTurbulence` → `feDisplacementMap` stage — not a compositor overlay. Tunable
  with `liquidSpeed` / `liquidScale`. Opt-in and GPU-gated: animates only while on-screen, pauses on
  `prefers-reduced-motion`, Chromium-only, amplitude-capped on mobile/low quality.
- **Pointer interaction on `LiquidGlassInteractive`:** `liquidTrigger` (`'always' | 'hover' |
  'press'` — `hover`/`press` stay idle, zero cost, until you interact) and `followPointer` (a
  refractive bump that distorts the backdrop toward the cursor).
- New shared core modules `core/liquid` (preset → turbulence params, pure/tested) and
  `normalizeAngle` in `core/displacementMap`.

### Changed

- **BREAKING (visual):** `shapeAdapt` defaults to `true`, which changes how **non-square** lenses
  refract at `angle: 0` (square lenses are visually unchanged). Set `shapeAdapt={false}` to restore
  the byte-for-byte legacy ≤2.x map.

## 2.4.0 — 2026-06-15

### Added

- **Real refraction on Safari / iOS / Firefox — now built into the core `<LiquidGlass>`.** The
  live-DOM-mirror that shipped in 2.3.0 as the opt-in `/mirror` export now lives in the core
  component: on the fallback engines, give `<LiquidGlass>` the element behind the lens
  (`backdropRef`/`backdropSelector`) and it refracts a live, displaced **clone** of it (true
  distortion) instead of just blurring — no separate import. New core props: `mirror` (default
  true), `backdropRef`, `backdropSelector`, `mirrorScale` (default 26), `track` (re-align for a
  moving/dragged lens). Off-screen-paused; the filter is applied to a lens-sized element and the
  re-align is throttled to ~30fps to keep iOS smooth. Engine extracted to a shared
  `core/mirrorEngine`. (Core grows 6.6 → ~7.5 KB gzip to include this.)

### Changed

- **`simple-liquid-glass/mirror` is now a thin back-compat wrapper.** `LiquidGlassMirror` just
  forwards to `<LiquidGlass>` (with `force` flipping it onto the fallback path for testing/demo).
  Existing `import { LiquidGlassMirror } from 'simple-liquid-glass/mirror'` keeps working; prefer
  importing `<LiquidGlass>` directly.

### Fixed

- **The backdrop is required, never auto-detected.** A zero-config auto-detect attempt (walk up to
  the nearest background-ish ancestor) **crashed iOS Safari** — the detected ancestor contains the
  lens, so it cloned a page-sized subtree every mutation (memory exhaustion) and re-triggered its
  own `MutationObserver` into a clone loop. The engine now hard-degrades to blur when the source is
  missing or is an ancestor of the lens. Point `backdropRef` at a **sibling/background** element.

## 2.3.0 — 2026-06-14

### Added

- **`simple-liquid-glass/interactive`** — opt-in subpath export with pointer-reactive
  elasticity (a tiny zero-dep rAF spring leans the glass toward the cursor) and a
  pointer-tracked specular highlight. Exposes `<LiquidGlassInteractive>` and the
  `usePointerElastic(ref, options)` hook. Honors `prefers-reduced-motion`. The core
  `import { LiquidGlass } from 'simple-liquid-glass'` is unchanged (still ~6.5 KB); the
  interactive bundle is self-contained (~7.5 KB gzip, under its 9 KB budget).
- **`simple-liquid-glass/web-component`** — a framework-agnostic `<liquid-glass>` custom
  element for vanilla JS / Vue / Svelte / Angular / Astro / plain HTML. Same refraction
  (Chromium) + frosted fallback (Safari/Firefox/iOS) as the React component, sharing the new
  canonical `core/displacementMap` generator. ~2.7 KB gzip, zero React.
- **`core/displacementMap`** — the displacement-map generator extracted into a pure,
  framework-agnostic, unit-tested module now shared by the React component and the web
  component (single source of truth).
- **`simple-liquid-glass/mirror`** — REAL refraction on Safari / iOS / Firefox, not just blur.
  Those engines can't run SVG filters in `backdrop-filter`, but they can in a regular element
  `filter`, so `<LiquidGlassMirror backdropRef={…}>` renders a live, displaced **clone** of the
  content behind the lens (true distortion). Opt-in subpath (~7.7 KB gzip; core unchanged),
  gated to the fallback engines, off-screen-paused, and degrades to blur when no backdrop
  source is given. **Validated on a real iPhone** (drag the lens to see the distortion). Supports
  `backdropRef`/`backdropSelector` (the element behind the lens), `mirrorScale`, and `track`
  (continuous re-align for a moving/dragged lens). The filter is applied to a lens-sized element +
  the re-align is throttled to ~30fps to keep iOS smooth. (Folded into the core `<LiquidGlass>` in
  v2.4.0 — see below.)

### Improved

- **Frosted CSS fallback (Safari/Firefox/iOS).** Redesigned to read as real, transparent
  frosted glass instead of a milky plastic rectangle: a blur frost floor on the centre (it was
  unblurred at the default `blur=0`), a top-lit gradient sheen, a bright specular rim, and a soft
  depth shadow — and the white-tint/brightness wash + the clunky masked "edge band" were both
  removed. Gated to the fallback path; the Chromium SVG path is unchanged. (Note: this path can
  only blur — true distortion on those engines needs `simple-liquid-glass/mirror` above.)
- **Multi-instance performance.** Off-screen instances now drop their `backdrop-filter`
  via an `IntersectionObserver` (200px margin, no pop-in), so a page with many glass cards
  only pays GPU cost for the ones in view (e.g. 60/100 disabled on a typical scroll).
  Defaults to visible for SSR / first paint / no-IntersectionObserver.

## 2.2.0 — 2026-06-14

Performance hardening. No public API changes; behavior-preserving. Core bundle ~6.5 KB gzip.

### Added

- **CI bundle-size budget** via `size-limit` (`npm run size`) and a GitHub Actions workflow. The core entry (`import { LiquidGlass }`) is capped at 7 KB gzip and fails CI if exceeded.
- **`LiquidGlassHandle.getQuality()`** — read the currently resolved rendering quality via `ref` (reflects `autodetectquality`). Additive; the existing `element` member is unchanged.

### Improved (performance)

- **Displacement-map cache is now a bounded LRU (64 entries).** Previously an unbounded module-level `Map` that gained a permanent entry for every distinct size/param combination — a slow memory leak on long-lived SPAs.
- **`autoTextColor` listeners are now passive and coalesced to one update per animation frame.** Previously a synchronous, non-passive, capture-phase `scroll` handler ran a DOM walk + luminance computation on every scroll event — a real source of scroll jank.
- **`autoTextColor` uses a single `MutationObserver`** watching `<body>` + the nearest opaque ancestor, re-pointed when it changes — instead of one observer per ancestor up the whole tree.
- **`will-change` is dynamic.** It defaults to `auto` and is promoted to `backdrop-filter, filter` only transiently while resizing. Previously it was set permanently on every instance, pinning a GPU compositor layer for each glass element on the page.
- **Faster device auto-detection (`autodetectquality`).** Skips the micro-benchmark for clearly low-end devices, runs the benchmark (now ~12 ms, was ~50 ms) inside `requestIdleCallback`, and caches the result to `localStorage` + `sessionStorage`. Previously a blocking ~50 ms main-thread loop cached only to `sessionStorage` — a first-paint stall. The resolved tier is unchanged from the previous logic.

### Internal

- Extracted two pure, unit-tested modules: `displacementCache.ts` (LRU) and `quality.ts` (tier resolution). Added 15 unit tests (20 total).
- `LiquidGlassProps` and `LiquidGlassHandle` are unchanged.

## 2.1.0 — 2026-06-13

### Added

- **React 19 support.** `peerDependencies` widened to `^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0`.

## 2.0.0 — 2026-06-13

### Removed (breaking)

- **WebGL refraction support.** Removed `effectMode="webgl"`, the framework-free `createWebGLGlass` export, the `getSnapshot` prop, the `WebGLGlassOptions` / `WebGLGlassInstance` types, and `LiquidGlassHandle.refresh()`. The auto-loaded html2canvas snapshot dependency is gone.

### Changed

- `effectMode` no longer accepts `'webgl'` — it is now `'auto' | 'svg' | 'blur' | 'off'`. The Chromium SVG-in-`backdrop-filter` path and the layered CSS fallback (masked edge ring + specular highlight) remain. `LiquidGlassHandle` now exposes only `element`.

## 1.4.2 — 2026-06-12

### Fixed

- WebGL: detect **late-applied backgrounds** (e.g. Storybook's backgrounds addon) so the captured
  snapshot isn't stale when the page background changes after first paint.

### Internal

- Migrated Storybook to v10 (react-vite).

## 1.4.1 — 2026-06-12

### Fixed

- WebGL: `background-image` with `cover`/`contain`/`fixed` on the snapshot source (e.g. hero images, Storybook's backgrounds addon) is now composited with correct geometry — html2canvas cannot rasterize these and produced a misaligned image with white bands.
- WebGL: removed ghost background layer under the canvas (glass tint is rendered by the shader).
- WebGL: snapshot auto-refreshes when page content changes (debounced MutationObserver + resize handler, `autoRefresh` option), preventing stale backgrounds.

## 1.4.0 — 2026-06-12

### Added

- **`effectMode="webgl"`** — true liquid-glass refraction on every WebGL-capable browser, including iOS Safari and Firefox (where SVG `backdrop-filter` is unsupported, WebKit bug 245510). Fragment-shader rendering of rounded-rect displacement, chromatic aberration, blur, saturation, frost tint and specular rim over a page snapshot.
- **Shared rendering architecture** — all WebGL panes share one WebGL context and one page snapshot per source; per-pane 2D canvases preserve normal DOM stacking/positioning semantics. Many panes scale without hitting browser context caps.
- **Auto-loading snapshot library** — html2canvas is loaded from cdnjs on first use when missing (opt out via `createWebGLGlass`'s `autoLoadSnapshotLib: false` or by passing `getSnapshot`).
- **Ref API** — `LiquidGlassHandle` exposed via `ref`: `refresh()` re-captures the background snapshot; `element` exposes the root container.
- **`getSnapshot` prop** — custom background snapshot provider for WebGL mode.
- **Layered CSS fallback** — on engines without SVG backdrop-filter support, a masked edge-refraction ring with stronger blur/brightness plus specular highlights replaces the old flat-blur fallback.
- Framework-free export: `createWebGLGlass(options)` for non-React usage.

### Fixed

- SVG filter path is now gated on actual engine support (Chromium) instead of iOS-only checks — Firefox previously rendered a silently broken filter.

### Changed

- `effectMode` accepts `'webgl'`.

## 1.3.0 — 2025-09-03

### Added

- **Rendering quality presets** — `quality: 'low' | 'standard' | 'high' | 'extreme'` controlling the
  internal displacement-map resolution, plus **`autodetectquality`** (device-performance detection).
  Default tier is `'low'`.
- **`mobileFallback`** and **`effectMode`** controls; mobile defaults to a CSS-only fallback.

### Improved

- Multi-instance performance at the `'low'` tier.

## 1.2.9 — 2025-08-25

### Added

- **`background` prop** — accepts a solid color or gradient and automatically converts it to
  semi-transparent. Default tuning updated.

## 1.2.8 — 2025-08-15

### Docs

- README bundle-size badge update.

## 1.2.7 — 2025-08-15

### Added

- **`autoTextColorMode`** and **`perPixelTargetSelector`** for richer automatic text-color adaptation.

## 1.2.6 — 2025-08-10

### Fixed

- Stricter iOS **real-device detection** (excludes emulators / Android) for the iOS blur fallback.

## 1.2.5 — 2025-08-10

### Added

- **iOS blur fallback** controls — `iosMinBlur` and `iosBlurMode` (force a minimal blur on iOS where
  SVG `backdrop-filter` refraction is unsupported).

## 1.2.4 — 2025-08-10

### Changed

- Default values updated to `blur=0`, `displace=5`.

## 1.2.3 — 2025-08-10

### Fixed

- Sync the border radius between the SVG filter and the CSS; clamp `radius`; add
  `-webkit-backdrop-filter` and `overflow: hidden` (iOS fixes).

## 1.2.2 — 2025-08-10

### Fixed

- Correct the blur/displace mapping — the inner frost uses `displace`, the final blur uses `blur`.

## 1.2.1 — 2025-08-10

### Added

- **`saturation`** and **`aberrationIntensity`** props on the SVG path.

### Changed

- Pruned non-SVG dependencies.

## 1.2.0 — 2025-08-10

Earliest release in this tracked history (any 1.0 / 1.1 releases predate it).

### Added

- **Automatic text color** (`autoTextColor`, `forceTextColor`), a semi-transparent **`glassColor`**,
  and Storybook controls.
