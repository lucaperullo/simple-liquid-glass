import { buildGlyphField, glyphFieldSource } from './optics';

/** Encoded lens images for one rasterized word: the displacement map, the sheen and the glyph mask. */
export interface GlyphOptics { map: string; highlight: string; mask: string; glyphs: ImageData }

interface Built { displacement: Uint8ClampedArray; highlight: Uint8ClampedArray; encoded?: [Blob, Blob, Blob] }

/*
 * Building a word's field (distance transform, smoothing) and encoding three PNGs costs milliseconds per word on
 * the main thread, which is exactly when a page animates its headings in. Builds therefore run in a worker, which
 * also encodes the PNGs when it has OffscreenCanvas, and identical words (same text, font, size and bevel) share one
 * build. Without workers (CSP, old engines) the same code runs inline.
 */
const CACHE_LIMIT = 96;
const cache = new Map<string, Promise<GlyphOptics>>();
let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (built: Built) => void; reject: (error: unknown) => void }>();

function startWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const source = `${glyphFieldSource()}
const encode = async (data, width, height) => {
  if (typeof OffscreenCanvas === 'undefined') return undefined;
  const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d');
  if (!context) return undefined;
  context.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
};
onmessage = async ({ data: { id, pixels, width, height, bevel } }) => {
  try {
    const field = __buildGlyphField(pixels, width, height, bevel);
    const blobs = await Promise.all([encode(field.displacement, width, height), encode(field.highlight, width, height), encode(pixels, width, height)]);
    const encoded = blobs.every(Boolean) ? blobs : undefined;
    postMessage({ id, displacement: field.displacement, highlight: field.highlight, encoded }, [field.displacement.buffer, field.highlight.buffer]);
  } catch (error) { postMessage({ id, error: String(error) }); }
};`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error)); else request.resolve(data);
    };
    // A worker that cannot start (blocked by CSP) fails every request; those words build inline instead.
    worker.onerror = event => { event.preventDefault(); stopWorker(); };
  } catch { worker = null; }
  return worker;
}

function stopWorker() {
  worker?.terminate(); worker = null;
  for (const request of pending.values()) request.reject(new Error('worker unavailable'));
  pending.clear();
}

function buildInWorker(pixels: Uint8ClampedArray, width: number, height: number, bevel: number): Promise<Built> {
  const target = startWorker();
  if (!target) return Promise.reject(new Error('worker unavailable'));
  const id = nextId++, copy = new Uint8ClampedArray(pixels);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    target.postMessage({ id, pixels: copy, width, height, bevel }, [copy.buffer]);
  });
}

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string); reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

function encodeInline(data: Uint8ClampedArray, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return canvas.toDataURL();
}

async function build(glyphs: ImageData, bevel: number): Promise<GlyphOptics> {
  const { width, height, data } = glyphs;
  let built: Built;
  try { built = await buildInWorker(data, width, height, bevel); }
  catch { built = buildGlyphField(data, width, height, bevel); }
  const [map, highlight, mask] = built.encoded
    ? await Promise.all(built.encoded.map(dataUrl))
    : [encodeInline(built.displacement, width, height), encodeInline(built.highlight, width, height), encodeInline(data, width, height)];
  return { map, highlight, mask, glyphs };
}

/** The lens images for a rasterized word, built off the main thread and shared by identical words. */
export function glyphOptics(key: string, glyphs: ImageData, bevel: number): Promise<GlyphOptics> {
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const request = build(glyphs, bevel);
  cache.set(key, request);
  request.catch(() => cache.delete(key));
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return request;
}
