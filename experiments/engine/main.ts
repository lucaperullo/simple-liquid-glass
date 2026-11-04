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

  (window as unknown as { engineLab: unknown }).engineLab = {
    engine, surface, host, backdrop, paintBackdrop, paintQuadrants, htmlSurface,
    layer, layerMemberA, layerMemberB,
    underLayer, underMemberA, underMemberB,
    customSourceSurface, getCustomPaints: () => customPaints,
  };
}
