/** @jest-environment node */
// The host of simple-liquid-glass/next/stack: the engine with stacking.ts saying `true`. What the renderer
// draws from these messages is tested in real browsers (experiments/next-core/stack.test.mjs).
import { createGlassHost } from '../next';
import type { HostMessage, RendererMessage } from '../next/scene';

jest.mock('../next/stacking', () => ({ STACKING: true }));

function fakeCanvas(): HTMLCanvasElement & { transferred: number } {
  const canvas = {
    transferred: 0,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
    transferControlToOffscreen() {
      canvas.transferred++;
      return new (globalThis as unknown as { OffscreenCanvas: new () => object }).OffscreenCanvas();
    },
  };
  return canvas as unknown as HTMLCanvasElement & { transferred: number };
}

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: { data: RendererMessage }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly sent: HostMessage[] = [];
  constructor(readonly url: string | URL) {
    FakeWorker.last = this;
  }
  postMessage(message: HostMessage): void {
    this.sent.push(message);
  }
  terminate(): void {}
}

const globals = globalThis as Record<string, unknown>;
const tick = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

beforeEach(() => {
  globals.Worker = FakeWorker;
  globals.OffscreenCanvas = class {
    getContext(): object {
      return { getExtension: () => null };
    }
  };
  globals.HTMLCanvasElement = class {
    transferControlToOffscreen(): void {}
  };
});

afterEach(() => {
  for (const name of ['Worker', 'OffscreenCanvas', 'HTMLCanvasElement']) delete globals[name];
  FakeWorker.last = null;
});

describe('next/stack: host', () => {
  it('adds a stacked layer without a canvas of its own, over the layer whose canvas it shares', async () => {
    const host = createGlassHost({ workerUrl: 'https://example.test/next-stack-worker.js' });
    await tick();
    const worker = FakeWorker.last;
    if (!worker) throw new Error('expected a worker');
    worker.onmessage?.({ data: { type: 'ready', frames: true } });
    await host.ready;
    const canvas = fakeCanvas();
    const base = host.addLayer(canvas, { scale: 1.5, fixed: true });
    const first = base.stack?.();
    // A layer stacked on a stacked layer is drawn into the same canvas, after it.
    const second = first?.stack?.({ lean: true });
    second?.setClip?.({ left: 4, top: 8, width: 30, height: 20 });
    second?.addShape({ x: 0, y: 0, width: 10, height: 10, radius: 2 });
    await tick();

    expect(canvas.transferred).toBe(1);
    const added = worker.sent.flatMap((message) => (message.type === 'layer-add' ? [message] : []));
    const [root, one, two] = added;
    expect(added).toHaveLength(3);
    expect(root?.canvas).not.toBeNull();
    expect(root?.over).toBeUndefined();
    // The base's canvas, scale and place.
    expect(one).toMatchObject({ canvas: null, over: root?.layer, scale: 1.5, fixed: true, view: root?.view });
    expect(two).toMatchObject({ canvas: null, over: root?.layer, lean: true });
    expect(worker.sent).toContainEqual({
      type: 'layer-clip',
      layer: two?.layer,
      clip: { left: 4, top: 8, width: 30, height: 20 },
    });
    expect(worker.sent.some((message) => message.type === 'shapes-set' && message.layer === two?.layer)).toBe(
      true,
    );
    host.destroy();
  });

  it('counts a stack as one of the worker`s layers', async () => {
    const host = createGlassHost({ workerUrl: 'https://example.test/next-stack-worker.js' });
    await tick();
    FakeWorker.last?.onmessage?.({ data: { type: 'ready', frames: true } });
    await host.ready;
    const statuses: string[] = [];
    const base = host.addLayer(fakeCanvas(), { scale: 1 });
    for (let i = 0; i < 8; i++) base.stack?.({ onStatus: (status) => statuses.push(status) });
    await tick();
    expect(statuses).toEqual([]);
    host.destroy();
  });
});
