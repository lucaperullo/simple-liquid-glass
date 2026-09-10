import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { LiquidGlassText } from '../dist/index.js';

test('SSR keeps real text and hides the decorative copy from assistive technology', () => {
  const html = renderToString(React.createElement(LiquidGlassText, { title: 'Example' }, 'A & B'));
  assert.match(html, /A &amp; B/);
  assert.match(html, /title="Example"/);
  assert.match(html, /class="slgf-backdrop" aria-hidden="true"/);
  assert.doesNotMatch(html, /data-ready="true"/);
});

test('multiple instances retain their own text without decorative text duplication', () => {
  const html = renderToString(React.createElement('div', null,
    React.createElement(LiquidGlassText, null, 'First'),
    React.createElement(LiquidGlassText, null, 'Second')));
  assert.equal(html.split('First').length - 1, 1);
  assert.equal(html.split('Second').length - 1, 1);
});
