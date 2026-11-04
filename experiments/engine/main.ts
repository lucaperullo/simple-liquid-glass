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

  (window as unknown as { engineLab: unknown }).engineLab = { engine, surface, host, backdrop, paintBackdrop, paintQuadrants, htmlSurface };
}
