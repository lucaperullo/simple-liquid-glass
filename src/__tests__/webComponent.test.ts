/** @jest-environment jsdom */
import { defineLiquidGlass } from '../web-component';

test('supports multiple custom tag names', () => {
  expect(() => { defineLiquidGlass('test-glass-one'); defineLiquidGlass('test-glass-two'); }).not.toThrow();
  expect(document.createElement('test-glass-one').shadowRoot).not.toBeNull();
});

test('border color is treated as CSS, never HTML', () => {
  const el = document.createElement('liquid-glass');
  el.setAttribute('border-color', '</style><img src=x onerror="alert(1)"><style>');
  document.body.append(el);
  expect(el.shadowRoot?.querySelector('img')).toBeNull();
  el.remove();
});
