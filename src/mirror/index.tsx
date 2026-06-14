import React, { forwardRef } from 'react';
import LiquidGlass, { type LiquidGlassProps, type LiquidGlassHandle } from '../index';

export interface LiquidGlassMirrorProps extends LiquidGlassProps {
  /** Force the mirror even on engines that support real backdrop refraction (testing/demo). */
  force?: boolean;
}

/**
 * `simple-liquid-glass/mirror` — thin back-compat wrapper.
 *
 * The live-DOM-mirror refraction for Safari / iOS / Firefox now lives in the core `<LiquidGlass>`
 * (the `mirror` prop, on by default — point it at the backdrop via `backdropRef`/`backdropSelector`).
 * This wrapper just forwards to it; `force` flips the core onto its fallback path so the mirror also
 * runs on Chromium (testing/demo). Prefer importing `<LiquidGlass>` directly — this exists only so
 * existing `import { LiquidGlassMirror } from 'simple-liquid-glass/mirror'` keeps working.
 */
export const LiquidGlassMirror = forwardRef<LiquidGlassHandle, LiquidGlassMirrorProps>(
  function LiquidGlassMirror({ force = false, mobileFallback, ...props }, ref) {
    return (
      <LiquidGlass
        ref={ref}
        mirror
        mobileFallback={force ? 'css-only' : mobileFallback}
        {...props}
      />
    );
  }
);

LiquidGlassMirror.displayName = 'LiquidGlassMirror';

export default LiquidGlassMirror;
