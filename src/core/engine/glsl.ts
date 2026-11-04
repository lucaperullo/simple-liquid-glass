/** GLSL plumbing for `simple-liquid-glass/engine`: the stable `slg_*` prelude, the shared vertex shader and
 * small WebGL helpers. Only the prelude names below are part of the public contract — nothing here reaches for
 * `slg_frost`, `slg_under` or `slg_pointer` (G9/G8/G11), because those gaps were not approved. */

/** One full-screen clip-space quad, shared by every material program. */
export const VERTEX_SHADER = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

/**
 * Prepended to every material's fragment source. `slg_view`/`slg_scale` describe the surface's drawn region
 * (CSS px size, device px per CSS px); `slg_origin` is the CSS-px offset from that region's top-left to the
 * host element's own box top-left (non-zero only with `bleed`); `slg_viewport` is the region's top-left in the
 * browser viewport, CSS px (`DrawContext.viewport`). `slg_point()` returns the current fragment's position
 * within the region, CSS px, y down, matching `hudShader.ts`'s `p`. `slg_toScreen` converts a region-local point
 * to viewport CSS px (what a backdrop sample needs). `slg_backdrop` is a no-op (always transparent black) unless
 * `inputs.backdrop` was requested and a backdrop is bound.
 */
export const PRELUDE = `precision highp float;
uniform vec2 slg_view;
uniform float slg_scale;
uniform vec2 slg_origin;
uniform vec2 slg_viewport;
uniform float slg_time;
uniform sampler2D slg_backdropTex;
uniform vec4 slg_backdropRegion;
uniform float slg_hasBackdropFlag;
vec2 slg_point() {
  return vec2(gl_FragCoord.x, slg_view.y * slg_scale - gl_FragCoord.y) / slg_scale;
}
vec2 slg_toScreen(vec2 p) { return p + slg_viewport; }
float slg_hasBackdrop() { return slg_hasBackdropFlag; }
vec3 slg_backdrop(vec2 screen) {
  if (slg_hasBackdropFlag < 0.5) return vec3(0.0);
  vec2 uv = clamp(slg_backdropRegion.xy + screen * slg_backdropRegion.zw, vec2(0.0), vec2(1.0));
  return texture2D(slg_backdropTex, uv).rgb;
}
`;

export function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('simple-liquid-glass/engine: shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`simple-liquid-glass/engine: shader failed to compile: ${log}`);
  }
  return shader;
}

export function linkProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('simple-liquid-glass/engine: program allocation failed');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'a_pos');
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown error';
    gl.deleteProgram(program);
    throw new Error(`simple-liquid-glass/engine: program failed to link: ${log}`);
  }
  return program;
}

const quadBuffers = new WeakMap<WebGLRenderingContext, WebGLBuffer>();

/** One shared full-screen quad (two triangles, clip space), reused by every material on a context. */
export function quadBuffer(gl: WebGLRenderingContext): WebGLBuffer {
  let buffer = quadBuffers.get(gl);
  if (!buffer) {
    const created = gl.createBuffer();
    if (!created) throw new Error('simple-liquid-glass/engine: buffer allocation failed');
    buffer = created;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    quadBuffers.set(gl, buffer);
  }
  return buffer;
}

/** The cached quad buffer's handle dies with its context (context loss survives on the same `gl`
 * object, so the WeakMap entry would otherwise point at a stale, now-invalid buffer). Call from
 * the owning `webglcontextlost`/`webglcontextrestored` handling, alongside the program cache. */
export function invalidateQuadBuffer(gl: WebGLRenderingContext): void { quadBuffers.delete(gl); }

export function drawQuad(gl: WebGLRenderingContext): void {
  const buffer = quadBuffer(gl);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
