/** @jest-environment jsdom */
import React from 'react';
import { render } from '@testing-library/react';
import { LiquidGlass } from '../index';

test('material tint applies, explicit tint wins, and removing material restores defaults', () => {
  const {container, rerender} = render(<LiquidGlass material="smoked" effectMode="off" />);
  const layer = () => container.querySelector('[data-liquid-glass]')!.firstElementChild as HTMLElement;
  expect(layer().style.background).toBe('rgba(20, 24, 32, 0.35)');
  rerender(<LiquidGlass material="smoked" glassColor="rgba(100, 50, 0, 0.2)" effectMode="off" />);
  expect(layer().style.background).toBe('rgba(100, 50, 0, 0.2)');
  rerender(<LiquidGlass effectMode="off" />);
  expect(layer().style.background).toBe('rgba(255, 255, 255, 0.4)');
  expect(container.querySelector('[material]')).toBeNull();
});
