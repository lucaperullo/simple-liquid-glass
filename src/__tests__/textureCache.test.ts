/** @jest-environment jsdom */
import { acquireTexture, invalidateTextures } from '../core/webgl/textureCache';

function context() {
 let serial=0;
 return { TEXTURE_2D:3553, UNPACK_FLIP_Y_WEBGL:37440, UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441,
  RGBA:6408, UNSIGNED_BYTE:5121, TEXTURE_MIN_FILTER:10241, TEXTURE_MAG_FILTER:10240,
  TEXTURE_WRAP_S:10242, TEXTURE_WRAP_T:10243, LINEAR:9729, CLAMP_TO_EDGE:33071,
  createTexture:jest.fn(()=>({serial:++serial})),deleteTexture:jest.fn(),bindTexture:jest.fn(),
  pixelStorei:jest.fn(),texImage2D:jest.fn(),texParameteri:jest.fn(),isContextLost:()=>false };
}

test('native and analytical orientations share only compatible uploads and release independently',()=>{
 const mock=context(),gl=mock as unknown as WebGLRenderingContext,image=document.createElement('canvas');
 const a=acquireTexture(gl,image,false),b=acquireTexture(gl,image,false),flipped=acquireTexture(gl,image,true);
 expect(a.texture).toBe(b.texture);expect(flipped.texture).not.toBe(a.texture);expect(mock.texImage2D).toHaveBeenCalledTimes(2);
 a.release();expect(mock.deleteTexture).not.toHaveBeenCalled();b.release();expect(mock.deleteTexture).toHaveBeenCalledWith(a.texture);
 expect(mock.deleteTexture).toHaveBeenCalledTimes(1);flipped.release();expect(mock.deleteTexture).toHaveBeenCalledTimes(2);
 flipped.release();expect(mock.deleteTexture).toHaveBeenCalledTimes(2);
});

test('a decoded frame uploads once across all surfaces without replacing their texture',()=>{
 const mock=context(),gl=mock as unknown as WebGLRenderingContext,image=document.createElement('canvas');
 const a=acquireTexture(gl,image,false,10),b=acquireTexture(gl,image,false,10);
 expect(mock.texImage2D).toHaveBeenCalledTimes(1);
 const c=acquireTexture(gl,image,false,11),d=acquireTexture(gl,image,false,11);
 expect(mock.texImage2D).toHaveBeenCalledTimes(2);expect(c.texture).toBe(a.texture);expect(d.texture).toBe(a.texture);
 for(const lease of[a,b,c,d])lease.release();expect(mock.deleteTexture).toHaveBeenCalledTimes(1);
});

test('restored contexts acquire new textures without releasing another generation',()=>{
 const mock=context(),gl=mock as unknown as WebGLRenderingContext,image=document.createElement('canvas');
 const old=acquireTexture(gl,image,false);invalidateTextures(gl);const restored=acquireTexture(gl,image,false);
 expect(restored.texture).not.toBe(old.texture);old.release();expect(mock.deleteTexture).not.toHaveBeenCalled();
 restored.release();expect(mock.deleteTexture).toHaveBeenCalledTimes(1);expect(mock.deleteTexture).toHaveBeenCalledWith(restored.texture);
});
