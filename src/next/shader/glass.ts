import type { MaterialDefinition, UniformValue } from '../materials';

/**
 * The built-in `glass`: a domed edge that bends the backdrop, with a little dispersion; a tint that is
 * lighter at the edge; a Fresnel reflection of a soft studio; a rim light; and a soft shade where the
 * edge meets the surface. Lengths are CSS pixels.
 */
export const GLASS_MATERIAL: MaterialDefinition = {
  id: 'glass',
  uniforms: {
    /** Width of the curved edge, measured inwards from the outline. */
    rim: 12,
    /** How far the steepest part of the edge displaces the backdrop. */
    bend: 18,
    /** Colour separation at the edge, as a fraction of `bend`. */
    dispersion: 0.006,
    /** Opacity of the glass, 0 to 1. */
    opacity: 0.94,
    /** The glass's own colour, and how much of it shows in the middle (a quarter of that at the edge). */
    tint: [0.1, 0.11, 0.13],
    tintAmount: 0.34,
    /** Strength of the reflection, of the light along the rim, and of the shade inside the edge. */
    reflection: 0.34,
    rimLight: 0.06,
    contact: 0,
  },
  shade: `vec4 slg_shade(vec2 p, vec3 field) {
  // Nothing to bend yet: stay invisible until the layer has its picture.
  if (slg_hasBackdrop() < 0.5) return vec4(0.0);
  float d = field.z;
  vec3 normal = normalize(vec3(-field.xy * slg_domeSlope(d, rim) * 1.2, 1.15));
  vec2 screen = slg_screen(p);
  vec2 offset = -normal.xy * bend;
#ifdef SLG_LEAN
  vec3 color = slg_backdrop(screen + offset);
#else
  vec3 color = vec3(
    slg_backdrop(screen + offset * (1.0 + dispersion)).r,
    slg_backdrop(screen + offset).g,
    slg_backdrop(screen + offset * (1.0 - dispersion)).b);
#endif
  float edge = smoothstep(-rim - 2.0, -1.0, d);
  color = mix(color, tint, tintAmount * mix(1.0, 0.25, edge));
  color *= 1.0 - contact * edge * edge;
  vec3 reflected = slg_studio(reflect(vec3(0.0, 0.0, -1.0), normal));
  float fresnel = slg_fresnel(normal.z);
  color = mix(color, reflected, fresnel * reflection) + reflected * fresnel * reflection * 0.25;
  color += vec3(0.96, 0.98, 1.0) * (1.0 - smoothstep(-1.0, 1.0, d)) * smoothstep(-7.0, -2.0, d) * rimLight;
  return vec4(color, opacity);
}`,
};

/** `glass` tuned for dark surroundings. These are the material's defaults. */
export const GLASS_DARK: Readonly<Record<string, UniformValue>> = {
  tint: [0.1, 0.11, 0.13],
  tintAmount: 0.34,
  reflection: 0.34,
  rimLight: 0.06,
  contact: 0,
};

/** `glass` tuned for light surroundings: a pale tint, a brighter rim, a soft shade inside the edge. */
export const GLASS_LIGHT: Readonly<Record<string, UniformValue>> = {
  tint: [0.97, 0.98, 1],
  tintAmount: 0.3,
  reflection: 0.42,
  rimLight: 0.14,
  contact: 0.1,
};
