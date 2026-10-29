import { liquidGLCoefficients,liquidGLField,smoothstep,type LiquidGLCoefficients } from './liquidGLModel';
import type { LiquidGLOptions } from './webgl/types';
export interface SvgLiquidGeometry { width:number;height:number;radius:number;sourceWidth:number;sourceHeight:number;x:number;y:number;dpr:number;scaleX:number;scaleY:number }
export interface SvgLiquidAsset { maps:string[][];scale:number;padding:number;width:number;height:number;dpr:number;coefficients:LiquidGLCoefficients;decodedBytes:number;key:string }
const cache=new Map<string,SvgLiquidAsset>();let bytes=0;
const BUDGET=64*1024*1024,MAX_ENTRIES=32;
const quant=(x:number)=>Math.round(x*4)/4;
export function svgLiquidKey(g:SvgLiquidGeometry,c:LiquidGLCoefficients){
 const extent=(c.refraction+c.bevelDepth)*(1+c.aberration);
 const mx=g.sourceWidth*extent+4*c.frost/g.dpr,my=g.sourceHeight*extent+4*c.frost/g.dpr;
 const coordinate=(v:number,size:number,source:number,margin:number)=>v>=margin&&v+size<=source-margin?'inside':quant(v);
 return JSON.stringify([g.width,g.height,g.radius,g.sourceWidth,g.sourceHeight,g.dpr,g.scaleX,g.scaleY,coordinate(g.x,g.width*g.scaleX,g.sourceWidth,mx),coordinate(g.y,g.height*g.scaleY,g.sourceHeight,my),c.refraction,c.bevelDepth,c.bevelWidth,c.frost,c.aberration]);
}
// Match the reference's float arithmetic as closely as JavaScript permits; GPU sin is implementation dependent.
const f=Math.fround;
function random(x:number,y:number){const n=f(f(Math.sin(f(f(f(x)*f(12.9898))+f(f(y)*f(78.233)))))*f(43758.5453123));return n-Math.floor(n)}
export function buildSvgLiquidAsset(g:SvgLiquidGeometry,options:LiquidGLOptions|undefined,blur=0):SvgLiquidAsset{
 const c=liquidGLCoefficients(options,blur),key=svgLiquidKey(g,c),hit=cache.get(key);
 if(hit){cache.delete(key);cache.set(key,hit);return hit;}
 const width=Math.max(1,Math.round(g.width*g.scaleX*g.dpr)),height=Math.max(1,Math.round(g.height*g.scaleY*g.dpr));
 const samples=c.frost>0?16:1,channels=c.aberration>0?3:1,decodedBytes=width*height*4*samples*channels;
 if(!Number.isFinite(decodedBytes)||decodedBytes>BUDGET||width>4096||height>4096)throw new RangeError('LiquidGlass: SVG optics map budget exceeded');
 const extent=(c.refraction+c.bevelDepth)*(1+c.aberration);
 const reach=Math.max(g.sourceWidth/g.scaleX,g.sourceHeight/g.scaleY)*extent+4*c.frost/g.dpr/Math.min(g.scaleX,g.scaleY);
 const scale=Math.max(.00001,reach*255/127),padding=Math.ceil(reach+4/g.dpr+2);
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('LiquidGlass: SVG map canvas unavailable');
 const count=width*height;
 const margin=(c.refraction+c.bevelDepth)*(1+c.aberration);
 const mx=g.sourceWidth*margin+4*c.frost/g.dpr,my=g.sourceHeight*margin+4*c.frost/g.dpr;
 const gx=g.x>=mx&&g.x+g.width*g.scaleX<=g.sourceWidth-mx?(g.sourceWidth-g.width*g.scaleX)/2:quant(g.x);
 const gy=g.y>=my&&g.y+g.height*g.scaleY<=g.sourceHeight-my?(g.sourceHeight-g.height*g.scaleY)/2:quant(g.y);
 const dx=new Float64Array(count),dy=new Float64Array(count),blend=new Float64Array(count),mask=new Uint8Array(count);
 const captureDpr=Math.min(g.dpr,2,16384/g.sourceWidth,16384/g.sourceHeight,Math.sqrt(16*1024*1024/(g.sourceWidth*g.sourceHeight)));
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  const i=row*width+col,x=(col+.5)/width*g.width*g.scaleX,y=(row+.5)/height*g.height*g.scaleY;
  const field=liquidGLField(x,y,g.width*g.scaleX,g.height*g.scaleY,g.radius,c);dx[i]=field[0]*g.sourceWidth;dy[i]=field[1]*g.sourceHeight;
  const qx=Math.max(Math.abs(x-g.width*g.scaleX/2)-g.width*g.scaleX/2+g.radius,0),qy=Math.max(Math.abs(g.height*g.scaleY/2-y)-g.height*g.scaleY/2+g.radius,0);
  mask[i]=Math.round(255*(1-smoothstep(-.5,.5,(Math.hypot(qx,qy)-g.radius)*g.dpr)));
  const u=(gx+x+dx[i])/g.sourceWidth,v=(gy+y+dy[i])/g.sourceHeight,oob=Math.max(-u,u-1,-v,v-1);
  blend[i]=1-smoothstep(0,.01,oob);
 }
 const maps:string[][]=[];
 for(let sample=0;sample<samples;sample++){
  const offsets=Array.from({length:channels},()=>ctx.createImageData(width,height));
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
   const i=row*width+col,at=i*4,u=(col+.5)/width,v=1-(row+.5)/height;
   let ox=0,oy=0;
   if(c.frost>0){const angle=random(u+sample,v+sample)*6.283185,distance=Math.sqrt(random(u-sample,v-sample))*c.frost*4/captureDpr;ox=Math.cos(angle)*distance;oy=Math.sin(angle)*distance;}
   for(let channel=0;channel<channels;channel++){
    const chroma=channels===3?(channel-1)*c.aberration:0,d=offsets[channel].data;
    d[at]=Math.max(1,Math.min(255,Math.round(128+(dx[i]*(blend[i]+chroma)+ox)/g.scaleX*255/scale)));
    d[at+1]=Math.max(1,Math.min(255,Math.round(128+(dy[i]*(blend[i]+chroma)+oy)/g.scaleY*255/scale)));
    d[at+2]=mask[i];d[at+3]=255;
   }
  }
  maps.push(offsets.map(image=>{ctx.putImageData(image,0,0);return canvas.toDataURL()}));
 }
 canvas.width=canvas.height=0;
 const asset={maps,scale,padding,width:g.width,height:g.height,dpr:captureDpr,coefficients:c,decodedBytes,key};
 while(cache.size&&(cache.size>=MAX_ENTRIES||bytes+decodedBytes>BUDGET)){const oldest=cache.keys().next().value!;bytes-=cache.get(oldest)!.decodedBytes;cache.delete(oldest);}
 cache.set(key,asset);bytes+=decodedBytes;return asset;
}
export function svgLiquidCacheInfo(){return{entries:cache.size,decodedBytes:bytes,budget:BUDGET}}
