import { installLiquidGLOptics } from '../core/webgl/liquidGLOptics';
/** Framework-independent backdrop renderer, also used by simple-liquid-text. */
import { createWebGLEngine } from '../core/webgl/runtime';
import { joinSharedScene } from '../core/webgl/sharedScene';
import type { WebGLOptions, WebGLStatus, WebGLEngine } from '../core/webgl/types';
export { isIOSDevice, supportsSvgBackdrop } from '../core/renderer';
export { joinGlassCrowd, CROWD_ON, CROWD_OFF } from '../core/webgl/crowd';
export type { GlassRenderer } from '../core/renderer';
export type { WebGLOptions as WebGLSurfaceOptions, WebGLStatus as WebGLSurfaceStatus, WebGLEngine as WebGLSurface } from '../core/webgl/types';
import { getGlassEngineStats } from './stats';
export { getGlassEngineStats };
export type { GlassEngineStats, GlassEngineFrameStats, GlassSurfaceStats, GlassSurfaceStrategy } from './stats';

// A benchmark that sets window.__benchExpose before this entry loads reads window.__slgEngine.stats().
if (typeof window !== 'undefined' && (window as { __benchExpose?: unknown }).__benchExpose) {
  (window as { __slgEngine?: unknown }).__slgEngine = { stats: getGlassEngineStats };
}

/** Opt-in shared canvas: surfaces grouped under `root` (default: the element's parent) draw into one canvas. */
export interface WebGLSurfaceScene {
  root?: HTMLElement | null;
}

/** The output holder can be CSS-masked (for example, to glyph outlines).
 * The backdrop must not contain the element or output, or it would capture itself.
 *
 * With `scene`, an eligible element draws into the shared canvas of its group instead of its own canvas, and a CSS
 * mask on the holder no longer applies: pass the mask as `options.mask`. A surface the scene can no longer draw
 * (moved out of its root, scaled by an ancestor) continues on its own canvas.
 */
export function createWebGLSurface(element: HTMLElement, output: HTMLElement, backdrop: HTMLElement,
  options: WebGLOptions, onStatus: (status: WebGLStatus) => void = () => {}, scene?: WebGLSurfaceScene): WebGLEngine {
  if (backdrop.contains(element) || element.contains(backdrop) || backdrop.contains(output)) {
    throw new Error('WebGL backdrop must be a sibling/background, not an ancestor of the surface.');
  }
  const own = () => createWebGLEngine(element, output, backdrop, latest, onStatus, installLiquidGLOptics);
  let latest = options, destroyed = false, evicting = false;
  if (!scene) return own();
  // The scene evicts while compositing; swap engines after that frame.
  const evict = () => {
    if (evicting) return;
    evicting = true;
    queueMicrotask(() => { if (destroyed) return; engine.destroy(); engine = own(); });
  };
  let engine = joinSharedScene(element, output, backdrop, options, onStatus, installLiquidGLOptics, evict, scene.root ?? element.parentElement) ?? own();
  return {
    update(next) { latest = next; engine.update(next); },
    refresh: () => engine.refresh(),
    destroy() { destroyed = true; engine.destroy(); },
  };
}
