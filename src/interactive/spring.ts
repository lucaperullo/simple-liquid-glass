/**
 * Tiny zero-dependency spring integrator for pointer-reactive elasticity.
 * Pure + framework-agnostic so it can be unit-tested without a DOM.
 */

export interface SpringState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface SpringConfig {
  /** Pull toward the target per step (0–1). Higher = snappier. */
  stiffness: number;
  /** Velocity retained per step (0–1). Lower = more damped. */
  damping: number;
}

/** Advance the spring one step toward (tx, ty). Returns a new state (does not mutate). */
export function stepSpring(s: SpringState, tx: number, ty: number, cfg: SpringConfig): SpringState {
  const vx = (s.vx + (tx - s.x) * cfg.stiffness) * cfg.damping;
  const vy = (s.vy + (ty - s.y) * cfg.stiffness) * cfg.damping;
  return { x: s.x + vx, y: s.y + vy, vx, vy };
}

/** True when the spring has effectively reached the target and stopped moving. */
export function isSettled(s: SpringState, tx: number, ty: number, eps = 0.01): boolean {
  return (
    Math.abs(s.vx) < eps &&
    Math.abs(s.vy) < eps &&
    Math.abs(tx - s.x) < eps &&
    Math.abs(ty - s.y) < eps
  );
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
