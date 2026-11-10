/**
 * `simple-liquid-glass/next`: the 6.0 renderer core, experimental. The scene is data, a renderer draws it
 * from a worker when the browser allows, and springs run on the renderer's clock.
 *
 * @experimental Everything here may change before 6.0.
 */
export type {
  BackdropOptions,
  GlassHost,
  GlassHostOptions,
  GlassLayer,
  GlassLayerOptions,
  GlassShape,
  GlassShapeOptions,
  GlassStats,
  Placement,
} from './api';
export { createGlassHost } from './host';
export { MAX_TEXTURES, type MaterialDefinition, type UniformValue } from './materials';
export {
  DEFAULT_SPRING,
  MAX_SHAPES,
  MAX_WORKER_LAYERS,
  type BackdropFrame,
  type FrameStats,
  type LayerStatus,
  type Rect,
  type ShapeBox,
  type SpringConfig,
} from './scene';
export { supportsWorkerCanvas, type Thread } from './transport';
export { GLASS_DARK, GLASS_LIGHT, GLASS_MATERIAL } from './shader';
