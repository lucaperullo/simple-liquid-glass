import React, { useMemo, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { buildNativeMap, resolveLensOptions } from './core/nativeOptics';
import { liquidConfig, liquidBaseFrequency, isLiquidPreset } from './core/liquid';
import type { LiquidPreset } from './core/liquid';
export type { LiquidPreset } from './core/liquid';
import type { LensOptions, LensProfile } from './core/nativeOptics';
export type { LensOptions } from './core/nativeOptics';
export { NATIVE_PROFILES as LENS_PROFILES, LENS_OPTION_RANGES, resolveLensOptions } from './core/nativeOptics';
import type { LensMode } from './core/displacementMap';
export type { LensMode } from './core/displacementMap';
import { DisplacementFilter } from './core/DisplacementFilter';
import { useTextColor } from './core/useTextColor';
import { cacheGet, cacheSet } from './displacementCache';
import { buildDisplacementDataUri, normalizeAngle } from './core/displacementMap';
import { useMirrorEngine } from './core/mirrorEngine';
import { lensGeometry, buildLensMap } from './core/mirrorOptics';
import { useGeometry } from './core/useGeometry';
import { useQuality } from './core/useQuality';
import type { LiquidQuality } from './quality';
import { useStableId } from './core/useStableId';
import { processBackground, isSemiTransparentColor } from './core/background';

const QUALITY_DIVISORS: Record<LiquidQuality, number> = {
  low: 3,
  standard: 3,
  high: 2.5,
  extreme: 2
};

const QUALITY_QUANTIZATION_STEPS: Record<LiquidQuality, number> = {
  low: 32,
  standard: 24,
  high: 16,
  extreme: 8
};

export interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The content to be displayed inside the liquid glass effect
   */
  children?: React.ReactNode;
  
  /**
   * Mode of the effect
   * @default "preset"
   */
  mode?: 'preset' | 'custom';
  
  /**
   * Scale of the displacement effect
   * @default 160
   */
  scale?: number;
  /** Existing 4.x directional/lens options select the compatible gradient renderer. */
  angle?: number;
  shapeAdapt?: boolean;
  lens?: LensMode;
  lensStrength?: number;
  lensCenter?: [number, number];
  liquid?: LiquidPreset | false;
  liquidSpeed?: number;
  liquidScale?: number;
  /** Shape-aware rounded lens or the original gradient optics. Default: lens. */
  refraction?: 'classic' | 'lens';
  /** Material, magnifier, player button, or scrub track optics. Used by refraction="lens". */
  lensProfile?: LensProfile;
  /** Individual rounded-lens overrides. Inherit unset values from lensProfile. Only applies to refraction="lens". */
  lensOptions?: LensOptions;
  /** Explicit lens displacement in CSS pixels; overrides scale for refraction="lens". */
  displacementScale?: number;
  
  /**
   * Border radius of the glass effect
   * @default 50
   */
  radius?: number;
  
  /**
   * Border thickness (0-0.5)
   * @default 0.05
   */
  border?: number;
  
  /**
   * Lightness of the glass (0-100)
   * @default 53
   */
  lightness?: number;
  
  /**
   * Displacement blur amount
   * @default 5
   */
  displace?: number;
  
  /**
   * Alpha transparency of the glass (0-1)
   * @default 0.9
   */
  alpha?: number;
  
  /**
   * Blur amount for the glass effect
   * @default 0
   */
  blur?: number;
  
  /**
   * Chromatic dispersion amount
   * @default 50
   */
  dispersion?: number;
  /**
   * Color saturation multiplier (%). 100 = no change
   * @default 140
   */
  saturation?: number;
  /**
   * Chromatic aberration intensity multiplier
   * @default 0
   */
  aberrationIntensity?: number;
  
  /**
   * Frost effect intensity (0-1)
   * @default 0.1
   */
  frost?: number;
  
  /**
   * Border color in CSS format
   * @default "rgba(120, 120, 120, 0.7)"
   */
  borderColor?: string;
  
  /**
   * Semi-transparent color for the glass background (must include alpha)
   * Examples: rgba(255,255,255,0.4), hsla(0,0%,100%,0.4), #FFFFFFFF with alpha
   * @default 'rgba(255, 255, 255, 0.4)'
   */
  glassColor?: string;

  /**
   * Background color or gradient for the container
   * Solid colors and gradients will automatically be made semi-transparent (30% opacity)
   * Examples: "#ff0000", "linear-gradient(45deg, #ff0000, #00ff00)", "radial-gradient(circle, #ff0000, #00ff00)"
   */
  background?: string;

  /**
   * Automatically adapt text color based on surrounding background
   * @default false
   */
  autoTextColor?: boolean;

  /**
   * Text color when detected background is dark
   * @default '#ffffff'
   */
  textOnDark?: string;

  /**
   * Text color when detected background is light
   * @default '#111111'
   */
  textOnLight?: string;

  /**
   * Force the computed text color on all descendants using !important
   * Useful when children set their own color styles
   * @default false
   */
  forceTextColor?: boolean;
  /** Minimum blur (px) to apply on iOS even when blur is 0. Default: 7 */
  iosMinBlur?: number;
  /** iOS blur fallback mode. 'auto' forces a minimal blur; 'off' disables it. Default: 'auto' */
  iosBlurMode?: 'auto' | 'off';
  /**
   * Mobile rendering strategy. Default: CSS-only on mobile devices, SVG on desktop.
   * Use 'svg' to force SVG filter on mobile, or 'css-only' to force CSS fallback.
   */
  mobileFallback?: 'css-only' | 'svg';
  /**
   * Control the rendering effect: auto-select, force SVG, CSS blur, or disable effects entirely.
   * @default 'auto'
   */
  effectMode?: 'auto' | 'svg' | 'blur' | 'off';

  /**
   * On the fallback engines (Safari / iOS / Firefox, which can't run SVG filters in
   * `backdrop-filter`), refract a live displaced **clone** of the element behind the lens instead
   * of just blurring. Requires `backdropRef` (or `backdropSelector`); falls back to blur otherwise.
   * @default true
   */
  mirror?: boolean;
  /**
   * The element behind the lens to refract (for the iOS/Safari mirror). MUST NOT be an ancestor of
   * the lens — point it at a sibling/background element. Falls back to blur when omitted.
   */
  backdropRef?: import('react').RefObject<HTMLElement | null>;
  /** Alternative to `backdropRef`: a CSS selector for the backdrop, resolved on mount. */
  backdropSelector?: string;
  /**
   * Mirror optical strength, capped to half the rim width. Safari/iOS uses CSS rim magnification;
   * other mirror engines use displacement. Zero disables the optical offset.
   * @default 26
   */
  mirrorScale?: number;
  /**
   * Re-align the mirror clone at approximately 30 Hz when the lens or background translates
   * (dragging, animation). Scroll/resize re-align is automatic for static lenses.
   * @default false
   */
  track?: boolean;

  /**
   * Additional CSS class names
   */
  className?: string;
  
  /**
   * Additional inline styles
   */
  style?: React.CSSProperties;
  /**
   * Rendering quality preset. Controls internal SVG resolution to balance performance and fidelity.
   * @default 'low'
   */
  quality?: LiquidQuality;
  /**
   * Automatically detect device performance and choose a quality preset.
   * When true and no explicit quality is provided, the component resolves a quality on mount.
   * @default false
   */
  autodetectquality?: boolean;
}

/** Imperative handle exposed via ref. */
export interface LiquidGlassHandle {
  /** The root container element. */
  element: HTMLDivElement | null;
  /** The currently resolved rendering quality (reflects autodetect, if enabled). */
  getQuality(): LiquidQuality;
}

export const LiquidGlass = forwardRef<LiquidGlassHandle, LiquidGlassProps>(function LiquidGlass({
  children,
  mode = "preset",
  scale = 160,
  refraction: requestedRefraction,
  angle, shapeAdapt, lens, lensStrength, lensCenter,
  liquid = false, liquidSpeed = 1, liquidScale,
  lensProfile = 'player', lensOptions,
  displacementScale,
  radius = 50,
  border = 0.05,
  lightness = 53,
  displace = 5,
  alpha = 0.9,
  blur = 0,
  dispersion = 50,
  saturation = 140,
  aberrationIntensity = 0,
  frost = 0.1,
  borderColor = "rgba(120, 120, 120, 0.7)",
  glassColor = "rgba(255, 255, 255, 0.4)",
  background,
  autoTextColor = false,
  textOnDark = '#ffffff',
  textOnLight = '#111111',
  forceTextColor = false,
  className = "",
  style = {},
  quality: incomingQuality,
  autodetectquality = false,
  iosMinBlur = 7,
  iosBlurMode = 'auto',
  mobileFallback,
  effectMode = 'auto',
  mirror = true,
  backdropRef,
  backdropSelector,
  mirrorScale = 26,
  track = false,
  ...props
}: LiquidGlassProps, ref) {
  const legacyOptics = angle !== undefined || shapeAdapt !== undefined || lens !== undefined || lensStrength !== undefined || lensCenter !== undefined;
  const refraction = requestedRefraction ?? (legacyOptics ? 'classic' : 'lens');
  const config = {
    mode, scale, radius, border, lightness, displace, alpha, blur, dispersion,
    saturation, aberrationIntensity, frost, borderColor,
    blend: 'difference' as const, x: 'R' as const, y: 'B' as const
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mirrorHolderRef = useRef<HTMLDivElement | null>(null);
  const { dimensions, isResizing, isVisible } = useGeometry(containerRef);
  const effectiveTextColor = useTextColor(containerRef, autoTextColor, textOnDark, textOnLight);
  const uniqueId = useStableId();
  const textClassName = uniqueId ? `lg-text-${uniqueId}` : undefined;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const resolvedQuality = useQuality(incomingQuality, autodetectquality);
  // Track the latest resolved quality in a ref so the imperative handle can expose it
  // (getQuality) without recreating the handle on every quality change.
  const resolvedQualityRef = useRef(resolvedQuality);
  resolvedQualityRef.current = resolvedQuality;

  // Effective radius in px clamped to box (prevents mismatch when radius > half size)
  const effectiveRadiusPx = Math.min(config.radius, dimensions.width / 2, dimensions.height / 2);

  const nativeOptions = useMemo(() => resolveLensOptions(lensProfile, lensOptions), [lensProfile, lensOptions]);

  // Generate displacement map SVG as data URI
  const displacementDataUri = useMemo(() => {
    if (effectMode === 'off' || effectMode === 'blur') return '';
    const { width, height } = dimensions;
    if (refraction === 'lens' && mounted) {
      return width > 0 && height > 0 ? buildNativeMap(width, height, config.radius, lensProfile, nativeOptions) : '';
    }
    const divisor = QUALITY_DIVISORS[resolvedQuality] || 3;
    const quantStep = QUALITY_QUANTIZATION_STEPS[resolvedQuality] || 16;

    // Shared cache key across instances to reuse identical displacement maps
    const cacheKey = `gradient-v4:${resolvedQuality}:${width}:${height}:${config.radius}:${config.border}:${config.lightness}:${config.alpha}:${config.displace}:${normalizeAngle(angle ?? 0)}:${shapeAdapt}:${lens}:${lensStrength}:${lensCenter?.join()}:${config.scale}:${config.dispersion}:${config.aberrationIntensity}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const uri = buildDisplacementDataUri({
      width,
      height,
      divisor,
      quantStep,
      radius: config.radius,
      border: config.border,
      lightness: config.lightness,
      alpha: config.alpha,
      displace: config.displace,
      blend: config.blend, angle: angle ?? 0, shapeAdapt: shapeAdapt ?? true,
      lens: lens ?? 'classic', lensStrength: lensStrength ?? 1, lensCenter,
      scale: config.scale + Math.abs(config.dispersion * config.aberrationIntensity)
    });
    cacheSet(cacheKey, uri);
    return uri;
  }, [angle, shapeAdapt, lens, lensStrength, lensCenter, config.scale, config.dispersion, config.aberrationIntensity, dimensions, effectMode, refraction, lensProfile, nativeOptions, mounted, config.radius, config.border, config.lightness, config.alpha, config.displace, config.blend, resolvedQuality]);

  // Keep the player preset at the demonstrated ~80px strength even on small controls.
  const norm = lensProfile === 'player' ? 500 : Math.hypot(dimensions.width, dimensions.height) / Math.SQRT2;
  const filterScale = refraction === 'lens' ? (displacementScale !== undefined && Number.isFinite(displacementScale)
    ? displacementScale
    : Math.max(-320, Math.min(320, config.scale)) / 160 * nativeOptions.strength * norm)
    : legacyOptics ? config.scale : Math.sign(config.scale) * Math.min(Math.abs(config.scale), Math.min(dimensions.width, dimensions.height) * .1);
  const filterConfig = { ...config, scale: filterScale,
    dispersion: refraction === 'lens' ? Math.min(1, Math.abs(config.dispersion) / 50) : legacyOptics ? config.dispersion : Math.min(Math.abs(config.dispersion), Math.abs(filterScale) * .12) };

  // Generate a unique ID for the SVG filter
  const uniqueFilterId = uniqueId ?? 'pending';
  const filterId = `liquid-glass-filter-${uniqueFilterId}`;


  const resolvedGlassBackground = background
    ? 'transparent' // Use transparent when background is provided
    : glassColor && isSemiTransparentColor(glassColor)
      ? glassColor
      : `hsl(0 0% 100% / ${config.frost})`;

  if (glassColor && !isSemiTransparentColor(glassColor)) {
    // eslint-disable-next-line no-console
    console.warn(
      '[LiquidGlass] `glassColor` must be semi-transparent (alpha between 0 and 1). Falling back to frost-based color.'
    );
  }

  // detect iOS (WebKit on iPhone/iPad or Mac with touch)
  const isIOS = (() => {
    if (!mounted || typeof navigator === 'undefined' || typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const vendor = navigator.vendor || '';
    const isAndroid = /Android/i.test(ua);
    const isAppleUA = /(iPad|iPhone|iPod)/i.test(ua);
    const isIPadOS13Plus = /Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1;
    const vendorIsApple = /Apple/i.test(vendor);
    const hasWK = typeof (window as any).webkit !== 'undefined';
    const hasMobileToken = /Mobile/i.test(ua);
    // Strict: real iOS or iPadOS WebKit on Apple device, exclude Android and most desktop emulation
    return !isAndroid && (isAppleUA || isIPadOS13Plus) && vendorIsApple && hasWK && hasMobileToken;
  })();

  // detect generic mobile (Android/iOS phones/tablets)
  const isMobile = (() => {
    if (!mounted || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  })();

  // Only Chromium (Blink) supports SVG filters in backdrop-filter (url(#...)).
  // Safari/iOS WebKit (bug 245510) and Firefox silently ignore it, so gate on
  // engine support instead of iOS-only checks (fixes broken effect on Firefox).
  // Note: every iOS browser (incl. CriOS/FxiOS) is WebKit, hence the isIOS guard.
  const supportsSvgBackdropFilter = (() => {
    if (!mounted || typeof navigator === 'undefined') return false;
    if (isIOS) return false;
    const ua = navigator.userAgent || '';
    if (/firefox|fxios/i.test(ua)) return false;
    return /(chrome|chromium|edg|opr)\//i.test(ua);
  })();

  // Build backdrop-filter string with effectMode and mobile/iOS fallbacks
  const cssBlur = isIOS && iosBlurMode === 'auto' ? Math.max(blur, iosMinBlur) : blur;
  const useSvgFilter = (() => {
    // effectMode has highest precedence
    if (effectMode === 'off') return false;
    if (effectMode === 'blur') return false;
    if (!uniqueId) return false;
    if (effectMode === 'svg') return supportsSvgBackdropFilter;
    // effectMode === 'auto'
    if (!supportsSvgBackdropFilter) return false;
    if (mobileFallback === 'css-only') return false;
    if (mobileFallback === 'svg') return true;
    return !isMobile;
  })();
  const cssOnlyBlurPx = (() => {
    if (effectMode === 'off') return 0;
    const base = (resolvedQuality === 'low' || isMobile || effectMode === 'blur') ? Math.min(cssBlur, 2) : cssBlur;
    return Math.max(0, base);
  })();

  useImperativeHandle(ref, () => ({
    get element() {
      return containerRef.current;
    },
    getQuality() {
      return resolvedQualityRef.current;
    }
  }), []);

  // CSS fallback (Safari/Firefox/iOS): true refraction is impossible (WebKit can't run SVG
  // filters in backdrop-filter), so the surface must instead read as real frosted glass.
  // Give it a blur floor + extra saturation/brightness. The SVG path is untouched — its
  // displacement already provides the glassy look.
  const isFallback = !useSvgFilter && effectMode !== 'off';
  const fallbackFrostPx = isFallback
    ? Math.max(cssOnlyBlurPx, resolvedQuality === 'low' || isMobile ? 8 : 11)
    : 0;

  // On the fallback engines (Safari/iOS/Firefox), when a backdrop is provided, refract a live
  // displaced clone of it instead of just blurring. Returns false (→ blur) on Chromium, when
  // off-screen, when `mirror` is off, or when no usable backdrop is given. Purely additive: with
  // mirrorActive=false the behavior is identical to the blur fallback.
  const mirrorActive = useMirrorEngine({
    enabled: mounted && !!uniqueId && isFallback && isVisible && mirror && effectMode !== 'blur',
    containerRef,
    holderRef: mirrorHolderRef,
    backdropRef,
    backdropSelector,
    track
  });

  const mirrorGeometry = useMemo(() => lensGeometry(dimensions.width, dimensions.height, config.radius, mirrorScale),
    [dimensions.width, dimensions.height, config.radius, mirrorScale]);
  // Native Safari mispositions SVG displacement textures. CSS masks use a separate
  // compositing path: reveal a mildly magnified source only at the rounded rim.
  const cssMirror = mounted && (isIOS || (typeof navigator !== 'undefined' && /safari/i.test(navigator.userAgent) && !/chrome|chromium|android|edg|opr/i.test(navigator.userAgent)));
  const mirrorZoom = 1 + mirrorGeometry.scale / Math.max(mirrorGeometry.width, mirrorGeometry.height);
  const mirrorMap = useMemo(() => mirrorActive ? buildLensMap(mirrorGeometry, cssMirror ? 'rim' : 'displacement') : undefined,
    [mirrorActive, mirrorGeometry, cssMirror]);
  const mirrorFilterId = `liquid-glass-mirror-${uniqueFilterId}`;
  const mirrorReady = mirrorActive && !!mirrorMap;

  const turbRef = useRef<SVGFETurbulenceElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  const liquidPreset = isLiquidPreset(liquid) ? liquid : null;
  const liquidActive = !!liquidPreset && useSvgFilter && isVisible && !reducedMotion && effectMode !== 'off';
  const liquidCfg = liquidPreset
    ? liquidConfig(liquidPreset, {
        speed: liquidSpeed,
        scale: liquidScale,
        maxScale: isMobile || resolvedQuality === 'low' ? 14 : undefined
      })
    : null;

  // Animate the live turbulence node's baseFrequency off rAF — no per-frame React render and no
  // displacement-map re-encode. Stops automatically when offscreen / reduced-motion / liquid off.
  useEffect(() => {
    if (!liquidActive || !liquidPreset) return;
    const node = turbRef.current;
    if (!node) return;
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const [bx, by] = liquidBaseFrequency(liquidPreset, (now - start) / 1000, liquidSpeed);
      node.setAttribute('baseFrequency', `${bx} ${by}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [liquidActive, liquidPreset, liquidSpeed]);

  const liquidStage = liquidActive && liquidCfg ? <>
    <feTurbulence ref={turbRef} type="fractalNoise" baseFrequency={`${liquidCfg.baseFrequencyX} ${liquidCfg.baseFrequencyY}`} numOctaves={liquidCfg.numOctaves} seed={liquidCfg.seed} result="lqNoise" />
    <feDisplacementMap in="lqBase" in2="lqNoise" scale={liquidCfg.scale} xChannelSelector="R" yChannelSelector="G" />
  </> : null;
  const feBlurForNative = resolvedQuality === 'low' ? Math.min(cssBlur, 2) : cssBlur;
  const backdropFilterValue = effectMode === 'off' || !isVisible || mirrorReady
    ? 'none'
    : useSvgFilter
    ? `saturate(${config.saturation}%) ${refraction === 'lens' && feBlurForNative > 0 ? `blur(${feBlurForNative}px) ` : ''}url(#${filterId})`
    : isFallback
      ? `blur(${fallbackFrostPx}px) saturate(${Math.max(config.saturation, 180)}%)`
      : (cssOnlyBlurPx > 0
          ? `blur(${cssOnlyBlurPx}px) saturate(${config.saturation}%)`
          : `saturate(${config.saturation}%)`);

  // Cap SVG blur in low quality to reduce GPU cost
  const feBlurStdDev = resolvedQuality === 'low' ? Math.min(config.blur, 2) : config.blur;

  // Fallback glass tint: bright at the very top (light from above) fading to near-transparent
  // through the body, so the blurred backdrop shows through — reads as glass, not milky plastic.
  const fallbackTint =
    'linear-gradient(168deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.12) 11%, rgba(255,255,255,0.03) 46%, rgba(255,255,255,0) 80%, rgba(255,255,255,0.08) 100%)';
  const glassLayerBackground = isFallback ? fallbackTint : resolvedGlassBackground;

  const glassMorphismStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: effectiveRadiusPx,
    position: "absolute",
    zIndex: 1,
    background: glassLayerBackground,
    backdropFilter: backdropFilterValue,
    WebkitBackdropFilter: backdropFilterValue,
    overflow: 'hidden',
    // Fallback depth + glass edge: soft outer drop shadow, a bright top rim (light catching the
    // edge), a faint bottom rim, and a hairline full-perimeter rim. (SVG path reads as glass
    // from its refraction, so it gets none of this.)
    boxShadow: isFallback
      ? '0 10px 30px rgba(0,0,0,0.20), inset 0 1px 1px rgba(255,255,255,0.75), inset 0 -2px 3px rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.22)'
      : refraction === 'lens' ? 'inset 0 1px 2px #ffffffa0, inset 0 -1px 2px #ffffff30, 0 6px 18px #00000018' : undefined,
    // Dynamic: only hint the compositor while actively resizing (see A4). Idle instances
    // default to 'auto' so many cards on a page don't each pin a GPU layer.
    willChange: isResizing ? 'backdrop-filter, filter' : 'auto'
  };

  // (The old masked "edge band" fallback was removed — it read as a clunky inset frame. The
  // fallback's glass edge now comes from the rim box-shadows above + the gradient border below.)

  // Gradient border styles
  const gradientBorderStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: effectiveRadiusPx,
    zIndex: 2,
    pointerEvents: "none",
    background: `linear-gradient(315deg, ${config.borderColor} 0%, rgba(120, 120, 120, 0) 30%, rgba(120, 120, 120, 0) 70%, ${config.borderColor} 100%) border-box`,
    mask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
    maskComposite: "exclude",
    WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
    WebkitMaskComposite: "xor",
    border: `1px solid transparent`
  };

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    borderRadius: effectiveRadiusPx,
    background: processBackground(background),
    ...style
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      data-liquid-glass=""
      {...props}
    >
      <div style={glassMorphismStyle}>
        {useSvgFilter && effectMode !== 'off' && isVisible && (
        <DisplacementFilter filterId={filterId} displacementDataUri={displacementDataUri}
          liquidStage={liquidStage} resolvedQuality={resolvedQuality} feBlurStdDev={feBlurStdDev} config={filterConfig} specular={nativeOptions.specular} neutralMap={refraction === 'lens'} width={dimensions.width} height={dimensions.height} />
        )}
      </div>

      {/* Safari uses a masked CSS magnification rim; other mirrors use SVG displacement.
          The source stays explicit and the decorative copy remains clipped to the lens. */}
      {uniqueId && isFallback && mirror && effectMode !== 'blur' && (
        <>
          <div
            aria-hidden="true"
            data-liquid-glass-mirror={cssMirror ? 'css' : 'svg'}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              borderRadius: effectiveRadiusPx,
              overflow: 'hidden',
              filter: cssMirror ? undefined : `url(#${mirrorFilterId})`,
              WebkitFilter: cssMirror ? undefined : `url(#${mirrorFilterId})`,
              maskImage: cssMirror && mirrorMap ? `url("${mirrorMap}")` : undefined,
              WebkitMaskImage: cssMirror && mirrorMap ? `url("${mirrorMap}")` : undefined,
              maskSize: '100% 100%',
              WebkitMaskSize: '100% 100%',
              pointerEvents: 'none',
              visibility: mirrorReady ? 'visible' : 'hidden'
            }}
          >
            {/* Clip before filtering: WebKit otherwise includes the translated source in the filter bounds. */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', contain: 'paint', transform: cssMirror ? `scale(${mirrorZoom})` : undefined, transformOrigin: 'center' }}>
              <div ref={mirrorHolderRef} style={{ position: 'absolute', top: 0, left: 0 }} />
            </div>
          </div>
          {mirrorReady && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
                borderRadius: effectiveRadiusPx,
                pointerEvents: 'none',
                background:
                  'linear-gradient(168deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 100%)',
                mixBlendMode: 'screen'
              }}
            />
          )}
          {mirrorMap && !cssMirror && <svg key={mirrorFilterId} width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <filter id={mirrorFilterId} filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox" x="0" y="0"
              width="1" height="1" colorInterpolationFilters="sRGB">
              <feImage href={mirrorMap} x="0" y="0" width="1" height="1"
                preserveAspectRatio="none" result="lens" />
              <feComponentTransfer in="lens" result="map">
                <feFuncR type="linear" slope={255 / 256} />
                <feFuncG type="linear" slope={255 / 256} />
              </feComponentTransfer>
              <feDisplacementMap in="SourceGraphic" in2="map" scale={mirrorGeometry.scale / Math.min(mirrorGeometry.width, mirrorGeometry.height)}
                xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </svg>}
        </>
      )}

      <div
        className="liquid-glass-border"
        style={gradientBorderStyle}
      />
      
      {refraction === 'lens' && effectMode !== 'off' && nativeOptions.brightness !== 0 && <div aria-hidden="true" data-liquid-glass-brightness style={{position:'absolute',inset:0,borderRadius:'inherit',pointerEvents:'none',zIndex:2,background:nativeOptions.brightness > 0 ? '#fff' : '#000',opacity:Math.abs(nativeOptions.brightness)}} />}
      {/* Children content */}
      {children && (
        <div 
          style={{
            position: "relative",
            zIndex: 3,
            width: "100%",
            height: "100%",
            color: autoTextColor ? effectiveTextColor : undefined,
            transition: 'color 300ms ease'
          }}
          className={forceTextColor ? textClassName : undefined}
        >
          {forceTextColor && autoTextColor && textClassName && (
            <style>
              {`
                .${textClassName}, .${textClassName} * { transition: color 300ms ease; }
                .${textClassName} { color: ${effectiveTextColor} !important; }
                .${textClassName} * { color: ${effectiveTextColor} !important; }
              `}
            </style>
          )}
          {children}
        </div>
      )}
    </div>
  );
});

LiquidGlass.displayName = "LiquidGlass";

export default LiquidGlass;

// Removed non-working experimental components per user request