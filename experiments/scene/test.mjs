import {chromium,webkit} from 'playwright';
import {PNG} from 'pngjs';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
const server=await createServer({resolve:{dedupe:['react','react-dom']},server:{host:'127.0.0.1',port:4298,strictPort:true}});await server.listen();
try{for(const [name,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch();try{
  for(const scenario of ['media','flow','background','text','explicit','dynamic']){
   const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(`http://127.0.0.1:4298/experiments/scene/?scenario=${scenario}`);
   await p.waitForFunction(()=>document.querySelector('#scene-dock')?.dataset.glassStrategy==='webgl'&&document.querySelector('#scene-upper')?.dataset.glassStrategy==='webgl');
   await p.waitForTimeout(500);
   if(scenario==='text')await p.waitForFunction(()=>document.querySelector('#scene-text .slgf-layout')?.dataset.renderer==='webgl');
   if(scenario==='explicit'){await p.waitForFunction(()=>document.querySelector('#explicit-glass')?.dataset.glassStrategy==='webgl');assert.equal(await p.locator('#explicit-glass').getAttribute('data-liquid-glass-scene-surface'),null,'Explicit sources do not register with the scene')}
   assert.equal(await p.locator('[data-liquid-glass-backdrop]').count(),scenario==='flow'||scenario==='text'?3:2);
   if(scenario==='media'){
    const captures=await p.locator('#scene').getAttribute('data-liquid-glass-captures');
    assert.ok(Number(captures)>=2&&Number(captures)<=3,'Two surfaces share shell/media captures, allowing one initial layout refresh');
    const colors=await p.evaluate(()=>[...document.querySelectorAll('[data-liquid-glass-backdrop]')].map(c=>Array.from(c.getContext('2d').getImageData(100,Math.floor(c.height/2),1,1).data)));
    await p.evaluate(()=>window.paintScene('#37cb85'));await p.waitForTimeout(100);
    const after=await p.evaluate(()=>[...document.querySelectorAll('[data-liquid-glass-backdrop]')].map(c=>Array.from(c.getContext('2d').getImageData(100,Math.floor(c.height/2),1,1).data)));
    assert.notDeepEqual(colors,after);assert.equal(await p.locator('#scene').getAttribute('data-liquid-glass-captures'),captures,'Changing canvas pixels never recaptures HTML');
   }
   if(scenario==='dynamic'){await p.evaluate(()=>window.setSceneBackground('#f03a22'));await p.waitForTimeout(600)}
   if(scenario==='flow'){await p.evaluate(()=>scrollTo(0,100));await p.waitForTimeout(250)}
   await p.locator('[data-liquid-glass-scene-surface]').evaluateAll(nodes=>nodes.forEach(n=>n.style.opacity='0'));
   const real=PNG.sync.read(await p.screenshot());
   const sample=await p.locator('[data-liquid-glass-backdrop]').first().evaluate(c=>({url:c.toDataURL(),top:c.getBoundingClientRect().top}));
   const image=PNG.sync.read(Buffer.from(sample.url.split(',')[1],'base64'));
   let delta=0,n=0;for(let y=Math.max(0,Math.ceil(sample.top));y<Math.min(844,Math.floor(sample.top+image.height));y++)for(let x=25;x<365;x++){
    const a=(y*390+x)*4,b=(Math.round(y-sample.top)*image.width+x)*4;for(let c=0;c<3;c++){delta+=Math.abs(real.data[a+c]-image.data[b+c]);n++}
   }
   assert.ok(scenario==='explicit'||delta/n<9,`${name} ${scenario} scene pixels differ: ${delta/n}`);
   await p.evaluate(()=>window.setSceneVisible(false));await p.waitForTimeout(150);
   assert.equal(await p.locator('[data-liquid-glass-backdrop]').count(),0,'Last unregister releases shared scene resources');
   await p.evaluate(()=>window.setSceneVisible(true));await p.waitForFunction(()=>document.querySelector('#scene-dock')?.dataset.glassStrategy==='webgl');
   if(scenario==='media'){
    const nested=await p.evaluate(async()=>{
     const {capturePageTile}=await import('/src/backdrop/capture.ts');
     const outer=document.createElement('div'),inner=document.createElement('div');outer.style.cssText='position:relative;width:180px;height:180px';inner.style.cssText='position:absolute;inset:0';
     const a=document.createElement('canvas'),b=document.createElement('canvas');for(const c of [a,b]){c.width=c.height=180;c.style.cssText='width:180px;height:180px';c.getContext('2d').fillRect(0,0,180,180)}
     outer.append(a,inner);inner.append(b);document.body.append(outer);
     const [large,small]=await Promise.all([capturePageTile(outer,''),capturePageTile(inner,'')]);
     const sizes=[large.layers.length,small.layers.length];
     for(const snapshot of [large,small]){snapshot.base.width=0;for(const layer of snapshot.layers)layer.mask.width=0}outer.remove();return sizes;
    });assert.deepEqual(nested,[2,1],'Concurrent nested captures keep independent media markers');
   }
   assert.deepEqual(errors,[]);console.log(name,scenario,'shared cache, pixels and remount passed');await p.close();
  }
 }finally{await browser.close()}
}}finally{await server.close()}
