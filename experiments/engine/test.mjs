// Real-browser conformance for simple-liquid-glass/engine (G1 custom materials, G2 bleed +
// scissored draws, G3 liveness + the draw-result protocol, G10 per-context resources, G7
// document-order layers, G8 glass on glass, G12 backdrop-source providers), run by
// `npm run test:webgl`. Jest (src/__tests__/engineMaterials.test.ts, engineLayers.test.ts) covers
// the same scenarios against a mocked GL context for speed; this file proves the pixels, the
// real page stacking (G7) and the context-loss path against a real GPU in Chromium and WebKit.
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { PNG } from 'pngjs';

const port = Number(process.env.LIQUID_GLASS_ENGINE_PORT ?? 4300);
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
const base = `http://127.0.0.1:${port}/experiments/engine/`;

const frames = (page, k = 2) => page.evaluate(k => new Promise(done => { let i = 0; const tick = () => ++i >= k ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), k);
const pixelAt = (page, x, y, index = 0) => page.evaluate(([x, y, index]) => {
  const canvas = [...document.querySelectorAll('canvas[data-liquid-glass-engine]')][index];
  const read = document.createElement('canvas'); read.width = canvas.width; read.height = canvas.height;
  read.getContext('2d').drawImage(canvas, 0, 0);
  return [...read.getContext('2d').getImageData(x, y, 1, 1).data];
}, [x, y, index]);
// Reads straight from a layer's own shared canvas (G7 members have no canvas of their own): its
// (0,0) always lines up with the viewport's (see createLayer/drawLayer), and both engine.createLayer
// calls in main.ts use scale: 1, so canvas-local px == viewport CSS px directly.
const pixelAtLayer = (page, layerIndex, x, y) => page.evaluate(([layerIndex, x, y]) => {
  const canvas = [...document.querySelectorAll('canvas[data-liquid-glass-engine-layer]')][layerIndex];
  const read = document.createElement('canvas'); read.width = canvas.width; read.height = canvas.height;
  read.getContext('2d').drawImage(canvas, 0, 0);
  return [...read.getContext('2d').getImageData(x, y, 1, 1).data];
}, [layerIndex, x, y]);
// The real, final composited page: proves document-order stacking (an opaque DOM sibling in front
// of the layer's z-index: -1 canvas), which reading the canvas's own bitmap cannot show.
async function screenshotPixel(page, x, y) {
  const buffer = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const png = PNG.sync.read(buffer);
  return [...png.data.subarray(0, 4)];
}

try {
  for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 500, height: 900 }, deviceScaleFactor: 1 });
      const errors = []; page.on('pageerror', e => errors.push(String(e)));
      await page.goto(base);
      await page.waitForFunction(() => document.body.dataset.engineApi === '1', null, { timeout: 10000 });
      await page.waitForFunction(() => document.body.dataset.engineStatus === 'active', null, { timeout: 10000 });
      await frames(page);

      // Own canvas, not a scene (no document-order layer/scene machinery is implemented).
      const diagnostics = await page.evaluate(() => window.engineLab.surface.diagnostics());
      assert.equal(diagnostics.composition, 'own', `${name}: composition`);
      assert.ok(diagnostics.drawnFrames > 0, `${name}: drawnFrames`);

      // mix=0: a fully opaque red tint, ignoring the backdrop entirely.
      let pixel = await pixelAt(page, 10, 10);
      assert.deepEqual(pixel, [255, 0, 0, 255], `${name}: flat tint pixel ${pixel}`);

      // mix=1: slg_backdrop(slg_toScreen(p)) must sample the real backdrop colour at this
      // surface's screen position — the region/UV mapping in backdrop.ts, proven end to end. The
      // backdrop is four distinct quadrants (top-left #1d3b8f) so a flipped Y would read the
      // bottom-left quadrant (#d0426b) instead: this would fail that way, not just read "something".
      await page.evaluate(() => window.engineLab.surface.update({ mix: 1 }));
      await frames(page);
      pixel = await pixelAt(page, 10, 10);
      assert.ok(Math.abs(pixel[0] - 29) <= 6 && Math.abs(pixel[1] - 59) <= 6 && Math.abs(pixel[2] - 143) <= 6,
        `${name}: backdrop-sampled pixel ${pixel}, expected the top-left quadrant ~[29,59,143]`);

      // A repainted (same-reference) canvas backdrop is treated as live: no explicit version
      // needed, the next frame samples the new pixels.
      await page.evaluate(() => window.engineLab.paintBackdrop('#d0426b'));
      await frames(page, 3);
      pixel = await pixelAt(page, 10, 10);
      assert.ok(Math.abs(pixel[0] - 208) <= 10 && Math.abs(pixel[1] - 66) <= 10 && Math.abs(pixel[2] - 107) <= 10,
        `${name}: repainted backdrop pixel ${pixel}, expected ~[208,66,107]`);
      await page.evaluate(() => window.engineLab.surface.update({ mix: 0 }));

      // A second surface backed by a plain HTML element: this is the only path that needs the
      // lazily loaded html-to-image capture chunk (engine-source.esm.js), pulled in only because
      // this surface asked for it.
      await page.waitForFunction(() => document.body.dataset.htmlEngineStatus === 'active', null, { timeout: 10000 });
      const htmlPixel = await pixelAt(page, 60, 45, 1);
      assert.ok(Math.abs(htmlPixel[0] - 46) <= 10 && Math.abs(htmlPixel[1] - 143) <= 10 && Math.abs(htmlPixel[2] - 79) <= 10,
        `${name}: HTML-backdrop pixel ${htmlPixel}, expected ~[46,143,79]`);

      // Resize-in-frame: the host's own box change is picked up (bleed is read fresh every draw).
      await page.evaluate(() => { window.engineLab.host.style.width = '200px'; window.engineLab.host.style.height = '150px'; });
      await frames(page, 2);
      const size = await page.evaluate(() => { const c = document.querySelector('canvas[data-liquid-glass-engine]'); return [c.style.width, c.style.height]; });
      assert.deepEqual(size, ['200px', '150px'], `${name}: resized canvas ${size}`);

      // G7: document-order layers. Two members share one canvas (no per-member canvas); an
      // opaque DOM sibling exactly over member A must cover its glass in the FINAL composited
      // page (the layer canvas is z-index -1 within its own stacking context, so normal content
      // paints over it) while member B, unobstructed, stays visible and at its own position.
      await page.waitForFunction(() => window.engineLab.layerMemberA?.status.state === 'active'
        && window.engineLab.layerMemberB?.status.state === 'active', null, { timeout: 10000 });
      const layerDiagnostics = await page.evaluate(() => window.engineLab.layerMemberA.diagnostics());
      assert.equal(layerDiagnostics.composition, 'layer', `${name}: layer member composition`);
      assert.equal(await page.evaluate(() => document.querySelectorAll('canvas[data-liquid-glass-engine-layer]').length >= 1), true);
      let shot = await screenshotPixel(page, 50, 450); // member A's box, covered by the interleaved div
      assert.ok(Math.abs(shot[0] - 242) <= 8 && Math.abs(shot[1] - 177) <= 8 && Math.abs(shot[2] - 52) <= 8,
        `${name}: interleaved content must cover member A's glass ${shot}, expected ~[242,177,52]`);
      shot = await screenshotPixel(page, 250, 450); // member B's box, unobstructed
      assert.ok(shot[0] <= 10 && shot[1] <= 10 && shot[2] >= 200,
        `${name}: member B must stay visible, unobstructed ${shot}, expected ~[0,0,255]`);

      // G8 (opt-in): under copies the layer's buffer before each member, so a later member can
      // refract the glass already drawn beneath it. Member B reads slg_under; where it overlaps
      // member A (drawn first) it must show A's colour, and its own colour everywhere else.
      let underPixel = await pixelAtLayer(page, 1, 90, 700); // inside both A's and B's boxes
      assert.ok(underPixel[1] >= 200 && underPixel[2] <= 30,
        `${name}: under-sampled pixel must show member A's green ${underPixel}, expected ~[0,255,0]`);
      underPixel = await pixelAtLayer(page, 1, 140, 700); // inside B's box only
      assert.ok(underPixel[2] >= 200 && underPixel[1] <= 30,
        `${name}: B's own colour outside the overlap ${underPixel}, expected ~[0,0,255]`);

      // G12: a private BackdropSource paints its own region each frame; `{ backdrop: { source } }`
      // samples it exactly like any other backdrop.
      await page.waitForFunction(() => window.engineLab.customSourceSurface?.status.state === 'active', null, { timeout: 10000 });
      assert.ok(await page.evaluate(() => window.engineLab.getCustomPaints() > 0), `${name}: BackdropSource.paint was called`);
      const customPixel = await pixelAt(page, 10, 10, 2); // the third own-canvas surface created
      assert.ok(Math.abs(customPixel[0] - 242) <= 10 && Math.abs(customPixel[1] - 177) <= 10 && Math.abs(customPixel[2] - 52) <= 10,
        `${name}: custom-source-sampled pixel ${customPixel}, expected ~[242,177,52]`);

      // Context loss and restore: every program/resource is rebuilt, layers' under textures are
      // recreated, and every surface (own-canvas and layer members alike) resumes.
      const lostReason = await page.evaluate(async () => {
        const { acquireContextCanvas } = await import('/src/core/webgl/contextPool.ts');
        const lease = acquireContextCanvas(false);
        const gl = lease.canvas.getContext('webgl');
        lease.release();
        const ext = gl.getExtension('WEBGL_lose_context');
        window.__restoreGl = () => ext.restoreContext();
        await new Promise(resolve => { lease.canvas.addEventListener('webglcontextlost', resolve, { once: true }); ext.loseContext(); });
        return document.body.dataset.engineStatus;
      });
      assert.equal(lostReason, 'pending', `${name}: status while context is lost`);
      await page.evaluate(() => window.__restoreGl());
      await page.waitForFunction(() => document.body.dataset.engineStatus === 'active'
        && window.engineLab.layerMemberA.status.state === 'active'
        && window.engineLab.underMemberB.status.state === 'active', null, { timeout: 10000 });
      pixel = await pixelAt(page, 10, 10);
      assert.deepEqual(pixel, [255, 0, 0, 255], `${name}: tint pixel after context restore ${pixel}`);
      underPixel = await pixelAtLayer(page, 1, 90, 700);
      assert.ok(underPixel[1] >= 200 && underPixel[2] <= 30, `${name}: under layer resumes after restore ${underPixel}`);

      assert.deepEqual(errors, [], `${name}: page errors ${errors}`);
      await page.close();
      console.log(name, 'engine conformance passed');
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
