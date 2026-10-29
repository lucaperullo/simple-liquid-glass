import {createImage,nodeToDataURL} from 'html-to-image/es/util';
import {parseCssColorToRgba} from '../../cssColor';
import type {RasterFrame} from './cloneCache';
import {nativeTextPlan,drawNativeText,NATIVE_TEXT_PROBES} from './NativeText';
import type {NativeTextPlan} from './NativeText';

type RecordState={key:object;signature:string;blocked:boolean;foreground?:HTMLImageElement;dynamic?:HTMLImageElement;textPlan?:NativeTextPlan;dynamicIndex:number;before?:HTMLImageElement;pixels:number;used?:number};
const MAX_ENTRIES=2,MAX_PIXELS=4*1024*1024,MAX_STYLE_BYTES=1024*1024;
const children=(root:HTMLElement)=>Array.from(root.children).filter(node=>node.tagName!=='STYLE') as HTMLElement[];
const none=(values:ReadonlyMap<string,string>,name:string)=>!values.has(name)||values.get(name)==='none';
/** Reuse decoded SVG layers around one independently positioned changing subtree.
 * Each root/scale/style epoch must pass exact pixel comparisons before activation.
 * Unsupported structures and any parity failure retain the ordinary SVG capture.
 */
export class SvgRasterCache {
 private records=new Map<HTMLElement,RecordState>();
 private requests=new WeakMap<HTMLElement,number>();private sequence=0;private disposed=false;
 readonly stats={splits:0,calibrations:0,calibrationMs:0,rejections:0,fallbacks:0,staticLoads:0,dynamicLoads:0,nativeFrames:0,textChecks:0,textRejections:0,complexFrames:0};
 invalidate(root:HTMLElement){this.records.delete(root)}
 destroy(){this.disposed=true;this.records.clear();this.requests=new WeakMap()}
 private eligible(frame:RasterFrame,clone:HTMLElement,dynamicIndex:number,staticValidated=false):boolean {
  const root=frame.nodes[0].values;
  if(!['block','flow-root'].includes(root.get('display')??'')||root.get('visibility')!=='visible'||root.get('opacity')!=='1')return false;
  if(root.get('overflow-x')!=='hidden'||root.get('overflow-y')!=='hidden'||root.get('background-clip')!=='border-box')return false;
  if(parseCssColorToRgba(root.get('background-color')??'')?.a!==1)return false;
  if(!none(root,'border-image-source')||!none(root,'text-decoration-line')||!none(root,'text-emphasis-style'))return false;
  if(!['auto','1'].includes(root.get('column-count')??'auto')||!['normal','none',''].includes(root.get('content')??''))return false;
  for(const name of ['border-top-width','border-right-width','border-bottom-width','border-left-width','padding-top','padding-right','padding-bottom','padding-left','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius'])if(parseFloat(root.get(name)??'0')!==0)return false;
  if(Array.from(clone.childNodes).some(node=>node.nodeType===3&&node.textContent?.length))return false;
  const leaves=children(clone);if(leaves.length<2||leaves.length>64||dynamicIndex<0||dynamicIndex>=leaves.length)return false;
  if(dynamicIndex>0&&root.get('background-image')!=='none')return false;
  // Keep retained image documents bounded independently of stylesheet size.
  const textNodes=staticValidated?[leaves[dynamicIndex]]:leaves;
  if(textNodes.reduce((sum,node)=>sum+(node.textContent?.length??0),0)>65536)return false;
  for(let i=0;i<frame.nodes.length;i++){
   if(staticValidated&&i>0&&frame.nodes[i].topLevel!==dynamicIndex)continue;
   const node=frame.nodes[i],v=node.values;
   if(i&&(v.get('z-index')!=='auto'||v.get('opacity')!=='1'||['fixed','sticky'].includes(v.get('position')??'')))return false;
   if(i&&frame.nodes[i-1]?.topLevel!==node.topLevel&&v.get('position')!=='absolute')return false;
   if(i&&v.get('transform')?.startsWith('matrix3d('))return false;
   if(v.get('transform-style')==='preserve-3d')return false;
   if(v.get('mix-blend-mode')!=='normal')return false;
   if(i===0&&(!none(v,'transform')||!none(v,'text-shadow')))return false;
   for(const name of ['perspective','filter','backdrop-filter','-webkit-backdrop-filter','clip-path','mask-image','-webkit-mask-image','-webkit-mask-box-image-source','box-shadow','counter-increment','counter-reset','counter-set','appearance','-webkit-appearance','-webkit-box-reflect'])if(!none(v,name))return false;
   if(!['normal','1'].includes(v.get('zoom')??'1'))return false;
   if(v.get('outline-style')!=='none'&&parseFloat(v.get('outline-width')??'0')>0)return false;
   // No external/animated paints or dependencies on elements in another layer.
   for(const name of ['background-image','border-image-source','list-style-image','content','shape-outside'])if(/url\(|image-set\(|(?:-moz-)?element\(|paint\(|random(?:-item)?\(/i.test(v.get(name)??''))return false;
  }
  return true;
 }
 private put(root:HTMLElement,record:RecordState,request:number){
  if(this.disposed||this.requests.get(root)!==request)return;
  record.used=performance.now();this.records.delete(root);this.records.set(root,record);
  while(this.records.size>MAX_ENTRIES||[...this.records.values()].reduce((sum,r)=>sum+(r.blocked?0:r.pixels),0)>MAX_PIXELS)this.records.delete(this.records.keys().next().value!);
 }
 private async image(root:HTMLElement,width:number,height:number){
  const image=await createImage(await nodeToDataURL(root,width,height));
  image.onload=image.onerror=null;
  return image;
 }
 private backgroundRoot(clone:HTMLElement,dynamicIndex=0){
  const result=clone.cloneNode(false) as HTMLElement;
  for(const node of Array.from(clone.children))if(node.tagName==='STYLE')result.appendChild(node.cloneNode(true));
  const first=children(clone)[dynamicIndex];result.appendChild(first.cloneNode(true));
  if(dynamicIndex>0){result.style.background='transparent';result.style.backgroundBlendMode='normal';}
  return result;
 }
 private foregroundRoot(clone:HTMLElement,dynamicIndex=0,before=false){
  const result=clone.cloneNode(true) as HTMLElement;
  for(const [index,node]of children(result).entries())if(before?index>=dynamicIndex:index<=dynamicIndex)node.remove();
  result.style.background='transparent';result.style.backgroundBlendMode='normal';return result;
 }
 private draw(canvas:HTMLCanvasElement,background:HTMLImageElement,foreground?:HTMLImageElement,before?:HTMLImageElement,colour?:string){
  const ctx=canvas.getContext('2d')!;
  if(colour){ctx.fillStyle=colour;ctx.fillRect(0,0,canvas.width,canvas.height);}
  if(before)ctx.drawImage(before,0,0,canvas.width,canvas.height);
  ctx.drawImage(background,0,0,canvas.width,canvas.height);
  if(foreground)ctx.drawImage(foreground,0,0,canvas.width,canvas.height);
 }
 private equal(a:HTMLCanvasElement,b:HTMLCanvasElement){
  const x=a.getContext('2d')!.getImageData(0,0,a.width,a.height).data;
  const y=b.getContext('2d')!.getImageData(0,0,b.width,b.height).data;
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;return true;
 }
 async render(source:HTMLElement,clone:HTMLElement,width:number,height:number,frame:RasterFrame|null,output:HTMLCanvasElement,makeCanvas:()=>HTMLCanvasElement):Promise<HTMLCanvasElement|null>{
  const request=++this.sequence;this.requests.set(source,request);
  const fallback=()=>{this.stats.fallbacks++;return null};
  if(this.disposed||!frame?.reused||!output.width||!output.height||output.width*output.height>MAX_PIXELS){this.invalidate(source);return fallback()}
  const shell=clone.cloneNode(false) as HTMLElement;shell.style.background='transparent';shell.style.backgroundBlendMode='normal';
  const styles=Array.from(clone.children).filter(n=>n.tagName==='STYLE').map(n=>n.textContent).join('\u0000');
  if(styles.length>MAX_STYLE_BYTES){this.invalidate(source);return fallback()}
  const signature=output.width+':'+output.height+':'+shell.outerHTML+'\u0000'+styles;
  if(signature.length>MAX_STYLE_BYTES){this.invalidate(source);return fallback()}
  let record=this.records.get(source);
  if(record&&(record.key!==frame.key||record.signature!==signature)){this.invalidate(source);record=undefined}
  const groups=[...new Set(frame.changed.filter(i=>i>0).map(i=>frame.nodes[i].topLevel))];
  const dynamicIndex=groups[0]??record?.dynamicIndex??0;
  if(groups.length>1||dynamicIndex<0){this.invalidate(source);return fallback()}
  if(record&&record.dynamicIndex!==dynamicIndex){this.invalidate(source);return fallback()}
  if(record?.blocked)return fallback();
  // Keep DOM paint order: static siblings before, changing subtree, siblings after.
  // A change in another group invalidates the cached partition.
  if(!this.eligible(frame,clone,dynamicIndex,!!record)){this.invalidate(source);return fallback()}
  if(!record){
   // The previous two 2-Mpixel entries share one 4-Mpixel budget. A Retina
   // entry can use spare capacity; avoid recalibration churn between hot roots.
   let retained=[...this.records.values()].reduce((sum,r)=>sum+(r.blocked?0:r.pixels),0);
   if(retained+output.width*output.height>MAX_PIXELS){
    for(const [key,value]of this.records){
     if((value.pixels>MAX_PIXELS/2||output.width*output.height>MAX_PIXELS/2)&&performance.now()-(value.used??0)<1000)continue;
     this.records.delete(key);retained-=value.blocked?0:value.pixels;
     if(retained+output.width*output.height<=MAX_PIXELS)break;
    }
    if(retained+output.width*output.height>MAX_PIXELS)return fallback();
   }
  }
  let actualReference:HTMLCanvasElement|undefined,calibrationStart:number|undefined;
  try{
   if(record&&(record.foreground||record.before)){
    if(record.textPlan&&drawNativeText(output,clone,frame,width,height,record.textPlan,undefined,record.before)){
     if(record.foreground)output.getContext('2d')!.drawImage(record.foreground,0,0,output.width,output.height);
     // A later unsupported update must not reuse an SVG from before these draws.
     this.put(source,{...record,dynamic:undefined},request);this.stats.splits++;this.stats.nativeFrames++;return output;
    }
    let background=record.dynamic!;
    if(!background||frame.changed.length){background=await this.image(this.backgroundRoot(clone,dynamicIndex),width,height);this.stats.dynamicLoads++;}
    this.draw(output,background,record.foreground,record.before,dynamicIndex>0?clone.style.backgroundColor:undefined);
    this.put(source,{...record,dynamic:background},request);this.stats.splits++;if(dynamicIndex>0)this.stats.complexFrames++;return output;
   }
   this.stats.calibrations++;
   calibrationStart=performance.now();
   const foreground=dynamicIndex<children(clone).length-1?await this.image(this.foregroundRoot(clone,dynamicIndex),width,height):undefined;
   const before=dynamicIndex>0?await this.image(this.foregroundRoot(clone,dynamicIndex,true),width,height):undefined;
   this.stats.staticLoads+=Number(!!foreground)+Number(!!before);
   let actualDynamic:HTMLImageElement|undefined;
   let textPlan=nativeTextPlan(clone,frame,output,dynamicIndex);if(textPlan)this.stats.textChecks++;
   // Current paint plus contrasting backgrounds catch alpha/antialias differences
   // without shipping a browser-name heuristic. These readbacks are startup only.
   for(const colour of [null,'rgb(0, 0, 0)','rgb(255, 255, 255)','rgb(128, 128, 128)']){
    const full=clone.cloneNode(true) as HTMLElement;
    if(colour)full.style.background=colour;
    const referenceImage=await this.image(full,width,height);
    const background=await this.image(this.backgroundRoot(full,dynamicIndex),width,height);this.stats.dynamicLoads++;
    const reference=makeCanvas(),candidate=colour?makeCanvas():output;
    this.draw(reference,referenceImage);this.draw(candidate,background,foreground,before,dynamicIndex>0?full.style.backgroundColor:undefined);
    if(colour===null){actualReference=reference;actualDynamic=background;}
    if(textPlan){
     const native=makeCanvas();
     if(!drawNativeText(native,full,frame,width,height,textPlan,undefined,before)){textPlan=null;this.stats.textRejections++;}
     else{if(foreground)native.getContext('2d')!.drawImage(foreground,0,0,native.width,native.height);if(!this.equal(reference,native)){textPlan=null;this.stats.textRejections++;}}
    }
    if(!this.equal(reference,candidate)){
     this.stats.rejections++;this.put(source,{key:frame.key,signature,pixels:output.width*output.height,blocked:true,dynamicIndex},request);this.stats.fallbacks++;return actualReference!;
    }
   }
   if(textPlan){
    for(const text of NATIVE_TEXT_PROBES){
     const root=this.backgroundRoot(clone,dynamicIndex),first=children(root)[0];if(dynamicIndex>0)root.style.backgroundColor=clone.style.backgroundColor;first.textContent=text;
     first.style.width='max-content';first.style.inlineSize='max-content';first.style.height='auto';first.style.blockSize='auto';first.style.whiteSpace='nowrap';
     const reference=makeCanvas(),native=makeCanvas();this.draw(reference,await this.image(root,width,height));
     if(!drawNativeText(native,clone,frame,width,height,textPlan,text)||!this.equal(reference,native)){textPlan=null;this.stats.textRejections++;break;}
    }
   }
   this.put(source,{key:frame.key,signature,pixels:output.width*output.height,blocked:false,foreground,before,dynamic:actualDynamic,textPlan:textPlan??undefined,dynamicIndex},request);this.stats.splits++;if(dynamicIndex>0)this.stats.complexFrames++;return output;
  }catch{
   this.stats.rejections++;this.put(source,{key:frame.key,signature,pixels:output.width*output.height,blocked:true,dynamicIndex},request);
   // Return an ordinary, independent canvas. Clearing a tainted or partially
   // painted candidate would neither restore its origin nor its background.
   this.stats.fallbacks++;
   if(actualReference)return actualReference;
   const reference=makeCanvas();this.draw(reference,await this.image(clone,width,height));return reference;
  }finally{
   if(calibrationStart!==undefined)this.stats.calibrationMs+=performance.now()-calibrationStart;
  }
 }
}
