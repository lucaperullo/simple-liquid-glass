import { createDirectScene } from '../core/webgl/directScene';
import type { LiquidGLOptions } from '../core/webgl/types';
export type { LiquidGLOptions } from '../core/webgl/types';

export interface ExperimentalSceneOptions {
  /** Corner radius in CSS pixels, clamped to half of each panel. Default 24. */
  radius?: number;
  /** Frost blur in CSS pixels; liquidGL frost defaults to blur / 8. Default 0. */
  blur?: number;
  /** Analytical liquidGL coefficients. Defaults: .006 / .015 / .15, no frost, aberration or specular. */
  liquidGL?: LiquidGLOptions;
}
export interface ExperimentalPanelStatus {
  strategy: 'active' | 'pending' | 'capture-failed' | 'webgl-unavailable';
  backend: 'shared-webgl';
  submission: 'instanced' | 'per-panel';
}
export interface ExperimentalScene {
  /** The shared WebGL canvas, prepended to the overlay below all panel content. */
  readonly canvas: HTMLCanvasElement;
  /** Recapture after source changes the mutation observer cannot see. */
  refresh(): Promise<void>;
  status(): ExperimentalPanelStatus[];
  destroy(): void;
}

/**
 * Unstable: one shared WebGL canvas renders analytical liquidGL refraction for a
 * fixed list of flat, axis-aligned panels. The overlay must be positioned; the
 * glass is composited below all overlay content. Nested clips, interleaved
 * z-order, rotation and glass-through-glass are not supported. The source must
 * not contain the overlay. Recreate the scene when the panel list changes.
 * This API may change in a minor release.
 */
export function createExperimentalScene(overlay: HTMLElement, panels: readonly HTMLElement[],
  source: HTMLElement, options: ExperimentalSceneOptions = {}): ExperimentalScene {
  if (source.contains(overlay) || overlay.contains(source)) {
    throw new Error('Experimental scene: the source must be a sibling/background of the overlay.');
  }
  const blur = Math.max(0, options.blur ?? 0);
  return createDirectScene(overlay, [...panels], source, {
    optics: 'liquidgl', map: '', scale: 0, dispersion: 0, specular: 0, classic: false,
    radius: Math.max(0, options.radius ?? 24), blur, saturation: 100,
    liquidGL: { refraction: .006, bevelDepth: .015, bevelWidth: .15, aberration: 0, specular: false, ...options.liquidGL },
  }) as ExperimentalScene;
}
