/**
 * Default resolution for pointer-elastic options. Kept pure (no React/DOM) so it can be
 * unit-tested, and crucially so an explicit `undefined` (common when a parent component
 * forwards only some of its props) falls back to the default rather than overriding it —
 * a naive `{ ...DEFAULTS, ...options }` spread would set `undefined`/`NaN` instead.
 */

export interface ResolvedElastic {
  elasticity: number;
  maxShift: number;
  stiffness: number;
  damping: number;
  specular: boolean;
}

export const DEFAULT_ELASTIC: ResolvedElastic = {
  elasticity: 0.15,
  maxShift: 18,
  stiffness: 0.18,
  damping: 0.78,
  specular: true
};

export function resolveElasticOptions(o: Partial<ResolvedElastic> = {}): ResolvedElastic {
  return {
    elasticity: o.elasticity ?? DEFAULT_ELASTIC.elasticity,
    maxShift: o.maxShift ?? DEFAULT_ELASTIC.maxShift,
    stiffness: o.stiffness ?? DEFAULT_ELASTIC.stiffness,
    damping: o.damping ?? DEFAULT_ELASTIC.damping,
    specular: o.specular ?? DEFAULT_ELASTIC.specular
  };
}
