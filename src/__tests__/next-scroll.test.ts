import { ScrollTracker } from '../next/scroll';

describe('next: scroll tracker', () => {
  it('carries a steady scroll forward between samples', () => {
    const tracker = new ScrollTracker();
    tracker.sample(0, 100, 1000, 0);
    tracker.sample(0, 120, 1016, 0);
    expect(tracker.predict(1024)).toBe(true);
    expect(tracker.y).toBeCloseTo(130, 5);
    // The next sample lands where the prediction said: no error.
    expect(tracker.sample(0, 140, 1032, 0)).toBeCloseTo(0, 5);
  });

  it('reports how far a prediction was from the sample that followed', () => {
    const tracker = new ScrollTracker();
    tracker.sample(0, 0, 1000, 0);
    tracker.sample(0, 16, 1016, 0);
    expect(tracker.sample(0, 26, 1032, 0)).toBeCloseTo(6, 5);
  });

  it('comes to rest exactly on a sample that repeats', () => {
    const tracker = new ScrollTracker();
    tracker.sample(0, 0, 1000, 0);
    tracker.sample(0, 20, 1016, 0);
    tracker.sample(0, 20, 1032, 0);
    expect(tracker.predict(1040)).toBe(false);
    expect(tracker.y).toBe(20);
  });

  it('predicts further ahead with a lead, but never past its horizon', () => {
    const tracker = new ScrollTracker();
    tracker.sample(0, 0, 1000, 8);
    tracker.sample(0, 16, 1016, 8);
    tracker.predict(1016);
    expect(tracker.y).toBeCloseTo(24, 5);
    tracker.predict(1090);
    expect(tracker.y).toBeCloseTo(16 + 34, 5);
  });

  it('stops following when the samples stop coming', () => {
    const tracker = new ScrollTracker();
    tracker.sample(0, 0, 1000, 0);
    tracker.sample(0, 16, 1016, 0);
    expect(tracker.predict(1200)).toBe(false);
    expect(tracker.y).toBe(16);
    // And a sample after a long gap says nothing about speed.
    expect(tracker.sample(0, 500, 5000, 0)).toBe(-1);
    expect(tracker.predict(5008)).toBe(false);
    expect(tracker.y).toBe(500);
  });
});
