import React from 'react';
import { alignmentError } from './alignment';
import { createRoot } from 'react-dom/client';
import { LiquidGlass } from '../../dist/index.esm.js';
const root=createRoot(document.getElementById('panels')!);
const strength=document.getElementById('strength') as HTMLInputElement;
const multiple=document.getElementById('multiple') as HTMLInputElement;
const status=document.getElementById('status')!;
const source=document.getElementById('scene')!;
function render(){
 const width=document.getElementById('stage')!.clientWidth;
 const columns=width<600?2:3;
 const w=multiple.checked?(width-42)/columns:Math.min(360,width-40);
 root.render(<>{Array.from({length:multiple.checked?6:1},(_,i)=><div className="panel" key={i} style={{left:20+(i%columns)*(w+8),top:50+Math.floor(i/columns)*175,width:w,height:150}}><LiquidGlass backdropSelector="#scene" mobileFallback="css-only" mirrorScale={Number(strength.value)} radius={multiple.checked?10+i*8:38} track><div className="content">Lens {i+1}</div></LiquidGlass></div>)}</>);
}
strength.addEventListener('input',render);multiple.addEventListener('change',render);window.addEventListener('resize',render);render();
document.getElementById('run')!.addEventListener('click',async()=>{
 status.textContent='Measuring 120 frame callbacks…';
 const animation=source.animate([{transform:'translate(0,0)'},{transform:'translate(36px,24px)'},{transform:'translate(0,0)'}],{duration:2000,fill:'forwards'});
 const times:number[]=[];let last=performance.now();
 await new Promise<void>(resolve=>{const tick=(t:number)=>{times.push(t-last);last=t;times.length<120?requestAnimationFrame(tick):resolve();};requestAnimationFrame(tick);});
 await animation.finished;await new Promise(resolve=>setTimeout(resolve,80));
 const sr=source.getBoundingClientRect();const clones=Array.from(document.querySelectorAll('#panels [inert]'));const samples=times.slice(1).sort((a,b)=>a-b);
 const result={revision:'css-rim-v3',userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,panels:clones.length,cssLensCount:document.querySelectorAll('[data-liquid-glass-mirror="css"]').length,mapCount:document.querySelectorAll('#panels feImage[href^="data:image/png"]').length,medianFrameIntervalMs:samples[Math.floor(samples.length*.5)],p95FrameIntervalMs:samples[Math.floor(samples.length*.95)],maxAlignmentErrorPx:alignmentError({sourceSelector:'#scene',cloneSelector:'#panels [inert]'}),at:new Date().toISOString()};
 status.textContent=JSON.stringify(result,null,2);
 await fetch('/__lab/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)}).catch(()=>{});
});
if(new URLSearchParams(location.search).has('run')){multiple.checked=true;render();setTimeout(()=>document.getElementById('run')!.click(),1000);}
