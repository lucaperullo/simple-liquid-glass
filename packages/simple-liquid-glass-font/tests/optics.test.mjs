import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/optics.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { buildGlyphField } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function rectangle() {
  const rgba = new Uint8ClampedArray(25 * 25 * 4);
  for (let y = 3; y < 22; y++) for (let x = 3; x < 22; x++) rgba[(y * 25 + x) * 4 + 3] = 255;
  return rgba;
}

test('opposite glyph edges bend toward opposite sides while the center stays clear', () => {
  const { displacement } = buildGlyphField(rectangle(), 25, 25, 5);
  const at = (x, y, channel) => displacement[(y * 25 + x) * 4 + channel];
  assert.ok(at(4, 12, 0) > 128, 'left edge samples inward');
  assert.ok(at(20, 12, 0) < 128, 'right edge samples inward');
  assert.ok(at(12, 4, 1) > 128, 'top edge samples inward');
  assert.ok(at(12, 20, 1) < 128, 'bottom edge samples inward');
  assert.equal(at(12, 12, 0), 128);
  assert.equal(at(12, 12, 1), 128);
  assert.equal(at(0, 0, 0), 128);
});

test('thin strokes cross their center smoothly instead of flipping full-strength normals', () => {
  const width = 30, height = 24;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 2; y < 22; y++) for (let x = 10; x < 18; x++) rgba[(y * width + x) * 4 + 3] = 255;
  const { displacement } = buildGlyphField(rgba, width, height, 10);
  let largestJump = 0;
  for (let x = 11; x < 18; x++) largestJump = Math.max(largestJump, Math.abs(displacement[(12 * width + x) * 4] - displacement[(12 * width + x - 1) * 4]));
  assert.ok(largestJump < 25, `medial-axis jump was ${largestJump} channel levels`);
});

test('the lip bends inside the contour, not hardest at the clip line', () => {
  const { displacement } = buildGlyphField(rectangle(), 25, 25, 7);
  const at = x => Math.abs(displacement[(12 * 25 + x) * 4] - 128);
  assert.ok(at(3) < at(5), 'edge displacement should ease into the inner lip');
});

test('letter counters remain transparent and get their own curved inner rim', () => {
  const rgba = rectangle();
  for (let y = 9; y < 16; y++) for (let x = 9; x < 16; x++) rgba[(y * 25 + x) * 4 + 3] = 0;
  const { displacement, highlight } = buildGlyphField(rgba, 25, 25, 4);
  assert.equal(displacement[(12 * 25 + 12) * 4], 128);
  assert.equal(highlight[(12 * 25 + 12) * 4 + 3], 0);
  assert.ok(displacement[(12 * 25 + 8) * 4] < 128, 'inner left rim samples into its stroke');
});

test('empty text produces a neutral field and no highlights', () => {
  const { displacement, highlight } = buildGlyphField(new Uint8ClampedArray(64), 4, 4, 4);
  for (let i = 0; i < 64; i += 4) {
    assert.equal(displacement[i], 128);
    assert.equal(displacement[i + 1], 128);
    assert.equal(highlight[i + 3], 0);
  }
});
