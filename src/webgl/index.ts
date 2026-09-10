/** Framework-independent backdrop renderer, also used by simple-liquid-text. */
import { createWebGLEngine } from '../core/webgl/runtime';
import type { WebGLOptions, WebGLStatus, WebGLEngine } from '../core/webgl/types';
export { isIOSDevice } from '../core/renderer';
export type { GlassRenderer } from '../core/renderer';
export type { WebGLOptions as WebGLSurfaceOptions, WebGLStatus as WebGLSurfaceStatus, WebGLEngine as WebGLSurface } from '../core/webgl/types';

/** The output holder can be CSS-masked (for example, to glyph outlines).
 * The backdrop must not contain the element or output, or it would capture itself.
 */
export function createWebGLSurface(element: HTMLElement, output: HTMLElement, backdrop: HTMLElement,
  options: WebGLOptions, onStatus: (status: WebGLStatus) => void = () => {}): WebGLEngine {
  if (backdrop.contains(element) || element.contains(backdrop) || backdrop.contains(output)) {
    throw new Error('WebGL backdrop must be a sibling/background, not an ancestor of the surface.');
  }
  return createWebGLEngine(element, output, backdrop, options, onStatus);
}
