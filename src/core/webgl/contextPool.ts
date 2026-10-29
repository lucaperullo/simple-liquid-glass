import { sharedValue } from '../shared';
interface Entry { canvas: HTMLCanvasElement | OffscreenCanvas; users: number }
interface Pool { entry?: Entry; bitmapEntry?: Entry; frames: Set<() => void>; raf: number; ticking: boolean; readers?: Map<()=>void,()=>void> }
const pool = sharedValue<Pool>('context.v1', () => ({ frames: new Set(), raf: 0, ticking: false }));
/** A single offscreen WebGL context; each surface keeps its own FBOs and DOM canvas. */
export function acquireContextCanvas(bitmap=false) {
  const key=bitmap?'bitmapEntry':'entry';
  pool[key]??={canvas:bitmap?new OffscreenCanvas(1,1):document.createElement('canvas'),users:0};
  const entry=pool[key]!;
  entry.users++;
  let released = false;
  return {
    canvas: entry.canvas,
    release() {
      if (released) return;
      released = true;
      if (--entry.users) return;
      if(pool[key]===entry)pool[key]=undefined;
      (entry.canvas.getContext('webgl') as WebGLRenderingContext|null)?.getExtension?.('WEBGL_lose_context')?.loseContext();
      entry.canvas.width = entry.canvas.height = 0;
    }
  };
}
function tick() {
  pool.raf = 0; pool.ticking = true;
  try { const frames=[...pool.frames];for(const frame of frames)if(pool.frames.has(frame))pool.readers?.get(frame)?.();for(const frame of frames)if(pool.frames.has(frame))frame(); }
  finally { pool.ticking = false; if (pool.frames.size) pool.raf = requestAnimationFrame(tick); }
}
export function subscribeFrame(frame: () => void,measure?:()=>void) {
  pool.frames.add(frame);if(measure)(pool.readers??=new Map()).set(frame,measure);
  if (!pool.raf && !pool.ticking) pool.raf = requestAnimationFrame(tick);
  return () => {
    pool.frames.delete(frame);pool.readers?.delete(frame);
    if (!pool.frames.size) { cancelAnimationFrame(pool.raf); pool.raf = 0; }
  };
}
