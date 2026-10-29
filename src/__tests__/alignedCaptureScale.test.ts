import {
  alignedCaptureScale,
  CAPTURE_ALIGNMENT_MAX_PIXELS,
  CAPTURE_DIMENSION_LIMIT,
  CAPTURE_PIXEL_BUDGET,
} from '../core/webgl/alignedCaptureScale';

const stripes = (width: number, height: number, first: number) => [
  {x: 0, y: 0, width, height: first},
  {x: 0, y: first, width, height: height - first},
];

test('Retina alignment admits the 800px section with only 7904 pixels above the old budget', () => {
  const plan = alignedCaptureScale(1200, 4000, 2, stripes(1200, 4000, 800));
  expect(plan.adjusted).toBe(true);
  expect(plan.dpr).toBe(1.87);
  expect([plan.samplingWidth, plan.samplingHeight]).toEqual([2243, 7478]);
  expect([plan.width, plan.height]).toEqual([2244, 7480]);
  expect(plan.width * plan.height - CAPTURE_PIXEL_BUDGET).toBe(7904);
  expect(Math.floor(800 * plan.dpr)).toBe(1496);
  expect(Math.round(800 * plan.dpr)).toBe(1496);
  expect(plan.dpr).toBeGreaterThanOrEqual(plan.originalDpr);
});

test('unalignable widths retain the exact previous capped scale', () => {
  const plan = alignedCaptureScale(1199, 4000, 2, stripes(1199, 4000, 800));
  const before = alignedCaptureScale(1199, 4000, 2);
  expect(plan).toEqual(before);
  expect(plan.adjusted).toBe(false);
});

test('all section origins and sizes participate in the grid', () => {
  const baseline = alignedCaptureScale(1200, 4000, 2);
  expect(alignedCaptureScale(1200, 4000, 2, [
    {x: 1, y: 0, width: 1199, height: 800},
    {x: 0, y: 800, width: 1200, height: 3200},
  ])).toEqual(baseline);
  expect(alignedCaptureScale(1200, 4000, 2, [
    {x: 0, y: 0, width: 1200, height: 799},
    {x: 0, y: 799, width: 1200, height: 3201},
  ])).toEqual(baseline);
});

test('never raises above requested DPR, even when alignment would fit the pixel budget', () => {
  const plan = alignedCaptureScale(1200, 4000, 1.8697, stripes(1200, 4000, 800));
  expect(plan.adjusted).toBe(false);
  expect(plan.dpr).toBeLessThanOrEqual(1.8697);
});

test('already aligned DPR 1 and fractional grids remain unchanged', () => {
  for (const dpr of [1, 1.25, 1.5]) {
    const plan = alignedCaptureScale(1200, 2400, dpr, stripes(1200, 2400, 800));
    expect(plan.dpr).toBe(dpr);
    expect(plan.adjusted).toBe(false);
    expect(plan.width).toBe(1200 * dpr);
    expect(plan.height).toBe(2400 * dpr);
  }
});

test('DPR stays capped at 2, even on higher-density devices', () => {
  const plan = alignedCaptureScale(400, 800, 3, stripes(400, 800, 400));
  expect(plan.dpr).toBe(2);
  expect(plan.adjusted).toBe(false);
});

test('a bounded next-up adjustment prevents canvas truncating a mathematically integral section', () => {
  expect(Math.floor(100 * 0.29)).toBe(28);
  const plan = alignedCaptureScale(10000, 20000, 2, stripes(10000, 20000, 100));
  expect(plan.adjusted).toBe(true);
  expect(plan.dpr).toBeGreaterThan(0.29);
  expect([plan.width, plan.height]).toEqual([2900, 5800]);
  expect(Math.floor(100 * plan.dpr)).toBe(29);
  expect(Math.floor(19900 * plan.dpr)).toBe(5771);
  expect(Math.round(100 * plan.dpr)).toBe(29);
  expect(plan.width * plan.height).toBeLessThanOrEqual(CAPTURE_ALIGNMENT_MAX_PIXELS);
});

test('the headroom is at most 1%, including a rejected nearby rational scale', () => {
  const plan = alignedCaptureScale(10000, 20600, 2, stripes(10000, 20600, 100));
  expect(plan.adjusted).toBe(false);
  expect(plan.width * plan.height).toBeLessThanOrEqual(CAPTURE_PIXEL_BUDGET);
  expect(CAPTURE_ALIGNMENT_MAX_PIXELS).toBe(Math.floor(CAPTURE_PIXEL_BUDGET * 1.01));
});

test('dimension limits take priority over grid alignment', () => {
  const plan = alignedCaptureScale(20000, 200, 2, stripes(20000, 200, 100));
  expect(plan.adjusted).toBe(false);
  expect(plan.width).toBe(CAPTURE_DIMENSION_LIMIT);
  expect(plan.height).toBeLessThanOrEqual(CAPTURE_DIMENSION_LIMIT);
  expect(plan.dpr).toBeLessThanOrEqual(CAPTURE_DIMENSION_LIMIT / 20000);
});

test('missing or invalid section geometry never enables promotion', () => {
  const baseline = alignedCaptureScale(1200, 4000, 2);
  for (const sections of [null, [], [{x: 0.5, y: 0, width: 1200, height: 800}],
    [{x: 0, y: -1, width: 1200, height: 800}],
    [{x: 0, y: 0, width: 1201, height: 800}],
    [{x: 0, y: 3500, width: 1200, height: 800}],
    [{x: 0, y: 0, width: 1200, height: 0}]]) {
    expect(alignedCaptureScale(1200, 4000, 2, sections)).toEqual(baseline);
  }
});

test('invalid roots and DPR are rejected explicitly', () => {
  for (const args of [[0, 4000, 2], [1200.5, 4000, 2], [1200, Infinity, 2],
    [1200, 4000, 0], [1200, 4000, NaN]]) {
    expect(() => alignedCaptureScale(args[0], args[1], args[2])).toThrow(RangeError);
  }
});


test('a renderer dimension ceiling restricts promotion without changing the old policy', () => {
  const sections = stripes(1200, 4000, 800);
  const before = alignedCaptureScale(1200, 4000, 2);
  expect(alignedCaptureScale(1200, 4000, 2, sections, 7479)).toEqual(before);
  expect(alignedCaptureScale(1200, 4000, 2, sections, 4096)).toEqual(before);
  expect(alignedCaptureScale(1200, 4000, 2, sections, 8192).adjusted).toBe(true);
  expect(alignedCaptureScale(1200, 4000, 2, sections, 32768).dpr).toBe(1.87);
  expect(alignedCaptureScale(1200, 4000, 2, sections, 0)).toEqual(before);
});
