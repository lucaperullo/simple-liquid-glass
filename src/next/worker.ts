/**
 * The worker entry: the renderer of `renderer.ts`, fed by messages. Nothing else lives here, so the worker
 * and the page thread cannot drift apart.
 */
import { createRenderer } from './renderer';
import type { HostMessage, RendererMessage } from './scene';

/** The parts of a dedicated worker's global scope this file uses (the DOM typings describe a window). */
interface WorkerScope {
  postMessage(message: RendererMessage): void;
  onmessage: ((event: MessageEvent<HostMessage>) => void) | null;
  requestAnimationFrame?(callback: (now: number) => void): number;
}

const scope = self as unknown as WorkerScope;

const renderer = createRenderer({
  requestFrame: (callback) => scope.requestAnimationFrame?.(callback),
  post: (message) => {
    scope.postMessage(message);
  },
  now: () => performance.now(),
  origin: performance.timeOrigin,
});

scope.onmessage = (event) => {
  renderer.handle(event.data);
};

// The host waits for this before it hands over any canvas: a transfer cannot be undone, so a worker that
// failed to start, or that has no frame clock, must be found out first.
scope.postMessage({ type: 'ready', frames: typeof scope.requestAnimationFrame === 'function' });
