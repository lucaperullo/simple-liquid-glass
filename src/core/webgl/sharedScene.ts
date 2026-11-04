import { VS_QUAD } from '../../vendor/ybouane/shaders';
import { frameRect, subscribeFrame } from './contextPool';
import { createWebGLEngine } from './runtime';
import type { installLiquidGLOptics } from './liquidGLOptics';
import type { SceneSlot, WebGLEngine, WebGLOptions, WebGLStatus } from './types';

/**
 * Sibling WebGL panels over the same backdrop share one canvas, placed in their parent just before the first of
 * them. Every panel draws into a framebuffer of that canvas's context and the scene composites them in one pass:
 * the compositor updates one layer per frame instead of one per panel, which is what kept many moving panels
 * below the display rate.
 *
 * The canvas paints where the first panel would, below every panel. That is the per-panel result only when a
 * panel's own box paints nothing under its glass and nothing about the panel changes how its glass composites,
 * so those panels keep their own canvas (`sceneIneligibility`). Elements placed between grouped panels in the
 * DOM that overlap a later panel appear above its glass; `webglScene="off"` restores per-panel output.
 *
 * A scene can also group panels by a further ancestor (`root`), for example words wrapped in their own element.
 * Every element between a panel and that root must then composite like a plain box (see `sceneIneligibility`).
 * An optional alpha mask per panel (glyph outlines) is applied while compositing.
 */

const MAX_DPR = 3, VIEWPORT_MARGIN = 64, SIZE_STEP = 256;
// u_maskRect maps the slot's top-down uv onto the mask, which covers the panel box: outside it nothing shows.
const BLIT = `precision highp float;varying vec2 v_uv;uniform sampler2D u_lens;uniform sampler2D u_mask;uniform vec4 u_maskRect;uniform float u_masked;uniform float u_reveal;uniform float u_feather;
void main(){vec4 c=texture2D(u_lens,v_uv);float m=1.0;
if(u_masked>0.5){vec2 p=u_maskRect.xy+vec2(v_uv.x,1.0-v_uv.y)*u_maskRect.zw;m=p.x<0.0||p.y<0.0||p.x>1.0||p.y>1.0?0.0:texture2D(u_mask,p).a*(u_feather>0.0?clamp((u_reveal-p.x)/u_feather,0.0,1.0):step(p.x,u_reveal));}
gl_FragColor=vec4(c.rgb*c.a,c.a)*m;}`;

const transparent = (color: string) => color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);
// Translation and positive scale composite as a scaled box; rotation and skew keep the panel's own canvas.
const scaleOrTranslate = (transform: string) => {
  if (transform === 'none') return true;
  const m = /^matrix\(([^,]+), ([^,]+), ([^,]+), ([^,]+), [^,]+, [^,]+\)$/.exec(transform);
  return !!m && Number(m[2]) === 0 && Number(m[3]) === 0 && Number(m[1]) > 0 && Number(m[4]) > 0;
};
// The rendered box keeps the layout's aspect under scale; a different aspect means rotation or skew somewhere above.
const ASPECT_TOLERANCE = .02;

const plainBox = (style: CSSStyleDeclaration) => Number(style.opacity) === 1 && style.filter === 'none' && style.mixBlendMode === 'normal'
  && style.clipPath === 'none' && (style.maskImage || 'none') === 'none' && scaleOrTranslate(style.transform)
  && style.overflowX === 'visible' && style.overflowY === 'visible' && (style.position === 'static' || style.zIndex === 'auto');

/** Why a panel keeps its own canvas instead of joining a shared scene; undefined when it can join. */
export function sceneIneligibility(panel: HTMLElement, source: HTMLElement, root: HTMLElement | null = panel.parentElement): string | undefined {
  if (!root || root === panel || !root.contains(panel)) return 'detached';
  if (source === root || source.contains(root)) return 'inside-backdrop';
  for (let between = panel.parentElement; between && between !== root; between = between.parentElement) {
    if (!plainBox(getComputedStyle(between))) return 'ancestor';
  }
  const style = getComputedStyle(panel);
  if (style.position === 'static') return 'static';
  // The component itself hides the panel while its renderer starts (reveal="ready").
  if (Number(style.opacity) !== 1 && panel.dataset.glassReason !== 'initializing') return 'opacity';
  if (style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.clipPath !== 'none' || (style.maskImage || 'none') !== 'none') return 'compositing';
  if (!scaleOrTranslate(style.transform)) return 'transform';
  if (style.backgroundImage !== 'none' || !transparent(style.backgroundColor)) return 'background';
  if (style.zIndex !== 'auto' && Number(style.zIndex) < 0) return 'z-index';
  return undefined;
}

interface Slot extends SceneSlot {
  panel: HTMLElement;
  tex: WebGLTexture | null; fbo: WebGLFramebuffer | null;
  w: number; h: number; x: number; y: number; dpr: number;
  ready: boolean; frames: number; rect?: DOMRect; sx: number; sy: number; evict: () => void;
  maskSource?: TexImageSource; maskTex: WebGLTexture | null; maskDirty: boolean; reveal: number; feather: number;
}

// How long an empty scene keeps its context before releasing it.
const SCENE_REST_MS = 8000;

class Scene {
  readonly canvas = document.createElement('canvas');
  readonly gl: WebGLRenderingContext;
  readonly slots = new Set<Slot>();
  private program: WebGLProgram | null = null;
  private quad: WebGLBuffer | null = null;
  private position = 0;
  private uniforms: Record<'lens' | 'mask' | 'maskRect' | 'masked' | 'reveal' | 'feather', WebGLUniformLocation | null> = { lens: null, mask: null, maskRect: null, masked: null, reveal: null, feather: null };
  private stop: () => void = () => {};
  private canvasRect?: DOMRect;
  // An ancestor transform (an animated heading) scales the canvas too; positions and sizes are divided by it.
  private canvasScale = 1;
  private left = 0; private top = 0; private drawn = '';
  private resting?: ReturnType<typeof setTimeout>;
  // Re-place the canvas only when the parent's children change (keyed re-renders can reorder panels).
  private readonly order = new MutationObserver(() => this.place());

  constructor(readonly parent: HTMLElement, readonly source: HTMLElement, readonly zIndex: string, private readonly done: (scene: Scene) => void) {
    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('LiquidGlass: WebGL unavailable');
    this.gl = gl;
    this.canvas.width = this.canvas.height = 1;
    this.canvas.style.cssText = `display:block;position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:${zIndex}`;
    this.canvas.dataset.liquidGlassScene = ''; this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.addEventListener('webglcontextlost', this.lost);
    this.canvas.addEventListener('webglcontextrestored', this.restored);
    this.order.observe(parent, { childList: true });
  }

  private lost = (event: Event) => { event.preventDefault(); };
  private restored = () => { this.program = null; this.quad = null; for (const slot of this.slots) { slot.tex = slot.fbo = slot.maskTex = null; slot.ready = false; slot.maskDirty = !!slot.maskSource; } this.drawn = ''; };

  /** The root's child that holds the panel: the canvas is placed before the first of these. */
  private anchor(panel: HTMLElement) {
    let anchor: HTMLElement | null = panel;
    while (anchor && anchor.parentElement !== this.parent) anchor = anchor.parentElement;
    return anchor ?? undefined;
  }

  add(panel: HTMLElement, evict: () => void): Slot {
    clearTimeout(this.resting);
    const gl = this.gl, scene = this;
    const slot: Slot = {
      canvas: this.canvas, panel, evict, tex: null, fbo: null, w: 0, h: 0, x: 0, y: 0, dpr: 1, ready: false, frames: 0, sx: 1, sy: 1, maskTex: null, maskDirty: false, reveal: 1, feather: 0, maxScale: Infinity,
      prepare(w, h) {
        if (!slot.fbo || slot.w !== w || slot.h !== h) {
          scene.free(slot);
          slot.tex = gl.createTexture(); slot.fbo = gl.createFramebuffer();
          if (!slot.tex || !slot.fbo) throw new Error('LiquidGlass: shared scene allocation failed');
          gl.bindTexture(gl.TEXTURE_2D, slot.tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          for (const [name, value] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, name, value);
          gl.bindFramebuffer(gl.FRAMEBUFFER, slot.fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, slot.tex, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('LiquidGlass: incomplete shared scene target');
          slot.w = w; slot.h = h;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, slot.fbo); gl.viewport(0, 0, w, h); gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        return slot.fbo!;
      },
      present(x, y, w, h, dpr) {
        if (w !== slot.w || h !== slot.h) return;
        slot.x = x; slot.y = y; slot.dpr = dpr; slot.ready = true; slot.frames++;
      },
      mask(source, reveal = 1, feather = 0) {
        if (reveal !== slot.reveal || feather !== slot.feather) { slot.reveal = reveal; slot.feather = feather; scene.drawn = ''; }
        if (source === slot.maskSource) return;
        slot.maskSource = source; slot.maskDirty = true; scene.drawn = '';
      },
      release() { scene.remove(slot); }
    };
    this.slots.add(slot);
    this.place();
    // Composite after every panel has drawn in a frame: frames run in subscription order.
    this.stop(); this.stop = subscribeFrame(this.frame, this.measure);
    return slot;
  }

  private free(slot: Slot) {
    if (!this.gl.isContextLost()) { if (slot.tex) this.gl.deleteTexture(slot.tex); if (slot.fbo) this.gl.deleteFramebuffer(slot.fbo); }
    slot.tex = slot.fbo = null; slot.w = slot.h = 0; slot.ready = false;
  }

  /** Uploads a changed mask; called while compositing, which rebinds the units it uses. */
  private uploadMask(slot: Slot) {
    const gl = this.gl;
    slot.maskDirty = false;
    if (!slot.maskSource) { if (slot.maskTex && !gl.isContextLost()) gl.deleteTexture(slot.maskTex); slot.maskTex = null; return; }
    slot.maskTex ??= gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, slot.maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, slot.maskSource);
    for (const [name, value] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, name, value);
  }

  private remove(slot: Slot) {
    if (!this.slots.delete(slot)) return;
    this.free(slot); this.drawn = '';
    if (slot.maskTex && !this.gl.isContextLost()) this.gl.deleteTexture(slot.maskTex);
    slot.maskTex = null;
    if (!this.slots.size) { this.rest(); return; }
    this.place();
  }

  /** Paint where the first grouped panel paints: just before it (or the root's child holding it). */
  private place() {
    let first: HTMLElement | undefined;
    for (const { panel } of this.slots) {
      const anchor = this.anchor(panel);
      if (anchor && (!first || first.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_PRECEDING)) first = anchor;
    }
    if (first && this.canvas.nextElementSibling !== first) this.parent.insertBefore(this.canvas, first);
  }

  private measure = () => {
    this.canvasRect = this.canvas.isConnected ? this.canvas.getBoundingClientRect() : undefined;
    const layoutWidth = this.canvas.offsetWidth;
    this.canvasScale = this.canvasRect && layoutWidth > 0 && this.canvasRect.width > 0 ? this.canvasRect.width / layoutWidth : 1;
    for (const slot of [...this.slots]) {
      if (!this.anchor(slot.panel)) { slot.evict(); continue; }
      const rect = frameRect(slot.panel), width = slot.panel.offsetWidth, height = slot.panel.offsetHeight;
      // The engine renders at layout size and samples the scaled extent; the scene draws that scaled. Within a pixel
      // of the layout size the box is not transformed (offset sizes are rounded); beyond it, compare with the exact
      // layout size so rounding does not read as a change of aspect.
      const transformed = Math.abs(rect.width - width) >= 1 || Math.abs(rect.height - height) >= 1;
      const layout = transformed ? getComputedStyle(slot.panel) : undefined;
      const sx = layout ? rect.width / (parseFloat(layout.width) || width) : 1, sy = layout ? rect.height / (parseFloat(layout.height) || height) : 1;
      if (Math.abs(sx - sy) > ASPECT_TOLERANCE * Math.max(sx, sy)) { slot.evict(); continue; }
      slot.rect = rect; slot.sx = sx; slot.sy = sy;
    }
  };

  private frame = () => {
    const gl = this.gl;
    if (gl.isContextLost() || !this.canvasRect) return;
    // Panels capped by maxScale draw fewer pixels; when all are, the scene composites at the largest cap too.
    let cap = 0;
    for (const slot of this.slots) cap = Math.max(cap, slot.maxScale);
    const dpr = Math.min(devicePixelRatio || 1, MAX_DPR, cap || Infinity);
    const view = { left: -VIEWPORT_MARGIN * dpr, top: -VIEWPORT_MARGIN * dpr, right: (innerWidth + VIEWPORT_MARGIN) * dpr, bottom: (innerHeight + VIEWPORT_MARGIN) * dpr };
    const boxes: Array<{ slot: Slot; x: number; y: number; w: number; h: number }> = [];
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const slot of this.slots) {
      if (!slot.ready || !slot.tex || !slot.rect) continue;
      const scale = dpr / slot.dpr, sx = scale * slot.sx, sy = scale * slot.sy;
      const x = Math.round(slot.rect.left * dpr + slot.x * sx), y = Math.round(slot.rect.top * dpr + slot.y * sy);
      const w = Math.round(slot.w * sx), h = Math.round(slot.h * sy);
      if (x >= view.right || y >= view.bottom || x + w <= view.left || y + h <= view.top) continue;
      boxes.push({ slot, x, y, w, h });
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + w); bottom = Math.max(bottom, y + h);
    }
    if (!boxes.length) { if (this.drawn !== 'empty') { this.canvas.style.width = this.canvas.style.height = '0'; this.drawn = 'empty'; } return; }
    left = Math.max(left, Math.floor(view.left)); top = Math.max(top, Math.floor(view.top));
    right = Math.min(right, Math.ceil(view.right)); bottom = Math.min(bottom, Math.ceil(view.bottom));
    // Grow in steps and shrink only below half, so moving panels do not reallocate the canvas every frame.
    const fit = (current: number, needed: number) => current >= needed && current <= needed * 2 ? current : Math.ceil(needed / SIZE_STEP) * SIZE_STEP;
    const width = fit(this.canvas.width, right - left), height = fit(this.canvas.height, bottom - top);
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; this.drawn = ''; }
    // Move the canvas to the device-pixel-aligned viewport origin; its containing block does not matter.
    const k = this.canvasScale;
    this.left += (left / dpr - this.canvasRect.left) / k; this.top += (top / dpr - this.canvasRect.top) / k;
    const style = this.canvas.style, cssWidth = `${width / dpr / k}px`, cssHeight = `${height / dpr / k}px`;
    style.left = `${this.left}px`; style.top = `${this.top}px`;
    if (style.width !== cssWidth) style.width = cssWidth;
    if (style.height !== cssHeight) style.height = cssHeight;
    const key = `${left}:${top}:${width}:${height}|` + boxes.map(b => `${b.x}:${b.y}:${b.w}:${b.h}:${b.slot.frames}:${b.slot.rect!.width}:${b.slot.rect!.height}`).join('|');
    if (key === this.drawn) return;
    if (!this.program) {
      const program = gl.createProgram()!, compile = (type: number, text: string) => { const shader = gl.createShader(type)!; gl.shaderSource(shader, text); gl.compileShader(shader); gl.attachShader(program, shader); return shader; };
      const shaders = [compile(gl.VERTEX_SHADER, VS_QUAD), compile(gl.FRAGMENT_SHADER, BLIT)];
      gl.linkProgram(program); shaders.forEach(shader => gl.deleteShader(shader));
      this.program = program; this.position = gl.getAttribLocation(program, 'a_pos');
      this.uniforms = { lens: gl.getUniformLocation(program, 'u_lens'), mask: gl.getUniformLocation(program, 'u_mask'), maskRect: gl.getUniformLocation(program, 'u_maskRect'), masked: gl.getUniformLocation(program, 'u_masked'), reveal: gl.getUniformLocation(program, 'u_reveal'), feather: gl.getUniformLocation(program, 'u_feather') };
      this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program); gl.uniform1i(this.uniforms.lens, 0); gl.uniform1i(this.uniforms.mask, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(this.position); gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const box of boxes) {
      const slot = box.slot, rect = slot.rect!;
      gl.activeTexture(gl.TEXTURE1);
      if (slot.maskDirty) this.uploadMask(slot);
      gl.uniform1f(this.uniforms.masked, slot.maskTex ? 1 : 0); gl.uniform1f(this.uniforms.reveal, slot.reveal); gl.uniform1f(this.uniforms.feather, slot.feather);
      if (slot.maskTex) {
        gl.bindTexture(gl.TEXTURE_2D, slot.maskTex);
        const panelW = rect.width / slot.sx * slot.dpr, panelH = rect.height / slot.sy * slot.dpr;
        gl.uniform4f(this.uniforms.maskRect, slot.x / panelW, slot.y / panelH, slot.w / panelW, slot.h / panelH);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.viewport(box.x - left, height - (box.y - top) - box.h, box.w, box.h);
      gl.bindTexture(gl.TEXTURE_2D, slot.tex);
      const filter = box.w === box.slot.w && box.h === box.slot.h ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
    this.drawn = key;
  };

  /** With no panels left, clear, stop drawing and leave the page, but keep the context (and its compiled programs) a
   * while: panels leave as they scroll out of view, and scrolling back would otherwise rebuild the scene mid-scroll. */
  private rest() {
    this.stop(); this.stop = () => {};
    const gl = this.gl;
    if (!gl.isContextLost()) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    this.drawn = ''; this.canvas.remove();
    this.resting = setTimeout(() => { if (!this.slots.size) this.destroy(); }, SCENE_REST_MS);
  }

  private destroy() {
    clearTimeout(this.resting);
    this.stop(); this.order.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    if (!this.gl.isContextLost()) { if (this.program) this.gl.deleteProgram(this.program); if (this.quad) this.gl.deleteBuffer(this.quad); }
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 0; this.canvas.remove();
    this.done(this);
  }
}

const scenes = new WeakMap<HTMLElement, Scene[]>();

/** A per-panel engine drawing into the shared scene of its parent, or undefined when the panel is not eligible. */
export function joinSharedScene(panel: HTMLElement, holder: HTMLElement, source: HTMLElement, options: WebGLOptions,
  status: (status: WebGLStatus) => void, analytical: typeof installLiquidGLOptics, evict: () => void,
  root: HTMLElement | null = panel.parentElement): WebGLEngine | undefined {
  if (!root || sceneIneligibility(panel, source, root)) return undefined;
  const parent = root, zIndex = getComputedStyle(panel).zIndex;
  const list = scenes.get(parent) ?? [];
  let scene = list.find(s => s.source === source && s.zIndex === zIndex);
  if (!scene) {
    try { scene = new Scene(parent, source, zIndex, done => { const rest = (scenes.get(parent) ?? []).filter(s => s !== done); if (rest.length) scenes.set(parent, rest); else scenes.delete(parent); }); }
    catch { return undefined; }
    scenes.set(parent, [...list, scene]);
  }
  const slot = scene.add(panel, evict);
  try { return createWebGLEngine(panel, holder, source, options, status, analytical, false, slot); }
  catch { slot.release(); return undefined; }
}
