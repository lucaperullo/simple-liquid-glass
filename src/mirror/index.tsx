import React, { forwardRef } from 'react';
import LiquidGlass, { type LiquidGlassProps, type LiquidGlassHandle } from '../index';

export interface LiquidGlassMirrorProps extends LiquidGlassProps {
  /** @deprecated No effect. The DOM mirror was replaced by the WebGL renderer. */
  force?: boolean;
}

/**
 * `simple-liquid-glass/mirror` — deprecated back-compat alias of `<LiquidGlass>`.
 *
 * Safari, iOS and Firefox now refract through WebGL (point `backdropRef`/`backdropSelector` at
 * the background), so there is no separate mirror renderer left. Import `<LiquidGlass>` directly;
 * this exists only so `import { LiquidGlassMirror } from 'simple-liquid-glass/mirror'` keeps working.
 * @deprecated Use `<LiquidGlass>`.
 */
export const LiquidGlassMirror = forwardRef<LiquidGlassHandle, LiquidGlassMirrorProps>(
  function LiquidGlassMirror({ force: _force, ...props }, ref) {
    return <LiquidGlass ref={ref} {...props} />;
  }
);

LiquidGlassMirror.displayName = 'LiquidGlassMirror';

export default LiquidGlassMirror;
