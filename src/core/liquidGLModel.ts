// Optical equations adapted from naughtyduk/liquidGL (MIT); see THIRD_PARTY_NOTICES.md.
import type { LiquidGLOptions } from './webgl/types';
export interface LiquidGLCoefficients { refraction:number; bevelDepth:number; bevelWidth:number; frost:number; aberration:number; specular:boolean }
const finite=(value:number|undefined,fallback:number,min=0,max=1)=>Number.isFinite(value)?Math.max(min,Math.min(max,value!)):fallback;
export function liquidGLCoefficients(options:LiquidGLOptions|undefined,blur=0):LiquidGLCoefficients {
 return {refraction:finite(options?.refraction,.006),bevelDepth:finite(options?.bevelDepth,.015),bevelWidth:finite(options?.bevelWidth,.15,.0001),frost:finite(options?.frost,Number.isFinite(blur)?Math.max(0,blur)/8:0,0,20),aberration:finite(options?.aberration,0,0,10),specular:!!options?.specular};
}
export function smoothstep(a:number,b:number,value:number){const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t)}
/** Direction and amplitude in source-normalized units; Y follows the reference's texture origin. */
export function liquidGLField(x:number,y:number,width:number,height:number,radius:number,c:LiquidGLCoefficients):[number,number] {
 const px=x-width/2,py=height/2-y,bx=width/2,by=height/2;
 const qx=Math.abs(px)-bx+radius,qy=Math.abs(py)-by+radius;
 const mx=Math.max(qx,0),my=Math.max(qy,0),length=Math.hypot(mx,my);
 const d=length-radius;
 if(d>.5)return[0,0];
 const edge=1-smoothstep(0,c.bevelWidth*Math.min(width,height),-d);
 const amount=(edge*c.refraction+Math.pow(edge,10)*c.bevelDepth)*smoothstep(.15,.45,Math.hypot(px/height,py/height));
 let dx=px/height+.000001,dy=py/height+.000001,l=Math.hypot(dx,dy);dx/=l;dy/=l;
 if(length>0){const weight=smoothstep(0,Math.max(radius*.5,1),Math.min(mx,my));if(weight>0){dx=dx*(1-weight)+(px<0?-1:1)*mx/length*weight;dy=dy*(1-weight)+(py<0?-1:1)*my/length*weight;l=Math.hypot(dx,dy);dx/=l;dy/=l;}}
 return[dx*amount,dy*amount];
}
