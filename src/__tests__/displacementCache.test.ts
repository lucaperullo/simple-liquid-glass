import { createLruCache, cacheGet, cacheSet, CACHE_MAX } from '../displacementCache';

describe('createLruCache', () => {
  it('stores and retrieves values', () => {
    const c = createLruCache(3);
    c.set('a', '1');
    expect(c.get('a')).toBe('1');
    expect(c.size).toBe(1);
  });

  it('returns undefined for missing keys', () => {
    const c = createLruCache(3);
    expect(c.get('nope')).toBeUndefined();
  });

  it('evicts the oldest entry when capacity is exceeded', () => {
    const c = createLruCache(2);
    c.set('a', '1');
    c.set('b', '2');
    c.set('c', '3'); // should evict 'a'
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe('2');
    expect(c.get('c')).toBe('3');
    expect(c.size).toBe(2);
  });

  it('refreshes recency on get so the touched entry survives eviction', () => {
    const c = createLruCache(2);
    c.set('a', '1');
    c.set('b', '2');
    c.get('a'); // 'a' is now most-recent; 'b' is oldest
    c.set('c', '3'); // should evict 'b', not 'a'
    expect(c.get('a')).toBe('1');
    expect(c.get('b')).toBeUndefined();
    expect(c.get('c')).toBe('3');
  });

  it('updates value and refreshes recency when setting an existing key (no growth)', () => {
    const c = createLruCache(2);
    c.set('a', '1');
    c.set('b', '2');
    c.set('a', '11'); // update 'a', makes it most-recent; size stays 2
    expect(c.size).toBe(2);
    expect(c.get('a')).toBe('11');
    c.set('c', '3'); // should evict 'b' (oldest), 'a' survives
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe('11');
    expect(c.get('c')).toBe('3');
  });

  it('never exceeds the configured max size', () => {
    const c = createLruCache(4);
    for (let i = 0; i < 100; i++) c.set(`k${i}`, `v${i}`);
    expect(c.size).toBe(4);
    // only the last 4 keys remain
    expect(c.get('k99')).toBe('v99');
    expect(c.get('k95')).toBeUndefined();
  });
});

describe('default displacement cache', () => {
  it('exposes a CACHE_MAX of 64', () => {
    expect(CACHE_MAX).toBe(64);
  });

  it('round-trips through the shared cacheGet/cacheSet', () => {
    const key = `__test_${Math.random()}`;
    expect(cacheGet(key)).toBeUndefined();
    cacheSet(key, 'data:image/svg+xml,abc');
    expect(cacheGet(key)).toBe('data:image/svg+xml,abc');
  });
});
