import { GlassRenderer } from '../../vendor/ybouane/GlassRenderer';
import { DEFAULTS, SHADOW_PAD } from '../../vendor/ybouane/defaults';
import { cachedBackground } from './background';
import type { installLiquidGLOptics } from './liquidGLOptics';
import { installPackageOptics } from './optics';
import { acquireSource } from './source';
import { acquireContextCanvas, subscribeFrame } from './contextPool';
import { invalidateTextures } from './textureCache';
import { canvasFrame } from './canvasFrames';
import type { EngineContext, SceneSlot, WebGLEngine, WebGLOptions, WebGLStatus } from './types';

function fixedToViewport(element: HTMLElement): boolean {
  let fixed = false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (fixed && (style.transform !== 'none' || style.perspective !== 'none' || style.filter !== 'none')) return false;
    if (style.position === 'fixed') fixed = true;
  }
  return fixed;
}

/** Shared GPU context, private framebuffer state, and one composited canvas per surface, or a framebuffer
 * in a shared scene's context when `slot` is given (the scene composites every panel into one canvas). */
export function createWebGLEngine(panel: HTMLElement, holder: HTMLElement, source: HTMLElement,
  initial: WebGLOptions, status: (status: WebGLStatus) => void, analytical?: typeof installLiquidGLOptics,forceLegacy=false,slot?:SceneSlot): WebGLEngine {
  const canvas = document.createElement('canvas'), scene = document.createElement('canvas');
  canvas.width = canvas.height = scene.width = scene.height = 1;
  // Copying the shared canvas costs every moving frame; transfer its bitmap whenever the probe allows, for both optics.
  const transfer=!slot&&!forceLegacy&&!!analytical?.supportsBitmap();
  // A transferred bitmap is handed to the compositor as is (bitmaprenderer); drawing it into a 2D canvas copies it.
  const bitmaps=transfer?canvas.getContext('bitmaprenderer'):null,output=bitmaps||slot?null:canvas.getContext('2d'),ctx=scene.getContext('2d');
  if(!(bitmaps||output||slot)||!ctx)throw new Error('LiquidGlass: canvas unavailable');
  const lease=slot?undefined:acquireContextCanvas(transfer);
  let renderer:GlassRenderer;
  try{renderer=new GlassRenderer(slot?slot.canvas:lease!.canvas)}catch(error){
    lease?.release();canvas.width=canvas.height=scene.width=scene.height=0;
    if(transfer)return createWebGLEngine(panel,holder,source,initial,status,analytical,true);
    throw error;
  }
  canvas.dataset.liquidGlassPresentation=transfer?'bitmap-transfer':'canvas-copy';
  if(slot)panel.dataset.glassComposition='scene';
  const present=(w:number,h:number)=>{
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    if(bitmaps){bitmaps.transferFromImageBitmap((renderer.canvas as OffscreenCanvas).transferToImageBitmap());return}
    output!.globalCompositeOperation='copy';
    output!.drawImage(renderer.canvas,0,0,w,h);
  };
  let options = initial, dirty = true, disposed = false;
  const changed=()=>{dirty=true;};
  const video = source instanceof HTMLVideoElement ? source : undefined;
  const media = video ?? (source instanceof HTMLCanvasElement ? source : undefined);
  let ready = false, faulted = false;
  const setStatus = (next: WebGLStatus) => { if (!disposed) status(next); };
  const shared = media ? undefined : acquireSource(source, error => {
    changed();
    if (error && !shared?.capture.cache.has(source)) setStatus('capture-failed');
  });
  const context: EngineContext = { renderer, capture: shared?.capture ?? { cache: new Map() },
    markChanged: changed, destroy: () => renderer.destroy() };
  let sourceRect = source.getBoundingClientRect();
  let documentTop = sourceRect.top + scrollY;
  const fixedSource = fixedToViewport(source);
  const fixedPanel = fixedToViewport(panel);
  const origin = document.createElement('div');
  origin.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none';
  origin.setAttribute('aria-hidden', 'true'); document.body.append(origin);
  const prepare = media ? undefined : cachedBackground(context, source, () => sourceRect);
  const optics = installPackageOptics(context, () => options);
  const liquidOptics = analytical?.(context);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.liquidGlassWebgl = '';
  canvas.style.cssText = `display:block;position:absolute;left:-${SHADOW_PAD}px;top:-${SHADOW_PAD}px;pointer-events:none`;
  if(!slot)holder.append(canvas);
  let lastGeometry = '', lastTime = -1;
  const lose = () => { invalidateTextures(renderer.gl); ready = false; setStatus('webgl-unavailable'); };
  const restore = () => { changed(); setStatus('pending'); };
  renderer.canvas.addEventListener('webglcontextlost', lose);
  renderer.canvas.addEventListener('webglcontextrestored', restore);
  const mediaChanged = changed;
  video?.addEventListener('seeked', mediaChanged);
  video?.addEventListener('loadeddata', mediaChanged);

  // Playback time advances between decoded frames too. Only upload a new frame,
  // while geometry/optics changes remain free to render at the display cadence.
  let videoFrame = 0, videoCallback: number | undefined;
  const trackVideoFrame: VideoFrameRequestCallback = (_now,metadata) => {
    videoFrame=metadata.presentedFrames;
    if (!disposed) videoCallback = video!.requestVideoFrameCallback(trackVideoFrame);
  };
  if (video?.requestVideoFrameCallback) videoCallback = video.requestVideoFrameCallback(trackVideoFrame);

  let measurement: ReturnType<typeof measure> | undefined;
  function measure(){
    if(disposed||document.hidden||renderer.contextLost||(faulted&&!dirty))return;
    try {
      const measured=source.getBoundingClientRect(),lens=panel.getBoundingClientRect();
      const y=scrollY,max=Math.max(0,document.documentElement.scrollHeight-innerHeight);
      const fixedOffset=(y<0||y>max)&&fixedPanel?origin.getBoundingClientRect().top:0;
      // offsetWidth/Height round the layout size; within a pixel of it the box is not transformed, and its exact
      // size keeps the transform scale at 1 (the cached-background path) instead of a sub-pixel "scale".
      const exact=(rendered:number,layout:number)=>Math.abs(rendered-layout)<1?rendered:layout;
      return {measured,lens,y,max,fixedOffset,width:exact(lens.width,panel.offsetWidth),height:exact(lens.height,panel.offsetHeight)};
    }catch{return;}
  }
  const frame = () => {
    const current=measurement;measurement=undefined;
    if (disposed || document.hidden || renderer.contextLost || (faulted && !dirty)) return;
    faulted = false;
    try {
      // Older independently bundled entries may own the ticker: retain an inline fallback.
      const geometryRead=current??measure();if(!geometryRead)return;
      const {measured,lens,y,max,fixedOffset,width,height}=geometryRead;
      const elastic=y<0||y>max;
      if(!elastic)documentTop=measured.top+y;
      sourceRect=new DOMRect(measured.left,elastic&&!fixedSource?documentTop-y:measured.top,measured.width,measured.height);
      const rect=new DOMRect(lens.left,lens.top-fixedOffset,lens.width,lens.height);
      if(!width||!height||!sourceRect.width||!sourceRect.height)return;
      const dpr = Math.min(devicePixelRatio || 1, options.optics==='liquidgl'?2:3);
      const geometry = [rect.left - sourceRect.left, rect.top - sourceRect.top, sourceRect.width, sourceRect.height, width, height, rect.width, rect.height, dpr].join(':');
      const version = media instanceof HTMLCanvasElement ? canvasFrame(media) : undefined;
      const time = videoCallback !== undefined ? videoFrame : video?.currentTime ?? version ?? 0;
      if (!options.liquidGL?.specular && !dirty && geometry === lastGeometry && time === lastTime && (!(media instanceof HTMLCanvasElement) || version !== undefined)) return;
      if (video && video.readyState < 2) return;
      const snapshot = media ?? shared?.capture.cache.get(source)?.canvas;
      if (!snapshot) return; // Keep the previous complete output during captures.
      const w = Math.round((width + SHADOW_PAD * 2) * dpr), h = Math.round((height + SHADOW_PAD * 2) * dpr);
      // CSS transforms scale the canvas too. Sample the same visual extent.
      const scaleX = rect.width / width, scaleY = rect.height / height;
      if(options.optics==='liquidgl' && liquidOptics){
        const rendered=liquidOptics(snapshot as HTMLCanvasElement|HTMLVideoElement,rect,sourceRect,width,height,dpr,SHADOW_PAD,options,media?(version??(video?time:performance.now())):undefined,slot&&{prepare:(fw,fh)=>{slot.prepare(fw,fh)}});
        if(!rendered)return;
        if(slot)slot.present(rendered.left*dpr,rendered.top*dpr,rendered.w,rendered.h,dpr);
        else{canvas.style.transform=`translate(${rendered.left+SHADOW_PAD}px,${rendered.top+SHADOW_PAD}px)`;
        canvas.style.width=`${rendered.cssWidth}px`;canvas.style.height=`${rendered.cssHeight}px`;
        present(rendered.w,rendered.h);}
        dirty=false;lastGeometry=geometry;lastTime=time;
        if(!ready){ready=true;setStatus('active');}
        return;
      }
      canvas.style.width = `${width + SHADOW_PAD * 2}px`; canvas.style.height = `${height + SHADOW_PAD * 2}px`;
      canvas.style.transform='';
      canvas.style.left=canvas.style.top=`-${SHADOW_PAD}px`;
      if(slot)renderer.target=slot.prepare(w,h);
      const sampleRect = new DOMRect(rect.left, rect.top, rect.width, rect.height);
      const useCache = scaleX === 1 && scaleY === 1 && prepare?.(sampleRect, SHADOW_PAD);
      // Reset cached crop when switching to a transformed output.
      if (!useCache && prepare && (scaleX !== 1 || scaleY !== 1)) prepare(undefined, SHADOW_PAD);
      if (!useCache) {
        if (scene.width !== w || scene.height !== h) {
          scene.width = w; scene.height = h;
        } else {
          ctx.clearRect(0, 0, w, h);
        }
        const dx = (sourceRect.left - rect.left) / scaleX * dpr + SHADOW_PAD * dpr;
        const dy = (sourceRect.top - rect.top) / scaleY * dpr + SHADOW_PAD * dpr;
        const dw = sourceRect.width / scaleX * dpr, dh = sourceRect.height / scaleY * dpr;
        if (media) {
          const sw = video?.videoWidth ?? (media as HTMLCanvasElement).width;
          const sh = video?.videoHeight ?? (media as HTMLCanvasElement).height;
          if (!sw || !sh) return;
          const style = getComputedStyle(source);
          let mw = dw, mh = dh;
          if (style.objectFit !== 'fill') {
            const fit = style.objectFit === 'cover' ? Math.max(dw / sw, dh / sh)
              : style.objectFit === 'none' ? dpr : Math.min(dw / sw, dh / sh, style.objectFit === 'scale-down' ? dpr : Infinity);
            mw = sw * fit; mh = sh * fit;
          }
          const position = style.objectPosition.split(' ');
          const align = (v: string, remaining: number) => v.endsWith('%') ? parseFloat(v) / 100 * remaining : parseFloat(v) * dpr || 0;
          ctx.save();ctx.beginPath();ctx.rect(dx, dy, dw, dh);ctx.clip();
          ctx.drawImage(media, dx + align(position[0], dw - mw), dy + align(position[1] ?? '50%', dh - mh), mw, mh);ctx.restore();
        } else {
          ctx.drawImage(snapshot, 0, dy > 0 ? 0 : snapshot.height - 1, snapshot.width, 1, dx, 0, dw, h);
          ctx.drawImage(snapshot, dx, dy, dw, dh);
        }
      }
      renderer.uploadAndBlur(scene, 0, 0, w, h, Math.max(0, options.blur) / 5);
      renderer.clear();
      renderer.renderGlassPanel({ cornerRadius: options.radius, opacity: DEFAULTS.opacity }, width, height, dpr);
      if(slot)slot.present(-SHADOW_PAD*dpr,-SHADOW_PAD*dpr,w,h,dpr);else present(w,h);
      dirty = false; lastGeometry = geometry; lastTime = time;
      if (optics.failed) { setStatus('capture-failed'); ready = false; }
      else if (optics.ready && !ready) { ready = true; setStatus('active'); }
    } catch {
      // Tainted videos/canvases and allocation failures must leave a usable CSS surface.
      faulted = true; dirty = false; ready = false;
      setStatus('capture-failed');
    }
  };
  if (shared && !shared.capture.cache.has(source)) void shared.refresh().catch(() => {});
  const stopFrame = subscribeFrame(frame,()=>{measurement=measure();});
  return {
    update(next) { options = next; changed(); },
    async refresh() { await shared?.refresh(); changed(); },
    destroy() {
      if (disposed) return;
      disposed = true; stopFrame();
      renderer.canvas.removeEventListener('webglcontextlost', lose);renderer.canvas.removeEventListener('webglcontextrestored', restore);
      video?.removeEventListener('seeked', mediaChanged);video?.removeEventListener('loadeddata', mediaChanged);
      if (videoCallback !== undefined) video?.cancelVideoFrameCallback(videoCallback);
      origin.remove(); shared?.release(); context.destroy(); lease?.release(); slot?.release();
      if(slot)delete panel.dataset.glassComposition;
      canvas.remove(); canvas.width = canvas.height = 0;
      scene.width = 0; scene.height = 0;
    }
  };
}
