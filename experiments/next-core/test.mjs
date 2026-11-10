// simple-liquid-glass/next in real browsers (Chromium and WebKit), against the built entry:
//   npm run build && node experiments/next-core/test.mjs
// The worker and the page thread draw the same picture; a spring
// (and the built-in glass matches its approved pictures); an application's own material works; a spring
// reaches its target; the renderer asks for no frames at rest; a lost context comes back; a busy page
// thread does not slow glass drawn from the worker; glass over a scrolling page shows what is behind it;
// and a playing video reaches the glass.
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const types = { html: 'text/html', js: 'text/javascript' };
const server = createServer(async (request, response) => {
  // The demo imports ./lib/next.esm.js; here that is the build output.
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
const base = `http://127.0.0.1:${server.address().port}/experiments/`;

const launchers = {
  chromium: () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }),
  webkit: () => webkit.launch(),
};

function difference(a, b) {
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let sum = 0;
  let worst = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(a.data[i + k] - b.data[i + k]);
      sum += d;
      if (d > worst) worst = d;
    }
  }
  return { mean: sum / ((a.data.length / 4) * 3), worst };
}

for (const [name, launch] of Object.entries(launchers)) {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 360, height: 700 }, deviceScaleFactor: 2 });
  const say = (text) => console.log(`${name.padEnd(9)} ${text}`);

  const open = async (path, query) => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${base}${path}/index.html?${query}`);
    await page.waitForFunction(() => window.__proof);
    page.errors = errors;
    return page;
  };
  const sample = (page) => page.evaluate(() => window.__proof.sample());
  // At rest: every layer is drawing and two readings in a row saw no new frame.
  const rest = async (page) => {
    await page.waitForFunction(() => window.__next.statuses.at(-1) === 'drawing');
    for (let quiet = 0, waited = 0; quiet < 2; waited += 250) {
      assert.ok(waited < 15000, 'the scene did not come to rest');
      await page.waitForTimeout(250);
      quiet = (await sample(page)).glass.n === 0 ? quiet + 1 : 0;
    }
    assert.deepEqual(page.errors, []);
  };
  const shot = async (page) => PNG.sync.read(await page.locator('#stage').screenshot());
  const next = async (query) => {
    const page = await open('next-core', query);
    await rest(page);
    return page;
  };

  // Pictures to compare against, each from a page of its own that is closed again: WebKit slows the frames
  // of a page that is not in front, so the page under test below must be the only one open.
  const pictureOf = async (path, query, settle) => {
    const page = await open(path, query);
    await settle(page);
    const picture = await shot(page);
    await page.close();
    return picture;
  };
  const onPageThread = await pictureOf('next-core', 'mode=main&auto=0&scale=2', async (page) => {
    await rest(page);
    assert.equal(await page.evaluate(() => window.__proof.config.thread), 'page');
  });
  const golden = 'mode=worker&auto=0&scale=1&plain&quiet';
  const dark = await pictureOf('next-core', golden, rest);
  const light = await pictureOf('next-core', `${golden}&light`, rest);
  const lean = await pictureOf('next-core', 'mode=worker&auto=0&scale=2&lean', rest);
  const setOpen = await pictureOf('next-core', 'mode=worker&auto=0&scale=2&open=1', rest);

  // 1. The worker and the page thread draw the same picture.
  const page = await next('mode=worker&auto=0&scale=2');
  assert.equal(await page.evaluate(() => window.__proof.config.thread), 'worker', 'the worker did not start');
  const picture = await shot(page);
  let d = difference(picture, onPageThread);
  say(`worker vs page thread: mean ${d.mean.toFixed(3)} worst ${d.worst}`);
  assert.ok(d.mean <= 0.5, `the two threads draw different pictures (mean ${d.mean})`);

  // 2. The built-in glass looks as it did when its pictures were approved, in its dark and its light tuning.
  // (UPDATE_GOLDEN=1 replaces the pictures: look at the new ones before committing them.)
  for (const [tuning, taken] of [
    ['dark', dark],
    ['light', light],
  ]) {
    const file = new URL(`./golden/${tuning}.png`, import.meta.url);
    // One picture for every browser: Chromium's.
    if (process.env.UPDATE_GOLDEN && name === 'chromium') await writeFile(file, PNG.sync.write(taken));
    d = difference(taken, PNG.sync.read(await readFile(file)));
    say(`glass, ${tuning}, vs its approved picture: mean ${d.mean.toFixed(3)} worst ${d.worst}`);
    // Tight where the pictures were taken; looser elsewhere, where the backdrop itself is rasterised differently.
    assert.ok(
      d.mean <= (name === 'chromium' ? 0.2 : 1.5),
      `the ${tuning} glass has changed (mean ${d.mean}/255)`,
    );
  }
  d = difference(picture, lean);
  say(`lean variant vs full: mean ${d.mean.toFixed(3)} worst ${d.worst}`);
  assert.ok(
    d.mean > 0 && d.mean <= 1,
    `the lean variant should differ from the full one, slightly (mean ${d.mean})`,
  );

  // 3. At rest it asks for no frames; a change wakes it; the spring ends where a jump would.
  await sample(page);
  await page.waitForTimeout(700);
  assert.equal((await sample(page)).glass.n, 0, 'frames were drawn at rest');
  await page.evaluate(() => window.__next.toggle());
  // (Half a second: the browser is still tidying up after the pages closed above.)
  await page.waitForTimeout(500);
  const moving = (await sample(page)).glass.n;
  assert.ok(moving > 3, `a change should start the frames again (drew ${moving})`);
  await rest(page);
  d = difference(await shot(page), setOpen);
  say(
    `spring's end vs set directly: mean ${d.mean.toFixed(3)} worst ${d.worst} (${moving} frames in the first 500 ms)`,
  );
  assert.ok(d.mean <= 0.5, `the spring did not reach its target (mean ${d.mean})`);
  assert.ok(difference(picture, setOpen).mean > 2, 'the open and closed scenes should differ');

  // 4. A lost context comes back with the same picture.
  await page.evaluate(() => window.__next.toggle());
  await rest(page);
  const seen = await page.evaluate(() => window.__next.statuses.length);
  await page.evaluate(() => window.__next.layers[0].layer.simulateContextLoss(150));
  await page.waitForFunction(
    (from) => window.__next.statuses.slice(from).join() === 'context-lost,drawing',
    seen,
  );
  await rest(page);
  d = difference(picture, await shot(page));
  say(`after a lost context: mean ${d.mean.toFixed(3)} worst ${d.worst}`);
  assert.ok(d.mean <= 0.5, `the picture did not come back after a context loss (mean ${d.mean})`);
  await page.close();

  // 5. An application's own material: its uniforms, its `combine`, and a clear report when its GLSL is wrong.
  const pixel = (png, x, y) => {
    const at = (Math.round(png.height * y) * png.width + Math.round(png.width * x)) * 4;
    return [...png.data.subarray(at, at + 4)];
  };
  const flat = await next('mode=worker&auto=0&scale=1&custom=flat&cards=2&quiet');
  const before = pixel(await shot(flat), 0.5, 0.25);
  await flat.evaluate(() => window.__next.layers[0].layer.setParams({ colour: [0, 0, 1] }));
  await rest(flat);
  const after = pixel(await shot(flat), 0.5, 0.25);
  say(`own material: ${before} then, with its uniform changed, ${after}`);
  assert.deepEqual(
    [before, after],
    [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
    ],
  );
  await flat.close();

  const last = await next('mode=worker&auto=0&scale=1&custom=last&cards=2&quiet');
  const [first, second] = [pixel(await shot(last), 0.5, 0.25), pixel(await shot(last), 0.5, 0.75)];
  say(`own combine keeping the last shape only: first card ${first}, second ${second}`);
  assert.notDeepEqual(first, [255, 0, 0, 255], "the material's combine was not used");
  assert.deepEqual(second, [255, 0, 0, 255]);
  await last.close();

  const own = await next('mode=worker&auto=0&scale=1&custom=field&cards=2&quiet');
  const colours = [pixel(await shot(own), 0.5, 0.25), pixel(await shot(own), 0.5, 0.75)];
  await own.evaluate(() =>
    window.__next.layers[0].shapes[1].setAttributes([0, 1, 0, 0, 0, 0, 0], { jump: true }),
  );
  await rest(own);
  const recoloured = pixel(await shot(own), 0.5, 0.75);
  say(
    `own field, colour from each shape's attributes: ${colours.join(' and ')}; second changed to ${recoloured}`,
  );
  assert.deepEqual(colours, [
    [255, 0, 0, 255],
    [0, 0, 255, 255],
  ]);
  assert.deepEqual(recoloured, [0, 255, 0, 255]);
  await own.close();

  const broken = await open('next-core', 'mode=worker&auto=0&scale=1&custom=broken&quiet');
  await broken.waitForFunction(() => window.__next.statuses.at(-1) === 'unsupported');
  const report = await broken.evaluate(() => window.__next.details.at(-1));
  say(`bad GLSL: unsupported, "${report.split('\n')[0].slice(0, 70)}"`);
  assert.match(report, /failed to compile/);
  await broken.close();

  // 6. Glass fixed over a page that scrolls. With no displacement, the ruler lines seen through the glass
  // must sit exactly where the lines beside it are, wherever the page was scrolled to and however it got there.
  const rulerRows = (png, x) => {
    const light = (y) => png.data[(y * png.width + x) * 4] + png.data[(y * png.width + x) * 4 + 1];
    const rows = [];
    // The lower half only: the upper half of the first viewport has the picture's text in it.
    for (let y = png.height >> 1; y < png.height - 130; y++) {
      if (
        light(y) - Math.max(light(y - 6), light(y + 6)) > 50 &&
        light(y) >= light(y - 1) &&
        light(y) > light(y + 1)
      ) {
        rows.push(y);
      }
    }
    return rows;
  };
  const ruler = async (target) => {
    const png = PNG.sync.read(await target.screenshot());
    const beside = rulerRows(png, 5);
    const through = rulerRows(png, png.width >> 1);
    assert.ok(
      beside.length >= 4 && through.length >= 4,
      `ruler lines not found (${beside.length}, ${through.length})`,
    );
    return Math.max(...through.map((row) => Math.min(...beside.map((other) => Math.abs(other - row)))));
  };
  const scrollQuery = 'mode=worker&auto=0&scale=2&scroll&bend=0&cards=1&quiet';
  const startedThere = await next(`${scrollQuery}&at=610`);
  let off = await ruler(startedThere);
  say(`scrolled before it started: lines through the glass off by ${off} px`);
  assert.ok(off <= 1, `glass over a scrolled page shows the wrong part of it (off by ${off} device px)`);
  const there = await shot(startedThere);
  await startedThere.close();

  const scrolled = await next(scrollQuery);
  const atTop = await shot(scrolled);
  await sample(scrolled);
  await scrolled.evaluate(() => window.scrollTo({ top: 610, behavior: 'smooth' }));
  await scrolled.waitForFunction(() => window.scrollY === 610);
  const during = (await sample(scrolled)).glass;
  await rest(scrolled);
  off = await ruler(scrolled);
  d = difference(there, await shot(scrolled));
  say(
    `scrolled there smoothly: off by ${off} px; vs started there: mean ${d.mean.toFixed(3)}; ${during.n} frames on the way, prediction off by ${during.scrollError} px (worst ${during.scrollErrorMax})`,
  );
  assert.ok(off <= 1, `glass shows the wrong part of the page after a scroll (off by ${off} device px)`);
  assert.ok(d.mean <= 0.5, `a scroll ends on a different picture from starting there (mean ${d.mean})`);
  assert.ok(difference(there, atTop).mean > 2, 'scrolling should change what the glass shows');
  assert.ok(during.n > 5, `the glass should be redrawn while the page scrolls (drew ${during.n})`);
  await scrolled.close();

  // 7. A playing video as the backdrop: its frames reach the glass, and keep coming.
  // (It never comes to rest: every frame of the video is a change.)
  const film = await open('next-core', 'mode=worker&auto=0&scale=1&video&cards=1&quiet');
  await film.waitForFunction(() => window.__next.statuses.at(-1) === 'drawing');
  const glassColour = async (colour) => {
    await film.evaluate((next) => window.__next.paintFilm(next), colour);
    await film.waitForTimeout(600);
    const png = await shot(film);
    const at = ((png.height >> 2) * png.width + (png.width >> 1)) * 4;
    return [png.data[at], png.data[at + 1], png.data[at + 2]];
  };
  const red = await glassColour('#ff0000');
  const blue = await glassColour('#0000ff');
  await sample(film);
  await film.waitForTimeout(1000);
  const playing = (await sample(film)).glass;
  say(
    `video backdrop: glass over red ${red}, over blue ${blue}; ${playing.n} frames in a second (${playing.thread})`,
  );
  assert.ok(red[0] > red[2] + 60, `red video frames did not reach the glass (${red})`);
  assert.ok(blue[2] > blue[0] + 60, `blue video frames did not reach the glass (${blue})`);
  assert.ok(playing.n >= 10, `the glass should follow the video (drew ${playing.n} frames in a second)`);
  await film.close();

  // 8. A page thread that burns 40 ms every frame: glass drawn there crawls with it, glass in a worker does not.
  const cadence = async (query) => {
    const page = await open('next-core', `${query}&busy=40&scale=1&auto=300&quiet`);
    await page.waitForTimeout(1000);
    await sample(page);
    await page.waitForTimeout(2500);
    const result = await sample(page);
    await page.close();
    return result;
  };
  const slow = await cadence('mode=main');
  const free = await cadence('mode=worker');
  say(
    `busy page: glass on the page ${slow.glass.fps} fps; glass in a worker ${free.glass.fps} fps (page ${free.page.fps})`,
  );
  assert.ok(slow.glass.fps < 30, 'the busy loop should slow the page thread');
  assert.ok(free.glass.fps >= slow.glass.fps * 1.8, 'the worker should not wait for the page thread');

  await browser.close();
}

server.close();
console.log('next-core: ok');
