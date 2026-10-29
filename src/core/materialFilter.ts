/*! Adapted from Sam Asante (MIT); see THIRD_PARTY_NOTICES.md. */
import { DISPERSION_SPREAD } from '../vendor/samasante/displacement';
import { nativeMapSurround } from './nativeMapGeometry';
export interface MaterialFilterOptions {
  dispScale: number; dispersion: number; specular: number; hasSpecular: boolean;
  mapMatrix: string | null; width: number; height: number; mapUrl: string; paddedMap?: boolean; keepIdentityHighlight?: boolean;
}
export interface FilterStage { tag: string; attrs: Record<string, string | number | undefined> }
/** Canonical filter graph shared by React and the framework-independent custom element. */
export function materialFilterStages(o: MaterialFilterOptions): FilterStage[] {
  let stages: FilterStage[] = [
    {tag:'feFlood',attrs:{floodColor:'rgb(128,128,128)',floodOpacity:1,result:'mapBg'}},
    {tag:'feImage',attrs:{href:o.mapUrl||undefined,x:0,y:0,width:o.width,height:o.height,preserveAspectRatio:'none',result:'rawMap'}},
    {tag:'feComposite',attrs:{in:'rawMap',in2:'mapBg',operator:'over',result:'map'}}
  ];
  // Padding is already rasterized into the immutable PNG, with its original 512px body intact.
  if(o.paddedMap&&o.width>0&&o.height>0){
    const bounds=nativeMapSurround(o.width,o.height);
    stages=[{tag:'feImage',attrs:{href:o.mapUrl,x:bounds.left,y:bounds.top,width:bounds.width,height:bounds.height,preserveAspectRatio:'none',result:'map'}}];
  }
  const input=o.mapMatrix?'scaledMap':'map';
  if(o.mapMatrix)stages.push({tag:'feColorMatrix',attrs:{in:'map',type:'matrix',values:o.mapMatrix,result:'scaledMap'}});
  if(o.dispersion>0){
    const matrices=[
      '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
      '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
      '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'
    ];
    for(let channel=0;channel<3;channel++){
      const name=['R','G','B'][channel];
      stages.push({tag:'feDisplacementMap',attrs:{in:'SourceGraphic',in2:input,scale:o.dispScale*(1+DISPERSION_SPREAD*o.dispersion*(1-channel*.5)),xChannelSelector:'R',yChannelSelector:'G'}});
      stages.push({tag:'feColorMatrix',attrs:{type:'matrix',values:matrices[channel],result:`refract${name}`}});
    }
    stages.push({tag:'feComposite',attrs:{in:'refractR',in2:'refractG',operator:'arithmetic',k1:0,k2:1,k3:1,k4:0,result:'refractRG'}},
      {tag:'feComposite',attrs:{in:'refractRG',in2:'refractB',operator:'arithmetic',k1:0,k2:1,k3:1,k4:0,result:'lensOut'}});
  }else stages.push({tag:'feDisplacementMap',attrs:{in:'SourceGraphic',in2:input,scale:o.dispScale,xChannelSelector:'R',yChannelSelector:'G',result:'lensOut'}});
  if(o.hasSpecular&&(o.specular!==0||o.keepIdentityHighlight))stages.push(
    {tag:'feColorMatrix',attrs:{in:'map',type:'matrix',values:`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 ${-128/255}`,result:'sheenMask'}},
    {tag:'feComposite',attrs:{in:'sheenMask',in2:'lensOut',operator:'arithmetic',k1:0,k2:o.specular,k3:1,k4:0}}
  );
  return stages;
}
export function materialFilterPadding(scale:number,dispersion:number,blur:number,specular:number){
  const reach=Math.ceil(Math.abs(scale)*(1+DISPERSION_SPREAD*Math.max(0,dispersion))/2+Math.max(0,blur)*3+2);
  const original=Math.ceil((Math.abs(scale)+Math.abs(dispersion))/2+Math.max(0,blur)*3+2)+28;
  return specular!==0?Math.max(reach,original):reach;
}
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function materialFilterMarkup(options:MaterialFilterOptions){
 return materialFilterStages(options).map(({tag,attrs})=>`<${tag} ${Object.entries(attrs).filter(([,v])=>v!==undefined).map(([name,value])=>`${name==='floodColor'?'flood-color':name==='floodOpacity'?'flood-opacity':name}="${escape(String(value))}"`).join(' ')}></${tag}>`).join('');
}
