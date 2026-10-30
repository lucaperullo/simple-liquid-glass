import {releaseProgram} from '../../vendor/ybouane/GlassRenderer';
import { sharedValue } from '../shared';
// Adapted from naughtyduk/liquidGL, commit 88f681a (MIT, Copyright (c) NaughtyDuk).
// See THIRD_PARTY_NOTICES.md. This module ports optics, not liquidGL's DOM capture/renderer.
import { VS_QUAD } from '../../vendor/ybouane/shaders';
import {snapshotUpdate,recoverableTextureError} from './snapshotUpdates';
import { acquireTexture } from './textureCache';
import type { EngineContext, WebGLOptions } from './types';
const fragment = `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        varying vec2 v_uv;
        uniform sampler2D u_tex;
        uniform vec4 u_media;
        uniform vec2  u_resolution;
        uniform vec2  u_textureResolution;
        uniform vec4  u_bounds;
        uniform float u_refraction;
        uniform float u_aberration;
        uniform float u_bevelDepth;
        uniform float u_bevelWidth;
        uniform float u_frost;
        uniform float u_radius;
        uniform float u_time;
        uniform bool  u_specular;
        uniform vec2  u_subpixel;
        uniform vec2  u_boxSize;

        vec4 sampleSource(vec2 uv) {
          return texture2D(u_tex, u_media.xy + uv * u_media.zw);
        }

        float udRoundBox( vec2 p, vec2 b, float r ) {
          return length(max(abs(p)-b+r,0.0))-r;
        }

        vec2 cornerNormal( vec2 p, vec2 b, float r, vec2 fallback ) {
          vec2 q = abs(p) - b + r;
          vec2 m = max(q, 0.0);
          float l = length(m);
          if (l <= 0.0) return fallback;
          float w = smoothstep(0.0, max(r * 0.5, 1.0), min(m.x, m.y));
          if (w <= 0.0) return fallback;
          vec2 s = vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
          return normalize(mix(fallback, s * (m / l), w));
        }

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        float edgeFactor(vec2 p_px, vec2 b_px, float radius_px){
          float d = -udRoundBox(p_px, b_px, radius_px);
          float bevel_px = u_bevelWidth * min(u_boxSize.x, u_boxSize.y);
          return 1.0 - smoothstep(0.0, bevel_px, d);
        }
        void main(){
          vec2 lensUV = (v_uv * u_resolution - u_subpixel) / u_boxSize;
          vec2 originalPoint = (lensUV - 0.5) * u_boxSize;
          vec2 p_px = originalPoint;
          vec2 b_px = 0.5 * u_boxSize;
          vec2 p = p_px / u_boxSize.y;
          float dmask = udRoundBox(p_px, b_px, u_radius);
          float inShape = 1.0 - smoothstep(-0.5, 0.5, dmask);
          if (inShape <= 0.0) { gl_FragColor=vec4(0.0); return; }

          float edge = edgeFactor(p_px, b_px, u_radius);
          float min_dimension = min(u_resolution.x, u_resolution.y);
          float offsetAmt = (edge * u_refraction + pow(edge, 10.0) * u_bevelDepth);
          float centreBlend = smoothstep(0.15, 0.45, length(p));
          vec2 refractDir = cornerNormal(p_px, b_px, u_radius, normalize(p + vec2(0.000001)));
          vec2 offset = refractDir * offsetAmt * centreBlend;

          vec2 localUV = lensUV;
          vec2 flippedUV = vec2(localUV.x, 1.0 - localUV.y);
          vec2 mapped = u_bounds.xy + flippedUV * u_bounds.zw;
          vec2 refracted = mapped + offset;

          float oob = max(max(-refracted.x, refracted.x - 1.0), max(-refracted.y, refracted.y - 1.0));
          float blend = 1.0 - smoothstep(0.0, 0.01, oob);
          vec2 sampleUV = mix(mapped, refracted, blend);

          vec4 baseCol   = sampleSource(mapped);

          vec2 texel = 1.0 / u_textureResolution;
          vec4 refrCol;

          vec2 chroma = offset * u_aberration;

          if (u_frost > 0.0) {
              float radius = u_frost * 4.0;
              vec4 sum = vec4(0.0);
              const int SAMPLES = 16;

              for (int i = 0; i < SAMPLES; i++) {
                  float angle = random(v_uv + float(i)) * 6.283185;
                  float dist = sqrt(random(v_uv - float(i))) * radius;
                  vec2 foff = vec2(cos(angle), sin(angle)) * texel * dist;
                  if (u_aberration > 0.0) {
                      sum.r += sampleSource(sampleUV + foff - chroma).r;
                      sum.g += sampleSource(sampleUV + foff).g;
                      sum.b += sampleSource(sampleUV + foff + chroma).b;
                      sum.a += sampleSource(sampleUV + foff).a;
                  } else {
                      sum += sampleSource(sampleUV + foff);
                  }
              }
              refrCol = sum / float(SAMPLES);
          } else {
              refrCol = sampleSource(sampleUV);
              refrCol += sampleSource(sampleUV + vec2( texel.x, 0.0));
              refrCol += sampleSource(sampleUV + vec2(-texel.x, 0.0));
              refrCol += sampleSource(sampleUV + vec2(0.0,  texel.y));
              refrCol += sampleSource(sampleUV + vec2(0.0, -texel.y));
              refrCol /= 5.0;

              if (u_aberration > 0.0) {
                  refrCol.r = sampleSource(sampleUV - chroma).r;
                  refrCol.b = sampleSource(sampleUV + chroma).b;
              }
          }

          if (refrCol.a < 0.1) {
              refrCol = baseCol;
          }

          vec4 final = refrCol;

          if (u_specular) {
            vec2 lp1 = vec2(sin(u_time*0.2), cos(u_time*0.3))*0.6 + 0.5;
            vec2 lp2 = vec2(sin(u_time*-0.4+1.5), cos(u_time*0.25-0.5))*0.6 + 0.5;
            float h = 0.0;
            h += smoothstep(0.4,0.0,distance((p_px + b_px) / u_boxSize, lp1))*0.1;
            h += smoothstep(0.5,0.0,distance((p_px + b_px) / u_boxSize, lp2))*0.08;
            final.rgb += h;
          }

          // Straight-alpha presentation retains source alpha and applies coverage once.
          final.a *= inShape;

          gl_FragColor = final;
        }`;

export const liquidGLFragment=fragment;

type SharedProgram={program:WebGLProgram;uniforms:Record<string,WebGLUniformLocation|null>;position:number;values:Record<string,number[]>;users:number;invalid:boolean};
const programs=sharedValue('optical-programs.v1',()=>new WeakMap<WebGLRenderingContext,Map<string,SharedProgram>>());
const programKey=VS_QUAD+'\u0000'+fragment;
function acquireProgram(renderer:EngineContext['renderer']){
 const gl=renderer.gl,canvas=renderer.canvas;
 let variants=programs.get(gl);if(!variants){variants=new Map();programs.set(gl,variants)}
 let entry=variants.get(programKey);
 if(!entry){
  const program=renderer._link(VS_QUAD,fragment);
  entry={program,uniforms:renderer._uloc(program,['u_tex','u_resolution','u_textureResolution','u_bounds','u_refraction','u_aberration','u_bevelDepth','u_bevelWidth','u_frost','u_radius','u_time','u_specular','u_subpixel','u_boxSize','u_media']),position:gl.getAttribLocation(program,'a_pos'),values:{},users:0,invalid:false};
  variants.set(programKey,entry);
 }
 const owned=entry,group=variants;owned.users++;let released=false;
 const invalidate=()=>{owned.invalid=true;if(group.get(programKey)===owned)group.delete(programKey);if(!group.size&&programs.get(gl)===group)programs.delete(gl)};
 // Each owner removes its listener when released, including after context loss.
 canvas.addEventListener('webglcontextlost',invalidate,{once:true});
 return{...owned,release(){if(released)return;released=true;canvas.removeEventListener('webglcontextlost',invalidate);if(--owned.users)return;if(!owned.invalid&&!gl.isContextLost())releaseProgram(gl,owned.program);if(group.get(programKey)===owned)group.delete(programKey);if(!group.size&&programs.get(gl)===group)programs.delete(gl)}};
}

/** Direct full-source sampling retains shared uploads and avoids clipping large refractions. */
export function installLiquidGLOptics(instance: EngineContext) {
 const renderer=instance.renderer,gl=renderer.gl,startTime=performance.now();
 const maxTexture=gl.getParameter(gl.MAX_TEXTURE_SIZE);
 let programLease:ReturnType<typeof acquireProgram>|undefined;
 let program:WebGLProgram|null=null,lease:ReturnType<typeof acquireTexture>|undefined;
 let uniforms:Record<string,WebGLUniformLocation|null>={},values:Record<string,number[]>={};
 let position=0,leasedImage:HTMLCanvasElement|HTMLVideoElement|undefined,leasedVersion:number|undefined;
 const one=(name:string,n:number,integer=false)=>{
  if(values[name]?.[0]===n)return;
  if(integer)gl.uniform1i(uniforms[name],n);else gl.uniform1f(uniforms[name],n);
  (values[name]??=[])[0]=n;
 };
 const two=(name:string,x:number,y:number)=>{
  const v=values[name]??(values[name]=[]);if(v[0]===x&&v[1]===y)return;
  gl.uniform2f(uniforms[name],x,y);v[0]=x;v[1]=y;
 };
 const four=(name:string,x:number,y:number,z:number,w:number)=>{
  const v=values[name]??(values[name]=[]);if(v[0]===x&&v[1]===y&&v[2]===z&&v[3]===w)return;
  gl.uniform4f(uniforms[name],x,y,z,w);v[0]=x;v[1]=y;v[2]=z;v[3]=w;
 };
 const reset=()=>{programLease?.release();programLease=undefined;program=null;lease=undefined;values={};uniforms={};leasedImage=undefined;leasedVersion=undefined;};
 renderer.canvas.addEventListener('webglcontextrestored',reset);
 const destroy=instance.destroy.bind(instance);
 instance.destroy=()=>{renderer.canvas.removeEventListener('webglcontextrestored',reset);lease?.release();lease=undefined;leasedImage=undefined;reset();destroy();};
 const value=(n:number|undefined,fallback:number,min=0,max=1)=>Number.isFinite(n)?Math.max(min,Math.min(max,n!)):fallback;
 const draw=(image:HTMLCanvasElement|HTMLVideoElement,rect:DOMRect,source:DOMRect,width:number,height:number,dpr:number,padding:number,options:WebGLOptions,version?:number,target?:{prepare:(w:number,h:number)=>void})=>{
  if(renderer.contextLost)return;
  if(!program){programLease=acquireProgram(renderer);program=programLease.program;uniforms=programLease.uniforms;values=programLease.values;position=programLease.position;}
  const isVideo=image instanceof HTMLVideoElement;
  const imageWidth=isVideo?image.videoWidth:image.width,imageHeight=isVideo?image.videoHeight:image.height;
  if(!imageWidth||!imageHeight||imageWidth>maxTexture||imageHeight>maxTexture){
    const sampling=isVideo?undefined:snapshotUpdate(image);
    if(sampling?.rejectAlignment&&imageWidth&&imageHeight&&sampling.samplingWidth!<=maxTexture&&sampling.samplingHeight!<=maxTexture)throw recoverableTextureError('LiquidGlass: aligned snapshot exceeds this context');
    throw new Error('LiquidGlass: source exceeds WebGL texture limits');
  }
  gl.activeTexture(gl.TEXTURE0);
  if(!lease||leasedImage!==image||leasedVersion!==version){
    const next=acquireTexture(gl,image,false,version);lease?.release();lease=next;leasedImage=image;leasedVersion=version;
  }
  // Align the independently presented canvas with liquidGL's global device-pixel grid.
  const left=Math.round(rect.left*dpr),top=Math.round(rect.top*dpr);
  const boxW=rect.width*dpr,boxH=rect.height*dpr,pad=Math.round(padding*dpr);
  const viewW=Math.round((rect.left+rect.width)*dpr)-left,viewH=Math.round((rect.top+rect.height)*dpr)-top;
  const w=viewW+pad*2,h=viewH+pad*2;
  if(target)target.prepare(w,h);else{renderer.width=w;renderer.height=h;
  if(renderer.canvas.width!==w)renderer.canvas.width=w;if(renderer.canvas.height!==h)renderer.canvas.height=h;renderer.clear();}
 gl.disable(gl.BLEND);gl.useProgram(program);gl.bindTexture(gl.TEXTURE_2D,lease.texture);
  one('u_tex',0,true);
  gl.viewport(pad,pad,viewW,viewH);
  two('u_resolution',viewW,viewH);two('u_subpixel',rect.left*dpr-left,viewH-boxH-(rect.top*dpr-top));
  two('u_boxSize',boxW,boxH);
  four('u_bounds',(rect.left-source.left)/source.width,(rect.top-source.top)/source.height,rect.width/source.width,rect.height/source.height);
  const sampling=snapshotUpdate(image);
  two('u_textureResolution',isVideo?source.width*Math.min(devicePixelRatio||1,2):(sampling?.samplingWidth??image.width),isVideo?source.height*Math.min(devicePixelRatio||1,2):(sampling?.samplingHeight??image.height));
  let mx=0,my=0,mw=1,mh=1;
  if(isVideo){
    const style=getComputedStyle(image),sw=image.videoWidth,sh=image.videoHeight;
    const fit=style.objectFit==='cover'?Math.max(source.width/sw,source.height/sh):style.objectFit==='fill'?0:Math.min(source.width/sw,source.height/sh);
    if(fit){mw=source.width/(sw*fit);mh=source.height/(sh*fit);const position=style.objectPosition.split(' ');const align=(v:string,remaining:number)=>v.endsWith('%')?parseFloat(v)/100*remaining:parseFloat(v)||0;mx=-align(position[0],source.width-sw*fit)/(sw*fit);my=-align(position[1]??'50%',source.height-sh*fit)/(sh*fit);}
  }
  four('u_media',mx,my,mw,mh);
  const optics=options.liquidGL;
  one('u_refraction',value(optics?.refraction,.006));one('u_bevelDepth',value(optics?.bevelDepth,.015));
  one('u_bevelWidth',value(optics?.bevelWidth,.15,.0001));one('u_frost',value(optics?.frost,Math.max(0,options.blur)/8,0,20));
  one('u_aberration',value(optics?.aberration,0,0,10));one('u_specular',optics?.specular?1:0,true);
  one('u_radius',options.radius*dpr);if(optics?.specular)one('u_time',(performance.now()-startTime)/1000);
  gl.bindBuffer(gl.ARRAY_BUFFER,renderer.quadBuf);gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  const stableScale=(n:number)=>Math.abs(n-1)<.00001?1:n;
  const sx=stableScale(rect.width/width),sy=stableScale(rect.height/height);
  return {w,h,cssWidth:w/dpr/sx,cssHeight:h/dpr/sy,left:((left-pad)/dpr-rect.left)/sx,top:((top-pad)/dpr-rect.top)/sy};
 };
 draw.release=()=>{lease?.release();reset();};
 return draw;
}

/** Probe once: some implementations transfer straight-alpha WebGL bitmaps incorrectly. */
installLiquidGLOptics.supportsBitmap=()=>sharedValue('bitmap-transfer.v1',()=>{
 if(typeof OffscreenCanvas==='undefined'||!OffscreenCanvas.prototype.transferToImageBitmap)return false;
 const read=document.createElement('canvas');read.width=read.height=2;
 let source:OffscreenCanvas|undefined,gl:WebGLRenderingContext|null=null;
 try{
  source=new OffscreenCanvas(2,2);gl=source.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)return false;
  gl.clearColor(.25,.1,.3,.5);gl.clear(gl.COLOR_BUFFER_BIT);
  const ctx=read.getContext('2d');if(!ctx)return false;
  const image=source.transferToImageBitmap();try{ctx.drawImage(image,0,0)}finally{image.close()}
  const pixel=ctx.getImageData(0,0,1,1).data;
  return Math.abs(pixel[0]-64)<=2&&Math.abs(pixel[1]-26)<=2&&Math.abs(pixel[2]-78)<=2&&Math.abs(pixel[3]-128)<=2;
 }catch{return false}
 finally{
  read.width=read.height=0;gl?.getExtension('WEBGL_lose_context')?.loseContext();if(source)source.width=source.height=0;
 }
});
