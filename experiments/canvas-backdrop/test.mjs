// G4: a canvas backdrop is uploaded once per context per frame and sampled in place by every panel, with the same
// pixels as the per-panel crop. The crop is forced (for the "before" image) by reporting a texture limit below the
// canvas size, the engine's existing fallback for oversized sources.
import {chromium,webkit,firefox} from 'playwright';
import {PNG} from 'pngjs';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
const port=Number(process.env.LIQUID_GLASS_CANVAS_PORT??4299);
const server=await createServer({logLevel:'error',resolve:{dedupe:['react','react-dom']},server:{host:'127.0.0.1',port,strictPort:true}});await server.listen();
const base=`http://127.0.0.1:${port}/experiments/canvas-backdrop/`;
// Counts uploads of canvas pixels (texImage2D/texSubImage2D from an element) and 2D copies of the backdrop.
const count=()=>{
 window.__uploads=0;window.__crops=0;
 for(const proto of [WebGLRenderingContext.prototype]){
  for(const name of ['texImage2D','texSubImage2D']){const original=proto[name];proto[name]=function(...args){const source=args[args.length-1];if(source&&typeof source==='object'&&!ArrayBuffer.isView(source))window.__uploads++;return original.apply(this,args)}}
 }
 const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(args[0]?.id==='backdrop')window.__crops++;return draw.apply(this,args)};
};
const cropPath=()=>{const get=WebGLRenderingContext.prototype.getParameter;WebGLRenderingContext.prototype.getParameter=function(name){return name===this.MAX_TEXTURE_SIZE?256:get.call(this,name)}};
const frames=(page,k)=>page.evaluate(k=>new Promise(done=>{let i=0;const tick=()=>++i>=k?done():requestAnimationFrame(tick);requestAnimationFrame(tick)}),k);
async function open(browser,query,{crop=false}={}){
 const page=await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(count);if(crop)await page.addInitScript(cropPath);
 await page.goto(base+'?'+query);
 await page.waitForFunction(()=>{const panels=[...document.querySelectorAll('[data-panel]')];return panels.length>0&&panels.every(p=>p.dataset.glassStrategy==='webgl')},null,{timeout:20000});
 await frames(page,10);
 return {page,errors};
}
async function perFrame(page,k=20){
 await page.evaluate(()=>{window.__uploads=0;window.__crops=0});await frames(page,k);
 return page.evaluate(k=>({uploads:window.__uploads/k,crops:window.__crops/k}),k);
}
function diff(a,b){
 const x=PNG.sync.read(a),y=PNG.sync.read(b);assert.equal(x.width,y.width);
 let sum=0,n=0;const hist=new Uint32Array(256);
 for(let i=0;i<x.data.length;i+=4)for(let c=0;c<3;c++){const d=Math.abs(x.data[i+c]-y.data[i+c]);sum+=d;n++;hist[d]++}
 let p=0,acc=0;while(p<255&&(acc+=hist[p])<n*.999)p++;
 return {mean:sum/n,p999:p};
}
const engines=process.env.LIQUID_GLASS_BROWSERS?.split(',')??['chromium','webkit','firefox'];
try{for(const [name,type] of Object.entries({chromium,webkit,firefox}).filter(([name])=>engines.includes(name))){
 const browser=await type.launch();try{
  for(const scene of ['off','auto']){
   // A live canvas: one upload per frame for the context, no per-panel copies.
   const live=await open(browser,`n=5&scene=${scene}`);
   const after=await perFrame(live.page);
   assert.ok(after.uploads<=1.1&&after.uploads>=.5,`${name} scene=${scene}: ${after.uploads} canvas uploads per frame for 5 panels`);
   assert.equal(after.crops,0,`${name} scene=${scene}: panels must not copy the canvas`);
   assert.deepEqual(live.errors,[]);await live.page.close();
   const before=await open(browser,`n=5&scene=${scene}`,{crop:true});
   const cropped=await perFrame(before.page);
   assert.ok(cropped.crops>=4.5,`${name} scene=${scene}: the forced crop path must copy per panel (${cropped.crops})`);
   await before.page.close();
   // Same still canvas, both paths: the in-place sample must match the crop within a small tolerance.
   for(const blur of [0,6]){
    const shots=[];
    for(const crop of [false,true]){const {page,errors}=await open(browser,`n=5&animate=0&scene=${scene}&blur=${blur}`,{crop});await frames(page,5);shots.push(await page.screenshot());assert.deepEqual(errors,[]);await page.close()}
    const d=diff(...shots);
    assert.ok(d.mean<1&&d.p999<=48,`${name} scene=${scene} blur=${blur}: in-place pixels differ from the crop (${JSON.stringify(d)})`);
    console.log(name,`scene=${scene} blur=${blur}`,'uploads/frame',after.uploads,'(crop path',cropped.uploads+')','pixel diff',d);
   }
  }
  // liquidGL optics share the upload too (each panel used to upload its own version).
  const lgl=await open(browser,'n=5&optics=liquidgl&scene=off');const u=await perFrame(lgl.page);
  assert.ok(u.uploads<=1.1,`${name} liquidgl: ${u.uploads} uploads per frame`);await lgl.page.close();
  console.log(name,'liquidgl uploads/frame',u.uploads,'passed');
 }finally{await browser.close()}
}}finally{await server.close()}
