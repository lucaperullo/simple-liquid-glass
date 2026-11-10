/**
 * Where the page is scrolled to, for a renderer that cannot ask. The page thread samples its scroll
 * position once per frame of its own, which on a 120 Hz Android phone is every other frame of the display.
 * Between samples the tracker carries the position forward at the last measured speed, so glass that
 * refracts scrolling content is redrawn for every frame of the display and not for every second one.
 */

/** How far past the latest sample a prediction may reach, ms. Two page frames at 60 Hz. */
const HORIZON = 34;

/** A sample older than this says nothing about now: the page thread stalled, or the scroll ended. */
const STALE = 100;

export class ScrollTracker {
  /** The scroll position to draw with, set by `predict`. */
  x = 0;
  y = 0;

  private sampleX = 0;
  private sampleY = 0;
  private sampleTime = 0;
  /** CSS px per ms. */
  private speedX = 0;
  private speedY = 0;
  private lead = 0;

  /**
   * Takes a sample: the position at `time`. `lead` (ms) is added to every prediction, for the time the
   * page thread's idea of the scroll position runs behind what is on screen.
   * Returns how far the prediction for `time` was from the sample (CSS px), or -1 if there was none to check.
   */
  sample(x: number, y: number, time: number, lead: number): number {
    const elapsed = time - this.sampleTime;
    const tracking = this.sampleTime > 0 && elapsed > 0 && elapsed < STALE;
    const error = tracking
      ? Math.hypot(this.sampleX + this.speedX * elapsed - x, this.sampleY + this.speedY * elapsed - y)
      : -1;
    this.speedX = tracking ? (x - this.sampleX) / elapsed : 0;
    this.speedY = tracking ? (y - this.sampleY) / elapsed : 0;
    this.sampleX = x;
    this.sampleY = y;
    this.sampleTime = time;
    this.lead = lead;
    return this.speedX !== 0 || this.speedY !== 0 ? error : -1;
  }

  /** Sets `x` and `y` for a frame shown at `time`. Returns whether the page is still scrolling. */
  predict(time: number): boolean {
    const elapsed = time - this.sampleTime;
    if (elapsed > STALE) {
      this.speedX = 0;
      this.speedY = 0;
    }
    const ahead = Math.min(Math.max(elapsed + this.lead, 0), HORIZON);
    this.x = this.sampleX + this.speedX * ahead;
    this.y = this.sampleY + this.speedY * ahead;
    return this.speedX !== 0 || this.speedY !== 0;
  }
}
