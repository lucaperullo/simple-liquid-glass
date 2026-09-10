import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Scroll content', exact: true }).click();
});

test('font changes preserve alignment, and text remains selectable', async ({ page }) => {
  let previousMask = await page.locator('.slgf-backdrop').getAttribute('style');
  for (const font of ['Georgia, serif', 'Courier New, monospace', 'Arial, sans-serif']) {
    await page.getByLabel('Font', { exact: true }).selectOption(font);
    await expect.poll(() => page.locator('.slgf-letters').evaluate(element => getComputedStyle(element).fontFamily.replaceAll('"', ''))).toBe(font);
    await expect.poll(() => page.locator('.slgf-backdrop').getAttribute('style')).not.toBe(previousMask);
    previousMask = await page.locator('.slgf-backdrop').getAttribute('style');
  }
  await page.getByLabel('Words', { exact: true }).fill('Hello & glass');
  const selected = await page.locator('.slgf-letters').evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    return selection.toString();
  });
  expect(selected).toBe('Hello & glass');
});

test('blur changes backdrop pixels only inside the glyph mask', async ({ page, context }) => {
  // Some headless graphics backends accept backdrop-filter but never paint it.
  // Probe a plain rectangle so that package failures cannot trigger this skip.
  const probe = await context.newPage();
  await probe.setContent('<body style="background:repeating-linear-gradient(90deg,red 0 10px,blue 10px 20px)"><div style="position:fixed;inset:100px;backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px)"></div>');
  const unfiltered = await probe.screenshot();
  await probe.locator('div').evaluate(element => {
    element.style.setProperty('backdrop-filter', 'blur(16px)');
    element.style.setProperty('-webkit-backdrop-filter', 'blur(16px)');
  });
  const filtered = await probe.screenshot();
  await probe.close();
  test.skip(unfiltered.equals(filtered), 'This browser graphics backend does not render even plain backdrop-filter blur.');
  const scene = page.locator('.scene');
  const bounds = await page.locator('.slgf-layout').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const parent = element.closest('.scene')!.getBoundingClientRect();
    return { x: rect.x - parent.x, y: rect.y - parent.y, width: rect.width, height: rect.height };
  });
  const maskUrl = await page.locator('.slgf-backdrop').evaluate(element => (element as HTMLElement).style.maskImage);
  const mask = PNG.sync.read(Buffer.from(maskUrl.split(',')[1].replace(/["')]/g, ''), 'base64'));
  const before = PNG.sync.read(await scene.screenshot());
  await page.getByLabel('Blur', { exact: true }).fill('16');
  const after = PNG.sync.read(await scene.screenshot());
  let inside = 0, outside = 0;
  for (let y = 0; y < before.height; y++) for (let x = 0; x < before.width; x++) {
    const i = (y * before.width + x) * 4;
    const delta = Math.abs(before.data[i] - after.data[i]) + Math.abs(before.data[i + 1] - after.data[i + 1]) + Math.abs(before.data[i + 2] - after.data[i + 2]);
    if (delta < 12) continue;
    const mx = Math.floor((x - bounds.x) / bounds.width * mask.width);
    const my = Math.floor((y - bounds.y) / bounds.height * mask.height);
    let inGlyph = false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const px = mx + dx, py = my + dy;
      if (px >= 0 && py >= 0 && px < mask.width && py < mask.height && mask.data[(py * mask.width + px) * 4 + 3] > 0) inGlyph = true;
    }
    if (inGlyph) inside++; else outside++;
  }
  expect(inside).toBeGreaterThan(100);
  expect(outside).toBeLessThan(5);
});

test('the mask follows the visible glyphs in different fonts', async ({ page }) => {
  await page.addStyleTag({ content: '.scene{background:white!important}.scene-scroll,.slgf-backdrop,.slgf-highlight{display:none!important}.slgf-letters{color:black!important;background:none!important;text-shadow:none!important;-webkit-text-stroke:0!important}' });
  for (const font of ['Georgia, serif', 'Arial, sans-serif', 'Courier New, monospace']) {
    await page.getByLabel('Font', { exact: true }).selectOption(font);
    await expect.poll(() => page.locator('.slgf-letters').evaluate(element => getComputedStyle(element).fontFamily.replaceAll('"', ''))).toBe(font);
    const text = PNG.sync.read(await page.locator('.slgf-letters').screenshot());
    const url = await page.locator('.slgf-backdrop').evaluate(element => (element as HTMLElement).style.maskImage);
    const mask = PNG.sync.read(Buffer.from(url.split(',')[1].replace(/["')]/g, ''), 'base64'));
    let ink = 0, matched = 0;
    for (let y = 0; y < text.height; y++) for (let x = 0; x < text.width; x++) {
      if (text.data[(y * text.width + x) * 4] > 100) continue;
      ink++;
      let covered = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const px = x + dx, py = y + dy;
        if (px >= 0 && py >= 0 && px < mask.width && py < mask.height && mask.data[(py * mask.width + px) * 4 + 3] > 100) covered = true;
      }
      if (covered) matched++;
    }
    expect(ink).toBeGreaterThan(100);
    expect(matched / ink).toBeGreaterThan(.9);
  }
});

test('printing restores solid readable text', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.slgf-backdrop')).toBeHidden();
  const color = await page.locator('.slgf-letters').evaluate(element => getComputedStyle(element).color);
  expect(color).not.toBe('rgba(0, 0, 0, 0)');
});
