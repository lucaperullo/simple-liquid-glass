/** Squared Euclidean distance transform, using the lower envelope of parabolas. */
function distanceTransform(values: Float64Array, length: number, result: Float64Array, sites: Int32Array, edges: Float64Array) {
  let k = 0;
  sites[0] = 0;
  edges[0] = -Infinity;
  edges[1] = Infinity;
  for (let q = 1; q < length; q++) {
    let intersection: number;
    do {
      const p = sites[k];
      intersection = ((values[q] + q * q) - (values[p] + p * p)) / (2 * (q - p));
      if (intersection > edges[k]) break;
      k--;
    } while (k >= 0);
    sites[++k] = q;
    edges[k] = intersection!;
    edges[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < length; q++) {
    while (edges[k + 1] < q) k++;
    result[q] = (q - sites[k]) ** 2 + values[sites[k]];
  }
}

function glyphDistance(rgba: Uint8ClampedArray, width: number, height: number) {
  // A neutral border makes glyphs touching the raster edge well-defined too.
  const w = width + 2, h = height + 2, size = Math.max(w, h);
  const grid = new Float64Array(w * h);
  const values = new Float64Array(size), result = new Float64Array(size);
  const sites = new Int32Array(size), edges = new Float64Array(size + 1);
  const far = w * w + h * h;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    grid[(y + 1) * w + x + 1] = rgba[(y * width + x) * 4 + 3] >= 128 ? far : 0;
  }
  for (let y = 0; y < h; y++) {
    values.set(grid.subarray(y * w, (y + 1) * w));
    distanceTransform(values, w, result, sites, edges);
    grid.set(result.subarray(0, w), y * w);
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) values[y] = grid[y * w + x];
    distanceTransform(values, h, result, sites, edges);
    for (let y = 0; y < h; y++) grid[y * w + x] = result[y];
  }
  const distance = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    distance[y * width + x] = Math.max(0, Math.sqrt(grid[(y + 1) * w + x + 1]) - .5);
  }
  return distance;
}

function smoothSurface(surface: Float32Array, width: number, height: number, sigma: number) {
  const radius = Math.ceil(3 * sigma), kernel = new Float32Array(2 * radius + 1);
  let total = 0;
  for (let x = -radius; x <= radius; x++) total += kernel[x + radius] = Math.exp(-x * x / (2 * sigma * sigma));
  for (let x = 0; x < kernel.length; x++) kernel[x] /= total;
  const horizontal = new Float32Array(surface.length), result = new Float32Array(surface.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    for (let offset = -radius; offset <= radius; offset++) {
      if (x + offset >= 0 && x + offset < width) horizontal[y * width + x] += surface[y * width + x + offset] * kernel[offset + radius];
    }
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    for (let offset = -radius; offset <= radius; offset++) {
      if (y + offset >= 0 && y + offset < height) result[y * width + x] += horizontal[(y + offset) * width + x] * kernel[offset + radius];
    }
  }
  return result;
}

const smoothstep = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/**
 * Glyph adaptation of the main library's material lens: spherical cap + inner
 * meniscus, with a soft contour and directional sheen. Unlike a rounded rectangle,
 * glyphs have medial-axis junctions. Differentiate a smoothed scalar surface instead
 * of normalizing nearest-edge vectors, which would snap across those junctions.
 */
export function buildGlyphField(rgba: Uint8ClampedArray, width: number, height: number, bevel: number) {
  const distance = glyphDistance(rgba, width, height);
  const band = Math.max(1, bevel), sigma = Math.max(.8, band * .2);
  const surface = new Float32Array(distance.length);
  // Material lens proportions from the workspace's native material profile.
  // The spherical-cap radius is (a² + h²) / 2h, with a normalized half-stroke a=1.
  const curvature = .3, bend = .45;
  const radius = (1 + curvature * curvature) / (2 * curvature);
  const rimSlope = 1 / Math.sqrt(radius * radius - 1);
  const samples = 256, profile = new Float32Array(samples + 1);
  for (let i = 1; i <= samples; i++) {
    const t = (i - .5) / samples, s = 1 - t;
    const dome = s / Math.sqrt(radius * radius - s * s) / rimSlope;
    // Same inner-lip shape as the main lens: zero at both ends, peak inside.
    const meniscus = 6.75 * s * s * (1 - s);
    const slope = .5 * (curvature * dome + bend * meniscus) * smoothstep(t / .2);
    profile[i] = profile[i - 1] + slope * band / samples;
  }
  for (let i = 0; i < distance.length; i++) {
    const position = Math.min(samples, distance[i] / band * samples);
    const low = Math.floor(position), high = Math.min(samples, low + 1);
    surface[i] = profile[low] + (profile[high] - profile[low]) * (position - low);
  }
  const heightField = smoothSurface(surface, width, height, sigma);
  const sample = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height ? 0 : heightField[y * width + x];
  const displacement = new Uint8ClampedArray(rgba.length), highlight = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x, i = index * 4, depth = distance[index];
    displacement[i] = displacement[i + 1] = 128;
    displacement[i + 3] = 255;
    if (depth <= 0) continue;
    const gx = (sample(x + 1, y) - sample(x - 1, y)) / 2;
    const gy = (sample(x, y + 1) - sample(x, y - 1)) / 2;
    const feather = smoothstep(depth / (sigma * 1.5));
    displacement[i] = Math.round(128 + gx * feather * 255);
    displacement[i + 1] = Math.round(128 + gy * feather * 255);
    const magnitude = Math.hypot(gx, gy);
    const light = magnitude > .0001 ? Math.max(0, (gx + gy) / (Math.SQRT2 * magnitude)) : 0;
    const sheen = Math.max(0, 1 - depth / (band * .35)) ** 1.5;
    const glow = (1 - smoothstep(depth / band)) ** 1.5;
    highlight[i] = highlight[i + 1] = highlight[i + 2] = 255;
    highlight[i + 3] = Math.round(rgba[i + 3] * (.32 * sheen * (.16 + .84 * light ** 1.6) + .1 * glow * (.6 + .4 * light)));
  }
  return { displacement, highlight };
}
