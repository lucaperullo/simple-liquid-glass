import { VS_QUAD } from '../../vendor/ybouane/shaders';
import { subscribeFrame } from './contextPool';
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
 */

const MAX_DPR = 3, VIEWPORT_MARGIN = 64, SIZE_STEP = 256;
const BLIT = `precision highp float;varying vec2 v_uv;uniform sampler2D u_lens;void main(){vec4 c=texture2D(u_lens,v_uv);gl_FragColor=vec4(c.rgb*c.a,c.a);}`;

const transparent = (color: string) => color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);
const translationOnly = (transform: string) => transform === 'none' || /^matrix\(1, 0, 0, 1, [^,]+, [^,]+\)$/.test(transform);

/** Why a panel keeps its own canvas instead of joining a shared scene; undefined when it can join. */
export function sceneIneligibility(panel: HTMLElement, source: HTMLElement): string | undefined {
  const parent = panel.parentElement;
  if (!parent) return 'detached';
  if (source === parent || source.contains(parent)) return 'inside-backdrop';
  const style = getComputedStyle(panel);
  if (style.position === 'static') return 'static';
  // The component itself hides the panel while its renderer starts (reveal="ready").
  if (Number(style.opacity) !== 1 && panel.dataset.glassReason !== 'initializing') return 'opacity';
  if (style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.clipPath !== 'none' || (style.maskImage || 'none') !== 'none') return 'compositing';
  if (!translationOnly(style.transform)) return 'transform';
  if (style.backgroundImage !== 'none' || !transparent(style.backgroundColor)) return 'background';
  if (style.zIndex !== 'auto' && Number(style.zIndex) < 0) return 'z-index';
  return undefined;
}

interface Slot extends SceneSlot {
  panel: HTMLElement;
  tex: WebGLTexture | null; fbo: WebGLFramebuffer | null;
  w: number; h: number; x: number; y: number; dpr: number;
  ready: boolean; frames: number; rect?: DOMRect; evict: () => void;
}

class Scene {
  readonly canvas = document.createElement('canvas');
  readonly gl: WebGLRenderingContext;
  readonly slots = new Set<Slot>();
  private program: WebGLProgram | null = null;
  private quad: WebGLBuffer | null = null;
  private position = 0;
  private texture: WebGLUniformLocation | null = null;
  private stop: () => void = () => {};
  private canvasRect?: DOMRect;
  private left = 0; private top = 0; private drawn = '';

  constructor(readonly parent: HTMLElement, readonly source: HTMLElement, readonly zIndex: string, private readonly done: (scene: Scene) => void) {
    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('LiquidGlass: WebGL unavailable');
    this.gl = gl;
    this.canvas.width = this.canvas.height = 1;
    this.canvas.style.cssText = `display:block;position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:${zIndex}`;
    this.canvas.dataset.liquidGlassScene = ''; this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.addEventListener('webglcontextlost', this.lost);
    this.canvas.addEventListener('webglcontextrestored', this.restored);
  }

  private lost = (event: Event) => { event.preventDefault(); };
  private restored = () => { this.program = null; this.quad = null; for (const slot of this.slots) { slot.tex = slot.fbo = null; slot.ready = false; } this.drawn = ''; };

  add(panel: HTMLElement, evict: () => void): Slot {
    const gl = this.gl, scene = this;
    const slot: Slot = {
      canvas: this.canvas, panel, evict, tex: null, fbo: null, w: 0, h: 0, x: 0, y: 0, dpr: 1, ready: false, frames: 0,
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

  private remove(slot: Slot) {
    if (!this.slots.delete(slot)) return;
    this.free(slot); this.drawn = '';
    if (!this.slots.size) { this.destroy(); return; }
    this.place();
  }

  /** Paint where the first grouped panel paints: just before it in the parent. */
  private place() {
    let first: HTMLElement | undefined;
    for (const { panel } of this.slots) if (panel.parentElement === this.parent && (!first || first.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING)) first = panel;
    if (first && this.canvas.nextElementSibling !== first) this.parent.insertBefore(this.canvas, first);
  }

  private measure = () => {
    this.canvasRect = this.canvas.isConnected ? this.canvas.getBoundingClientRect() : undefined;
    for (const slot of [...this.slots]) {
      if (slot.panel.parentElement !== this.parent) { slot.evict(); continue; }
      const rect = slot.panel.getBoundingClientRect();
      // Scaled ancestors change the panel's rendered size; its own canvas follows that, a shared one cannot.
      if (Math.abs(rect.width - slot.panel.offsetWidth) > .5 || Math.abs(rect.height - slot.panel.offsetHeight) > .5) { slot.evict(); continue; }
      slot.rect = rect;
    }
  };

  private frame = () => {
    const gl = this.gl;
    if (gl.isContextLost() || !this.canvasRect) return;
    this.place(); // keyed re-renders can move panels
    const dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
    const view = { left: -VIEWPORT_MARGIN * dpr, top: -VIEWPORT_MARGIN * dpr, right: (innerWidth + VIEWPORT_MARGIN) * dpr, bottom: (innerHeight + VIEWPORT_MARGIN) * dpr };
    const boxes: Array<{ slot: Slot; x: number; y: number; w: number; h: number }> = [];
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const slot of this.slots) {
      if (!slot.ready || !slot.tex || !slot.rect) continue;
      const scale = dpr / slot.dpr;
      const x = Math.round(slot.rect.left * dpr + slot.x * scale), y = Math.round(slot.rect.top * dpr + slot.y * scale);
      const w = Math.round(slot.w * scale), h = Math.round(slot.h * scale);
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
    this.left += left / dpr - this.canvasRect.left; this.top += top / dpr - this.canvasRect.top;
    const style = this.canvas.style, cssWidth = `${width / dpr}px`, cssHeight = `${height / dpr}px`;
    style.left = `${this.left}px`; style.top = `${this.top}px`;
    if (style.width !== cssWidth) style.width = cssWidth;
    if (style.height !== cssHeight) style.height = cssHeight;
    const key = `${left}:${top}:${width}:${height}|` + boxes.map(b => `${b.x}:${b.y}:${b.w}:${b.h}:${b.slot.frames}`).join('|');
    if (key === this.drawn) return;
    if (!this.program) {
      const program = gl.createProgram()!, compile = (type: number, text: string) => { const shader = gl.createShader(type)!; gl.shaderSource(shader, text); gl.compileShader(shader); gl.attachShader(program, shader); return shader; };
      const shaders = [compile(gl.VERTEX_SHADER, VS_QUAD), compile(gl.FRAGMENT_SHADER, BLIT)];
      gl.linkProgram(program); shaders.forEach(shader => gl.deleteShader(shader));
      this.program = program; this.position = gl.getAttribLocation(program, 'a_pos'); this.texture = gl.getUniformLocation(program, 'u_lens');
      this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.texture, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(this.position); gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const box of boxes) {
      gl.viewport(box.x - left, height - (box.y - top) - box.h, box.w, box.h);
      gl.bindTexture(gl.TEXTURE_2D, box.slot.tex);
      const filter = box.w === box.slot.w && box.h === box.slot.h ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
    this.drawn = key;
  };

  private destroy() {
    this.stop();
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
  status: (status: WebGLStatus) => void, analytical: typeof installLiquidGLOptics, evict: () => void): WebGLEngine | undefined {
  if (sceneIneligibility(panel, source)) return undefined;
  const parent = panel.parentElement!, zIndex = getComputedStyle(panel).zIndex;
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
