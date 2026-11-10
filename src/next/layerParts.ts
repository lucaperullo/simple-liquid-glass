/** Small pieces of layer.ts. */
import { MAX_SHAPES, type LayerStatus } from './scene';

/** Shape counts a program is compiled for; a layer uses the smallest that holds its shapes. */
export const CAPACITIES = [4, 8, 16, MAX_SHAPES] as const;

export const CONTEXT_OPTIONS: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: 'high-performance',
};

/** `getContext` as both kinds of canvas offer it; their overloads do not unify on the union. */
export interface ContextSource {
  getContext(kind: 'webgl', options: WebGLContextAttributes): WebGLRenderingContext | null;
}

/** What a layer tells its renderer. */
export interface LayerEvents {
  status(status: Exclude<LayerStatus, 'pending'>, detail: string): void;
  /** Something changed outside a message (a restored context): draw again. */
  wake(): void;
}
