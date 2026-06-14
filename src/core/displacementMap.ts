/**
 * Canonical, framework-agnostic displacement-map generator (shared by the React component
 * and the web component). Pure: given size + shape params, returns the SVG / data-URI used
 * as the feImage in the refraction filter. No DOM, no React.
 */

export interface DisplacementParams {
  width: number;
  height: number;
  /** Quality divisor (lower = higher internal resolution). */
  divisor: number;
  /** Quantization step for the internal size (keeps the cache key space coarse). */
  quantStep: number;
  radius: number;
  border: number;
  lightness: number;
  alpha: number;
  displace: number;
  blend?: string;
}

/** Quantized internal map dimensions for a given rendered size + quality. */
export function quantizedSize(width: number, height: number, divisor: number, quantStep: number) {
  const newwidth = Math.max(8, Math.round(width / divisor / quantStep) * quantStep);
  const newheight = Math.max(8, Math.round(height / divisor / quantStep) * quantStep);
  return { newwidth, newheight };
}

export function buildDisplacementSvg(p: DisplacementParams): string {
  const { width, height, divisor, quantStep, radius, border, lightness, alpha, displace } = p;
  const blend = p.blend ?? 'difference';
  const { newwidth, newheight } = quantizedSize(width, height, divisor, quantStep);
  const borderWidth = Math.min(newwidth, newheight) * (border * 0.5);
  const effectiveRadius = Math.min(radius, width / 2, height / 2) / divisor;

  return `
      <svg viewBox="0 0 ${newwidth} ${newheight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="blue" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${newwidth}" height="${newheight}" fill="black"/>
        <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#red)" />
        <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#blue)" style="mix-blend-mode: ${blend}" />
        <rect x="${borderWidth}" y="${borderWidth}" width="${newwidth - borderWidth * 2}" height="${newheight - borderWidth * 2}" rx="${effectiveRadius}" fill="hsl(0 0% ${lightness}% / ${alpha})" style="filter:blur(${displace}px)" />
      </svg>
    `;
}

export function buildDisplacementDataUri(p: DisplacementParams): string {
  return `data:image/svg+xml,${encodeURIComponent(buildDisplacementSvg(p))}`;
}
