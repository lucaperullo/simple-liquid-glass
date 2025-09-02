import { ReactNode, CSSProperties, HTMLAttributes } from 'react';

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
   * @default 0.38
   */
  displace?: number;
  
  /**
   * Alpha transparency of the glass (0-1)
   * @default 0.9
   */
  alpha?: number;
  
  /**
   * Blur amount for the glass effect
   * @default 5
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
   * Additional CSS class names
   */
  className?: string;
  
  /**
   * Additional inline styles
   */
  style?: CSSProperties;
  /**
   * Rendering quality preset. Controls internal SVG resolution to balance performance and fidelity.
   * @default 'standard'
   */
  quality?: 'low' | 'standard' | 'high' | 'extreme';
  /**
   * Automatically detect device performance and choose a quality preset.
   * When true and no explicit quality is provided, the component resolves a quality on mount.
   * @default false
   */
  autodetectquality?: boolean;
}

export declare function LiquidGlass(props: LiquidGlassProps): JSX.Element;

export default LiquidGlass;