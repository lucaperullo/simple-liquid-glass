import React from 'react';
import { renderToString } from 'react-dom/server';
import { LiquidGlass } from '../index';

test('server rendering is deterministic with forced text color', () => {
  const render = () => renderToString(<LiquidGlass autoTextColor forceTextColor>Content</LiquidGlass>);
  expect(render()).toBe(render());
});

test('web component entry can be imported without a DOM', () => {
  expect(() => require('../web-component')).not.toThrow();
});
