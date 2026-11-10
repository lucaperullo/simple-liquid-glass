/**
 * Springs, stepped by the renderer's clock. Every spring advances in fixed sub-steps, so where a value is
 * after a given time does not depend on how many frames it took to get there: 60 Hz and 120 Hz displays
 * show the same motion.
 */

/** Seconds per sub-step. Small enough to stay stable up to `MAX_STIFFNESS`. */
export const SPRING_STEP = 1 / 240;

/** Stiffer springs are clamped: past this the fixed step would start to ring. */
export const MAX_STIFFNESS = 20000;

/** The most time one call catches up on, seconds. Every spring has long come to rest by then. */
const MAX_CATCH_UP = 10;

/** A spring this close to its target (CSS px) and this slow (CSS px/s) stops there. */
const REST_DISTANCE = 0.02;
const REST_SPEED = 0.2;

/**
 * Something the springs may not do, applied after every sub-step: it moves positions back where they may be
 * and takes the speed out of what it stopped.
 */
export type SpringConstraint = (position: Float64Array, velocity: Float64Array) => void;

/**
 * Keeps a box inside walls: a constraint for four springs starting at `at` (the box's centre x and y, then
 * its half width and half height). A box too large for the room shrinks to fit it; one that reaches a wall
 * stops there and keeps only the speed that takes it away again.
 */
export function keepInside(
  position: Float64Array,
  velocity: Float64Array,
  at: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  for (let axis = 0; axis < 2; axis++) {
    const centre = at + axis;
    const half = at + 2 + axis;
    const low = axis === 0 ? left : top;
    const high = axis === 0 ? right : bottom;
    const room = Math.max(high - low, 0) / 2;
    if ((position[half] ?? 0) > room) {
      position[half] = room;
      velocity[half] = Math.min(velocity[half] ?? 0, 0);
    }
    const size = position[half] ?? 0;
    const middle = position[centre] ?? 0;
    if (middle - size < low) {
      position[centre] = low + size;
      velocity[centre] = Math.max(velocity[centre] ?? 0, 0);
    } else if (middle + size > high) {
      position[centre] = high - size;
      velocity[centre] = Math.min(velocity[centre] ?? 0, 0);
    }
  }
}

/** A fixed number of independent springs, stored as columns so a step touches no objects. */
export class SpringBank {
  /** What to draw: each position, carried forward by the time that has not filled a sub-step yet. */
  readonly value: Float64Array;

  private readonly position: Float64Array;
  private readonly velocity: Float64Array;
  private readonly target: Float64Array;
  private readonly stiffness: Float64Array;
  private readonly damping: Float64Array;
  private readonly live: Uint8Array;
  private liveCount = 0;
  private remainder = 0;
  /** See `SpringConstraint`. Applied to moving springs; aim inside what it allows. */
  constraint: SpringConstraint | null = null;
  /** Speeds nobody keeps, for constraining `value`; and where each spring was when a step began. */
  private readonly spare: Float64Array;
  private readonly before: Float64Array;
  /** The time `advanceTo` has brought the springs to, ms. */
  private clock = 0;

  constructor(readonly size: number) {
    this.value = new Float64Array(size);
    this.position = new Float64Array(size);
    this.velocity = new Float64Array(size);
    this.target = new Float64Array(size);
    this.stiffness = new Float64Array(size);
    this.damping = new Float64Array(size);
    this.live = new Uint8Array(size);
    this.spare = new Float64Array(size);
    this.before = new Float64Array(size);
  }

  /** Whether any spring is still on its way. */
  get moving(): boolean {
    return this.liveCount > 0;
  }

  /** Sends spring `index` towards `target`. A stiffness of 0 or less puts it there at once. */
  aim(index: number, target: number, stiffness: number, damping: number): void {
    if (stiffness <= 0) {
      this.jump(index, target);
      return;
    }
    this.target[index] = target;
    this.stiffness[index] = Math.min(stiffness, MAX_STIFFNESS);
    this.damping[index] = Math.max(damping, 0);
    if (this.live[index] === 0 && this.position[index] !== target) {
      this.live[index] = 1;
      this.liveCount++;
    }
  }

  /** Puts spring `index` at `value`, at rest. */
  jump(index: number, value: number): void {
    this.target[index] = value;
    this.position[index] = value;
    this.value[index] = value;
    this.velocity[index] = 0;
    if (this.live[index] === 1) {
      this.live[index] = 0;
      this.liveCount--;
    }
  }

  /** Puts every spring at its target, at rest. */
  settle(): void {
    for (let i = 0; i < this.size; i++) {
      if (this.live[i] === 1) this.jump(i, this.target[i] ?? 0);
    }
  }

  /** Removes `count` springs starting at `start`; the ones after them move down to fill the gap. */
  remove(start: number, count: number): void {
    for (const column of [
      this.value,
      this.position,
      this.velocity,
      this.target,
      this.stiffness,
      this.damping,
    ]) {
      column.copyWithin(start, start + count);
      column.fill(0, this.size - count);
    }
    this.live.copyWithin(start, start + count);
    this.live.fill(0, this.size - count);
    this.liveCount = this.live.reduce((sum, flag) => sum + flag, 0);
  }

  /**
   * Advances to `time`, in ms on a clock of the caller's choosing (the same one in every call). Springs at
   * rest only take note of the time, so a spring aimed afterwards starts from exactly then.
   *
   * Where a spring is depends only on when it was aimed and what time it is now, not on how many calls it
   * took to get here. Two banks given the same aims at the same times therefore agree, on any thread: that
   * is what lets page content follow glass that a worker animates.
   */
  advanceTo(time: number): boolean {
    const elapsed = time - this.clock;
    if (this.liveCount === 0) {
      this.clock = time;
      return false;
    }
    if (elapsed <= 0) return false;
    this.clock = time;
    return this.step(elapsed / 1000);
  }

  /** Makes this bank an exact copy of `other`, which must be the same size. */
  copyFrom(other: SpringBank): void {
    this.value.set(other.value);
    this.position.set(other.position);
    this.velocity.set(other.velocity);
    this.target.set(other.target);
    this.stiffness.set(other.stiffness);
    this.damping.set(other.damping);
    this.live.set(other.live);
    this.liveCount = other.liveCount;
    this.remainder = other.remainder;
    this.clock = other.clock;
    this.constraint = other.constraint;
  }

  /**
   * Advances by `seconds`. Returns whether any value changed, which is one frame longer than `moving`:
   * the step that brings the last spring to rest still has something new to draw.
   */
  step(seconds: number): boolean {
    if (this.liveCount === 0) return false;
    this.remainder += Math.min(Math.max(seconds, 0), MAX_CATCH_UP);
    // The small bias keeps a frame of exactly n sub-steps from rounding down to n - 1.
    const steps = Math.floor(this.remainder / SPRING_STEP + 1e-6);
    this.remainder = Math.max(this.remainder - steps * SPRING_STEP, 0);

    if (this.constraint) return this.stepConstrained(steps, this.constraint);
    for (let i = 0; i < this.size; i++) {
      if (this.live[i] === 0) continue;
      const target = this.target[i] ?? 0;
      const stiffness = this.stiffness[i] ?? 0;
      const damping = this.damping[i] ?? 0;
      let position = this.position[i] ?? 0;
      let velocity = this.velocity[i] ?? 0;
      // Semi-implicit Euler: the velocity first, then the position with the new velocity.
      for (let step = 0; step < steps; step++) {
        velocity += ((target - position) * stiffness - velocity * damping) * SPRING_STEP;
        position += velocity * SPRING_STEP;
      }
      if (Math.abs(target - position) < REST_DISTANCE && Math.abs(velocity) < REST_SPEED) {
        this.jump(i, target);
      } else {
        this.position[i] = position;
        this.velocity[i] = velocity;
        this.value[i] = position + velocity * this.remainder;
      }
    }
    if (this.liveCount === 0) this.remainder = 0;
    return true;
  }

  /** The same steps with the constraint applied after each: springs can then depend on one another. */
  private stepConstrained(steps: number, constraint: SpringConstraint): boolean {
    const { position, velocity, target, stiffness, damping, live, value, spare, before, size } = this;
    before.set(position);
    for (let step = 0; step < steps; step++) {
      for (let i = 0; i < size; i++) {
        if (live[i] === 0) continue;
        const speed =
          (velocity[i] ?? 0) +
          (((target[i] ?? 0) - (position[i] ?? 0)) * (stiffness[i] ?? 0) -
            (velocity[i] ?? 0) * (damping[i] ?? 0)) *
            SPRING_STEP;
        velocity[i] = speed;
        position[i] = (position[i] ?? 0) + speed * SPRING_STEP;
      }
      constraint(position, velocity);
    }
    for (let i = 0; i < size; i++) {
      if (live[i] === 0) continue;
      value[i] = (position[i] ?? 0) + (velocity[i] ?? 0) * this.remainder;
    }
    // What is drawn is carried a little past the last sub-step: that may not cross what the steps may not.
    spare.fill(0);
    constraint(value, spare);
    let free = 0;
    for (let i = 0; i < size; i++) {
      if (live[i] === 0) continue;
      if (
        Math.abs((target[i] ?? 0) - (position[i] ?? 0)) < REST_DISTANCE &&
        Math.abs(velocity[i] ?? 0) < REST_SPEED
      ) {
        this.jump(i, target[i] ?? 0);
      } else if (steps === 0 || velocity[i] !== 0 || position[i] !== before[i]) {
        free++;
      }
    }
    // Every spring still counted as moving has been held against the constraint for this whole step, with no
    // speed left (aimed past what it allows), and nothing else moves that could let it go: they stop where
    // they are, or the bank would count as moving for ever.
    if (free === 0) {
      for (let i = 0; i < size; i++) {
        if (live[i] === 1) this.jump(i, position[i] ?? 0);
      }
    }
    if (this.liveCount === 0) this.remainder = 0;
    return true;
  }
}
