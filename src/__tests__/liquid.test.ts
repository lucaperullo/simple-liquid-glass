import { liquidConfig, liquidBaseFrequency, isLiquidPreset, LIQUID_PRESETS } from '../core/liquid';

describe('liquid presets', () => {
  it('exposes the three presets and a type guard', () => {
    expect(LIQUID_PRESETS).toEqual(['ripple', 'flow', 'wobble']);
    expect(isLiquidPreset('ripple')).toBe(true);
    expect(isLiquidPreset('wobble')).toBe(true);
    expect(isLiquidPreset('nope')).toBe(false);
    expect(isLiquidPreset(undefined)).toBe(false);
  });

  describe('liquidConfig', () => {
    it('returns the preset defaults', () => {
      const c = liquidConfig('ripple');
      expect(c.scale).toBe(15);
      expect(c.numOctaves).toBe(2);
      expect(c.seed).toBe(3);
    });

    it('honors a scale override', () => {
      expect(liquidConfig('ripple', { scale: 40 }).scale).toBe(40);
    });

    it('caps amplitude with maxScale', () => {
      expect(liquidConfig('wobble', { maxScale: 10 }).scale).toBe(10);
      // a cap above the preset is a no-op
      expect(liquidConfig('ripple', { maxScale: 100 }).scale).toBe(15);
    });

    it('never returns a negative scale', () => {
      expect(liquidConfig('ripple', { scale: -5 }).scale).toBe(0);
    });

    it('falls back to ripple for an unknown preset', () => {
      // @ts-expect-error exercising the runtime guard
      expect(liquidConfig('bogus').scale).toBe(15);
    });
  });

  describe('liquidBaseFrequency', () => {
    it('stays within the preset oscillation band for all t', () => {
      // ripple base 0.012 ± 0.004 on both axes
      for (let t = 0; t < 20; t += 0.37) {
        const [x, y] = liquidBaseFrequency('ripple', t);
        expect(x).toBeGreaterThanOrEqual(0.008 - 1e-9);
        expect(x).toBeLessThanOrEqual(0.016 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(0.008 - 1e-9);
        expect(y).toBeLessThanOrEqual(0.016 + 1e-9);
      }
    });

    it('keeps the flow y-frequency constant (anisotropic drift)', () => {
      const [, y0] = liquidBaseFrequency('flow', 0);
      const [, y1] = liquidBaseFrequency('flow', 5);
      expect(y0).toBe(0.016);
      expect(y1).toBe(0.016);
    });

    it('scales motion with speed', () => {
      const slow = liquidBaseFrequency('ripple', 1, 0.5);
      const fast = liquidBaseFrequency('ripple', 1, 4);
      expect(slow).not.toEqual(fast);
    });

    it('coerces non-finite t/speed to a stable value', () => {
      const [x, y] = liquidBaseFrequency('ripple', NaN, Infinity);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    });
  });
});
