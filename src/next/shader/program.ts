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
  'uAttributesA',
  'uAttributesB',
  'uAttributesC',
  'uAttributesD',
  'uAttributesE',
  'uAttributesF',
  'uTime',
  'uHasBackdrop',
  'uBackdrop',
  'uBackdropRect',
] as const;

export type EngineUniform = (typeof ENGINE_UNIFORMS)[number];

const TYPES = ['float', 'vec2', 'vec3', 'vec4'];

/** The groups of four attributes a shape has, by the letter a material calls them. */
export const ATTRIBUTE_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/**
 * The attribute groups a material's GLSL names. Only those become uniforms: each is a `vec4` per shape, and
 * a phone's fragment shader has a few hundred uniform vectors in all.
 */
export function attributeGroups(material: MaterialSpec): boolean[] {
  const source = `${material.field ?? ''}${material.combine ?? ''}${material.shade}`;
  return ATTRIBUTE_GROUPS.map((letter) => source.includes(`slg_attributes${letter}`));
}

/**
 * The fragment shader for a material: the engine's part (where the pixel is, the shapes' field, the
 * outline's antialiasing) around the material's (`slg_combine`, `slg_shade`).
 *
 * `capacity` is the shape loop's bound. GLSL ES 1.00 needs it constant, and mobile GPUs pay for the whole
 * bound whether or not the loop exits early, so a layer compiles the smallest capacity that fits it.
 */
export function fragmentSource(material: MaterialSpec, capacity: number, lean: boolean): string {
  const uniforms = [
    ...material.uniforms.map(({ name, size }) => `uniform ${TYPES[size - 1] ?? 'float'} ${name};`),
    ...material.textures.map((name) => `uniform sampler2D ${name};`),
  ].join('\n');
  const attributes = attributeGroups(material)
    .map((used, group) => {
      const letter = ATTRIBUTE_GROUPS[group] ?? 'A';
      return used
        ? `uniform vec4 uAttributes${letter}[${capacity}];\n#define slg_attributes${letter} uAttributes${letter}`
        : '';
    })
    .join('\n');
  return `${PRECISION}
${lean ? '#define SLG_LEAN 1' : ''}
uniform vec2 uPixels;   // canvas size, device px
uniform vec4 uView;     // the layer in the viewport: left, top, width, height
uniform float uScale;   // device px per CSS px
uniform int uCount;
uniform vec4 uBox[${capacity}];      // centre, half size
uniform float uRadius[${capacity}];
uniform float uTime;    // seconds since the layer was made
${attributes}
#define slg_time uTime
#define SLG_CAPACITY ${capacity}
#define slg_count uCount
#define slg_boxes uBox
#define slg_radii uRadius
${uniforms}

vec2 slg_screen(vec2 p) { return uView.xy + p; }
${ROUNDED_BOX}
${DOME}
${BACKDROP}
${LIGHTING}
${
  material.field ??
  `${material.combine ?? UNION}

vec3 slg_field(vec2 p) {
  vec3 f = vec3(0.0, 0.0, 1e5);
  for (int i = 0; i < ${capacity}; i++) {
    if (i >= uCount) break;
    f = slg_combine(f, slg_roundedBox(p - uBox[i].xy, uBox[i].zw, uRadius[i]));
  }
  return f;
}`
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
