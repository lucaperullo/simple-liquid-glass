export const CAPTURE_PIXEL_BUDGET = 16 * 1024 * 1024;
export const CAPTURE_DIMENSION_LIMIT = 16384;
export const CAPTURE_ALIGNMENT_MAX_PIXELS = Math.floor(CAPTURE_PIXEL_BUDGET * 1.01);

export interface CaptureScaleRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CaptureScalePlan {
  readonly dpr: number;
  /** Actual canvas dimensions after the browser's integer truncation. */
  readonly width: number;
  readonly height: number;
  /** Previous capped sampling grid, before any alignment adjustment. */
  readonly originalDpr: number;
  readonly samplingWidth: number;
  readonly samplingHeight: number;
  readonly adjusted: boolean;
}

function gcd(a: number, b: number): number {
  while (b) { const next = a % b; a = b; b = next; }
  return a;
}

/** Next positive IEEE-754 number, without requiring BigInt in browsers. */
function nextUp(value: number): number {
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, value);
  const low = bits.getUint32(4);
  bits.setUint32(4, (low + 1) >>> 0);
  if (low === 0xffffffff) bits.setUint32(0, bits.getUint32(0) + 1);
  return bits.getFloat64(0);
}

/**
 * Choose a uniform raster grid for already-validated independent rectangles.
 * Paint containment/opacity remain the caller's responsibility. All rectangles
 * must be supplied, not just those dirty in the current update.
 *
 * Promotion is upward only and stays within requested DPR/dimension limits.
 * The optional dimension ceiling restricts promotion only, preserving the old
 * fallback policy. At most 1% headroom above the existing 16-Mpixel budget is
 * allowed. If the exact grid cannot be represented safely, retain the old scale.
 */
export function alignedCaptureScale(
  width: number,
  height: number,
  requestedDpr: number,
  sections: readonly CaptureScaleRect[] | null = null,
  alignmentDimensionLimit: number = CAPTURE_DIMENSION_LIMIT,
): CaptureScalePlan {
  if (!Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height) || height <= 0 ||
      !Number.isFinite(requestedDpr) || requestedDpr <= 0) {
    throw new RangeError('Capture dimensions and DPR must be positive finite values; dimensions must be integers');
  }
  const maximumDpr = Math.min(requestedDpr, 2,
    CAPTURE_DIMENSION_LIMIT / width, CAPTURE_DIMENSION_LIMIT / height);
  const originalDpr = Math.min(maximumDpr, Math.sqrt(CAPTURE_PIXEL_BUDGET / (width * height)));
  const samplingWidth = Math.floor(width * originalDpr);
  const samplingHeight = Math.floor(height * originalDpr);
  const original: CaptureScalePlan = {
    dpr: originalDpr, width: samplingWidth, height: samplingHeight,
    originalDpr, samplingWidth, samplingHeight, adjusted: false,
  };
  if (!sections?.length || !Number.isSafeInteger(alignmentDimensionLimit) || alignmentDimensionLimit <= 0) return original;
  const alignmentMaximumDpr = Math.min(maximumDpr,
    alignmentDimensionLimit / width, alignmentDimensionLimit / height);

  let divisor = gcd(width, height);
  for (const section of sections) {
    const {x, y, width: w, height: h} = section;
    if (![x, y, w, h].every(Number.isSafeInteger) || x < 0 || y < 0 ||
        w <= 0 || h <= 0 || w > width || h > height ||
        x > width - w || y > height - h) return original;
    for (const length of [x, y, w, h]) divisor = gcd(divisor, length);
  }

  // Test the operations actually used by canvas and patchSections. A nominal
  // rational scale can multiply to just below an integer (e.g. 100 * 0.29).
  const fits = (scale: number, numerator: number): boolean => {
    const size = (length: number) => Math.floor(length * scale) === (length / divisor) * numerator;
    const origin = (length: number) => Math.round(length * scale) === (length / divisor) * numerator;
    return size(width) && size(height) && sections.every(s =>
      size(s.width) && size(s.height) && origin(s.x) && origin(s.y));
  };
  const nearest = Math.round(originalDpr * divisor);
  if (nearest > 0 && fits(originalDpr, nearest)) return original;

  const numerator = Math.ceil(originalDpr * divisor);
  let dpr = numerator / divisor;
  if (!fits(dpr, numerator)) dpr = nextUp(dpr);
  if (dpr < originalDpr || dpr > alignmentMaximumDpr || !fits(dpr, numerator)) return original;

  const rasterWidth = Math.floor(width * dpr), rasterHeight = Math.floor(height * dpr);
  if (rasterWidth > CAPTURE_DIMENSION_LIMIT || rasterHeight > CAPTURE_DIMENSION_LIMIT ||
      rasterWidth * rasterHeight > CAPTURE_ALIGNMENT_MAX_PIXELS) return original;
  return {...original, dpr, width: rasterWidth, height: rasterHeight, adjusted: true};
}
