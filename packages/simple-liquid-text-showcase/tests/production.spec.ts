import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';

const changed=(a:Buffer,b:Buffer)=>{
 const aa=PNG.sync.read(a),bb=PNG.sync.read(b);let n=0;
 for(let i=0;i<aa.data.length;i+=4)if(Math.abs(aa.data[i]-bb.data[i])+Math.abs(aa.data[i+1]-bb.data[i+1])+Math.abs(aa.data[i+2]-bb.data[i+2])>30)n++;
 return n;
};
test('production CSS preserves native text refraction and visibly bends the film',async({page})=>{
 await page.goto('/');
 const hero=page.locator('.journey-hero');
 await expect(hero.locator('.slgf-layout').first()).toHaveAttribute('data-ready','true');
 await expect(hero.locator('.slgf-backdrop').first()).toHaveCSS('backdrop-filter',/url\(/);
 const film=hero.locator('video');
 await expect.poll(()=>film.evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
 await film.evaluate(async v=>{v.pause();if(v.currentTime===2)return;await new Promise<void>(resolve=>{v.addEventListener('seeked',()=>resolve(),{once:true});v.currentTime=2;});});
 const bent=await hero.locator('.slgf-layout').first().screenshot();
 await hero.locator('.slgf-filter feDisplacementMap').evaluateAll(nodes=>nodes.forEach(n=>n.setAttribute('scale','0')));
 const clear=await hero.locator('.slgf-layout').first().screenshot();
 expect(changed(bent,clear)).toBeGreaterThan(200);

});
test('the published studio displaces sharp live content at zero blur',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Scroll content',exact:true}).click();
 const studio=page.locator('.workbench');
 await page.addStyleTag({content:'.scene-scroll{background:repeating-linear-gradient(90deg,#19332c 0 7px,#f8e6a4 7px 14px)!important}.scene-scroll article{visibility:hidden}'});
 await page.getByLabel('Blur',{exact:true}).fill('0');
 await page.getByLabel('Color separation',{exact:true}).fill('0');
 await page.getByLabel('Refraction',{exact:true}).fill('0');
 const plain=await studio.locator('.slgf-layout').screenshot();
 await page.getByLabel('Refraction',{exact:true}).fill('88');
 expect(changed(plain,await studio.locator('.slgf-layout').screenshot())).toBeGreaterThan(500);
});
test('real glass player, movable notes and chapter dock work on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.locator('[data-liquid-glass]')).toHaveCount(4);
 await page.getByRole('button',{name:'Play music',exact:true}).click();
 await expect(page.getByRole('button',{name:'Pause music',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Pause music',exact:true}).click();
 const checkbox=page.getByRole('checkbox',{name:'Take the scenic route'});
 await checkbox.check();await expect(checkbox).toBeChecked();
 const handle=page.getByRole('button',{name:'Move checklist. Drag or use arrow keys; Home resets position.'});
 await handle.focus();const before=await page.locator('.memo-widget').boundingBox();
 await handle.press('ArrowRight');
 const after=await page.locator('.memo-widget').boundingBox();expect(after!.x).toBeGreaterThan(before!.x);
 await handle.press('Home');
 await page.getByRole('navigation',{name:'Experience chapters'}).getByRole('link',{name:'Make'}).click();
 await expect(page).toHaveURL(/#studio$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});


test('the loop stays preloaded while the distant workbench allocates on demand',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.slgf-layout')).toHaveCount(2);
 await page.locator('#type-flow').scrollIntoViewIfNeeded();
 await expect(page.locator('.font-specimen .slgf-layout')).toHaveCount(1);
 expect(await page.locator('.slgf-layout').count()).toBeLessThanOrEqual(2);
 await page.getByRole('button',{name:'DM Mono',exact:true}).click();
 await expect(page.locator('.font-specimen')).toHaveCSS('font-family',/DM Mono/);
 await expect(page.locator('.font-specimen .slgf-layout')).toHaveCount(1);
 await expect(page.locator('.single-loop')).toHaveCount(1);
 const loop=page.locator('.single-loop');
 const start=await loop.evaluate(el=>getComputedStyle(el).transform);
 await expect.poll(()=>loop.evaluate(el=>getComputedStyle(el).transform)).not.toBe(start);
 await page.getByRole('button',{name:'Pause text motion',exact:true}).click();
 await expect(loop).toHaveCSS('animation-play-state','paused');
 await page.locator('.workbench').scrollIntoViewIfNeeded();
 await expect(page.locator('.font-specimen .slgf-layout')).toHaveCount(1);
 await expect(page.locator('.workbench .slgf-layout')).toHaveCount(1);
});

test('hero follows native scroll and honors reduced motion',async({page})=>{
 await page.goto('/');
 const film=page.locator('.journey-hero > video');
 const before=await film.evaluate(el=>getComputedStyle(el).transform);
 await page.evaluate(()=>window.scrollTo(0,300));
 await expect.poll(()=>film.evaluate(el=>getComputedStyle(el).transform)).not.toBe(before);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(film).toHaveCSS('transform',/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
 await expect.poll(()=>page.locator('.journey-wordmark h1').evaluate(el=>el.getAnimations().length)).toBe(0);
});

test('hero matches the original single-line composition',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.journey-wordmark h1')).toHaveText('Liquid text.');
 await expect(page.locator('.journey-wordmark h1')).toHaveCSS('font-weight','400');
 await expect(page.locator('.journey-wordmark')).toHaveCSS('top','110px');
 await expect(page.locator('.journey-portal')).toHaveCSS('width','285px');
 await expect(page.locator('.journey-hero-caption')).toContainText('A living material.');
 await expect(page.locator('.hero-comparison')).toHaveCount(0);
});

test('no plain placeholder is painted and the next lens is ready before scrolling into view',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).plainTextFlashes=[];
  const sample=()=>{
   for(const el of document.querySelectorAll('.dormant-text,.prepared-lens .slgf-layout:not([data-ready="true"])')){
    const rect=el.getBoundingClientRect();
    if(rect.bottom>0&&rect.top<innerHeight&&getComputedStyle(el).visibility!=='hidden') (window as any).plainTextFlashes.push(el.className);
   }
   requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
 });
 await page.goto('/');
 await expect(page.locator('.journey-hero .slgf-layout')).toHaveAttribute('data-ready','true');
 await page.evaluate(()=>{
  const top=document.querySelector('#type-flow')!.getBoundingClientRect().top+scrollY;
  window.scrollTo({top:top-innerHeight-250,behavior:'instant'});
 });
 await expect(page.locator('.font-specimen .slgf-layout')).toHaveAttribute('data-ready','true');
 expect(await page.locator('#type-flow').evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThan(900);
 await expect(page.locator('.single-loop')).toHaveCSS('animation-play-state','paused');
 expect(await page.evaluate(()=>(window as any).plainTextFlashes)).toEqual([]);
});


test('unchanged geometry does not rebuild glyph maps',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).glyphReads=0;
  const read=CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData=function(...args:Parameters<typeof read>){
   if(this.canvas.width>500)(window as any).glyphReads++;
   return read.apply(this,args);
  };
 });
 await page.goto('/');
 await page.evaluate(()=>document.fonts.ready);
 await expect(page.locator('.journey-hero .slgf-layout')).toHaveAttribute('data-ready','true');
 await expect(page.locator('.font-specimen .slgf-layout')).toHaveAttribute('data-ready','true');
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await page.evaluate(()=>{(window as any).glyphReads=0;window.dispatchEvent(new Event('resize'));});
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 expect(await page.evaluate(()=>(window as any).glyphReads)).toBe(0);
 await page.setViewportSize({width:1100,height:900});
 await expect.poll(()=>page.evaluate(()=>(window as any).glyphReads)).toBeGreaterThan(0);
});
