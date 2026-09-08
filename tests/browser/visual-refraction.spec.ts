import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
test.use({deviceScaleFactor:3});

test('each of six ID-styled lenses refracts pixels while leaving its center clear', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 1000 });
  await page.goto('/tests/browser/safari.html');
  await page.locator('#multiple').check();
  await expect(page.locator('.panel [inert]')).toHaveCount(6);
  const setStrength = async (value: string) => {
    await page.locator('#strength').evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await setStrength('0');
  const panels = page.locator('.panel');
  const before = [];
  for (let i = 0; i < 6; i++) before.push(PNG.sync.read(await panels.nth(i).screenshot()));
  await setStrength('26');
  const measurements = [];
  for (let i = 0; i < 6; i++) {
    const buffer = await panels.nth(i).screenshot({ path: testInfo.outputPath(`lens-${i+1}.png`) });
    await testInfo.attach(`lens-${i+1}.png`, { body: buffer, contentType: 'image/png' });
    const after = PNG.sync.read(buffer), original = before[i];
    let changed = 0, centerChanged = 0, centerPixels = 0;
    for (let y = 0; y < after.height; y++) for (let x = 0; x < after.width; x++) {
      const offset = (y * after.width + x) * 4;
      const delta = Math.max(...[0,1,2].map(c => Math.abs(after.data[offset+c] - original.data[offset+c])));
      if (delta > 12) changed++;
      if (x > after.width*.35 && x < after.width*.65 && y > after.height*.35 && y < after.height*.65) {
        centerPixels++; if (delta > 12) centerChanged++;
      }
    }
    measurements.push({lens:i+1,changed,centerChanged,centerPixels});
    expect(changed, `Lens ${i+1} must visibly refract the scene`).toBeGreaterThan(150);
    expect(centerChanged / centerPixels, `Lens ${i+1} center must stay stable`).toBeLessThan(.02);
  }
  await testInfo.attach('pixel-measurements.json', { body: JSON.stringify(measurements), contentType:'application/json' });
});

test('Safari uses CSS rim optics without SVG displacement', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit');
  await page.goto('/tests/browser/safari.html');
  await page.locator('#multiple').check();
  await expect(page.locator('[data-liquid-glass-mirror="css"]')).toHaveCount(6);
  await expect(page.locator('feDisplacementMap')).toHaveCount(0);
  for (const lens of await page.locator('[data-liquid-glass-mirror="css"]').all()) {
    expect(await lens.evaluate(el => getComputedStyle(el).webkitMaskImage)).toContain('data:image/png');
  }
});
