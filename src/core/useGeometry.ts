import { useEffect, useState, type RefObject } from 'react';

export function useGeometry(containerRef: RefObject<HTMLDivElement | null>) {
  const [dimensions, setDimensions] = useState({
    width: 400,
    height: 200
  });
  // True only while the element is actively resizing, so we can promote a compositor
  // layer transiently instead of holding `will-change` for every instance forever.
  const [isResizing, setIsResizing] = useState(false);
  // Whether the element is on (or near) screen. Offscreen instances drop their expensive
  // backdrop-filter so a page with many glass cards only pays for the visible ones.
  const [isVisible, setIsVisible] = useState(true);
  // Update dimensions when the container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let lastW = -1;
    let lastH = -1;
    let measuredOnce = false;
    const updateDimensions = () => {
      if (!containerRef.current) return;

      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      if (width === lastW && height === lastH) return; // ignore no-op (incl. ResizeObserver's initial fire)
      lastW = width;
      lastH = height;

      setDimensions({ width, height });

      // Promote a compositor layer only for genuine resizes AFTER the initial measurement;
      // release ~200ms after the last change. Just-mounted / idle instances stay at 'auto'
      // (avoids a per-instance promote→clear toggle on first paint).
      if (measuredOnce) {
        setIsResizing(true);
        if (idleTimer !== undefined) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => setIsResizing(false), 200);
      }
      measuredOnce = true;
    };

    // Initial measurement
    updateDimensions();

    // Create ResizeObserver to watch for size changes
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateDimensions);
    resizeObserver?.observe(containerRef.current);
    if (!resizeObserver) window.addEventListener('resize', updateDimensions);

    return () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Pause the (GPU-expensive) effect while the element is off-screen, so pages with many
  // glass instances only pay for the ones in view. Defaults to visible for SSR/first paint
  // and where IntersectionObserver is unavailable, so nothing regresses.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '200px' } // re-enable just before it scrolls into view (no pop-in)
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { dimensions, isResizing, isVisible };
}
