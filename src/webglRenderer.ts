/*
 * WebGL liquid-glass renderer (shared-context architecture).
 *
 * Works on every WebGL-capable browser (including iOS Safari and Firefox)
 * by snapshotting the page background into a texture and computing the
 * refraction (rounded-rect displacement + chromatic aberration + blur +
 * saturation + frost + specular rim) in a fragment shader.
 *
 * Architecture:
 *  - ONE offscreen WebGL context is shared by all lens instances, so any
 *    number of panes can coexist without hitting the browser's context cap.
 *  - ONE snapshot texture is shared per snapshot source (usually <body>);
 *    N panes = 1 html2canvas capture, not N.
 *  - Each pane gets its own lightweight 2D canvas, so per-pane positioning,
 *    z-index and border-radius behave exactly like any other DOM element.
 *  - html2canvas is auto-loaded from cdnjs when missing (opt out with
 *    `autoLoadSnapshotLib: false` or supply `getSnapshot`).
 *
 * The backdrop cannot be read live for security reasons; call
 * `instance.refresh()` after the page content behind the glass changes
 * (refreshes the shared snapshot for every lens of that source).
 */

export interface WebGLGlassOptions {
  /** The glass pane element (must be positioned; canvas is inserted inside it). */
  element: HTMLElement;
  /** Element to snapshot. Defaults to document.body. */
  snapshotSource?: HTMLElement;
  /** Element subtree to exclude from the snapshot (defaults to `element`). */
  exclude?: HTMLElement | null;
  /** Custom snapshot provider. Overrides html2canvas. */
  getSnapshot?: () => Promise<HTMLCanvasElement | HTMLImageElement>;
  /** Auto-load html2canvas from cdnjs when missing. Default true. */
  autoLoadSnapshotLib?: boolean;
  /** Displacement strength in CSS px at the very edge. */
  scale?: number;
  /** Corner radius in CSS px. */
  radius?: number;
  /** Gaussian-ish blur radius in px. */
  blur?: number;
  /** Saturation, 100 = normal. */
  saturation?: number;
  /** Chromatic aberration multiplier (0 = off). */
  aberration?: number;
  /** Width of the refracting edge band as a fraction of the shortest side (0-1). */
  edgeWidth?: number;
  /** Specular rim intensity (0-1). */
  specular?: number;
  /** Frost tint (0-1): mixes the refracted color toward white, like the CSS frost background. */
  frost?: number;
  /** Snapshot resolution multiplier. Clamped to the GPU's max texture size. */
  resolution?: number;
  /**
   * Automatically re-snapshot when the page content behind the glass changes
   * (debounced MutationObserver) and on window resize. Default true.
   */
  autoRefresh?: boolean;
}

type LensParams = Required<Pick<WebGLGlassOptions, 'scale' | 'radius' | 'blur' | 'saturation' | 'aberration' | 'edgeWidth' | 'specular' | 'frost'>>;

export interface WebGLGlassInstance {
  /** Re-snapshot the page and update the shared texture (affects all lenses of this source). */
  refresh: () => Promise<void>;
  /** Update displacement/appearance parameters on the fly. */
  update: (opts: Partial<Omit<LensParams, 'saturation'> & { saturation: number }>) => void;
  /** Tear down this lens. The shared context is released when the last lens is destroyed. */
  destroy: () => void;
}

/* ----------------------------- html2canvas loader ------------------------ */

const H2C_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
let h2cPromise: Promise<any> | null = null;

function loadHtml2Canvas(autoLoad: boolean): Promise<any | null> {
  const w = window as any;
  if (w.html2canvas) return Promise.resolve(w.html2canvas);
  if (!autoLoad) return Promise.resolve(null);
  if (!h2cPromise) {
    h2cPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = H2C_CDN;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(w.html2canvas || null);
      s.onerror = () => {
        h2cPromise = null;
        resolve(null);
      };
      document.head.appendChild(s);
    });
  }
  return h2cPromise;
}

/* --------------------------------- shaders ------------------------------- */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform sampler2D u_tex;
uniform vec2  u_texSize;   // snapshot size in snapshot px
uniform vec4  u_rect;      // pane rect in snapshot px (x, y, w, h), y-down
uniform float u_radius;    // snapshot px
uniform float u_scale;     // max displacement, snapshot px
uniform float u_blur;      // blur radius, snapshot px
uniform float u_saturation;// 1.0 = normal
uniform float u_aberration;
uniform float u_edge;      // edge band width, snapshot px
uniform float u_specular;  // 0-1
uniform float u_frost;     // 0-1

varying vec2 v_uv;

float sdRoundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 sampleTex(vec2 px) {
  // px is in y-down page/snapshot coordinates; the texture is uploaded
  // unflipped, so row 0 (image top) sits at v = 0. Direct mapping.
  vec2 uv = clamp(px / u_texSize, vec2(0.001), vec2(0.999));
  return texture2D(u_tex, uv).rgb;
}

vec3 blurSample(vec2 px, float b) {
  if (b < 0.5) return sampleTex(px);
  vec3 acc = vec3(0.0);
  acc += sampleTex(px) * 0.25;
  acc += sampleTex(px + vec2( b, 0.0)) * 0.125;
  acc += sampleTex(px + vec2(-b, 0.0)) * 0.125;
  acc += sampleTex(px + vec2(0.0,  b)) * 0.125;
  acc += sampleTex(px + vec2(0.0, -b)) * 0.125;
  acc += sampleTex(px + vec2( b,  b) * 0.7) * 0.0625;
  acc += sampleTex(px + vec2(-b,  b) * 0.7) * 0.0625;
  acc += sampleTex(px + vec2( b, -b) * 0.7) * 0.0625;
  acc += sampleTex(px + vec2(-b, -b) * 0.7) * 0.0625;
  return acc;
}

void main() {
  // y-down uv within the pane (v_uv.y = 1 is the top of the on-screen canvas)
  vec2 uvDown = vec2(v_uv.x, 1.0 - v_uv.y);

  vec2 halfSize = u_rect.zw * 0.5;
  vec2 local = (uvDown - 0.5) * u_rect.zw; // px, centered, y-down
  float d = sdRoundRect(local, halfSize, u_radius); // < 0 inside

  if (d > 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Edge factor: 0 in the flat center, 1 at the rim (lens profile).
  float t = clamp(1.0 + d / max(u_edge, 1.0), 0.0, 1.0);
  float fall = t * t * t; // cubic ease mimics the blurred displacement map

  vec2 dir = local / max(length(local), 1e-4);
  vec2 disp = -dir * fall * u_scale; // pull samples inward -> edge magnification

  vec2 base = u_rect.xy + uvDown * u_rect.zw;
  float ab = u_aberration * fall;

  vec3 col;
  col.r = blurSample(base + disp * (1.0 + ab), u_blur).r;
  col.g = blurSample(base + disp, u_blur).g;
  col.b = blurSample(base + disp * (1.0 - ab), u_blur).b;

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, u_saturation);

  // Frost tint (matches the CSS hsl(0 0% 100% / frost) glass background).
  col = mix(col, vec3(1.0), u_frost);

  // Specular rim: brighter where the rim faces the (top-left) light.
  float rim = smoothstep(0.55, 1.0, t);
  float facing = dot(dir, normalize(vec2(-0.6, -0.8))) * 0.5 + 0.5;
  col += rim * (0.10 + 0.25 * facing) * u_specular;

  // Anti-aliased rounded-rect edge; premultiplied alpha output.
  float aa = 1.0 - smoothstep(-1.5, 0.0, d);
  gl_FragColor = vec4(col * aa, aa);
}
`;

/* ----------------------------- shared renderer --------------------------- */

interface SnapshotEntry {
  texture: WebGLTexture;
  texW: number;
  texH: number;
  refCount: number;
  version: number;
  capturing: Promise<void> | null;
  observer: MutationObserver | null;
  timer: number | null;
  /** ignore mutation records until this timestamp (capture's own DOM cleanup) */
  settleUntil: number;
}

interface Lens {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  source: HTMLElement;
  exclude: HTMLElement | null;
  getSnapshot?: () => Promise<HTMLCanvasElement | HTMLImageElement>;
  resolution: number;
  autoRefresh: boolean;
  params: LensParams;
  lastKey: string;
  seenVersion: number;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`[LiquidGlass:webgl] shader compile failed: ${info}`);
  }
  return sh;
}

class SharedRenderer {
  private static instance: SharedRenderer | null = null;

  static get(): SharedRenderer | null {
    if (!SharedRenderer.instance) {
      try {
        SharedRenderer.instance = new SharedRenderer();
      } catch {
        return null;
      }
    }
    return SharedRenderer.instance;
  }

  readonly gl: WebGLRenderingContext;
  readonly maxTex: number;
  private glCanvas: HTMLCanvasElement;
  private lenses = new Set<Lens>();
  private snapshots = new Map<HTMLElement, SnapshotEntry>();
  private raf = 0;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  private constructor() {
    this.glCanvas = document.createElement('canvas');
    const gl =
      (this.glCanvas.getContext('webgl', { premultipliedAlpha: true, alpha: true }) as WebGLRenderingContext | null) ||
      (this.glCanvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`[LiquidGlass:webgl] program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied alpha

    for (const name of ['u_texSize', 'u_rect', 'u_radius', 'u_scale', 'u_blur', 'u_saturation', 'u_aberration', 'u_edge', 'u_specular', 'u_frost']) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
  }

  /* ------------------------------ snapshots ------------------------------ */

  private async capture(lens: Lens, entry: SnapshotEntry): Promise<void> {
    let img: HTMLCanvasElement | HTMLImageElement | null = null;
    try {
      if (lens.getSnapshot) {
        img = await lens.getSnapshot();
      } else {
        const h2c = await loadHtml2Canvas(true);
        if (h2c) {
          const srcW = Math.max(1, lens.source.scrollWidth);
          const srcH = Math.max(1, lens.source.scrollHeight);
          const scale = Math.max(0.25, Math.min(lens.resolution, this.maxTex / srcW, this.maxTex / srcH));
          img = await h2c(lens.source, {
            scale,
            useCORS: true,
            logging: false,
            backgroundColor: null,
            ignoreElements: (el: Element) => {
              if (!(el instanceof HTMLElement)) return false;
              if (el.dataset.liquidIgnore !== undefined) return true;
              if (el.classList.contains('liquid-glass-webgl-canvas')) return true;
              // exclude every registered lens pane, not just this one
              for (const l of this.lenses) {
                const ex = l.exclude;
                if (ex && (el === ex || ex.contains(el))) return true;
              }
              return false;
            }
          });
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[LiquidGlass:webgl] snapshot failed', e);
    }
    if (!img) return;

    const gl = this.gl;
    entry.texW = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    entry.texH = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    // NOTE: no UNPACK_FLIP_Y — the shader works in y-down page coordinates,
    // which matches the image's natural row order (row 0 = top).
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    entry.version++;
  }

  private snapshotFor(lens: Lens): SnapshotEntry {
    let entry = this.snapshots.get(lens.source);
    if (!entry) {
      entry = {
        texture: this.gl.createTexture()!,
        texW: 0,
        texH: 0,
        refCount: 0,
        version: 0,
        capturing: null,
        observer: null,
        timer: null,
        settleUntil: 0
      };
      this.snapshots.set(lens.source, entry);
    }
    return entry;
  }

  refreshSnapshot(lens: Lens): Promise<void> {
    const entry = this.snapshotFor(lens);
    if (!entry.capturing) {
      entry.capturing = this.capture(lens, entry).finally(() => {
        entry!.capturing = null;
        // html2canvas removes its temporary clone iframe right after capture;
        // those mutation records can arrive after `capturing` clears, so keep
        // ignoring DOM noise for a short settle window.
        entry!.settleUntil = performance.now() + 200;
      });
    }
    return entry.capturing;
  }

  /* --------------------------- auto refresh ------------------------------ */

  /** True when DOM changes at/inside this node must not trigger a re-snapshot. */
  private isOwnedNode(node: Node | null): boolean {
    let el: HTMLElement | null =
      node instanceof HTMLElement ? node : node?.parentElement ?? null;
    while (el) {
      if (el.dataset && el.dataset.liquidIgnore !== undefined) return true;
      if (el.classList) {
        if (el.classList.contains('liquid-glass-webgl-canvas')) return true;
        if (el.classList.contains('html2canvas-container')) return true;
      }
      if (el.tagName === 'IFRAME') return true; // html2canvas clone target
      for (const l of this.lenses) {
        if (l.exclude && el === l.exclude) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  private scheduleRefresh(source: HTMLElement, delay: number): void {
    const entry = this.snapshots.get(source);
    if (!entry) return;
    if (entry.timer !== null) window.clearTimeout(entry.timer);
    entry.timer = window.setTimeout(() => {
      entry.timer = null;
      const lens = Array.from(this.lenses).find((l) => l.source === source && l.autoRefresh);
      if (lens) this.refreshSnapshot(lens);
    }, delay);
  }

  private onWindowResize = (): void => {
    for (const source of Array.from(this.snapshots.keys())) {
      this.scheduleRefresh(source, 500);
    }
  };

  private observeSource(lens: Lens, entry: SnapshotEntry): void {
    if (entry.observer || typeof MutationObserver === 'undefined') return;
    const source = lens.source;
    const observer = new MutationObserver((records) => {
      if (entry.capturing || performance.now() < entry.settleUntil) return;
      for (const r of records) {
        const nodes: Node[] = [r.target];
        r.addedNodes.forEach((n) => nodes.push(n));
        r.removedNodes.forEach((n) => nodes.push(n));
        if (nodes.some((n) => !this.isOwnedNode(n))) {
          this.scheduleRefresh(source, 250);
          return;
        }
      }
    });
    observer.observe(source, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
    entry.observer = observer;
  }

  /* -------------------------------- lenses ------------------------------- */

  async addLens(lens: Lens): Promise<boolean> {
    const entry = this.snapshotFor(lens);
    entry.refCount++;
    if (entry.version === 0) {
      await this.refreshSnapshot(lens);
      if (entry.version === 0) {
        // snapshot impossible (no html2canvas, no getSnapshot)
        entry.refCount--;
        if (entry.refCount <= 0) {
          this.gl.deleteTexture(entry.texture);
          this.snapshots.delete(lens.source);
        }
        return false;
      }
    }
    this.lenses.add(lens);
    lens.element.appendChild(lens.canvas);
    if (lens.autoRefresh) {
      this.observeSource(lens, entry);
      if (this.lenses.size === 1) window.addEventListener('resize', this.onWindowResize);
    }
    if (!this.raf) this.loop();
    return true;
  }

  removeLens(lens: Lens): void {
    if (!this.lenses.has(lens)) return;
    this.lenses.delete(lens);
    lens.canvas.remove();
    const entry = this.snapshots.get(lens.source);
    if (entry) {
      entry.refCount--;
      if (entry.refCount <= 0) {
        entry.observer?.disconnect();
        if (entry.timer !== null) window.clearTimeout(entry.timer);
        this.gl.deleteTexture(entry.texture);
        this.snapshots.delete(lens.source);
      }
    }
    if (this.lenses.size === 0) {
      window.removeEventListener('resize', this.onWindowResize);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  /* ------------------------------ render loop ---------------------------- */

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    for (const lens of this.lenses) this.renderLens(lens);
  };

  private renderLens(lens: Lens): void {
    const entry = this.snapshots.get(lens.source);
    if (!entry || entry.version === 0) return;

    const rect = lens.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const srcRect = lens.source.getBoundingClientRect();
    const sx = entry.texW / Math.max(1, srcRect.width);
    const sy = entry.texH / Math.max(1, srcRect.height);
    // pane position relative to the snapshot source, in snapshot px (y-down)
    const x = (rect.left - srcRect.left) * sx;
    const y = (rect.top - srcRect.top) * sy;
    const w = rect.width * sx;
    const h = rect.height * sy;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(rect.width * dpr));
    const ch = Math.max(1, Math.round(rect.height * dpr));
    let resized = false;
    if (lens.canvas.width !== cw || lens.canvas.height !== ch) {
      lens.canvas.width = cw;
      lens.canvas.height = ch;
      resized = true;
    }

    const key = [x, y, w, h, cw, ch, JSON.stringify(lens.params)].join('|');
    if (key === lens.lastKey && !resized && lens.seenVersion === entry.version) return;
    lens.lastKey = key;
    lens.seenVersion = entry.version;

    const gl = this.gl;
    // grow-only shared buffer; render this lens at the bottom-left corner
    if (this.glCanvas.width < cw) this.glCanvas.width = Math.min(cw, this.maxTex);
    if (this.glCanvas.height < ch) this.glCanvas.height = Math.min(ch, this.maxTex);
    gl.viewport(0, 0, cw, ch);

    const u = this.uniforms;
    const px = sx; // CSS px -> snapshot px
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.uniform2f(u.u_texSize, entry.texW, entry.texH);
    gl.uniform4f(u.u_rect, x, y, w, h);
    gl.uniform1f(u.u_radius, Math.min(lens.params.radius, rect.width / 2, rect.height / 2) * px);
    gl.uniform1f(u.u_scale, lens.params.scale * px);
    gl.uniform1f(u.u_blur, lens.params.blur * px);
    gl.uniform1f(u.u_saturation, lens.params.saturation);
    gl.uniform1f(u.u_aberration, lens.params.aberration);
    gl.uniform1f(u.u_edge, Math.min(rect.width, rect.height) * lens.params.edgeWidth * px);
    gl.uniform1f(u.u_specular, lens.params.specular);
    gl.uniform1f(u.u_frost, lens.params.frost);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // blit the rendered lens into its own 2D canvas (GL origin = bottom-left)
    lens.ctx.clearRect(0, 0, cw, ch);
    lens.ctx.drawImage(this.glCanvas, 0, this.glCanvas.height - ch, cw, ch, 0, 0, cw, ch);
  }
}

/* --------------------------------- public -------------------------------- */

export async function createWebGLGlass(options: WebGLGlassOptions): Promise<WebGLGlassInstance | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const renderer = SharedRenderer.get();
  if (!renderer) return null;

  // Eagerly kick off the loader so the first snapshot doesn't wait on the CDN.
  if (!options.getSnapshot) {
    const h2c = await loadHtml2Canvas(options.autoLoadSnapshotLib !== false);
    if (!h2c) {
      // eslint-disable-next-line no-console
      console.warn(
        '[LiquidGlass:webgl] html2canvas unavailable (window.html2canvas / CDN load failed) and no `getSnapshot` provided. Falling back to CSS.'
      );
      return null;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'liquid-glass-webgl-canvas';
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const lens: Lens = {
    element: options.element,
    canvas,
    ctx,
    source: options.snapshotSource ?? document.body,
    exclude: options.exclude === undefined ? options.element : options.exclude,
    getSnapshot: options.getSnapshot,
    resolution: options.resolution ?? Math.min(window.devicePixelRatio || 1, 2),
    autoRefresh: options.autoRefresh !== false,
    params: {
      scale: options.scale ?? 24,
      radius: options.radius ?? 50,
      blur: options.blur ?? 2,
      saturation: (options.saturation ?? 140) / 100,
      aberration: options.aberration ?? 0.3,
      edgeWidth: options.edgeWidth ?? 0.18,
      specular: options.specular ?? 1,
      frost: options.frost ?? 0.1
    },
    lastKey: '',
    seenVersion: -1
  };

  const ok = await renderer.addLens(lens);
  if (!ok) return null;

  let destroyed = false;
  return {
    refresh: async () => {
      if (destroyed) return;
      await renderer.refreshSnapshot(lens);
    },
    update: (next) => {
      if (destroyed) return;
      lens.params = {
        ...lens.params,
        ...(next.scale !== undefined ? { scale: next.scale } : null),
        ...(next.radius !== undefined ? { radius: next.radius } : null),
        ...(next.blur !== undefined ? { blur: next.blur } : null),
        ...(next.saturation !== undefined ? { saturation: next.saturation / 100 } : null),
        ...(next.aberration !== undefined ? { aberration: next.aberration } : null),
        ...(next.edgeWidth !== undefined ? { edgeWidth: next.edgeWidth } : null),
        ...(next.specular !== undefined ? { specular: next.specular } : null),
        ...(next.frost !== undefined ? { frost: next.frost } : null)
      };
      lens.lastKey = '';
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      renderer.removeLens(lens);
    }
  };
}
