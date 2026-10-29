import { sharedValue } from '../shared';
export interface SnapshotPatch { canvas: HTMLCanvasElement; x: number; y: number }
export interface SnapshotUpdate { source: object; version: number; previous: number; patches: SnapshotPatch[] | null; samplingWidth?:number; samplingHeight?:number;
 /** Present only on a raster promoted above the original capture budget. */
 rejectAlignment?:()=>void; rejected?:boolean }
const RECOVERABLE='LiquidGlassRecoverableTexture';
/** The current snapshot cannot be used by this context, but a replacement is queued. Skip the frame. */
export const recoverableTextureError=(message:string)=>Object.assign(new Error(message),{name:RECOVERABLE});
export const isRecoverableTextureError=(error:unknown)=>(error as Error|undefined)?.name===RECOVERABLE;
const updates=sharedValue('snapshotUpdates.v1',()=>new WeakMap<HTMLCanvasElement,SnapshotUpdate>());
/** A completed immutable CPU snapshot may update a live, versioned source texture. */
export function markSnapshot(canvas:HTMLCanvasElement,update:SnapshotUpdate){updates.set(canvas,update)}
export const snapshotUpdate=(image:TexImageSource)=>updates.get(image as HTMLCanvasElement);
