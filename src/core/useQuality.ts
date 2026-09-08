import { useEffect, useState } from 'react';
import { decisiveTier, classifyQuality, type LiquidQuality } from '../quality';

export function useQuality(incomingQuality: LiquidQuality | undefined, autodetectquality: boolean): LiquidQuality {
  // Quality resolution management
  const hasExplicitQuality = typeof incomingQuality !== 'undefined' && incomingQuality !== null;
  const defaultQuality: LiquidQuality = 'low';
  const initialQuality: LiquidQuality = hasExplicitQuality ? (incomingQuality as LiquidQuality) : defaultQuality;
  const [resolvedQuality, setResolvedQuality] = useState<LiquidQuality>(initialQuality);
  useEffect(() => {
    if (hasExplicitQuality) {
      setResolvedQuality(incomingQuality as LiquidQuality);
      return;
    }
    if (!autodetectquality) {
      setResolvedQuality(defaultQuality);
      return;
    }
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      // SSR safety
      setResolvedQuality(defaultQuality);
      return;
    }

    // Prefer low quality when user requests reduced motion
    const prefersReducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setResolvedQuality('low');
      return;
    }

    const CACHE_KEY = 'simpleLiquidGlass_quality_v1';
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

    // localStorage persists across sessions; sessionStorage is the per-tab fallback.
    const readCachedQuality = (): LiquidQuality | null => {
      for (const getStore of [() => window.localStorage, () => window.sessionStorage]) {
        try {
          const raw = getStore().getItem(CACHE_KEY);
          if (!raw) continue;
          const data = JSON.parse(raw) as { q: LiquidQuality; t: number } | null;
          if (data && data.q && typeof data.t === 'number' && Date.now() - data.t < CACHE_TTL_MS) {
            return data.q;
          }
        } catch {}
      }
      return null;
    };

    const persistQuality = (q: LiquidQuality) => {
      const payload = JSON.stringify({ q, t: Date.now() });
      try { window.localStorage.setItem(CACHE_KEY, payload); } catch {}
      try { window.sessionStorage.setItem(CACHE_KEY, payload); } catch {}
    };

    const cachedQuality = readCachedQuality();
    if (cachedQuality) {
      setResolvedQuality(cachedQuality);
      return;
    }

    const cores = (navigator as any).hardwareConcurrency || 4;
    const deviceMemory = (navigator as any).deviceMemory || 4;
    const ua = navigator.userAgent || '';
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

    // Fast path: when navigator hints are conclusive, skip the benchmark entirely.
    const decisive = decisiveTier({ cores, deviceMemory });
    if (decisive) {
      setResolvedQuality(decisive);
      persistQuality(decisive);
      return;
    }

    // Otherwise measure FP throughput off the critical path (idle), capped at ~12ms.
    let cancelled = false;
    const runBenchmark = () => {
      if (cancelled) return;
      let operations = 0;
      const start = performance.now();
      while (performance.now() - start < 12) {
        // mix operations to stress the FP unit and defeat dead-code elimination
        for (let i = 0; i < 200; i++) {
          const x = Math.sin(i + operations) * Math.cos(i * 1.3 + operations) + Math.sqrt(i + 1);
          if (x > 1e9) operations -= 1; // never true
          operations += 1;
        }
      }
      const elapsed = Math.max(1, performance.now() - start);
      const opsPerMs = operations / elapsed;
      if (cancelled) return;
      const q = classifyQuality({ cores, deviceMemory, isMobile, opsPerMs });
      setResolvedQuality(q);
      persistQuality(q);
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    let idleId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof ric === 'function') {
      // Defer off the critical path, but cap the wait so the (opt-in) autodetect quality
      // resolves soon after first paint rather than lingering at the 'low' default.
      idleId = ric(runBenchmark, { timeout: 200 });
    } else {
      timeoutId = setTimeout(runBenchmark, 1);
    }

    return () => {
      cancelled = true;
      const cic = (window as any).cancelIdleCallback as ((id: number) => void) | undefined;
      if (idleId && typeof cic === 'function') cic(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [incomingQuality, autodetectquality]);

  return resolvedQuality;
}
