import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

test('WebGL stays inside glyphs and tracks nested scrolling', async ({ page }) => {
  await page.goto('/?renderer=webgl');
  await page.getByRole('button', { name: 'Scroll content', exact: true }).click();
  const layout = page.locator('.slgf-layout');
  await expect(layout).toHaveAttribute('data-renderer', 'webgl');
  await page.getByLabel('Refraction', { exact: true }).fill('0'); await page.waitForTimeout(100);
  const bounds = await layout.evaluate(el => {const r=el.getBoundingClientRect(),s=el.closest('.scene')!.getBoundingClientRect();return {x:r.x-s.x,y:r.y-s.y,w:r.width,h:r.height};});
  const url = await page.locator('.slgf-backdrop').evaluate(el=>(el as HTMLElement).style.maskImage);
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
  const hash=()=>page.locator('canvas[data-liquid-glass-webgl]').evaluate(c=>{const canvas=c as HTMLCanvasElement,gl=canvas.getContext('webgl')!,p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p.reduce((h,v)=>(h*31+v)>>>0,0);});
  const first=await hash();await page.locator('.scene-scroll').evaluate(el=>el.scrollTop=600);await expect.poll(hash).not.toBe(first);
  const selected=await page.locator('.slgf-letters').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection()!;s.removeAllRanges();s.addRange(r);return s.toString();});expect(selected).toBe('Liquid.');
});

test('iPhone auto WebGL video updates', async ({ page }) => {
  await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'}));
  await page.goto('/');await expect(page.locator('.slgf-layout')).toHaveAttribute('data-renderer','webgl');
  const hash=()=>page.locator('canvas[data-liquid-glass-webgl]').evaluate(c=>{const canvas=c as HTMLCanvasElement,gl=canvas.getContext('webgl')!,p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p.reduce((h,v)=>(h*31+v)>>>0,0);});
  const first=await hash();await expect.poll(hash).not.toBe(first);
});

test('WebGL tint is above the image and accessibility mode releases the canvas', async ({ page }) => {
  await page.goto('/?renderer=webgl');
  await expect(page.locator('.slgf-layout')).toHaveAttribute('data-renderer','webgl');
  const tint=page.locator('.slgf-gpu-tint');
  await expect(tint).toBeVisible();
  expect(await tint.evaluate(el=>el.previousElementSibling?.querySelector('canvas')!==null)).toBe(true);
  await page.emulateMedia({ forcedColors:'active' });
  await expect(page.locator('canvas[data-liquid-glass-webgl]')).toHaveCount(0);
  await expect(page.locator('.slgf-backdrop')).toBeHidden();
  await page.emulateMedia({ forcedColors:'none' });
  await expect(page.locator('.slgf-layout')).toHaveAttribute('data-renderer','webgl');
});
