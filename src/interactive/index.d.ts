import { ForwardRefExoticComponent, RefAttributes, RefObject } from 'react';
import { LiquidGlassProps, LiquidGlassHandle } from '../index';

export interface PointerElasticOptions {
  /** How far the glass leans toward the cursor. 0 = rigid. Default 0.15. */
  elasticity?: number;
  /** Max translate in px at the strongest lean. Default 18. */
  maxShift?: number;
  /** Spring pull per frame (0–1). Default 0.18. */
  stiffness?: number;
  /** Velocity retained per frame (0–1). Default 0.78. */
  damping?: number;
  /** Pointer-tracked specular highlight (sets --lg-mx/--lg-my). Default true. */
  specular?: boolean;
}

export declare function usePointerElastic(
  ref: RefObject<LiquidGlassHandle | null>,
  options?: PointerElasticOptions
): void;

/** When the animated refraction runs: always, only on hover, or only while pressed. */
export type LiquidTrigger = 'always' | 'hover' | 'press';

export interface LiquidGlassInteractiveProps extends LiquidGlassProps, PointerElasticOptions {
  /** When the animated refraction runs. `hover`/`press` are idle (zero cost) until interaction. @default 'always' */
  liquidTrigger?: LiquidTrigger;
  /** A refractive bump that distorts the backdrop toward the cursor. @default false */
  followPointer?: boolean;
}

export declare const LiquidGlassInteractive: ForwardRefExoticComponent<
  LiquidGlassInteractiveProps & RefAttributes<LiquidGlassHandle>
>;

export default LiquidGlassInteractive;
