import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:4297,strictPort:true}});await server.listen();
try{for(const [name,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch();try{
 const page=await browser.newPage({viewport:{width:393,height:852}});
 await page.addInitScript(()=>{
  window.callbacks=new Map();let id=0;window.uploads=0;
  HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){const handle=++id;window.callbacks.set(handle,callback);return handle};
  HTMLVideoElement.prototype.cancelVideoFrameCallback=function(handle){window.callbacks.delete(handle)};
  const upload=WebGLRenderingContext.prototype.texImage2D;WebGLRenderingContext.prototype.texImage2D=function(...args){window.uploads++;return upload.apply(this,args)};
 });
 await page.goto('http://127.0.0.1:4297/experiments/library-webgl/?renderer=webgl&scene=video');
 await page.waitForFunction(()=>document.querySelector('#second-glass')?.dataset.glassStrategy==='webgl');
 await page.evaluate(()=>{const v=window.libraryLab.video.current;v.pause();v.style.position='absolute';v.style.top='0';let time=v.currentTime;Object.defineProperty(v,'currentTime',{configurable:true,get:()=>time+=.001})});
 await page.waitForTimeout(150);await page.evaluate(()=>window.uploads=0);await page.waitForTimeout(180);
 assert.equal(await page.evaluate(()=>window.uploads),0,'Playback clock changes without a presented frame must not re-upload video');
 await page.evaluate(()=>{for(const [id,callback] of [...window.callbacks]){window.callbacks.delete(id);callback(performance.now(),{})}});
 await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.uploads),2,'One new video frame updates both visible glass surfaces once');
 await page.evaluate(()=>{window.uploads=0;scrollTo(0,100)});await page.waitForTimeout(100);
 assert.ok(await page.evaluate(()=>window.uploads)>=2,'Scroll geometry must still redraw between video frames');
 await page.locator('#toggle').click();assert.equal(await page.evaluate(()=>window.callbacks.size),0,'Unmount cancels pending video callbacks');console.log(name,'video cadence, scroll and cleanup passed');
 }finally{await browser.close()}
}}finally{await server.close()}
