/** @jest-environment jsdom */
import React from 'react';
import { render, act } from '@testing-library/react';
import { usePointerElastic } from '../interactive';

afterEach(() => { jest.useRealTimers(); });

function Fixture() {
  const element = React.useRef<HTMLDivElement>(null);
  const handle = React.useRef({ get element() { return element.current; }, getQuality: () => 'low' as const });
  usePointerElastic(handle);
  return <div ref={element} data-testid="glass" style={{ transform: 'scale(0.9)' }} />;
}

test('preserves caller transform and reacts when reduced motion is enabled', () => {
  jest.useFakeTimers();
  let listener: () => void = () => {};
  const media = { matches: false, addEventListener: (_: string, cb: () => void) => { listener = cb; }, removeEventListener: jest.fn() };
  window.matchMedia = jest.fn(() => media) as any;
  global.requestAnimationFrame = cb => setTimeout(() => cb(16), 16) as any;
  global.cancelAnimationFrame = id => clearTimeout(id);
  const { getByTestId, unmount } = render(<Fixture />);
  const el = getByTestId('glass');
  act(() => {
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 80, clientY: 60 }));
    jest.advanceTimersByTime(16);
  });
  expect(el.style.transform).toContain('scale(0.9)');
  act(() => { media.matches = true; listener(); });
  expect(el.style.transform).toBe('scale(0.9)');
  unmount();
  expect(el.style.transform).toBe('scale(0.9)');
  expect(media.removeEventListener).toHaveBeenCalled();
  jest.useRealTimers();
});

test.each([1, 0.5])('pointer target stays stable as the glass moves at scale %s', (scale) => {
  jest.useFakeTimers();
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  global.requestAnimationFrame = cb => setTimeout(() => cb(16), 16) as any;
  global.cancelAnimationFrame = id => clearTimeout(id);
  const { getByTestId, unmount } = render(<Fixture />);
  const el = getByTestId('glass');
  Object.defineProperties(el, { offsetWidth: { value: 200 }, offsetHeight: { value: 100 } });
  const shift = () => Number(el.style.transform.match(/translate\(([-\d.]+)px/)?.[1] ?? 0);
  el.getBoundingClientRect = () => ({ left: 100 + shift() * scale, top: 100, width: 200 * scale, height: 100 * scale }) as DOMRect;
  const move = () => el.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 + 150 * scale, clientY: 100 + 50 * scale }));
  act(() => { move(); jest.advanceTimersByTime(2000); });
  expect(shift()).toBeCloseTo(9, 1);
  act(() => { move(); jest.advanceTimersByTime(2000); });
  expect(shift()).toBeCloseTo(9, 1);
  act(() => { el.dispatchEvent(new MouseEvent('pointerleave')); jest.advanceTimersByTime(2000); });
  expect(shift()).toBe(0);
  unmount();
  jest.useRealTimers();
});
