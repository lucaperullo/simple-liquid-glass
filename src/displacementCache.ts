/**
 * Bounded LRU cache for generated displacement-map data-URIs.
 *
 * The maps are keyed by quality/quantized-size/shape params and shared across all
 * LiquidGlass instances. Resizing produces many distinct keys, so an unbounded Map
 * (the previous behaviour) leaked memory on long-lived SPAs. This caps the cache and
 * evicts the least-recently-used entry on overflow.
 */

export interface LruCache {
  get(key: string): string | undefined;
  set(key: string, val: string): void;
  readonly size: number;
}

/** Create a string→string LRU cache holding at most `max` entries. */
export function createLruCache(max: number): LruCache {
  const map = new Map<string, string>();
  return {
    get(key: string): string | undefined {
      const val = map.get(key);
      if (val !== undefined) {
        // Refresh recency: delete + re-insert moves the key to the newest position.
        map.delete(key);
        map.set(key, val);
      }
      return val;
    },
    set(key: string, val: string): void {
      if (map.has(key)) {
        map.delete(key); // re-insert below to refresh recency
      } else if (map.size >= max) {
        // Map preserves insertion order, so the first key is the oldest.
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, val);
    },
    get size() {
      return map.size;
    }
  };
}

export const CACHE_MAX = 64;

const defaultCache = createLruCache(CACHE_MAX);

export const cacheGet = (key: string): string | undefined => defaultCache.get(key);
export const cacheSet = (key: string, val: string): void => defaultCache.set(key, val);
