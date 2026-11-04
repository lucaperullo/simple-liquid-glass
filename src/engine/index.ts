/**
 * `simple-liquid-glass/engine` — @experimental.
 *
 * A framework-agnostic extension API: custom WebGL materials (G1) with bleed and scissored draws
 * (G2), the liveness/draw-result protocol (G3) and per-context shared resources (G10), built on
 * top of the package's existing shared WebGL context, frame loop and backdrop leases. No React
 * import — usable from the web component, from `simple-liquid-glass`'s own WebGL path, or
 * standalone.
 *
 * This entry's types and runtime behaviour may change in a minor release while `ENGINE_API`
 * stays `1` (see the README's "Engine API (experimental)" section and the CHANGELOG). It never
 * imports, detects or special-cases any third-party package: materials are plain strings and
 * functions handed in by the caller.
 */
export { getGlassEngine } from '../core/engine/engine';
export { ENGINE_API } from '../core/engine/types';
export type {
  BackdropInput,
  DrawContext,
  DrawResult,
  EngineCapabilities,
  EngineStats,
  FrameInfo,
  GlassEngine,
  Material,
  MaterialDefinition,
  Resource,
  ResourceDefinition,
  Surface,
  SurfaceDiagnostics,
  SurfaceOptions,
  SurfaceStatus,
} from '../core/engine/types';
