/**
 * Pure device → rendering-quality resolution.
 *
 * Kept free of DOM/React so it can be unit-tested and (later) reused by a
 * framework-agnostic core. The component supplies navigator hints + an optional
 * micro-benchmark result; this module decides the tier.
 */

export type LiquidQuality = 'low' | 'standard' | 'high' | 'extreme';

export interface DeviceHints {
  /** navigator.hardwareConcurrency (logical cores). */
  cores: number;
  /** navigator.deviceMemory (GiB). */
  deviceMemory: number;
}

/**
 * Return a tier ONLY when device hints alone make `classifyQuality`'s result invariant of
 * both the benchmark result (`opsPerMs`) and `isMobile`, so the caller can safely skip the
 * main-thread micro-benchmark. Otherwise return null (caller must benchmark + classify).
 *
 * Only the low-end case qualifies: `cores <= 2 || deviceMemory <= 1` forces classifyQuality's
 * first ('low') branch for every `opsPerMs`/`isMobile`. There is intentionally NO high-end
 * short-circuit — a powerful device can still be thermally throttled (low `opsPerMs` ⇒ a
 * lower tier) or mobile (⇒ 'standard'), and skipping the benchmark there would change the
 * resolved tier vs the original logic (a visible regression on the autodetect path).
 */
export function decisiveTier({ cores, deviceMemory }: DeviceHints): LiquidQuality | null {
  if (cores <= 2 || deviceMemory <= 1) return 'low';
  return null;
}

export interface QualitySignals extends DeviceHints {
  isMobile: boolean;
  /** Benchmark throughput: synthetic FP operations per millisecond. */
  opsPerMs: number;
}

/**
 * Full classification using the micro-benchmark result. Thresholds are preserved exactly
 * from the original inline logic so the benchmark path is behaviour-identical.
 */
export function classifyQuality({ cores, deviceMemory, isMobile, opsPerMs }: QualitySignals): LiquidQuality {
  if (cores <= 2 || deviceMemory <= 1 || opsPerMs < 8000) return 'low';
  if (cores <= 4 || deviceMemory <= 2 || opsPerMs < 16000 || isMobile) return 'standard';
  if (cores >= 8 && deviceMemory >= 6 && opsPerMs >= 32000 && !isMobile) return 'extreme';
  return 'high';
}
