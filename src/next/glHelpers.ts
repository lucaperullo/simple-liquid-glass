import type { BackdropFrame, Rect } from './scene';

/**
 * Writes shape `slot`'s rectangle into `corners` as two triangles in clip space (y up): the box centred on
 * (`x`, `y`) with half sizes `halfWidth` and `halfHeight`, in the CSS px of a layer whose view is `view`.
 */
export function writeRectangle(
  corners: Float32Array,
  slot: number,
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  view: Rect,
): void {
  const left = ((x - halfWidth) / view.width) * 2 - 1;
  const right = ((x + halfWidth) / view.width) * 2 - 1;
  const top = 1 - ((y - halfHeight) / view.height) * 2;
  const bottom = 1 - ((y + halfHeight) / view.height) * 2;
  // (Written one by one: this runs for every shape on every frame, and an array here would be garbage.)
  let at = slot * 12;
  corners[at++] = left;
  corners[at++] = top;
  corners[at++] = right;
  corners[at++] = top;
  corners[at++] = left;
  corners[at++] = bottom;
  corners[at++] = left;
  corners[at++] = bottom;
  corners[at++] = right;
  corners[at++] = top;
  corners[at++] = right;
  corners[at] = bottom;
}

/**
 * Puts `frame` into `texture` (a new one if there is none yet) and returns it. One texture for each
 * picture's life: a stream of frames refills it instead of making a new one each time.
 */
export function fillTexture(
  gl: WebGLRenderingContext,
  texture: WebGLTexture | null,
  frame: BackdropFrame,
): WebGLTexture | null {
  const target = texture ?? gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target);
  if (!texture) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
  return target;
}
