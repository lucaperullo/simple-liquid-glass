import { ContentFollower } from '../next/content';
import { SpringBank } from '../next/springs';

interface Played {
  keyframes: { transform: string }[];
  options: KeyframeAnimationOptions;
  startTime: number;
  cancelled: boolean;
}

/** An element that records what it is asked to animate. */
function fakeElement(): { element: HTMLElement; played: Played[]; style: { transform: string } } {
  const played: Played[] = [];
  const style = { transform: '' };
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

const yOf = (keyframe: { transform: string } | undefined): number =>
  Number(/, (-?[\d.]+)px\)/.exec(keyframe?.transform ?? '')?.[1]);
const spring = { stiffness: 170, damping: 18 };
const origin = performance.timeOrigin;

describe('next: content that follows a shape', () => {
  it('is put in place without an animation the first time, and when there is no spring', () => {
    const { element, played, style } = fakeElement();
    const follower = new ContentFollower(element);
    follower.moveTo(16, 40, origin + 1000, spring, 0);
    expect(style.transform).toBe('translate(16.000px, 40.000px)');
    follower.moveTo(16, 90, origin + 2000, null, 0);
    expect(style.transform).toBe('translate(16.000px, 90.000px)');
    expect(played).toEqual([]);
  });

  it("hands the compositor the path the renderer's spring takes, starting when the change was made", () => {
    const { element, played } = fakeElement();
    const follower = new ContentFollower(element);
    follower.moveTo(0, 40, origin + 1000, null, 0);
    follower.moveTo(0, 340, origin + 5000, spring, 0);

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
    follower.moveTo(0, 0, origin + 1000, null, 0);
    follower.moveTo(0, 100, origin + 2000, spring, 8);
    expect(played[0]?.startTime).toBeCloseTo(1992, 6);
  });

  it('carries on from where it is when the shape is sent somewhere else mid-flight', () => {
    const { element, played } = fakeElement();
    const follower = new ContentFollower(element);
    follower.moveTo(0, 0, origin + 1000, null, 0);
    follower.moveTo(0, 300, origin + 2000, spring, 0);
    follower.moveTo(0, 0, origin + 2100, spring, 0);

    expect(played).toHaveLength(2);
    expect(played[0]?.cancelled).toBe(true);
    // 100 ms is twelve frames into the first path.
    expect(Math.abs(yOf(played[1]?.keyframes[0]) - yOf(played[0]?.keyframes[12]))).toBeLessThan(0.3);
    expect(yOf(played[1]?.keyframes.at(-1))).toBe(0);
  });
});
