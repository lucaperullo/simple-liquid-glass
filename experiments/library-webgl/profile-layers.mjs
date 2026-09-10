import {webkit} from 'playwright';
import fs from 'node:fs/promises';
const b=await webkit.launch();try{
const p=await b.newPage({viewport:{width:393,height:852},deviceScaleFactor:3,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
await p.addInitScript(()=>{
 window.metrics={resizes:0,copies:0,uploads:0,draws:0,frames:0};window.measuring=false;
 for(const key of ['width','height']){const d=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key);Object.defineProperty(HTMLCanvasElement.prototype,key,{...d,set(v){if(window.measuring)window.metrics.resizes++;d.set.call(this,v)}})}
 const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(window.measuring)window.metrics.copies++;return draw.apply(this,args)};
 for(const [key,counter] of [['texImage2D','uploads'],['drawArrays','draws']]){const f=WebGLRenderingContext.prototype[key];WebGLRenderingContext.prototype[key]=function(...args){if(window.measuring)window.metrics[counter]++;return f.apply(this,args)}}
 const frame=()=>{if(window.measuring)window.metrics.frames++;requestAnimationFrame(frame)};requestAnimationFrame(frame);
});
await p.goto(process.env.GLASS_URL??'http://127.0.0.1:4305/');await p.waitForFunction(()=>document.querySelector('.journey-dock')?.dataset.backdropReady==='true');
await p.locator('#listen').evaluate(el=>scrollTo(0,el.getBoundingClientRect().top+scrollY+200));await p.waitForTimeout(3500);
await p.evaluate(()=>{window.videoFrames=0;const video=document.querySelector('#listen-backdrop');const count=()=>{if(window.measuring)window.videoFrames++;video.requestVideoFrameCallback(count)};video.requestVideoFrameCallback(count);window.measuring=true});await p.waitForTimeout(3000);const result=await p.evaluate(()=>{window.measuring=false;return {...window.metrics,videoFrames:window.videoFrames,contexts:document.querySelectorAll('[data-liquid-glass-webgl]').length,captures:document.querySelector('[data-liquid-glass-scene]')?.dataset.liquidGlassCaptures??document.querySelector('[data-page-backdrop]')?.dataset.captures}});console.log(result);if(process.env.GLASS_REPORT)await fs.writeFile(process.env.GLASS_REPORT,JSON.stringify(result));
}finally{await b.close()}
