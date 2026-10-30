// Adapted from @ybouane/liquidglass 1.0.3 (MIT); see THIRD_PARTY_NOTICES.md.
/**
 * GlassRenderer — WebGL rendering pipeline for the liquid glass effect.
 *
 * Manages a single offscreen WebGL canvas, shader programs, and a pool
 * of local-sized FBOs for blur passes. Each panel render crops just the
 * padded region behind that panel, uploads only that region, and shades
 * the glass effect into the matching per-element canvas.
 */

import { VS_QUAD, FS_BLIT, FS_BLUR } from './shaders';
import { BLUR_ITERATIONS, SHADOW_PAD } from './defaults';
import type { GlassConfig } from './defaults';
export type SurfaceConfig = Pick<GlassConfig,'cornerRadius'|'opacity'>;

interface FBO {
	fbo: WebGLFramebuffer;
	tex: WebGLTexture;
	w: number;
	h: number;
}

interface FBOSet {
	bg: FBO;
	blurA: FBO;
	blurB: FBO;
}

type UniformMap = Record<string, WebGLUniformLocation | null>;

// Panels on one context (a shared scene, the shared offscreen canvas) link identical shaders: share one program
// per context so many panels neither compile hundreds of copies nor switch programs between draws.
const programs = new WeakMap<WebGLRenderingContext, Map<string, { program: WebGLProgram; users: number }>>();
const programKeys = new WeakMap<WebGLProgram, string>();
// Last values per shared program: panels drawing in turn skip uniforms that did not change between them.
const uniformValues = new WeakMap<WebGLProgram, Map<string, number[]>>();

/** Release a program obtained from GlassRenderer._link; it is deleted when its last user releases it. */
export function releaseProgram(gl: WebGLRenderingContext, program: WebGLProgram | null): void {
	const key = program && programKeys.get(program), cache = programs.get(gl), entry = key ? cache?.get(key) : undefined;
	if (!entry || entry.program !== program) { if (program && !key && !gl.isContextLost()) gl.deleteProgram(program); return; }
	if (--entry.users) return;
	cache!.delete(key!);
	if (!gl.isContextLost()) gl.deleteProgram(program!);
}

export class GlassRenderer {
	readonly canvas: HTMLCanvasElement | OffscreenCanvas;
	readonly gl: WebGLRenderingContext;
	readonly cropCanvas: HTMLCanvasElement;
	readonly cropCtx: CanvasRenderingContext2D;

	blitP!: WebGLProgram;
	blitU!: UniformMap;
	blurP!: WebGLProgram;
	blurU!: UniformMap;
	glassP: WebGLProgram | null = null;
	glassU!: UniformMap;

	quadBuf!: WebGLBuffer;
	panelBuf!: WebGLBuffer;

	readonly fboCache = new Map<string, FBOSet>();
	activeFBOs: FBOSet | null = null;

	bgTex: WebGLTexture | null = null;

	width = 0;
	height = 0;

	contextLost = false;
	blurActive = false;
	/** Shared scenes draw each panel into a framebuffer of their context instead of the canvas. */
	target: WebGLFramebuffer | null = null;
	/** Unblurred cached backgrounds are sampled in place from the shared snapshot (region: x, y, w, h in its UV
	 *  space) instead of being copied into the panel's background framebuffer first. */
	direct: { texture: WebGLTexture; region: [number, number, number, number] } | null = null;

	_onContextLost: (e: Event) => void;
	_onContextRestored: () => void;

	readonly sharedCanvas: boolean;

	constructor(sharedCanvas?: HTMLCanvasElement | OffscreenCanvas) {
		this.sharedCanvas = !!sharedCanvas;
		this.canvas = sharedCanvas ?? document.createElement('canvas');
		if(!sharedCanvas&&'style' in this.canvas)this.canvas.style.display = 'none';

		this.cropCanvas = document.createElement('canvas');
		this.cropCtx = this.cropCanvas.getContext('2d')!;

		const gl = this.canvas.getContext('webgl', {
			alpha: true,
			premultipliedAlpha: false,
			antialias: false,
			preserveDrawingBuffer: true,
		}) as WebGLRenderingContext|null;

		if (!gl) {
			throw new Error('LiquidGlass: WebGL is not supported in this browser.');
		}
		this.gl = gl;

		this._onContextLost = (e: Event) => {
			e.preventDefault();
			this.contextLost = true;
			programs.delete(gl);
			console.warn('LiquidGlass: WebGL context lost.');
		};
		this._onContextRestored = () => {
			console.info('LiquidGlass: WebGL context restored — reinitialising.');
			this.contextLost = false;
			this._initPrograms();
			this._initBuffers();
			for (const fboSet of this.fboCache.values()) {
				this._freeFBOSet(fboSet);
			}
			this.fboCache.clear();
			this.activeFBOs = null;
			this.bgTex = null;
		};
		try { this._initPrograms(); this._initBuffers(); } catch (error) { this.destroy(); throw error; }
		this.canvas.addEventListener('webglcontextlost', this._onContextLost);
		this.canvas.addEventListener('webglcontextrestored', this._onContextRestored);
	}

	// ────────────────────────────────────────────
	// Initialisation
	// ────────────────────────────────────────────

	_initPrograms(): void {
		this.blitP = this._link(VS_QUAD, FS_BLIT);
		this.blitU = this._uloc(this.blitP, ['u_tex', 'u_scale', 'u_offset']);

		this.blurP = this._link(VS_QUAD, FS_BLUR);
		this.blurU = this._uloc(this.blurP, ['u_tex', 'u_dir']);

		this.glassP = null;
		const names = ['u_blurTex','u_center','u_size','u_res','u_pad','u_radius','u_alpha','u_region'];
		this.glassU = names.reduce((locations,name)=>{locations[name]=null;return locations;},{} as UniformMap);
	}

	_initBuffers(): void {
		const gl = this.gl;

		this.quadBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

		this.panelBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.panelBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, -.5, .5, .5, .5]), gl.STATIC_DRAW);
	}

	// ────────────────────────────────────────────
	// Resize
	// ────────────────────────────────────────────


	// ────────────────────────────────────────────
	// Background upload
	// ────────────────────────────────────────────

	uploadAndBlur(
		sourceCanvas: HTMLCanvasElement,
		sourceX: number,
		sourceY: number,
		width: number,
		height: number,
		blurAmount: number,
	): void {
		if (this.contextLost) return;
		this.direct = null;
		const gl = this.gl;
		if (!this._setActiveSize(width, height)) return;
		const W = this.width;
		const H = this.height;
		const fboSet = this.activeFBOs!;

		// The runtime already supplies a panel-sized crop. Upload it directly instead
		// of copying the same pixels through another canvas for every glass layer.
		let uploadSource = sourceCanvas;
		if (sourceX !== 0 || sourceY !== 0 || sourceCanvas.width !== W || sourceCanvas.height !== H) {
			if (this.cropCanvas.width !== W || this.cropCanvas.height !== H) {
				this.cropCanvas.width = W;
				this.cropCanvas.height = H;
			}
			this.cropCtx.clearRect(0, 0, W, H);
			this.cropCtx.drawImage(sourceCanvas, -sourceX, -sourceY);
			uploadSource = this.cropCanvas;
		}

		if (!this.bgTex) {
			this.bgTex = gl.createTexture();
		}
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true as unknown as number);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uploadSource);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false as unknown as number);

		// Blit source → bgFBO (local padded region)
		gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.bg.fbo);
		gl.viewport(0, 0, W, H);
		gl.useProgram(this.blitP);
		gl.activeTexture(gl.TEXTURE0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
		gl.uniform1i(this.blitU.u_tex, 0);
		gl.uniform2f(this.blitU.u_scale, 1, 1);
		gl.uniform2f(this.blitU.u_offset, 0, 0);
		this._drawQuad(this.blitP, this.quadBuf);

		this.blurActive = blurAmount > 0;
		if (!this.blurActive) return;

		// Copy bgFBO → blurA (u_scale/u_offset are already (1,1)/(0,0))
		const bw = fboSet.blurA.w;
		const bh = fboSet.blurA.h;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.blurA.fbo);
		gl.viewport(0, 0, bw, bh);
		gl.bindTexture(gl.TEXTURE_2D, fboSet.bg.tex);
		this._drawQuad(this.blitP, this.quadBuf);

		// Multi-pass Gaussian blur (skip entirely when not needed)
		if (blurAmount > 0) {
			const spread = blurAmount * 2.5;
			gl.useProgram(this.blurP);
			gl.uniform1i(this.blurU.u_tex, 0);
			for (let i = 0; i < BLUR_ITERATIONS; i++) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.blurB.fbo);
				gl.viewport(0, 0, bw, bh);
				gl.bindTexture(gl.TEXTURE_2D, fboSet.blurA.tex);
				gl.uniform2f(this.blurU.u_dir, spread / bw, 0);
				this._drawQuad(this.blurP, this.quadBuf);

				gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.blurA.fbo);
				gl.bindTexture(gl.TEXTURE_2D, fboSet.blurB.tex);
				gl.uniform2f(this.blurU.u_dir, 0, spread / bh);
				this._drawQuad(this.blurP, this.quadBuf);
			}
		}
	}

	// ────────────────────────────────────────────
	// Glass panel rendering
	// ────────────────────────────────────────────

	renderGlassPanel(
		config: SurfaceConfig,
		width: number,
		height: number,
		dpr: number,
	): void {
		if (this.contextLost || !this.glassP) return;
		const gl = this.gl;
		const W = this.width;
		const H = this.height;
		const fboSet = this.activeFBOs!;

		// The shader writes straight RGBA into a cleared destination. Blending would square alpha.
		gl.disable(gl.BLEND);
		gl.useProgram(this.glassP);

		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.direct ? this.direct.texture : this.blurActive ? fboSet.blurA.tex : fboSet.bg.tex);
		const p = this.glassP, u = this.glassU;
		this._uniform(p, 'u_blurTex', u.u_blurTex, [1], true);
		this._uniform(p, 'u_region', u.u_region, this.direct?.region ?? [0, 0, 1, 1]);

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
		gl.viewport(0, this.target ? 0 : this.canvas.height - H, W, H);
		this._uniform(p, 'u_res', u.u_res, [W, H]);

		this._uniform(p, 'u_center', u.u_center, [W * 0.5, H * 0.5]);
		this._uniform(p, 'u_size', u.u_size, [width * dpr, height * dpr]);
		this._uniform(p, 'u_radius', u.u_radius, [config.cornerRadius * dpr]);
		this._uniform(p, 'u_pad', u.u_pad, [SHADOW_PAD * dpr]);
		this._uniform(p, 'u_alpha', u.u_alpha, [config.opacity]);


		this._drawQuad(this.glassP, this.panelBuf);
		gl.disable(gl.BLEND);
	}

	clear(): void {
		const gl = this.gl, y = this.target ? 0 : this.canvas.height - this.height;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
		gl.viewport(0, y, this.width, this.height);
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(0, y, this.width, this.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.disable(gl.SCISSOR_TEST);
	}

	destroy(): void {
		this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
		if (!this.contextLost) {
			const gl = this.gl;
			for (const fboSet of this.fboCache.values()) {
				this._freeFBOSet(fboSet);
			}
			this.fboCache.clear();
			if (this.bgTex) gl.deleteTexture(this.bgTex);
			if(this.quadBuf)gl.deleteBuffer(this.quadBuf);
			if(this.panelBuf)gl.deleteBuffer(this.panelBuf);
			releaseProgram(gl, this.blitP);
			releaseProgram(gl, this.blurP);
			releaseProgram(gl, this.glassP);
		}
		// A shared canvas belongs to its pool or scene.
		if(!this.sharedCanvas&&'remove' in this.canvas)this.canvas.remove();
	}

	// ────────────────────────────────────────────
	// FBO management
	// ────────────────────────────────────────────

	_setActiveSize(w: number, h: number): boolean {
		if (w <= 0 || h <= 0) return false;

		this.width = w;
		this.height = h;

		if (!this.target && (this.canvas.width !== w || this.canvas.height !== h)) {
			this.canvas.width = w;
			this.canvas.height = h;
		}

		const key = `${w}x${h}`;
		let fboSet = this.fboCache.get(key);
		if (!fboSet) {
			// Direct output only needs the current size; bound allocations during resize.
			for (const old of this.fboCache.values()) this._freeFBOSet(old);
			this.fboCache.clear();
			fboSet = {
				bg: this._makeFBO(w, h),
				blurA: this._makeFBO(Math.ceil(w / 2), Math.ceil(h / 2)),
				blurB: this._makeFBO(Math.ceil(w / 2), Math.ceil(h / 2)),
			};
			this.fboCache.set(key, fboSet);
		}
		this.activeFBOs = fboSet;
		return true;
	}

	_makeFBO(w: number, h: number): FBO {
		const gl = this.gl;
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		const fbo = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return { fbo, tex, w, h };
	}

	_freeFBO(fboObj: FBO | null): void {
		if (!fboObj) return;
		const gl = this.gl;
		gl.deleteFramebuffer(fboObj.fbo);
		gl.deleteTexture(fboObj.tex);
	}

	_freeFBOSet(fboSet: FBOSet): void {
		this._freeFBO(fboSet.bg);
		this._freeFBO(fboSet.blurA);
		this._freeFBO(fboSet.blurB);
	}

	// ────────────────────────────────────────────
	// Shader helpers
	// ────────────────────────────────────────────

	_compile(src: string, type: number): WebGLShader | null {
		const gl = this.gl;
		const s = gl.createShader(type)!;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
			const message = gl.getShaderInfoLog(s);
			gl.deleteShader(s);
			throw new Error(`LiquidGlass shader compile error: ${message}`);
		}
		return s;
	}

	_link(vsSrc: string, fsSrc: string): WebGLProgram {
		const gl=this.gl,key=`${vsSrc}\0${fsSrc}`;
		let cache=programs.get(gl);if(!cache){cache=new Map();programs.set(gl,cache);}
		const hit=cache.get(key);if(hit){hit.users++;return hit.program;}
		const p=this._compileProgram(vsSrc,fsSrc);
		cache.set(key,{program:p,users:1});programKeys.set(p,key);
		return p;
	}

	_compileProgram(vsSrc: string, fsSrc: string): WebGLProgram {
		const gl=this.gl,p=gl.createProgram();
		if(!p)throw new Error('LiquidGlass: program allocation failed');
		let vs:WebGLShader|null=null,fs:WebGLShader|null=null;
		try{
			vs=this._compile(vsSrc,gl.VERTEX_SHADER);fs=this._compile(fsSrc,gl.FRAGMENT_SHADER);
			gl.attachShader(p,vs!);gl.attachShader(p,fs!);gl.linkProgram(p);
			if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(`LiquidGlass program link error: ${gl.getProgramInfoLog(p)}`);
			return p;
		}catch(error){gl.deleteProgram(p);throw error}
		finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs)}
	}

	/** Set a uniform of a shared program unless it already holds these values (floats, or ints for samplers). */
	_uniform(prog: WebGLProgram, name: string, location: WebGLUniformLocation | null, values: number[], int = false): void {
		if (!location) return;
		let last = uniformValues.get(prog);
		if (!last) { last = new Map(); uniformValues.set(prog, last); }
		const previous = last.get(name);
		if (previous && previous.length === values.length && previous.every((v, i) => v === values[i])) return;
		last.set(name, values);
		const gl = this.gl;
		if (int) gl.uniform1i(location, values[0]);
		else if (values.length === 1) gl.uniform1f(location, values[0]);
		else if (values.length === 2) gl.uniform2f(location, values[0], values[1]);
		else gl.uniform4f(location, values[0], values[1], values[2], values[3]);
	}

	_uloc(prog: WebGLProgram, names: string[]): UniformMap {
		const gl = this.gl;
		const u: UniformMap = {};
		for (const n of names) {
			u[n] = gl.getUniformLocation(prog, n);
		}
		return u;
	}

	private _quadLocations = new WeakMap<WebGLProgram, number>();

	_drawQuad(prog: WebGLProgram, buf: WebGLBuffer): void {
		const gl = this.gl;
		// Attribute locations are fixed at link time; querying them every draw stalls the shared context.
		let loc = this._quadLocations.get(prog);
		if (loc === undefined) { loc = gl.getAttribLocation(prog, 'a_pos'); this._quadLocations.set(prog, loc); }
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}
}
