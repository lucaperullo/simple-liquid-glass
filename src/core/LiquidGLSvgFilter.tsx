import React,{useEffect,useRef,useState,type RefObject} from 'react';
import {subscribeFrame} from './webgl/contextPool';
import type {LiquidGLOptions} from './webgl/types';
import {buildSvgLiquidAsset,svgLiquidKey,svgLiquidShapeKey,type SvgLiquidAsset,type SvgLiquidGeometry} from './svgLiquidGL';
import {liquidGLCoefficients} from './liquidGLModel';
interface Props {filterId:string;panel:RefObject<HTMLDivElement|null>;backdrop?:RefObject<HTMLElement|null>;selector?:string;width:number;height:number;radius:number;blur:number;options?:LiquidGLOptions;enabled:boolean;onReady:(ready:boolean)=>void;onError:(failed:boolean)=>void}
const spotCache=new Map<number,string>();
function spot(gain:number){let uri=spotCache.get(gain);if(uri)return uri;const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!,image=ctx.createImageData(128,128);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const radius=Math.min(1,Math.hypot((x+.5)/64-1,(y+.5)/64-1)),t=1-radius,v=Math.round(gain*t*t*(3-2*t)*255),at=(y*128+x)*4;image.data[at]=image.data[at+1]=image.data[at+2]=v;image.data[at+3]=255}ctx.putImageData(image,0,0);uri=c.toDataURL();c.width=c.height=0;spotCache.set(gain,uri);return uri}
const RGB=['1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1','0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 1','0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 0 1'];
// A pane moving near the source edge changes its map every frame; rebuild it at most this often, then settle exactly.
const EDGE_MOVE_MS=160;
const OPAQUE='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0 1';
export function LiquidGLSvgFilter(props:Props){
 const latest=useRef(props);latest.current=props;
 const [asset,setAsset]=useState<SvgLiquidAsset|null>(null),filter=useRef<SVGFilterElement|null>(null),lights=useRef<Array<SVGFEImageElement|null>>([]),started=useRef(0);
 useEffect(()=>{
  if(!props.enabled){props.onReady(false);return}
  let measured:SvgLiquidGeometry|undefined,key='',shape='',builtAt=0,disposed=false,source:HTMLElement|null=null;
  const resolve=()=>{const p=latest.current;try{return p.backdrop?p.backdrop.current:p.selector?document.querySelector<HTMLElement>(p.selector):p.panel.current?.closest<HTMLElement>('[data-liquid-glass-scene]')??document.documentElement}catch{return null}};
  const read=()=>{
   const p=latest.current,node=p.panel.current;if(!node||document.hidden)return;
   source=resolve();if(!source)return;
   const pane=node.getBoundingClientRect(),back=source.getBoundingClientRect();if(!p.width||!p.height||!back.width||!back.height)return;
   const stable=(n:number)=>Math.abs(n-1)<.00001?1:Math.round(n*10000)/10000;
   measured={width:p.width,height:p.height,radius:p.radius,sourceWidth:Math.round(back.width*4)/4,sourceHeight:Math.round(back.height*4)/4,x:pane.left-back.left,y:pane.top-back.top,dpr:Math.min(devicePixelRatio||1,2),scaleX:stable(pane.width/p.width),scaleY:stable(pane.height/p.height)};
  };
  const write=()=>{
   const p=latest.current;if(disposed||document.hidden||!measured)return;
   const c=liquidGLCoefficients(p.options,p.blur),next=svgLiquidKey(measured,c);
   if(next!==key){
    const nextShape=svgLiquidShapeKey(measured,c),now=performance.now();
    if(nextShape!==shape||now-builtAt>=EDGE_MOVE_MS){
     shape=nextShape;builtAt=now;
     try{const built=buildSvgLiquidAsset(measured,p.options,p.blur);key=next;setAsset(built);p.onError(false)}catch{key=next;p.onError(true);p.onReady(false);return}
    }
   }
   if(c.specular&&filter.current){
    if(!started.current)started.current=performance.now();
    const override=filter.current.getAttribute('data-optics-time'),time=override===null?(performance.now()-started.current)/1000:Number(override);
    const xs=[Math.sin(time*.2)*.6+.5,Math.sin(time*-.4+1.5)*.6+.5],ys=[Math.cos(time*.3)*.6+.5,Math.cos(time*.25-.5)*.6+.5];
    lights.current.forEach((light,i)=>{const radius=i?.5:.4;light?.setAttribute('x',String((xs[i]-radius)*p.width));light?.setAttribute('y',String((1-ys[i]-radius)*p.height))});
   }
  };
  read();write();const stop=subscribeFrame(write,read);
  return()=>{disposed=true;stop();};
 },[props.enabled]);
 useEffect(()=>{if(asset&&props.enabled)props.onReady(true)},[asset,props.enabled]);
 if(!asset)return null;
 const nodes:React.ReactNode[]=[],samples:string[]=[];const c=asset.coefficients;
 if(c.frost===0)nodes.push(<feConvolveMatrix key="sharp" in="SourceGraphic" order={3} kernelMatrix="0 1 0 1 1 1 0 1 0" divisor={5} edgeMode="duplicate" preserveAlpha={false} kernelUnitLength={1/asset.dpr} result="sharp"/>);
 for(let sample=0;sample<asset.maps.length;sample++){
  const colors:string[]=[];
  for(let channel=0;channel<asset.maps[sample].length;channel++){
   const name=`s${sample}c${channel}`;
   nodes.push(<feImage key={name+'image'} href={asset.maps[sample][channel]} x={0} y={0} width={props.width} height={props.height} preserveAspectRatio="none" result={name+'raw'}/>);
   // A matrix retains the exact 0.5 neutral; a component-transfer LUT quantizes it again in Chromium.
   nodes.push(<feColorMatrix key={name+'neutral'} in={name+'raw'} values="1 0 0 0 -.00196078431372549 0 1 0 0 -.00196078431372549 0 0 1 0 0 0 0 0 0 1" result={name+'map'}/>);
   nodes.push(<feDisplacementMap key={name+'disp'} in={c.frost===0&&(asset.maps[sample].length===1||channel===1)?'sharp':'SourceGraphic'} in2={name+'map'} scale={asset.scale} xChannelSelector="R" yChannelSelector="G" result={name}/>);
   colors.push(name);
  }
  if(colors.length===1)samples.push(colors[0]);
  else{
   colors.forEach((name,i)=>nodes.push(<feColorMatrix key={name+'rgb'} in={name} type="matrix" values={RGB[i]} result={name+'rgb'}/>));
   nodes.push(<feComposite key={sample+'rg'} in={colors[0]+'rgb'} in2={colors[1]+'rgb'} operator="arithmetic" k2={1} k3={1} result={`rgb${sample}rg`}/>,<feComposite key={sample+'rgb'} in={`rgb${sample}rg`} in2={colors[2]+'rgb'} operator="arithmetic" k2={1} k3={1} result={`rgb${sample}`}/>);
   nodes.push(<feComposite key={sample+'out'} in={`rgb${sample}`} in2={colors[1]} operator="in" result={`sample${sample}`}/>);samples.push(`sample${sample}`);
  }
 }
 let level=samples,depth=0;
 while(level.length>1){const next:string[]=[];for(let i=0;i<level.length;i+=2){const name=`average${depth}x${i}`;nodes.push(<feComposite key={name} in={level[i]} in2={level[i+1]} operator="arithmetic" k2={.5} k3={.5} result={name}/>);next.push(name)}level=next;depth++;}
 const lensed=level[0];
 nodes.push(<feComponentTransfer key="fallback-mask" in={lensed} result="validRefract"><feFuncA type="discrete" tableValues="0 1 1 1 1 1 1 1 1 1"/></feComponentTransfer>,<feComposite key="valid" in={lensed} in2="validRefract" operator="in" result="refracted"/>,<feComposite key="fallback" in="SourceGraphic" in2="validRefract" operator="out" result="fallback"/>,<feComposite key="sampled" in="refracted" in2="fallback" operator="over" result="sampled"/>);
 let output='sampled';
 if(props.options?.specular){
  nodes.push(<feColorMatrix key="opaque" in={output} type="matrix" values={OPAQUE} result="opaqueLens"/>);
  [0,1].forEach(i=>nodes.push(<feImage key={'light'+i} ref={element=>{lights.current[i]=element}} href={spot(i?.08:.1)} x={0} y={0} width={props.width*(i?1:.8)} height={props.height*(i?1:.8)} preserveAspectRatio="none" result={'light'+i}/>));
  nodes.push(<feComposite key="light-sum" in="light0" in2="light1" operator="arithmetic" k2={1} k3={1} result="lightSum"/>,<feComposite key="lit" in="opaqueLens" in2="lightSum" operator="arithmetic" k2={1} k3={1} result="lit"/>,<feComposite key="lit-alpha" in="lit" in2="sampled" operator="in" result="litAlpha"/>);output='litAlpha';
 }
 nodes.push(<feColorMatrix key="coverage" in="s0c0raw" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 1 0 0" result="coverage"/>,<feComposite key="out" in={output} in2="coverage" operator="in"/>);
 return <svg aria-hidden="true" data-liquidgl-svg="" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}><defs><filter ref={filter} id={props.filterId} filterUnits="userSpaceOnUse" x={-asset.padding} y={-asset.padding} width={props.width+2*asset.padding} height={props.height+2*asset.padding} colorInterpolationFilters="sRGB">{nodes}</filter></defs></svg>;
}
