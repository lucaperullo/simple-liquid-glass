/**
 * Page content that stays on a shape. The glass is animated by the renderer, usually in a worker, on its own
 * frames; an element moved from the page thread would trail it wherever the page's frames are slower than the
 * display's. So the element is moved by the browser's compositor instead: the same spring is run here ahead
 * of time, and its path is handed over as a keyframe animation that starts at the moment the glass's does.
 *
 * A shape that changes size. The compositor moves elements; it does not lay them out. So the content is cut
 * off at the shape's right and bottom edges by a window around it, an element that hides what overflows it,
 * and the two are moved against each other: the window so that its bottom-right corner is the shape's, the
 * content back by as much so that its top-left corner is the shape's. Only translations, so nothing is
 * scaled or drawn again; what the content looks like at each size is the application's to lay out.
 */
import type { SpringConfig } from './scene';
import { SpringBank } from './springs';

/** Time between keyframes, ms: one per frame of a 120 Hz display. */
const SAMPLE = 1000 / 120;

/** The longest path handed over, in keyframes: four seconds. */
const MAX_KEYFRAMES = 480;

/** The part of a shape's box that content follows. */
export interface ContentBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const place = (x: number, y: number): string => `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)`;

export class ContentFollower {
  /** The springs the renderer is running for the shape's box, kept in step with them by time alone. */
  private readonly springs: SpringBank;
  private readonly ahead: SpringBank;
  /** How many of x, y, width, height are followed: the size only matters to a window. */
  private readonly count: number;
  private animations: Animation[] = [];
  private placed = false;
  /** The window's own size, CSS px. It only grows: it has to hold the largest box the shape has been. */
  private windowWidth = 0;
  private windowHeight = 0;

  /**
   * `element` is kept at the shape's top-left corner. With `clip`, its parent, it is also cut off at the
   * shape's right and bottom edges.
   */
  constructor(
    private readonly element: HTMLElement,
    private readonly clip: HTMLElement | null = null,
  ) {
    this.count = clip ? 4 : 2;
    this.springs = new SpringBank(this.count);
    this.ahead = new SpringBank(this.count);
  }

  /**
   * Sends the content to `box` as of `time` (ms on the shared clock), the way the shape goes there: by
   * `spring`, or at once without one. `lead` (ms) starts it that much earlier than the glass, for a display
   * pipeline that shows the two a constant time apart.
   */
  moveTo(box: ContentBox, time: number, spring: SpringConfig | null, lead: number): void {
    const { springs, ahead, count } = this;
    const target = [box.x, box.y, box.width, box.height];
    const jump = spring === null || !this.placed;
    this.placed = true;
    springs.advanceTo(time);
    for (let index = 0; index < count; index++) {
      springs.aim(index, target[index] ?? 0, jump ? 0 : spring.stiffness, jump ? 0 : spring.damping);
    }
    if (!springs.moving) {
      this.stop();
      this.fit(box.width, box.height);
      this.put(box);
      return;
    }

    // Run the springs to their end on a copy, noting where they are at each frame.
    ahead.copyFrom(springs);
    const path: ContentBox[] = [];
    let widest = box.width;
    let tallest = box.height;
    while (ahead.moving && path.length < MAX_KEYFRAMES) {
      ahead.advanceTo(time + path.length * SAMPLE);
      const [x = box.x, y = box.y, width = box.width, height = box.height] = ahead.value;
      path.push({ x, y, width, height });
      widest = Math.max(widest, width);
      tallest = Math.max(tallest, height);
    }
    path.push(box);
    // Before the keyframes are written: they are measured from the window's size.
    this.fit(widest, tallest);

    const timing: KeyframeAnimationOptions = {
      duration: (path.length - 1) * SAMPLE,
      easing: 'linear',
      // `both`: the first keyframe shows until the start time comes round, the last one after the end.
      fill: 'both',
    };
    const animations = this.targets().map(({ element, transform }) => {
      const animation = element.animate(
        path.map((at) => ({ transform: transform(at) })),
        timing,
      );
      // The document's timeline counts from the page's time origin, like `performance.now()`.
      animation.startTime = time - performance.timeOrigin - lead;
      return animation;
    });
    const [first] = animations;
    if (first) {
      first.onfinish = () => {
        if (this.animations !== animations) return;
        this.put(box);
        this.stop();
      };
    }
    this.stop();
    this.animations = animations;
  }

  stop(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
  }

  /** The elements moved, and where each goes for a box. */
  private targets(): { element: HTMLElement; transform: (box: ContentBox) => string }[] {
    const { element, clip } = this;
    if (!clip) return [{ element, transform: (box) => place(box.x, box.y) }];
    const { windowWidth, windowHeight } = this;
    return [
      {
        element: clip,
        transform: (box) => place(box.x + box.width - windowWidth, box.y + box.height - windowHeight),
      },
      { element, transform: (box) => place(windowWidth - box.width, windowHeight - box.height) },
    ];
  }

  private put(box: ContentBox): void {
    for (const { element, transform } of this.targets()) element.style.transform = transform(box);
  }

  /** Makes the window large enough for a box of this size. */
  private fit(width: number, height: number): void {
    const { clip } = this;
    if (!clip || (width <= this.windowWidth && height <= this.windowHeight)) return;
    this.windowWidth = Math.max(this.windowWidth, Math.ceil(width));
    this.windowHeight = Math.max(this.windowHeight, Math.ceil(height));
    clip.style.width = `${this.windowWidth}px`;
    clip.style.height = `${this.windowHeight}px`;
  }
}
