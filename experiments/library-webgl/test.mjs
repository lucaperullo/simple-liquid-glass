import {chromium, webkit} from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const base = process.env.LIQUID_GLASS_TEST_URL ?? 'http://127.0.0.1:4295';
const server = process.env.LIQUID_GLASS_TEST_URL ? undefined : spawn(process.execPath,
 ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4295', '--strictPort'], { stdio: 'ignore' });
try {
 if(server) {
  let started = false;
  for(let i=0;i<100;i++) {
   if(server.exitCode !== null) throw new Error('WebGL test server failed to start');
   try { if((await fetch(`${base}/experiments/library-webgl/`)).ok) { started = true; break; } } catch {}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!started) throw new Error('WebGL test server timed out');
 }
for (const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch();
 try {
  for (const scene of ['static','video']) {
   const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2});
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')console.log(name,m.text());});
   await page.goto(`${base}/experiments/library-webgl/?renderer=webgl&scene=${scene}`);
   await page.waitForFunction(()=>document.querySelector('#library-glass')?.dataset.glassStrategy==='webgl');
   await page.waitForFunction(()=>document.querySelector('#second-glass')?.dataset.glassStrategy==='webgl');
   const pixels=()=>page.evaluate(()=>{const canvas=document.querySelector('#library-glass canvas'),gl=canvas.getContext('webgl');const p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);let hash=0,count=0;for(let i=0;i<p.length;i+=4){hash=(hash*31+p[i]+p[i+1]+p[i+2])>>>0;if(p[i+3])count++;}return {hash,count};});
   const first=await pixels();assert.ok(first.count>100);
   if(scene==='static'){
    await page.evaluate(()=>scrollTo(0,550));await page.waitForTimeout(100);assert.notEqual((await pixels()).hash,first.hash);
    await page.locator('#mutate').click();await page.waitForTimeout(600);const changed=await pixels();
    assert.notEqual(changed.hash,first.hash);
    await page.evaluate(()=>window.libraryLab.glass.current.refreshBackdrop());
   }else{
    await page.waitForTimeout(500);assert.notEqual((await pixels()).hash,first.hash);
    await page.evaluate(()=>window.libraryLab.video.current.pause());await page.waitForTimeout(100);const paused=await pixels();await page.waitForTimeout(200);assert.deepEqual(await pixels(),paused);
   }
   await page.locator('#library-glass button').first().click();assert.equal(await page.locator('#library-glass button').first().textContent(),'Clicked');
   await page.locator('#toggle').click();assert.equal(await page.locator('canvas[data-liquid-glass-webgl]').count(),0);
   await page.locator('#toggle').click();await page.waitForFunction(()=>document.querySelector('#library-glass')?.dataset.glassStrategy==='webgl');
   assert.deepEqual(errors,[]);console.log(name,scene,'passed');await page.close();
  }
  const many=await browser.newPage({viewport:{width:393,height:852}});
  const warnings=[];many.on('console',m=>{if(/too many active webgl|context lost/i.test(m.text()))warnings.push(m.text());});
  await many.goto(`${base}/experiments/library-webgl/?renderer=webgl&many=1`);
  await many.waitForFunction(()=>document.querySelector('#library-glass')?.dataset.glassStrategy==='webgl');
  assert.equal(await many.locator('.offscreen-glass canvas').count(),0);
  assert.deepEqual(warnings,[]);await many.close();console.log(name,'offscreen startup allocation passed');
  const ios=await browser.newPage({viewport:{width:393,height:852},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  await ios.goto(`${base}/experiments/library-webgl/`);await ios.waitForFunction(()=>document.querySelector('#library-glass')?.dataset.glassReason==='ios-webgl');await ios.close();console.log(name,'iOS auto passed');
 } finally {await browser.close();}
}
// Reuse the actual package canvas for coordinate, lifecycle, and fallback checks.
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch();
 try {
 const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2});
 await page.goto(`${base}/experiments/library-webgl/?renderer=webgl`);
 await page.waitForFunction(()=>document.querySelector('#library-glass')?.dataset.glassStrategy==='webgl');
 const settle=()=>page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
 for(const edge of ['top','bottom']){
  await page.evaluate(edge=>scrollTo(0,edge==='top'?0:document.documentElement.scrollHeight-innerHeight),edge);await settle();
  for(const offset of (edge==='top'?[35,100,55]:[-35,-100,-55])){
   await page.evaluate(offset=>{window.libraryLab.source.current.style.transform=`translateY(${offset}px)`;},offset);await settle();
   await page.evaluate(()=>{const c=document.querySelector('#library-glass canvas'),gl=c.getContext('webgl');window.reference=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,window.reference);window.libraryLab.source.current.style.transform='';});await settle();
   await page.evaluate(offset=>{const original=Element.prototype.getBoundingClientRect,descriptor=Object.getOwnPropertyDescriptor(window,'scrollY'),base=scrollY;window.libraryLab.source.current.style.transform=`translateY(${offset}px)`;Object.defineProperty(window,'scrollY',{configurable:true,get:()=>base-offset});Element.prototype.getBoundingClientRect=function(){const r=original.call(this);return getComputedStyle(this).position==='fixed'?new DOMRect(r.x,r.y+offset,r.width,r.height):r;};window.restoreElastic=()=>{Element.prototype.getBoundingClientRect=original;if(descriptor)Object.defineProperty(window,'scrollY',descriptor);else delete window.scrollY;window.libraryLab.source.current.style.transform='';};},offset);await settle();
   const error=await page.evaluate(()=>{const c=document.querySelector('#library-glass canvas'),gl=c.getContext('webgl'),p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p.reduce((sum,v,i)=>sum+Math.abs(v-window.reference[i]),0)/p.length;});assert.ok(error<.1,`${name} ${edge} overscroll pixels ${error}`);await page.evaluate(()=>window.restoreElastic());await settle();
  }
 }
 await page.evaluate(async()=>{const c=document.querySelector('#library-glass canvas'),gl=c.getContext('webgl'),ext=gl.getExtension('WEBGL_lose_context');window.restoreGL=()=>ext.restoreContext();await new Promise(resolve=>{c.addEventListener('webglcontextlost',resolve,{once:true});ext.loseContext();});});
 await page.waitForFunction(()=>document.querySelector('#library-glass')?.dataset.glassReason==='webgl-unavailable');
 await page.evaluate(()=>window.restoreGL());await page.waitForFunction(()=>document.querySelector('#library-glass')?.dataset.glassStrategy==='webgl');
 await page.evaluate(()=>{const el=document.createElement('liquid-glass');el.id='custom-glass';el.setAttribute('renderer','webgl');el.setAttribute('backdrop-selector','#library-source');el.style.cssText='position:fixed;top:380px;left:20px;width:240px;height:72px';document.body.append(el);});await page.waitForFunction(()=>document.querySelector('#custom-glass')?.dataset.glassStrategy==='webgl');
 await page.evaluate(()=>document.querySelector('#custom-glass').remove());
 await page.close();
 const unavailable=await browser.newPage();await unavailable.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};});
 await unavailable.goto(`${base}/experiments/library-webgl/?renderer=webgl`);await unavailable.waitForFunction(()=>document.querySelector('#library-glass')?.dataset.glassReason==='webgl-unavailable');assert.equal(await unavailable.locator('[data-liquid-glass-webgl]').count(),0);await unavailable.close();
 console.log(name,'overscroll, context recovery, custom element, unavailable fallback passed');
 }finally{await browser.close();}
}


for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch();
 try {
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2});
  await page.goto(`${base}/experiments/library-webgl/?renderer=svg`);
  const results=await page.evaluate(async()=>{
   const {createWebGLEngine}=await import('/src/core/webgl/runtime.ts');
   const settle=()=>new Promise(resolve=>setTimeout(resolve,100));
   const until=async(check)=>{for(let i=0;i<100&&!check();i++)await new Promise(r=>setTimeout(r,20));if(!check())throw new Error('Engine status timed out');};
   const source=document.createElement('canvas');source.width=160;source.height=160;
   source.style.cssText='position:fixed;top:0;left:0;width:160px;height:160px';document.body.append(source);
   const panel=document.createElement('div');panel.style.cssText=source.style.cssText;document.body.append(panel);
   const map=document.createElement('canvas');map.width=2;map.height=2;const mapCtx=map.getContext('2d');mapCtx.fillStyle='rgb(128,128,128)';mapCtx.fillRect(0,0,2,2);
   const options={map:map.toDataURL(),scale:0,dispersion:0,specular:0,classic:false,radius:0,blur:0,saturation:100};
   let status='pending';const engine=createWebGLEngine(panel,panel,source,options,next=>status=next);
   await until(()=>status==='active');
   const c=panel.querySelector('canvas'),gl=c.getContext('webgl');
   const center=new Uint8Array(4);gl.readPixels(c.width/2,c.height/2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,center);
   const transparent=center[3]===0;
   const upload=gl.texImage2D.bind(gl);gl.texImage2D=()=>{throw new Error('transient upload failure');};
   await until(()=>status==='capture-failed');gl.texImage2D=upload;await engine.refresh();await until(()=>status==='active');
   engine.destroy();source.remove();panel.remove();
   const html=document.createElement('div');html.style.cssText='position:fixed;top:0;left:0;width:160px;height:160px;background:#fde39a;font:22px Arial;transform-origin:0 0';html.textContent='A line that wraps onto several lines of text.';document.body.append(html);
   const lens=document.createElement('div');lens.style.cssText='position:fixed;top:0;left:0;width:160px;height:160px;transform-origin:0 0';document.body.append(lens);
   status='pending';const htmlEngine=createWebGLEngine(lens,lens,html,options,next=>status=next);await until(()=>status==='active');
   const output=lens.querySelector('canvas'),g=output.getContext('webgl');
   const read=()=>{const p=new Uint8Array(output.width*output.height*4);g.readPixels(0,0,output.width,output.height,g.RGBA,g.UNSIGNED_BYTE,p);return p;};
   const normal=read();html.style.transform='scale(.5)';lens.style.transform='scale(.5)';await htmlEngine.refresh();await settle();
   const scaled=read();let error=0;for(let i=0;i<normal.length;i++)error+=Math.abs(normal[i]-scaled[i]);error/=normal.length;
   htmlEngine.destroy();lens.remove();
   const {acquireSource}=await import('/src/core/webgl/source.ts');let captures=0;
   const shared=acquireSource(html,()=>captures++);await shared.refresh();await new Promise(resolve=>setTimeout(resolve,180));
   const before=captures;
   for(let i=0;i<14;i++){html.textContent=`Streaming ${i}`;await new Promise(resolve=>setTimeout(resolve,40));}
   const refreshedDuringStream=captures>before;shared.release();html.remove();
   return {transparent,recovered:status==='active',scaledError:error,refreshedDuringStream};
  });
  assert.equal(results.refreshedDuringStream,true);assert.equal(results.transparent,true);assert.equal(results.recovered,true);assert.ok(results.scaledError<1,`${name} scaled capture ${results.scaledError}`);
  console.log(name,'transparent source, transient retry, scaled HTML',results);
 }finally{await browser.close();}
}

} finally { server?.kill(); }
