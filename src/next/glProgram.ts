import type { MaterialSpec } from './materials';
import {
  ATTRIBUTE_GROUPS,
  ENGINE_UNIFORMS,
  VERTEX,
  attributeGroups,
  fragmentSource,
  type EngineUniform,
} from './shader';

/** A material compiled for one context, one shape capacity and one variant. */
export interface Program {
  readonly handle: WebGLProgram;
  /** What it was built for. */
  readonly material: MaterialSpec;
  readonly capacity: number;
  readonly lean: boolean;
  readonly uniforms: Readonly<Record<EngineUniform, WebGLUniformLocation | null>>;
  /** Where the material's own uniforms are, in the order its spec lists them. */
  readonly parameters: readonly (WebGLUniformLocation | null)[];
  /** Views of the layer's shape arrays, as long as this program's uniform arrays. */
  readonly boxes: Float32Array;
  readonly radii: Float32Array;
  /** One per attribute group the material names (see `attributeGroups`): where it goes, and its values. */
  readonly attributes: readonly {
    readonly location: WebGLUniformLocation | null;
    readonly values: Float32Array;
  }[];
  /** Where the material's own textures are, in the order its spec lists them. */
  readonly textures: readonly (WebGLUniformLocation | null)[];
}

/** A layer's per-shape arrays, each sized for the most shapes a layer can hold. */
export interface ShapeArrays {
  readonly boxes: Float32Array;
  readonly radii: Float32Array;
  /** One array per attribute group, four values a shape. */
  readonly attributes: readonly Float32Array[];
}

/** Compiles and links a material. Throws with the compiler's message if its GLSL is wrong. */
export function buildProgram(
  gl: WebGLRenderingContext,
  material: MaterialSpec,
  capacity: number,
  lean: boolean,
  arrays: ShapeArrays,
): Program {
  const handle = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, fragmentSource(material, capacity, lean)],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('WebGL could not create a shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
      throw new Error(`Material shader failed to compile: ${gl.getShaderInfoLog(shader) ?? 'no log'}`);
    }
    gl.attachShader(handle, shader);
  }
  gl.bindAttribLocation(handle, 0, 'aCorner');
  gl.linkProgram(handle);
  if (gl.getProgramParameter(handle, gl.LINK_STATUS) !== true) {
    throw new Error(`Material shader failed to link: ${gl.getProgramInfoLog(handle) ?? 'no log'}`);
  }
  const uniforms = Object.fromEntries(
    ENGINE_UNIFORMS.map((name) => [name, gl.getUniformLocation(handle, name)]),
  ) as Record<EngineUniform, WebGLUniformLocation | null>;
  return {
    handle,
    material,
    capacity,
    lean,
    uniforms,
    parameters: material.uniforms.map(({ name }) => gl.getUniformLocation(handle, name)),
    boxes: arrays.boxes.subarray(0, capacity * 4),
    radii: arrays.radii.subarray(0, capacity),
    attributes: attributeGroups(material).flatMap((used, group) => {
      const values = arrays.attributes[group];
      return used && values
        ? [
            {
              location: uniforms[`uAttributes${ATTRIBUTE_GROUPS[group] ?? 'A'}`],
              values: values.subarray(0, capacity * 4),
            },
          ]
        : [];
    }),
    textures: material.textures.map((name) => gl.getUniformLocation(handle, name)),
  };
}
