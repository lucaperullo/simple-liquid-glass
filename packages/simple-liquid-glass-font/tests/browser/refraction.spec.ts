import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

function changedPixels(a: Buffer, b: Buffer) {
  const before = PNG.sync.read(a), after = PNG.sync.read(b);
  let count = 0;
  for (let i = 0; i < before.data.length; i += 4) {
    if (Math.abs(before.data[i] - after.data[i]) + Math.abs(before.data[i + 1] - after.data[i + 1]) + Math.abs(before.data[i + 2] - after.data[i + 2]) > 30) count++;
  }
  return count;
}

test('native refraction displaces a sharp background even with blur at zero', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'SVG backdrop refraction requires Chromium; other engines use the frosted fallback.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Scroll content', exact: true }).click();
  await expect(page.locator('[data-renderer="native"]')).toHaveCount(1);
  await page.addStyleTag({ content: '.scene-scroll{background:repeating-linear-gradient(90deg,#19332c 0 7px,#f8e6a4 7px 14px)!important}.scene-scroll article{visibility:hidden}' });
  await page.getByLabel('Blur', { exact: true }).fill('0');
  await page.getByLabel('Color separation', { exact: true }).fill('0');
  await page.getByLabel('Refraction', { exact: true }).fill('0');
  const plain = await page.locator('.slgf-layout').screenshot();
  await page.getByLabel('Refraction', { exact: true }).fill('40');
  const bent = await page.locator('.slgf-layout').screenshot();
  expect(changedPixels(plain, bent)).toBeGreaterThan(500);
  // Dispersion must independently alter the live pixel sampling.
  await page.getByLabel('Color separation', { exact: true }).fill('6');
  expect(changedPixels(bent, await page.locator('.slgf-layout').screenshot())).toBeGreaterThan(100);
});

test('scrolling real content updates the backdrop without moving or rebuilding the lens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Scroll content', exact: true }).click();
  const lens = page.locator('.slgf-layout');
  await expect(lens).toHaveAttribute('data-ready', 'true');
  const position = await lens.boundingBox();
  const map = await page.locator('feImage').getAttribute('href');
  const before = await lens.screenshot();
  await page.getByLabel('Scrollable backdrop', { exact: true }).evaluate(element => { element.scrollTop = 560; });
  await expect.poll(() => page.getByLabel('Scrollable backdrop', { exact: true }).evaluate(element => element.scrollTop)).toBe(560);
  expect(changedPixels(before, await lens.screenshot())).toBeGreaterThan(1000);
  expect(await lens.boundingBox()).toEqual(position);
  expect(await page.locator('feImage').getAttribute('href')).toBe(map);
});

test('a real video plays underneath the stationary lens and can be paused', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Exercise the native live-video renderer in Chromium.');
  await page.goto('/');
  const video = page.locator('video');
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(.1);
  const lens = page.locator('.slgf-layout');
  const before = await lens.screenshot();
  const map = await page.locator('feImage').getAttribute('href');
  const start = await video.evaluate(element => element.currentTime);
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(start + .4);
  expect(changedPixels(before, await lens.screenshot())).toBeGreaterThan(100);
  expect(await page.locator('feImage').getAttribute('href')).toBe(map);
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
});

test('scrolling over the letters moves the content without scrolling the page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Scroll content', exact: true }).click();
  const before = await page.evaluate(() => window.scrollY);
  await page.locator('.glass-heading').hover();
  await page.mouse.wheel(0, 150);
  await expect.poll(() => page.locator('.scene-scroll').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('the strength control reaches the renderer without hidden attenuation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Scroll content', exact: true }).click();
  await page.getByLabel('Color separation', { exact: true }).fill('0');
  await expect(page.locator('feDisplacementMap')).toHaveAttribute('scale', '88');
  for (const strength of [0, 88, 176, 300]) {
    await page.getByLabel('Refraction', { exact: true }).fill(String(strength));
    await expect(page.locator('feDisplacementMap')).toHaveAttribute('scale', String(strength));
  }
  await page.getByRole('button', { name: 'Refraction on', exact: true }).click();
  await expect(page.locator('feDisplacementMap')).toHaveAttribute('scale', '0');
  await page.getByRole('button', { name: 'Refraction off', exact: true }).click();
  await expect(page.locator('feDisplacementMap')).toHaveAttribute('scale', '300');
});


test('readability controls update without rebuilding the lens', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.slgf-layout')).toHaveAttribute('data-ready', 'true');
  const map = await page.locator('feImage').getAttribute('href');
  const letters = page.locator('.slgf-letters');
  await expect(letters).toHaveCSS('-webkit-text-stroke-width', '1px');
  await page.getByLabel('Border width', { exact: true }).fill('2');
  await page.getByLabel('Border color', { exact: true }).selectOption('#000000');
  await page.getByLabel('Fill opacity', { exact: true }).fill('0.4');
  await page.getByLabel('Shadow opacity', { exact: true }).fill('0');
  await expect(letters).toHaveCSS('-webkit-text-stroke-width', '2px');
  await expect(letters).toHaveCSS('-webkit-text-stroke-color', 'rgb(0, 0, 0)');
  await expect(letters).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.4)');
  await expect(letters).toHaveCSS('text-shadow', 'none');
  expect(await page.locator('feImage').getAttribute('href')).toBe(map);
  await page.emulateMedia({ media: 'print' });
  await expect(letters).toHaveCSS('-webkit-text-stroke-width', '0px');
  await expect(letters).toHaveCSS('text-shadow', 'none');
});
