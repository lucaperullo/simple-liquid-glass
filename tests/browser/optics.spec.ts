import { test, expect } from '@playwright/test';
test('native lens map is stable during scrolling and strength changes', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native backdrop refraction targets Chromium');
  await page.goto('/tests/browser/optics.html');
  const lens = page.getByTestId('lens');
  const classic = page.getByTestId('classic');
  await expect.poll(async () => Number(await classic.locator('feDisplacementMap').first().getAttribute('scale'))).toBeLessThan(20);
  await expect.poll(() => lens.locator('feImage').getAttribute('href')).toContain('data:image/png');
  const map = await lens.locator('feImage').getAttribute('href');
  const image = await lens.screenshot();
  await page.getByLabel('Lens strength').fill('0');
  expect(image.equals(await lens.screenshot())).toBe(false);
  expect(await lens.locator('feImage').getAttribute('href')).toBe(map);
  await page.getByLabel('Color').fill('0');
  await expect(lens.locator('feDisplacementMap')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 450));
  expect(await lens.locator('feImage').getAttribute('href')).toBe(map);
  await expect(page.locator('canvas')).toHaveCount(0);
});
