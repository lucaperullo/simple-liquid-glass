import { ForwardRefExoticComponent, RefAttributes } from 'react';
import { LiquidGlassProps, LiquidGlassHandle } from '../index';

export interface LiquidGlassMirrorProps extends LiquidGlassProps {
  /** Force the mirror even on engines that support real backdrop refraction (testing/demo). */
  force?: boolean;
}

export declare const LiquidGlassMirror: ForwardRefExoticComponent<
  LiquidGlassMirrorProps & RefAttributes<LiquidGlassHandle>
>;

export default LiquidGlassMirror;
