import { decisiveTier, classifyQuality } from '../quality';

describe('decisiveTier (skip-benchmark short-circuit)', () => {
  it('returns low for clearly weak devices', () => {
    expect(decisiveTier({ cores: 2, deviceMemory: 4 })).toBe('low');
    expect(decisiveTier({ cores: 8, deviceMemory: 1 })).toBe('low');
    expect(decisiveTier({ cores: 1, deviceMemory: 0.5 })).toBe('low');
  });

  it('does NOT short-circuit strong devices (benchmark must run to honor isMobile + throttling)', () => {
    // A strong device can still be mobile (→ standard) or throttled (low opsPerMs → lower tier),
    // so we cannot safely pick a high tier from hints alone.
    expect(decisiveTier({ cores: 8, deviceMemory: 8 })).toBeNull();
    expect(decisiveTier({ cores: 16, deviceMemory: 16 })).toBeNull();
  });

  it('returns null (inconclusive → must benchmark) for middling devices', () => {
    expect(decisiveTier({ cores: 4, deviceMemory: 4 })).toBeNull();
    expect(decisiveTier({ cores: 6, deviceMemory: 6 })).toBeNull();
    expect(decisiveTier({ cores: 8, deviceMemory: 6 })).toBeNull();
  });

  it('is behaviour-preserving: any non-null short-circuit equals classifyQuality for EVERY opsPerMs and isMobile', () => {
    const coresGrid = [1, 2, 3, 4, 6, 8, 12, 16];
    const memGrid = [0.5, 1, 2, 4, 6, 8, 16];
    const opsGrid = [1000, 7999, 8000, 15999, 16000, 31999, 32000, 60000];
    for (const cores of coresGrid) {
      for (const deviceMemory of memGrid) {
        const decisive = decisiveTier({ cores, deviceMemory });
        if (decisive === null) continue; // benchmark path — covered by classifyQuality tests
        for (const isMobile of [true, false]) {
          for (const opsPerMs of opsGrid) {
            expect(classifyQuality({ cores, deviceMemory, isMobile, opsPerMs })).toBe(decisive);
          }
        }
      }
    }
  });
});

describe('classifyQuality (benchmark path — preserves original thresholds)', () => {
  const strong = { cores: 8, deviceMemory: 8, isMobile: false, opsPerMs: 40000 };

  it('returns low for weak cores/memory or slow benchmark', () => {
    expect(classifyQuality({ ...strong, cores: 2 })).toBe('low');
    expect(classifyQuality({ ...strong, deviceMemory: 1 })).toBe('low');
    expect(classifyQuality({ ...strong, opsPerMs: 5000 })).toBe('low');
  });

  it('returns standard for mid devices, mobiles, or mid benchmark', () => {
    expect(classifyQuality({ ...strong, cores: 4 })).toBe('standard');
    expect(classifyQuality({ ...strong, deviceMemory: 2 })).toBe('standard');
    expect(classifyQuality({ ...strong, opsPerMs: 12000 })).toBe('standard');
    expect(classifyQuality({ ...strong, isMobile: true })).toBe('standard');
  });

  it('returns extreme only for strong, fast, non-mobile devices', () => {
    expect(classifyQuality({ cores: 8, deviceMemory: 6, isMobile: false, opsPerMs: 32000 })).toBe('extreme');
    expect(classifyQuality({ cores: 12, deviceMemory: 16, isMobile: false, opsPerMs: 50000 })).toBe('extreme');
  });

  it('returns high for capable devices that fall short of extreme', () => {
    // 6 cores: not low/standard (cores>4, mem>2, ops>=16000, !mobile), but cores<8 → not extreme
    expect(classifyQuality({ cores: 6, deviceMemory: 8, isMobile: false, opsPerMs: 20000 })).toBe('high');
    // strong+fast but mobile → standard branch wins before extreme
    expect(classifyQuality({ cores: 8, deviceMemory: 8, isMobile: true, opsPerMs: 40000 })).toBe('standard');
  });
});
