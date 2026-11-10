/** @jest-environment node */
import { createGlassHost, MAX_SHAPES, MAX_WORKER_LAYERS, type LayerStatus } from '../next';
import { readShape, type HostMessage, type RendererMessage } from '../next/scene';

/** As much of a canvas element as the host and a renderer without WebGL touch. */
function fakeCanvas(): HTMLCanvasElement & { transferred: number } {
  const canvas = {
    width: 0,
    height: 0,
    transferred: 0,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
    getContext: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    transferControlToOffscreen() {
      canvas.transferred++;
      return new (globalThis as unknown as { OffscreenCanvas: new () => object }).OffscreenCanvas();
    },
  };
  return canvas as unknown as HTMLCanvasElement & { transferred: number };
}

/** A worker that records what it is sent; the test plays the worker's side by hand. */
class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: { data: RendererMessage }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  readonly sent: { message: HostMessage; transfer: Transferable[] }[] = [];
  constructor(readonly url: string | URL) {
    FakeWorker.last = this;
  }
  postMessage(message: HostMessage, transfer: Transferable[]): void {
    this.sent.push({ message, transfer });
  }
  terminate(): void {
    this.terminated = true;
  }
  says(message: RendererMessage): void {
    this.onmessage?.({ data: message });
  }
}

const globals = globalThis as Record<string, unknown>;
const tick = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

/** A browser that can draw WebGL from a worker, as far as the host's check can tell. */
function installWorkerBrowser(): void {
  globals.Worker = FakeWorker;
  globals.OffscreenCanvas = class {
    getContext(): object {
      return { getExtension: () => null };
    }
  };
  globals.HTMLCanvasElement = class {
    transferControlToOffscreen(): void {}
  };
}

afterEach(() => {
  for (const name of ['Worker', 'OffscreenCanvas', 'HTMLCanvasElement']) delete globals[name];
  FakeWorker.last = null;
});

describe('next: host', () => {
  it('draws on the page thread when a worker cannot take a canvas', async () => {
    const host = createGlassHost({ workerUrl: 'https://example.test/next-worker.js' });
    await expect(host.ready).resolves.toBe('page');
    expect(host.thread).toBe('page');
    host.destroy();
  });

  it('reports a canvas without WebGL as unsupported instead of throwing', async () => {
    const statuses: LayerStatus[] = [];
    const host = createGlassHost({ thread: 'page' });
    const canvas = fakeCanvas();
    const layer = host.addLayer(canvas, { scale: 2, onStatus: (status) => statuses.push(status) });
    const shape = layer.addShape({ x: 0, y: 0, width: 10, height: 10, radius: 2 });
    expect(layer.status).toBe('pending');

    await host.ready;
    shape.set({ x: 5 });
    await tick();
    expect(layer.status).toBe('unsupported');
    expect(statuses).toEqual(['unsupported']);
    expect(canvas.transferred).toBe(0);
    await expect(host.stats()).resolves.toMatchObject({ thread: 'page', frames: 0 });
    host.destroy();
  });

  it('hands canvases to the worker only after the worker has started', async () => {
    installWorkerBrowser();
    const host = createGlassHost({ workerUrl: 'https://example.test/next-worker.js', reducedMotion: true });
    const canvas = fakeCanvas();
    const layer = host.addLayer(canvas, { scale: 2, params: { rim: 30 }, lean: true });
    const first = layer.addShape({ x: 0, y: 0, width: 10, height: 20, radius: 2 });
    layer.addShape({ x: 40, y: 0, width: 10, height: 20, radius: 2 }, { spring: null });
    first.set({ x: 4 });
    await tick();

    const worker = FakeWorker.last!;
    expect(String(worker.url)).toBe('https://example.test/next-worker.js');
    expect(host.thread).toBe('pending');
    expect(worker.sent).toEqual([]);
    expect(canvas.transferred).toBe(0);

    worker.says({ type: 'ready', frames: true });
    await expect(host.ready).resolves.toBe('worker');
    expect(canvas.transferred).toBe(1);
    expect(worker.sent.map(({ message }) => message.type)).toEqual(['motion', 'layer-add', 'shapes-set']);

    const [motion, added, shapes] = worker.sent.map(({ message }) => message);
    expect(motion).toEqual({ type: 'motion', reduced: true });
    expect(added).toMatchObject({
      type: 'layer-add',
      view: { left: 10, top: 20, width: 100, height: 50 },
      fixed: false,
      scale: 2,
      material: 'glass',
      lean: true,
    });
    expect(worker.sent[1]!.transfer).toHaveLength(1);
    // Two shapes added and one of them moved in the same task: one message.
    if (shapes?.type !== 'shapes-set') throw new Error('expected a shapes-set message');
    expect(shapes.batch.ids).toHaveLength(2);
    expect(readShape(shapes.batch, 0).box).toEqual({ x: 4, y: 0, width: 10, height: 20, radius: 2 });
    expect(readShape(shapes.batch, 0).spring).toEqual({ stiffness: 170, damping: 18 });
    expect(readShape(shapes.batch, 1).spring).toBeNull();
    expect(worker.sent[2]!.transfer).toHaveLength(3);

    worker.says({
      type: 'layer-status',
      layer: (added as { layer: number }).layer,
      status: 'drawing',
      detail: '',
    });
    expect(layer.status).toBe('drawing');

    const stats = host.stats();
    const request = worker.sent.at(-1)!.message;
    if (request.type !== 'stats') throw new Error('expected a stats message');
    worker.says({
      type: 'stats',
      request: request.request,
      stats: { frames: 12, fps: 120, p50: 8.3, p95: 8.4, drawMs: 0.2, scrollError: 0, scrollErrorMax: 0 },
    });
    await expect(stats).resolves.toMatchObject({ frames: 12, fps: 120, thread: 'worker' });

    host.destroy();
    expect(worker.terminated).toBe(true);
  });

  it('falls back to the page thread, canvas untouched, when the worker fails to start', async () => {
    installWorkerBrowser();
    const host = createGlassHost({ workerUrl: 'https://example.test/next-worker.js' });
    const canvas = fakeCanvas();
    const layer = host.addLayer(canvas, { scale: 1 });
    await tick();
    FakeWorker.last!.onerror?.();
    await expect(host.ready).resolves.toBe('page');
    expect(FakeWorker.last!.terminated).toBe(true);
    expect(canvas.transferred).toBe(0);
    expect(layer.status).toBe('unsupported');
    host.destroy();
  });

  it('falls back to the page thread when the worker has no frame clock', async () => {
    installWorkerBrowser();
    const host = createGlassHost({ workerUrl: 'https://example.test/next-worker.js' });
    await tick();
    FakeWorker.last!.says({ type: 'ready', frames: false });
    await expect(host.ready).resolves.toBe('page');
    host.destroy();
  });

  it('sends a jump as a shape without a spring, and removals after pending changes', async () => {
    installWorkerBrowser();
    const host = createGlassHost({ workerUrl: 'https://example.test/next-worker.js' });
    await tick();
    const worker = FakeWorker.last!;
    worker.says({ type: 'ready', frames: true });
    await host.ready;
    const layer = host.addLayer(fakeCanvas(), { scale: 1 });
    const shape = layer.addShape({ x: 0, y: 0, width: 10, height: 10, radius: 2 });
    await tick();
    worker.sent.length = 0;

    shape.set({ y: 30 }, { jump: true });
    shape.remove();
    shape.set({ y: 60 });
    await tick();

    expect(worker.sent.map(({ message }) => message.type)).toEqual(['shapes-set', 'shapes-remove']);
    const [moved] = worker.sent.map(({ message }) => message);
    if (moved?.type !== 'shapes-set') throw new Error('expected a shapes-set message');
    expect(readShape(moved.batch, 0)).toMatchObject({ box: { y: 30 }, spring: null });
    host.destroy();
  });

  it('moves a backdrop without sending its picture again', async () => {
    installWorkerBrowser();
    const host = createGlassHost({ workerUrl: 'https://example.test/next-worker.js' });
    await tick();
    const worker = FakeWorker.last!;
    worker.says({ type: 'ready', frames: true });
    await host.ready;
    const layer = host.addLayer(fakeCanvas(), { scale: 1 });
    await tick();
    worker.sent.length = 0;

    const rect = { left: 4, top: 8, width: 300, height: 200 };
    layer.moveBackdrop({ rect, fixed: true });
    expect(worker.sent.map(({ message }) => message)).toEqual([
      { type: 'layer-backdrop', layer: expect.any(Number) as number, frame: null, rect, fixed: true },
    ]);
    expect(worker.sent[0]?.transfer).toEqual([]);
    host.destroy();
  });

  it('starts no more layers in a worker than a worker can keep alive', async () => {
    installWorkerBrowser();
    const host = createGlassHost({ workerUrl: 'https://example.test/next-worker.js' });
    await tick();
    FakeWorker.last!.says({ type: 'ready', frames: true });
    await host.ready;
    const canvases = Array.from({ length: MAX_WORKER_LAYERS + 1 }, fakeCanvas);
    const layers = canvases.map((canvas) => host.addLayer(canvas, { scale: 1 }));
    const extra = layers.at(-1)!;
    expect(extra.status).toBe('unsupported');
    expect(canvases.at(-1)!.transferred).toBe(0);
    expect(canvases.slice(0, -1).map((canvas) => canvas.transferred)).toEqual([1, 1, 1, 1]);

    // A removed layer makes room for another.
    layers[0]!.remove();
    const replacement = fakeCanvas();
    host.addLayer(replacement, { scale: 1 });
    expect(replacement.transferred).toBe(1);
    host.destroy();
  });

  it('refuses more shapes than a layer can hold', () => {
    const host = createGlassHost({ thread: 'page' });
    const layer = host.addLayer(fakeCanvas(), { scale: 1 });
    for (let i = 0; i < MAX_SHAPES; i++) layer.addShape({ x: i, y: 0, width: 1, height: 1, radius: 0 });
    expect(() => layer.addShape({ x: 0, y: 0, width: 1, height: 1, radius: 0 })).toThrow(RangeError);
    host.destroy();
  });
});
