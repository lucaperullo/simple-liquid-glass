import { SpringBank } from '../next/springs';

/** Runs spring 0 from 0 towards 100 for `seconds` at `hz` frames per second. */
function run(hz: number, seconds: number): SpringBank {
  const bank = new SpringBank(1);
  bank.aim(0, 100, 170, 18);
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) bank.step(1 / hz);
  return bank;
}

describe('next: springs', () => {
  it('moves the same at 60, 90 and 120 frames per second', () => {
    for (const seconds of [0.1, 0.2, 0.4]) {
      const at120 = run(120, seconds).value[0] ?? 0;
      expect(at120).toBeGreaterThan(1);
      expect(at120).not.toBe(100);
      for (const hz of [60, 90]) {
        const other = run(hz, seconds).value[0] ?? 0;
        // Within 0.5% of the distance travelled.
        expect(Math.abs(other - at120)).toBeLessThan(0.5);
      }
    }
  });

  it('comes to rest exactly on its target', () => {
    const bank = run(120, 3);
    expect(bank.value[0]).toBe(100);
    expect(bank.moving).toBe(false);
    expect(bank.step(1 / 120)).toBe(false);
  });

  it('reports a change on the step that brings it to rest', () => {
    const bank = new SpringBank(1);
    bank.aim(0, 100, 170, 18);
    let changed = true;
    let steps = 0;
    while (bank.moving) {
      changed = bank.step(1 / 120);
      steps++;
    }
    expect(changed).toBe(true);
    expect(steps).toBeLessThan(240);
  });

  it('jumps without a spring, and when settled', () => {
    const bank = new SpringBank(2);
    bank.aim(0, 40, 0, 0);
    expect(bank.value[0]).toBe(40);
    expect(bank.moving).toBe(false);

    bank.aim(1, 80, 170, 18);
    bank.step(1 / 60);
    expect(bank.moving).toBe(true);
    bank.settle();
    expect(bank.value[1]).toBe(80);
    expect(bank.moving).toBe(false);
  });

  it('resumes after a long gap instead of leaping', () => {
    const bank = new SpringBank(1);
    bank.aim(0, 100, 170, 18);
    bank.step(5);
    expect(bank.value[0]).toBeLessThan(50);
  });

  it('stays stable at the stiffest spring it accepts', () => {
    const bank = new SpringBank(1);
    bank.aim(0, 100, 1e9, 40);
    for (let frame = 0; frame < 600; frame++) {
      bank.step(1 / 120);
      expect(Math.abs(bank.value[0] ?? 0)).toBeLessThan(250);
    }
    expect(bank.value[0]).toBe(100);
  });

  it('closes the gap when springs are removed', () => {
    const bank = new SpringBank(3);
    bank.jump(0, 1);
    bank.aim(1, 2, 170, 18);
    bank.jump(2, 3);
    bank.aim(2, 30, 170, 18);
    bank.remove(1, 1);
    expect(bank.value[0]).toBe(1);
    expect(bank.value[1]).toBe(3);
    expect(bank.value[2]).toBe(0);
    for (let frame = 0; frame < 600; frame++) bank.step(1 / 120);
    expect(Array.from(bank.value)).toEqual([1, 30, 0]);
  });
});
