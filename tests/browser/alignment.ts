/** Compare source placement after accounting for intentional rim magnification. */
export function alignmentError({ sourceSelector, cloneSelector }: { sourceSelector: string; cloneSelector: string }) {
  const source = document.querySelector(sourceSelector)!.getBoundingClientRect();
  return Math.max(0, ...Array.from(document.querySelectorAll(cloneSelector)).map(el => {
    const clone = el.getBoundingClientRect();
    const lens = el.closest('[data-liquid-glass-mirror]')!.getBoundingClientRect();
    const zoom = clone.width / source.width;
    const cx = lens.left + lens.width / 2, cy = lens.top + lens.height / 2;
    return Math.max(Math.abs(clone.left - (cx + (source.left - cx) * zoom)),
      Math.abs(clone.top - (cy + (source.top - cy) * zoom)));
  }));
}
