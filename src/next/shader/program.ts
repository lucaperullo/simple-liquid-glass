import type { MaterialSpec } from '../materials';
import { BACKDROP, DOME, LIGHTING, PRECISION, ROUNDED_BOX, UNION } from './chunks';

/** Positions arrive in clip space: the layer builds a rectangle around each shape. */
export const VERTEX = `attribute vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }`;

/** The uniforms every material's program has, whatever the material. */
export const ENGINE_UNIFORMS = [
  'uPixels',
  'uView',
  'uScale',
  'uCount',
  'uBox',
  'uRadius',
  'uBackdrop',
  'uBackdropRect',
] as const;

export type EngineUniform = (typeof ENGINE_UNIFORMS)[number];

const TYPES = ['float', 'vec2', 'vec3', 'vec4'];

/**
 * The fragment shader for a material: the engine's part (where the pixel is, the shapes' field, the
 * outline's antialiasing) around the material's (`slg_combine`, `slg_shade`).
 *
 * `capacity` is the shape loop's bound. GLSL ES 1.00 needs it constant, and mobile GPUs pay for the whole
 * bound whether or not the loop exits early, so a layer compiles the smallest capacity that fits it.
 */
export function fragmentSource(material: MaterialSpec, capacity: number, lean: boolean): string {
  const uniforms = material.uniforms
    .map(({ name, size }) => `uniform ${TYPES[size - 1] ?? 'float'} ${name};`)
    .join('\n');
  return `${PRECISION}
${lean ? '#define SLG_LEAN 1' : ''}
uniform vec2 uPixels;   // canvas size, device px
uniform vec4 uView;     // the layer in the viewport: left, top, width, height
uniform float uScale;   // device px per CSS px
uniform int uCount;
uniform vec4 uBox[${capacity}];      // centre, half size
uniform float uRadius[${capacity}];
${uniforms}

vec2 slg_screen(vec2 p) { return uView.xy + p; }
${ROUNDED_BOX}
${DOME}
${BACKDROP}
${LIGHTING}
${material.combine ?? UNION}

vec3 slg_field(vec2 p) {
  vec3 f = vec3(0.0, 0.0, 1e5);
  for (int i = 0; i < ${capacity}; i++) {
    if (i >= uCount) break;
    f = slg_combine(f, slg_roundedBox(p - uBox[i].xy, uBox[i].zw, uRadius[i]));
  }
  return f;
}

${material.shade}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uPixels.y - gl_FragCoord.y) / uPixels * uView.zw;
  vec3 f = slg_field(p);
  // One device pixel of antialiasing across the outline.
  float cover = clamp(0.5 - f.z * uScale * 0.5, 0.0, 1.0);
  if (cover <= 0.003) { gl_FragColor = vec4(0.0); return; }
  vec4 glass = slg_shade(p, f);
  float alpha = cover * glass.a;
  gl_FragColor = vec4(glass.rgb * alpha, alpha);
}`;
}
