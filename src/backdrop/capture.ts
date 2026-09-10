import {getFontEmbedCSS,toSvg} from 'html-to-image'

type Media = HTMLVideoElement | HTMLCanvasElement
type LiveLayer = {element:Media; mask:HTMLCanvasElement}
type Snapshot = {base:HTMLCanvasElement; layers:LiveLayer[]; width:number; height:number}
export interface SceneCaptureOptions {
 /** Optional pre-embedded font CSS; otherwise same-origin fonts are embedded once. */
 fontEmbedCSS?:string;
 /** Shared snapshot budget, in bytes. Default: 64 MiB. */
 maxCacheBytes?:number;
 onCaptureError?:(error:unknown,section:HTMLElement)=>void;
}
const ignored=(element:Element)=>!!element.closest('[data-liquid-glass-scene-surface],[data-liquid-glass-ignore]');
type Tile = {element:HTMLElement; snapshot?:Snapshot; dirty:boolean; pending:boolean; top:number; used:number; revision:number; failed:boolean; evicted:boolean; changed:number; shell:boolean}
const captureMarker=()=>`--liquid-glass-capture-${Math.random().toString(36).slice(2)}`
const intersects=(a:DOMRect,b:DOMRect)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top
const makeCanvas=(w:number,h:number)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c}
const load=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>{void img.decode().then(()=>resolve(img),()=>resolve(img))};img.onerror=()=>reject(new Error('Backdrop image could not be decoded'));img.src=src})

async function raster(svg:Document,width:number,height:number){
 const image=await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`)
 const canvas=makeCanvas(width,height)
 canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height)
 return canvas
}
function colorMedia(element:Media,color:string,opaque=false){
 const width=element instanceof HTMLVideoElement?element.videoWidth:element.width
 const height=element instanceof HTMLVideoElement?element.videoHeight:element.height
 const canvas=makeCanvas(width,height),ctx=canvas.getContext('2d')!
 if(!opaque)ctx.drawImage(element,0,0,canvas.width,canvas.height)
 ctx.globalCompositeOperation=opaque?'copy':'source-in';ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height)
 return canvas.toDataURL()
}

/** Capture HTML once; derive the transmission of each live media layer through its foreground. */
export async function capturePageTile(element:HTMLElement,fontEmbedCSS:string,shell=false):Promise<Snapshot>{
 const width=element.offsetWidth,height=element.offsetHeight
 if(!width||!height)throw new Error('Empty backdrop section')
 const marker=captureMarker();
 const media=(shell?[]:[...(element instanceof HTMLVideoElement||element instanceof HTMLCanvasElement?[element]:[]),...element.querySelectorAll<Media>('video,canvas')]).filter(el=>!ignored(el)&&(el instanceof HTMLVideoElement?el.readyState>=2:el.width>0&&el.height>0))
 const previous=media.map(el=>el.style.getPropertyValue(marker))
 media.forEach((el,index)=>el.style.setProperty(marker,String(index)))
 let url:string
 try{
  url=await toSvg(element,{width,height,fontEmbedCSS,filter:node=>!(node instanceof HTMLVideoElement&&node.readyState<2),style:{transform:'none',translate:'none',position:'relative',top:'auto',left:'auto',margin:'0'}})
 }finally{
  media.forEach((el,index)=>previous[index]?el.style.setProperty(marker,previous[index]):el.style.removeProperty(marker))
 }
 const svg=new DOMParser().parseFromString(decodeURIComponent(url.slice(url.indexOf(',')+1)),'image/svg+xml')
 if(shell){const clone=svg.querySelector('foreignObject')?.firstElementChild;for(const child of [...(clone?.children??[])])(child as HTMLElement).style.opacity='0'}
 else svg.querySelectorAll<HTMLElement>('[data-liquid-glass-scene-surface],[data-liquid-glass-ignore]').forEach(node=>node.style.opacity='0');
 svg.querySelectorAll('img').forEach(image=>image.setAttribute('decoding','sync'))
 const clones=[...svg.querySelectorAll<HTMLElement>('[style]')]
 const nodes=media.map((_,index)=>clones.find(el=>el.style.getPropertyValue(marker).trim()===String(index)))
 const colors=media.map(element=>({black:colorMedia(element,'black'),opaqueBlack:colorMedia(element,'black',true),white:colorMedia(element,'white',true)}))
 nodes.forEach((node,index)=>node?.setAttribute('src',colors[index].black))
 // One CSS pixel per captured pixel keeps a full phone page and live masks within a bounded budget.
 const ratio=Math.min(1,Math.sqrt(2*1024*1024/((1+media.length)*width*height)))
 const rasterWidth=Math.max(1,Math.round(width*ratio)),rasterHeight=Math.max(1,Math.round(height*ratio))
 const base=await raster(svg,rasterWidth,rasterHeight)
 const layers:LiveLayer[]=[]
 for(let index=0;index<media.length;index++){
  const node=nodes[index]
  if(!node)continue
  node.setAttribute('src',colors[index].opaqueBlack)
  const darkImage=raster(svg,rasterWidth,rasterHeight)
  node.setAttribute('src',colors[index].white)
  const whiteImage=raster(svg,rasterWidth,rasterHeight)
  node.setAttribute('src',colors[index].black)
  // Serialization happens before raster yields, so these independent decodes can overlap.
  const [dark,white]=await Promise.all([darkImage,whiteImage])
  const black=dark.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,dark.width,dark.height)
  const ctx=white.getContext('2d',{willReadFrequently:true})!,pixels=ctx.getImageData(0,0,white.width,white.height)
  for(let p=0;p<pixels.data.length;p+=4){
   // Opaque probes measure DOM transmission only: the live draw applies intrinsic media alpha once.
   const alpha=Math.max(0,Math.min(255,(pixels.data[p]*pixels.data[p+3]-black.data[p]*black.data[p+3])/255))
   pixels.data[p]=pixels.data[p+1]=pixels.data[p+2]=255;pixels.data[p+3]=alpha
  }
  ctx.putImageData(pixels,0,0);dark.width=0;layers.push({element:media[index],mask:white})
 }
 return {base,layers,width,height}
}

function paintMedia(ctx:CanvasRenderingContext2D,element:Media,rect:DOMRect,left:number,top:number){
 const sw=element instanceof HTMLVideoElement?element.videoWidth:element.width
 const sh=element instanceof HTMLVideoElement?element.videoHeight:element.height
 if(!sw||!sh||(element instanceof HTMLVideoElement&&element.readyState<2))return
 const style=getComputedStyle(element),dw=rect.width,dh=rect.height
 let w=dw,h=dh
 if(style.objectFit!=='fill'){
  const ratio=style.objectFit==='cover'?Math.max(dw/sw,dh/sh):style.objectFit==='none'?1:Math.min(dw/sw,dh/sh,style.objectFit==='scale-down'?1:Infinity)
  w=sw*ratio;h=sh*ratio
 }
 const position=style.objectPosition.split(' ')
 const align=(v:string,space:number)=>v.endsWith('%')?parseFloat(v)/100*space:parseFloat(v)||0
 ctx.save();ctx.beginPath();ctx.rect(rect.left-left,rect.top-top,dw,dh);ctx.clip()
 ctx.drawImage(element,rect.left-left+align(position[0],dw-w),rect.top-top+align(position[1]??'50%',dh-h),w,h);ctx.restore()
}


type Target={previous:string|null;released:boolean;panel:HTMLElement;canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;work:HTMLCanvasElement;workCtx:CanvasRenderingContext2D;guard:number;lastReady?:boolean;onReady:(ready:boolean)=>void};
const fixed=(element:HTMLElement)=>{let found=false;for(let el:HTMLElement|null=element;el;el=el.parentElement){const style=getComputedStyle(el);if(found&&(style.transform!=='none'||style.perspective!=='none'||style.filter!=='none'))return false;if(style.position==='fixed')found=true}return found};
/** One section cache and capture queue, with a small moving canvas for each registered lens. */
export function createSceneCapture(root:HTMLElement,options:SceneCaptureOptions={}){
 let disposed=false,raf=0,busy=false,fonts='',clock=0,lastCapture=0,lastScroll=-Infinity;
 const targets=new Set<Target>(),tiles:Tile[]=[];
 const budget=Math.max(8*1024*1024,options.maxCacheBytes??64*1024*1024);
 const origin=document.createElement('i');origin.style.cssText='position:fixed;left:0;top:0;pointer-events:none;visibility:hidden';document.body.append(origin);
 const release=(snapshot:Snapshot)=>{snapshot.base.width=0;snapshot.layers.forEach(layer=>layer.mask.width=0)};
 const scrolled=()=>{lastScroll=performance.now()};window.addEventListener('scroll',scrolled,{passive:true});
 function syncTiles(){
  const style=getComputedStyle(root);
  const shell=style.backgroundImage!=='none'||!['transparent','rgba(0, 0, 0, 0)'].includes(style.backgroundColor)||style.boxShadow!=='none'||parseFloat(style.borderTopWidth)>0||[...root.childNodes].some(node=>node.nodeType===Node.TEXT_NODE&&node.textContent?.trim());
  const elements=[...(shell?[root]:[]),...root.children].filter((el):el is HTMLElement=>el instanceof HTMLElement&&!ignored(el)&&el.tagName!=='STYLE'&&el.tagName!=='SCRIPT');
  for(const element of elements)if(!tiles.some(t=>t.element===element)){tiles.push({element,dirty:true,pending:false,top:element.getBoundingClientRect().top+scrollY,used:0,revision:0,failed:false,evicted:false,changed:performance.now(),shell:element===root});resize.observe(element)}
  for(let i=tiles.length-1;i>=0;i--)if(!elements.includes(tiles[i].element)){const tile=tiles[i];resize.unobserve(tile.element);if(tile.snapshot)release(tile.snapshot);tiles.splice(i,1)}
  const order=new Map(elements.map((element,index)=>[element,index]));tiles.sort((a,b)=>order.get(a.element)!-order.get(b.element)!);
 }
 const invalidate=(element:Element)=>{
  for(const tile of tiles)if((!tile.shell||element===root)&&(tile.element.contains(element)||element.contains(tile.element))){tile.dirty=true;tile.failed=false;tile.revision++;tile.changed=performance.now()}
 };
 const mutations=new MutationObserver(records=>{
  for(const record of records){
   if(record.attributeName==='data-liquid-glass-captures')continue;
   const element=record.target instanceof Element?record.target:record.target.parentElement;
   if(!element||ignored(element))continue;
   if(record.attributeName==='style'){
    const clean=(style:string|null)=>(style??'').replace(/--liquid-glass-capture-[a-z0-9]+:\s*[^;]*;?/g,'').trim();
    if(clean(record.oldValue)===clean(element.getAttribute('style')))continue;
   }
   invalidate(element);
  }
  syncTiles();
 });
 const resize=new ResizeObserver(entries=>entries.forEach(entry=>invalidate(entry.target)));
 const changed=(event:Event)=>{if(event.target instanceof Element&&!ignored(event.target))invalidate(event.target)};
 root.addEventListener('load',changed,true);root.addEventListener('loadeddata',changed,true);root.addEventListener('input',changed,true);
 syncTiles();mutations.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true});
 async function capture(tile:Tile){
  busy=true;tile.pending=true;const revision=tile.revision;lastCapture=performance.now();
  try{
   const snapshot=await capturePageTile(tile.element,fonts,tile.shell);
   if(disposed||!tiles.includes(tile)){release(snapshot);return}
   if(tile.snapshot)release(tile.snapshot);
   tile.snapshot=snapshot;tile.dirty=tile.revision!==revision;tile.failed=false;tile.evicted=false;
   root.dataset.liquidGlassCaptures=String(Number(root.dataset.liquidGlassCaptures??0)+1);
   let bytes=tiles.reduce((sum,t)=>sum+(t.snapshot?t.snapshot.base.width*t.snapshot.base.height*4*(1+t.snapshot.layers.length):0),0);
   for(const older of [...tiles].sort((a,b)=>a.used-b.used)){
    if(bytes<=budget)break;
    if(older===tile||!older.snapshot||older.used===clock)continue;
    bytes-=older.snapshot.base.width*older.snapshot.base.height*4*(1+older.snapshot.layers.length);
    release(older.snapshot);older.snapshot=undefined;older.dirty=true;older.evicted=true;
   }
  }catch(error){tile.dirty=false;tile.failed=true;options.onCaptureError?.(error,tile.element)}
  finally{tile.pending=false;busy=false}
 }
 const tick=()=>{
  if(disposed)return;raf=requestAnimationFrame(tick);
  if(document.hidden||!targets.size)return;
  clock++;
  const offset=origin.getBoundingClientRect().top,elastic=scrollY<0||scrollY>Math.max(0,document.documentElement.scrollHeight-innerHeight);
  const candidates=tiles.map(tile=>{
   const measured=tile.element.getBoundingClientRect();if(!elastic)tile.top=measured.top+scrollY;
   return {tile,measuredTop:measured.top,rect:new DOMRect(measured.left,elastic?tile.top-scrollY:measured.top,measured.width,measured.height)};
  });
  const neededAreas:DOMRect[]=[];
  for(const target of targets){
   const {panel,canvas,ctx,work,workCtx}=target,lens=panel.getBoundingClientRect();
   if(!lens.width||!lens.height||lens.bottom<0||lens.top>innerHeight)continue;
   const correction=elastic&&offset&&fixed(panel)?offset:0;
   target.guard=Math.max(target.guard,Math.ceil((160+Math.abs(correction))/128)*128);
   const width=innerWidth,height=Math.ceil(lens.height+target.guard*2),top=lens.top-correction-target.guard;
   if(canvas.width!==width||canvas.height!==height){canvas.width=work.width=width;canvas.height=work.height=height;canvas.style.width=`${width}px`;canvas.style.height=`${height}px`}
   canvas.style.top=`${top}px`;
   const area=canvas.getBoundingClientRect(),needed=new DOMRect(0,lens.top-correction-160,innerWidth,lens.height+320);neededAreas.push(needed);
   ctx.clearRect(0,0,width,height);ctx.fillStyle=getComputedStyle(document.body).backgroundColor;ctx.fillRect(0,0,width,height);
   let complete=true;
   for(const {tile,rect,measuredTop} of candidates){
    if(!intersects(area,rect))continue;tile.used=clock;
    const snapshot=tile.snapshot;
    if(!snapshot){if(intersects(needed,rect))complete=false;continue}
    ctx.drawImage(snapshot.base,rect.left-area.left,rect.top-area.top,rect.width,rect.height);
    for(const {element,mask} of snapshot.layers){
     if(!element.isConnected)continue;
     const measured=element.getBoundingClientRect(),mediaRect=new DOMRect(measured.left,measured.top+rect.top-measuredTop,measured.width,measured.height);
     if(!intersects(area,mediaRect))continue;
     workCtx.clearRect(0,0,width,height);workCtx.globalCompositeOperation='source-over';
     workCtx.drawImage(mask,rect.left-area.left,rect.top-area.top,rect.width,rect.height);workCtx.globalCompositeOperation='source-in';
     paintMedia(workCtx,element,mediaRect,area.left,area.top);
     ctx.globalCompositeOperation='lighter';ctx.drawImage(work,0,0);ctx.globalCompositeOperation='source-over';
    }
   }
   if(complete!==target.lastReady){target.lastReady=complete;target.onReady(complete)}
  }
  const now=performance.now(),scrolling=now-lastScroll<180;
  if(!busy&&neededAreas.length&&now-lastCapture>120){
   const visible=(rect:DOMRect)=>neededAreas.some(needed=>intersects(needed,rect));
   const distance=(rect:DOMRect)=>Math.min(...neededAreas.map(needed=>Math.max(0,needed.top-rect.bottom,rect.top-needed.bottom)));
   const next=candidates.filter(({tile,rect})=>!tile.failed&&(tile.dirty||!tile.snapshot)&&rect.width>0&&rect.height>0)
    .filter(({tile,rect})=>(!tile.snapshot&&visible(rect))||(!scrolling&&now-tile.changed>180&&distance(rect)<innerHeight))
    .sort((a,b)=>{
     const priority=({tile,rect}:{tile:Tile;rect:DOMRect})=>!tile.snapshot&&visible(rect)?0:visible(rect)?1:2;
     return priority(a)-priority(b)||distance(a.rect)-distance(b.rect);
    })[0];
   if(next)void capture(next.tile);
  }
 };
 void document.fonts.ready.then(()=>options.fontEmbedCSS??getFontEmbedCSS(root)).catch(()=>'').then(css=>{if(disposed)return;fonts=css;raf=requestAnimationFrame(tick)});
 return {
  register(panel:HTMLElement,onReady:(ready:boolean)=>void){
   const previous=panel.getAttribute('data-liquid-glass-scene-surface');panel.setAttribute('data-liquid-glass-scene-surface','');
   const canvas=makeCanvas(1,1),work=makeCanvas(1,1);
   canvas.dataset.liquidGlassBackdrop='';canvas.style.cssText='position:fixed;left:0;opacity:0;pointer-events:none;z-index:-1;object-fit:fill';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
   const target:Target={previous,released:false,panel,canvas,ctx:canvas.getContext('2d')!,work,workCtx:work.getContext('2d')!,guard:256,onReady};targets.add(target);syncTiles();invalidate(root);
   return {canvas,refresh:()=>invalidate(root),release:()=>{if(target.released)return;target.released=true;targets.delete(target);canvas.remove();canvas.width=work.width=0;if(previous===null)panel.removeAttribute('data-liquid-glass-scene-surface');else panel.setAttribute('data-liquid-glass-scene-surface',previous);syncTiles();invalidate(root)}};
  },
  destroy(){
   disposed=true;cancelAnimationFrame(raf);window.removeEventListener('scroll',scrolled);mutations.disconnect();resize.disconnect();origin.remove();
   root.removeEventListener('load',changed,true);root.removeEventListener('loadeddata',changed,true);root.removeEventListener('input',changed,true);
   for(const t of targets){t.released=true;t.canvas.remove();t.canvas.width=t.work.width=0;if(t.previous===null)t.panel.removeAttribute('data-liquid-glass-scene-surface');else t.panel.setAttribute('data-liquid-glass-scene-surface',t.previous)}targets.clear();
   for(const tile of tiles)if(tile.snapshot)release(tile.snapshot);
   delete root.dataset.liquidGlassCaptures;
  }
 };
}
