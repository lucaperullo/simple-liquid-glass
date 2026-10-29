/** @jest-environment jsdom */
import {acquireTexture} from '../core/webgl/textureCache';
import {markSnapshot,isRecoverableTextureError} from '../core/webgl/snapshotUpdates';
function mock(limit=16384){let id=0;return{TEXTURE_2D:3553,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441,RGBA:6408,UNSIGNED_BYTE:5121,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,LINEAR:9729,CLAMP_TO_EDGE:33071,NO_ERROR:0,OUT_OF_MEMORY:1285,INVALID_VALUE:1281,MAX_TEXTURE_SIZE:3379,
 createTexture:jest.fn(()=>({id:++id})),deleteTexture:jest.fn(),bindTexture:jest.fn(),pixelStorei:jest.fn(),texImage2D:jest.fn(),texSubImage2D:jest.fn(),texParameteri:jest.fn(),isContextLost:()=>false,
 getError:jest.fn(()=>0),getParameter:jest.fn(()=>limit)}}
const canvas=(w=120,h=240)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
const thrown=(f:()=>unknown)=>{try{f()}catch(error){return error}return undefined};

test('a failed aligned allocation is recoverable, requests one recapture and is not retried',()=>{
 const m=mock(),g=m as unknown as WebGLRenderingContext,s={},reject=jest.fn(),a=canvas(122,244);
 markSnapshot(a,{source:s,version:1,previous:0,patches:null,samplingWidth:120,samplingHeight:240,rejectAlignment:reject});
 m.getError.mockReturnValueOnce(0).mockReturnValueOnce(1285);
 const error=thrown(()=>acquireTexture(g,a,false));
 expect(isRecoverableTextureError(error)).toBe(true);expect(reject).toHaveBeenCalledTimes(1);expect(m.deleteTexture).toHaveBeenCalledTimes(1);
 const uploads=m.texImage2D.mock.calls.length;
 expect(isRecoverableTextureError(thrown(()=>acquireTexture(g,a,false)))).toBe(true);
 expect(m.texImage2D).toHaveBeenCalledTimes(uploads);expect(reject).toHaveBeenCalledTimes(1);
 // The replacement at the original scale uploads normally, without error queries.
 const b=canvas(120,240),queries=m.getError.mock.calls.length;
 markSnapshot(b,{source:s,version:2,previous:1,patches:null,samplingWidth:120,samplingHeight:240});
 const lease=acquireTexture(g,b,false);expect(m.getError).toHaveBeenCalledTimes(queries);lease.release();
});

test('JS upload exceptions of an aligned raster are recoverable; others keep their error',()=>{
 const m=mock(),g=m as unknown as WebGLRenderingContext,reject=jest.fn(),a=canvas(122,244);
 markSnapshot(a,{source:{},version:1,previous:0,patches:null,samplingWidth:120,samplingHeight:240,rejectAlignment:reject});
 m.texImage2D.mockImplementationOnce(()=>{throw Error('too large')});
 expect(isRecoverableTextureError(thrown(()=>acquireTexture(g,a,false)))).toBe(true);expect(reject).toHaveBeenCalledTimes(1);
 const plain=canvas();m.texImage2D.mockImplementationOnce(()=>{throw Error('decode')});
 const error=thrown(()=>acquireTexture(g,plain,false)) as Error;expect(isRecoverableTextureError(error)).toBe(false);expect(error.message).toBe('decode');
});

test('a context with a lower limit skips only the alignment excess',()=>{
 const m=mock(243),g=m as unknown as WebGLRenderingContext,a=canvas(122,244),reject=jest.fn();
 markSnapshot(a,{source:{},version:1,previous:0,patches:null,samplingWidth:120,samplingHeight:240,rejectAlignment:reject});
 expect(isRecoverableTextureError(thrown(()=>acquireTexture(g,a,false)))).toBe(true);
 expect(m.texImage2D).not.toHaveBeenCalled();expect(reject).not.toHaveBeenCalled();
});

test('error queries run only when an aligned raster allocates',()=>{
 const m=mock(),g=m as unknown as WebGLRenderingContext,s={},reject=()=>{};
 const plain=acquireTexture(g,canvas(),false);expect(m.getError).not.toHaveBeenCalled();plain.release();
 const a=canvas(122,244);markSnapshot(a,{source:s,version:1,previous:0,patches:null,samplingWidth:120,samplingHeight:240,rejectAlignment:reject});
 const x=acquireTexture(g,a,false);const allocation=m.getError.mock.calls.length;expect(allocation).toBeGreaterThan(0);
 const b=canvas(122,244);markSnapshot(b,{source:s,version:2,previous:1,patches:[{canvas:canvas(122,40),x:0,y:0}],samplingWidth:120,samplingHeight:240,rejectAlignment:reject});
 const y=acquireTexture(g,b,false);expect(m.texSubImage2D).toHaveBeenCalledTimes(1);
 const c=canvas(122,244);markSnapshot(c,{source:s,version:3,previous:1,patches:null,samplingWidth:120,samplingHeight:240,rejectAlignment:reject});
 const z=acquireTexture(g,c,false);expect(m.getError).toHaveBeenCalledTimes(allocation);
 [x,y,z].forEach(l=>l.release());
});
