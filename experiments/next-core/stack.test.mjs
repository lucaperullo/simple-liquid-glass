// simple-liquid-glass/next/stack in real browsers (Chromium and WebKit), against the built entry:
//   npm run build && node experiments/next-core/stack.test.mjs
// Layers stacked in one canvas draw in order, each over the glass before it; a stacked layer's material reads
// that glass; a clip keeps a layer to its rectangle; a stacked layer draws with its base's backdrop until it
// has its own; a spring in a stacked layer moves it; a lost context
// comes back with every layer; removing a layer leaves the others, and removing the base stops them all.
// The same from a worker and on the page thread.
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const types = { html: 'text/html', js: 'text/javascript' };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://x').pathname
    .replace('/experiments/next-core/lib/', '/dist/')
    .slice(1);
  try {
    const body = await readFile(root + path);
    response.writeHead(200, { 'content-type': types[path.split('.').pop()] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/experiments/next-core/stack.html`;

const launchers = {
  chromium: () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }),
  webkit: () => webkit.launch(),
};
const RED = [255, 0, 0];
const BLACK = [0, 0, 0];
const BLUE = [0, 0, 255];
// Half-clear green over the red box; half-clear red over the black page.
const OVER_GLASS = [128, 128, 0];
const OVER_NOTHING = [128, 0, 0];

for (const [name, launch] of Object.entries(launchers)) {
  const browser = await launch();
  for (const mode of ['worker', 'page']) {
    const page = await browser.newPage({ viewport: { width: 320, height: 220 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    await page.goto(`${base}?mode=${mode}`);
    await page.waitForFunction(() => window.__stack);
    const thread = await page.evaluate(() => window.__stack.host.ready);
    const rest = async () => {
      // Until the engine has drawn and come to rest.
      for (let quiet = 0, drawn = 0, tries = 0; (drawn === 0 || quiet < 2) && tries < 100; tries++) {
        await page.waitForTimeout(80);
        const { frames } = await page.evaluate(() => window.__stack.host.stats());
        drawn += frames;
        quiet = frames === 0 ? quiet + 1 : 0;
      }
    };
    const pixels = async () => PNG.sync.read(await page.screenshot());
    const expect = (picture, x, y, colour, what) => {
      const at = (y * picture.width + x) * 4;
      const got = [...picture.data.subarray(at, at + 3)];
      assert.ok(
        got.every((value, index) => Math.abs(value - colour[index]) <= 3),
        `${name} ${mode}: ${what} at ${x},${y}: got ${got}, wanted ${colour}`,
      );
    };
    const whole = (picture, what) => {
      expect(picture, 50, 50, RED, `${what}: the base's box`);
      expect(picture, 150, 100, OVER_GLASS, `${what}: the stacked layer over the base's glass`);
      expect(picture, 210, 160, OVER_NOTHING, `${what}: the stacked layer over no glass`);
      expect(picture, 260, 165, BLUE, `${what}: the clipped layer inside its clip`);
      expect(picture, 290, 100, BLACK, `${what}: the clipped layer outside its clip`);
      expect(picture, 250, 40, BLACK, `${what}: nothing`);
    };

    await rest();
    whole(await pixels(), 'at first');
    const statuses = await page.evaluate(() => window.__stack.statuses);
    assert.deepEqual(
      statuses,
      ['base: drawing', 'probe: drawing', 'blue: drawing', 'shows: drawing'],
      `${name} ${mode}: statuses`,
    );
    // A stacked layer with no backdrop of its own draws with its base's; given one, with that.
    expect(await pixels(), 40, 175, [0, 255, 255], "a stacked layer shows its base's backdrop");
    await page.evaluate(() => window.__stack.own());
    await rest();
    expect(await pixels(), 40, 175, [255, 0, 255], 'a stacked layer shows its own backdrop');
    assert.equal(
      await page.evaluate(() => window.__stack.coreStacks),
      'undefined',
      'the core has no stack()',
    );

    // A spring in a stacked layer: the probe moves right, and reads the glass under where it is now.
    await page.evaluate(() => window.__stack.move());
    await rest();
    let picture = await pixels();
    expect(picture, 120, 100, RED, 'after the move: where the probe was');
    expect(picture, 170, 100, OVER_GLASS, 'after the move: the probe over the base');
    expect(picture, 230, 100, OVER_NOTHING, 'after the move: the probe past the base');

    // A lost context comes back with every layer of the canvas.
    await page.evaluate(() => window.__stack.lose());
    await page.waitForTimeout(400);
    await rest();
    picture = await pixels();
    expect(picture, 50, 50, RED, 'after a lost context: the base');
    expect(picture, 170, 100, OVER_GLASS, 'after a lost context: the probe over the base');
    expect(picture, 260, 165, BLUE, 'after a lost context: the clipped layer');
    expect(picture, 40, 175, [255, 0, 255], 'after a lost context: a stacked layer with its own backdrop');

    // The base measured from 60 px lower: its box moves, and the probe over it reads the glass where it is now.
    await page.evaluate(() => window.__stack.lower());
    await rest();
    picture = await pixels();
    expect(picture, 50, 50, BLACK, 'the base moved down: where its box was');
    expect(picture, 50, 150, RED, 'the base moved down: its box');
    expect(picture, 170, 70, OVER_NOTHING, 'the base moved down: the probe above it');
    expect(picture, 170, 100, OVER_GLASS, 'the base moved down: the probe over it');

    await page.evaluate(() => window.__stack.removeBlue());
    await rest();
    picture = await pixels();
    // (The probe has moved under where the blue layer was.)
    expect(picture, 260, 165, OVER_NOTHING, 'a stacked layer removed');
    expect(picture, 170, 100, OVER_GLASS, 'a stacked layer removed: the other stays');

    // The base takes its stacked layers with it: one of them told to move draws nothing.
    await page.evaluate(() => window.__stack.removeBase());
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__stack.host.stats());
    await page.evaluate(() => window.__stack.move());
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__stack.host.stats());
    assert.equal(after.frames, 0, `${name} ${mode}: nothing is drawn once the base is removed`);
    assert.deepEqual(errors, [], `${name} ${mode}: page errors`);
    console.log(`${name.padEnd(9)} ${mode} (drawn on the ${thread} thread): stacked layers ok`);
    await page.close();
  }
  await browser.close();
}
server.close();
console.log('next-core stack: ok');
