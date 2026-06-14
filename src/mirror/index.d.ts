import { ForwardRefExoticComponent, RefAttributes, RefObject } from 'react';
import { LiquidGlassProps, LiquidGlassHandle } from '../index';

export interface LiquidGlassMirrorProps extends LiquidGlassProps {
  /** The element behind the lens to refract (canonical). Must not contain the lens. */
  backdropRef?: RefObject<HTMLElement | null>;
  /** Alternative to backdropRef: a selector resolved once on mount. */
  backdropSelector?: string;
  /** Displacement strength for the mirror (dense turbulence field). Default 48. */
  mirrorScale?: number;
  /** Render the mirror even on engines that support real backdrop refraction (testing/demo). */
  force?: boolean;
  /** Called when the live mirror activates (true = real refraction) or degrades to blur (false). */
  onActiveChange?: (active: boolean) => void;
  /** Continuously re-align the clone every frame — needed when the lens itself moves (drag/animation). */
  track?: boolean;
}

export declare const LiquidGlassMirror: ForwardRefExoticComponent<
  LiquidGlassMirrorProps & RefAttributes<LiquidGlassHandle>
>;

export default LiquidGlassMirror;
