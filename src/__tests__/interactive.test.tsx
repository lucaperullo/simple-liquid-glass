/** @jest-environment jsdom */
import React from 'react';
import { render, act } from '@testing-library/react';
import { usePointerElastic } from '../interactive';

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
