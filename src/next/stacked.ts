/**
 * Stacked layers (`simple-liquid-glass/next/stack` only, see stacking.ts): what a layer needs to be drawn
 * into another layer's canvas, over the glass already there. Kept out of the layer itself, so the core
 * carries none of it.
 */
import { buildProgram, type Program, type ShapeArrays } from './glProgram';
import type { MaterialSpec } from './materials';
import { writeRectangle } from './glHelpers';
import type { Rect } from './scene';
import { ATTRIBUTE_GROUPS, attributeGroups } from './shader';

/** What stacking adds to a layer. `T` is the layer's own type. */
export interface Stack<T> {
  /** The layer whose canvas this one is drawn into, or null for a layer with a canvas of its own. */
  base: T | null;
  /** For such a base: the layers drawn into its canvas after it, in order. */
  readonly members: T[];
  /** Where this layer may draw, CSS px from the canvas's top-left corner. Null: anywhere. */
  clip: Rect | null;
  /** For a base: the canvas as it is before a member draws, for that member's material to read. */
  below: WebGLTexture | null;
  belowSize: string;
  /** For a base: each material compiled once, however many of its layers use it. */
  readonly compiled: Map<string, Program>;
}

const stacks = new WeakMap<object, Stack<unknown>>();

export function stackOf<T extends object>(layer: T): Stack<T> {
  let stack = stacks.get(layer) as Stack<T> | undefined;
  if (!stack) {
    stack = { base: null, members: [], clip: null, below: null, belowSize: '', compiled: new Map() };
    stacks.set(layer, stack);
  }
  return stack;
}

/** What lived in a base's context and went with it. */
export function forget(stack: Stack<unknown>): void {
  stack.below = null;
  stack.belowSize = '';
  stack.compiled.clear();
}

/**
 * A material's program for one layer of a stack: compiled the first time any of the stack's layers asks,
 * then shared, with this layer's own shape arrays to send it.
 */
export function sharedProgram(
  gl: WebGLRenderingContext,
  compiled: Map<string, Program>,
  key: string,
  material: MaterialSpec,
  capacity: number,
  lean: boolean,
  arrays: ShapeArrays,
): Program {
  let first = compiled.get(key);
  if (!first) {
    first = buildProgram(gl, material, capacity, lean, arrays);
    first = { ...first, below: gl.getUniformLocation(first.handle, 'uBelow') };
    compiled.set(key, first);
  }
  const { uniforms } = first;
  return {
    ...first,
    boxes: arrays.boxes.subarray(0, capacity * 4),
    radii: arrays.radii.subarray(0, capacity),
    attributes: attributeGroups(material).flatMap((used, group) => {
      const values = arrays.attributes[group];
      return used && values
        ? [
            {
              location: uniforms[`uAttributes${ATTRIBUTE_GROUPS[group] ?? 'A'}`],
              values: values.subarray(0, capacity * 4),
            },
          ]
        : [];
    }),
  };
}

/**
 * Before a member draws: its pixels go over the canvas's (premultiplied), only inside its clip, and the
 * canvas as it is now is copied there for its material's `slg_below`, if it reads it. `unit` is a texture
 * unit the material's own textures leave free.
 */
export function beginOver(
  gl: WebGLRenderingContext,
  base: Stack<unknown>,
  clip: Rect | null,
  scale: number,
  below: WebGLUniformLocation | null,
  unit: number,
): void {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const left = clip ? Math.max(Math.floor(clip.left * scale), 0) : 0;
  const right = clip ? Math.min(Math.ceil((clip.left + clip.width) * scale), width) : width;
  // The buffer's rows run upwards.
  const bottom = clip ? Math.max(height - Math.ceil((clip.top + clip.height) * scale), 0) : 0;
  const top = clip ? Math.min(height - Math.floor(clip.top * scale), height) : height;
  const wide = Math.max(right - left, 0);
  const tall = Math.max(top - bottom, 0);
  if (below && wide > 0 && tall > 0) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const size = `${width}x${height}`;
    if (!base.below || base.belowSize !== size) {
      base.below ??= gl.createTexture();
      base.belowSize = size;
      gl.bindTexture(gl.TEXTURE_2D, base.below);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindTexture(gl.TEXTURE_2D, base.below);
    // Only the part the member can draw in: the rest of the texture is as an earlier member left it.
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, left, bottom, left, bottom, wide, tall);
    gl.uniform1i(below, unit);
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(left, bottom, wide, tall);
}

/** After a member has drawn: the context as a base expects it. */
export function endOver(gl: WebGLRenderingContext): void {
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
}

/** A layer stacked over a base goes. */
export function leave<T>(base: Stack<T>, member: T): void {
  base.members.splice(base.members.indexOf(member), 1);
}

/**
 * One rectangle around every shape (`boxes`: centre and half size, four values a shape) and `reach` past
 * them, kept to the view, as the first rectangle of `corners`. A stacked layer's pixels are blended over the
 * canvas's, so none may be drawn twice.
 */
export function writeAround(
  corners: Float32Array,
  boxes: Float32Array,
  count: number,
  reach: number,
  view: Rect,
): void {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let slot = 0; slot < count; slot++) {
    const [x = 0, y = 0, halfWidth = 0, halfHeight = 0] = boxes.subarray(slot * 4);
    left = Math.min(left, x - halfWidth - reach);
    top = Math.min(top, y - halfHeight - reach);
    right = Math.max(right, x + halfWidth + reach);
    bottom = Math.max(bottom, y + halfHeight + reach);
  }
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, view.width);
  bottom = Math.min(bottom, view.height);
  writeRectangle(
    corners,
    0,
    (left + right) / 2,
    (top + bottom) / 2,
    (right - left) / 2,
    (bottom - top) / 2,
    view,
  );
}
