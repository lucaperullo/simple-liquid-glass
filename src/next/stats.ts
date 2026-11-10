import type { FrameStats } from './scene';

/** How many frame intervals a reading can cover; older ones are overwritten. Five seconds at 120 Hz. */
const CAPACITY = 600;

/** Frame cadence between readings, kept in a fixed buffer so recording a frame allocates nothing. */
export class FrameMeter {
  private readonly intervals = new Float32Array(CAPACITY);
  private written = 0;
  private frames = 0;
  private drawTime = 0;
  private scrollSamples = 0;
  private scrollError = 0;
  private scrollErrorMax = 0;

  /**
   * Records a drawn frame. `interval` is the time since the previous frame, or 0 when this frame is the
   * first after a rest (a pause is not a slow frame).
   */
  record(interval: number, drawTime: number): void {
    this.frames++;
    this.drawTime += drawTime;
    if (interval > 0) this.intervals[this.written++ % CAPACITY] = interval;
  }

  /** Records how far a predicted scroll position was from the sample that followed, CSS px. */
  recordScrollError(error: number): void {
    this.scrollSamples++;
    this.scrollError += error;
    this.scrollErrorMax = Math.max(this.scrollErrorMax, error);
  }

  /** The cadence since the previous reading. */
  read(): FrameStats {
    const sorted = this.intervals.slice(0, Math.min(this.written, CAPACITY)).sort();
    const count = sorted.length;
    const total = sorted.reduce((sum, interval) => sum + interval, 0);
    const stats: FrameStats = {
      frames: this.frames,
      fps: total > 0 ? round((1000 * count) / total, 1) : 0,
      p50: round(sorted[count >> 1] ?? 0, 1),
      p95: round(sorted[Math.max(Math.ceil(count * 0.95) - 1, 0)] ?? 0, 1),
      drawMs: this.frames > 0 ? round(this.drawTime / this.frames, 2) : 0,
      scrollError: this.scrollSamples > 0 ? round(this.scrollError / this.scrollSamples, 2) : 0,
      scrollErrorMax: round(this.scrollErrorMax, 2),
    };
    this.scrollSamples = 0;
    this.scrollError = 0;
    this.scrollErrorMax = 0;
    this.written = 0;
    this.frames = 0;
    this.drawTime = 0;
    return stats;
  }
}

function round(value: number, digits: number): number {
  const unit = 10 ** digits;
  return Math.round(value * unit) / unit;
}
