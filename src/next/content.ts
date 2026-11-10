/**
 * Page content that stays on a shape. The glass is animated by the renderer, usually in a worker, on its own
 * frames; an element moved from the page thread would trail it wherever the page's frames are slower than the
 * display's. So the element is moved by the browser's compositor instead: the same springs are run here ahead
 * of time, and their path is handed over as a keyframe animation that starts at the moment the glass's does.
 *
 * A shape that changes size. The compositor moves elements; it does not lay them out. So the content is cut
 * off at the shape's right and bottom edges by a window around it, an element that hides what overflows it,
 * and the two are moved against each other: the window so that its bottom-right corner is the shape's, the
 * content back by as much so that its top-left corner is the shape's. Only translations, so nothing is
 * scaled or drawn again; what the content looks like at each size is the application's to lay out.
 */
import type { Rect, SpringConfig } from './scene';
import { SpringBank, keepInside } from './springs';

/** Time between keyframes, ms: one per frame of a 120 Hz display. */
const SAMPLE = 1000 / 120;

/** The longest path handed over, in frames: four seconds. */
const MAX_KEYFRAMES = 480;

/**
 * How far the path handed over may be from the springs' own, CSS px. Most frames of a spring's path lie on a
 * line between their neighbours to within this, and are left out: the browser parses and ships every
 * keyframe it is given, and while a shape is dragged it is given a new path on every frame.
 */
const TOLERANCE = 0.1;

/**
 * A path already playing is kept when the shape is sent this little further, CSS px: a card tugged along by
 * a dragged neighbour gets a new place on every pointer event, most of them a fraction of a pixel on.
 */
const SAME_PLACE = 0.3;

/** The part of a shape's box that content follows. */
export interface ContentBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const place = (x: number, y: number): string => `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)`;

export class ContentFollower {
  /**
   * The springs the renderer is running for the shape's box, in the renderer's own terms (the centre's x and
   * y, half the width, half the height), kept in step with them by time alone.
   */
  private readonly springs = new SpringBank(4);
  private readonly ahead = new SpringBank(4);
  private animations: Animation[] = [];
  private placed = false;
  private lead = 0;
  /** Where the path now playing was planned to end, as the springs' four targets. */
  private planned: number[] = [];
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
  ) {}

  /**
   * Sends the content to `box` as of `time` (ms on the shared clock), the way the shape goes there: by
   * `spring`, or at once without one. `lead` (ms) starts it that much earlier than the glass, for a display
   * pipeline that shows the two a constant time apart.
   */
  moveTo(box: ContentBox, time: number, spring: SpringConfig | null, lead: number): void {
    const { springs } = this;
    const target = [box.x + box.width / 2, box.y + box.height / 2, box.width / 2, box.height / 2];
    const jump = spring === null || !this.placed;
    this.placed = true;
    this.lead = lead;
    springs.advanceTo(time);
    target.forEach((value, index) => {
      springs.aim(index, value, jump ? 0 : spring.stiffness, jump ? 0 : spring.damping);
    });
    // The springs always take the new aim (they keep step with the renderer's); the path handed over is only
    // planned again when the new aim would show.
    const near =
      !jump &&
      this.animations.length > 0 &&
      target.every((value, index) => Math.abs(value - (this.planned[index] ?? Infinity)) < SAME_PLACE);
    if (near) return;
    this.planned = target;
    this.play(time);
  }

  /**
   * The walls the layer's shapes may not pass (see `GlassLayer.setBounds`), as of `time`. `replan: false` when
   * a `moveTo` for the same moment follows, which plans the path anyway.
   */
  bound(bounds: Rect | null, time: number, replan = true): void {
    const { springs } = this;
    springs.advanceTo(time);
    if (bounds) {
      const { left, top } = bounds;
      const right = left + bounds.width;
      const bottom = top + bounds.height;
      springs.constraint = (position, velocity) => {
        keepInside(position, velocity, 0, left, top, right, bottom);
      };
    } else {
      springs.constraint = null;
    }
    // The path already handed over was planned for the old walls.
    if (replan && springs.moving) this.play(time);
  }

  stop(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
  }

  /** Hands the compositor the way from where the springs are at `time` to where they come to rest. */
  private play(time: number): void {
    const { springs, ahead } = this;
    if (!springs.moving) {
      const box = boxOf(springs.value);
      this.stop();
      this.fit(box.width, box.height);
      this.put(box);
      return;
    }

    // Run the springs to their end on a copy, noting where they are at each frame.
    ahead.copyFrom(springs);
    const path: ContentBox[] = [];
    let widest = 0;
    let tallest = 0;
    while (ahead.moving && path.length < MAX_KEYFRAMES) {
      ahead.advanceTo(time + path.length * SAMPLE);
      const box = boxOf(ahead.value);
      path.push(box);
      widest = Math.max(widest, box.width);
      tallest = Math.max(tallest, box.height);
    }
    const end = boxOf(ahead.value);
    path.push(end);
    // Before the keyframes are written: they are measured from the window's size.
    this.fit(Math.max(widest, end.width), Math.max(tallest, end.height));

    const timing: KeyframeAnimationOptions = {
      duration: (path.length - 1) * SAMPLE,
      easing: 'linear',
      // `both`: the first keyframe shows until the start time comes round, the last one after the end.
      fill: 'both',
    };
    const kept = straighten(path);
    const last = Math.max(path.length - 1, 1);
    const animations: Animation[] = [];
    for (const { element, transform } of this.targets()) {
      const keyframes = kept.map((index) => ({
        transform: transform(path[index] ?? end),
        offset: index / last,
      }));
      const [first] = keyframes;
      // An element that stays where it is the whole way (a window whose corner does not move) needs no animation.
      if (first && keyframes.every((keyframe) => keyframe.transform === first.transform)) {
        element.style.transform = first.transform;
        continue;
      }
      const animation = element.animate(keyframes, timing);
      // The document's timeline counts from the page's time origin, like `performance.now()`.
      animation.startTime = time - performance.timeOrigin - this.lead;
      animations.push(animation);
    }
    const [first] = animations;
    if (first) {
      first.onfinish = () => {
        if (this.animations !== animations) return;
        // Where the springs are now, not where this path ended: aims too small to plan again may have come since.
        this.animations = [];
        for (const animation of animations) animation.cancel();
        springs.advanceTo(performance.timeOrigin + performance.now());
        this.play(performance.timeOrigin + performance.now());
      };
    }
    this.stop();
    this.animations = animations;
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

/**
 * The frames of a path worth keeping: the first, the last, and enough between them that every frame left out
 * lies within `TOLERANCE` of the line between its kept neighbours.
 */
function straighten(path: readonly ContentBox[]): number[] {
  const kept = [0];
  let from = 0;
  while (from < path.length - 1) {
    let to = from + 1;
    while (to + 1 < path.length && straight(path, from, to + 1)) to++;
    kept.push(to);
    from = to;
  }
  return kept;
}

/** Whether every frame between `from` and `to` is on the line between them, to within `TOLERANCE`. */
function straight(path: readonly ContentBox[], from: number, to: number): boolean {
  const a = path[from];
  const b = path[to];
  if (!a || !b) return false;
  for (let index = from + 1; index < to; index++) {
    const at = path[index];
    if (!at) return false;
    const share = (index - from) / (to - from);
    if (
      Math.abs(a.x + (b.x - a.x) * share - at.x) > TOLERANCE ||
      Math.abs(a.y + (b.y - a.y) * share - at.y) > TOLERANCE ||
      Math.abs(a.width + (b.width - a.width) * share - at.width) > TOLERANCE ||
      Math.abs(a.height + (b.height - a.height) * share - at.height) > TOLERANCE
    ) {
      return false;
    }
  }
  return true;
}

/** A box from the four springs: centre x and y, half width, half height. */
function boxOf(values: Float64Array): ContentBox {
  const [x = 0, y = 0, halfWidth = 0, halfHeight = 0] = values;
  return { x: x - halfWidth, y: y - halfHeight, width: halfWidth * 2, height: halfHeight * 2 };
}
