import type {GlassRenderer} from '../../vendor/ybouane/GlassRenderer';
import type {WebGLOptions} from './types';
import {liquidGLFragment} from './liquidGLOptics';
import {snapshotUpdate} from './snapshotUpdates';
import {acquireTexture} from './textureCache';

type Pane={rect:DOMRect;width:number;height:number};
type Layout={root:DOMRect;back:DOMRect;dpr:number;panes:Pane[]};
const vertex=`precision highp float;attribute vec2 a_pos;attribute vec4 a_view;attribute vec4 a_bounds;attribute vec4 a_pixels;attribute vec3 a_coverage;uniform vec2 u_atlasSize;
varying vec2 v_uv;varying vec2 u_resolution;varying vec4 u_bounds;varying vec2 u_subpixel;varying vec2 u_boxSize;varying float u_radius;
void main(){v_uv=a_pos*.5+.5;u_resolution=a_pixels.xy;u_boxSize=a_pixels.zw;u_bounds=a_bounds;u_subpixel=a_coverage.xy;u_radius=a_coverage.z;vec2 p=a_view.xy+v_uv*a_view.zw;gl_Position=vec4(p/u_atlasSize*2.-1.,0.,1.);}`;
const fragment=liquidGLFragment.replace(/uniform\s+(vec[24]|float)\s+(u_resolution|u_bounds|u_subpixel|u_boxSize|u_radius);/g,'varying $1 $2;');
const blitVertex=`precision highp float;attribute vec2 a_pos;attribute vec4 a_dest;attribute vec4 a_region;uniform vec2 u_targetSize;varying vec2 v_uv;
void main(){vec2 uv=a_pos*.5+.5;v_uv=a_region.xy+uv*a_region.zw;gl_Position=vec4((a_dest.xy+uv*a_dest.zw)/u_targetSize*2.-1.,0.,1.);}`;
const blitFragment=`precision highp float;varying vec2 v_uv;uniform sampler2D u_lens;void main(){vec4 c=texture2D(u_lens,v_uv);gl_FragColor=vec4(c.rgb*c.a,c.a);}`;
const MAX_ATLAS_PIXELS=2*1024*1024;
const powerOfTwo=(n:number)=>2**Math.ceil(Math.log2(Math.max(1,n)));
const value=(n:number|undefined,fallback:number,min=0,max=1)=>Number.isFinite(n)?Math.max(min,Math.min(max,n!)):fallback;

/** One atlas retains the same RGBA8 intermediate stage as the per-pane renderer.
 * Instancing changes submission only; refraction and straight-alpha composition stay shared. */
export class AtlasScene {
 private ext:ANGLE_instanced_arrays|null;
 private max:number;
 private vaoExt:OES_vertex_array_object|null;private opticsVao:WebGLVertexArrayObjectOES|null=null;private copyVao:WebGLVertexArrayObjectOES|null=null;private cachedUniforms:number[]=[];private targetSize=[0,0];
 private program:WebGLProgram|null=null;private blit:WebGLProgram|null=null;
 private uniforms:Record<string,WebGLUniformLocation|null>={};private copyUniforms:Record<string,WebGLUniformLocation|null>={};
 private geometry:WebGLBuffer|null=null;private copies:WebGLBuffer|null=null;
 private texture:WebGLTexture|null=null;private fbo:WebGLFramebuffer|null=null;
 private w=0;private h=0;private layout?:Float64Array;private scratch?:Float64Array;private image?:HTMLCanvasElement;private version?:number;
 private lease?:ReturnType<typeof acquireTexture>;private attributes:number[]=[];
 private started=performance.now();
 constructor(private renderer:GlassRenderer){const gl=renderer.gl;this.ext=gl.getExtension('ANGLE_instanced_arrays');this.max=gl.getParameter(gl.MAX_TEXTURE_SIZE);this.vaoExt=gl.getExtension('OES_vertex_array_object');}
 private bindings(program:WebGLProgram,buffer:WebGLBuffer,stride:number,fields:Array<[string,number,number]>){
  const gl=this.renderer.gl,ext=this.ext!;
  gl.bindBuffer(gl.ARRAY_BUFFER,this.renderer.quadBuf);const pos=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);ext.vertexAttribDivisorANGLE(pos,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);this.attributes=[];
  for(const[name,size,offset]of fields){const at=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,stride*4,offset*4);ext.vertexAttribDivisorANGLE(at,1);this.attributes.push(at)}
 }
 private unbind(){const gl=this.renderer.gl;for(const at of this.attributes){this.ext!.vertexAttribDivisorANGLE(at,0);gl.disableVertexAttribArray(at)}this.attributes=[];}
 render(image:HTMLCanvasElement|HTMLVideoElement,m:Layout,options:WebGLOptions,version:number|undefined,force:boolean):boolean{
  // Video and extreme/unsupported layouts keep the original path.
  if(!Number.isInteger(m.dpr)||!this.ext||image instanceof HTMLVideoElement||m.panes.length<2||m.panes.length>64||!image.width||!image.height||image.width>this.max||image.height>this.max)return false;
  const gl=this.renderer.gl,pad=Math.round(20*m.dpr),targetW=this.renderer.canvas.width,targetH=this.renderer.canvas.height;
  // A large atlas did not improve the measured 24-pane workload. Bound both
  // intermediate memory and batching work; large surfaces keep the old path.
  let minimumArea=0;
  for(const p of m.panes){const r=p.rect;if(p.width>0&&p.height>0&&r.right>m.root.left&&r.left<m.root.right&&r.bottom>m.root.top&&r.top<m.root.bottom)minimumArea+=(Math.floor(r.width*m.dpr)+2*pad)*(Math.floor(r.height*m.dpr)+2*pad)}
  if(minimumArea>MAX_ATLAS_PIXELS)return false;
  const length=12+m.panes.length*6;
  if(this.scratch?.length!==length)this.scratch=new Float64Array(length);
  const next=this.scratch;
  next.set([targetW,targetH,options.radius,m.dpr,m.root.left,m.root.top,m.root.width,m.root.height,m.back.left,m.back.top,m.back.width,m.back.height]);
  m.panes.forEach((p,i)=>{const at=12+i*6;next[at]=p.rect.left;next[at+1]=p.rect.top;next[at+2]=p.rect.width;next[at+3]=p.rect.height;next[at+4]=p.width;next[at+5]=p.height});
  const geometryChanged=this.layout?.length!==length||next.some((n,i)=>n!==this.layout![i]);
  if(!force&&!options.liquidGL?.specular&&!geometryChanged&&image===this.image&&version===this.version)return true;
  const rows=m.panes.map(p=>{
   const r=p.rect,visible=p.width>0&&p.height>0&&r.right>m.root.left&&r.left<m.root.right&&r.bottom>m.root.top&&r.top<m.root.bottom;
   const left=Math.round(r.left*m.dpr),top=Math.round(r.top*m.dpr),vw=Math.round((r.left+r.width)*m.dpr)-left,vh=Math.round((r.top+r.height)*m.dpr)-top;
   return{p,visible,left,top,vw,vh,fw:vw+2*pad,fh:vh+2*pad};
  }).filter(p=>p.visible);
  if(!rows.length)return false;
  const cellW=Math.ceil(Math.max(...rows.map(r=>r.fw))/4)*4,cellH=Math.ceil(Math.max(...rows.map(r=>r.fh))/4)*4;
  let cols=0,aw=0,ah=0,area=Infinity;
  for(let n=1;n<=rows.length;n++){const w=powerOfTwo(n*cellW),h=powerOfTwo(Math.ceil(rows.length/n)*cellH);if(w<=this.max&&h<=this.max&&w*h<area){cols=n;aw=w;ah=h;area=w*h}}
  if(!cols||area>MAX_ATLAS_PIXELS||area>rows.reduce((s,r)=>s+r.fw*r.fh,0)*4)return false;
  if(!this.program){
   this.program=this.renderer._link(vertex,fragment);this.blit=this.renderer._link(blitVertex,blitFragment);
   this.uniforms=this.renderer._uloc(this.program,['u_tex','u_media','u_textureResolution','u_refraction','u_aberration','u_bevelDepth','u_bevelWidth','u_frost','u_time','u_specular','u_atlasSize']);
   this.copyUniforms=this.renderer._uloc(this.blit,['u_lens','u_targetSize']);
   this.geometry=gl.createBuffer();this.copies=gl.createBuffer();this.texture=gl.createTexture();this.fbo=gl.createFramebuffer();
   if(!this.geometry||!this.copies||!this.texture||!this.fbo)throw Error('Atlas allocation failed');
   if(this.vaoExt){
    this.opticsVao=this.vaoExt.createVertexArrayOES();this.copyVao=this.vaoExt.createVertexArrayOES();
    if(!this.opticsVao||!this.copyVao)throw Error('Atlas vertex array allocation failed');
    this.vaoExt.bindVertexArrayOES(this.opticsVao);this.bindings(this.program,this.geometry,15,[['a_view',4,0],['a_bounds',4,4],['a_pixels',4,8],['a_coverage',3,12]]);
    this.vaoExt.bindVertexArrayOES(this.copyVao);this.bindings(this.blit,this.copies,8,[['a_dest',4,0],['a_region',4,4]]);
    this.vaoExt.bindVertexArrayOES(null);this.attributes=[];
   }
  }
  if(this.w!==aw||this.h!==ah){
   gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,aw,ah,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Atlas framebuffer incomplete');this.w=aw;this.h=ah;
  }
  const geometry=new Float32Array(rows.length*15),copies=new Float32Array(rows.length*8);
  rows.forEach((r,i)=>{
   const {p}=r,box=p.rect,x=(i%cols)*cellW,y=Math.floor(i/cols)*cellH;
   geometry.set([x+pad,y+pad,r.vw,r.vh,(box.left-m.back.left)/m.back.width,(box.top-m.back.top)/m.back.height,box.width/m.back.width,box.height/m.back.height,r.vw,r.vh,box.width*m.dpr,box.height*m.dpr,box.left*m.dpr-r.left,r.vh-box.height*m.dpr-(box.top*m.dpr-r.top),Math.min(options.radius,p.width/2,p.height/2)*m.dpr],i*15);
   const left=Math.round((box.left-m.root.left)*m.dpr)-pad,top=Math.round((box.top-m.root.top)*m.dpr)-pad;
   copies.set([left,targetH-top-r.fh,r.fw,r.fh,x/aw,y/ah,r.fw/aw,r.fh/ah],i*8);
  });
  gl.activeTexture(gl.TEXTURE0);
  if(image!==this.image||version!==this.version||!this.lease){const next=acquireTexture(gl,image,false,version);this.lease?.release();this.lease=next;}
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,aw,ah);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(this.program);gl.bindTexture(gl.TEXTURE_2D,this.lease.texture);const u=this.uniforms,o=options.liquidGL;
  const sampling=snapshotUpdate(image);
  const constants=[sampling?.samplingWidth??image.width,sampling?.samplingHeight??image.height,aw,ah,value(o?.refraction,.006),value(o?.bevelDepth,.015),value(o?.bevelWidth,.15,.0001),value(o?.frost,Math.max(0,options.blur)/8,0,20),value(o?.aberration,0,0,10),o?.specular?1:0];
  if(constants.some((n,i)=>n!==this.cachedUniforms[i])){
   gl.uniform1i(u.u_tex,0);gl.uniform4f(u.u_media,0,0,1,1);gl.uniform2f(u.u_textureResolution,constants[0],constants[1]);gl.uniform2f(u.u_atlasSize,aw,ah);
   gl.uniform1f(u.u_refraction,constants[4]);gl.uniform1f(u.u_bevelDepth,constants[5]);gl.uniform1f(u.u_bevelWidth,constants[6]);gl.uniform1f(u.u_frost,constants[7]);gl.uniform1f(u.u_aberration,constants[8]);gl.uniform1i(u.u_specular,constants[9]);this.cachedUniforms=constants;
  }
  if(o?.specular)gl.uniform1f(u.u_time,(performance.now()-this.started)/1000);
  if(geometryChanged){gl.bindBuffer(gl.ARRAY_BUFFER,this.geometry);gl.bufferData(gl.ARRAY_BUFFER,geometry,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,this.copies);gl.bufferData(gl.ARRAY_BUFFER,copies,gl.DYNAMIC_DRAW);}
  if(this.vaoExt)this.vaoExt.bindVertexArrayOES(this.opticsVao);else this.bindings(this.program,this.geometry!,15,[['a_view',4,0],['a_bounds',4,4],['a_pixels',4,8],['a_coverage',3,12]]);
  this.ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP,0,4,rows.length);if(this.vaoExt)this.vaoExt.bindVertexArrayOES(null);else this.unbind();
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,targetW,targetH);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.blit);gl.bindTexture(gl.TEXTURE_2D,this.texture);
  if(this.targetSize[0]!==targetW||this.targetSize[1]!==targetH){gl.uniform1i(this.copyUniforms.u_lens,0);gl.uniform2f(this.copyUniforms.u_targetSize,targetW,targetH);this.targetSize=[targetW,targetH]}
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  if(this.vaoExt)this.vaoExt.bindVertexArrayOES(this.copyVao);else this.bindings(this.blit!,this.copies!,8,[['a_dest',4,0],['a_region',4,4]]);
  this.ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP,0,4,rows.length);if(this.vaoExt)this.vaoExt.bindVertexArrayOES(null);else this.unbind();gl.disable(gl.BLEND);
  if(!this.layout&&gl.getError()!==gl.NO_ERROR)throw Error('Atlas rendering unavailable');
  if(geometryChanged)this.layout=new Float64Array(next);this.image=image;this.version=version;return true;
 }
 reset(){this.attributes=[];this.opticsVao=this.copyVao=null;this.cachedUniforms=[];this.targetSize=[0,0];this.vaoExt=this.renderer.gl.isContextLost()?null:this.renderer.gl.getExtension('OES_vertex_array_object');this.program=this.blit=null;this.geometry=this.copies=null;this.texture=null;this.fbo=null;this.lease=undefined;this.w=this.h=0;this.layout=this.scratch=undefined;this.image=undefined;this.version=undefined;this.ext=this.renderer.gl.isContextLost()?null:this.renderer.gl.getExtension('ANGLE_instanced_arrays');}
 destroy(){const gl=this.renderer.gl;if(!this.renderer.contextLost)this.unbind();this.lease?.release();if(!this.renderer.contextLost){if(this.opticsVao)this.vaoExt?.deleteVertexArrayOES(this.opticsVao);if(this.copyVao)this.vaoExt?.deleteVertexArrayOES(this.copyVao);if(this.texture)gl.deleteTexture(this.texture);if(this.fbo)gl.deleteFramebuffer(this.fbo);if(this.geometry)gl.deleteBuffer(this.geometry);if(this.copies)gl.deleteBuffer(this.copies);if(this.program)gl.deleteProgram(this.program);if(this.blit)gl.deleteProgram(this.blit)}this.reset();}
}
