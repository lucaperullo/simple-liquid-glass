import { classicBandFraction } from '../core/displacementField';

describe('classicBandFraction', () => {
  it('grows with scaleEff and shrinks with element size', () => {
    const small = classicBandFraction(160, 300);
    const big = classicBandFraction(480, 300);
    expect(big).toBeGreaterThan(small);
    expect(classicBandFraction(160, 600)).toBeLessThan(classicBandFraction(160, 300));
  });

  it('clamps to [BAND_MIN, BAND_MAX]', () => {
    expect(classicBandFraction(0, 300)).toBeCloseTo(0.06, 5);      // floor
    expect(classicBandFraction(100000, 100)).toBeCloseTo(0.48, 5); // ceiling
  });

  it('coerces non-finite inputs to the floor', () => {
    expect(classicBandFraction(NaN, 300)).toBeCloseTo(0.06, 5);
    expect(classicBandFraction(160, 0)).toBeCloseTo(0.06, 5);
  });

  it('lets edgeFeather override the auto width (clamped to BAND_MAX)', () => {
    expect(classicBandFraction(160, 300, 0.2)).toBeCloseTo(0.2, 5);
    expect(classicBandFraction(160, 300, 0.9)).toBeCloseTo(0.48, 5);
  });
});
