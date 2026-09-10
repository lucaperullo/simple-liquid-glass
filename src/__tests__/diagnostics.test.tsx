/** @jest-environment jsdom */
import React, {createRef} from 'react';
import {render} from '@testing-library/react';
import {LiquidGlass, type LiquidGlassHandle} from '../index';

test('diagnostics follow mode changes without notifying again for unrelated renders', () => {
  const ref = createRef<LiquidGlassHandle>();
  const onChange = jest.fn();
  const {rerender, container} = render(<LiquidGlass refraction="classic" ref={ref} effectMode="off" onDiagnosticsChange={onChange}/>);
  expect(ref.current?.getDiagnostics?.()).toMatchObject({strategy:'off',reason:'effect-disabled',quality:'low'});
  rerender(<LiquidGlass refraction="classic" ref={ref} effectMode="blur" onDiagnosticsChange={onChange}/>);
  expect(ref.current?.getDiagnostics()).toMatchObject({strategy:'blur',reason:'blur-requested'});
  const count = onChange.mock.calls.length;
  rerender(<LiquidGlass refraction="classic" ref={ref} effectMode="blur" onDiagnosticsChange={onChange} title="updated"/>);
  expect(onChange).toHaveBeenCalledTimes(count);
  expect(container.querySelector('[data-liquid-glass]')?.getAttribute('data-glass-strategy')).toBe('blur');
});

test.each([['[','invalid-selector'],['#absent','missing-backdrop']])('explains unusable backdrop %s', (selector, reason) => {
  const ref = createRef<LiquidGlassHandle>();
  render(<LiquidGlass refraction="classic" ref={ref} backdropSelector={selector}/>);
  expect(ref.current?.getDiagnostics?.()).toMatchObject({strategy:'blur',reason});
});

test('rejects a backdrop containing the lens and reports why', () => {
  const ref = createRef<LiquidGlassHandle>();
  render(<section id="ancestor"><LiquidGlass refraction="classic" ref={ref} backdropSelector="#ancestor"/></section>);
  expect(ref.current?.getDiagnostics?.()).toMatchObject({strategy:'blur',reason:'invalid-backdrop'});
});
