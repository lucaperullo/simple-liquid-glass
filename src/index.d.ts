import { ReactNode, CSSProperties, HTMLAttributes, ForwardRefExoticComponent, RefAttributes } from 'react';

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
   * Control the rendering effect: auto-select, force SVG, CSS blur, WebGL refraction, or disable effects entirely.
   * 'webgl' renders true refraction on all browsers (incl. iOS Safari and Firefox) via a page snapshot + shader.
   * Requires html2canvas on window, or a custom `getSnapshot`. Falls back to layered CSS if unavailable.
   * @default 'auto'
   */
  effectMode?: 'auto' | 'svg' | 'blur' | 'webgl' | 'off';
  /**
   * WebGL mode: custom snapshot provider for the background texture.
   * Defaults to window.html2canvas(document.body).
   */
  getSnapshot?: () => Promise<HTMLCanvasElement | HTMLImageElement>;
  
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
}

/** Imperative handle exposed via ref. */
export interface LiquidGlassHandle {
  /**
   * WebGL mode: re-capture the page background snapshot (call after the
   * content behind the glass changes). No-op in other effect modes.
   */
  refresh: () => Promise<void>;
  /** The root container element. */
  element: HTMLDivElement | null;
}

export declare const LiquidGlass: ForwardRefExoticComponent<LiquidGlassProps & RefAttributes<LiquidGlassHandle>>;

/** Options for the standalone WebGL renderer. */
export interface WebGLGlassOptions {
  element: HTMLElement;
  snapshotSource?: HTMLElement;
  exclude?: HTMLElement | null;
  getSnapshot?: () => Promise<HTMLCanvasElement | HTMLImageElement>;
  /** Auto-load html2canvas from cdnjs when missing. Default true. */
  autoLoadSnapshotLib?: boolean;
  scale?: number;
  radius?: number;
  blur?: number;
  saturation?: number;
  aberration?: number;
  edgeWidth?: number;
  specular?: number;
  frost?: number;
  resolution?: number;
}

export interface WebGLGlassInstance {
  refresh: () => Promise<void>;
  update: (opts: Partial<Pick<WebGLGlassOptions, 'scale' | 'radius' | 'blur' | 'saturation' | 'aberration' | 'edgeWidth' | 'specular' | 'frost'>>) => void;
  destroy: () => void;
}

/**
 * Framework-free WebGL liquid-glass renderer (used by effectMode 'webgl').
 * Returns null when WebGL or a snapshot source is unavailable.
 */
export declare function createWebGLGlass(options: WebGLGlassOptions): Promise<WebGLGlassInstance | null>;

export default LiquidGlass;