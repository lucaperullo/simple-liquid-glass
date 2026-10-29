import { sharedValue } from '../shared';
/** Versioned internal canvases can skip uploads; arbitrary user canvases remain live each frame. */
const versions = sharedValue('canvasFrames.v1', () => new WeakMap<HTMLCanvasElement, number>());
export const canvasFrame = (canvas: HTMLCanvasElement) => versions.get(canvas);
export function markCanvasFrame(canvas: HTMLCanvasElement) { versions.set(canvas, (versions.get(canvas) ?? 0) + 1); }

// A shared synchronous render batch samples a live user canvas once. Explicit frame
// versions remain positive; negative epochs cannot collide with those versions.
const liveBatch=sharedValue('liveCanvasBatch.v1',()=>({version:0,pending:false}));
export function liveCanvasFrame(){
 if(!liveBatch.pending){liveBatch.pending=true;liveBatch.version--;const clear=()=>{liveBatch.pending=false};if(typeof queueMicrotask==='function')queueMicrotask(clear);else Promise.resolve().then(clear);}
 return liveBatch.version;
}
