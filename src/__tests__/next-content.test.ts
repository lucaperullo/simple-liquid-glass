import { ContentFollower } from '../next/content';
import { SpringBank } from '../next/springs';

interface Played {
  keyframes: { transform: string }[];
  options: KeyframeAnimationOptions;
  startTime: number;
  cancelled: boolean;
}

/** An element that records what it is asked to animate. */
function fakeElement(): {
  element: HTMLElement;
  played: Played[];
  style: { transform: string; width: string; height: string };
} {
  const played: Played[] = [];
  const style = { transform: '', width: '', height: '' };
  const element = {
    style,
    animate(keyframes: { transform: string }[], options: KeyframeAnimationOptions) {
      const animation = {
        keyframes,
        options,
        startTime: 0,
        cancelled: false,
        onfinish: null,
        cancel: () => (animation.cancelled = true),
      };
      played.push(animation);
      return animation;
    },
  };
  return { element: element as unknown as HTMLElement, played, style };
}

const at = (x: number, y: number, width = 100, height = 100) => ({ x, y, width, height });
const yOf = (keyframe: { transform: string } | undefined): number =>
  Number(/, (-?[\d.]+)px\)/.exec(keyframe?.transform ?? '')?.[1]);
const spring = { stiffness: 170, damping: 18 };
const origin = performance.timeOrigin;

describe('next: content that follows a shape', () => {
  it('is put in place without an animation the first time, and when there is no spring', () => {
    const { element, played, style } = fakeElement();
    const follower = new ContentFollower(element);
    follower.moveTo(at(16, 40), origin + 1000, spring, 0);
    expect(style.transform).toBe('translate(16.000px, 40.000px)');
    follower.moveTo(at(16, 90), origin + 2000, null, 0);
    expect(style.transform).toBe('translate(16.000px, 90.000px)');
    expect(played).toEqual([]);
  });

  it("hands the compositor the path the renderer's spring takes, starting when the change was made", () => {
    const { element, played } = fakeElement();
    const follower = new ContentFollower(element);
    follower.moveTo(at(0, 40), origin + 1000, null, 0);
    follower.moveTo(at(0, 340), origin + 5000, spring, 0);

    const [animation] = played;
    expect(animation?.startTime).toBeCloseTo(5000, 6);
    expect(animation?.options).toMatchObject({ easing: 'linear', fill: 'both' });
    expect(yOf(animation?.keyframes[0])).toBe(40);
    expect(yOf(animation?.keyframes.at(-1))).toBe(340);
    expect(animation?.options.duration).toBeCloseTo(
      ((animation?.keyframes.length ?? 0) - 1) * (1000 / 120),
      6,
    );

    // Keyframe n is where a spring aimed at the same moment is n frames later.
    const bank = new SpringBank(1);
    bank.advanceTo(origin + 5000);
    bank.aim(0, 340, spring.stiffness, spring.damping);
    bank.jump(0, 40);
    bank.aim(0, 340, spring.stiffness, spring.damping);
    bank.advanceTo(origin + 5000 + 24 * (1000 / 120));
    // (To a fraction of a pixel: the two may sit either side of one of the spring's sub-steps.)
    expect(Math.abs(yOf(animation?.keyframes[24]) - (bank.value[0] ?? 0))).toBeLessThan(0.3);
  });

  it('starts earlier by the lead it is given', () => {
    const { element, played } = fakeElement();
    const follower = new ContentFollower(element);
    follower.moveTo(at(0, 0), origin + 1000, null, 0);
    follower.moveTo(at(0, 100), origin + 2000, spring, 8);
    expect(played[0]?.startTime).toBeCloseTo(1992, 6);
  });

  it('carries on from where it is when the shape is sent somewhere else mid-flight', () => {
    const { element, played } = fakeElement();
    const follower = new ContentFollower(element);
    follower.moveTo(at(0, 0), origin + 1000, null, 0);
    follower.moveTo(at(0, 300), origin + 2000, spring, 0);
    follower.moveTo(at(0, 0), origin + 2100, spring, 0);

    expect(played).toHaveLength(2);
    expect(played[0]?.cancelled).toBe(true);
    // 100 ms is twelve frames into the first path.
    expect(Math.abs(yOf(played[1]?.keyframes[0]) - yOf(played[0]?.keyframes[12]))).toBeLessThan(0.3);
    expect(yOf(played[1]?.keyframes.at(-1))).toBe(0);
  });

  describe('with a window, for a shape that changes size', () => {
    const xy = (keyframe: { transform: string } | undefined): [number, number] => {
      const found = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(keyframe?.transform ?? '');
      return [Number(found?.[1]), Number(found?.[2])];
    };

    it("puts the window's bottom-right corner and the content's top-left corner on the shape's", () => {
      const content = fakeElement();
      const clip = fakeElement();
      const follower = new ContentFollower(content.element, clip.element);
      follower.moveTo(at(16, 40, 150.5, 136), origin + 1000, spring, 0);
      expect(clip.style.width).toBe('151px');
      expect(clip.style.height).toBe('136px');
      // The window ends at 16 + 150.5 and 40 + 136; the content, inside it, starts at 16 and 40.
      expect(clip.style.transform).toBe('translate(15.500px, 40.000px)');
      expect(content.style.transform).toBe('translate(0.500px, 0.000px)');
    });

    it('moves the two against each other along the spring, in one pair of animations', () => {
      const content = fakeElement();
      const clip = fakeElement();
      const follower = new ContentFollower(content.element, clip.element);
      follower.moveTo(at(16, 40, 150, 136), origin + 1000, null, 0);
      follower.moveTo(at(16, 40, 330, 560), origin + 2000, spring, 0);

      const [pane] = clip.played;
      const [inner] = content.played;
      expect(pane?.startTime).toBeCloseTo(2000, 6);
      expect(inner?.startTime).toBeCloseTo(2000, 6);
      expect(inner?.keyframes).toHaveLength(pane?.keyframes.length ?? 0);
      // The window holds the largest size on the path: a spring this loose overshoots.
      const width = parseFloat(clip.style.width);
      const height = parseFloat(clip.style.height);
      expect(width).toBeGreaterThan(330);
      expect(height).toBeGreaterThan(560);

      // Where the spring is 24 frames on.
      const bank = new SpringBank(1);
      bank.advanceTo(origin + 2000);
      bank.aim(0, 330, 0, 0);
      bank.jump(0, 150);
      bank.aim(0, 330, spring.stiffness, spring.damping);
      bank.advanceTo(origin + 2000 + 24 * (1000 / 120));
      const shapeRight = 16 + (bank.value[0] ?? 0);

      (pane?.keyframes ?? []).forEach((keyframe, index) => {
        const [windowX, windowY] = xy(keyframe);
        const [innerX, innerY] = xy(inner?.keyframes[index]);
        // The content's corner never leaves the shape's...
        expect(windowX + innerX).toBeCloseTo(16, 2);
        expect(windowY + innerY).toBeCloseTo(40, 2);
        // ...and the content never shows outside the window's left or top.
        expect(innerX).toBeGreaterThanOrEqual(0);
        expect(innerY).toBeGreaterThanOrEqual(0);
      });
      expect(Math.abs(xy(pane?.keyframes[24])[0] + width - shapeRight)).toBeLessThan(0.3);
      expect(xy(pane?.keyframes.at(-1))).toEqual([16 + 330 - width, 40 + 560 - height]);
    });

    it('keeps its window when the shape shrinks, and stops both animations', () => {
      const content = fakeElement();
      const clip = fakeElement();
      const follower = new ContentFollower(content.element, clip.element);
      follower.moveTo(at(0, 0, 300, 300), origin + 1000, null, 0);
      follower.moveTo(at(0, 0, 100, 100), origin + 2000, spring, 0);
      expect(clip.style.width).toBe('300px');
      expect(xy(clip.played[0]?.keyframes.at(-1))).toEqual([-200, -200]);
      expect(xy(content.played[0]?.keyframes.at(-1))).toEqual([200, 200]);
      follower.stop();
      expect(clip.played[0]?.cancelled).toBe(true);
      expect(content.played[0]?.cancelled).toBe(true);
    });
  });
});
