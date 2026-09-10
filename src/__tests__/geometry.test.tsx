/** @jest-environment jsdom */
import React from 'react';
import { render, act } from '@testing-library/react';
import { useGeometry } from '../core/useGeometry';

function Fixture() {
  const ref = React.useRef<HTMLDivElement>(null);
  const { dimensions } = useGeometry(ref);
  return <div ref={ref} data-testid="lens">{dimensions.width}x{dimensions.height}</div>;
}

test('lens geometry uses layout size instead of entrance-animation scale', () => {
  let resize: () => void = () => {};
  global.ResizeObserver = class {
    constructor(callback: () => void) { resize = callback; }
    observe() {} disconnect() {}
  } as any;
  const width = jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
  const height = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(48);
  const rect = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 50, height: 12 } as DOMRect);
  try {
    const { getByTestId, unmount } = render(<Fixture />);
    expect(getByTestId('lens').textContent).toBe('200x48');
    width.mockReturnValue(240);
    act(() => resize());
    expect(getByTestId('lens').textContent).toBe('240x48');
    unmount();
  } finally { width.mockRestore(); height.mockRestore(); rect.mockRestore(); }
});


test('WebGL visibility is not ready until the first intersection result', () => {
  const original = global.IntersectionObserver;
  let notify: (entries: any[]) => void = () => {};
  global.IntersectionObserver = class {
    constructor(callback: (entries: any[]) => void) { notify = callback; }
    observe() {} disconnect() {}
  } as any;
  function Visible() {
    const ref = React.useRef<HTMLDivElement>(null);
    const { isVisible, visibilityReady } = useGeometry(ref);
    return <div ref={ref} data-testid="visibility">{String(visibilityReady && isVisible)}</div>;
  }
  try {
    const { getByTestId, unmount } = render(<Visible />);
    expect(getByTestId('visibility').textContent).toBe('false');
    act(() => notify([{ isIntersecting: false }]));
    expect(getByTestId('visibility').textContent).toBe('false');
    act(() => notify([{ isIntersecting: true }]));
    expect(getByTestId('visibility').textContent).toBe('true');
    unmount();
  } finally { global.IntersectionObserver = original; }
});
