/**
 * Page content that stays on a shape. The glass is animated by the renderer, usually in a worker, on its own
 * frames; an element moved from the page thread would trail it wherever the page's frames are slower than the
 * display's. So the element is moved by the browser's compositor instead: the same spring is run here ahead
 * of time, and its path is handed over as a keyframe animation that starts at the moment the glass's does.
 */
import type { SpringConfig } from './scene';
import { SpringBank } from './springs';

/** Time between keyframes, ms: one per frame of a 120 Hz display. */
const SAMPLE = 1000 / 120;

/** The longest path handed over, in keyframes: four seconds. */
const MAX_KEYFRAMES = 480;

const place = (x: number, y: number): string => `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)`;

export class ContentFollower {
  /** The spring the renderer is running for the shape's corner, kept in step with it by time alone. */
  private readonly springs = new SpringBank(2);
  private readonly ahead = new SpringBank(2);
  private animation: Animation | null = null;
  private placed = false;

  constructor(private readonly element: HTMLElement) {}

  /**
   * Sends the element's corner to (`x`, `y`) as of `time` (ms on the shared clock), the way the shape goes
   * there: by `spring`, or at once without one. `lead` (ms) starts the element that much earlier than the
   * glass, for a display pipeline that shows the two a constant time apart.
   */
  moveTo(x: number, y: number, time: number, spring: SpringConfig | null, lead: number): void {
    const { springs, ahead, element } = this;
    const jump = spring === null || !this.placed;
    this.placed = true;
    springs.advanceTo(time);
    springs.aim(0, x, jump ? 0 : spring.stiffness, jump ? 0 : spring.damping);
    springs.aim(1, y, jump ? 0 : spring.stiffness, jump ? 0 : spring.damping);
    if (!springs.moving) {
      this.animation?.cancel();
      this.animation = null;
      element.style.transform = place(x, y);
      return;
    }

    // Run the spring to its end on a copy, noting where it is at each frame.
    ahead.copyFrom(springs);
    const keyframes: Keyframe[] = [];
    while (ahead.moving && keyframes.length < MAX_KEYFRAMES) {
      ahead.advanceTo(time + keyframes.length * SAMPLE);
      keyframes.push({ transform: place(ahead.value[0] ?? x, ahead.value[1] ?? y) });
    }
    keyframes.push({ transform: place(x, y) });

    const animation = element.animate(keyframes, {
      duration: (keyframes.length - 1) * SAMPLE,
      easing: 'linear',
      // `both`: the first keyframe shows until the start time comes round, the last one after the end.
      fill: 'both',
    });
    // The document's timeline counts from the page's time origin, like `performance.now()`.
    animation.startTime = time - performance.timeOrigin - lead;
    animation.onfinish = () => {
      if (this.animation !== animation) return;
      element.style.transform = place(x, y);
      animation.cancel();
      this.animation = null;
    };
    this.animation?.cancel();
    this.animation = animation;
  }

  stop(): void {
    this.animation?.cancel();
    this.animation = null;
  }
}
