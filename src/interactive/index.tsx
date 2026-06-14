import React, { useEffect, useRef, useImperativeHandle, forwardRef, type RefObject } from 'react';
import LiquidGlass, { type LiquidGlassProps, type LiquidGlassHandle } from '../index';
import { stepSpring, isSettled, clamp, type SpringState } from './spring';
import { resolveElasticOptions } from './options';

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

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Drives a LiquidGlass element toward the pointer with a tiny rAF spring (zero deps), and
 * exposes the pointer position as --lg-mx/--lg-my CSS variables for a tracked specular layer.
 * Honors prefers-reduced-motion (skips the motion; keeps a centered highlight). Mutates the
 * element imperatively, so it never re-renders React on pointer move.
 */
export function usePointerElastic(
  ref: RefObject<LiquidGlassHandle | null>,
  options: PointerElasticOptions = {}
): void {
  const { elasticity, maxShift, stiffness, damping, specular } = resolveElasticOptions(options);

  useEffect(() => {
    const el = ref.current?.element;
    if (!el) return;

    const reduce = prefersReducedMotion();
    const cfg = { stiffness, damping };
    let state: SpringState = { x: 0, y: 0, vx: 0, vy: 0 };
    let tx = 0;
    let ty = 0;
    let raf = 0;

    const setVar = (mx: string, my: string) => {
      if (!specular) return;
      el.style.setProperty('--lg-mx', mx);
      el.style.setProperty('--lg-my', my);
    };

    const draw = () => {
      el.style.transform = `translate(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px)`;
    };

    const tick = () => {
      state = stepSpring(state, tx, ty, cfg);
      draw();
      if (isSettled(state, tx, ty)) {
        state = { x: tx, y: ty, vx: 0, vy: 0 };
        draw();
        raf = 0;
      } else {
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (specular) {
        setVar(
          `${(((e.clientX - r.left) / (r.width || 1)) * 100).toFixed(1)}%`,
          `${(((e.clientY - r.top) / (r.height || 1)) * 100).toFixed(1)}%`
        );
      }
      if (reduce || elasticity <= 0) return;
      const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2 || 1);
      const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2 || 1);
      const k = maxShift * (elasticity / 0.15);
      tx = clamp(nx * k, -maxShift, maxShift);
      ty = clamp(ny * k, -maxShift, maxShift);
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onLeave = () => {
      setVar('50%', '50%');
      if (reduce || elasticity <= 0) return;
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    setVar('50%', '50%');
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointercancel', onLeave);

    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointercancel', onLeave);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = '';
    };
  }, [ref, elasticity, maxShift, stiffness, damping, specular]);
}

export interface LiquidGlassInteractiveProps extends LiquidGlassProps, PointerElasticOptions {}

/**
 * LiquidGlass + pointer-reactive elasticity and a tracked specular highlight. Opt-in: import
 * from `simple-liquid-glass/interactive`. The core `LiquidGlass` import is unaffected.
 */
export const LiquidGlassInteractive = forwardRef<LiquidGlassHandle, LiquidGlassInteractiveProps>(
  function LiquidGlassInteractive(
    { elasticity, maxShift, stiffness, damping, specular = true, children, ...props },
    ref
  ) {
    const innerRef = useRef<LiquidGlassHandle | null>(null);
    useImperativeHandle(ref, () => innerRef.current as LiquidGlassHandle, []);
    usePointerElastic(innerRef, { elasticity, maxShift, stiffness, damping, specular });

    return (
      <LiquidGlass ref={innerRef} {...props}>
        {specular && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              borderRadius: 'inherit',
              zIndex: 4,
              background:
                'radial-gradient(40% 40% at var(--lg-mx, 50%) var(--lg-my, 50%), rgba(255,255,255,0.40), rgba(255,255,255,0) 70%)',
              mixBlendMode: 'screen',
              transition: 'background-position 80ms linear'
            }}
          />
        )}
        {children}
      </LiquidGlass>
    );
  }
);

LiquidGlassInteractive.displayName = 'LiquidGlassInteractive';

export default LiquidGlassInteractive;
