import { cacheGet, cacheSet } from '../displacementCache';

/** Rounded-rectangle geometry in CSS pixels. Scale is bounded to keep rim sampling monotonic. */
export function lensGeometry(width: number, height: number, radius: number, scale: number) {
  const w = Math.max(1, Number.isFinite(width) ? width : 1);
  const h = Math.max(1, Number.isFinite(height) ? height : 1);
  const half = Math.min(w, h) / 2;
  const r = Math.max(0, Math.min(half, Number.isFinite(radius) ? radius : 0));
  const band = Math.min(32, half * 0.45);
  return { width: w, height: h, radius: r, band,
    scale: Math.max(-band / 2, Math.min(band / 2, Number.isFinite(scale) ? scale : 0)) };
}

type Geometry = ReturnType<typeof lensGeometry>;

/** Inward normal times a smooth rim profile; zero outside and in the clear interior. */
export function sampleLensField(g: Geometry, x: number, y: number): [number, number] {
  const px = x - g.width / 2, py = y - g.height / 2;
  // A rounded optical rim inside sharp corners avoids a discontinuous diagonal normal.
  const radius = Math.max(g.radius, g.band);
  const qx = Math.abs(px) - (g.width / 2 - radius);
  const qy = Math.abs(py) - (g.height / 2 - radius);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  const length = Math.hypot(ox, oy);
  const depth = radius - length - Math.min(Math.max(qx, qy), 0);
  if (depth <= 0 || depth >= g.band) return [0, 0];
  let nx = 0, ny = 0;
  if (length > 0) { nx = ox / length; ny = oy / length; }
  else if (qx > qy) nx = 1;
  else ny = 1;
  const weight = Math.sin(Math.PI * depth / g.band) ** 2 / 2;
  return [nx ? -Math.sign(px) * nx * weight : 0, ny ? -Math.sign(py) * ny * weight : 0];
}

/** Bounded raster map; generated only for active mirrors and shared by equal-sized lenses. */
export function buildLensMap(g: Geometry, kind: 'displacement' | 'rim' = 'displacement'): string | undefined {
  const key = `lens:${kind}:${g.width}:${g.height}:${g.radius}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 256 / Math.max(g.width, g.height));
  canvas.width = Math.max(16, Math.ceil(g.width * ratio));
  canvas.height = Math.max(16, Math.ceil(g.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) return;
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const [dx, dy] = sampleLensField(g, (x + 0.5) * g.width / canvas.width, (y + 0.5) * g.height / canvas.height);
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = Math.round(128 + dx * 254 * Math.min(g.width, g.height) / g.width);
      pixels.data[i + 1] = Math.round(128 + dy * 254 * Math.min(g.width, g.height) / g.height);
      pixels.data[i + 3] = 255;
      if (kind === 'rim') {
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
        pixels.data[i + 3] = Math.round(510 * Math.hypot(dx, dy));
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  const uri = canvas.toDataURL();
  cacheSet(key, uri);
  return uri;
}
