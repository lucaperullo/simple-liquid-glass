import { BLUR_ITERATIONS } from '../../vendor/ybouane/defaults';
import { VS_QUAD } from '../../vendor/ybouane/shaders';
import { releaseProgram } from '../../vendor/ybouane/GlassRenderer';
import { acquireTexture } from './textureCache';

import type { GlassRenderer } from '../../vendor/ybouane/GlassRenderer';
import type { EngineContext } from './types';

/** Fraction of the free space before the content for one object-position component, or undefined (only %, keywords). */
const alignment = (value: string | undefined) => value === undefined ? .5 : value.endsWith('%') ? parseFloat(value) / 100
  : value === 'left' || value === 'top' ? 0 : value === 'right' || value === 'bottom' ? 1 : value === 'center' ? .5 : undefined;

// A playing video or canvas backdrop is shared by every panel sampling it (one upload per frame, see below). When
// panels also blur it, each used to run its own full blit+Gaussian pipeline on its own small crop. Blurring the
// whole backdrop once per (media, blur amount, frame) instead and letting every panel sample a region of that
// single result (exactly like the already-shared unblurred `direct` path) turns N per-panel pipelines into one —
// but that one pipeline runs over a bigger buffer (the whole backdrop, not one panel's crop), so it only wins once
// enough panels share it: measured on a real device, a handful of panels blurring their own small crop stays
// cheaper than the whole backdrop once (panels below SHARE_MIN_PANELS keep the old per-panel pipeline below), while
// dozens of panels sharing it turned a backdrop-sized collapse (~9fps at 48 panels) into display-rate-independent
// cost (~this function's own cost, regardless of panel count). The blur radius this produces is identical to the
// old per-panel one: both express the Gaussian spread as a fraction of the buffer they blur, and a panel's region
// is the same fraction of that buffer either way, so the fraction-of-buffer × buffer-to-screen magnification the
// panel ends up seeing is unchanged — see the engine's CHANGELOG for the derivation and the measurements.
const SHARE_MIN_PANELS = 8;
type FBO = ReturnType<GlassRenderer['_makeFBO']>;
interface BlurEntry { a?: FBO; b?: FBO; version: number; computedVersion?: number; blur: number; uses: number; prevUses: number }
const sharedBlurs = new WeakMap<WebGLRenderingContext, WeakMap<object, BlurEntry>>();

/** Drop this context's shared-blur cache: its FBOs and textures die with a lost context, so cached handles would
 * otherwise be stale once it is restored (the same reason `invalidateTextures` exists for the backdrop texture
 * cache). Call from a context's `webglcontextlost` handler. */
export function invalidateSharedBlur(gl: WebGLRenderingContext): void { sharedBlurs.delete(gl); }

/** The Gaussian-blurred whole backdrop for this (gl, media), recomputed only when `version` (the media's
 * frame/version counter) or the blur amount changes — once per frame no matter how many panels call in with the
 * same key — or null when fewer than SHARE_MIN_PANELS panels used this same (media, frame) last frame, or the
 * backdrop size is degenerate or exceeds this context's texture limit, in which case the caller keeps its own
 * per-panel pipeline. `boundsW`/`boundsH` are the backdrop's own size in the same device-px units as the caller's
 * panel size (derived from it, so no dpr is needed here). */
function sharedBlurredBackdrop(renderer: GlassRenderer, source: WebGLTexture, media: object, blurAmount: number,
  version: number, boundsW: number, boundsH: number, limit: number): WebGLTexture | null {
  if (!(boundsW > 0) || !(boundsH > 0)) return null;
  const gl = renderer.gl;
  let byMedia = sharedBlurs.get(gl); if (!byMedia) { byMedia = new WeakMap(); sharedBlurs.set(gl, byMedia); }
  let entry = byMedia.get(media);
  if (!entry) { entry = { version: NaN, blur: NaN, uses: 0, prevUses: 0 }; byMedia.set(media, entry); }
  // Count how many panels asked for this (media, frame) last time it changed; that count predicts this frame's
  // (the panel layout driving it rarely changes frame to frame) and decides which pipeline to use before this
  // frame's other panels have even asked.
  if (version !== entry.version) { entry.prevUses = entry.uses; entry.uses = 1; entry.version = version; }
  else entry.uses++;
  if (entry.prevUses < SHARE_MIN_PANELS) return null;
  const bw = Math.min(limit, Math.max(1, Math.ceil(boundsW / 2))), bh = Math.min(limit, Math.max(1, Math.ceil(boundsH / 2)));
  if (entry.a && entry.computedVersion === version && entry.blur === blurAmount && entry.a.w === bw && entry.a.h === bh) return entry.a.tex;
  if (!entry.a || entry.a.w !== bw || entry.a.h !== bh) {
    if (entry.a) { renderer._freeFBO(entry.a); renderer._freeFBO(entry.b!); }
    entry.a = renderer._makeFBO(bw, bh); entry.b = renderer._makeFBO(bw, bh);
  }
  const a = entry.a, b = entry.b!;
  // Downsample the whole backdrop into A, then ping-pong the Gaussian blur between A and B, ending in A — the same
  // pass shape as the old per-panel pipeline, just sized to the backdrop instead of to one panel's crop.
  gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
  gl.viewport(0, 0, bw, bh);
  gl.useProgram(renderer.blitP);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, source);
  gl.uniform1i(renderer.blitU.u_tex, 0);
  gl.uniform2f(renderer.blitU.u_scale, 1, 1);
  gl.uniform2f(renderer.blitU.u_offset, 0, 0);
  renderer._drawQuad(renderer.blitP, renderer.quadBuf);
  const spread = blurAmount * 2.5;
  gl.useProgram(renderer.blurP);
  gl.uniform1i(renderer.blurU.u_tex, 0);
  for (let i = 0; i < BLUR_ITERATIONS; i++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform2f(renderer.blurU.u_dir, spread / bw, 0);
    renderer._drawQuad(renderer.blurP, renderer.quadBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.uniform2f(renderer.blurU.u_dir, 0, spread / bh);
    renderer._drawQuad(renderer.blurP, renderer.quadBuf);
  }
  entry.computedVersion = version; entry.blur = blurAmount;
  return a.tex;
}

/** Reuse a bounded static HTML texture while scrolling. Fall back for oversized sources.
 * With `mediaFrame`, a playing video or a canvas is uploaded once per frame (a presented video frame, a canvas
 * version or render batch) and shared by every panel in the context, each sampling its own region (object-fit
 * fill/contain/cover with percentage or keyword positions). */
export function cachedBackground(instance: EngineContext, source: HTMLElement, sourceBounds = () => source.getBoundingClientRect(),
  mediaFrame?: () => number) {
  const renderer = instance.renderer, gl: WebGLRenderingContext = renderer.gl;
  let image: HTMLCanvasElement | HTMLVideoElement | undefined, imageFrame: number | undefined;
  let texture: WebGLTexture | null = null;
  let textureLease: ReturnType<typeof acquireTexture> | undefined;
  let program: WebGLProgram | null = null;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const originalUpload = renderer.uploadAndBlur.bind(renderer);
  let region: {x: number; y: number; w: number; h: number} | undefined;
  const reset = () => { image = undefined; texture = null; program = null; textureLease = undefined; };
  renderer.canvas.addEventListener('webglcontextrestored', reset);
  const dispose = () => {
    renderer.canvas.removeEventListener('webglcontextrestored', reset);
    textureLease?.release(); textureLease = undefined; image = undefined; texture = null;
    releaseProgram(gl, program);
  };
  const destroy = instance.destroy.bind(instance);
  instance.destroy = () => { dispose(); destroy(); };

  renderer.uploadAndBlur = (canvas: HTMLCanvasElement, sx: number, sy: number, w: number, h: number, blur: number) => {
    if (!region) return originalUpload(canvas, sx, sy, w, h, blur);
    renderer.direct = null;
    if (renderer.contextLost || !renderer._setActiveSize(w, h)) return;
    // Unblurred: the glass samples the snapshot texture in place, saving a full-panel copy per frame.
    if (blur <= 0 && texture) { renderer.direct = { texture, region: [region.x, region.y, region.w, region.h] }; renderer.blurActive = false; return; }
    // A playing video or canvas backdrop: blur it once for every panel sampling it this frame instead of once per
    // panel (region.w/h is the panel's padded extent as a fraction of the backdrop's, in either device or CSS px —
    // the ratio is the same — so dividing the panel's own device-px size by it gives the backdrop's device-px size
    // without needing dpr here).
    if (blur > 0 && mediaFrame && texture && image) {
      const boundsW = region.w > 1e-6 ? w / region.w : 0, boundsH = region.h > 1e-6 ? h / region.h : 0;
      const shared = sharedBlurredBackdrop(renderer, texture, image, blur, imageFrame ?? 0, boundsW, boundsH, limit);
      if (shared) { renderer.direct = { texture: shared, region: [region.x, region.y, region.w, region.h] }; renderer.blurActive = false; return; }
    }
    const fbo = renderer.activeFBOs!;
    if (!program) {
      program = renderer._link(VS_QUAD, `precision highp float;
        uniform sampler2D u_tex; uniform vec2 u_scale; uniform vec2 u_offset; varying vec2 v_uv;
        void main() { vec2 uv = v_uv * u_scale + u_offset;
          gl_FragColor = texture2D(u_tex, clamp(uv, vec2(0.0), vec2(1.0))); }`);
      uniforms = renderer._uloc(program, ['u_tex', 'u_scale', 'u_offset']);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.bg.fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.u_tex, 0);
    gl.uniform2f(uniforms.u_scale, region.w, region.h);
    gl.uniform2f(uniforms.u_offset, region.x, region.y);
    renderer._drawQuad(program, renderer.quadBuf);

    renderer.blurActive = blur > 0;
    if (!renderer.blurActive) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.blurA.fbo);
    gl.viewport(0, 0, fbo.blurA.w, fbo.blurA.h);
    gl.useProgram(renderer.blitP);
    gl.bindTexture(gl.TEXTURE_2D, fbo.bg.tex);
    gl.uniform1i(renderer.blitU.u_tex, 0);
    gl.uniform2f(renderer.blitU.u_scale, 1, 1);
    gl.uniform2f(renderer.blitU.u_offset, 0, 0);
    renderer._drawQuad(renderer.blitP, renderer.quadBuf);
    if (blur > 0) {
      const spread = blur * 2.5;
      gl.useProgram(renderer.blurP);
      gl.uniform1i(renderer.blurU.u_tex, 0);
      for (let i = 0; i < BLUR_ITERATIONS; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.blurB.fbo);
        gl.bindTexture(gl.TEXTURE_2D, fbo.blurA.tex);
        gl.uniform2f(renderer.blurU.u_dir, spread / fbo.blurA.w, 0);
        renderer._drawQuad(renderer.blurP, renderer.quadBuf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.blurA.fbo);
        gl.bindTexture(gl.TEXTURE_2D, fbo.blurB.tex);
        gl.uniform2f(renderer.blurU.u_dir, 0, spread / fbo.blurA.h);
        renderer._drawQuad(renderer.blurP, renderer.quadBuf);
      }
    }
  };

  const mediaRegion = (rect: DOMRect, padding: number) => {
    const media = source as HTMLVideoElement & HTMLCanvasElement, frame = mediaFrame!(), isVideo = source instanceof HTMLVideoElement;
    const vw = isVideo ? media.videoWidth : media.width, vh = isVideo ? media.videoHeight : media.height;
    if (!vw || !vh || vw > limit || vh > limit || isVideo && media.readyState < 2 || renderer.contextLost) return false;
    const bounds = sourceBounds(), style = getComputedStyle(media), [px, py] = style.objectPosition.split(' ');
    const ax = alignment(px), ay = alignment(py);
    let fx = bounds.width / vw, fy = bounds.height / vh;
    if (style.objectFit === 'cover') fx = fy = Math.max(fx, fy);
    else if (style.objectFit === 'contain') fx = fy = Math.min(fx, fy);
    else if (style.objectFit !== 'fill') return false;
    if (ax === undefined || ay === undefined) return false;
    // The crop path clips the media to its element: sample in place only when the panel lies inside it (its shadow
    // margin may reach past the edge, where sampling clamps).
    if (rect.left < bounds.left - .5 || rect.top < bounds.top - .5 || rect.right > bounds.right + .5 || rect.bottom > bounds.bottom + .5) return false;
    if (media !== image || frame !== imageFrame) {
      gl.activeTexture(gl.TEXTURE0);
      const next = acquireTexture(gl, media, true, frame);
      textureLease?.release(); textureLease = next; texture = next.texture;
      image = media; imageFrame = frame;
    }
    const dw = vw * fx, dh = vh * fy, left = bounds.left + (bounds.width - dw) * ax, top = bounds.top + (bounds.height - dh) * ay;
    region = {x: (rect.left - padding - left) / dw, y: 1 - (rect.bottom + padding - top) / dh,
      w: (rect.width + padding * 2) / dw, h: (rect.height + padding * 2) / dh};
    return true;
  };

  return (rect: DOMRect | undefined, padding: number) => {
    region = undefined;
    if (!rect) return false;
    if (mediaFrame) return mediaRegion(rect, padding);
    const snapshot = instance.capture.cache.get(source)?.canvas as HTMLCanvasElement | undefined;
    if (!snapshot || snapshot.width > limit || snapshot.height > limit || snapshot.width * snapshot.height * 4 > 64 * 1024 * 1024) return false;
    if (renderer.contextLost) return false;
    if (snapshot !== image) {
      gl.activeTexture(gl.TEXTURE0);
      const next = acquireTexture(gl, snapshot, true);
      textureLease?.release(); textureLease = next; texture = next.texture;
      image = snapshot;
    }
    const bounds = sourceBounds();
    region = {x: (rect.left - padding - bounds.left) / bounds.width,
      y: 1 - (rect.bottom + padding - bounds.top) / bounds.height,
      w: (rect.width + padding * 2) / bounds.width, h: (rect.height + padding * 2) / bounds.height};
    return true;
  };
}
