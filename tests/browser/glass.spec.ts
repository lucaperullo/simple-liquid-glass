import { test, expect } from '@playwright/test';
import { alignmentError as measureAlignment } from './alignment';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToString } = require('react-dom/server');
const { LiquidGlass } = require('../../dist/index.cjs');

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
  } else {
    await expect(page.locator('#root [inert]')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('mirror updates, isolates IDs and releases its clone on unmount', async ({ page }, testInfo) => {
  await page.goto('/tests/browser/?mirror');
  await expect(page.locator('#root [inert]')).toHaveCount(1);
  await expect(page.locator('#original')).toHaveCount(1);
  await page.locator('#original').evaluate(el => { el.textContent = 'Changed'; });
  await expect(page.locator('#root [inert]')).toContainText('Changed');
  await page.screenshot({ path: testInfo.outputPath('mirror.png') });
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

test('mirror chooses bounded optics for its browser', async ({ page, browserName }, testInfo) => {
  await page.goto('/tests/browser/?mirror');
  await expect(page.locator('#root [inert]')).toHaveCount(1);
  if (browserName === 'webkit') {
    await expect(page.locator('[data-liquid-glass-mirror="css"]')).toHaveCount(1);
    await expect(page.locator('#root feDisplacementMap')).toHaveCount(0);
  } else {
    await expect(page.locator('#root filter feImage')).toHaveAttribute('href', /^data:image\/png/);
    const scale = Number(await page.locator('#root feDisplacementMap').getAttribute('scale'));
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThanOrEqual(16);
  }
  await expect(page.locator('#root feTurbulence')).toHaveCount(0);
  await expect(page.locator('#root feGaussianBlur')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('lens.png') });
});

test('mirror follows scrolling and translated source without double translation', async ({ page }) => {
  await page.goto('/tests/browser/?mirror&track');
  await expect(page.locator('#root [inert]')).toHaveCount(1);
  await page.evaluate(() => {
    document.body.style.height = '2000px';
    document.getElementById('root')!.style.position = 'fixed';
    window.scrollTo(0, 120);
  });
  const alignmentError = () => page.evaluate(measureAlignment, {sourceSelector:'#backdrop', cloneSelector:'#root [inert]'});
  await expect.poll(alignmentError).toBeLessThan(1);
  await page.locator('#backdrop').evaluate(el => { el.style.transform = 'translate(45px, 30px)'; });
  await expect.poll(alignmentError).toBeLessThan(1);
});

test('six lenses track animated translation, keep unique filters, and release copies', async ({ page, browserName }, testInfo) => {
  await page.goto('/tests/browser/?mirror&track&panels=6');
  await expect(page.locator('#root [inert]')).toHaveCount(6);
  const ids = await page.locator('#root filter').evaluateAll(elements => elements.map(el => el.id));
  expect(new Set(ids).size).toBe(browserName === 'webkit' ? 0 : 6);
  if (browserName === 'webkit') await expect(page.locator('[data-liquid-glass-mirror="css"]')).toHaveCount(6);
  const timing = await page.evaluate(async () => {
    const source = document.getElementById('backdrop')!;
    const animation = source.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(40px)' }], { duration: 600, fill: 'forwards' });
    const intervals: number[] = [];
    let previous = performance.now();
    await new Promise<void>(resolve => {
      const frame = (time: number) => {
        intervals.push(time - previous); previous = time;
        if (intervals.length < 45) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
    await animation.finished;
    return intervals.slice(1).sort((a, b) => a - b);
  });
  await expect.poll(() => page.evaluate(measureAlignment, {sourceSelector:'#backdrop',cloneSelector:'#root [inert]'})).toBeLessThan(1);
  await testInfo.attach('frame-intervals.json', { body: JSON.stringify({ medianMs: timing[Math.floor(timing.length / 2)], p95Ms: timing[Math.floor(timing.length * .95)], samples: timing.length }), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('six-lenses.png') });
  await page.evaluate(() => (window as any).unmountGlass());
  await expect(page.locator('#root [inert]')).toHaveCount(0);
});
