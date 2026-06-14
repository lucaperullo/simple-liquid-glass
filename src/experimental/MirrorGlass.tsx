import React, { useEffect, useId, useRef, type RefObject, type ReactNode } from 'react';

/**
 * EXPERIMENTAL — iOS/Safari true-refraction spike (live DOM mirror).
 *
 * Safari cannot run SVG filters inside `backdrop-filter` (WebKit bug 245510, architectural),
 * but it CAN run them in the regular `filter` property. So instead of filtering the backdrop,
 * we render a displaced *clone* of the content behind the lens and apply
 * `filter: url(#displacement)` to that clone — yielding real refraction on Safari/iOS.
 *
 * This is a spike to validate the technique on a real device. Known limitations: the clone is
 * a snapshot (re-cloned on source mutations via MutationObserver), alignment assumes `source`
 * is the element actually behind the lens, and nested scroll containers / transformed ancestors
 * are not fully handled. Not yet a package export.
 */
export interface MirrorGlassProps {
  /** The element whose content sits behind the lens and should be refracted. */
  source: RefObject<HTMLElement | null>;
  width: number | string;
  height: number | string;
  radius?: number;
  /** Displacement strength. */
  scale?: number;
  children?: ReactNode;
}

export function MirrorGlass({ source, width, height, radius = 28, scale = 36, children }: MirrorGlassProps) {
  const lensRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const rawId = useId();
  const filterId = `mirror-glass-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    const lens = lensRef.current;
    const mirror = mirrorRef.current;
    const src = source.current;
    if (!lens || !mirror || !src) return;

    const clone = () => {
      // Clone the source ELEMENT (not just innerHTML) so its own layout context
      // (display/flex/grid, etc.) is preserved, then neutralize its positioning so the
      // clone fills the mirror box and lines up 1:1 with the real source.
      const c = src.cloneNode(true) as HTMLElement;
      c.style.position = 'static';
      c.style.inset = 'auto';
      c.style.margin = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      mirror.replaceChildren(c);
    };

    let raf = 0;
    const sync = () => {
      raf = 0;
      const lr = lens.getBoundingClientRect();
      const sr = src.getBoundingClientRect();
      mirror.style.width = `${sr.width}px`;
      mirror.style.height = `${sr.height}px`;
      // Shift the cloned source so the slice behind the lens lines up inside it.
      mirror.style.transform = `translate(${sr.left - lr.left}px, ${sr.top - lr.top}px)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };

    clone();
    sync();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    const mo = new MutationObserver(() => {
      clone();
      sync();
    });
    mo.observe(src, { childList: true, subtree: true, attributes: true, characterData: true });

    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [source]);

  return (
    <div
      ref={lensRef}
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 8px 30px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.25)'
      }}
    >
      <div
        ref={mirrorRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          filter: `url(#${filterId})`,
          WebkitFilter: `url(#${filterId})`,
          pointerEvents: 'none'
        }}
      />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.022 0.028" numOctaves={2} seed={7} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={scale} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>{children}</div>
    </div>
  );
}

export default MirrorGlass;
