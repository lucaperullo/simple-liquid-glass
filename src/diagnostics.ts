import type { LiquidQuality } from './quality';

export type RenderingStrategy = 'webgl' | 'pending' | 'off' | 'paused' | 'svg' | 'css-rim' | 'svg-mirror' | 'blur';
export type RenderingReason = 'initializing' | 'effect-disabled' | 'offscreen' | 'blur-requested'
  | 'ios-webgl' | 'webgl-requested' | 'webgl-unavailable' | 'capture-failed'
  | 'native-svg' | 'backdrop-mirror' | 'mirror-disabled' | 'missing-backdrop'
  | 'invalid-selector' | 'invalid-backdrop' | 'clone-failed' | 'mirror-unavailable';

/** Describes the selected renderer, not a browser capability or performance guarantee. */
export interface RenderingDiagnostics {
  readonly strategy: RenderingStrategy;
  readonly reason: RenderingReason;
  readonly quality: LiquidQuality;
}
