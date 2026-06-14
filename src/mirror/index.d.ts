import { ForwardRefExoticComponent, RefAttributes } from 'react';
import { LiquidGlassProps, LiquidGlassHandle } from '../index';

export interface LiquidGlassMirrorProps extends LiquidGlassProps {
  /** Exercise the mirror on engines that already refract (Chromium) — testing/demo only. */
  force?: boolean;
}

export declare const LiquidGlassMirror: ForwardRefExoticComponent<
  LiquidGlassMirrorProps & RefAttributes<LiquidGlassHandle>
>;

export default LiquidGlassMirror;
