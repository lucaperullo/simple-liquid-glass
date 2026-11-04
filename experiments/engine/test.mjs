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

      // G1 fix: an `int`/sampler GLSL uniform set through uniformNf raises GL_INVALID_OPERATION on a
      // real driver (jsdom's mocked GL never validates this — only a real browser can prove the fix),
      // and an array uniform needs uniformArray() to set the whole array without one call per slot.
      // gl.getError() is the one check that actually proves no WebGL error occurred.
      await page.waitForFunction(() => document.body.dataset.uniformTypesStatus === 'active', null, { timeout: 10000 });
      const glError = await page.evaluate(async () => {
        const { acquireContextCanvas } = await import('/src/core/webgl/contextPool.ts');
        const lease = acquireContextCanvas(false);
        const gl = lease.canvas.getContext('webgl');
        lease.release();
        gl.getError(); // clear any pre-existing flag before isolating this surface's draws
        await new Promise(done => { let i = 0; const tick = () => ++i >= 3 ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
        return gl.getError();
      });
      assert.equal(glError, 0, `${name}: gl.getError() after int/array uniforms, expected NO_ERROR (0), got ${glError}`);

      // The engine bug reported by the Pro port (a cover-fit <img> backdrop's slg_backdrop() reading
      // black below a consistent screen y, on tall GlassPanels in a layer with under/snapshots on):
      // a draw(rects) rect padded past the surface's own box on every side (exactly proMaterial.ts's
      // clusters(slots, merge + REFRACT_REACH) shape) used to lose that padding — gl.scissor within
      // one fixed gl.viewport (the surface's own view) can only shrink what the engine's one
      // full-screen quad already covers, never grow it past that viewport. Sampled inside the padding
      // on two different edges (not the member's own unpadded box, which always worked): both must
      // show the backdrop's magenta, not the layer's cleared transparent black.
      await page.waitForFunction(() => document.body.dataset.paddedStatus === 'active', null, { timeout: 10000 });
      await frames(page, 3);
      let paddedPixel = await pixelAtLayer(page, 2, 340, 140); // 10px into the left padding, left of the member's own box (x=350)
      assert.ok(paddedPixel[0] > 200 && paddedPixel[1] < 120 && paddedPixel[2] > 150,
        `${name}: padded bleed (left edge) must show the backdrop ${paddedPixel}, expected ~[255,51,204]`);
      paddedPixel = await pixelAtLayer(page, 2, 400, 30); // 10px into the top padding, above the member's own box (y=40)
      assert.ok(paddedPixel[0] > 200 && paddedPixel[1] < 120 && paddedPixel[2] > 150,
        `${name}: padded bleed (top edge) must show the backdrop ${paddedPixel}, expected ~[255,51,204]`);

      // The regression caught by the fix above (reverted): moving gl.viewport (and slg_origin with
      // it) per rect shifted any shape a material positions in surface coordinates — proven here with
      // a fixed rounded rect, not a uniform-colour backdrop (which the checks above cannot catch a
      // shift with). #sdf-host is a 100x100 layer member at screen (350,260); its shape's straight
      // edges sit exactly on the view's own edges, with a wide (12px) soft falloff straddling the
      // view/bleed boundary. All five points below are in the SAME surface-local row (y=50, screen
      // y=310) so only x changes screen-side.
      await page.waitForFunction(() => document.body.dataset.sdfStatus === 'active', null, { timeout: 10000 });
      await frames(page, 3);
      const sdfPoint = (localX) => pixelAtLayer(page, 3, 350 + localX, 310);
      const unpaddedInsideDeep = await sdfPoint(50); // view centre: fully inside regardless of padding
      const unpaddedInsideNearEdge = await sdfPoint(3); // 3px in from the left edge, inside the wide falloff band
      const unpaddedBleedNearEdge = await sdfPoint(-3); // 3px past the left edge: only reachable when padded
      const unpaddedBleedDeep = await sdfPoint(-15); // well past the edge: only reachable when padded
      assert.ok(unpaddedInsideDeep[3] > 200, `${name}: SDF centre must be opaque even unpadded ${unpaddedInsideDeep}`);
      assert.deepEqual(unpaddedBleedNearEdge, [0, 0, 0, 0], `${name}: unpadded draw must not reach the bleed at all ${unpaddedBleedNearEdge}`);
      assert.deepEqual(unpaddedBleedDeep, [0, 0, 0, 0], `${name}: unpadded draw must not reach the bleed at all ${unpaddedBleedDeep}`);

      await page.evaluate(() => window.engineLab.sdfSurface.update({ padded: true }));
      await frames(page, 3);
      const paddedInsideDeep = await sdfPoint(50);
      const paddedInsideNearEdge = await sdfPoint(3);
      const paddedBleedNearEdge = await sdfPoint(-3);
      const paddedBleedDeep = await sdfPoint(-15);
      // Everywhere inside the plain view, padded must be pixel-identical to unpadded: a per-rect
      // viewport (the reverted regression) would have shifted slg_point() here and changed these.
      assert.deepEqual(paddedInsideDeep, unpaddedInsideDeep, `${name}: SDF centre must be unchanged by padding ${paddedInsideDeep} vs ${unpaddedInsideDeep}`);
      assert.deepEqual(paddedInsideNearEdge, unpaddedInsideNearEdge, `${name}: SDF near the view's own edge must be unchanged by padding ${paddedInsideNearEdge} vs ${unpaddedInsideNearEdge}`);
      // The bleed must now show the SAME shape continuing correctly, not a shifted or absent one:
      // partway into the falloff near the edge (neither fully opaque nor fully transparent), and
      // essentially gone by the time it's well past the edge.
      assert.ok(paddedBleedNearEdge[3] > 0 && paddedBleedNearEdge[3] < paddedInsideNearEdge[3],
        `${name}: SDF just past the edge must be a lighter continuation of the same falloff ${paddedBleedNearEdge} (inside was ${paddedInsideNearEdge})`);
      assert.ok(paddedBleedDeep[3] < 50, `${name}: SDF well into the bleed must have mostly faded out ${paddedBleedDeep}`);

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
