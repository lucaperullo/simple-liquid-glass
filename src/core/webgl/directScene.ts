import {releaseProgram} from '../../vendor/ybouane/GlassRenderer';
import {AtlasScene} from './atlasScene';
import {GlassRenderer} from '../../vendor/ybouane/GlassRenderer';
import {installLiquidGLOptics} from './liquidGLOptics';
import {acquireSource} from './source';
import {invalidateTextures} from './textureCache';
import {isRecoverableTextureError} from './snapshotUpdates';
import {canvasFrame,liveCanvasFrame} from './canvasFrames';
import {subscribeFrame} from './contextPool';
import {VS_QUAD} from '../../vendor/ybouane/shaders';
import type {EngineContext,WebGLOptions} from './types';
/** Research prototype: one flat overlay, all HTML content above the glass plane.
 * Per-lens FBOs retain the original shader viewport; GPU composition avoids bitmap/2D copies.
 * Arbitrary nested clips, interleaved z-stacking and rotated panes are outside this prototype. */
export function createDirectScene(overlay:HTMLElement,panels:HTMLElement[],source:HTMLElement,options:WebGLOptions){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true});
 if(!gl)throw Error('Shared scene: WebGL unavailable');
 const renderer=new GlassRenderer(canvas);
 const atlas=new AtlasScene(renderer);let atlasActive=false,atlasFailed=false;
 canvas.style.cssText='display:block;position:absolute;left:0;top:0;pointer-events:none;z-index:0';
 canvas.dataset.simpleDirectScene='';canvas.setAttribute('aria-hidden','true');overlay.prepend(canvas);
 let disposed=false,dirty=true,ready=false,failed=false,mediaVersion=0,videoCallback:number|undefined,measured:ReturnType<typeof measure>|undefined;
 let blit:WebGLProgram|null=null,u:Record<string,WebGLUniformLocation|null>={},blitPosition=0;
 const media=source instanceof HTMLCanvasElement||source instanceof HTMLVideoElement?source:undefined;
 const video=source instanceof HTMLVideoElement?source:undefined;
 const shared=media?undefined:acquireSource(source,error=>{dirty=true;if(error&&!shared?.capture.cache.has(source))failed=true},true,gl.getParameter(gl.MAX_TEXTURE_SIZE));
 const slots=panels.map(panel=>{
  const context:EngineContext={renderer,capture:shared?.capture??{cache:new Map()},markChanged:()=>{dirty=true},destroy:()=>{}};
  const draw=installLiquidGLOptics(context);
  return{panel,context,draw,tex:null as WebGLTexture|null,fbo:null as WebGLFramebuffer|null,w:0,h:0,last:'',image:undefined as HTMLCanvasElement|HTMLVideoElement|undefined,version:undefined as number|undefined,left:0,top:0,visible:false};
 });
 function releaseBuffer(slot:typeof slots[number]){if(!renderer.contextLost){if(slot.tex)gl!.deleteTexture(slot.tex);if(slot.fbo)gl!.deleteFramebuffer(slot.fbo)}slot.tex=null;slot.fbo=null;slot.w=slot.h=0;slot.last='';slot.image=undefined;slot.version=undefined;}
 function measure(){if(disposed||document.hidden||renderer.contextLost)return;const root=overlay.getBoundingClientRect(),back=source.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);return{root,back,dpr,panes:slots.map(s=>({rect:s.panel.getBoundingClientRect(),width:s.panel.offsetWidth,height:s.panel.offsetHeight}))}}
 const lost=(e:Event)=>{e.preventDefault();invalidateTextures(gl!);ready=false;canvas.style.visibility='hidden'};
 const restored=()=>{slots.forEach(releaseBuffer);atlas.reset();atlasActive=false;atlasFailed=false;blit=null;u={};dirty=true;failed=false;canvas.style.visibility='visible'};
 canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
 const changed=()=>{mediaVersion++;dirty=true};video?.addEventListener('seeked',changed);video?.addEventListener('loadeddata',changed);
 const nextVideo:VideoFrameRequestCallback=()=>{mediaVersion++;dirty=true;if(!disposed)videoCallback=video!.requestVideoFrameCallback(nextVideo)};
 if(video?.requestVideoFrameCallback)videoCallback=video.requestVideoFrameCallback(nextVideo);
 const stop=subscribeFrame(()=>{
  const m=measured;measured=undefined;if(disposed||document.hidden||renderer.contextLost||!m||!m.back.width||!m.back.height)return;
  const image=media??shared?.capture.cache.get(source)?.canvas;if(!image||video&&video.readyState<2)return;
  const version=media instanceof HTMLCanvasElement?(canvasFrame(media)??liveCanvasFrame()):video?(videoCallback===undefined?video.currentTime:mediaVersion):shared?.version;
  try{
   const w=Math.max(1,Math.round(m.root.width*m.dpr)),h=Math.max(1,Math.round(m.root.height*m.dpr));
   let changed=dirty||!!options.liquidGL?.specular;
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;changed=true;}
   canvas.style.width=`${m.root.width}px`;canvas.style.height=`${m.root.height}px`;
   let batched=false;
   if(!atlasFailed)try{batched=atlas.render(image,m,options,version,changed)}catch(error){if(isRecoverableTextureError(error))return;atlasFailed=true;atlas.destroy();}
   if(batched){
    if(!atlasActive)slots.forEach(s=>{releaseBuffer(s);s.draw.release();});atlasActive=true;
    slots.forEach((s,i)=>{const p=m.panes[i],r=p.rect;s.visible=p.width>0&&p.height>0&&r.right>m.root.left&&r.left<m.root.right&&r.bottom>m.root.top&&r.top<m.root.bottom});
    dirty=false;ready=true;failed=false;return;
   }
   if(atlasActive){atlas.destroy();atlasActive=false;dirty=true;slots.forEach(s=>s.last='');}
   for(let i=0;i<slots.length;i++){
    const slot=slots[i],p=m.panes[i],r=p.rect;
    const visible=p.width>0&&p.height>0&&r.right>m.root.left&&r.left<m.root.right&&r.bottom>m.root.top&&r.top<m.root.bottom;
    if(visible!==slot.visible)changed=true;slot.visible=visible;if(!visible)continue;
    const key=[r.left-m.back.left,r.top-m.back.top,r.width,r.height,m.back.width,m.back.height,p.width,p.height,m.dpr].join(':');
    slot.left=Math.round((r.left-m.root.left)*m.dpr)-Math.round(20*m.dpr);slot.top=Math.round((r.top-m.root.top)*m.dpr)-Math.round(20*m.dpr);
    if(!dirty&&!options.liquidGL?.specular&&slot.last===key&&slot.image===image&&slot.version===version)continue;
    slot.draw(image,r,m.back,p.width,p.height,m.dpr,20,{...options,radius:Math.min(options.radius,p.width/2,p.height/2)},version,{prepare:(fw,fh)=>{
     if(slot.w!==fw||slot.h!==fh||!slot.fbo){releaseBuffer(slot);slot.tex=gl!.createTexture();slot.fbo=gl!.createFramebuffer();if(!slot.tex||!slot.fbo)throw Error('Shared scene: allocation failed');gl!.bindTexture(gl!.TEXTURE_2D,slot.tex);gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,fw,fh,0,gl!.RGBA,gl!.UNSIGNED_BYTE,null);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.NEAREST);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.NEAREST);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);gl!.bindFramebuffer(gl!.FRAMEBUFFER,slot.fbo);gl!.framebufferTexture2D(gl!.FRAMEBUFFER,gl!.COLOR_ATTACHMENT0,gl!.TEXTURE_2D,slot.tex,0);if(gl!.checkFramebufferStatus(gl!.FRAMEBUFFER)!==gl!.FRAMEBUFFER_COMPLETE)throw Error('Shared scene: incomplete target');slot.w=fw;slot.h=fh;}
     gl!.bindFramebuffer(gl!.FRAMEBUFFER,slot.fbo);gl!.viewport(0,0,fw,fh);gl!.disable(gl!.SCISSOR_TEST);gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);
    }});
    slot.last=key;slot.image=image;slot.version=version;changed=true;
   }
   if(!changed)return;
   if(!blit){blit=renderer._link(VS_QUAD,`precision highp float;varying vec2 v_uv;uniform sampler2D u_lens;void main(){vec4 c=texture2D(u_lens,v_uv);gl_FragColor=vec4(c.rgb*c.a,c.a);}`);u=renderer._uloc(blit,['u_lens']);blitPosition=gl!.getAttribLocation(blit,'a_pos');}
   gl!.bindFramebuffer(gl!.FRAMEBUFFER,null);gl!.disable(gl!.SCISSOR_TEST);gl!.viewport(0,0,w,h);gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);gl!.useProgram(blit);gl!.activeTexture(gl!.TEXTURE0);gl!.uniform1i(u.u_lens,0);gl!.bindBuffer(gl!.ARRAY_BUFFER,renderer.quadBuf);gl!.enableVertexAttribArray(blitPosition);gl!.vertexAttribPointer(blitPosition,2,gl!.FLOAT,false,0,0);gl!.enable(gl!.BLEND);gl!.blendFunc(gl!.ONE,gl!.ONE_MINUS_SRC_ALPHA);
   for(const slot of slots){if(!slot.visible||!slot.tex)continue;gl!.viewport(slot.left,h-slot.top-slot.h,slot.w,slot.h);gl!.bindTexture(gl!.TEXTURE_2D,slot.tex);gl!.drawArrays(gl!.TRIANGLE_STRIP,0,4)}
   gl!.disable(gl!.BLEND);dirty=false;ready=true;failed=false;
  }catch(error){if(isRecoverableTextureError(error))return;failed=true;ready=false;console.error(error)}
 },()=>{measured=measure()});
 if(shared)void shared.refresh().catch(()=>{failed=true});
 return{canvas,refresh:async()=>{await shared?.refresh();dirty=true},status:()=>slots.map(s=>({strategy:renderer.contextLost?'webgl-unavailable':failed?'capture-failed':ready&&s.visible?'active':'pending',backend:'shared-webgl',submission:atlasActive?'instanced':'per-panel'})),destroy(){if(disposed)return;disposed=true;stop();if(videoCallback!==undefined)video?.cancelVideoFrameCallback(videoCallback);video?.removeEventListener('seeked',changed);video?.removeEventListener('loadeddata',changed);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);for(const slot of slots){slot.context.destroy();releaseBuffer(slot)}if(blit&&!renderer.contextLost)releaseProgram(gl!,blit);atlas.destroy();shared?.release();renderer.destroy();gl!.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=canvas.height=0;canvas.remove();}};
}
