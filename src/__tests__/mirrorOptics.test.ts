import { sampleLensField, lensGeometry } from '../core/mirrorOptics';

test('clear center and opposing edges have symmetric inward displacement', () => {
  const g = lensGeometry(300, 180, 40, 26);
  expect(sampleLensField(g, 150, 90)).toEqual([0, 0]);
  const left = sampleLensField(g, g.band / 2, 90);
  const right = sampleLensField(g, 300 - g.band / 2, 90);
  expect(left[0]).toBeGreaterThan(0);
  expect(left[0]).toBeCloseTo(-right[0], 8);
  expect(left[1]).toBe(0);
  expect(sampleLensField(g, 150, g.band / 2)[1]).toBeGreaterThan(0);
});

test('rounded corner field points toward the center and vanishes outside the lens', () => {
  const g = lensGeometry(300, 180, 40, 26);
  expect(sampleLensField(g, 0, 0)).toEqual([0, 0]);
  const [x, y] = sampleLensField(g, 20, 20);
  expect(x).toBeGreaterThan(0);
  expect(x).toBeCloseTo(y, 8);
});

test.each([[300, 180, 40], [600, 48, 24], [48, 600, 24], [20, 20, 100], [300, 180, 0]])(
  'field stays finite and avoids folding for %sx%s radius %s', (w, h, r) => {
    const g = lensGeometry(w, h, r, 10000);
    expect(Math.abs(g.scale)).toBeLessThanOrEqual(g.band / 2);
    let previous = -Infinity;
    for (let x = 0; x <= w; x += 0.25) {
      const [dx, dy] = sampleLensField(g, x, h / 2);
      expect(Number.isFinite(dx) && Number.isFinite(dy)).toBe(true);
      expect(Math.abs(dx)).toBeLessThanOrEqual(0.5);
      const sourceX = x + g.scale * dx;
      expect(sourceX).toBeGreaterThan(previous);
      previous = sourceX;
    }
  }
);

test('strength zero is identity and negative strength is bounded', () => {
  expect(lensGeometry(300, 180, 40, 0).scale).toBe(0);
  const g = lensGeometry(300, 180, 40, -10000);
  expect(g.scale).toBe(-g.band / 2);
});

test.each([0, 8, 40, 90])('corner sampling stays orientation-preserving at radius %s', radius => {
  for (const strength of [-1000, 1000]) {
    const g = lensGeometry(300, 180, radius, strength);
    const map = (x: number, y: number) => { const [dx, dy] = sampleLensField(g, x, y); return [x + g.scale * dx, y + g.scale * dy]; };
    for (let x = 1; x < 90; x += 2) for (let y = 1; y < 90; y += 2) {
      const p = map(x, y), a = map(x + .1, y), b = map(x, y + .1);
      const determinant = ((a[0]-p[0])*(b[1]-p[1])-(b[0]-p[0])*(a[1]-p[1])) / .01;
      expect(determinant).toBeGreaterThan(0);
    }
  }
});
