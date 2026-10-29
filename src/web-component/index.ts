import { createWebGLEngine } from '../core/webgl/runtime';
import type { WebGLEngine, WebGLOptions } from '../core/webgl/types';
import { isIOSDevice, supportsSvgBackdrop, wantsWebGL } from '../core/renderer';
import { buildNativeMap, resolveLensOptions, type LensProfile } from '../core/nativeOptics';
import { buildDisplacementDataUri, normalizeAngle, isLensMode } from '../core/displacementMap';
import { liquidConfig, liquidBaseFrequency, isLiquidPreset } from '../core/liquid';
import { materialFilterMarkup, materialFilterPadding } from '../core/materialFilter';

const TAG='liquid-glass',REVEAL_TIMEOUT_MS=400;
let uid=0,upgradingPage=false;
function attrNum(el:HTMLElement,name:string,fallback:number){const v=parseFloat(el.getAttribute(name)||'');return Number.isFinite(v)?v:fallback}
const SHEEN='linear-gradient(135deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 16%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 72%, rgba(255,255,255,0.12) 100%)';
const ElementBase=(typeof HTMLElement==='undefined'?class{}:HTMLElement)as typeof HTMLElement;
/** Stable shadow DOM and WebGL binding; geometry/optics updates reuse GPU resources. */
export class LiquidGlassElement extends ElementBase{
 static get observedAttributes(){return ['renderer','effect-mode','reveal','backdrop-selector','backdrop-version','lens-profile','strength','dispersion','radius','frost','blur','saturation','displace','scale','border-color','lightness','alpha','angle','shape-adapt','lens','lens-strength','lens-center','liquid','liquid-speed','liquid-scale']}
 private readonly filterId=`lg-wc-${++uid}`;
 private readonly root:ShadowRoot;
 private ro?:ResizeObserver;
 private liquidRaf=0;
 private webgl?:WebGLEngine;
 private source?:HTMLElement;
 private revealPending?:boolean;
 private revealTimer?:ReturnType<typeof setTimeout>;
 private lastSize='';
 private showState:(active:boolean)=>void=()=>{};
 private svgMarkup='';
 constructor(){super();this.root=this.attachShadow({mode:'open'});this.root.innerHTML=`<style>
 :host{display:block;position:relative}:host([data-glass-awaiting]){opacity:0!important}
 .lg-glass,.lg-holder,.lg-border{position:absolute;inset:0;pointer-events:none}
 .lg-glass{z-index:0;overflow:hidden;box-shadow:0 6px 22px rgba(0,0,0,.12)}
 .lg-holder{overflow:hidden;visibility:hidden}.lg-border{z-index:2;-webkit-mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);mask-composite:exclude;border:1px solid transparent}
 .lg-content{position:relative;z-index:3;width:100%;height:100%}.lg-filter{position:absolute;width:0;height:0;pointer-events:none}
 </style><div class="lg-holder" aria-hidden="true"></div><div class="lg-glass"></div><div class="lg-border"></div><div class="lg-content"><slot></slot></div><div class="lg-filter" aria-hidden="true"></div>`}
 connectedCallback(){this.render();if(typeof ResizeObserver!=='undefined'){this.ro=new ResizeObserver(()=>{const size=`${this.offsetWidth}:${this.offsetHeight}`;if(size!==this.lastSize)this.render()});this.ro.observe(this)}}
 disconnectedCallback(){this.reveal();this.clearEngine();this.ro?.disconnect();cancelAnimationFrame(this.liquidRaf);this.liquidRaf=0}
 attributeChangedCallback(name:string){if(!this.isConnected)return;if(name==='backdrop-version')void this.refreshBackdrop().catch(()=>{});this.render()}
 refreshBackdrop(){return this.webgl?.refresh()??Promise.resolve()}
 private clearEngine(){this.webgl?.destroy();this.webgl=undefined;this.source=undefined}
 private reveal(){clearTimeout(this.revealTimer);this.revealPending=false;delete this.dataset.glassAwaiting}
 private render(){
  if(this.revealPending===undefined){this.revealPending=!upgradingPage&&this.getAttribute('reveal')!=='immediate';if(this.revealPending)this.revealTimer=setTimeout(()=>this.reveal(),REVEAL_TIMEOUT_MS)}
  const width=this.offsetWidth||300,height=this.offsetHeight||180;this.lastSize=`${this.offsetWidth}:${this.offsetHeight}`;
  const radius=Math.max(0,Math.min(attrNum(this,'radius',50),width/2,height/2)),frost=attrNum(this,'frost',.1),blur=Math.max(0,attrNum(this,'blur',0)),saturation=attrNum(this,'saturation',140),scale=attrNum(this,'scale',160);
  const rendererAttr=this.getAttribute('renderer'),renderer=rendererAttr==='webgl'||rendererAttr==='svg'?rendererAttr:'auto';
  const effectAttr=this.getAttribute('effect-mode'),effect=effectAttr==='blur'||effectAttr==='off'||effectAttr==='svg'?effectAttr:'auto';
  const svgBackdrop=supportsSvgBackdrop(navigator.userAgent||'',navigator.maxTouchPoints||0),webgl=wantsWebGL(renderer,effect,svgBackdrop),chromium=svgBackdrop&&!webgl&&effect!=='blur'&&effect!=='off';
  const profileAttr=this.getAttribute('lens-profile'),profile:LensProfile=profileAttr==='material'||profileAttr==='loupe'||profileAttr==='track'?profileAttr:'player';
  const native=resolveLensOptions(profile,this.hasAttribute('strength')?{strength:attrNum(this,'strength',.16)}:undefined);
  const legacy=['angle','shape-adapt','lens','lens-strength','lens-center'].some(a=>this.hasAttribute(a));
  const filterScale=legacy?scale:scale/160*native.strength*(profile==='player'?500:Math.hypot(width,height)/Math.SQRT2);
  const color=Math.min(1,Math.abs(attrNum(this,'dispersion',50))/50);
  const map=()=>{
   if(!legacy)return buildNativeMap(width,height,radius,profile,native);
   const lens=this.getAttribute('lens'),center=this.getAttribute('lens-center')?.split(/[ ,]+/).map(Number);
   return buildDisplacementDataUri({width,height,divisor:3,quantStep:24,radius,border:.05,lightness:attrNum(this,'lightness',53),alpha:attrNum(this,'alpha',.9),displace:attrNum(this,'displace',5),blend:'difference',angle:normalizeAngle(attrNum(this,'angle',0)),shapeAdapt:this.getAttribute('shape-adapt')!=='false',lens:isLensMode(lens)?lens:'classic',lensStrength:attrNum(this,'lens-strength',1),lensCenter:center?.length===2&&center.every(Number.isFinite)?[center[0],center[1]]:undefined,scale});
  };
  const holder=this.root.querySelector<HTMLElement>('.lg-holder')!,glass=this.root.querySelector<HTMLElement>('.lg-glass')!,border=this.root.querySelector<HTMLElement>('.lg-border')!,filter=this.root.querySelector<HTMLElement>('.lg-filter')!;
  for(const el of [holder,glass,border])el.style.borderRadius=`${radius}px`;
  let backdrop=effect==='off'?'none':`blur(${Math.max(blur,9)}px) saturate(${Math.max(saturation,160)}%) brightness(1.04)`;
  let background=effect==='off'?'transparent':`${SHEEN}, hsl(0 0% 100% / ${frost})`;
  const liquid=this.getAttribute('liquid'),speed=attrNum(this,'liquid-speed',1),reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activeLiquid=chromium&&isLiquidPreset(liquid)&&!reduce?liquid:null;
  let svg='';
  if(chromium){
   const uri=map();let stages:string,padding:number;
   if(legacy){padding=Math.ceil((Math.abs(scale)+Math.abs(color))/2+blur*3+2);stages=`<feFlood flood-color="rgb(128,128,128)" result="neutral"/><feImage href="${uri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="image"/><feComposite in="image" in2="neutral" operator="over" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="${filterScale}" xChannelSelector="R" yChannelSelector="B"/>${blur>0?`<feGaussianBlur stdDeviation="${blur}"/>`:''}`}
   else{padding=materialFilterPadding(filterScale,color,blur,native.specular);stages=materialFilterMarkup({dispScale:filterScale,dispersion:color,specular:native.specular,hasSpecular:native.specular!==0||!!activeLiquid,keepIdentityHighlight:!!activeLiquid,mapMatrix:null,width,height,mapUrl:uri})}
   if(activeLiquid){const cfg=liquidConfig(activeLiquid,{speed,scale:this.hasAttribute('liquid-scale')?attrNum(this,'liquid-scale',0):undefined});stages+=`<feOffset dx="0" dy="0" result="lqBase"/><feTurbulence type="fractalNoise" baseFrequency="${cfg.baseFrequencyX} ${cfg.baseFrequencyY}" numOctaves="${cfg.numOctaves}" seed="${cfg.seed}" result="lqNoise" data-lg-turb="1"/><feDisplacementMap in="lqBase" in2="lqNoise" scale="${cfg.scale}" xChannelSelector="R" yChannelSelector="G"/>`}
   svg=`<svg><defs><filter id="${this.filterId}" filterUnits="userSpaceOnUse" x="${-padding}" y="${-padding}" width="${width+padding*2}" height="${height+padding*2}" color-interpolation-filters="sRGB">${stages}</filter></defs></svg>`;
   backdrop=`saturate(${saturation}%) ${!legacy&&blur>0?`blur(${blur}px) `:''}url(#${this.filterId})`;background=`hsl(0 0% 100% / ${frost})`;
  }
  if(svg!==this.svgMarkup){filter.innerHTML=svg;this.svgMarkup=svg}
  glass.style.background=background;glass.style.backdropFilter=backdrop;glass.style.setProperty('-webkit-backdrop-filter',backdrop);
  border.style.background=`linear-gradient(315deg, ${this.getAttribute('border-color')||'rgba(120, 120, 120, 0.7)'} 0%, rgba(120,120,120,0) 30%, rgba(120,120,120,0) 70%, ${this.getAttribute('border-color')||'rgba(120, 120, 120, 0.7)'} 100%) border-box`;
  const show=(active:boolean)=>{holder.style.visibility=active?'visible':'hidden';glass.style.backdropFilter=active?'none':backdrop;glass.style.setProperty('-webkit-backdrop-filter',active?'none':backdrop);glass.style.background=active?`hsl(0 0% 100% / ${frost})`:background};
  this.showState=show;
  if(!webgl){this.clearEngine();this.dataset.glassStrategy=effect==='off'?'off':chromium?'svg':'blur';delete this.dataset.glassReason;show(false)}
  else{
   let source:HTMLElement|null=null;const previousReason=this.dataset.glassReason;delete this.dataset.glassReason;
   try{const selector=this.getAttribute('backdrop-selector');if(selector)source=document.querySelector<HTMLElement>(selector)}catch{this.dataset.glassReason='invalid-selector'}
   if(!source||source.contains(this)||this.contains(source)){this.clearEngine();this.dataset.glassStrategy='blur';this.dataset.glassReason||=source?'invalid-backdrop':'missing-backdrop';show(false)}
   else{
    const options:WebGLOptions={map:map(),scale:filterScale,dispersion:color,specular:legacy?0:native.specular,classic:legacy,radius,blur,saturation};
    if(this.webgl&&this.source===source){this.webgl.update(options);if(previousReason)this.dataset.glassReason=previousReason;show(this.dataset.glassStrategy==='webgl')}
    else{
     this.clearEngine();this.source=source;this.dataset.glassStrategy='pending';show(false);
     try{this.webgl=createWebGLEngine(this,holder,source,options,status=>{const active=status==='active';if(status!=='pending')this.reveal();this.dataset.glassStrategy=active?'webgl':status==='pending'?'pending':'blur';this.dataset.glassReason=active?svgBackdrop?'webgl-requested':isIOSDevice(navigator.userAgent,navigator.maxTouchPoints||0)?'ios-webgl':'svg-unsupported':status;this.showState(active)})}
     catch{this.dataset.glassStrategy='blur';this.dataset.glassReason='webgl-unavailable'}
    }
   }
  }
  if(this.revealPending&&this.webgl&&this.dataset.glassStrategy!=='webgl')this.dataset.glassAwaiting='';else this.reveal();
  cancelAnimationFrame(this.liquidRaf);this.liquidRaf=0;
  if(activeLiquid){const node=this.root.querySelector('[data-lg-turb]');if(node){let start=0;const tick=(now:number)=>{start||=now;const[x,y]=liquidBaseFrequency(activeLiquid,(now-start)/1000,speed);node.setAttribute('baseFrequency',`${x} ${y}`);this.liquidRaf=requestAnimationFrame(tick)};this.liquidRaf=requestAnimationFrame(tick)}}
 }
}
export function defineLiquidGlass(tag:string=TAG){if(typeof window==='undefined'||!window.customElements||customElements.get(tag))return;upgradingPage=true;try{customElements.define(tag,tag===TAG?LiquidGlassElement:class extends LiquidGlassElement{})}finally{upgradingPage=false}}
defineLiquidGlass();
