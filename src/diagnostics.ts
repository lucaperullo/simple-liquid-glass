import type { LiquidQuality } from './quality';

// 'css-rim', 'svg-mirror' and the mirror reasons are no longer emitted; kept so existing comparisons compile.
export type RenderingStrategy = 'webgl' | 'pending' | 'off' | 'paused' | 'svg' | 'css-rim' | 'svg-mirror' | 'blur';
export type RenderingReason = 'initializing' | 'effect-disabled' | 'offscreen' | 'blur-requested'
  | 'ios-webgl' | 'svg-unsupported' | 'webgl-requested' | 'webgl-unavailable' | 'capture-failed'
  | 'native-svg' | 'backdrop-mirror' | 'mirror-disabled' | 'missing-backdrop'
  | 'invalid-selector' | 'invalid-backdrop' | 'clone-failed' | 'mirror-unavailable';

/** Describes the selected renderer, not a browser capability or performance guarantee. */
export interface RenderingDiagnostics {
  readonly strategy: RenderingStrategy;
  readonly reason: RenderingReason;
  readonly quality: LiquidQuality;
}
