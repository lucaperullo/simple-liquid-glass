/**
 * The 6.0 GLSL library: small functions a material is assembled from. Each chunk is self-contained GLSL ES
 * 1.00 text and names what it needs in its comment. Points are CSS pixels with y down unless stated.
 *
 * Distances travel with their gradient (`vec3`: xy the gradient, z the distance), so a material gets the
 * surface normal from one evaluation of the field instead of three.
 */

/** `highp` where the GPU has it in fragment shaders; `mediump` otherwise. */
export const PRECISION = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif`;

/** Distance to a rounded box centred on the origin, with its gradient. */
export const ROUNDED_BOX = `vec3 slg_roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 side = sign(p);
  vec2 q = abs(p) - halfSize + radius;
  vec2 outside = max(q, 0.0);
  float reach = length(outside);
  float d = reach + min(max(q.x, q.y), 0.0) - radius;
  vec2 gradient = reach > 0.0
    ? side * outside / reach
    : (q.x > q.y ? vec2(side.x, 0.0) : vec2(0.0, side.y));
  return vec3(gradient, d);
}`;

/** The plain union of two fields: the nearer shape wins. A material may replace it (`combine`). */
export const UNION = `vec3 slg_combine(vec3 a, vec3 b) {
  return a.z < b.z ? a : b;
}`;

/**
 * Slope of a domed edge: the surface rises along a quarter sine over `rim` pixels inside the outline and
 * is flat beyond. Returns d(height)/d(distance); multiply by the field's gradient for the surface slope.
 */
export const DOME = `float slg_domeSlope(float d, float rim) {
  float t = clamp(-d / rim, 0.0, 1.0);
  return t > 0.0 && t < 1.0 ? -cos(t * 1.5707963) * 1.5707963 * 0.85 : 0.0;
}`;

/**
 * The picture behind the glass, sampled at a viewport point.
 * Uniforms: `uBackdrop`, and `uBackdropRect` (the viewport rectangle the picture covers: left, top, width,
 * height).
 */
export const BACKDROP = `uniform sampler2D uBackdrop;
uniform vec4 uBackdropRect;
uniform float uHasBackdrop;
float slg_hasBackdrop() { return uHasBackdrop; }
vec3 slg_backdrop(vec2 screen) {
  return texture2D(uBackdrop, clamp((screen - uBackdropRect.xy) / uBackdropRect.zw, 0.001, 0.999)).rgb;
}`;

/** A soft studio environment to reflect, and the Fresnel weight of a reflection for a surface normal. */
export const LIGHTING = `vec3 slg_studio(vec3 ray) {
  vec3 light = mix(vec3(0.06, 0.065, 0.075), vec3(0.82, 0.84, 0.86), smoothstep(-0.4, 1.0, ray.y));
  light += vec3(0.9) * exp(-pow((ray.y - 0.1) * 10.0, 2.0)) * 0.36;
  return light + vec3(1.0) * pow(max(dot(ray, normalize(vec3(-0.48, 0.70, 0.52))), 0.0), 38.0) * 0.65;
}
float slg_fresnel(float facing) {
  return 0.04 + 0.96 * pow(1.0 - max(0.0, facing), 5.0);
}`;
