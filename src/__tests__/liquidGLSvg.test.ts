/** @jest-environment jsdom */
import * as model from '../core/liquidGLModel';
import {liquidGLCoefficients,liquidGLField} from '../core/liquidGLModel';
import {buildSvgLiquidAsset,svgLiquidKey,svgLiquidShapeKey,svgLiquidCacheInfo} from '../core/svgLiquidGL';
const geometry={width:12,height:8,radius:2,sourceWidth:1200,sourceHeight:2400,x:400,y:400,dpr:1,scaleX:1,scaleY:1};
const c=liquidGLCoefficients(undefined);
afterEach(()=>jest.restoreAllMocks());
test('analytical lens is neutral in the centre and bends outward with the texture Y origin',()=>{
 expect(liquidGLField(160,90,320,180,24,c)).toEqual([0,0]);
 const top=liquidGLField(160,0,320,180,24,c),bottom=liquidGLField(160,180,320,180,24,c);
 expect(top[0]).toBeCloseTo(0,5);expect(top[1]).toBeCloseTo(.021,6);expect(bottom[1]).toBeCloseTo(-.021,6);
 expect(liquidGLField(0,90,320,180,24,c)[0]).toBeCloseTo(-.021,6);
 expect(liquidGLField(320,90,320,180,24,c)[0]).toBeCloseTo(.021,6);
 expect(liquidGLField(1,1,320,180,24,c)).toEqual([0,0]);
});
test('zero refraction and bevel are neutral everywhere; invalid options use finite defaults',()=>{
 const zero=liquidGLCoefficients({refraction:0,bevelDepth:0});
 expect(liquidGLField(320,90,320,180,24,zero)).toEqual([0,0]);
 expect(liquidGLCoefficients({refraction:NaN,bevelWidth:0,frost:Infinity,aberration:50},8)).toMatchObject({refraction:.006,bevelWidth:.0001,frost:1,aberration:10});
});
test('moving an interior pane reuses its asset; source-edge position, DPR and size invalidate it',()=>{
 expect(svgLiquidKey(geometry,c)).toBe(svgLiquidKey({...geometry,x:500,y:600},c));
 expect(svgLiquidKey({...geometry,x:0},c)).not.toBe(svgLiquidKey({...geometry,x:1},c));
 expect(svgLiquidKey({...geometry,dpr:2},c)).not.toBe(svgLiquidKey(geometry,c));
 expect(svgLiquidKey({...geometry,width:20},c)).not.toBe(svgLiquidKey(geometry,c));
});
test('map generation is cached, neutral is encoded as 128, and frost blurs one map instead of sixteen',()=>{
 const put=jest.fn();jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:put} as any);
 jest.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,map');
 const options={refraction:0,bevelDepth:0};const first=buildSvgLiquidAsset(geometry,options);
 const pixels=put.mock.calls[0][0].data;expect([pixels[0],pixels[1],pixels[3]]).toEqual([128,128,255]);
 expect(buildSvgLiquidAsset({...geometry,x:500},options)).toBe(first);
 const frosted=buildSvgLiquidAsset(geometry,{frost:1});expect(frosted.maps).toHaveLength(1);expect(frosted.frostSigma).toBeCloseTo(2);
 expect(pixels.length).toBe(Math.round(12*.75)*Math.round(8*.75)*4);
 expect(svgLiquidCacheInfo().decodedBytes).toBeLessThanOrEqual(svgLiquidCacheInfo().budget);
});
test('oversized maps fail before allocation instead of exceeding the per-asset budget',()=>{
 expect(()=>buildSvgLiquidAsset({...geometry,width:6000},undefined)).toThrow(RangeError);
 expect(()=>buildSvgLiquidAsset({...geometry,width:4000,height:4000,dpr:2},{aberration:1})).toThrow(RangeError);
});

test('the LRU stays bounded when many distinct geometries are requested',()=>{
 jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}} as any);
 jest.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,map');
 for(let i=0;i<40;i++)buildSvgLiquidAsset({...geometry,width:13+i},{refraction:0,bevelDepth:0});
 expect(svgLiquidCacheInfo().entries).toBe(32);
 expect(svgLiquidCacheInfo().decodedBytes).toBeLessThanOrEqual(svgLiquidCacheInfo().budget);
});

test('edge positions round to whole pixels and share the position-free shape key',()=>{
 expect(svgLiquidKey({...geometry,x:0},c)).toBe(svgLiquidKey({...geometry,x:.3},c));
 expect(svgLiquidShapeKey({...geometry,x:0,y:3},c)).toBe(svgLiquidShapeKey({...geometry,x:7,y:900},c));
 expect(svgLiquidShapeKey({...geometry,width:20},c)).not.toBe(svgLiquidShapeKey(geometry,c));
});
test('a pane moving along the source edge reuses its refraction field',()=>{
 jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}} as any);
 jest.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,map');
 const edge={...geometry,width:14,x:0,y:0},field=jest.spyOn(model,'liquidGLField');
 const first=buildSvgLiquidAsset(edge,undefined);const calls=field.mock.calls.length;expect(calls).toBe(Math.round(14*.75)*Math.round(8*.75));
 const moved=buildSvgLiquidAsset({...edge,x:3},undefined);
 expect(moved).not.toBe(first);expect(field.mock.calls.length).toBe(calls);
});
