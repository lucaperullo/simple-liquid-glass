import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToString } = require('react-dom/server');
const { LiquidGlass } = require('../../dist/index.cjs');

// Headless CI browsers may lack WebGL; the library then reports the documented blur fallback.
const webglAvailable = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));

test('hydrates production build without hydration errors or lost content', async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const html = renderToString(React.createElement(LiquidGlass, { backdropSelector: '#backdrop', autoTextColor: true, forceTextColor: true, effectMode: 'auto' }, React.createElement('button', { id: 'content' }, 'Glass content')));
  await page.addInitScript(html => { (window as any).__SSR__ = html; }, html);
  await page.goto('/tests/browser/');
  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('#root [data-liquid-glass]')).toHaveCount(1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (browserName === 'chromium') {
    await expect(page.locator('.liquid-glass-filter')).toHaveCount(1);
  } else if (await webglAvailable(page)) {
    await expect(page.locator('#root canvas[data-liquid-glass-webgl]')).toHaveCount(1);
  } else {
    await expect(page.locator('#root [data-liquid-glass]')).toHaveAttribute('data-glass-reason', 'webgl-unavailable');
  }
  expect(errors).toEqual([]);
});

test('engines without SVG backdrop filters refract through WebGL and release it on unmount', async ({ page, browserName }) => {
  test.skip(browserName === 'chromium');
  await page.goto('/tests/browser/');
  const glass = page.locator('#root [data-liquid-glass]');
  if (await webglAvailable(page)) {
    await expect(page.locator('#root canvas[data-liquid-glass-webgl]')).toHaveCount(1);
    await expect(glass).toHaveAttribute('data-glass-strategy', 'webgl');
  } else {
    await expect(glass).toHaveAttribute('data-glass-reason', 'webgl-unavailable');
  }
  await expect(page.locator('#root [data-liquid-glass-mirror]')).toHaveCount(0);
  await page.locator('#content').focus();
  await expect(page.locator('#content')).toBeFocused();
  await page.evaluate(() => (window as any).unmountGlass());
  await expect(page.locator('#root')).toBeEmpty();
});

test('off mode disables refraction; web component accepts content', async ({ page }) => {
  await page.goto('/tests/browser/?effect=off');
  await expect(page.locator('#content')).toBeVisible();
  expect(await page.locator('[data-liquid-glass] > div').first().evaluate(el => getComputedStyle(el).backdropFilter)).toBe('none');
  await page.evaluate(() => {
    const el = document.createElement('liquid-glass'); el.textContent = 'Vanilla content';
    el.style.cssText = 'width:200px;height:100px'; document.body.append(el);
  });
  await expect(page.locator('liquid-glass')).toHaveText('Vanilla content');
});

test('reduced motion keeps interactive glass stationary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tests/browser/?interactive&effect=off');
  await expect(page.locator('#content')).toBeVisible();
  const glass = page.locator('[data-liquid-glass]');
  await glass.hover({ position: { x: 270, y: 140 } });
  expect(await glass.evaluate(el => getComputedStyle(el).transform)).toBe('none');
});

test('web component keeps the same shadow across renderers and rerenders', async ({ page }) => {
  await page.goto('/tests/browser/?effect=off');
  await page.evaluate(() => {
    const el = document.createElement('liquid-glass');
    el.style.cssText = 'width:200px;height:100px';
    el.textContent = 'Shadow parity';
    document.body.append(el);
  });
  const host = page.locator('liquid-glass');
  const surface = host.locator('.lg-glass');
  const shadow = 'rgba(0, 0, 0, 0.12) 0px 6px 22px 0px';
  await expect(surface).toHaveCSS('box-shadow', shadow);
  await host.evaluate(el => { el.setAttribute('radius', '24'); el.style.width = '280px'; });
  await expect(surface).toHaveCSS('border-radius', '24px');
  await expect(surface).toHaveCSS('width', '280px');
  await expect(surface).toHaveCSS('box-shadow', shadow);
});

test('diagnostics match the active renderer and explicit modes', async ({page,browserName}) => {
  await page.goto('/tests/browser/');
  const glass=page.locator('#root [data-liquid-glass]');
  const webgl = browserName !== 'chromium' && await webglAvailable(page);
  await expect(glass).toHaveAttribute('data-glass-strategy',browserName==='chromium'?'svg':webgl?'webgl':'blur');
  await expect(glass).toHaveAttribute('data-glass-reason',browserName==='chromium'?'native-svg':webgl?'svg-unsupported':'webgl-unavailable');
  await page.goto('/tests/browser/?effect=off');
  await expect(glass).toHaveAttribute('data-glass-strategy','off');
  await page.goto('/tests/browser/?effect=blur');
  await expect(glass).toHaveAttribute('data-glass-reason','blur-requested');
});
