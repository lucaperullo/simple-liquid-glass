import { DISPERSION_SPREAD } from '../../vendor/samasante/displacement';
import { VS_GLASS } from '../../vendor/ybouane/shaders';

import type { EngineContext, WebGLOptions } from './types';
import type { GlassConfig } from '../../vendor/ybouane/defaults';
const fragment = `precision highp float;
uniform sampler2D u_bgTex, u_blurTex, u_lensMap;
uniform vec2 u_size, u_res;
uniform float u_radius, u_alpha, u_mapScale, u_mapDispersion, u_mapSpecular, u_classic, u_saturation, u_additive, u_neutral;
uniform float u_shadowAlpha, u_shadowSpread, u_shadowOffY;
varying vec2 v_localPx, v_screenUV;
float sdf(vec2 p, vec2 b, float r) {vec2 q=abs(p)-b+vec2(r);return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;}
void main(){
 float d=sdf(v_localPx,u_size*.5,min(u_radius,min(u_size.x,u_size.y)*.5));
 if(d>0.0){float s=max(sdf(v_localPx-vec2(0.0,u_shadowOffY),u_size*.5,u_radius)-1.0,0.0);
 gl_FragColor=vec4(0.0,0.0,0.0,exp(-s*s/max(1.0,u_shadowSpread*u_shadowSpread))*u_shadowAlpha);return;}
 vec2 mapUV=v_localPx/u_size+.5;
 vec3 m=texture2D(u_lensMap,mapUV).rgb;
 vec2 delta=(mix(m.rg,m.rb,u_classic)-u_neutral)*vec2(1.0,-1.0)/u_res;
 float red=mix(u_mapScale*(1.0+u_mapDispersion),u_mapScale+u_mapDispersion,u_additive);
 float green=mix(u_mapScale*(1.0+u_mapDispersion*.5),u_mapScale,u_additive);
 float blue=mix(u_mapScale,u_mapScale-u_mapDispersion,u_additive);
 if(u_additive>.5 && u_classic<.5) blue=max(0.0,blue);
 vec4 rSample=texture2D(u_blurTex,v_screenUV+delta*red);
 vec4 gSample=texture2D(u_blurTex,v_screenUV+delta*green);
 vec4 bSample=texture2D(u_blurTex,v_screenUV+delta*blue);
 vec3 col=vec3(rSample.r,gSample.g,bSample.b);
 float sourceAlpha=max(rSample.a,max(gSample.a,bSample.a));
 col=mix(vec3(dot(col,vec3(.2126,.7152,.0722))),col,u_saturation);
 col+=max(0.0,m.b-128.0/255.0)*u_mapSpecular;
 gl_FragColor=vec4(clamp(col,0.0,1.0),u_alpha*sourceAlpha*(1.0-smoothstep(-1.5,.5,d)));
}`;

/** Use exactly the package's map, axis channels, scale normalization and dispersion split. */
export function installPackageOptics(instance: EngineContext, settings: () => WebGLOptions) {
 const renderer=instance.renderer, gl: WebGLRenderingContext=renderer.gl;
 const original=renderer.renderGlassPanel.bind(renderer);
 let program: WebGLProgram|null=null, texture: WebGLTexture|null=null;
 let wanted='', generation=0;
 let locations: Record<string,WebGLUniformLocation|null>={};
 const state={ready:false,failed:false,mapUploads:0,mapUrl:'',scale:0};
 const reset=()=>{program=null;texture=null;wanted='';generation++;state.ready=false;};
 renderer.canvas.addEventListener('webglcontextrestored',reset);
 const destroy=instance.destroy.bind(instance);
 instance.destroy=()=>{generation++;renderer.canvas.removeEventListener('webglcontextrestored',reset);if(texture)gl.deleteTexture(texture);destroy();};
 renderer.renderGlassPanel=(config:GlassConfig,width:number,height:number,dpr:number)=>{
  const controls=settings();
  const uri=controls.map;
  if(uri!==wanted){
   wanted=uri;state.failed=false;const version=++generation;const image=new Image();
   image.onload=()=>{if(version!==generation||renderer.contextLost)return;
    texture ||= gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    state.ready=true;state.mapUploads++;state.mapUrl=uri;instance.markChanged();
   };image.onerror=()=>{if(version===generation){state.failed=true;instance.markChanged();}};image.src=uri;
  }
  if(!texture)return;
  if(!program){program=renderer._link(VS_GLASS,fragment);gl.deleteProgram(renderer.glassP);renderer.glassP=program;
   renderer.glassU=renderer._uloc(program,Object.keys(renderer.glassU));
   locations=renderer._uloc(program,['u_lensMap','u_mapScale','u_mapDispersion','u_mapSpecular','u_classic','u_saturation','u_additive','u_neutral']);}
  state.scale=controls.scale;
  gl.useProgram(program);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.uniform1i(locations.u_lensMap,2);gl.uniform1f(locations.u_mapScale,state.scale*dpr);
  gl.uniform1f(locations.u_mapDispersion,((controls.additiveDispersion??controls.classic)?dpr:DISPERSION_SPREAD)*controls.dispersion);gl.uniform1f(locations.u_mapSpecular,controls.specular);
  gl.uniform1f(locations.u_classic,controls.classic?1:0);gl.uniform1f(locations.u_saturation,controls.saturation/100);
  gl.uniform1f(locations.u_additive,(controls.additiveDispersion??controls.classic)?1:0);gl.uniform1f(locations.u_neutral,controls.neutralPoint??.5);
  original(config,width,height,dpr);
 };
 return state;
}
