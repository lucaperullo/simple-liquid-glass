import { materialFilterPadding, materialFilterStages, materialFilterMarkup } from '../core/materialFilter';
const options={dispScale:24,dispersion:0,specular:0,hasSpecular:false,mapMatrix:null,width:180,height:120,paddedMap:true,mapUrl:'data:image/png;base64,map'};
test('zero specular removes only identity highlight passes and keeps RG optics',()=>{
 const graph=materialFilterStages(options);
 expect(graph.filter(x=>x.tag==='feDisplacementMap')).toHaveLength(1);
 expect(graph.some(x=>x.attrs.result==='sheenMask')).toBe(false);
 expect(graph.find(x=>x.tag==='feDisplacementMap')?.attrs.yChannelSelector).toBe('G');
 const image=graph.find(x=>x.tag==='feImage')!;
 expect(image.attrs.href).toBe(options.mapUrl);
 expect(graph.some(x=>x.tag==='feFlood'||x.tag==='feComposite')).toBe(false);
 expect(Number(image.attrs.x)).toBeLessThan(0);
 expect(Number(image.attrs.width)).toBeGreaterThan(options.width);
});
test('filter bounds contain the largest dispersed sample even for negative scale',()=>{
 for(const scale of [-160,-24,0,24,160])for(const dispersion of [0,.5,1]){
  expect(materialFilterPadding(scale,dispersion,0,0)).toBeGreaterThanOrEqual(Math.abs(scale)*(1+.22*dispersion)/2+2);
 }
 expect(materialFilterPadding(24,0,0,0)).toBe(14);
 expect(materialFilterPadding(24,0,0,1)).toBe(42);
});
test('markup and React use the same stages, and attribute values are escaped',()=>{
 const graph=materialFilterStages({...options,dispersion:.5,specular:1,hasSpecular:true});
 expect(graph.filter(x=>x.tag==='feDisplacementMap')).toHaveLength(3);
 expect(graph.some(x=>x.attrs.result==='sheenMask')).toBe(true);
 expect(materialFilterMarkup({...options,mapUrl:'x"/><script>&'})).toContain('x&quot;/&gt;&lt;script&gt;&amp;');
});

test('liquid retains the unlimited neutral map region and strength changes keep image bytes stable',()=>{
 const first=materialFilterStages(options).find(s=>s.tag==='feImage')!.attrs.href;
 const next=materialFilterStages({...options,dispScale:120}).find(s=>s.tag==='feImage')!.attrs.href;
 expect(next).toBe(first);
 expect(materialFilterStages({...options,paddedMap:false}).some(s=>s.tag==='feFlood')).toBe(true);
});

test('tiny controls keep the bounded original map and liquid can retain identity precision',()=>{
 const {canPadNativeMap}=require('../core/nativeMapGeometry');
 expect(canPadNativeMap(1,1)).toBe(false);expect(canPadNativeMap(180,120)).toBe(true);
 expect(materialFilterStages({...options,paddedMap:false,hasSpecular:true,keepIdentityHighlight:true}).some(s=>s.attrs.result==='sheenMask')).toBe(true);
});
