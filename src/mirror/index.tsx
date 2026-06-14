import React, { forwardRef } from 'react';
import LiquidGlass, { type LiquidGlassProps, type LiquidGlassHandle } from '../index';

export interface LiquidGlassMirrorProps extends LiquidGlassProps {
  /** Exercise the mirror on engines that already refract (Chromium) — testing/demo only. */
  force?: boolean;
}

/**
 * Back-compat wrapper. As of v2.3.0 the core `<LiquidGlass>` renders the live-DOM-mirror
 * refraction automatically on Safari / iOS / Firefox (the `mirror` prop, on by default), so you
 * can just use `<LiquidGlass>` everywhere. This wrapper ensures `mirror` is on and lets `force`
 * exercise the mirror path on Chromium (via the CSS fallback). The mirror engine itself lives in
 * `core/mirrorEngine` — single source of truth.
 */
export const LiquidGlassMirror = forwardRef<LiquidGlassHandle, LiquidGlassMirrorProps>(
  function LiquidGlassMirror({ force, mobileFallback, ...props }, ref) {
    return <LiquidGlass ref={ref} mirror mobileFallback={force ? 'css-only' : mobileFallback} {...props} />;
  }
);

LiquidGlassMirror.displayName = 'LiquidGlassMirror';

export default LiquidGlassMirror;
