import { createRenderer } from './renderer';
import { transferables, type GlassCanvas, type HostMessage, type RendererMessage } from './scene';
import { WORKER_SOURCE } from './workerSource';

/** Where the renderer runs. */
export type Thread = 'worker' | 'page';

/** The host's line to its renderer, wherever that is. */
export interface Transport {
  readonly thread: Thread;
  send(message: HostMessage): void;
  /** The canvas to put in a `layer-add` message for a canvas element. Hands it over for good in a worker. */
  canvas(element: HTMLCanvasElement): GlassCanvas;
  close(): void;
}

export interface ConnectOptions {
  readonly thread: 'auto' | 'page';
  readonly workerUrl: string | URL | undefined;
}

/**
 * Whether this browser can draw WebGL into a canvas from a worker. The context is created here, on an
 * off-screen canvas, because a browser can have `OffscreenCanvas` without WebGL on it.
 */
export function supportsWorkerCanvas(): boolean {
  if (
    typeof Worker !== 'function' ||
    typeof OffscreenCanvas !== 'function' ||
    typeof HTMLCanvasElement !== 'function' ||
    !('transferControlToOffscreen' in HTMLCanvasElement.prototype)
  ) {
    return false;
  }
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

/** Starts a renderer: in a worker when asked for and possible, on the page thread otherwise. */
export async function connect(
  options: ConnectOptions,
  receive: (message: RendererMessage) => void,
): Promise<Transport> {
  if (options.thread === 'auto' && supportsWorkerCanvas()) {
    const worker = await startWorker(options.workerUrl, receive);
    if (worker) return worker;
  }
  return pageTransport(receive);
}

/** Resolves once the worker has said it is ready; null if it cannot start or cannot schedule frames. */
function startWorker(
  workerUrl: string | URL | undefined,
  receive: (message: RendererMessage) => void,
): Promise<Transport | null> {
  const blobUrl =
    workerUrl === undefined && WORKER_SOURCE !== ''
      ? URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
      : null;
  const url = workerUrl ?? blobUrl;
  if (url === null) return Promise.resolve(null);
  const release = (): void => {
    if (blobUrl !== null) URL.revokeObjectURL(blobUrl);
  };

  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch {
      // A Content-Security-Policy that forbids blob: workers throws here in some browsers.
      release();
      resolve(null);
      return;
    }
    const giveUp = (): void => {
      worker.terminate();
      release();
      resolve(null);
    };
    // ...and fires an error event in others. Either way no canvas has been handed over yet.
    worker.onerror = giveUp;
    worker.onmessage = (event: MessageEvent<RendererMessage>) => {
      const message = event.data;
      if (message.type !== 'ready') {
        receive(message);
        return;
      }
      if (!message.frames) {
        giveUp();
        return;
      }
      release();
      worker.onerror = null;
      resolve({
        thread: 'worker',
        send: (hostMessage) => {
          worker.postMessage(hostMessage, transferables(hostMessage));
        },
        canvas: (element) => element.transferControlToOffscreen(),
        close: () => {
          worker.terminate();
        },
      });
    };
  });
}

function pageTransport(receive: (message: RendererMessage) => void): Transport {
  const renderer = createRenderer({
    requestFrame:
      typeof requestAnimationFrame === 'function'
        ? (callback) => requestAnimationFrame(callback)
        : (callback) =>
            setTimeout(() => {
              callback(performance.now());
            }, 16),
    post: receive,
    now: () => performance.now(),
    origin: performance.timeOrigin,
  });
  return {
    thread: 'page',
    send: (message) => {
      renderer.handle(message);
    },
    canvas: (element) => element,
    close: () => {
      renderer.handle({ type: 'destroy' });
    },
  };
}
