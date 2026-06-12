import { parseCssColorToRgba, isRgbColorDark } from '../cssColor';

describe('parseCssColorToRgba', () => {
  it('parses rgb()', () => {
    expect(parseCssColorToRgba('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });
  it('parses rgba()', () => {
    expect(parseCssColorToRgba('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });
  it('parses #rgb, #rgba, #rrggbb, #rrggbbaa', () => {
    expect(parseCssColorToRgba('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColorToRgba('#f00a')).toEqual({ r: 255, g: 0, b: 0, a: 170 / 255 });
    expect(parseCssColorToRgba('#102030')).toEqual({ r: 16, g: 32, b: 48, a: 1 });
    expect(parseCssColorToRgba('#10203080')).toEqual({ r: 16, g: 32, b: 48, a: 128 / 255 });
  });
  it('returns null for unparseable input', () => {
    expect(parseCssColorToRgba('not-a-color')).toBeNull();
    expect(parseCssColorToRgba('')).toBeNull();
  });
});

describe('isRgbColorDark', () => {
  it('classifies black dark and white light', () => {
    expect(isRgbColorDark({ r: 0, g: 0, b: 0 })).toBe(true);
    expect(isRgbColorDark({ r: 255, g: 255, b: 255 })).toBe(false);
  });
});
