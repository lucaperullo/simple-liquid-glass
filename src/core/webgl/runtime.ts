import { GlassRenderer } from '../../vendor/ybouane/GlassRenderer';
import { DEFAULTS, SHADOW_PAD } from '../../vendor/ybouane/defaults';
import { cachedBackground } from './background';
import { installPackageOptics } from './optics';
import { acquireSource } from './source';
import type { EngineContext, WebGLEngine, WebGLOptions, WebGLStatus } from './types';

function fixedToViewport(element: HTMLElement): boolean {
  let fixed = false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (fixed && (style.transform !== 'none' || style.perspective !== 'none' || style.filter !== 'none')) return false;
    if (style.position === 'fixed') fixed = true;
  }
  return fixed;
}

/** One direct GPU output per visible panel, shared HTML capture per source. */
export function createWebGLEngine(panel: HTMLElement, holder: HTMLElement, source: HTMLElement,
  initial: WebGLOptions, status: (status: WebGLStatus) => void): WebGLEngine {
  const renderer = new GlassRenderer();
  let options = initial, dirty = true, disposed = false, raf = 0;
  const video = source instanceof HTMLVideoElement ? source : undefined;
  const media = video ?? (source instanceof HTMLCanvasElement ? source : undefined);
  let ready = false, faulted = false;
  const setStatus = (next: WebGLStatus) => { if (!disposed) status(next); };
  const shared = media ? undefined : acquireSource(source, error => {
    dirty = true;
    if (error && !shared?.capture.cache.has(source)) setStatus('capture-failed');
  });
  const context: EngineContext = { renderer, capture: shared?.capture ?? { cache: new Map() },
    markChanged: () => { dirty = true; }, destroy: () => renderer.destroy() };
  let sourceRect = source.getBoundingClientRect();
  let documentTop = sourceRect.top + scrollY;
  const fixedSource = fixedToViewport(source);
  const fixedPanel = fixedToViewport(panel);
  const origin = document.createElement('div');
  origin.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none';
  origin.setAttribute('aria-hidden', 'true'); document.body.append(origin);
  const prepare = media ? undefined : cachedBackground(context, source, () => sourceRect);
  const optics = installPackageOptics(context, () => options);
  const canvas = renderer.canvas;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.liquidGlassWebgl = '';
  canvas.style.cssText = `display:block;position:absolute;left:-${SHADOW_PAD}px;top:-${SHADOW_PAD}px;pointer-events:none`;
  holder.append(canvas);
  const scene = document.createElement('canvas'), ctx = scene.getContext('2d')!;
  let lastGeometry = '', lastTime = -1;
  const lose = () => { ready = false; setStatus('webgl-unavailable'); };
  const restore = () => { dirty = true; setStatus('pending'); };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);
  const mediaChanged = () => { dirty = true; };
  video?.addEventListener('seeked', mediaChanged);
  video?.addEventListener('loadeddata', mediaChanged);

  // Playback time advances between decoded frames too. Only upload a new frame,
  // while geometry/optics changes remain free to render at the display cadence.
  let videoFrame = 0, videoCallback: number | undefined;
  const trackVideoFrame = () => {
    videoFrame++;
    if (!disposed) videoCallback = video!.requestVideoFrameCallback(trackVideoFrame);
  };
  if (video?.requestVideoFrameCallback) videoCallback = video.requestVideoFrameCallback(trackVideoFrame);

  const frame = () => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden || renderer.contextLost || (faulted && !dirty)) return;
    faulted = false;
    try {
      const measured = source.getBoundingClientRect(), lens = panel.getBoundingClientRect();
      const y = scrollY, max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const elastic = y < 0 || y > max;
      if (!elastic) documentTop = measured.top + y;
      sourceRect = new DOMRect(measured.left, elastic && !fixedSource ? documentTop - y : measured.top, measured.width, measured.height);
      const fixedOffset = elastic && fixedPanel ? origin.getBoundingClientRect().top : 0;
      const rect = new DOMRect(lens.left, lens.top - fixedOffset, lens.width, lens.height);
      const width = panel.offsetWidth, height = panel.offsetHeight;
      if (!width || !height || !sourceRect.width || !sourceRect.height) return;
      const dpr = Math.min(devicePixelRatio || 1, 3);
      const geometry = [rect.left - sourceRect.left, rect.top - sourceRect.top, sourceRect.width, sourceRect.height, width, height, rect.width, rect.height, dpr].join(':');
      const time = videoCallback !== undefined ? videoFrame : video?.currentTime ?? 0;
      if (!dirty && geometry === lastGeometry && time === lastTime && !(media instanceof HTMLCanvasElement)) return;
      if (video && video.readyState < 2) return;
      const snapshot = media ?? shared?.capture.cache.get(source)?.canvas;
      if (!snapshot) return; // Keep the previous complete output during captures.
      const w = Math.round((width + SHADOW_PAD * 2) * dpr), h = Math.round((height + SHADOW_PAD * 2) * dpr);
      canvas.style.width = `${width + SHADOW_PAD * 2}px`; canvas.style.height = `${height + SHADOW_PAD * 2}px`;
      // CSS transforms scale the canvas too. Sample the same visual extent.
      const scaleX = rect.width / width, scaleY = rect.height / height;
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
      renderer.renderGlassPanel({ ...DEFAULTS, cornerRadius: options.radius, shadowOpacity: 0 }, width, height, dpr);
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
  raf = requestAnimationFrame(frame);
  return {
    update(next) { options = next; dirty = true; },
    async refresh() { await shared?.refresh(); dirty = true; },
    destroy() {
      disposed = true; cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', lose);canvas.removeEventListener('webglcontextrestored', restore);
      video?.removeEventListener('seeked', mediaChanged);video?.removeEventListener('loadeddata', mediaChanged);
      if (videoCallback !== undefined) video?.cancelVideoFrameCallback(videoCallback);
      origin.remove(); shared?.release(); context.destroy();
      scene.width = 0; scene.height = 0;
    }
  };
}
