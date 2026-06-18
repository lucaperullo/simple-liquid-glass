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
  /** Pointer-tracked specular highlight (sets --lg-mx/--lg-my), clipped to the glass radius. Opt-in. Default false. */
  specular?: boolean;
}

export declare function usePointerElastic(
  ref: RefObject<LiquidGlassHandle | null>,
  options?: PointerElasticOptions
): void;

/** When the animated refraction runs: always, only on hover, or only while pressed. */
export type LiquidTrigger = 'always' | 'hover' | 'press';

/** Click-ripple effect style: a single soft expanding disc, or a droplet-in-water burst of rings. */
export type RippleEffect = 'ripple' | 'drop';

export interface LiquidGlassInteractiveProps extends LiquidGlassProps, PointerElasticOptions {
  /** When the animated refraction runs. `hover`/`press` are idle (zero cost) until interaction. @default 'always' */
  liquidTrigger?: LiquidTrigger;
  /** A refractive bump that distorts the backdrop toward the cursor. @default false */
  followPointer?: boolean;
  /** Spawn a real refractive ripple on each click. `true` = `'ripple'`; `'drop'` = droplet-in-water rings. @default false */
  clickRipple?: boolean | RippleEffect;
  /** Strength of the click ripple — scales its brightness and reach. @default 1 */
  rippleIntensity?: number;
}

export declare const LiquidGlassInteractive: ForwardRefExoticComponent<
  LiquidGlassInteractiveProps & RefAttributes<LiquidGlassHandle>
>;

export default LiquidGlassInteractive;
