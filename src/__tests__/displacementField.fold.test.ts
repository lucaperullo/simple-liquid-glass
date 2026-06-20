import { classicBandFraction, classicAmpScale, jacobianMinDet } from '../core/displacementField';

describe('classicBandFraction', () => {
  it('grows with scaleEff and shrinks with element size', () => {
    const small = classicBandFraction(160, 300);
    const big = classicBandFraction(480, 300);
    expect(big).toBeGreaterThan(small);
    expect(classicBandFraction(160, 600)).toBeLessThan(classicBandFraction(160, 300));
  });

  it('clamps to [BAND_MIN, BAND_MAX]', () => {
    expect(classicBandFraction(0, 300)).toBeCloseTo(0.06, 5);      // floor
    expect(classicBandFraction(100000, 100)).toBeCloseTo(0.45, 5); // ceiling
  });

  it('coerces non-finite inputs to the floor', () => {
    expect(classicBandFraction(NaN, 300)).toBeCloseTo(0.06, 5);
    expect(classicBandFraction(160, 0)).toBeCloseTo(0.06, 5);
  });

  it('lets edgeFeather override the auto width (clamped to BAND_MAX)', () => {
    expect(classicBandFraction(160, 300, 0.2)).toBeCloseTo(0.2, 5);
    expect(classicBandFraction(160, 300, 0.9)).toBeCloseTo(0.45, 5);
  });
});

describe('classicAmpScale', () => {
  it('is full strength (1) when the geometry has room', () => {
    expect(classicAmpScale(160, 320)).toBe(1);     // square at default scale
    expect(classicAmpScale(0, 320)).toBe(1);       // degenerate scale → no attenuation
  });
  it('attenuates (<1, >0) at extreme scale on a thin element', () => {
    const att = classicAmpScale(640, 150);
    expect(att).toBeLessThan(1);
    expect(att).toBeGreaterThan(0);
  });
});

describe('fold metric (Jacobian injectivity sweep)', () => {
  // aspect 1, 3:1, 1:3, 4:1
  const sizes: Array<[number, number]> = [[320, 320], [480, 160], [160, 480], [600, 150]];
  const scales = [160, 320, 480, 640];
  const cases: Array<{ w: number; h: number; r: number; scale: number }> = [];
  for (const [w, h] of sizes) {
    for (const r of [0, 24, 80, Math.min(w, h) / 2]) {
      for (const scale of scales) cases.push({ w, h, r, scale });
    }
  }

  it('the new envelope field stays injective (min-det > 0) across the whole sweep', () => {
    for (const c of cases) {
      const min = jacobianMinDet({ ...c, scaleEff: c.scale, legacy: false }, 64);
      expect({ ...c, min: Number(min.toFixed(4)) }).toMatchObject({ min: expect.any(Number) });
      expect(min).toBeGreaterThan(0);
    }
  });

  it('the legacy field folds somewhere in the same sweep (proves the test has teeth)', () => {
    const mins = cases.map((c) => jacobianMinDet({ ...c, scaleEff: c.scale, legacy: true }, 64));
    expect(Math.min(...mins)).toBeLessThan(0);
  });
});
