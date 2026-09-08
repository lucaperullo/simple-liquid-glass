/** @jest-environment jsdom */
import React, { createRef } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { LiquidGlass, LiquidGlassHandle } from '../index';
import { useMirrorEngine } from '../core/mirrorEngine';

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

function Mirror({ selector }: { selector: string }) {
  const lens = React.useRef<HTMLDivElement>(null);
  const holder = React.useRef<HTMLDivElement>(null);
  const active = useMirrorEngine({ enabled: true, containerRef: lens, holderRef: holder, backdropSelector: selector });
  return <div ref={lens} data-active={active}><div ref={holder} data-testid="holder" /></div>;
}

test('invalid backdrop selector falls back without crashing', () => {
  expect(() => render(<Mirror selector="[" />)).not.toThrow();
});

test('mirror clone is inert and does not duplicate document IDs', async () => {
  const source = document.createElement('section');
  source.id = 'backdrop';
  source.innerHTML = '<button id="action" onclick="alert(1)">Hello</button>';
  document.body.append(source);
  try {
    const { getByTestId, unmount } = render(<Mirror selector="#backdrop" />);
    const holder = getByTestId('holder');
    const clone = holder.firstElementChild!;
    expect(clone.hasAttribute('inert')).toBe(true);
    expect(document.querySelectorAll('#action')).toHaveLength(1);
    expect(clone.querySelector('button')?.hasAttribute('onclick')).toBe(false);
    await act(async () => { source.querySelector('button')!.textContent = 'Updated'; await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(holder.textContent).toBe('Updated');
    unmount();
    expect(holder.childNodes).toHaveLength(0);
  } finally { source.remove(); }
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

test('mirror preserves a backdrop styled through its ID after isolating clone IDs', () => {
  const style = document.createElement('style');
  style.textContent = '#styled-scene { background-color: rgb(20, 100, 150); color: rgb(10, 30, 50); padding: 32px; font-size: 25px; }';
  const source = document.createElement('section');
  source.id = 'styled-scene'; source.textContent = 'Backdrop';
  document.head.append(style); document.body.append(source);
  try {
    const { getByTestId } = render(<Mirror selector="#styled-scene" />);
    const clone = getByTestId('holder').firstElementChild!;
    expect(getComputedStyle(clone).backgroundColor).toBe(getComputedStyle(source).backgroundColor);
    expect(getComputedStyle(clone).padding).toBe('32px');
    expect(getComputedStyle(clone).fontSize).toBe('25px');
    expect(document.querySelectorAll('#styled-scene')).toHaveLength(1);
  } finally { cleanup(); source.remove(); style.remove(); }
});
