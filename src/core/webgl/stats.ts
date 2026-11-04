import { sharedValue } from '../shared';
import type { WebGLStatus } from './types';

// Counters of one engine frame, by index (see `getGlassEngineStats` in `simple-liquid-glass/webgl`). Indices instead of
// named fields keep the counting code small in every entry.
export const VISIBLE = 0, DRAWN = 1, MISSED = 2, UPLOADS = 3, UPLOAD_BYTES = 4, FRAME_MS = 5;
export interface SurfaceRecord { panel: HTMLElement; gl: WebGLRenderingContext; scene: boolean; status: WebGLStatus }

// Shared by independently bundled entries. Nothing is counted until a reader turns `on`; surfaces always register
// (one Set entry per surface lifetime) so the first read already lists them. `frame` collects the running frame,
// `last` holds the previous completed one and `total` everything since counting started.
export const stats = sharedValue('stats.v1', () => ({ on: false, frames: 0, frame: new Float64Array(6),
  last: new Float64Array(6), total: new Float64Array(6), surfaces: new Set<SurfaceRecord>() }));

export function countUpload(bytes: number) { if (stats.on) { stats.frame[UPLOADS]++; stats.frame[UPLOAD_BYTES] += bytes; } }

/** Closes the frame the shared ticker started at `start` (performance.now()). */
export function endFrame(start: number) {
  const { frame, total } = stats;
  frame[FRAME_MS] = performance.now() - start;
  for (let i = 0; i < 6; i++) total[i] += frame[i];
  stats.last.set(frame); frame.fill(0); stats.frames++;
}
