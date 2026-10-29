import {parseCssColorToRgba} from '../../cssColor';
import type {RasterFrame} from './cloneCache';
export interface NativeTextPlan {font:string;kerning:CanvasFontKerning;ascent:number;descent:number;x:number;y:number;index?:number;shadowSignature?:string}
interface TextShadow {colour:string;x:number;y:number;blur:number;signature:string}
const zero=(values:ReadonlyMap<string,string>,name:string)=>parseFloat(values.get(name)??'0')===0;
const normal=(values:ReadonlyMap<string,string>,name:string)=>!values.has(name)||['normal','none','auto','0px'].includes(values.get(name)!);
const px=(value:string|undefined)=>value&&/^[-+]?\d*\.?\d+px$/.test(value)?parseFloat(value):NaN;
const leaf=(clone:HTMLElement,index:number)=>Array.from(clone.children).filter(node=>node.tagName!=='STYLE')[index] as HTMLElement|undefined;
/** A single computed RGB(A) shadow only. Other syntaxes keep the SVG path. */
function textShadow(value:string|undefined):TextShadow|undefined|false {
 const signature=value?.trim()??'none';if(signature==='none'||signature==='')return undefined;
 const leading=/^(rgba?\([^()]+\))\s+(.+)$/.exec(signature);
 const trailing=leading?null:/^(.+?)\s+(rgba?\([^()]+\))$/.exec(signature);
 if(!leading&&!trailing)return false;
 const colour=leading?leading[1]:trailing![2],lengths=(leading?leading[2]:trailing![1]).trim().split(/\s+/),rgba=parseCssColorToRgba(colour);
 if(!rgba||rgba.a<0||rgba.a>1||[rgba.r,rgba.g,rgba.b].some(n=>n<0||n>255)||lengths.length!==3)return false;
 const [x,y,blur]=lengths.map(px);if(![x,y,blur].every(Number.isFinite)||blur<0)return false;
 return{colour,x,y,blur,signature};
}
function description(clone:HTMLElement,frame:RasterFrame,index=0){
 if(!Number.isInteger(index)||index<0)return null;
 const root=frame.nodes[0]?.values,state=index===0?frame.nodes[1]:frame.nodes.find((node,i)=>i>0&&node.topLevel===index),v=state?.values,node=leaf(clone,index);
 if(!root||!v||!node||!state?.leaf)return null;
 if(root.get('background-image')!=='none'||root.get('direction')!=='ltr'||root.get('writing-mode')!=='horizontal-tb')return null;
 for(const name of ['margin-top','margin-right','margin-bottom','margin-left'])if(!zero(root,name))return null;
 if(v.get('direction')!=='ltr'||v.get('writing-mode')!=='horizontal-tb'||v.get('font-style')!=='normal'||v.get('line-height')!=='normal')return null;
 if(!['left','start'].includes(v.get('text-align')??''))return null;
 const whiteSpace=v.get('white-space');
 if(whiteSpace?!['normal','nowrap'].includes(whiteSpace):v.get('white-space-collapse')!=='collapse'||!['wrap','nowrap'].includes(v.get('text-wrap-mode')??''))return null;
 if(v.get('overflow-x')!=='visible'||v.get('overflow-y')!=='visible'||v.get('background-image')!=='none')return null;
 if(parseCssColorToRgba(v.get('background-color')??'')?.a!==0)return null;
 for(const name of ['padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','margin-top','margin-right','margin-bottom','margin-left','text-indent','-webkit-text-stroke-width'])if(!zero(v,name))return null;
 for(const name of ['text-decoration-line','text-emphasis-style','text-transform','letter-spacing','word-spacing','filter','transform'])if(!normal(v,name))return null;
 for(const name of ['font-feature-settings','font-variation-settings','font-variant-caps','font-variant-numeric','font-variant-ligatures','font-variant-position','font-variant-alternates','font-variant-east-asian','font-language-override','font-palette'])if(v.has(name)&&v.get(name)!=='normal')return null;
 if(v.has('font-size-adjust')&&v.get('font-size-adjust')!=='none')return null;
 for(const name of ['font-optical-sizing','font-synthesis-weight','font-synthesis-style','-webkit-font-smoothing','text-rendering'])if(v.has(name)&&v.get(name)!=='auto')return null;
 if(!['normal','100%'].includes(v.get('font-stretch')??'normal'))return null;
 const shadow=textShadow(v.get('text-shadow'));if(shadow===false)return null;
 const text=(node.textContent??'').replace(/[\t\r\n\f ]+/g,' ').replace(/^ | $/g,'');
 if(text.length>2048||/[^\x20-\x7e]/.test(text))return null;
 const size=px(v.get('font-size')),x=px(v.get('left')),y=px(v.get('top')),width=px(v.get('width')),height=px(v.get('height'));
 if(![size,x,y,width,height].every(Number.isFinite)||size<=0||width<=0||height<=0)return null;
 // Avoid CSS layout-unit rounding differences; a moved label uses the SVG path.
 if(!Number.isInteger(x)||!Number.isInteger(y))return null;
 const colour=v.get('-webkit-text-fill-color')??v.get('color')??'';
 if(parseCssColorToRgba(colour)?.a!==1)return null;
 const font=`${v.get('font-weight')??'400'} ${size}px ${v.get('font-family')??'sans-serif'}`;
 // Canvas 'auto' and CSS 'auto' differ in some engines. The explicit
 // setting below is used only after exact glyph/kerning calibration.
 const kerning=v.get('font-kerning')??'auto';if(!['auto','normal','none'].includes(kerning))return null;
 return{node,text,font,shadow,kerning:(kerning==='auto'?'normal':kerning) as CanvasFontKerning,x,y,width,height,colour,background:clone.style.backgroundColor};
}
function configure(ctx:CanvasRenderingContext2D,font:string,kerning:CanvasFontKerning){ctx.font=font;ctx.fontKerning=kerning;ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.direction='ltr';}
export function nativeTextPlan(clone:HTMLElement,frame:RasterFrame,canvas:HTMLCanvasElement,index=0):NativeTextPlan|null{
 const d=description(clone,frame,index);if(!d)return null;const ctx=canvas.getContext('2d')!;ctx.save();
 try{configure(ctx,d.font,d.kerning);const metrics=ctx.measureText(d.text||'Hg');if(!Number.isFinite(metrics.fontBoundingBoxAscent)||!Number.isFinite(metrics.fontBoundingBoxDescent))return null;return{font:d.font,kerning:d.kerning,ascent:metrics.fontBoundingBoxAscent,descent:metrics.fontBoundingBoxDescent,x:d.x,y:d.y,index,shadowSignature:d.shadow?.signature??'none'};}finally{ctx.restore()}
}
/** Returns false before painting when this update no longer matches the calibrated subset. */
export function drawNativeText(canvas:HTMLCanvasElement,clone:HTMLElement,frame:RasterFrame,cssWidth:number,cssHeight:number,plan:NativeTextPlan,probeText?:string,before?:HTMLImageElement):boolean{
 const d=description(clone,frame,plan.index??0);if(!d||d.font!==plan.font||d.kerning!==plan.kerning||d.x!==plan.x||d.y!==plan.y||(d.shadow?.signature??'none')!==(plan.shadowSignature??'none'))return false;
 const sx=canvas.width/cssWidth,sy=canvas.height/cssHeight;
 if(![sx,sy].every(n=>Number.isFinite(n)&&n>0))return false;
 // Canvas shadows ignore the CTM. Offsets can be scaled independently, but a
 // nonzero isotropic blur cannot represent an anisotropically scaled CSS blur.
 if(d.shadow?.blur&&Math.abs(sx-sy)>1e-9)return false;
 if(before&&(!before.complete||!before.naturalWidth||!before.naturalHeight))return false;
 const text=probeText??d.text,available=probeText===undefined?d.width:cssWidth-d.x-4,ctx=canvas.getContext('2d')!;
 ctx.save();try{
  configure(ctx,d.font,d.kerning);const metrics=ctx.measureText(text||'Hg');
  if(metrics.fontBoundingBoxAscent!==plan.ascent||metrics.fontBoundingBoxDescent!==plan.descent||metrics.width>available+.001||d.height<plan.ascent+plan.descent-1)return false;
  ctx.shadowColor='rgba(0, 0, 0, 0)';ctx.shadowBlur=ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  ctx.setTransform(sx,0,0,sy,0,0);
  ctx.fillStyle=d.background;ctx.fillRect(0,0,cssWidth,cssHeight);
  if(before){ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(before,0,0,canvas.width,canvas.height);ctx.setTransform(sx,0,0,sy,0,0);}
  if(d.shadow){ctx.shadowColor=d.shadow.colour;ctx.shadowOffsetX=d.shadow.x*sx;ctx.shadowOffsetY=d.shadow.y*sy;ctx.shadowBlur=d.shadow.blur*sx;}
  ctx.fillStyle=d.colour;ctx.fillText(text,d.x,d.y+plan.ascent);return true;
 }finally{ctx.restore()}
}
export const NATIVE_TEXT_PROBES=[
 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
 'abcdefghijklmnopqrstuvwxyz fi fl ffi ffl',
 'AV WA To Ty Yo !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
];
