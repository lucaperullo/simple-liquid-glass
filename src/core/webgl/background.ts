import { BLUR_ITERATIONS } from '../../vendor/ybouane/defaults';
import { VS_QUAD } from '../../vendor/ybouane/shaders';
import { releaseProgram } from '../../vendor/ybouane/GlassRenderer';
import { acquireTexture } from './textureCache';

import type { EngineContext } from './types';

/** Fraction of the free space before the content for one object-position component, or undefined (only %, keywords). */
const alignment = (value: string | undefined) => value === undefined ? .5 : value.endsWith('%') ? parseFloat(value) / 100
  : value === 'left' || value === 'top' ? 0 : value === 'right' || value === 'bottom' ? 1 : value === 'center' ? .5 : undefined;

/** Reuse a bounded static HTML texture while scrolling. Fall back for oversized sources.
 * With `videoFrame`, a playing video is uploaded once per presented frame and shared by every panel in the context,
 * each sampling its own region (object-fit fill/contain/cover with percentage or keyword positions). */
export function cachedBackground(instance: EngineContext, source: HTMLElement, sourceBounds = () => source.getBoundingClientRect(),
  videoFrame?: () => number) {
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

  const videoRegion = (rect: DOMRect, padding: number) => {
    const video = source as HTMLVideoElement, frame = videoFrame!();
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh || vw > limit || vh > limit || video.readyState < 2 || renderer.contextLost) return false;
    const bounds = sourceBounds(), style = getComputedStyle(video), [px, py] = style.objectPosition.split(' ');
    const ax = alignment(px), ay = alignment(py);
    let fx = bounds.width / vw, fy = bounds.height / vh;
    if (style.objectFit === 'cover') fx = fy = Math.max(fx, fy);
    else if (style.objectFit === 'contain') fx = fy = Math.min(fx, fy);
    else if (style.objectFit !== 'fill') return false;
    if (ax === undefined || ay === undefined) return false;
    // The crop path clips the video to its element: sample in place only when the panel lies inside it (its shadow
    // margin may reach past the edge, where sampling clamps).
    if (rect.left < bounds.left - .5 || rect.top < bounds.top - .5 || rect.right > bounds.right + .5 || rect.bottom > bounds.bottom + .5) return false;
    if (video !== image || frame !== imageFrame) {
      gl.activeTexture(gl.TEXTURE0);
      const next = acquireTexture(gl, video, true, frame);
      textureLease?.release(); textureLease = next; texture = next.texture;
      image = video; imageFrame = frame;
    }
    const dw = vw * fx, dh = vh * fy, left = bounds.left + (bounds.width - dw) * ax, top = bounds.top + (bounds.height - dh) * ay;
    region = {x: (rect.left - padding - left) / dw, y: 1 - (rect.bottom + padding - top) / dh,
      w: (rect.width + padding * 2) / dw, h: (rect.height + padding * 2) / dh};
    return true;
  };

  return (rect: DOMRect | undefined, padding: number) => {
    region = undefined;
    if (!rect) return false;
    if (videoFrame) return videoRegion(rect, padding);
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
