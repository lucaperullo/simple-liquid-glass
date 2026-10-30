import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

// Words draw into a shared scene canvas by default, or their own canvas with webglScene="off".
const GLASS = 'canvas[data-liquid-glass-scene], canvas[data-liquid-glass-webgl]';

test('WebGL stays inside glyphs and tracks nested scrolling', async ({ page }) => {
  await page.goto('/?renderer=webgl');
  await page.getByRole('button', { name: 'Scroll content', exact: true }).click();
  const layout = page.locator('.slgf-layout');
  await expect(layout).toHaveAttribute('data-renderer', 'webgl');
  await page.getByLabel('Refraction', { exact: true }).fill('0'); await page.waitForTimeout(100);
  const bounds = await layout.evaluate(el => {const r=el.getBoundingClientRect(),s=el.closest('.scene')!.getBoundingClientRect();return {x:r.x-s.x,y:r.y-s.y,w:r.width,h:r.height};});
  const url = await page.locator('.slgf-tint').evaluate(el=>(el as HTMLElement).style.maskImage);
  const mask = PNG.sync.read(Buffer.from(url.split(',')[1].replace(/["')]/g,''),'base64'));
  const before=PNG.sync.read(await page.locator('.scene').screenshot());
  await page.getByLabel('Refraction', { exact: true }).fill('88');await page.waitForTimeout(150);
  const after=PNG.sync.read(await page.locator('.scene').screenshot());
  let inside=0,outside=0;
  for(let y=0;y<before.height;y++)for(let x=0;x<before.width;x++){
    const i=(y*before.width+x)*4;
    const delta=Math.abs(before.data[i]-after.data[i])+Math.abs(before.data[i+1]-after.data[i+1])+Math.abs(before.data[i+2]-after.data[i+2]);
    if(delta<15)continue;
    const mx=Math.floor((x-bounds.x)/bounds.w*mask.width),my=Math.floor((y-bounds.y)/bounds.h*mask.height);
    let glyph=false;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const px=mx+dx,py=my+dy;if(px>=0&&py>=0&&px<mask.width&&py<mask.height&&mask.data[(py*mask.width+px)*4+3]>0)glyph=true;}
    if(glyph)inside++;else outside++;
  }
  expect(inside).toBeGreaterThan(100);expect(outside).toBeLessThan(8);
  const hash=()=>page.locator(GLASS).first().evaluate(c=>{const canvas=c as HTMLCanvasElement,gl=canvas.getContext('webgl')!,p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p.reduce((h,v)=>(h*31+v)>>>0,0);});
  const first=await hash();await page.locator('.scene-scroll').evaluate(el=>el.scrollTop=600);await expect.poll(hash).not.toBe(first);
  const selected=await page.locator('.slgf-letters').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection()!;s.removeAllRanges();s.addRange(r);return s.toString();});expect(selected).toBe('Liquid.');
});

test('iPhone auto WebGL video updates', async ({ page }) => {
  await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'}));
  await page.goto('/');await expect(page.locator('.slgf-layout')).toHaveAttribute('data-renderer','webgl');
  const hash=()=>page.locator(GLASS).first().evaluate(c=>{const canvas=c as HTMLCanvasElement,gl=canvas.getContext('webgl')!,p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p.reduce((h,v)=>(h*31+v)>>>0,0);});
  const first=await hash();await expect.poll(hash).not.toBe(first);
});

test('WebGL tint is above the image and accessibility mode releases the canvas', async ({ page }) => {
  await page.goto('/?renderer=webgl');
  await expect(page.locator('.slgf-layout')).toHaveAttribute('data-renderer','webgl');
  const tint=page.locator('.slgf-tint');
  await expect(tint).toBeVisible();
  // The shared canvas paints before the word, so the tint (inside the word) is above it.
  await expect(page.locator('.slgf-layout')).toHaveAttribute('data-glass-composition','scene');
  expect(await page.locator('canvas[data-liquid-glass-scene]').evaluate(canvas=>!!(canvas.compareDocumentPosition(document.querySelector('.slgf-layout')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.emulateMedia({ forcedColors:'active' });
  await expect(page.locator(GLASS)).toHaveCount(0);
  await expect(page.locator('.slgf-backdrop')).toBeHidden();
  await page.emulateMedia({ forcedColors:'none' });
  await expect(page.locator('.slgf-layout')).toHaveAttribute('data-renderer','webgl');
});

test('the default renderer is WebGL wherever SVG backdrop filters are unsupported', async ({ page, browserName }) => {
  await page.goto('/');
  await expect(page.locator('.slgf-layout')).toHaveAttribute('data-renderer', browserName === 'chromium' ? 'native' : 'webgl');
});

test('webglScene="off" draws the word into its own canvas, under the tint', async ({ page }) => {
  await page.goto('/?renderer=webgl&scene=off');
  await expect(page.locator('.slgf-layout')).toHaveAttribute('data-renderer','webgl');
  await expect(page.locator('canvas[data-liquid-glass-scene]')).toHaveCount(0);
  expect(await page.locator('.slgf-tint').evaluate(el=>el.previousElementSibling?.querySelector('canvas')!==null)).toBe(true);
});

test('on Chromium a crowd of words moves from SVG to one shared WebGL canvas', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  const kinds = () => page.locator('.slgf-layout').evaluateAll(els => [...new Set(els.map(el => (el as HTMLElement).dataset.renderer))]);
  await page.goto('/tests/browser/crowd.html?words=6');
  await expect.poll(kinds).toEqual(['native']);
  await page.goto('/tests/browser/crowd.html?words=20');
  await expect.poll(kinds).toEqual(['webgl']);
  await expect(page.locator('canvas[data-liquid-glass-scene]')).toHaveCount(1);
  await expect(page.locator('canvas[data-liquid-glass-webgl]')).toHaveCount(0);
  await page.goto('/tests/browser/crowd.html?words=20&scene=off');
  await expect.poll(kinds).toEqual(['native']);
});

test('reveal types characters in behind a soft edge, without rebuilding the lens', async ({ page, browserName }) => {
  await page.goto('/tests/browser/crowd.html?words=1&reveal=2');
  const layout = page.locator('.slgf-layout');
  await expect(layout).toHaveAttribute('data-ready', 'true');
  const width = (await layout.boundingBox())!.width;
  const mask = await page.locator('.slgf-letters').evaluate(el => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
  const [solid, clear] = [...mask.matchAll(/([\d.]+)px/g)].map(match => Number(match[1]));
  // "Wo" of "Word 1": the soft edge ends inside the word, half an em after it turns solid.
  expect(clear).toBeGreaterThan(width * .1);
  expect(clear).toBeLessThan(width * .6);
  expect(clear - solid).toBeGreaterThan(10);
  if (browserName === 'chromium') {
    const map = await page.locator('feImage[result="rawMap"]').getAttribute('href');
    expect(Number(await page.locator('feFlood').getAttribute('width'))).toBeLessThan(width);
    await page.goto('/tests/browser/crowd.html?words=1');
    await expect(layout).toHaveAttribute('data-ready', 'true');
    expect(await page.locator('feImage[result="rawMap"]').getAttribute('href')).toBe(map);
  }
});
