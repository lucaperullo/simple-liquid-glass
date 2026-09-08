import { useEffect, useState, type RefObject } from 'react';
import { parseCssColorToRgba, findNearestOpaqueBackground, isRgbColorDark } from '../cssColor';

export function useTextColor(containerRef: RefObject<HTMLDivElement | null>, autoTextColor: boolean, textOnDark: string, textOnLight: string): string {
  const [effectiveTextColor, setEffectiveTextColor] = useState(textOnLight);
  // Auto-detect background and set text color for children; updates on resize/scroll/mutations
  useEffect(() => {
    if (!autoTextColor) return;

    // A single observer watches <body> + the nearest opaque ancestor (the node that
    // actually determines the background), re-pointed when that ancestor changes —
    // instead of one observer per ancestor up the whole tree.
    // Trade-off: a mid-chain ancestor that toggles to opaque without itself mutating
    // class/style is only picked up on the next scroll/resize, not instantly.
    const observer = new MutationObserver(() => onChange());
    let observedOpaque: HTMLElement | null = null;
    let observerInitialized = false;

    const findOpaqueAncestor = (start: HTMLElement | null): HTMLElement | null => {
      let el: HTMLElement | null = start;
      while (el) {
        const parsed = parseCssColorToRgba(getComputedStyle(el).backgroundColor);
        if (parsed && parsed.a > 0) return el;
        el = el.parentElement;
      }
      return null;
    };

    const repointObserver = (opaque: HTMLElement | null) => {
      if (observerInitialized && opaque === observedOpaque) return;
      observer.disconnect();
      observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
      if (opaque && opaque !== document.body) {
        observer.observe(opaque, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      observedOpaque = opaque;
      observerInitialized = true;
    };

    const update = () => {
      const target = containerRef.current?.parentElement ?? null;
      if (!target) return;
      const bg = findNearestOpaqueBackground(target);
      setEffectiveTextColor(bg && isRgbColorDark(bg) ? textOnDark : textOnLight);
      repointObserver(findOpaqueAncestor(target));
    };

    // Coalesce scroll/resize/mutation bursts to a single recompute per animation frame.
    let rafId = 0;
    const onChange = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; update(); });
    };

    update();

    // passive: never blocks scrolling. capture: still reacts to inner scroll containers.
    window.addEventListener('resize', onChange, { passive: true });
    window.addEventListener('scroll', onChange, { passive: true, capture: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      observer.disconnect();
    };
  }, [autoTextColor, textOnDark, textOnLight]);

  return effectiveTextColor;
}
