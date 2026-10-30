/** Optical controls from liquidGL's MIT-licensed WebGL shader. */
export interface LiquidGLOptions {
  refraction?: number;
  bevelDepth?: number;
  bevelWidth?: number;
  /** Pixel-sampling radius multiplier; defaults to blur / 8. */
  frost?: number;
  aberration?: number;
  specular?: boolean;
}
import type { GlassRenderer } from '../../vendor/ybouane/GlassRenderer';
import type { HtmlCapture } from '../../vendor/ybouane/HtmlCapture';

export interface WebGLOptions {
  /** Defaults to the existing package map-based shader. */
  optics?: 'native' | 'liquidgl';
  liquidGL?: LiquidGLOptions;
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
/** One panel's target in a shared scene (sharedScene.ts): it draws into a framebuffer of the scene's context. */
export interface SceneSlot {
  canvas: HTMLCanvasElement;
  /** Binds and clears a w×h device-pixel framebuffer for the panel's next draw. */
  prepare(w: number, h: number): WebGLFramebuffer;
  /** The drawn framebuffer is ready; (x, y) offsets it from the panel's top-left in device pixels at `dpr`. */
  present(x: number, y: number, w: number, h: number, dpr: number): void;
  release(): void;
}
