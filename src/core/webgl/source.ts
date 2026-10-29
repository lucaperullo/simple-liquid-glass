import {alignedCaptureScale} from './alignedCaptureScale';
import {markSnapshot} from './snapshotUpdates';
import { HtmlCapture } from '../../vendor/ybouane/HtmlCapture';
import { isBackgroundOnlyChange } from '../../vendor/html-to-image/cloneCache';
import { captureSections, patchSections, sameSections } from './partialCapture';
import { sharedValue } from '../shared';

// Panels sharing a backdrop also share its raster and mutation/resize observers.
const sources = sharedValue('sources.v1', () => new WeakMap<HTMLElement, Source>());
// The live surface has a separate contract; legacy consumers keep immutable snapshots.
const liveSources=sharedValue('sources.live.v1',()=>new WeakMap<HTMLElement,Source>());
class Source {
  readonly capture: HtmlCapture;
  readonly listeners = new Set<(error?: unknown) => void>();
  private observer: MutationObserver;
  private resize?: ResizeObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private queued = false;
  private disposed = false;
  private geometry = '';
  private full = true;
  private alignmentLimit=16384;
  private publishedScale:number|undefined;
  private allocationChecks=new Map<string,boolean>();
  limitAlignment(limit:number){
    if(Number.isFinite(limit)&&limit>0&&limit<this.alignmentLimit){this.alignmentLimit=Math.floor(limit);this.full=true;this.schedule();}
  }
  /** A GPU consumer could not allocate this promoted raster: recapture at the original scale. */
  private rejectAlignment(width:number,height:number){
    let done=false;
    return()=>{if(done||this.disposed)return;done=true;this.allocationChecks.set(width+':'+height,false);this.full=true;this.schedule();};
  }
  private supportsSize(width:number,height:number):boolean{
    const key=width+':'+height,known=this.allocationChecks.get(key);if(known!==undefined)return known;
    const canvas=document.createElement('canvas');let valid=false;
    try{canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle='rgb(31,79,127)';ctx.fillRect(width-1,height-1,1,1);const p=ctx.getImageData(width-1,height-1,1,1).data;valid=p[0]===31&&p[1]===79&&p[2]===127&&p[3]===255}}
    catch{valid=false}finally{canvas.width=canvas.height=0}
    this.allocationChecks.set(key,valid);while(this.allocationChecks.size>4)this.allocationChecks.delete(this.allocationChecks.keys().next().value!);return valid;
  }
  private dirty = new Set<HTMLElement>();
  private rescanDescendants = new Set<HTMLElement>();
  private snapshotSource={};
  private snapshotVersion=0;
  private styleContext:string|null|undefined;
  get version(){return this.snapshotVersion}
  private sections: ReturnType<typeof captureSections> = null;
  constructor(readonly element: HTMLElement,private mutable=false) {
    this.capture = new HtmlCapture(element);
    this.geometry = `${element.offsetWidth}:${element.offsetHeight}:${devicePixelRatio}`;
    this.observer = new MutationObserver(records => { this.note(records); this.schedule(); });
    this.observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue:true });
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(this.onResize);
      this.resize.observe(element);
    }
    element.addEventListener('load', this.visualChange, true);
    element.addEventListener('input', this.visualChange, true);
    element.addEventListener('change', this.visualChange, true);
    window.addEventListener('resize', this.onResize);
  }
  private note(records: MutationRecord[]) {
    for(const record of records){
      const target=record.target instanceof HTMLElement?record.target:record.target.parentElement;
      if(!target||target===this.element){this.full=true;continue}
      if([...record.addedNodes,...record.removedNodes].some(n=>n instanceof Element&&(n.matches('style,link')||n.querySelector('style,link')))){this.full=true;continue}
      let section=target;
      while(section.parentElement&&section.parentElement!==this.element)section=section.parentElement;
      if(section.parentElement===this.element){
        this.dirty.add(section);
        // Text and the section's own background cannot introduce sticky/fixed
        // descendants while selector matches and the CSS fingerprint are stable.
        // All other attribute/tree changes require a fresh descendant scan.
        const paintOnly=record.type==='characterData'||record.type==='childList'&&
          [...record.addedNodes,...record.removedNodes].every(node=>node.nodeType===3)||
          record.type==='attributes'&&record.attributeName==='style'&&target===section&&
          isBackgroundOnlyChange(record.oldValue??'',section.style);
        if(!paintOnly)this.rescanDescendants.add(section);
      }else this.full=true;
    }
  }
  private visualChange = () => { this.full=true; this.schedule(); };
  private onResize = () => {
    const geometry = `${this.element.offsetWidth}:${this.element.offsetHeight}:${devicePixelRatio}`;
    if (geometry !== this.geometry) { this.geometry = geometry; this.full=true; this.schedule(); }
  };
  private schedule = () => {
    if (this.disposed || this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.run(false).catch(() => {}); }, 120);
  };
  refresh = (): Promise<void> => this.run(true);
  private run(explicit:boolean):Promise<void>{
    if(this.disposed)return Promise.resolve();
    this.note(this.observer.takeRecords());
    if(explicit&&this.timer){clearTimeout(this.timer);this.timer=undefined}
    // A scheduled notification already consumed by an explicit refresh needs no second snapshot.
    if(!explicit&&!this.full&&!this.dirty.size)return this.pending??Promise.resolve();
    if(explicit&&!this.dirty.size&&!this.pending)this.full=true;
    this.queued=true;
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      await this.capture.prefetchFontEmbedCSS();
      while(this.queued&&!this.disposed){
        this.queued=false;
        const dirty=this.dirty;this.dirty=new Set();let full=this.full;this.full=false;
        const rescan=this.rescanDescendants;this.rescanDescendants=new Set();
        const w=Math.max(1,this.element.offsetWidth),h=Math.max(1,this.element.offsetHeight);
        const context=this.capture.clones?.contextKey(this.element)??null;
        if(this.styleContext!==undefined&&context!==this.styleContext)full=true;
        const validated=!full&&this.mutable&&context!==null&&context===this.styleContext&&this.sections
          ?new Set(this.sections.filter(section=>!rescan.has(section.element)).map(section=>section.element)):undefined;
        const sections=captureSections(this.element,this.mutable&&context!==null,validated);
        let plan=alignedCaptureScale(w,h,devicePixelRatio||1,this.mutable&&context!==null&&sections?.some(s=>s.replaceable)?sections:null,this.alignmentLimit);
        if(plan.adjusted&&!this.supportsSize(plan.width,plan.height))plan=alignedCaptureScale(w,h,devicePixelRatio||1);
        if(this.publishedScale!==undefined&&this.publishedScale!==plan.dpr)full=true;
        this.capture.dpr=plan.dpr;
        const previousCanvas=this.capture.cache.get(this.element)?.canvas;
        let patched:false|Awaited<ReturnType<typeof patchSections>>=false;
        try{
          patched=!full&&!!dirty.size&&sameSections(this.sections,sections)&&await patchSections(this.capture,this.element,sections!,dirty,this.mutable);
          if(!patched)await this.capture.captureElement(this.element,true,!full,this.mutable);
        }catch(error){
          if(!plan.adjusted)throw error;
          const key=plan.width+':'+plan.height;this.allocationChecks.set(key,false);
          plan=alignedCaptureScale(w,h,devicePixelRatio||1);this.capture.dpr=plan.dpr;patched=false;
          // If the original scale fails too, the error is not attributable to
          // alignment (assets, decoding): keep the optimization available.
          try{await this.capture.captureElement(this.element,true,false,this.mutable)}
          catch(retry){this.allocationChecks.delete(key);throw retry}
        }
        const snapshot=this.capture.cache.get(this.element)?.canvas;
        const painted=!!patched||snapshot!==previousCanvas;
        if(snapshot&&painted&&!this.disposed){const previous=this.snapshotVersion++;markSnapshot(snapshot,{source:this.snapshotSource,version:this.snapshotVersion,previous,patches:patched||null,samplingWidth:plan.samplingWidth,samplingHeight:plan.samplingHeight,rejectAlignment:plan.adjusted?this.rejectAlignment(plan.width,plan.height):undefined});}
        if(snapshot)this.publishedScale=plan.dpr;
        this.sections=sections;this.styleContext=context;
        if(!this.disposed&&(painted||!snapshot))this.listeners.forEach(listener=>listener());
      }
    })().catch(error=>{this.full=true;if(!this.disposed)this.listeners.forEach(listener=>listener(error));throw error}).finally(()=>{this.pending=undefined});
    return this.pending;
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.observer.disconnect(); this.resize?.disconnect();
    this.element.removeEventListener('load', this.visualChange, true);
    this.element.removeEventListener('input', this.visualChange, true);
    this.element.removeEventListener('change', this.visualChange, true);
    window.removeEventListener('resize', this.onResize);
    this.dirty.clear();this.rescanDescendants.clear();this.sections=null;this.allocationChecks.clear();this.capture.destroy();
  }
}
export function acquireSource(element: HTMLElement, listener: (error?: unknown) => void,mutable=false,alignmentLimit=16384) {
  const pool=mutable?liveSources:sources;
  let source = pool.get(element);
  if (!source) { source = new Source(element,mutable); pool.set(element, source); }
  if(mutable)source.limitAlignment(alignmentLimit);
  const notify=(error?:unknown)=>listener(error);
  source.listeners.add(notify);
  const shared = source;
  let released=false;
  return {
    capture: shared.capture,
    get version(){return shared.version},
    refresh: shared.refresh,
    release() {
      if(released)return;released=true;
      shared.listeners.delete(notify);
      if (!shared.listeners.size) { shared.dispose(); if(pool.get(element)===shared)pool.delete(element); }
    }
  };
}
