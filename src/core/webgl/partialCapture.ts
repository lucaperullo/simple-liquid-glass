import type {SnapshotPatch} from './snapshotUpdates';
import { HtmlCapture } from '../../vendor/ybouane/HtmlCapture';
import { parseCssColorToRgba } from '../../cssColor';
interface Section { element: HTMLElement; x: number; y: number; width: number; height: number; replaceable:boolean }
/** Only independently clipped opaque rectangles may replace a region of a complete snapshot. */
export function captureSections(root: HTMLElement, extended=false, validated?:ReadonlySet<HTMLElement>): Section[] | null {
  if (root.getRootNode() !== document || [...root.childNodes].some(n=>n.nodeType===3&&n.textContent?.trim())) return null;
  const style=getComputedStyle(root);
  if(style.transform!=='none'||style.perspective!=='none'||style.opacity!=='1'||style.filter!=='none'||style.mixBlendMode!=='normal'||style.clipPath!=='none'||style.maskImage!=='none')return null;
  if([style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomLeftRadius,style.borderBottomRightRadius].some(v=>parseFloat(v)!==0))return null;
  if(style.textDecorationLine!=='none'||style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>0)return null;
  const pseudo=(element:HTMLElement,kind:string)=>getComputedStyle(element,kind);
  if(['::before','::after'].some(kind=>!['none','normal',''].includes(pseudo(root,kind).content)))return null;
  if(['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','paddingTop','paddingRight','paddingBottom','paddingLeft'].some(p=>parseFloat(style.getPropertyValue(p.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())))!==0))return null;
  // :has and sibling selectors can change a different section without mutating its subtree.
  const visited=new Set<CSSStyleSheet>();
  const safeSheet=(sheet:CSSStyleSheet):boolean=>{if(visited.has(sheet)||sheet.disabled)return true;visited.add(sheet);try{return safeRules(sheet.cssRules)}catch{return false}};
  const safeRules=(rules:CSSRuleList):boolean=>[...rules].every(rule=>{
    const nested=rule as CSSGroupingRule;
    if('selectorText'in rule&&/[+~]|:has\(/i.test(String((rule as CSSStyleRule).selectorText)))return false;
    const imported='styleSheet'in rule?(rule as CSSImportRule).styleSheet:null;
    if(imported&&!safeSheet(imported))return false;
    return !nested.cssRules||safeRules(nested.cssRules);
  });
  if(![...document.styleSheets,...(document.adoptedStyleSheets??[])].every(safeSheet))return null;
  const box=root.getBoundingClientRect(),sections:Section[]=[];
  for(const element of root.children){
    if(!(element instanceof HTMLElement)||['STYLE','SCRIPT','LINK'].includes(element.tagName))return null;
    const s=getComputedStyle(element),r=element.getBoundingClientRect();
    if(s.display==='none')continue;
    if(s.transform!=='none'||s.perspective!=='none'||(!extended&&s.opacity!=='1')||s.filter!=='none'||s.boxShadow!=='none'||s.mixBlendMode!=='normal'||s.clipPath!=='none'||s.maskImage!=='none'||s.backgroundClip!=='border-box')return null;
    const clipped=['hidden','clip'].includes(s.overflowX)&&['hidden','clip'].includes(s.overflowY);
    const emptyBounded=extended&&element.childNodes.length===0&&!element.shadowRoot&&!element.hasAttribute('is')&&['DIV','SECTION','ARTICLE','MAIN','HEADER','FOOTER','ASIDE'].includes(element.tagName)&&s.display!=='list-item'&&['normal','none',''].includes(s.content)&&['::before','::after'].every(kind=>['normal','none',''].includes(pseudo(element,kind).content));
    if(!clipped&&!emptyBounded)return null;
    if(extended&&s.borderImageOutset.split(/\s+/).some(v=>parseFloat(v)!==0))return null;
    const replaceable=s.opacity==='1'&&parseCssColorToRgba(s.backgroundColor)?.a===1&&[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius].every(v=>parseFloat(v)===0);
    if(!extended&&!replaceable)return null;
    if(s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0)return null;

    const crossPaint=(paint:CSSStyleDeclaration)=>['fixed','sticky'].includes(paint.position)||!!paint.backdropFilter&&paint.backdropFilter!=='none';
    // Source supplies this set only when tracked mutations cannot change the
    // descendant paint constraints, under the same CSS/environment fingerprint. Geometry and each
    // section's own paint boundaries are still checked on every capture.
    if(!validated?.has(element)){
      if([...element.querySelectorAll<HTMLElement>('*')].some(child=>crossPaint(getComputedStyle(child))||['::before','::after'].some(kind=>{const p=pseudo(child,kind);return !['none','normal',''].includes(p.content)&&crossPaint(p)})))return null;
    }
    if(['::before','::after'].some(kind=>{const p=pseudo(element,kind);return !['none','normal',''].includes(p.content)&&crossPaint(p)}))return null;
    const x=r.left-box.left,y=r.top-box.top,w=element.offsetWidth,h=element.offsetHeight;
    if(!w||!h||x<0||y<0||x+w>root.offsetWidth+.01||y+h>root.offsetHeight+.01||Math.abs(r.width-w)>.01||Math.abs(r.height-h)>.01||Math.abs(x-Math.round(x))>.01||Math.abs(y-Math.round(y))>.01)return null;
    if(sections.some(a=>x<a.x+a.width&&x+w>a.x&&y<a.y+a.height&&y+h>a.y))return null;
    sections.push({element,x:Math.round(x),y:Math.round(y),width:w,height:h,replaceable});
  }
  return sections.length?sections:null;
}
export function sameSections(a:Section[]|null,b:Section[]|null){return !!a&&!!b&&a.length===b.length&&a.every((s,i)=>s.element===b[i].element&&s.x===b[i].x&&s.y===b[i].y&&s.width===b[i].width&&s.height===b[i].height&&s.replaceable===b[i].replaceable)}
export async function patchSections(capture:HtmlCapture,root:HTMLElement,sections:Section[],dirty:Set<HTMLElement>,mutable=false){
  const old=capture.cache.get(root);if(!old)return false;
  if([...dirty].some(element=>!sections.some(s=>s.element===element&&s.replaceable)))return false;
  const changed=sections.filter(s=>dirty.has(s.element));
  // Newly supported read-only siblings must not introduce a raster-grid change.
  if(sections.some(s=>!s.replaceable)){
    const sx=old.canvas.width/root.offsetWidth,sy=old.canvas.height/root.offsetHeight;
    if(changed.some(s=>Math.abs(Math.floor(s.width*capture.dpr)/s.width-sx)>1e-9||Math.abs(Math.floor(s.height*capture.dpr)/s.height-sy)>1e-9||Math.abs(s.x*sx-Math.round(s.x*sx))>1e-9||Math.abs(s.y*sy-Math.round(s.y*sy))>1e-9))return false;
  }
  const patches:SnapshotPatch[]=[];
  // Finish every asynchronous capture before publishing any pixels.
  for(const s of changed){
    try{
      await capture.captureElement(s.element,true,true);
      const patch=capture.cache.get(s.element);if(!patch)throw new Error('LiquidGlass: section capture unavailable');
      patches.push({canvas:patch.canvas,x:Math.round(s.x*capture.dpr),y:Math.round(s.y*capture.dpr)});
    }finally{capture.cache.delete(s.element)}
  }
  const next=mutable?old.canvas:document.createElement('canvas');
  if(!mutable){next.width=old.canvas.width;next.height=old.canvas.height;}
  const ctx=next.getContext('2d');if(!ctx)return false;
  if(!mutable)ctx.drawImage(old.canvas,0,0);
  // This commit has no await: shared-scene consumers observe one complete generation.
  for(const patch of patches){ctx.clearRect(patch.x,patch.y,patch.canvas.width,patch.canvas.height);ctx.drawImage(patch.canvas,patch.x,patch.y);}
  capture.cache.set(root,{canvas:next,w:old.w,h:old.h});return patches;
}
