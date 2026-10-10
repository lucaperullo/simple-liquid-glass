/** @jest-environment jsdom */
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server.node';
import { LiquidGlass } from '../index';

// Keep every WebGL engine pending so the gate can be observed; tests flip status explicitly.
const statuses: Array<(s: string) => void> = [];
jest.mock('../core/webgl/runtime', () => ({
  createWebGLEngine: (_p: unknown, _h: unknown, _s: unknown, _o: unknown, status: (s: string) => void) => {
    statuses.push(status);
    return { update() {}, refresh: async () => {}, destroy() {} };
  }
}));

beforeEach(() => {
  jest.useFakeTimers();
  global.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as any;
  document.body.insertAdjacentHTML('beforeend', '<div id="scene"></div>');
});
afterEach(() => { cleanup(); jest.useRealTimers(); document.getElementById('scene')?.remove(); statuses.length = 0; });

const opacity = (root: HTMLElement) => (root.querySelector('[data-liquid-glass]') as HTMLElement).style.opacity;

test('server-rendered glass shows at once; client-mounted glass waits for its renderer', () => {
  const page = <LiquidGlass refraction="classic" backdropSelector="#scene">Nav</LiquidGlass>;
  const container = document.body.appendChild(document.createElement('div'));
  container.innerHTML = renderToString(page);
  render(page, { container, hydrate: true });
  expect(opacity(container)).not.toBe('0');
  act(() => { jest.advanceTimersByTime(400); });
  expect(opacity(container)).not.toBe('0');

  const toast = render(<LiquidGlass refraction="classic" backdropSelector="#scene">Toast</LiquidGlass>);
  expect(opacity(toast.container)).toBe('0');
  act(() => statuses[statuses.length - 1]('active'));
  expect(opacity(toast.container)).not.toBe('0');
});

test('a slow renderer is revealed after the safety timeout', () => {
  {
    const toast = render(<LiquidGlass refraction="classic" backdropSelector="#scene">Toast</LiquidGlass>);
    expect(opacity(toast.container)).toBe('0');
    act(() => { jest.advanceTimersByTime(400); });
    expect(opacity(toast.container)).not.toBe('0');
  }
});

test('reveal="immediate" and unusable backdrops never hide content', () => {
  {
    expect(opacity(render(<LiquidGlass refraction="classic" backdropSelector="#scene" reveal="immediate" />).container)).not.toBe('0');
    expect(opacity(render(<LiquidGlass refraction="classic" backdropSelector="#absent" />).container)).not.toBe('0');
  }
});
