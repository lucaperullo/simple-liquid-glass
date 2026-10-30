import { liquidGLCoefficients,liquidGLField,smoothstep,type LiquidGLCoefficients } from './liquidGLModel';
import type { LiquidGLOptions } from './webgl/types';
export interface SvgLiquidGeometry { width:number;height:number;radius:number;sourceWidth:number;sourceHeight:number;x:number;y:number;dpr:number;scaleX:number;scaleY:number }
export interface SvgLiquidAsset { maps:string[][];scale:number;padding:number;width:number;height:number;dpr:number;frostSigma:number;coefficients:LiquidGLCoefficients;decodedBytes:number;key:string }
const cache=new Map<string,SvgLiquidAsset>();let bytes=0;
const BUDGET=64*1024*1024,MAX_ENTRIES=32;
// Edge positions only move the out-of-source fade, whose ramp spans 1% of the source; whole pixels keep it exact enough.
const quant=(x:number)=>Math.round(x);
// Maps are resent to the GPU process with every frame in which the glass or its backdrop moves, so their decoded
// size is a per-frame cost. The field is smooth; 0.75 map pixels per CSS pixel keep it visually unchanged.
const MAP_DENSITY=.75;
export function svgLiquidKey(g:SvgLiquidGeometry,c:LiquidGLCoefficients){
 const extent=(c.refraction+c.bevelDepth)*(1+c.aberration);
 const mx=g.sourceWidth*extent+4*c.frost/g.dpr,my=g.sourceHeight*extent+4*c.frost/g.dpr;
 const coordinate=(v:number,size:number,source:number,margin:number)=>v>=margin&&v+size<=source-margin?'inside':quant(v);
 return JSON.stringify([svgLiquidShapeKey(g,c),coordinate(g.x,g.width*g.scaleX,g.sourceWidth,mx),coordinate(g.y,g.height*g.scaleY,g.sourceHeight,my)]);
}
/** The key without the pane position: equal shape keys differ only in where a pane sits near the source edge. */
export function svgLiquidShapeKey(g:SvgLiquidGeometry,c:LiquidGLCoefficients){
 return JSON.stringify([g.width,g.height,g.radius,g.sourceWidth,g.sourceHeight,g.dpr,g.scaleX,g.scaleY,c.refraction,c.bevelDepth,c.bevelWidth,c.frost,c.aberration]);
}
// The refraction field and rounded mask depend only on the pane shape; a pane moving near the source edge reuses them.
interface ShapeField { dx:Float64Array;dy:Float64Array;mask:Uint8Array }
const fields=new Map<string,ShapeField>();let fieldBytes=0;
const FIELD_BUDGET=16*1024*1024,fieldSize=(width:number,height:number)=>width*height*17;
function shapeField(g:SvgLiquidGeometry,c:LiquidGLCoefficients,width:number,height:number):ShapeField{
 const key=svgLiquidShapeKey(g,c),hit=fields.get(key);
 if(hit){fields.delete(key);fields.set(key,hit);return hit;}
 const count=width*height,dx=new Float64Array(count),dy=new Float64Array(count),mask=new Uint8Array(count),density=width/(g.width*g.scaleX);
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  const i=row*width+col,x=(col+.5)/width*g.width*g.scaleX,y=(row+.5)/height*g.height*g.scaleY;
  const field=liquidGLField(x,y,g.width*g.scaleX,g.height*g.scaleY,g.radius,c);dx[i]=field[0]*g.sourceWidth;dy[i]=field[1]*g.sourceHeight;
  const qx=Math.max(Math.abs(x-g.width*g.scaleX/2)-g.width*g.scaleX/2+g.radius,0),qy=Math.max(Math.abs(g.height*g.scaleY/2-y)-g.height*g.scaleY/2+g.radius,0);
  mask[i]=Math.round(255*(1-smoothstep(-.5,.5,(Math.hypot(qx,qy)-g.radius)*density)));
 }
 const field={dx,dy,mask},bytes=fieldSize(width,height);
 if(bytes>FIELD_BUDGET)return field;
 while(fields.size&&fieldBytes+bytes>FIELD_BUDGET){const [oldest,entry]=fields.entries().next().value!;fieldBytes-=fieldSize(entry.mask.length,1);fields.delete(oldest);}
 fields.set(key,field);fieldBytes+=bytes;return field;
}
export function buildSvgLiquidAsset(g:SvgLiquidGeometry,options:LiquidGLOptions|undefined,blur=0):SvgLiquidAsset{
 const c=liquidGLCoefficients(options,blur),key=svgLiquidKey(g,c),hit=cache.get(key);
 if(hit){cache.delete(key);cache.set(key,hit);return hit;}
 const density=Math.min(g.dpr,MAP_DENSITY),width=Math.max(1,Math.round(g.width*g.scaleX*density)),height=Math.max(1,Math.round(g.height*g.scaleY*density));
 const channels=c.aberration>0?3:1,decodedBytes=width*height*4*channels;
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
 const {dx,dy,mask}=shapeField(g,c,width,height),blend=new Float64Array(count);
 const captureDpr=Math.min(g.dpr,2,16384/g.sourceWidth,16384/g.sourceHeight,Math.sqrt(16*1024*1024/(g.sourceWidth*g.sourceHeight)));
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  const i=row*width+col,x=(col+.5)/width*g.width*g.scaleX,y=(row+.5)/height*g.height*g.scaleY;
  const u=(gx+x+dx[i])/g.sourceWidth,v=(gy+y+dy[i])/g.sourceHeight,oob=Math.max(-u,u-1,-v,v-1);
  blend[i]=1-smoothstep(0,.01,oob);
 }
 const offsets=Array.from({length:channels},()=>ctx.createImageData(width,height));
 for(let i=0;i<count;i++){
  const at=i*4;
  for(let channel=0;channel<channels;channel++){
   const chroma=channels===3?(channel-1)*c.aberration:0,d=offsets[channel].data;
   d[at]=Math.max(1,Math.min(255,Math.round(128+dx[i]*(blend[i]+chroma)/g.scaleX*255/scale)));
   d[at+1]=Math.max(1,Math.min(255,Math.round(128+dy[i]*(blend[i]+chroma)/g.scaleY*255/scale)));
   d[at+2]=mask[i];d[at+3]=255;
  }
 }
 const maps=[offsets.map(image=>{ctx.putImageData(image,0,0);return canvas.toDataURL()})];
 canvas.width=canvas.height=0;
 // liquidGL frosts with 16 jittered samples in a disk of radius frost*4/captureDpr; a Gaussian with half that
 // radius per axis matches it and needs no extra maps.
 const asset={maps,scale,padding,width:g.width,height:g.height,dpr:captureDpr,frostSigma:c.frost*2/captureDpr,coefficients:c,decodedBytes,key};
 while(cache.size&&(cache.size>=MAX_ENTRIES||bytes+decodedBytes>BUDGET)){const oldest=cache.keys().next().value!;bytes-=cache.get(oldest)!.decodedBytes;cache.delete(oldest);}
 cache.set(key,asset);bytes+=decodedBytes;return asset;
}
export function svgLiquidCacheInfo(){return{entries:cache.size,decodedBytes:bytes,budget:BUDGET}}
