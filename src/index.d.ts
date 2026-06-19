import { ReactNode, CSSProperties, HTMLAttributes, ForwardRefExoticComponent, RefAttributes } from 'react';

/** Real animated refraction presets. */
export type LiquidPreset = 'ripple' | 'flow' | 'wobble';

/** Lens field shape. */
export type LensMode = 'classic' | 'convex' | 'shift' | 'rim';

export interface LiquidGlassProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * The content to be displayed inside the liquid glass effect
   */
  children?: ReactNode;
  
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
   * Additional CSS class names
   */
  className?: string;
  
  /**
   * Additional inline styles
   */
  style?: CSSProperties;
  /**
   * Rendering quality preset. Controls internal SVG resolution to balance performance and fidelity.
   * @default 'low'
   */
  quality?: 'low' | 'standard' | 'high' | 'extreme';
  /**
   * Automatically detect device performance and choose a quality preset.
   * When true and no explicit quality is provided, the component resolves a quality on mount.
   * @default false
   */
  autodetectquality?: boolean;

  /**
   * Refraction direction, in degrees. In-plane rotation of the lean (not a 3D light-incidence
   * tilt). `0` is the baseline/current look; positive rotates the lean clockwise on screen.
   * Shape-adapted, so the on-screen angle is faithful on any aspect ratio. Chromium SVG path only.
   * @default 0
   */
  angle?: number;
  /**
   * Aspect-faithful + isotropic refraction so the lens reads like glass cut to the element's
   * shape (a long navbar / tall sidebar refracts evenly). `false` restores the legacy ≤2.x map.
   * @default true
   */
  shapeAdapt?: boolean;
  /**
   * Lens field shape. `'classic'` (default) is the linear radial field; `'convex'` is one coherent
   * dome magnifier; `'shift'` is a uniform directional offset (straight stays straight); `'rim'`
   * leaves the center clear and refracts only at a soft perimeter band.
   * @default 'classic'
   */
  lens?: LensMode;
  /**
   * Manual magnitude for the lens field. `0` disables the lens displacement.
   * @default 1
   */
  lensStrength?: number;
  /**
   * Lens center for `convex` / `rim`, normalized `0..1`.
   * @default [0.5, 0.5]
   */
  lensCenter?: [number, number];
  /**
   * Real animated refraction — the backdrop genuinely warps. Opt-in, GPU-real: runs only while
   * on-screen, pauses on `prefers-reduced-motion`, Chromium SVG path only. `false` disables it.
   * @default false
   */
  liquid?: LiquidPreset | false;
  /**
   * Motion rate multiplier for `liquid`.
   * @default 1
   */
  liquidSpeed?: number;
  /**
   * Distortion amplitude (px) for `liquid`. Defaults to the preset's amplitude.
   */
  liquidScale?: number;
}

/** Imperative handle exposed via ref. */
export interface LiquidGlassHandle {
  /** The root container element. */
  element: HTMLDivElement | null;
  /** The currently resolved rendering quality (reflects autodetect, if enabled). */
  getQuality(): 'low' | 'standard' | 'high' | 'extreme';
}

export declare const LiquidGlass: ForwardRefExoticComponent<LiquidGlassProps & RefAttributes<LiquidGlassHandle>>;

export default LiquidGlass;