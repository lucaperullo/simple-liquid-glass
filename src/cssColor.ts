/** Shared CSS color helpers (single source of truth for component + WebGL renderer). */

export interface Rgba { r: number; g: number; b: number; a: number }

export function parseCssColorToRgba(color: string): Rgba | null {
  const c = color.trim();
  let m: RegExpExecArray | null;
  if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i.exec(c))) {
    const r = parseInt(m[1], 10);
    const g = parseInt(m[2], 10);
    const b = parseInt(m[3], 10);
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    return { r, g, b, a };
  }
  if ((m = /^#([0-9a-f]{3})$/i.exec(c))) {
    const hex = m[1];
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: 1
    };
  }
  if ((m = /^#([0-9a-f]{4})$/i.exec(c))) {
    const hex = m[1];
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: parseInt(hex[3] + hex[3], 16) / 255
    };
  }
  if ((m = /^#([0-9a-f]{6})$/i.exec(c))) {
    const hex = m[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1
    };
  }
  if ((m = /^#([0-9a-f]{8})$/i.exec(c))) {
    const hex = m[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16) / 255
    };
  }
  // hsla/hsl not needed: computed styles return rgb/rgba
  return null;
}

export function findNearestOpaqueBackground(element: HTMLElement | null): Rgba | null {
  let el: HTMLElement | null = element;
  while (el) {
    const style = getComputedStyle(el);
    const bg = style.backgroundColor;
    const parsed = bg ? parseCssColorToRgba(bg) : null;
    if (parsed && parsed.a > 0) return parsed;
    el = el.parentElement;
  }
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  return bodyBg ? parseCssColorToRgba(bodyBg) : null;
}

export function isRgbColorDark(rgb: Pick<Rgba, 'r' | 'g' | 'b'>): boolean {
  const srgb = [rgb.r, rgb.g, rgb.b].map(v => v / 255);
  const linear = srgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance < 0.5;
}
