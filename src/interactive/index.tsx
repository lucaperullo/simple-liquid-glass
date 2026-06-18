import React, { useEffect, useRef, useState, useId, useImperativeHandle, forwardRef, type RefObject } from 'react';
import LiquidGlass, { type LiquidGlassProps, type LiquidGlassHandle } from '../index';
import { stepSpring, isSettled, clamp, type SpringState } from './spring';
import { resolveElasticOptions } from './options';

/** When the animated refraction runs: always, only on hover, or only while pressed. */
export type LiquidTrigger = 'always' | 'hover' | 'press';

/** Click-ripple effect style: a single soft expanding disc, or a droplet-in-water burst of rings. */
export type RippleEffect = 'ripple' | 'drop';

interface RippleRing {
  delay: number; // ms before this ring starts (stagger)
  dur: number; // ms
  from: number; // start scale
  to: number; // end scale
  opacity: number; // start opacity (fades to 0)
  kind: 'crest' | 'disc'; // crest = thin expanding wave ring; disc = central splash flash
}

// Compositor-only (transform + opacity) so rapid spamming stays smooth — NO per-ripple
// backdrop-filter (stacking those is what made it lag; each forces a fresh GPU backdrop snapshot).
// The glass beneath still refracts for real; the ripple is a surface wave drawn on top.
// 'ripple' = one soft wave. 'drop' = a splash flash + three concentric waves expanding & decelerating.
const RIPPLE_EFFECTS: Record<RippleEffect, RippleRing[]> = {
  ripple: [{ delay: 0, dur: 1000, from: 0.08, to: 1.55, opacity: 0.45, kind: 'crest' }],
  // Curated: a faint impact dimple + two soft waves (not three) — restrained, less busy.
  drop: [
    { delay: 0, dur: 440, from: 0.04, to: 0.5, opacity: 0.5, kind: 'disc' },
    { delay: 40, dur: 1300, from: 0.06, to: 1.85, opacity: 0.5, kind: 'crest' },
    { delay: 260, dur: 1300, from: 0.06, to: 1.4, opacity: 0.3, kind: 'crest' }
  ]
};

// Smooth deceleration — the wave travels outward and eases to rest (not a front-loaded snap).
const RIPPLE_EASE = 'cubic-bezier(0.25,0.55,0.35,1)';

// A soft refractive wavefront: a faint, WIDE dark trough → faint crest → fade — kept low and
// combined with mix-blend-mode: soft-light (below) so it gently MODULATES the backdrop (blends in
// like real water) instead of a defined ring. The splash is just a faint dark dimple, no white.
const RIPPLE_GRADIENT: Record<'crest' | 'disc', string> = {
  crest:
    'radial-gradient(closest-side, rgba(0,0,0,0) 46%, rgba(0,0,0,0.2) 63%, rgba(255,255,255,0.14) 75%, rgba(0,0,0,0) 92%)',
  disc: 'radial-gradient(closest-side, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0) 62%)'
};

// Cap concurrent ripples so a spam of clicks can't grow the DOM unbounded.
const MAX_RIPPLES = 6;

interface PointerState {
  inside: boolean;
  pressing: boolean;
}

/**
 * Tracks coarse pointer state on the glass element. Only the states actually consumed are tracked,
 * so a click never triggers a (heavy) re-render unless `trackPressing` is on.
 */
function usePointerState(
  ref: RefObject<LiquidGlassHandle | null>,
  trackInside: boolean,
  trackPressing: boolean
): PointerState {
  const [state, setState] = useState<PointerState>({ inside: false, pressing: false });
  useEffect(() => {
    if (!trackInside && !trackPressing) return;
    const el = ref.current?.element;
    if (!el) return;
    const enter = () => setState((s) => ({ ...s, inside: true }));
    const leave = () => setState({ inside: false, pressing: false });
    const down = () => setState((s) => ({ ...s, pressing: true }));
    const up = () => setState((s) => ({ ...s, pressing: false }));
    if (trackInside) el.addEventListener('pointerenter', enter);
    if (trackInside || trackPressing) {
      el.addEventListener('pointerleave', leave);
      el.addEventListener('pointercancel', leave);
    }
    if (trackPressing) {
      el.addEventListener('pointerdown', down);
      window.addEventListener('pointerup', up);
    }
    return () => {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointercancel', leave);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, [ref, trackInside, trackPressing]);
  return state;
}

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

export interface LiquidGlassInteractiveProps extends LiquidGlassProps, PointerElasticOptions {
  /** When the animated refraction runs. `hover`/`press` are idle (zero cost) until interaction. Default 'always'. */
  liquidTrigger?: LiquidTrigger;
  /** A refractive bump that distorts the backdrop toward the cursor. Default false. */
  followPointer?: boolean;
  /** Spawn a real refractive ripple on each click. `true` = 'ripple'; 'drop' = droplet-in-water rings. Default false. */
  clickRipple?: boolean | RippleEffect;
  /** Strength of the click ripple — scales its brightness and reach. Default 1. */
  rippleIntensity?: number;
}

/**
 * LiquidGlass + pointer-reactive elasticity and a tracked specular highlight. Opt-in: import
 * from `simple-liquid-glass/interactive`. The core `LiquidGlass` import is unaffected.
 */
export const LiquidGlassInteractive = forwardRef<LiquidGlassHandle, LiquidGlassInteractiveProps>(
  function LiquidGlassInteractive(
    {
      elasticity,
      maxShift,
      stiffness,
      damping,
      specular = false,
      liquid = false,
      liquidTrigger = 'always',
      followPointer = false,
      clickRipple = false,
      rippleIntensity = 1,
      children,
      ...props
    },
    ref
  ) {
    const innerRef = useRef<LiquidGlassHandle | null>(null);
    useImperativeHandle(ref, () => innerRef.current as LiquidGlassHandle, []);
    // followPointer needs the pointer vars too, so enable specular tracking when either is on.
    usePointerElastic(innerRef, { elasticity, maxShift, stiffness, damping, specular: specular || followPointer });

    // Pointer state drives both the trigger gating and the follow-pointer bump visibility.
    // Only track what's consumed: a click re-renders only when liquidTrigger === 'press'.
    const trackInside = followPointer || liquidTrigger === 'hover';
    const trackPressing = liquidTrigger === 'press';
    const { inside, pressing } = usePointerState(innerRef, trackInside, trackPressing);
    const engaged = liquidTrigger === 'always' || (liquidTrigger === 'hover' ? inside : pressing);
    const resolvedLiquid = liquid && engaged ? liquid : false;

    const bumpId = `lg-bump-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    // Overlays live inside a clip layer that carries the glass radius + overflow:hidden, so the
    // follow-pointer bump, specular highlight, and click ripples are rounded at the corners
    // instead of overflowing as squares (the content wrapper itself has no border-radius).
    const radius = typeof props.radius === 'number' ? props.radius : 50;
    const rippleEffect: RippleEffect | null =
      clickRipple === true ? 'ripple' : clickRipple === 'ripple' || clickRipple === 'drop' ? clickRipple : null;
    const rippleLayerRef = useRef<HTMLDivElement | null>(null);
    // Current intensity in a ref so the (effect-scoped) pointerdown handler always reads the latest
    // without re-subscribing or re-rendering on intensity change.
    const rippleKRef = useRef(1);
    rippleKRef.current = Number.isFinite(rippleIntensity) ? Math.max(0, rippleIntensity) : 1;

    // Click ripples are spawned/animated/removed IMPERATIVELY (no React state) so a click never
    // re-renders the heavy glass — that reconcile is what made clicks lag. Compositor only; skipped
    // under reduced motion; capped so a click spam can't grow the DOM unbounded.
    useEffect(() => {
      if (!rippleEffect) return;
      const el = innerRef.current?.element;
      if (!el || prefersReducedMotion()) return;
      const specs = RIPPLE_EFFECTS[rippleEffect];
      const cap = MAX_RIPPLES * specs.length;
      const onDown = (e: PointerEvent) => {
        const layer = rippleLayerRef.current;
        if (!layer) return;
        const r = el.getBoundingClientRect();
        const d = Math.max(r.width, r.height) || 120;
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const k = rippleKRef.current;
        // Trim to leave room for this burst so the layer never exceeds the cap.
        while (layer.childElementCount > cap - specs.length && layer.firstElementChild) layer.firstElementChild.remove();
        for (const spec of specs) {
          const span = document.createElement('span');
          span.setAttribute('aria-hidden', 'true');
          const startOpacity = Math.min(1, spec.opacity * (0.6 + 0.4 * k));
          const to = spec.to * Math.max(0.7, Math.min(2, 0.7 + 0.3 * k));
          span.style.cssText =
            `position:absolute;left:${x}px;top:${y}px;width:${d}px;height:${d}px;` +
            `margin-left:${-d / 2}px;margin-top:${-d / 2}px;border-radius:50%;opacity:0;` +
            `will-change:transform,opacity;mix-blend-mode:soft-light;background:${RIPPLE_GRADIENT[spec.kind]}`;
          layer.appendChild(span);
          const anim = span.animate(
            [
              { transform: `scale(${spec.from})`, opacity: startOpacity },
              { transform: `scale(${to})`, opacity: 0 }
            ],
            { duration: spec.dur, delay: spec.delay, easing: RIPPLE_EASE, fill: 'forwards' }
          );
          anim.onfinish = () => span.remove();
          setTimeout(() => span.remove(), spec.delay + spec.dur + 120);
        }
      };
      el.addEventListener('pointerdown', onDown);
      return () => el.removeEventListener('pointerdown', onDown);
    }, [rippleEffect]);

    const showOverlays = specular || followPointer || !!rippleEffect;

    return (
      <LiquidGlass ref={innerRef} liquid={resolvedLiquid} {...props}>
        {showOverlays && (
          <div
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', pointerEvents: 'none', zIndex: 4 }}
          >
            {followPointer && (
              <span
                style={{
                  position: 'absolute',
                  left: 'var(--lg-mx, 50%)',
                  top: 'var(--lg-my, 50%)',
                  width: 120,
                  height: 120,
                  marginLeft: -60,
                  marginTop: -60,
                  borderRadius: '50%',
                  opacity: inside ? 1 : 0,
                  transition: 'left 140ms ease-out, top 140ms ease-out, opacity 220ms ease',
                  backdropFilter: `url(#${bumpId})`,
                  WebkitBackdropFilter: `url(#${bumpId})`,
                  // Feather the edge so the displaced backdrop fades to nothing — no hard "broken" fringe.
                  WebkitMaskImage: 'radial-gradient(closest-side, #000 28%, rgba(0,0,0,0.45) 58%, transparent 80%)',
                  maskImage: 'radial-gradient(closest-side, #000 28%, rgba(0,0,0,0.45) 58%, transparent 80%)'
                }}
              />
            )}
            {specular && (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'radial-gradient(40% 40% at var(--lg-mx, 50%) var(--lg-my, 50%), rgba(255,255,255,0.40), rgba(255,255,255,0) 70%)',
                  mixBlendMode: 'screen',
                  transition: 'background-position 80ms linear'
                }}
              />
            )}
            {rippleEffect && <div ref={rippleLayerRef} style={{ position: 'absolute', inset: 0 }} />}
          </div>
        )}
        {followPointer && (
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <filter id={bumpId} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.012" numOctaves={1} seed={9} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={12} xChannelSelector="R" yChannelSelector="G" result="disp" />
              <feGaussianBlur in="disp" stdDeviation="0.6" />
            </filter>
          </svg>
        )}
        {children}
      </LiquidGlass>
    );
  }
);

LiquidGlassInteractive.displayName = 'LiquidGlassInteractive';

export default LiquidGlassInteractive;
