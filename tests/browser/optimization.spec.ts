import {test} from '@playwright/test';
import assert from 'node:assert/strict';
declare const lab:any;
declare global {interface Window {contexts:any[]}}
function run(name:string,fn:(page:any)=>Promise<unknown>){
 test(name,async({page,browserName})=>{
  // The shared context lives on an OffscreenCanvas when bitmap transfer is available.
  await page.addInitScript(()=>{window.contexts=[];for(const proto of [HTMLCanvasElement.prototype,typeof OffscreenCanvas==='undefined'?undefined:OffscreenCanvas.prototype]){if(!proto)continue;const get=proto.getContext;(proto as any).getContext=function(type:string,...args:any[]){const c=(get as any).call(this,type,...args);if(type==='webgl'&&c&&!window.contexts.some(x=>x.deref()===c))window.contexts.push(new WeakRef(c));return c}}});
  await page.goto('/tests/browser/optimization.html');await page.waitForFunction(()=>!!(window as any).lab);
  if(name.startsWith('alpha')||name.startsWith('custom')){const available=await page.evaluate(()=>!!document.createElement('canvas').getContext('webgl'));test.skip(!available,'The browser has no WebGL context');await page.evaluate(()=>{window.contexts=[]})}
  if(name.startsWith('custom')||name.startsWith('partial'))test.skip(browserName!=='chromium','Native SVG/section eligibility is verified on Chromium; other backends retain full capture');
  await fn(page);
 });
}
run('alpha and 24 simultaneous surfaces, isolation, shared context, recovery',async page=>{
 const result=await page.evaluate(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const source=document.createElement('canvas');source.width=720;source.height=320;source.style.cssText='position:absolute;left:0;top:0;width:720px;height:320px';document.body.append(source);const ctx=source.getContext('2d'),colors=[];
  for(let i=0;i<24;i++){const color=[(i*43)%240+10,(i*79)%240+10,(i*113)%240+10];colors.push(color);ctx.fillStyle=`rgb(${color.join(',')})`;ctx.fillRect(i%6*120,Math.floor(i/6)*80,120,80)}
  const map=document.createElement('canvas');map.width=map.height=2;map.getContext('2d').fillStyle='rgb(128,128,128)';map.getContext('2d').fillRect(0,0,2,2);const options={map:map.toDataURL(),scale:0,dispersion:0,specular:0,classic:false,radius:0,blur:0,saturation:100};
  const surfaces=[],panels=[],statuses=[];
  for(let i=0;i<24;i++){const panel=document.createElement('div');panel.style.cssText=`position:absolute;left:${i%6*120+4}px;top:${Math.floor(i/6)*80+4}px;width:${96+i%3*5}px;height:${56+i%3*5}px`;document.body.append(panel);panels.push(panel);surfaces.push(lab.createWebGLSurface(panel,panel,source,options,s=>statuses[i]=s))}
  for(let i=0;i<200&&statuses.filter(s=>s==='active').length!==24;i++)await wait(20);
  const pixels=()=>panels.map((p,i)=>{const c=p.querySelector('canvas');if(!c)return null;return [...c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data]});
  const first=pixels(),contexts=window.contexts.map(r=>r.deref()).filter(c=>c&&!c.isContextLost()),gl=contexts[0];
  const ext=gl.getExtension('WEBGL_lose_context');ext.loseContext();await wait(150);const lost=statuses.filter(s=>s==='webgl-unavailable').length;ext.restoreContext();for(let i=0;i<200&&statuses.filter(s=>s==='active').length!==24;i++)await wait(20);const restored=pixels();
  ctx.clearRect(0,0,720,320);ctx.fillStyle='rgba(255,0,0,.5)';ctx.fillRect(0,0,720,320);await wait(100);const alpha=pixels()[0];
  surfaces.forEach(s=>s.destroy());await wait(50);
  return {active:statuses.filter(s=>s==='active').length,contexts:contexts.length,colors,first,restored,lost,alpha,released:gl.isContextLost(),remaining:panels.reduce((n,p)=>n+p.querySelectorAll('canvas').length,0)};
 });
 assert.equal(result.active,24);assert.equal(result.contexts,1);assert.equal(result.lost,24);assert.ok(result.released);assert.equal(result.remaining,0);
 for(let i=0;i<24;i++){for(let c=0;c<3;c++){assert.ok(Math.abs(result.first[i][c]-result.colors[i][c])<=1,`initial ${i}: ${result.first[i]} vs ${result.colors[i]}`);assert.ok(Math.abs(result.restored[i][c]-result.colors[i][c])<=1,`restored ${i}`)}}
 assert.ok(Math.abs(result.alpha[0]-255)<=1);assert.ok(Math.abs(result.alpha[3]-128)<=1);return result;
});
run('partial HTML capture matches a fresh full capture',async page=>{
 const result=await page.evaluate(async()=>{
  const root=document.createElement('div');root.style.cssText='position:absolute;left:0;top:0;width:400px;height:400px;overflow:hidden';root.innerHTML='<section style="position:relative;height:200px;overflow:hidden;background:rgb(200,100,50)"><b style="position:absolute;left:23px;top:31px">first</b></section><section style="position:relative;height:200px;overflow:hidden;background:rgb(30,160,200)"><b style="position:absolute;left:23px;top:31px">second</b></section>';document.body.append(root);
  // The root is inserted under the pointer. Let :hover settle first: a hover change
  // legitimately invalidates the style context and forces a complete capture.
  for(let i=0;i<2;i++)await new Promise(requestAnimationFrame);
  const shared=lab.acquireSource(root,()=>{});await shared.refresh();let sizes=[];const cap=shared.capture.captureElement.bind(shared.capture);shared.capture.captureElement=async(el,...args)=>{sizes.push(el.tagName);return cap(el,...args)};
  const key=()=>shared.capture.clones?.contextKey(root)??null,sectionInfo=()=>lab.captureSections(root)?.map((x:any)=>[x.element.tagName,x.x,x.y,x.width,x.height,x.replaceable])??null;const diagnostics:any={keyBefore:key(),sectionsBefore:sectionInfo(),fonts:document.fonts.status};
  root.querySelector('b').textContent='Changed text';root.firstElementChild.style.background='rgb(120,210,80)';const src:any=(document as any)[Symbol.for('simple-liquid-glass.sources.v1')]?.get(root);const records=src.observer.takeRecords();src.note(records);
  Object.assign(diagnostics,{keyAfter:key(),sectionsAfter:sectionInfo(),fontsAfter:document.fonts.status,records:records.map((r:any)=>[r.type,r.target.nodeName,r.attributeName]),full:src.full,dirty:[...src.dirty].map((e:any)=>e.tagName),rescan:[...src.rescanDescendants].map((e:any)=>e.tagName),sameContext:src.styleContext===key(),storedSections:src.sections?.length??null,published:src.publishedScale,dpr:src.capture.dpr,cached:!!src.capture.cache.get(root),pending:!!src.pending,timer:!!src.timer,geometry:src.geometry,now:`${root.offsetWidth}:${root.offsetHeight}:${devicePixelRatio}`});await shared.refresh();
  const partial=shared.capture.cache.get(root).canvas,full=new lab.HtmlCapture(root);full.dpr=1;await full.prefetchFontEmbedCSS();await full.captureElement(root,true);const ref=full.cache.get(root).canvas,a=partial.getContext('2d').getImageData(0,0,400,400).data,b=ref.getContext('2d').getImageData(0,0,400,400).data;let sum=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;max=Math.max(max,d)}
  const partialScopes=[...sizes];
  // A relational selector must conservatively invalidate the complete root.
  const style=document.createElement('style');style.textContent='section:has(.trigger)+section{background:rgb(255,0,0)!important}';document.head.append(style);sizes=[];root.querySelector('b').className='trigger';await shared.refresh();const fallback=sizes;shared.release();full.destroy();return {mean:sum/a.length,max,partialCapture:partialScopes,fallback,diagnostics};
 });assert.equal(result.max,0);assert.deepEqual(result.partialCapture,['SECTION'],JSON.stringify(result.diagnostics));assert.ok(result.fallback.includes('DIV'));return result;
});
run('padded PNG preserves all original map pixels',async page=>{
 const result=await page.evaluate(async()=>{const plain=lab.buildNativeMap(320,180,24,'player',undefined,false,true),padded=lab.buildNativeMap(320,180,24,'player',undefined,true),{x,y,size}=lab.nativeMapSurround(320,180);const read=async uri=>{const image=new Image();image.src=uri;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);return c};const a=await read(plain),b=await read(padded),aa=a.getContext('2d').getImageData(0,0,size,size).data,bb=b.getContext('2d').getImageData(x,y,size,size).data;let changed=0;for(let i=0;i<aa.length;i++)changed+=aa[i]!==bb[i];return{changed,bodyPixels:size*size,size,padding:[...b.getContext('2d').getImageData(0,0,1,1).data]}});assert.equal(result.changed,0);assert.equal(result.size,240);assert.deepEqual(result.padding,[128,128,128,255]);return result;
});
run('Scene preserves z-index and root group opacity',async page=>{
 const r=await page.evaluate(async()=>{const root=document.createElement('div');root.style.cssText='position:absolute;left:0;top:0;width:300px;height:300px;opacity:.5';root.innerHTML='<div style="position:absolute;inset:0;background:red;z-index:10"></div><div style="position:absolute;inset:0;background:blue;z-index:1"></div>';document.body.append(root);const panel=document.createElement('div');panel.style.cssText='position:fixed;left:50px;top:50px;width:100px;height:80px';document.body.append(panel);let ready=false;const scene=lab.createSceneCapture(root,{fontEmbedCSS:''}),binding=scene.register(panel,s=>ready=s);for(let i=0;i<200&&!ready;i++)await new Promise(r=>setTimeout(r,20));const c=binding.canvas,rect=c.getBoundingClientRect(),pixel=[...c.getContext('2d').getImageData(100-rect.left,100-rect.top,1,1).data];binding.release();scene.destroy();return {ready,pixel}});assert.ok(r.ready);assert.ok(Math.abs(r.pixel[0]-255)<=1);assert.ok(Math.abs(r.pixel[1]-128)<=1,JSON.stringify(r));assert.ok(Math.abs(r.pixel[2]-128)<=1);return r;
});
run('custom element reuses its engine and SVG uses lens controls',async page=>{
 await page.evaluate(()=>{const bg=document.createElement('div');bg.id='backdrop';bg.style.cssText='position:absolute;width:400px;height:400px;background:linear-gradient(90deg,red,blue)';document.body.append(bg);const el=document.createElement('liquid-glass');el.id='glass';el.setAttribute('renderer','webgl');el.setAttribute('backdrop-selector','#backdrop');el.style.cssText='width:180px;height:90px';document.body.append(el)});
 await page.waitForFunction(()=>document.querySelector('#glass').dataset.glassStrategy==='webgl');
 const initial=await page.evaluate(()=>window.contexts.length);for(let i=0;i<3;i++){await page.evaluate(i=>document.querySelector('#glass').setAttribute('strength',String(.1+i*.01)),i);await page.waitForTimeout(50)}
 const r=await page.evaluate(initial=>{const el=document.querySelector('#glass'),count=window.contexts.length;el.setAttribute('renderer','svg');el.setAttribute('strength','.1');const before=el.shadowRoot.querySelector('feDisplacementMap').getAttribute('scale');el.setAttribute('strength','.2');const after=el.shadowRoot.querySelector('feDisplacementMap').getAttribute('scale'),channel=el.shadowRoot.querySelector('feDisplacementMap').getAttribute('yChannelSelector');el.remove();return {initial,count,before,after,channel}},initial);
 assert.equal(r.count,r.initial);assert.equal(r.initial,1);assert.equal(Number(r.after),Number(r.before)*2);assert.equal(r.channel,'G');return r;
});
