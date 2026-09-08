/** @jest-environment jsdom */
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { DisplacementFilter } from '../core/DisplacementFilter';
afterEach(cleanup);
const props = { filterId: 'test', displacementDataUri: 'data:image/svg+xml,test', resolvedQuality: 'high' as const, feBlurStdDev: 0, config: { scale: 12, dispersion: 2, aberrationIntensity: 0, x: 'R' as const, y: 'B' as const } };
test('zero dispersion uses one displacement pass and no zero-radius blur', () => {
  const { container } = render(<DisplacementFilter {...props} />);
  expect(container.querySelectorAll('feDisplacementMap')).toHaveLength(1);
  expect(container.querySelectorAll('feGaussianBlur')).toHaveLength(0);
});
test('color separation keeps RGB passes and an explicit blur', () => {
  const { container } = render(<DisplacementFilter {...props} feBlurStdDev={2} config={{...props.config, aberrationIntensity: .5}} />);
  expect(container.querySelectorAll('feDisplacementMap')).toHaveLength(3);
  expect(container.querySelector('feGaussianBlur')?.getAttribute('stdDeviation')).toBe('2');
});

test('sized maps fill the control and retain neutral sampling beyond its edges', () => {
  const { container } = render(<DisplacementFilter {...props} width={400} height={80} />);
  const filter = container.querySelector('filter')!;
  expect(filter.getAttribute('filterUnits')).toBe('userSpaceOnUse');
  expect(Number(filter.getAttribute('x'))).toBeLessThan(0);
  expect(Number(filter.getAttribute('width'))).toBeGreaterThan(400);
  expect(container.querySelector('feImage')?.getAttribute('width')).toBe('400');
  expect(container.querySelector('feImage')?.getAttribute('preserveAspectRatio')).toBe('none');
  expect(container.querySelector('feFlood')?.getAttribute('flood-color')).toBe('rgb(128,128,128)');
});

test('licensed native material uses RG refraction and its blue-channel sheen', () => {
  const { container } = render(<DisplacementFilter {...props} neutralMap width={400} height={80} config={{...props.config, dispersion: .32, aberrationIntensity: 1}} />);
  const passes = [...container.querySelectorAll('feDisplacementMap')];
  expect(passes).toHaveLength(3);
  passes.forEach(pass => expect(pass.getAttribute('yChannelSelector')).toBe('G'));
  expect(Number(passes[0].getAttribute('scale'))).toBeCloseTo(12 * (1 + .22 * .32));
  expect(Number(passes[1].getAttribute('scale'))).toBeCloseTo(12 * (1 + .11 * .32));
  expect(container.querySelector('[result="sheenMask"]')).not.toBeNull();
});
