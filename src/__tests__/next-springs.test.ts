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

  it('has finished after a long gap', () => {
    const bank = new SpringBank(1);
    bank.aim(0, 100, 170, 18);
    bank.step(5);
    expect(bank.value[0]).toBe(100);
    expect(bank.moving).toBe(false);
  });

  it('is where the time says, however the time was cut into calls', () => {
    // A renderer's frames on one thread, a page's on another: same aims at the same times, same springs.
    const start = 1_000_000;
    const run = (times: number[]): number[] => {
      const bank = new SpringBank(2);
      bank.advanceTo(start);
      bank.aim(0, 300, 170, 18);
      const seen: number[] = [];
      let retargeted = false;
      for (const time of times) {
        if (!retargeted && time > start + 120) {
          bank.advanceTo(start + 120);
          bank.aim(0, 40, 170, 18);
          bank.aim(1, 90, 220, 20);
          retargeted = true;
        }
        bank.advanceTo(time);
        seen.push(bank.value[0] ?? 0, bank.value[1] ?? 0);
      }
      return seen.slice(-2);
    };
    const at = start + 260;
    const worker = run([
      start + 7.1,
      start + 15.4,
      start + 23.8,
      start + 57,
      start + 131.3,
      start + 139.6,
      start + 200.2,
      at,
    ]);
    const page = run([start + 16.7, start + 33.3, start + 150, at]);
    expect(worker[0]).toBeCloseTo(page[0] ?? 0, 9);
    expect(worker[1]).toBeCloseTo(page[1] ?? 0, 9);
    expect(worker[0]).not.toBe(40);
  });

  it('copies another bank exactly', () => {
    const bank = new SpringBank(1);
    bank.advanceTo(500);
    bank.aim(0, 100, 170, 18);
    bank.advanceTo(590);
    const copy = new SpringBank(1);
    copy.copyFrom(bank);
    bank.advanceTo(700);
    copy.advanceTo(700);
    expect(copy.value[0]).toBe(bank.value[0]);
    expect(copy.moving).toBe(true);
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
