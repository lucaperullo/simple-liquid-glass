/**
 * Materials: what glass looks like, as data. A material is GLSL that shades one pixel of a layer's shapes,
 * plus the uniforms it reads. The built-in `glass` is defined this way and so is anything an application
 * adds with `host.defineMaterial()`.
 *
 * What a material's GLSL (ES 1.00) can use:
 *
 * - `vec2 slg_screen(vec2 p)`: the viewport point of a layer point.
 * - `vec3 slg_backdrop(vec2 screen)`: the picture behind the glass at a viewport point.
 * - `vec3 slg_roundedBox(vec2 p, vec2 halfSize, float radius)`: distance to a rounded box, with its gradient.
 * - `float slg_domeSlope(float d, float rim)`: slope of a domed edge `rim` px wide at distance `d`.
 * - `vec3 slg_studio(vec3 ray)` and `float slg_fresnel(float facing)`: a soft reflection and its weight.
 * - `SLG_LEAN`: defined when the layer asked for the cheaper variant; use `#ifdef` to drop what it can spare.
 * - its own uniforms, declared for it from `uniforms`.
 *
 * Points are CSS pixels from the layer's top-left corner, y down. A field value is a `vec3`: xy the gradient
 * of the distance to the layer's shapes, z the distance (negative inside).
 */

/** A uniform's value: a float, or a vector of 2 to 4 floats. */
export type UniformValue = number | readonly number[];

export interface MaterialDefinition {
  /** A name for the material, unique in its host. */
  readonly id: string;
  /**
   * GLSL defining `vec4 slg_shade(vec2 p, vec3 field)`: the colour (not premultiplied) and opacity of the
   * glass at `p`. It runs only for pixels inside or on the outline; the engine applies the outline's
   * antialiasing.
   */
  readonly shade: string;
  /**
   * GLSL defining `vec3 slg_combine(vec3 a, vec3 b)`: how two shapes' fields become one. Default: a plain
   * union, the nearer shape wins.
   */
  readonly combine?: string;
  /** The uniforms `shade` and `combine` read, with their default values. */
  readonly uniforms?: Readonly<Record<string, UniformValue>>;
  /**
   * How far outside its shapes' boxes the material can paint, CSS px (a `combine` that bridges a gap, a
   * glow). The engine only draws that far around each shape. Default 0.
   */
  readonly bleed?: number;
}

/** A material as the renderer receives it: the same, with its uniforms laid out in one array. */
export interface MaterialSpec {
  readonly id: string;
  readonly shade: string;
  readonly combine: string | null;
  readonly uniforms: readonly { readonly name: string; readonly size: number; readonly offset: number }[];
  /** Floats in a parameter array for this material. */
  readonly length: number;
  readonly bleed: number;
}

const sizeOf = (value: UniformValue): number => (typeof value === 'number' ? 1 : value.length);

/** Lays a definition's uniforms out. Throws on a name GLSL would not accept or a vector of the wrong size. */
export function specOf(definition: MaterialDefinition): MaterialSpec {
  let offset = 0;
  const uniforms = Object.entries(definition.uniforms ?? {}).map(([name, value]) => {
    const size = sizeOf(value);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || /^(gl_|slg_)/.test(name)) {
      throw new TypeError(`Material "${definition.id}": "${name}" is not a usable uniform name`);
    }
    if (size < 1 || size > 4) {
      throw new TypeError(`Material "${definition.id}": uniform "${name}" must have 1 to 4 components`);
    }
    const entry = { name, size, offset };
    offset += size;
    return entry;
  });
  return {
    id: definition.id,
    shade: definition.shade,
    combine: definition.combine ?? null,
    uniforms,
    length: offset,
    bleed: Math.max(definition.bleed ?? 0, 0),
  };
}

/**
 * The parameter array for a layer: `base` (or zeros) with `values` written over it. Throws on a name the
 * material does not declare or a value of the wrong size.
 */
export function packParams(
  spec: MaterialSpec,
  values: Readonly<Record<string, UniformValue>>,
  base?: Float32Array,
): Float32Array {
  const params = new Float32Array(spec.length);
  if (base) params.set(base);
  for (const [name, value] of Object.entries(values)) {
    const uniform = spec.uniforms.find((entry) => entry.name === name);
    if (!uniform) throw new TypeError(`Material "${spec.id}" has no parameter "${name}"`);
    if (sizeOf(value) !== uniform.size) {
      throw new TypeError(`Material "${spec.id}": "${name}" takes ${uniform.size} component(s)`);
    }
    params.set(typeof value === 'number' ? [value] : value, uniform.offset);
  }
  return params;
}
