/** @jest-environment jsdom */
import React, { createRef } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { LiquidGlass, LiquidGlassHandle } from '../index';

beforeEach(() => {
  global.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as any;
  global.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 0) as any;
  global.cancelAnimationFrame = id => clearTimeout(id);
});
afterEach(cleanup);

test('off mode removes every backdrop filter and still forwards props and ref', () => {
  const ref = createRef<LiquidGlassHandle>();
  const { getByRole } = render(<LiquidGlass ref={ref} effectMode="off" role="region" aria-label="Panel">Content</LiquidGlass>);
  const el = getByRole('region');
  expect(ref.current?.element).toBe(el);
  expect(ref.current?.getQuality()).toBe('low');
  expect((el.firstElementChild as HTMLElement).style.backdropFilter).toBe('none');
  expect(el.querySelector('filter')).toBeNull();
});

test('mounts without ResizeObserver', () => {
  delete (global as any).ResizeObserver;
  expect(() => render(<LiquidGlass effectMode="off">Content</LiquidGlass>)).not.toThrow();
});

test('strict-mode observer subscriptions are disconnected on unmount', () => {
  const instances: any[] = [];
  global.ResizeObserver = class {
    disconnect = jest.fn(); observe() {} unobserve() {}
    constructor() { instances.push(this); }
  } as any;
  const { unmount } = render(<React.StrictMode><LiquidGlass effectMode="off" /></React.StrictMode>);
  unmount();
  expect(instances.length).toBeGreaterThan(0);
  for (const observer of instances) expect(observer.disconnect).toHaveBeenCalledTimes(1);
});
