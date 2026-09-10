// Adapted from @ybouane/liquidglass 1.0.3 (MIT); see THIRD_PARTY_NOTICES.md.
/**
 * GlassRenderer — WebGL rendering pipeline for the liquid glass effect.
 *
 * Manages a single offscreen WebGL canvas, shader programs, and a pool
 * of local-sized FBOs for blur passes. Each panel render crops just the
 * padded region behind that panel, uploads only that region, and shades
 * the glass effect into the matching per-element canvas.
 */

import { VS_QUAD, FS_BLIT, FS_BLUR, VS_GLASS, FS_GLASS } from './shaders';
import { BLUR_ITERATIONS, SHADOW_PAD } from './defaults';
import type { GlassConfig } from './defaults';

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

export class GlassRenderer {
	readonly canvas: HTMLCanvasElement;
	readonly gl: WebGLRenderingContext;
	readonly cropCanvas: HTMLCanvasElement;
	readonly cropCtx: CanvasRenderingContext2D;

	blitP!: WebGLProgram;
	blitU!: UniformMap;
	blurP!: WebGLProgram;
	blurU!: UniformMap;
	glassP!: WebGLProgram;
	glassU!: UniformMap;

	quadBuf!: WebGLBuffer;
	panelBuf!: WebGLBuffer;

	readonly fboCache = new Map<string, FBOSet>();
	activeFBOs: FBOSet | null = null;

	bgTex: WebGLTexture | null = null;

	width = 0;
	height = 0;

	contextLost = false;

	_onContextLost: (e: Event) => void;
	_onContextRestored: () => void;

	constructor() {
		this.canvas = document.createElement('canvas');
		this.canvas.style.display = 'none';

		this.cropCanvas = document.createElement('canvas');
		this.cropCtx = this.cropCanvas.getContext('2d')!;

		const gl = this.canvas.getContext('webgl', {
			alpha: true,
			premultipliedAlpha: false,
			antialias: false,
			preserveDrawingBuffer: true,
		});

		if (!gl) {
			throw new Error('LiquidGlass: WebGL is not supported in this browser.');
		}
		this.gl = gl;

		this._initPrograms();
		this._initBuffers();

		this._onContextLost = (e: Event) => {
			e.preventDefault();
			this.contextLost = true;
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

		this.glassP = this._link(VS_GLASS, FS_GLASS);
		this.glassU = this._uloc(this.glassP, [
			'u_bgTex', 'u_blurTex', 'u_center', 'u_size', 'u_radius',
			'u_res', 'u_pad', 'u_refract', 'u_chroma',
			'u_edgeHL', 'u_spec', 'u_fresnel', 'u_distort', 'u_alpha',
			'u_sat', 'u_tint', 'u_zRadius', 'u_brightness',
			'u_shadowAlpha', 'u_shadowSpread', 'u_shadowOffY',
			'u_bevelMode',
		]);
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

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		// Panel sizes change on resize — flush the FBO pool so stale
		// entries don't accumulate and the canvas can shrink.
		for (const fboSet of this.fboCache.values()) {
			this._freeFBOSet(fboSet);
		}
		this.fboCache.clear();
		this.activeFBOs = null;
		this.canvas.width = 0;
		this.canvas.height = 0;
	}

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
		config: GlassConfig,
		width: number,
		height: number,
		dpr: number,
	): void {
		if (this.contextLost) return;
		const gl = this.gl;
		const W = this.width;
		const H = this.height;
		const fboSet = this.activeFBOs!;

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.useProgram(this.glassP);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, fboSet.bg.tex);
		gl.uniform1i(this.glassU.u_bgTex, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, fboSet.blurA.tex);
		gl.uniform1i(this.glassU.u_blurTex, 1);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, this.canvas.height - H, W, H);
		gl.uniform2f(this.glassU.u_res, W, H);

		gl.uniform2f(this.glassU.u_center, W * 0.5, H * 0.5);
		gl.uniform2f(this.glassU.u_size, width * dpr, height * dpr);

		gl.uniform1f(this.glassU.u_radius, config.cornerRadius * dpr);
		gl.uniform1f(this.glassU.u_pad, SHADOW_PAD * dpr);
		gl.uniform1f(this.glassU.u_refract, config.refraction);
		gl.uniform1f(this.glassU.u_chroma, config.chromAberration);
		gl.uniform1f(this.glassU.u_edgeHL, config.edgeHighlight);
		gl.uniform1f(this.glassU.u_spec, config.specular);
		gl.uniform1f(this.glassU.u_fresnel, config.fresnel);
		gl.uniform1f(this.glassU.u_distort, config.distortion);
		gl.uniform1f(this.glassU.u_alpha, config.opacity);
		gl.uniform1f(this.glassU.u_sat, config.saturation);
		gl.uniform1f(this.glassU.u_tint, config.tintStrength);
		gl.uniform1f(this.glassU.u_zRadius, config.zRadius * dpr);
		gl.uniform1f(this.glassU.u_brightness, config.brightness);
		gl.uniform1f(this.glassU.u_shadowAlpha, config.shadowOpacity);
		gl.uniform1f(this.glassU.u_shadowSpread, config.shadowSpread * dpr);
		gl.uniform1f(this.glassU.u_shadowOffY, config.shadowOffsetY * dpr);
		gl.uniform1f(this.glassU.u_bevelMode, config.bevelMode);

		this._drawQuad(this.glassP, this.panelBuf);
		gl.disable(gl.BLEND);
	}

	clear(): void {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, this.canvas.height - this.height, this.width, this.height);
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(0, this.canvas.height - this.height, this.width, this.height);
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
			gl.deleteBuffer(this.quadBuf);
			gl.deleteBuffer(this.panelBuf);
			gl.deleteProgram(this.blitP);
			gl.deleteProgram(this.blurP);
			gl.deleteProgram(this.glassP);
		}
		this.canvas.remove();
	}

	// ────────────────────────────────────────────
	// FBO management
	// ────────────────────────────────────────────

	_setActiveSize(w: number, h: number): boolean {
		if (w <= 0 || h <= 0) return false;

		this.width = w;
		this.height = h;

		if (this.canvas.width !== w || this.canvas.height !== h) {
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
			console.error('LiquidGlass shader compile error:', gl.getShaderInfoLog(s), src);
			return null;
		}
		return s;
	}

	_link(vsSrc: string, fsSrc: string): WebGLProgram {
		const gl = this.gl;
		const p = gl.createProgram()!;
		gl.attachShader(p, this._compile(vsSrc, gl.VERTEX_SHADER)!);
		gl.attachShader(p, this._compile(fsSrc, gl.FRAGMENT_SHADER)!);
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
			console.error('LiquidGlass program link error:', gl.getProgramInfoLog(p));
		}
		return p;
	}

	_uloc(prog: WebGLProgram, names: string[]): UniformMap {
		const gl = this.gl;
		const u: UniformMap = {};
		for (const n of names) {
			u[n] = gl.getUniformLocation(prog, n);
		}
		return u;
	}

	_drawQuad(prog: WebGLProgram, buf: WebGLBuffer): void {
		const gl = this.gl;
		const loc = gl.getAttribLocation(prog, 'a_pos');
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}
}
