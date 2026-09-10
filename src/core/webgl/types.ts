import type { GlassRenderer } from '../../vendor/ybouane/GlassRenderer';
import type { HtmlCapture } from '../../vendor/ybouane/HtmlCapture';

export interface WebGLOptions {
  map: string;
  scale: number;
  dispersion: number;
  specular: number;
  /** Select the legacy blue Y channel; false uses the green channel. */
  classic: boolean;
  /** Additive CSS-pixel RGB separation (glyphs); default follows the rounded lens model. */
  additiveDispersion?: boolean;
  /** Neutral map channel value; defaults to 0.5. Glyph maps use 128/255. */
  neutralPoint?: number;
  radius: number;
  blur: number;
  saturation: number;
}
export type WebGLStatus = 'pending' | 'active' | 'missing-backdrop' | 'invalid-backdrop'
  | 'invalid-selector' | 'webgl-unavailable' | 'capture-failed';
export interface EngineContext {
  renderer: GlassRenderer;
  capture: Pick<HtmlCapture, 'cache'>;
  markChanged(): void;
  destroy(): void;
}
export interface WebGLEngine {
  update(options: WebGLOptions): void;
  refresh(): Promise<void>;
  destroy(): void;
}
