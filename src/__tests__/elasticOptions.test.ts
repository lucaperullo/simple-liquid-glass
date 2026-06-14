import { resolveElasticOptions, DEFAULT_ELASTIC } from '../interactive/options';

describe('resolveElasticOptions', () => {
  it('returns all defaults for no input', () => {
    expect(resolveElasticOptions()).toEqual(DEFAULT_ELASTIC);
  });

  it('keeps provided values', () => {
    const r = resolveElasticOptions({ elasticity: 0.35, maxShift: 30 });
    expect(r.elasticity).toBe(0.35);
    expect(r.maxShift).toBe(30);
  });

  it('falls back to defaults for explicit undefined (the parent-forwards-some-props case)', () => {
    // This is the exact shape <LiquidGlassInteractive elasticity={0.35} /> forwards: only
    // elasticity set, the rest undefined. A spread merge would clobber them with undefined
    // and produce NaN translates.
    const r = resolveElasticOptions({
      elasticity: 0.35,
      maxShift: undefined,
      stiffness: undefined,
      damping: undefined,
      specular: undefined
    });
    expect(r.elasticity).toBe(0.35);
    expect(r.maxShift).toBe(DEFAULT_ELASTIC.maxShift);
    expect(r.stiffness).toBe(DEFAULT_ELASTIC.stiffness);
    expect(r.damping).toBe(DEFAULT_ELASTIC.damping);
    expect(r.specular).toBe(true);
    // none should be undefined/NaN
    expect(Object.values(r).some((v) => v === undefined || (typeof v === 'number' && Number.isNaN(v)))).toBe(false);
  });

  it('respects specular=false (not overridden by default true)', () => {
    expect(resolveElasticOptions({ specular: false }).specular).toBe(false);
  });
});
