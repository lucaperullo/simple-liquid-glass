import { sharedValue } from '../shared';
import { snapshotUpdate, recoverableTextureError } from './snapshotUpdates';
interface Entry { texture: WebGLTexture; users: number; version?: number; snapshotVersion?:number; width:number;height:number;invalid?:boolean;allocated?:boolean }
const contexts=sharedValue('textures.delta.v1',()=>new WeakMap<WebGLRenderingContext,WeakMap<object,Map<boolean,Entry>>>());
const limits=new WeakMap<WebGLRenderingContext,number>();
const textureLimit=(gl:WebGLRenderingContext)=>{let limit=limits.get(gl);if(limit===undefined){limit=Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||0;limits.set(gl,limit)}return limit};
export function acquireTexture(gl:WebGLRenderingContext,image:TexImageSource,flip:boolean,version?:number){
 let cache=contexts.get(gl);if(!cache){cache=new WeakMap();contexts.set(gl,cache)}
 const update=snapshotUpdate(image),size=image as {width?:number;height?:number;videoWidth?:number;videoHeight?:number;naturalWidth?:number;naturalHeight?:number};
 const width=size.videoWidth??size.naturalWidth??size.width??0,height=size.videoHeight??size.naturalHeight??size.height??0;
 // Alignment may promote a raster slightly above the original policy. That
 // excess must never disable rendering: reject it, let Source recapture at the
 // original scale and skip frames until the replacement arrives.
 const aligned=!!update?.rejectAlignment;
 if(aligned){
  if(update!.rejected)throw recoverableTextureError('LiquidGlass: aligned snapshot rejected');
  const limit=textureLimit(gl);
  if((width>limit||height>limit)&&update!.samplingWidth!<=limit&&update!.samplingHeight!<=limit)throw recoverableTextureError('LiquidGlass: aligned snapshot exceeds this context');
 }
 const reject=(message:string)=>{update!.rejected=true;update!.rejectAlignment!();return recoverableTextureError(message)};
 let key:object=update?.source??image;
 let variants=cache.get(key),entry=variants?.get(flip);
 // An explicitly requested older snapshot gets its own immutable texture.
 const live=!!update&&(!entry||update.version>=(entry.snapshotVersion??0));
 if(update&&!live){key=image;variants=cache.get(key);entry=variants?.get(flip)}
 if(!variants){variants=new Map();cache.set(key,variants)}
 const upload=(partial=false)=>{
  gl.bindTexture(gl.TEXTURE_2D,entry!.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip?1:0);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0);
  try{
   if(partial){
    try{for(const patch of update!.patches!){const y=flip?height-patch.y-patch.canvas.height:patch.y;gl.texSubImage2D(gl.TEXTURE_2D,0,patch.x,y,gl.RGBA,gl.UNSIGNED_BYTE,patch.canvas)}}
    catch{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image)}
   }else{
    // Only a new aligned allocation pays for synchronous error queries.
    const checked=aligned&&(entry!.width!==width||entry!.height!==height||!entry!.allocated);
    if(checked)for(let i=0;i<8&&gl.getError()!==gl.NO_ERROR;i++);
    try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image)}catch(error){if(checked)throw reject('LiquidGlass: aligned snapshot upload failed');throw error}
    if(checked){const error=gl.getError();if(error===gl.OUT_OF_MEMORY||error===gl.INVALID_VALUE)throw reject('LiquidGlass: aligned snapshot allocation failed')}
    entry!.allocated=true;
   }
  }finally{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0)}
 };
 try{
  if(!entry){
   const texture=gl.createTexture();if(!texture)throw new Error('LiquidGlass: texture allocation failed');
   entry={texture,users:0,width,height};upload();
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   variants.set(flip,entry);entry.version=version;entry.snapshotVersion=live?update!.version:undefined;
  }else if(live&&entry.snapshotVersion!==update!.version){
   const partial=entry.width===width&&entry.height===height&&entry.snapshotVersion===update!.previous&&!!update!.patches?.length&&update!.patches!.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.canvas.width>0&&p.canvas.height>0&&p.x+p.canvas.width<=width&&p.y+p.canvas.height<=height);
   upload(partial);entry.version=version;entry.snapshotVersion=update!.version;entry.width=width;entry.height=height;
  }else if(version!==undefined&&entry.version!==version){upload();entry.version=version;entry.width=width;entry.height=height;}
 }catch(error){if(entry){entry.invalid=true;gl.deleteTexture(entry.texture);if(variants.get(flip)===entry)variants.delete(flip)}throw error}
 entry.users++;const owned=entry;let released=false;
 return{texture:owned.texture,release(){if(released)return;released=true;if(--owned.users)return;if(!owned.invalid&&contexts.get(gl)===cache&&!gl.isContextLost())gl.deleteTexture(owned.texture);if(variants!.get(flip)===owned)variants!.delete(flip);if(!variants!.size)cache!.delete(key)}};
}
export function invalidateTextures(gl:WebGLRenderingContext){contexts.delete(gl)}
