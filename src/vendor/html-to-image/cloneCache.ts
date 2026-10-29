import {computedPropertyNames,computedCustomPropertyNames} from './computedProperties';
import {computedDeclarations,backgroundProperty} from './styleValues';
type Values=Map<string,string>;
const SYSTEM_MEDIA=['(forced-colors: active)','(prefers-color-scheme: dark)','(prefers-contrast: more)','(prefers-contrast: less)'];
type NodeState={node:HTMLElement;attrs:string;style:string;text:string;leaf:boolean;geometry:string;rootPaint:string;rootNonBackground:string};
type Scan={environment:string;stableRoot:boolean;nodes:NodeState[]};
type Entry={scan:Scan;template:HTMLElement;clones:HTMLElement[];styles:Map<HTMLElement,Values>;custom:Map<HTMLElement,Values>;embedded:boolean;revision:number;rasterKey:object};
export interface RasterFrame {
 readonly key:object;
 readonly reused:boolean;
 readonly changed:readonly number[];
 readonly nodes:ReadonlyArray<{leaf:boolean;topLevel:number;values:ReadonlyMap<string,string>}>;
}
const BLOCKED='img,picture,source,input,textarea,select,option,optgroup,meter,progress,details,summary,noscript,marquee';
const MAX_NODES=256,MAX_DECLARATIONS=32000,MAX_ENTRIES=2,MAX_RULES=2048,MAX_CSS=262144;
export const isBackgroundOnlyChange=(previous:string,current:CSSStyleDeclaration)=>{
 const style=document.createElement('div').style;style.cssText=previous;
 const collect=(s:CSSStyleDeclaration)=>Array.from({length:s.length},(_,i)=>s[i]).filter(n=>!backgroundProperty(n)).sort().map(n=>[n,s.getPropertyValue(n),s.getPropertyPriority(n)]);
 return JSON.stringify(collect(style))===JSON.stringify(collect(current));
};
function sameValues(a:Values,b:Values,skipBackground=false){
 for(const [name,value]of a)if((!skipBackground||!backgroundProperty(name))&&b.get(name)!==value)return false;
 for(const [name,value]of b)if((!skipBackground||!backgroundProperty(name))&&a.get(name)!==value)return false;
 return true;
}
function sameTree(a:Scan,b:Scan){return a.environment===b.environment&&a.nodes.length===b.nodes.length&&a.nodes.every((n,i)=>n.node===b.nodes[i].node&&n.attrs===b.nodes[i].attrs&&n.style===b.nodes[i].style&&n.text===b.nodes[i].text&&n.geometry===b.nodes[i].geometry&&n.rootPaint===b.nodes[i].rootPaint)}
/** Bounded retained styled DOM. Enabled only by the source's tracked-mutation path.
 * Public/manual full refreshes rebuild it. The rendered canvas remains a new immutable snapshot.
 */
export class StyledCloneCache {
 private entries=new Map<HTMLElement,Entry>();private disposed=false;
 private returned=new WeakMap<HTMLElement,{root:HTMLElement;entry:Entry;revision:number;dirty:HTMLElement[]|null;changed?:number[];embeddedStyles?:Array<{source:HTMLElement;target:HTMLElement}>}>();
 private ids=new WeakMap<object,number>();private serial=0;
 readonly stats={hits:0,misses:0,stores:0,evictions:0,restyledNodes:0};
 constructor(private owner:HTMLElement){}
 private id(object:object){let id=this.ids.get(object);if(id===undefined){id=++this.serial;this.ids.set(object,id)}return id}
 contextKey(root:HTMLElement):string|null {try{return this.policy(root)?.key??null}catch{return null}}
 private policy(root:HTMLElement):{key:string;stableRoot:boolean}|null {
  const doc=root.ownerDocument,win=doc.defaultView;if(!win||root.getRootNode()!==doc||doc.fonts?.status==='loading')return null;
  if(typeof root.getAnimations!=='function'||root.getAnimations({subtree:true}).length)return null;
  let stableRoot=true;
  const state:string[]=[String(win.innerWidth),String(win.innerHeight),String(win.devicePixelRatio),String(win.scrollX),String(win.scrollY),doc.location.hash,doc.designMode];
  // User-agent system colours can change without a page stylesheet mutation.
  for(const query of SYSTEM_MEDIA)state.push(String(win.matchMedia(query).matches));
  const vv=win.visualViewport;if(vv)state.push([vv.width,vv.height,vv.scale,vv.offsetLeft,vv.offsetTop].join(':'));
  const attributes=(el:Element)=>JSON.stringify(Array.from(el.attributes,a=>[a.name,a.value]));
  for(let parent=root.parentElement;parent;parent=parent.parentElement){if(parent.getAnimations().length)return null;const siblings=parent.parentElement?Array.from(parent.parentElement.children):[];state.push(attributes(parent),String(siblings.indexOf(parent)),String(siblings.length),String(siblings.filter(n=>n.tagName===parent!.tagName).indexOf(parent)),String(siblings.filter(n=>n.tagName===parent!.tagName).length),String(parent.matches(':hover,:active,:focus,:focus-within,:focus-visible,:target')))}
  state.push(String(doc.activeElement?this.id(doc.activeElement):0),String(doc.fullscreenElement?this.id(doc.fullscreenElement):0));
  state.push([root,...Array.from(root.querySelectorAll(':hover,:active,:focus,:focus-visible,:focus-within,:target'))].filter(n=>n.matches(':hover,:active,:focus,:focus-visible,:focus-within,:target')).map(n=>this.id(n)).join(','));
  if(doc.fonts)for(const face of doc.fonts)state.push([this.id(face),face.family,face.status,face.weight,face.style,face.stretch,face.unicodeRange,face.featureSettings,face.variationSettings].join(':'));
  let rules=0,bytes=0;const visited=new Set<CSSStyleSheet>();
  const media=(query:string)=>{const matched=!query||win.matchMedia(query).matches;state.push(query,String(matched));return matched};
  const visitSheet=(sheet:CSSStyleSheet):boolean=>{if(visited.has(sheet))return true;visited.add(sheet);state.push(String(sheet.disabled));return sheet.disabled||!media(sheet.media.mediaText)||visitRules(sheet.cssRules)};
  const visitRules=(list:CSSRuleList):boolean=>{for(const rule of Array.from(list)){
   const css=rule.cssText;if(++rules>MAX_RULES||(bytes+=css.length)>MAX_CSS)return false;
   state.push(css);
   // Container-dependent used values cannot be inferred from selector matches alone.
   if(/(?:cq[whib]|cqmin|cqmax)\b|anchor(?:-size)?\(/i.test(css))return false;
   if(rule.type===CSSRule.STYLE_RULE){
    const styleRule=rule as CSSStyleRule;if((styleRule as CSSGroupingRule).cssRules?.length)return false;
    let selector=styleRule.selectorText;
    // An ancestor can inherit a new value from :has() or sibling state outside
    // this subtree. Keep the full root-style check for any such selector.
    if(/[:+~]/.test(selector))stableRoot=false;
    if(/[:+~]|\[\s*style\b/i.test(selector)){
     // Preserve complex selector parsing in the browser. Unsupported pseudo-elements/nesting fall back.
     if(selector.includes('\\')||((selector.includes('"')||selector.includes("'"))&&selector.includes('::')))return false;
     if(/::?(?:before|after)/.test(selector)&&/[()]/.test(selector))return false;
     selector=selector.replace(/::?(?:before|after)\b/g,'');if(selector.includes('::')||selector.includes('&'))return false;
     const matches=[...(root.matches(selector)?[root]:[]),...Array.from(root.querySelectorAll(selector))];state.push(matches.map(n=>this.id(n)).join(','));
    }
   }else if(rule.type===CSSRule.IMPORT_RULE){const imported=rule as CSSImportRule;if(media(imported.media.mediaText)&&imported.styleSheet&&!visitSheet(imported.styleSheet))return false;
   }else if(rule.type===CSSRule.MEDIA_RULE){const group=rule as CSSMediaRule;if(media(group.conditionText)&&!visitRules(group.cssRules))return false;
   }else if(rule.type===CSSRule.SUPPORTS_RULE){const group=rule as CSSSupportsRule;if(win.CSS.supports(group.conditionText)&&!visitRules(group.cssRules))return false;
   }else if(rule.type===CSSRule.FONT_FACE_RULE||rule.type===CSSRule.KEYFRAMES_RULE||rule.constructor.name==='CSSPropertyRule'||rule.constructor.name==='CSSLayerStatementRule'){
    // Definitions are fingerprinted above; active animations are rejected at the root.
   }else if(rule.constructor.name==='CSSLayerBlockRule'){if(!visitRules((rule as CSSGroupingRule).cssRules))return false;
   }else return false;
  }return true};
  for(const sheet of[...Array.from(doc.styleSheets),...Array.from(doc.adoptedStyleSheets??[])])if(!visitSheet(sheet))return null;
  return{key:state.join('\u0000'),stableRoot};
 }
 prepare(root:HTMLElement):Scan|null {
  if(this.disposed||!root.isConnected||!this.owner.contains(root)||root.matches(BLOCKED)||root.querySelector(BLOCKED))return null;
  for(const key of this.entries.keys())if(!key.isConnected||!this.owner.contains(key))this.entries.delete(key);
  try{
   const nodes=[root,...Array.from(root.querySelectorAll<HTMLElement>('*'))];if(nodes.length>MAX_NODES)return null;
   if(nodes.some(node=>/(?:cq[whib]|cqmin|cqmax)\b|anchor(?:-size)?\(/i.test(node.getAttribute('style')??'')))return null;
   const policy=this.policy(root);if(policy===null)return null;
   // Keep a small used-value guard for browser/OS font and palette changes.
   // These can occur without changing author CSS or node attributes.
   let rootPaint='',rootNonBackground='';
   if(policy.stableRoot){
    const s=getComputedStyle(root);
    rootNonBackground=[s.font,s.color,s.visibility,s.borderTopColor,s.borderRightColor,s.borderBottomColor,s.borderLeftColor,s.outlineColor,s.textDecorationColor,s.textShadow,s.boxShadow,s.filter,s.colorScheme,s.accentColor,s.caretColor].join('\u0000');
    // Keep the complete guard as well: unchanged inline CSS can still acquire
    // a different used background from browser/OS state.
    rootPaint=[rootNonBackground,s.backgroundColor,s.backgroundImage].join('\u0000');
   }
   const states=nodes.map(node=>{const rect=node.getBoundingClientRect();return{node,rootPaint:node===root?rootPaint:'',rootNonBackground:node===root?rootNonBackground:'',attrs:JSON.stringify(Array.from(node.attributes,a=>[a.name,a.value]).filter(a=>a[0]!=='style')),style:node.getAttribute('style')??'',leaf:node.childElementCount===0,text:JSON.stringify(Array.from(node.childNodes,n=>n.nodeType===3?n.textContent:n.nodeType===1?'#element':'#other')),geometry:[rect.left,rect.top,rect.width,rect.height,node.offsetWidth,node.offsetHeight,node.clientWidth,node.clientHeight,node.scrollWidth,node.scrollHeight,node.scrollLeft,node.scrollTop].join(':')}});
   return{environment:policy.key,stableRoot:policy.stableRoot,nodes:states};
  }catch{return null}
 }
 reuse(root:HTMLElement):HTMLElement|null {
  const entry=this.entries.get(root),next=entry?this.prepare(root):null;
  const miss=()=>{this.stats.misses++;this.entries.delete(root);return null};
  if(!entry||!next||next.environment!==entry.scan.environment||next.nodes.length!==entry.scan.nodes.length)return miss();
  const layoutChecks=new Set<HTMLElement>(),changed=new Set<number>();
  // A text leaf can change its used width (including fractional glyph spacing)
  // without invalidating the other styled nodes. Check its ancestors as well:
  // flex/grid track sizes can change while the ancestor's border box stays fixed.
  for(let i=0;i<next.nodes.length;i++){
   const current=next.nodes[i],old=entry.scan.nodes[i];
   if(current.node!==old.node||current.attrs!==old.attrs||current.leaf!==old.leaf)return miss();
   if(current.text!==old.text&&!current.leaf)return miss();
   if(i===0&&(current.geometry!==old.geometry||current.style===old.style&&current.rootPaint!==old.rootPaint))return miss();
   if(current.geometry!==old.geometry||current.text!==old.text||current.style!==old.style)changed.add(i);
   const parent=current.node.parentElement,parentValues=parent?entry.styles.get(parent):undefined;
   const stablePositionedText=current.text!==old.text&&current.leaf&&current.geometry===old.geometry&&current.style===old.style&&entry.styles.get(current.node)?.get('position')==='absolute'&&parentValues?.get('display')==='block'&&parentValues.get('position')==='relative'&&['auto','1'].includes(parentValues.get('column-count')??'auto')&&['auto',''].includes(parentValues.get('column-width')??'auto');
   if(current.geometry!==old.geometry||current.text!==old.text&&!stablePositionedText){
    for(let node:HTMLElement|null=current.node;node&&node!==root;node=node.parentElement)layoutChecks.add(node);
   }
  }
  const updates:Array<{i:number;values?:Values;text?:string;restyle?:boolean}>=[];
  for(let i=0;i<next.nodes.length;i++){
   const current=next.nodes[i],old=entry.scan.nodes[i],values=entry.styles.get(current.node)!;
   const update:{i:number;values?:Values;text?:string;restyle?:boolean}={i};
   if(current.text!==old.text)update.text=current.node.textContent??'';
   const computed=getComputedStyle(current.node);
   if(values.get('direction')!==computed.direction)return miss();
   // CSS registration and custom-property inheritance can change without changing attributes.
   const custom=new Map(computedCustomPropertyNames(computed).map(n=>[n,computed.getPropertyValue(n)]));
   if(!sameValues(entry.custom.get(current.node)!,custom))return miss();
   const inspectRoot=i===0&&(!next.stableRoot||current.style!==old.style||current.geometry!==old.geometry);
   if(inspectRoot||layoutChecks.has(current.node)||current.style!==old.style){
    if(current.style!==old.style&&!isBackgroundOnlyChange(old.style,current.node.style))return miss();
    const stableRootBackground=i===0&&next.stableRoot&&current.rootNonBackground===old.rootNonBackground;
    const backgroundOnly=(i>0||stableRootBackground)&&!layoutChecks.has(current.node)&&current.geometry===old.geometry&&current.style!==old.style;
    let fresh:Values;
    if(backgroundOnly){
     // The CSS environment, inherited variables and geometry have already been
     // checked. Background-only mutations do not change layout declarations.
     fresh=new Map(values);for(const name of fresh.keys())if(backgroundProperty(name))fresh.delete(name);
     for(const name of computedPropertyNames(computed))if(backgroundProperty(name)){const value=computed.getPropertyValue(name);if(value)fresh.set(name,value)}
    }else fresh=computedDeclarations(current.node,computed);
    const restyle=!backgroundOnly&&!sameValues(values,fresh,true);
    // Unknown root/inherited style changes retain the full-capture fallback.
    if(restyle&&(i===0||!layoutChecks.has(current.node)))return miss();
    if(restyle){
     update.restyle=true;
     // A changed containing block can alter a descendant's percentage padding
     // even when that descendant's border box is unchanged. Refresh that subtree.
     for(const child of current.node.querySelectorAll<HTMLElement>('*'))layoutChecks.add(child);
    }
    if(!sameValues(values,fresh))update.values=fresh;
   }
   if(update.values||update.text!==undefined){updates.push(update);changed.add(i);}
  }
  const nextStyles=new Map(entry.styles);
  for(const update of updates)if(update.values)nextStyles.set(next.nodes[update.i].node,update.values);
  if([...new Set(nextStyles.values())].reduce((sum,values)=>sum+values.size,0)>MAX_DECLARATIONS)return miss();
  // Validate the entire scan before changing the retained template.
  for(const update of updates){
   const target=entry.clones[update.i];
   if(update.values){
    const previous=entry.styles.get(next.nodes[update.i].node)!;
    if(update.restyle){
     // Override changed declarations from shared rules without expanding every
     // computed property inline or discarding already-embedded resource URLs.
     for(const name of previous.keys())if(!update.values.has(name))target.style.setProperty(name,'initial');
     for(const[name,value]of update.values)if(value!==previous.get(name))target.style.setProperty(name,value);
     this.stats.restyledNodes++;
    }else for(const[name,value]of update.values)if(backgroundProperty(name)&&value!==previous.get(name))target.style.setProperty(name,value);
    entry.styles.set(next.nodes[update.i].node,update.values);
   }
   if(update.text!==undefined){for(const child of Array.from(target.childNodes))if(child.nodeType!==1)child.remove();target.insertBefore(target.ownerDocument.createTextNode(update.text),target.firstChild)}
  }
  entry.scan=next;this.entries.delete(root);this.entries.set(root,entry);this.stats.hits++;
  const result=entry.template.cloneNode(true) as HTMLElement,clones=[result,...Array.from(result.querySelectorAll<HTMLElement>('*')).filter(n=>n.tagName!=='STYLE')];
  entry.revision++;
  const styleUpdates=updates.filter(u=>u.values);
  // Re-embed just the changed nodes before remembering their canonicalized
  // background/mask styles. Unchanged embedded resources remain in the template.
  this.returned.set(result,{root,entry,revision:entry.revision,dirty:entry.embedded?styleUpdates.map(u=>clones[u.i]):null,changed:[...changed],embeddedStyles:styleUpdates.map(u=>({source:clones[u.i],target:entry.clones[u.i]}))});
  return result;
 }
 remember(root:HTMLElement,clone:HTMLElement,start:Scan|null,styles:Map<HTMLElement,Values>){
  this.entries.delete(root);if(this.disposed||!start||styles.size!==start.nodes.length)return;
  // Repeated cards often have identical computed declarations. Retain one
  // immutable map per value set; the budget counts the maps actually retained.
  // Updates replace a node's map, never mutate a shared declaration map.
  const unique=new Map<string,Values>(),retained=new Map<HTMLElement,Values>();let declarations=0;
  for(const[node,values]of styles){
   const signature=JSON.stringify([...values]);let canonical=unique.get(signature);
   if(!canonical){canonical=values;unique.set(signature,values);declarations+=values.size;if(declarations>MAX_DECLARATIONS)return;}
   retained.set(node,canonical);
  }
  styles=retained;
  const end=this.prepare(root);if(!end||!sameTree(start,end))return;
  for(const {node}of end.nodes)for(const kind of['::before','::after'])if(!['none','normal',''].includes(getComputedStyle(node,kind).content))return;
  const template=clone.cloneNode(true) as HTMLElement,clones=[template,...Array.from(template.querySelectorAll<HTMLElement>('*')).filter(n=>n.tagName!=='STYLE')];
  if(clones.length!==end.nodes.length)return;
  const custom=new Map([...styles].map(([node,values])=>[node,new Map([...values].filter(([n])=>n.startsWith('--')))]));
  const entry:Entry={scan:end,template,clones,styles,custom,embedded:false,revision:0,rasterKey:{}};
  this.entries.set(root,entry);this.returned.set(clone,{root,entry,revision:0,dirty:null});this.stats.stores++;
  while(this.entries.size>MAX_ENTRIES){this.entries.delete(this.entries.keys().next().value!);this.stats.evictions++}
 }
 embeddingTargets(clone:HTMLElement):HTMLElement[]|null {return this.returned.get(clone)?.dirty??null}
 frame(clone:HTMLElement):RasterFrame|null {
  const token=this.returned.get(clone);
  if(this.disposed||!token||this.entries.get(token.root)!==token.entry||token.entry.revision!==token.revision)return null;
  const groups=new Map<HTMLElement,number>();let next=0;
  const nodes=token.entry.scan.nodes.map(({node,leaf},index)=>{
   const topLevel=index===0?-1:node.parentElement===token.root?next++:(groups.get(node.parentElement!)??-1);
   groups.set(node,topLevel);return{leaf,topLevel,values:token.entry.styles.get(node)!};
  });
  return{key:token.entry.rasterKey,reused:token.changed!==undefined,changed:token.changed??[],nodes};
 }
 resourcesReady(clone:HTMLElement,fontAdded:boolean){
  const token=this.returned.get(clone);this.returned.delete(clone);
  if(this.disposed||!token||this.entries.get(token.root)!==token.entry||token.entry.revision!==token.revision)return;
  if(token.entry.embedded&&token.dirty!==null){
   // The retained tree already contains the text/background edits. Only the
   // embedder's canonicalized background styles need to be copied back.
   // Keep the resource-embedded tree rather than cloning it again on every hit.
   for(const pair of token.embeddedStyles??[])pair.target.style.cssText=pair.source.style.cssText;
   return;
  }
  const template=clone.cloneNode(true) as HTMLElement;if(fontAdded)template.firstChild?.remove();
  const clones=[template,...Array.from(template.querySelectorAll<HTMLElement>('*')).filter(n=>n.tagName!=='STYLE')];
  if(clones.length!==token.entry.scan.nodes.length){this.entries.delete(token.root);return}
  token.entry.template=template;token.entry.clones=clones;token.entry.embedded=true;
 }
 destroy(){this.disposed=true;this.entries.clear();this.returned=new WeakMap()}

}
