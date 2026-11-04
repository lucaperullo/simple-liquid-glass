// Real-browser conformance harness for simple-liquid-glass/engine (G1/G2/G3/G10), driven by
// experiments/engine/test.mjs. No React: the engine entry is framework-agnostic.
import { getGlassEngine } from '../../src/engine';
import { defineTintMaterial } from '../../tests/engine/tint-material';

const backdrop = document.querySelector('#backdrop') as HTMLCanvasElement;
const host = document.querySelector('#host') as HTMLElement;

function paintBackdrop(color: string) {
  const ctx = backdrop.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, backdrop.width, backdrop.height);
}
/** Four distinct quadrants: a UV mapping with a flipped sign would sample the wrong one. */
function paintQuadrants() {
  const ctx = backdrop.getContext('2d')!, w = backdrop.width / 2, h = backdrop.height / 2;
  ctx.fillStyle = '#1d3b8f'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2e8f4f'; ctx.fillRect(w, 0, w, h);
  ctx.fillStyle = '#d0426b'; ctx.fillRect(0, h, w, h);
  ctx.fillStyle = '#f2b134'; ctx.fillRect(w, h, w, h);
}
paintQuadrants();

const engine = getGlassEngine();
document.body.dataset.engineApi = engine ? String(engine.api) : 'unavailable';

if (engine) {
  const { material } = defineTintMaterial(engine);
  const surface = engine.createSurface({
    host, material, params: { color: [1, 0, 0, 1], mix: 0 },
    backdrop, bleed: 0,
    onStatus(status) {
      document.body.dataset.engineStatus = status.state;
      document.body.dataset.engineReason = status.state === 'fallback' ? status.reason : '';
    },
  });

  // A second surface over a plain HTML element: exercises the lazily loaded html-to-image
  // capture chunk (engine-source), only pulled in because this surface asks for it.
  const htmlHost = document.querySelector('#html-host') as HTMLElement;
  const htmlSource = document.querySelector('#html-source') as HTMLElement;
  const htmlSurface = engine.createSurface({
    host: htmlHost, material, params: { color: [1, 1, 1, 1], mix: 1 }, backdrop: htmlSource, bleed: 0,
    onStatus(status) { document.body.dataset.htmlEngineStatus = status.state; },
  });

  // G7: document-order layers. Two members share one canvas; an interleaved, opaque DOM sibling
  // sits exactly over member A, so it must visually cover that member's glass (the layer canvas is
  // z-index -1 within its own stacking context) while member B, unobstructed, stays visible.
  const layerRoot = document.querySelector('#layer-root') as HTMLElement;
  const layer = engine.createLayer(layerRoot, { scale: 1 });
  const layerMemberA = engine.createSurface({ host: document.querySelector('#layer-member-a') as HTMLElement, material, params: { color: [0, 1, 0, 1], mix: 0 }, layer });
  const layerMemberB = engine.createSurface({ host: document.querySelector('#layer-member-b') as HTMLElement, material, params: { color: [0, 0, 1, 1], mix: 0 }, layer });

  // G8 (opt-in, off by default on stock usage): under copies the buffer drawn so far before each
  // member, so a later member in document order can refract the glass already drawn beneath it.
  const underMaterial = engine.defineMaterial<{ color: readonly [number, number, number, number] }>({
    id: 'experiments/engine/under-reader@1',
    fragment: () => `
      uniform vec4 u_color;
      vec4 slg_shade(vec2 p) {
        vec4 below = slg_under(slg_toScreen(p));
        vec3 rgb = mix(u_color.rgb, below.rgb, below.a);
        return vec4(rgb, 1.0);
      }
    `,
    uniforms: ['u_color'],
    draw(ctx, params) { ctx.uniform('u_color', ...params.color); ctx.draw(); return 'drawn'; },
  });
  const underRoot = document.querySelector('#under-root') as HTMLElement;
  const underLayer = engine.createLayer(underRoot, { scale: 1, under: true });
  const underMemberA = engine.createSurface({ host: document.querySelector('#under-member-a') as HTMLElement, material, params: { color: [0, 1, 0, 1], mix: 0 }, layer: underLayer });
  const underMemberB = engine.createSurface({
    host: document.querySelector('#under-member-b') as HTMLElement, material: underMaterial, params: { color: [0, 0, 1, 1] }, layer: underLayer,
  });

  // G12: a private BackdropSource paints its own region each frame; `{ backdrop: { source } }`
  // samples it exactly like any other backdrop.
  let customPaints = 0;
  engine.registerBackdropSource({
    id: 'experiments/engine/custom-source@1',
    paint(ctx, region) {
      customPaints++;
      ctx.fillStyle = '#f2b134';
      ctx.fillRect(region.left, region.top, region.width, region.height);
      return { drew: true, live: false };
    },
    version: () => 1,
  });
  const customSourceHost = document.querySelector('#custom-source-host') as HTMLElement;
  const customSourceSurface = engine.createSurface({
    host: customSourceHost, material, params: { color: [1, 1, 1, 1], mix: 1 }, backdrop: { source: 'experiments/engine/custom-source@1' },
  });

  // G1 fix: an `int`/sampler-typed GLSL uniform set through plain uniformNf raises
  // GL_INVALID_OPERATION in a real driver (jsdom's mocked GL never validates this); an array uniform
  // needs one call per slot without uniformArray(). test.mjs checks gl.getError() after this surface
  // draws a few frames — the one check that actually proves the real-browser bug is gone.
  const uniformTypesMaterial = engine.defineMaterial<{ mode: number; rects: readonly number[] }>({
    id: 'experiments/engine/uniform-types@1',
    fragment: () => `
      uniform int uMode;
      uniform vec4 uRect[2];
      vec4 slg_shade(vec2 p) { return uRect[0] * step(0.5, float(uMode)); }
    `,
    draw(ctx, params) {
      ctx.uniform('uMode', params.mode);
      ctx.uniformArray('uRect', params.rects, 4);
      ctx.draw();
      return 'drawn';
    },
  });
  const uniformTypesHost = document.querySelector('#uniform-types-host') as HTMLElement;
  const uniformTypesSurface = engine.createSurface({
    host: uniformTypesHost, material: uniformTypesMaterial,
    params: { mode: 1, rects: [0.2, 0.4, 0.6, 1, 0, 0, 0, 0] },
    onStatus(status) { document.body.dataset.uniformTypesStatus = status.state; },
  });

  // The engine bug reported by the Pro port (seen as a cover-fit <img> backdrop's slg_backdrop()
  // reading black below a consistent screen y, on tall GlassPanels in a layer with under/snapshots
  // on): a draw(rects) rect padded past the surface's own box on every side, exactly the
  // shape proMaterial.ts's clusters(slots, merge + REFRACT_REACH) produces for refraction/soft-rim
  // reach. A fixed gl.viewport (the surface's own view) plus a scissor can only shrink what a quad
  // already covers, never grow it past that viewport — so the padded margin was silently lost. Member
  // of a layer (G7) so the loss would have shown inside the shared buffer, not clipped by the surface's
  // own small canvas being the whole framebuffer (which is what masked this for an own-canvas surface
  // in casual testing: there, the canvas IS exactly the view, so nothing outside it could ever be
  // examined in isolation the way a layer's shared buffer lets this experiment confirm it here).
  const paddedBackdropId = 'experiments/engine/padded-source@1';
  engine.registerBackdropSource({
    id: paddedBackdropId,
    paint(ctx, region) {
      ctx.fillStyle = '#ff33cc';
      ctx.fillRect(region.left, region.top, region.width, region.height);
      return { drew: true, live: false };
    },
    version: () => 1,
  });
  const PADDED_BLEED = 20;
  const paddedMaterial = engine.defineMaterial<Record<string, never>>({
    id: 'experiments/engine/padded-draw@1',
    fragment: () => 'vec4 slg_shade(vec2 p) { return vec4(slg_backdrop(slg_toScreen(p)), 1.0); }',
    inputs: { backdrop: true },
    draw(ctx) {
      const { width, height } = ctx.view;
      ctx.draw([[-PADDED_BLEED, -PADDED_BLEED, width + PADDED_BLEED * 2, height + PADDED_BLEED * 2]]);
      return 'drawn';
    },
  });
  const paddedLayer = engine.createLayer(document.querySelector('#padded-root') as HTMLElement, { scale: 1 });
  const paddedMember = engine.createSurface({
    host: document.querySelector('#padded-member') as HTMLElement, material: paddedMaterial, params: {},
    backdrop: { source: paddedBackdropId }, layer: paddedLayer,
    onStatus(status) { document.body.dataset.paddedStatus = status.state; },
  });

  // The regression the fix above replaced: moving gl.viewport (and slg_origin with it) per rect
  // shifted any shape a material positions in surface coordinates — an SDF slot, exactly how
  // proMaterial.ts positions its rounded-rect/pill glass. A material that only samples the backdrop
  // (above) cannot catch that: a uniform-colour backdrop looks the same shifted or not. This one
  // draws a fixed rounded rect whose straight edges land exactly on its own view's edges (so the soft
  // falloff band straddles the view/bleed boundary, visible on both sides of it), through a `padded`
  // toggle (one surface, not two): the padded draw must (a) look pixel-identical to the unpadded one
  // everywhere inside the plain view and (b) correctly continue the same shape into the bleed, not
  // some other, shifted or stretched one. A wide (12px) falloff, not a crisp 2px edge, keeps the
  // comparison robust to GPU/driver antialiasing differences while still being clearly sensitive to a
  // shift of even a few px.
  const SDF_PAD = 20;
  const sdfMaterial = engine.defineMaterial<{ padded: boolean }>({
    id: 'experiments/engine/sdf-rounded-rect@1',
    fragment: () => `
      uniform vec4 uShape; // cx, cy, half extent (square, == the view's own), corner radius -- surface CSS px
      vec4 slg_shade(vec2 p) {
        vec2 d = abs(p - uShape.xy) - vec2(uShape.z - uShape.w);
        float dist = length(max(d, 0.0)) - uShape.w;
        float inside = 1.0 - smoothstep(-6.0, 6.0, dist);
        return vec4(1.0, 0.0, 0.0, 1.0) * inside;
      }
    `,
    uniforms: ['uShape'],
    draw(ctx, params) {
      const { width, height } = ctx.view; // 100x100, see #sdf-host below
      const half = Math.max(width, height) / 2; // straight edges exactly at the view's own edges
      ctx.uniform('uShape', width / 2, height / 2, half, 10);
      ctx.draw(params.padded ? [[-SDF_PAD, -SDF_PAD, width + SDF_PAD * 2, height + SDF_PAD * 2]] : [[0, 0, width, height]]);
      return 'drawn';
    },
  });
  // A layer member (not an own-canvas surface): the shared buffer has real room around the host's
  // own box for `ctx.draw(rects)` to reach into, the same way the regression's real GlassPanels did.
  // An own-canvas surface's canvas is sized to exactly its own (bleed-inclusive) view — ctx.draw(rects)
  // can only ever reach as far as that already-allocated framebuffer, never past it; reaching further
  // there is `SurfaceOptions.bleed`'s job, not this one's (see the README's "ctx.draw(rects) can draw
  // past the surface's own view" section for which applies when).
  const sdfLayer = engine.createLayer(document.querySelector('#sdf-root') as HTMLElement, { scale: 1 });
  const sdfSurface = engine.createSurface({
    host: document.querySelector('#sdf-host') as HTMLElement, material: sdfMaterial, params: { padded: false }, layer: sdfLayer,
    onStatus(status) { document.body.dataset.sdfStatus = status.state; },
  });

  // Investigated from a report that looked like a cross-member state leak in one layer ("the first
  // member shows the second member's colour"): it reproduces from a reported minimal repro, but
  // turns out to be exactly G7's documented "draw in document order, glass on glass" compositing —
  // a LATER member's own bleed/pad legitimately painting over an EARLIER member's area wherever the
  // two geometrically overlap, same as later DOM siblings paint over earlier ones. The repro's
  // numbers (bleed 24 + pad 20 = 44px reach, hosts 48px wide 8px apart) make that overlap reach past
  // each host's own centre: reach >= gap + host/2 (44 >= 8 + 24) is exactly the condition for a
  // neighbour's bleed to cross a host's own centre, verified empirically by sweeping bleed+pad
  // across that exact threshold (the full write-up is in the final report). Flat colour, no
  // backdrop, so correctness is trivial to read off a single pixel.
  const definePaddedTint = (idSuffix: string) => engine.defineMaterial<{ color: readonly [number, number, number, number]; pad: number }>({
    id: `experiments/engine/frag-tint-${idSuffix}@1`,
    fragment: () => 'uniform vec4 u_color; vec4 slg_shade(vec2 p) { return u_color; }',
    uniforms: ['u_color'],
    draw(ctx, params) {
      ctx.uniform('u_color', ...params.color);
      const { width, height } = ctx.view;
      const pad = params.pad;
      ctx.draw(pad > 0 ? [[-pad, -pad, width + pad * 2, height + pad * 2]] : undefined);
      return 'drawn';
    },
  });
  const RED: readonly [number, number, number, number] = [1, 0, 0, 1];
  const BLUE: readonly [number, number, number, number] = [0, 0, 1, 1];

  // Safe geometry: bleed 6 + pad 6 = 12px reach, hosts 40px wide 40px apart (gap 40 >> reach 12, well
  // under the gap + host/2 = 60 threshold) — neither member's bleed comes close to the other's own
  // box, let alone its centre. Both members, including a point well inside each one's own bleed
  // margin (not just its centre), must show their own colour.
  const fragSafeMaterial = definePaddedTint('safe');
  const fragSafeLayer = engine.createLayer(document.querySelector('#frag-safe-root') as HTMLElement, { scale: 1 });
  const fragSafeA = engine.createSurface({
    host: document.querySelector('#frag-safe-a') as HTMLElement, material: fragSafeMaterial, params: { color: RED, pad: 6 }, bleed: 6, layer: fragSafeLayer,
    onStatus(status) { document.body.dataset.fragSafeStatusA = status.state; },
  });
  const fragSafeB = engine.createSurface({
    host: document.querySelector('#frag-safe-b') as HTMLElement, material: fragSafeMaterial, params: { color: BLUE, pad: 6 }, bleed: 6, layer: fragSafeLayer,
    onStatus(status) { document.body.dataset.fragSafeStatusB = status.state; },
  });

  // Aggressive geometry, the reported repro's own numbers: bleed 24 + pad 20 = 44px reach, hosts
  // 48px wide only 8px apart (44 >= 8 + 24 = 32, past the threshold) — B (later in document order)
  // legitimately bleeds across A's own centre. This is the documented, intended behaviour, not a
  // bug: it is pinned here so a real regression (B's colour appearing somewhere this geometry does
  // NOT predict, or A's bleed instead winning despite being earlier) would be caught.
  const fragOverlapMaterial = definePaddedTint('overlap');
  const fragOverlapLayer = engine.createLayer(document.querySelector('#frag-overlap-root') as HTMLElement, { scale: 1 });
  const fragOverlapA = engine.createSurface({
    host: document.querySelector('#frag-overlap-a') as HTMLElement, material: fragOverlapMaterial, params: { color: RED, pad: 20 }, bleed: 24, layer: fragOverlapLayer,
    onStatus(status) { document.body.dataset.fragOverlapStatusA = status.state; },
  });
  const fragOverlapB = engine.createSurface({
    host: document.querySelector('#frag-overlap-b') as HTMLElement, material: fragOverlapMaterial, params: { color: BLUE, pad: 20 }, bleed: 24, layer: fragOverlapLayer,
    onStatus(status) { document.body.dataset.fragOverlapStatusB = status.state; },
  });

  (window as unknown as { engineLab: unknown }).engineLab = {
    engine, surface, host, backdrop, paintBackdrop, paintQuadrants, htmlSurface,
    layer, layerMemberA, layerMemberB,
    underLayer, underMemberA, underMemberB,
    customSourceSurface, getCustomPaints: () => customPaints,
    uniformTypesSurface,
    paddedLayer, paddedMember,
    sdfLayer, sdfSurface,
    fragSafeLayer, fragSafeA, fragSafeB,
    fragOverlapLayer, fragOverlapA, fragOverlapB,
  };
}
