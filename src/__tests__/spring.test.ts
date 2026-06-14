import { stepSpring, isSettled, clamp, SpringState } from '../interactive/spring';

const CFG = { stiffness: 0.15, damping: 0.8 };

describe('clamp', () => {
  it('bounds a value to [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('stepSpring', () => {
  it('does not mutate the input state', () => {
    const s: SpringState = { x: 0, y: 0, vx: 0, vy: 0 };
    stepSpring(s, 10, 10, CFG);
    expect(s).toEqual({ x: 0, y: 0, vx: 0, vy: 0 });
  });

  it('moves toward the target', () => {
    let s: SpringState = { x: 0, y: 0, vx: 0, vy: 0 };
    const next = stepSpring(s, 10, -5, CFG);
    expect(next.x).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(10);
    expect(next.y).toBeLessThan(0);
    expect(next.y).toBeGreaterThan(-5);
  });

  it('converges to the target within a bounded number of steps and then settles', () => {
    let s: SpringState = { x: 0, y: 0, vx: 0, vy: 0 };
    const tx = 24;
    const ty = -16;
    let steps = 0;
    while (!isSettled(s, tx, ty) && steps < 1000) {
      s = stepSpring(s, tx, ty, CFG);
      steps++;
    }
    expect(steps).toBeLessThan(1000);
    expect(s.x).toBeCloseTo(tx, 0);
    expect(s.y).toBeCloseTo(ty, 0);
    expect(isSettled(s, tx, ty)).toBe(true);
  });
});

describe('isSettled', () => {
  it('is true at rest on the target, false while moving', () => {
    expect(isSettled({ x: 5, y: 5, vx: 0, vy: 0 }, 5, 5)).toBe(true);
    expect(isSettled({ x: 0, y: 0, vx: 2, vy: 0 }, 5, 5)).toBe(false);
    expect(isSettled({ x: 0, y: 0, vx: 0, vy: 0 }, 5, 5)).toBe(false);
  });
});
