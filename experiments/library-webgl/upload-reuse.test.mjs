import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:4296,strictPort:true}});await server.listen();
try{for(const [name,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch();try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4296/experiments/library-webgl/');
 const result=await page.evaluate(async()=>{
  const {GlassRenderer}=await import('/src/vendor/ybouane/GlassRenderer.ts');
  const {DEFAULTS}=await import('/src/vendor/ybouane/defaults.ts');
  const renderer=new GlassRenderer(),source=document.createElement('canvas');source.width=160;source.height=100;
  const ctx=source.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,160,100);ctx.fillStyle='blue';ctx.fillRect(15,12,65,40);
  const render=(input,x=0,y=0)=>{renderer.uploadAndBlur(input,x,y,160,100,1);renderer.clear();renderer.renderGlassPanel(DEFAULTS,120,60,1);const gl=renderer.gl,pixels=new Uint8Array(renderer.canvas.width*renderer.canvas.height*4);gl.readPixels(0,0,renderer.canvas.width,renderer.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels};
  const expected=render(source);let resizes=0,copies=0;
  const descriptors=['width','height'].map(key=>[key,Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key)]);
  for(const [key,d] of descriptors)Object.defineProperty(HTMLCanvasElement.prototype,key,{...d,set(value){if(this===renderer.cropCanvas)resizes++;d.set.call(this,value)}});
  const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this===renderer.cropCtx)copies++;return draw.apply(this,args)};
  try{
   for(let i=0;i<5;i++)render(source);
   const direct={resizes,copies};
   const padded=document.createElement('canvas');padded.width=190;padded.height=130;padded.getContext('2d').drawImage(source,11,13);
   const cropped=render(padded,11,13);
   const equal=expected.every((v,i)=>v===cropped[i]);
   // A smaller subsequent source must clear pixels left by the previous crop.
   const small=document.createElement('canvas');small.width=20;small.height=20;
   const cleared=render(small);const blank=document.createElement('canvas');blank.width=160;blank.height=100;
   const blankPixels=render(blank);const clears=cleared.every((v,i)=>v===blankPixels[i]);
   return {direct,equal,clears};
  }finally{CanvasRenderingContext2D.prototype.drawImage=draw;for(const [key,d] of descriptors)Object.defineProperty(HTMLCanvasElement.prototype,key,d);renderer.destroy()}
 });
 assert.deepEqual(result.direct,{resizes:0,copies:0},'Already cropped frames must upload without another canvas reset or copy');
 assert.ok(result.equal,'Direct and cropped uploads must render identical pixels');assert.ok(result.clears,'Reused crop buffer must not retain stale pixels');console.log(name,result);
 }finally{await browser.close()}
}}finally{await server.close()}
