import React, { useEffect, useMemo, useRef, useState } from 'react';

type BackdropInput = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface LiquidGlassCanvasProps extends React.HTMLAttributes<HTMLDivElement> {
  width: number;
  height: number;
  mode?: 'preset' | 'custom';
  // Visual controls (aligned with DOM version)
  scale?: number; // reserved for future displacement
  radius?: number;
  border?: number;
  lightness?: number;
  displace?: number;
  alpha?: number;
  blur?: number;
  dispersion?: number; // reserved for future chromatic aberration
  frost?: number;
  borderColor?: string;
  glassColor?: string; // must be semi-transparent

  // Backdrop
  backdropSource?: BackdropInput;

  // Text color controls
  autoTextColor?: boolean;
  textOnDark?: string;
  textOnLight?: string;
  forceTextColor?: boolean;

  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const DEFAULTS = {
  scale: 160,
  radius: 50,
  border: 0.05,
  lightness: 53,
  displace: 0.38,
  alpha: 0.9,
  blur: 5,
  dispersion: 50,
  frost: 0.1,
  borderColor: 'rgba(120, 120, 120, 0.7)',
};

function isSemiTransparentColor(input?: string | null): boolean {
  if (!input) return false;
  const color = input.trim();
  const rgba = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d*\.?\d+)\s*\)$/i.exec(color);
  if (rgba) {
    const a = parseFloat(rgba[1]);
    return a > 0 && a < 1;
  }
  const hsla = /^hsla\(.*?,\s*(\d*\.?\d+)\s*\)$/i.exec(color);
  if (hsla) {
    const a = parseFloat(hsla[1]);
    return a > 0 && a < 1;
  }
  const hslSlash = /^hsl\(.*?\/\s*(\d*\.?\d+)\s*\)$/i.exec(color);
  if (hslSlash) {
    const a = parseFloat(hslSlash[1]);
    return a > 0 && a < 1;
  }
  const hex4 = /^#([0-9a-f]{4})$/i.exec(color);
  if (hex4) {
    const aHex = hex4[1].slice(3, 4);
    const a = parseInt(aHex + aHex, 16) / 255;
    return a > 0 && a < 1;
  }
  const hex8 = /^#([0-9a-f]{8})$/i.exec(color);
  if (hex8) {
    const aHex = hex8[1].slice(6, 8);
    const a = parseInt(aHex, 16) / 255;
    return a > 0 && a < 1;
  }
  return false;
}

function getResolvedGlassBackground(glassColor: string | undefined, frost: number): string {
  if (glassColor && isSemiTransparentColor(glassColor)) return glassColor;
  if (glassColor && !isSemiTransparentColor(glassColor)) {
    // eslint-disable-next-line no-console
    console.warn('[LiquidGlassCanvas] `glassColor` must be semi-transparent. Falling back.');
  }
  return `hsl(0 0% 100% / ${frost})`;
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info || 'unknown'}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info || 'unknown'}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function createTextureFromSource(gl: WebGL2RenderingContext, source: BackdropInput): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, (source as any).width, (source as any).height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source as any);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function createRenderTexture(gl: WebGL2RenderingContext, w: number, h: number): { texture: WebGLTexture; fbo: WebGLFramebuffer } {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { texture, fbo };
}

const VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
out vec2 v_uv;
void main(){
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Horizontal/Vertical blur pass controlled by u_direction (1,0) or (0,1)
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
uniform vec2 u_texelSize; // 1/width, 1/height
uniform vec2 u_direction; // (1,0) or (0,1)

void main(){
  // 9-tap Gaussian-like weights
  float w0 = 0.2270270270;
  float w1 = 0.1945945946;
  float w2 = 0.1216216216;
  float w3 = 0.0540540541;
  float w4 = 0.0162162162;
  vec2 off = u_direction * u_texelSize;
  vec3 col = texture(u_tex, v_uv).rgb * w0;
  col += texture(u_tex, v_uv + off * 1.3846154).rgb * w1;
  col += texture(u_tex, v_uv - off * 1.3846154).rgb * w1;
  col += texture(u_tex, v_uv + off * 3.2307692).rgb * w2;
  col += texture(u_tex, v_uv - off * 3.2307692).rgb * w2;
  // extra taps for smoother blur
  col += texture(u_tex, v_uv + off * 5.0).rgb * w3;
  col += texture(u_tex, v_uv - off * 5.0).rgb * w3;
  col += texture(u_tex, v_uv + off * 7.0).rgb * w4;
  col += texture(u_tex, v_uv - off * 7.0).rgb * w4;
  fragColor = vec4(col, 1.0);
}`;

// Final composite: rounded-rect mask + glass overlay + simple gradient border
const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_blurred;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_borderWidth;
uniform vec4 u_glassColor;
uniform vec4 u_borderColorA; // start
uniform vec4 u_borderColorB; // end

// SDF for rounded rect in pixel space
float sdRoundRect(vec2 p, vec2 b, float r){
  // p in pixels with origin at center
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) - r;
}

void main(){
  vec2 uv = v_uv;
  vec2 px = uv * u_resolution; // pixel coords with origin at top-left
  vec2 center = u_resolution * 0.5;
  vec2 p = px - center;
  vec2 halfSize = center;
  float radius = u_radius;
  float d = sdRoundRect(p, halfSize, radius);

  // Border mask: ring where distance in [-borderWidth, 0]
  float bw = max(u_borderWidth, 0.0);
  float borderMask = smoothstep(0.0, 1.0, 1.0 - smoothstep(-bw, 0.0, d));

  // Inside mask
  float inside = step(d, 0.0);

  vec4 scene = texture(u_blurred, uv);
  // Simple diagonal gradient for border
  float t = dot(normalize(vec2(1.0, -1.0)), (px / u_resolution) - 0.5) * 0.5 + 0.5;
  vec4 borderCol = mix(u_borderColorA, u_borderColorB, clamp(t, 0.0, 1.0));

  // Glass overlay
  vec4 glass = u_glassColor;
  vec4 inner = mix(scene, glass, glass.a);

  vec4 color = vec4(0.0);
  color = mix(color, scene, 1.0 - inside); // outside: scene (no draw), but we actually want it transparent
  color = mix(color, inner, inside);
  color.rgb = mix(color.rgb, borderCol.rgb, borderMask);
  color.a = max(inside, borderMask);

  // Output only panel+border (transparent outside)
  if (color.a <= 0.001) discard;
  fragColor = color;
}`;

export default function LiquidGlassCanvas(props: LiquidGlassCanvasProps) {
  const {
    width,
    height,
    mode = 'preset',
    scale = DEFAULTS.scale,
    radius = DEFAULTS.radius,
    border = DEFAULTS.border,
    lightness = DEFAULTS.lightness,
    displace = DEFAULTS.displace,
    alpha = DEFAULTS.alpha,
    blur = DEFAULTS.blur,
    dispersion = DEFAULTS.dispersion,
    frost = DEFAULTS.frost,
    borderColor = DEFAULTS.borderColor,
    glassColor,
    backdropSource,
    autoTextColor = true,
    textOnDark = '#ffffff',
    textOnLight = '#111111',
    forceTextColor = false,
    className,
    style,
    children,
    ...rest
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [effectiveTextColor, setEffectiveTextColor] = useState<string>(textOnLight);

  // Text color auto-detection via computed background (DOM fallback)
  useEffect(() => {
    if (!autoTextColor) return;
    const el = containerRef.current?.parentElement ?? null;
    const color = (() => {
      let cur: HTMLElement | null = el;
      while (cur) {
        const bg = getComputedStyle(cur).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          // parse rgb
          const m = /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(bg);
          if (m) {
            const r = parseInt(m[1], 10) / 255;
            const g = parseInt(m[2], 10) / 255;
            const b = parseInt(m[3], 10) / 255;
            const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
            const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
            return L < 0.5 ? textOnDark : textOnLight;
          }
        }
        cur = cur.parentElement;
      }
      return textOnLight;
    })();
    setEffectiveTextColor(color);
  }, [autoTextColor, textOnDark, textOnLight]);

  const resolvedGlassColor = useMemo(
    () => getResolvedGlassBackground(glassColor, frost),
    [glassColor, frost]
  );

  // Parse colors to vec4
  function cssColorToVec4(css: string): [number, number, number, number] {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = css;
    const parsed = ctx.fillStyle as string; // canonicalized
    const m = /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\)/.exec(parsed);
    if (m) {
      const r = parseInt(m[1], 10) / 255;
      const g = parseInt(m[2], 10) / 255;
      const b = parseInt(m[3], 10) / 255;
      const a = m[4] ? parseFloat(m[4]) : 1;
      return [r, g, b, a];
    }
    // fallback white
    return [1, 1, 1, 0.4];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const renderWidth = Math.max(1, Math.floor(width * dpr));
    const renderHeight = Math.max(1, Math.floor(height * dpr));
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true });
    if (!gl) {
      // eslint-disable-next-line no-console
      console.warn('[LiquidGlassCanvas] WebGL2 not supported.');
      return;
    }

    gl.viewport(0, 0, renderWidth, renderHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);

    // Quad geometry
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const quad = new Float32Array([
      // pos   // uv
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    // Programs
    const blurProg = createProgram(gl, VS, FS_BLUR);
    const compProg = createProgram(gl, VS, FS_COMPOSITE);

    // Backdrop texture
    if (!backdropSource) {
      // Clear to transparent if no backdrop provided
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindVertexArray(null);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(blurProg);
      gl.deleteProgram(compProg);
      return;
    }
    const srcTex = createTextureFromSource(gl, backdropSource);

    // Intermediate render targets for separable blur
    const { texture: texA, fbo: fboA } = createRenderTexture(gl, renderWidth, renderHeight);
    const { texture: texB, fbo: fboB } = createRenderTexture(gl, renderWidth, renderHeight);

    // 1) Copy source to texA
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
    gl.useProgram(blurProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(gl.getUniformLocation(blurProg, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(blurProg, 'u_texelSize'), 1 / renderWidth, 1 / renderHeight);
    const blurPx = Math.max(0, blur);
    // Horizontal blur
    gl.uniform2f(gl.getUniformLocation(blurProg, 'u_direction'), blurPx, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Vertical blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(gl.getUniformLocation(blurProg, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(blurProg, 'u_texelSize'), 1 / renderWidth, 1 / renderHeight);
    gl.uniform2f(gl.getUniformLocation(blurProg, 'u_direction'), 0, blurPx);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2) Composite to default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.uniform1i(gl.getUniformLocation(compProg, 'u_blurred'), 0);
    gl.uniform2f(gl.getUniformLocation(compProg, 'u_resolution'), renderWidth, renderHeight);
    gl.uniform1f(gl.getUniformLocation(compProg, 'u_radius'), Math.max(0, Math.min(radius * dpr, Math.min(renderWidth, renderHeight) * 0.5)));
    const borderWidthPx = Math.max(0, Math.min(1.0 * dpr, Math.min(renderWidth, renderHeight) * 0.5 * DEFAULTS.border));
    gl.uniform1f(gl.getUniformLocation(compProg, 'u_borderWidth'), borderWidthPx);

    const glassVec = cssColorToVec4(resolvedGlassColor);
    gl.uniform4f(gl.getUniformLocation(compProg, 'u_glassColor'), glassVec[0], glassVec[1], glassVec[2], glassVec[3]);
    // Border gradient: start at 0% -> borderColor, fade to transparent
    const borderVecA = cssColorToVec4(borderColor);
    const borderVecB: [number, number, number, number] = [borderVecA[0], borderVecA[1], borderVecA[2], 0];
    gl.uniform4f(gl.getUniformLocation(compProg, 'u_borderColorA'), borderVecA[0], borderVecA[1], borderVecA[2], borderVecA[3]);
    gl.uniform4f(gl.getUniformLocation(compProg, 'u_borderColorB'), borderVecB[0], borderVecB[1], borderVecB[2], borderVecB[3]);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Cleanup (keep programs if future animation needed)
    gl.bindVertexArray(null);
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteTexture(srcTex);
    gl.deleteTexture(texA);
    gl.deleteTexture(texB);
    gl.deleteFramebuffer(fboA);
    gl.deleteFramebuffer(fboB);
    gl.deleteProgram(blurProg);
    gl.deleteProgram(compProg);
  }, [width, height, backdropSource, blur, radius, borderColor, resolvedGlassColor]);

  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    width,
    height,
    ...style,
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    color: autoTextColor ? effectiveTextColor : undefined,
    transition: 'color 150ms ease',
  };

  const textClassName = useMemo(() => `lgc-text-${Math.random().toString(36).slice(2, 9)}`, []);

  return (
    <div ref={containerRef} className={className} style={wrapperStyle} {...rest}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      <div className={forceTextColor ? textClassName : undefined} style={overlayStyle}>
        {forceTextColor && autoTextColor && (
          <style>{`
            .${textClassName} { color: ${effectiveTextColor} !important; }
            .${textClassName} * { color: ${effectiveTextColor} !important; }
          `}</style>
        )}
        {children}
      </div>
    </div>
  );
}


