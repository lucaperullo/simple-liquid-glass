import { cloneBackdrop } from './cloneBackdrop';
import { useEffect, useState, type RefObject } from 'react';

// Fire the "no backdrop → blur on iOS" hint at most once per page load, so it nudges without spamming.
let warnedNoBackdrop = false;

export interface MirrorEngineOptions {
  /** Run the engine (caller gates this on: fallback engine + visible + `mirror` prop). */
  enabled: boolean;
  /** The lens container (its on-screen rect is what the clone is aligned to). */
  containerRef: RefObject<HTMLElement | null>;
  /** The element the displaced clone is mounted into (lives inside the filtered lens layer). */
  holderRef: RefObject<HTMLElement | null>;
  /** The element behind the lens to refract. MUST NOT be an ancestor of the lens. */
  backdropRef?: RefObject<HTMLElement | null>;
  /** Alternative to backdropRef: a CSS selector resolved on mount. */
  backdropSelector?: string;
  /** Re-align the clone every frame — needed only when the lens itself MOVES (drag/animation). */
  track?: boolean;
}

/**
 * Live-DOM-mirror source tracking for CSS rim magnification and SVG displacement.
 * The caller chooses the optical renderer; this hook owns a single decorative clone
 * and aligns it to the explicit source before any intentional magnification.
 *
 * Requires an EXPLICIT backdrop source (`backdropRef`/`backdropSelector`) that is NOT an ancestor
 * of the lens. There is deliberately NO auto-detect: guessing the backdrop meant cloning a
 * page-sized ancestor every mutation, which exhausts iOS Safari's per-tab memory and crashes the
 * tab. When no usable explicit source is given the hook returns `false` and the caller shows blur.
 *
 * @returns whether the live mirror is active (`false` ⇒ caller renders the frosted-blur fallback).
 */
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

    let source = o.backdropRef?.current ?? null;
    try {
      if (!source && o.backdropSelector) source = document.querySelector<HTMLElement>(o.backdropSelector);
    } catch {
      setActive(false);
      return;
    }

    // Degrade to blur when there's no explicit source, or the source contains the lens. The
    // latter is the iOS crash path (cloning a page-sized ancestor every mutation) AND would mirror
    // the glass into itself — so it's a hard "use blur" rather than a best-effort.
    if (!source || source.contains(lens) || lens.contains(source)) {
      if (typeof console !== 'undefined') {
        if (!source && !warnedNoBackdrop) {
          // We're on a fallback engine (the caller only enables the engine there) and no backdrop
          // was given — the lens will blur instead of refracting. Nudge once so devs don't read the
          // blur as "broken on iOS".
          warnedNoBackdrop = true;
          // eslint-disable-next-line no-console
          console.warn(
            '[simple-liquid-glass] Using blur: set backdropRef/backdropSelector for refraction on Safari/Firefox, or mirror={false} to silence this.'
          );
        } else if (source && source.contains(lens)) {
          // eslint-disable-next-line no-console
          console.warn(
            '[simple-liquid-glass] backdropRef must point at a sibling/background element, not an ancestor of the lens — using the blur fallback.'
          );
        }
      }
      setActive(false);
      return;
    }

    const clone = () => {
      try {
        const c = cloneBackdrop(source);
        c.style.position = 'static';
        // Source translation is already represented by the holder's rect alignment.
        c.style.transform = 'none';
        c.style.translate = 'none';
        c.style.animation = 'none';
        c.style.transition = 'none';
        c.style.inset = 'auto';
        c.style.margin = '0';
        c.style.width = '100%';
        c.style.height = '100%';
        holder.replaceChildren(c);
        setActive(true);
      } catch {
        holder.replaceChildren();
        setActive(false);
      }
    };

    let raf = 0;
    const sync = () => {
      const lr = lens.getBoundingClientRect();
      const sr = source.getBoundingClientRect();
      // Only the clone moves/resizes; the FILTERED element (the lens layer) stays lens-sized, so
      // the GPU filters ~lens area per frame instead of the whole page clone.
      holder.style.width = `${sr.width}px`;
      holder.style.height = `${sr.height}px`;
      holder.style.transform = `translate(${sr.left - lr.left}px, ${sr.top - lr.top}px)`;
    };
    const onChange = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); });
    };

    clone();
    sync();
    window.addEventListener('scroll', onChange, { passive: true, capture: true });
    window.addEventListener('resize', onChange, { passive: true });
    // Source is guaranteed NOT to contain the lens (checked above), so writing the clone into the
    // holder never mutates the source's subtree — no self-triggered re-clone loop.
    let cloneRaf = 0;
    const mo = new MutationObserver(() => {
      if (cloneRaf) return;
      cloneRaf = requestAnimationFrame(() => {
        cloneRaf = 0;
        clone();
        sync();
      });
    });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onChange);
    ro?.observe(source);
    ro?.observe(lens);
    mo.observe(source, { childList: true, subtree: true, attributes: true, characterData: true });

    // `track`: re-align every frame for lenses that MOVE (drag/animation) — scroll/resize don't
    // fire when only the lens's own transform changes. Throttled to ~30fps: the filter only
    // re-rasterizes when the clone moves, so halving the realign rate halves the GPU filter work
    // during a drag (the lens itself still moves at full frame rate).
    let trackRaf = 0;
    if (o.track) {
      let lastT = 0;
      const loop = (t: number) => {
        if (t - lastT >= 32) {
          lastT = t;
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
      ro?.disconnect();
      if (cloneRaf) cancelAnimationFrame(cloneRaf);
      holder.replaceChildren();
      setActive(false);
    };
  }, [o.enabled, o.containerRef, o.holderRef, o.backdropRef, o.backdropSelector, o.track]);

  return active;
}
