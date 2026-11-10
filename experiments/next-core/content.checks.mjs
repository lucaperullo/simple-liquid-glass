// The page-content checks of test.mjs: content given to a card stays on it, and is cut off at its edges.
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

/** `next(query)` opens the demo and waits for rest, `rest(page)` waits for rest, `say(text)` reports. */
export async function contentChecks({ next, rest, say }) {
  // Page content kept on a card: it ends exactly on the card, with no animation left running, and
  // travels with it (a screenshot mid-flight shows its rule 40 px below the card's edge, give or take).
  const carried = await next('mode=worker&auto=0&scale=1&content&slide&custom=flat&plain&quiet');
  const offBy = async () => {
    const png = PNG.sync.read(await carried.screenshot());
    const x = png.width >> 1;
    const at = (y) => png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3);
    let top = 0;
    while (top < png.height - 1 && !(at(top)[0] > 180 && at(top)[1] < 90)) top++;
    let rule = top + 8;
    while (rule < png.height - 1 && Math.min(...at(rule)) < 215) rule++;
    return (rule - top) / 2 - 40;
  };
  assert.ok(Math.abs(await offBy()) <= 1, 'the content does not start on its card');
  await carried.evaluate(() => window.__next.toggle());
  await carried.waitForTimeout(90);
  const midFlight = await offBy();
  await rest(carried);
  const settled = await carried.evaluate(() => {
    const content = document.querySelector('.card-content').getBoundingClientRect();
    const stage = document.querySelector('#stage canvas').getBoundingClientRect();
    return {
      y: content.top - stage.top,
      expected: stage.height - 176,
      running: document.getAnimations().length,
    };
  });
  say(
    `content on a moving card: ${midFlight.toFixed(1)} px off mid-flight, ${(settled.y - settled.expected).toFixed(2)} px off at rest`,
  );
  assert.ok(
    Math.abs(settled.y - settled.expected) < 0.01,
    `the content ended ${settled.y - settled.expected} px off its card`,
  );
  assert.equal(settled.running, 0, 'an animation was left running after the card came to rest');
  assert.ok(Math.abs(await offBy()) <= 1, 'the content is not on its card after the move');
  // Loose: the test machine's software renderer does not show the two in step as a display does.
  assert.ok(Math.abs(midFlight) < 60, `the content is far from its card mid-flight (${midFlight} px)`);
  await carried.close();

  // Content on a card that changes size: it is cut off where the glass ends, on the right and below,
  // at rest at both sizes and (loosely, as above) on the way.
  const grown = await next('mode=worker&auto=0&scale=1&content&clip&grow&custom=flat&plain&quiet');
  const cut = async () => {
    const box = await grown.evaluate(() => {
      const stage = document.querySelector('#stage canvas').getBoundingClientRect();
      const content = document.querySelector('.card-content').getBoundingClientRect();
      return {
        left: stage.left,
        top: stage.top,
        width: stage.width,
        height: stage.height,
        corner: [content.left - stage.left, content.top - stage.top],
        view: innerWidth,
        running: document.getAnimations().length,
      };
    });
    const png = PNG.sync.read(await grown.screenshot());
    const ratio = png.width / box.view;
    const at = (x, y) => png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3);
    const red = (x, y) => at(x, y)[0] > 180 && at(x, y)[1] < 90;
    const white = (x, y) => Math.min(...at(x, y)) > 215;
    const px = (css) => Math.round(css * ratio);
    // Along a row through the horizontal band and a row below it; down a column through the vertical band
    // and a column right of it. Each band should end where the card does.
    const run = (test, along, from, limit) => {
      let end = from;
      while (end < limit - 1 && test(...along(end + 1))) end++;
      return end / ratio;
    };
    const x0 = px(box.left + 16 + 80);
    const y0 = px(box.top + 40 + 80);
    return {
      ...box,
      right: run(red, (x) => [x, px(box.top + 40 + 100)], x0, png.width) - box.left,
      bandRight: run(white, (x) => [x, px(box.top + 40 + 52)], x0, png.width) - box.left,
      bottom: run(red, (y) => [px(box.left + 16 + 20), y], y0, png.height) - box.top,
      bandBottom: run(white, (y) => [px(box.left + 16 + 52), y], y0, png.height) - box.top,
    };
  };
  const small = await cut();
  assert.ok(Math.abs(small.right - 166) <= 1.5, `the small card ends at ${small.right}, not 166`);
  assert.ok(
    Math.abs(small.bandRight - small.right) <= 1.5,
    `content shows ${small.bandRight - small.right} px past the small card's right edge`,
  );
  assert.ok(
    Math.abs(small.bandBottom - small.bottom) <= 1.5,
    `content shows ${small.bandBottom - small.bottom} px past the small card's bottom edge`,
  );
  await grown.evaluate(() => window.__next.toggle());
  await grown.waitForTimeout(90);
  const growing = await cut();
  await rest(grown);
  const large = await cut();
  say(
    `content on a growing card: cut ${(growing.bandRight - growing.right).toFixed(1)} px (right) and ${(growing.bandBottom - growing.bottom).toFixed(1)} px (bottom) from the glass's edges mid-flight, ${(large.bandRight - large.right).toFixed(1)} and ${(large.bandBottom - large.bottom).toFixed(1)} at rest`,
  );
  assert.ok(Math.abs(large.right - (large.width - 16)) <= 1.5, `the large card ends at ${large.right}`);
  assert.ok(
    Math.abs(large.bandRight - large.right) <= 1.5,
    `content shows ${large.bandRight - large.right} px past the large card's right edge`,
  );
  assert.ok(
    Math.abs(large.bandBottom - large.bottom) <= 1.5,
    `content shows ${large.bandBottom - large.bottom} px past the large card's bottom edge`,
  );
  assert.deepEqual(
    large.corner.map((value) => Math.round(value * 100) / 100),
    [16, 40],
    'the content left its corner',
  );
  assert.equal(large.running, 0, 'an animation was left running after the card stopped growing');
  assert.ok(
    Math.abs(growing.bandRight - growing.right) < 80,
    `the content's cut is far from the glass's edge mid-flight (${growing.bandRight - growing.right} px)`,
  );
  await grown.evaluate(() => window.__next.toggle());
  await rest(grown);
  const again = await cut();
  assert.ok(
    Math.abs(again.bandRight - again.right) <= 1.5 && Math.abs(again.bandBottom - again.bottom) <= 1.5,
    'content shows past the card after it shrank back',
  );
  await grown.close();
}
