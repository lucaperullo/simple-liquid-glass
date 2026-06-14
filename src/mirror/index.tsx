import React, {
  useEffect,
  useId,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type RefObject
} from 'react';
import LiquidGlass, { type LiquidGlassProps, type LiquidGlassHandle } from '../index';

/**
 * `simple-liquid-glass/mirror` — REAL refraction on Safari / iOS / Firefox.
 *
 * Those engines cannot run SVG filters inside `backdrop-filter` (WebKit bug 245510,
 * architectural), so the core component can only blur there. Safari/iOS DO, however, honor
 * `filter: url(#localFilter)` with `feDisplacementMap` on a regular element (caniuse #3803).
 * So on the fallback engines this renders a live, displaced **clone** of the content behind the
 * lens — true distortion — instead of just blur.
 *
 * - On Chromium (where the core already refracts) this delegates to the core `<LiquidGlass>` and
 *   never clones. Use `force` to exercise the mirror on Chromium (testing/demo).
 * - Opt-in subpath, so the core import pays nothing for this.
 * - You MUST point it at the element behind the lens via `backdropRef` (or `backdropSelector`).
 *   That element must NOT be an ancestor of the lens (else it would mirror itself). Transformed /
 *   zoomed / position:fixed|sticky ancestors and nested non-window scroll containers are
 *   unsupported and automatically degrade to blur. Validate the look on a real iOS device.
 */
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
  /** Continuously re-align the clone every frame — needed when the lens itself MOVES
   *  (dragging, animation). Off by default; scroll/resize re-align is enough for static lenses. */
  track?: boolean;
}

function supportsSvgBackdropFilter(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/(iphone|ipad|ipod)/i.test(ua)) return false;
  if (/firefox|fxios/i.test(ua)) return false;
  return /(chrome|chromium|edg|opr)\//i.test(ua);
}

export const LiquidGlassMirror = forwardRef<LiquidGlassHandle, LiquidGlassMirrorProps>(
  function LiquidGlassMirror(
    { backdropRef, backdropSelector, mirrorScale = 48, force = false, onActiveChange, track = false, children, radius = 50, style, className, ...props },
    ref
  ) {
    // Chromium already refracts for real — don't mirror there unless explicitly forced.
    const engineRefracts = typeof navigator !== 'undefined' ? supportsSvgBackdropFilter() : true;
    if (engineRefracts && !force) {
      return (
        <LiquidGlass ref={ref} radius={radius} style={style} className={className} {...props}>
          {children}
        </LiquidGlass>
      );
    }

    const containerRef = useRef<HTMLDivElement | null>(null);
    const mirrorRef = useRef<HTMLDivElement | null>(null);
    const cloneHolderRef = useRef<HTMLDivElement | null>(null);
    const [mirrorActive, setMirrorActive] = useState(false);
    // Start visible so the lens activates on mount; the IntersectionObserver only pauses it
    // once it confirms the element is off-screen (so visible instances always clone).
    const [isVisible, setIsVisible] = useState(true);
    const rawId = useId();
    const filterId = `lg-mirror-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

    const activate = (a: boolean) => {
      setMirrorActive(a);
      if (onActiveChange) onActiveChange(a);
    };

    useImperativeHandle(ref, () => ({
      get element() {
        return containerRef.current;
      },
      getQuality() {
        return 'standard';
      }
    }), []);

    // Pause work while off-screen (mirrors the core's multi-instance perf gate).
    useEffect(() => {
      if (typeof IntersectionObserver === 'undefined') {
        setIsVisible(true);
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      const io = new IntersectionObserver(
        (entries) => {
          const e = entries[entries.length - 1];
          if (e) setIsVisible(e.isIntersecting);
        },
        { rootMargin: '200px' }
      );
      io.observe(el);
      return () => io.disconnect();
    }, []);

    useEffect(() => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      if (!isVisible) return;
      const lens = containerRef.current;
      const mirror = mirrorRef.current;
      const holder = cloneHolderRef.current;
      if (!lens || !mirror || !holder) return;

      const source: HTMLElement | null =
        backdropRef?.current ?? (backdropSelector ? document.querySelector<HTMLElement>(backdropSelector) : null);

      // Degrade to blur only if there's no source, or the source contains the lens (which
      // would mirror the glass into itself — visual recursion). Ancestor transforms can mildly
      // misalign the clone but don't break it, so we no longer disable on them (that guard
      // false-positived on Safari and silently killed the effect — see real-device testing).
      if (!source || source.contains(lens)) {
        if (source && source.contains(lens) && typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[LiquidGlassMirror] backdrop source must not be an ancestor of the lens; falling back to blur.');
        }
        activate(false);
        return;
      }

      const clone = () => {
        try {
          const c = source.cloneNode(true) as HTMLElement;
          c.style.position = 'static';
          c.style.inset = 'auto';
          c.style.margin = '0';
          c.style.width = '100%';
          c.style.height = '100%';
          // Strip any nested liquid-glass lenses so they don't render as frozen clones.
          c.querySelectorAll('[data-liquid-glass]').forEach((n) => n.remove());
          holder.replaceChildren(c);
          activate(true);
        } catch {
          holder.replaceChildren();
          activate(false);
        }
      };

      let raf = 0;
      const sync = () => {
        raf = 0;
        const lr = lens.getBoundingClientRect();
        const sr = source.getBoundingClientRect();
        // Only the clone moves/resizes; the FILTERED element (mirror) stays lens-sized, so the
        // GPU filters ~lens area per frame instead of the whole page clone.
        holder.style.width = `${sr.width}px`;
        holder.style.height = `${sr.height}px`;
        holder.style.transform = `translate(${sr.left - lr.left}px, ${sr.top - lr.top}px)`;
      };
      const onChange = () => {
        if (!raf) raf = requestAnimationFrame(sync);
      };

      clone();
      sync();
      window.addEventListener('scroll', onChange, { passive: true, capture: true });
      window.addEventListener('resize', onChange, { passive: true });
      const mo = new MutationObserver(() => {
        clone();
        sync();
      });
      mo.observe(source, { childList: true, subtree: true, attributes: true, characterData: true });

      // `track`: continuously re-align every frame, for lenses that MOVE (drag/animation) —
      // scroll/resize don't fire when only the lens's own transform changes. Off by default
      // (one rAF + 2 getBoundingClientRect per active visible instance per frame).
      let trackRaf = 0;
      if (track) {
        const loop = () => {
          sync();
          trackRaf = requestAnimationFrame(loop);
        };
        trackRaf = requestAnimationFrame(loop);
      }

      return () => {
        if (raf) cancelAnimationFrame(raf);
        if (trackRaf) cancelAnimationFrame(trackRaf);
        window.removeEventListener('scroll', onChange, true);
        window.removeEventListener('resize', onChange);
        mo.disconnect();
        holder.replaceChildren();
      };
    }, [isVisible, backdropRef, backdropSelector, track]);

    const containerStyle: React.CSSProperties = {
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: radius,
      overflow: 'hidden',
      boxShadow:
        '0 10px 30px rgba(0,0,0,0.20), inset 0 1px 1px rgba(255,255,255,0.75), inset 0 0 0 1px rgba(255,255,255,0.22)',
      ...style
    };

    // Base frost shows when the mirror can't activate (no source / unsupported) — graceful blur.
    const baseFrost = `blur(10px) saturate(180%)`;

    return (
      <div ref={containerRef} className={className} style={containerStyle} data-liquid-glass="" {...props}>
        {/* Graceful blur base — only visible when the opaque clone isn't covering it. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: mirrorActive ? 'none' : baseFrost,
            WebkitBackdropFilter: mirrorActive ? 'none' : baseFrost,
            background:
              'linear-gradient(168deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.10) 12%, rgba(255,255,255,0.03) 46%, rgba(255,255,255,0) 80%, rgba(255,255,255,0.08) 100%)'
          }}
        />
        {/* The displaced, opaque live clone = real refraction on Safari/iOS. The FILTERED
            element is lens-sized (inset 0, overflow hidden) so the GPU only filters the lens
            area each frame; the full-page clone lives inside it, translated to the right slice. */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            filter: `url(#${filterId})`,
            WebkitFilter: `url(#${filterId})`,
            pointerEvents: 'none',
            visibility: mirrorActive ? 'visible' : 'hidden'
          }}
        >
          <div ref={cloneHolderRef} style={{ position: 'absolute', top: 0, left: 0 }} />
        </div>
        {/* Top-lit specular sheen over the refraction for a glassy finish. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(168deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 100%)',
            mixBlendMode: 'screen'
          }}
        />
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.016" numOctaves={2} seed={11} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={mirrorScale} xChannelSelector="R" yChannelSelector="G" result="disp" />
            <feGaussianBlur in="disp" stdDeviation="1.2" />
          </filter>
        </svg>
        <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%' }}>{children}</div>
      </div>
    );
  }
);

LiquidGlassMirror.displayName = 'LiquidGlassMirror';

export default LiquidGlassMirror;
