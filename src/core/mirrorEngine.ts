import { useEffect, useState, type RefObject } from 'react';

/**
 * Shared live-DOM-mirror engine (used by the core `LiquidGlass` fallback path and the
 * `/mirror` component). On engines that can't do SVG-in-backdrop-filter (Safari/iOS/Firefox),
 * it renders a displaced clone of the content behind the lens so they get real refraction.
 *
 * Purely additive: when `enabled` is false or no usable backdrop resolves, it stays inactive
 * (returns false) and the caller shows its normal blur fallback — so nothing regresses.
 */

/** Best-effort "what's visually behind the lens": the nearest ancestor that looks like a
 *  backdrop (own background color/image, or a scroll container), else <body>. The lens itself
 *  is stripped from the clone via the data-liquid-glass marker, so an ancestor source is safe. */
export function autoDetectBackdrop(lens: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = lens.parentElement;
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    const bg = (s.backgroundColor || '').replace(/\s+/g, '');
    const opaqueBg = !!bg && bg !== 'transparent' && !/^rgba\([^)]*,0\)$/.test(bg);
    const hasImg = !!s.backgroundImage && s.backgroundImage !== 'none';
    const scroll = /(auto|scroll)/.test(`${s.overflow}${s.overflowX}${s.overflowY}`);
    if (opaqueBg || hasImg || scroll) return el;
    el = el.parentElement;
  }
  return document.body || null;
}

export interface MirrorEngineOptions {
  /** Run only when on a fallback engine + on-screen (the caller decides). */
  enabled: boolean;
  /** The lens container. */
  containerRef: RefObject<HTMLElement | null>;
  /** The clone holder (a child of the lens-sized filtered element). */
  holderRef: RefObject<HTMLElement | null>;
  backdropRef?: RefObject<HTMLElement | null>;
  backdropSelector?: string;
  /** Continuously re-align every frame (for a moving/dragged lens). */
  track?: boolean;
}

/** Returns true while the live mirror is active (real refraction); false = caller shows blur. */
export function useMirrorEngine(o: MirrorEngineOptions): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!o.enabled) {
      setActive(false);
      return;
    }
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const lens = o.containerRef.current;
    const holder = o.holderRef.current;
    if (!lens || !holder) return;

    const source: HTMLElement | null =
      o.backdropRef?.current ??
      (o.backdropSelector ? document.querySelector<HTMLElement>(o.backdropSelector) : null) ??
      autoDetectBackdrop(lens);
    if (!source) {
      setActive(false);
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
        c.querySelectorAll('[data-liquid-glass]').forEach((n) => n.remove());
        holder.replaceChildren(c);
        setActive(true);
      } catch {
        holder.replaceChildren();
        setActive(false);
      }
    };

    let raf = 0;
    const sync = () => {
      raf = 0;
      const lr = lens.getBoundingClientRect();
      const sr = source.getBoundingClientRect();
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
    const mo = new MutationObserver((records) => {
      // The source may be an ANCESTOR of the lens (auto-detect), so writing the clone into the
      // holder mutates the source's subtree — ignore those self-caused mutations or it loops
      // forever. Only re-clone for real changes elsewhere in the backdrop.
      if (records.every((r) => r.target === holder || holder.contains(r.target))) return;
      clone();
      sync();
    });
    mo.observe(source, { childList: true, subtree: true, attributes: true, characterData: true });

    let trackRaf = 0;
    if (o.track) {
      let last = 0;
      const loop = (t: number) => {
        if (t - last >= 32) {
          last = t;
          sync();
        }
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
      setActive(false);
    };
  }, [o.enabled, o.containerRef, o.holderRef, o.backdropRef, o.backdropSelector, o.track]);

  return active;
}
