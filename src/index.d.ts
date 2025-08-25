import { ReactNode, CSSProperties, HTMLAttributes } from 'react';

export interface LiquidGlassProps extends HTMLAttributes<HTMLDivElement> {
  intensity?: number;
  blurRadius?: number;
  tint?: string;
  borderRadius?: string | number;
  reflectivity?: number;
  roughness?: number;
  refractiveIndex?: number;
  animation?: boolean;
  animationSpeed?: number;
  displacementSource?: 'procedural' | 'texture';
  caustics?: boolean;
  quality?: 'low' | 'med' | 'high' | 'ultra';
  backgroundSampling?: 'screenCopy' | 'html2canvas';
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export declare function LiquidGlass(props: LiquidGlassProps): JSX.Element;

export interface WebGLLiquidGlassProps extends HTMLAttributes<HTMLDivElement> {
  imageSrc?: string;
  width?: number;
  height?: number;
  dpi?: number;
  renderScale?: number;
  autoScale?: boolean;
  minRenderScale?: number;
  targetFps?: number;
  captureBackground?: boolean;
  className?: string;
  style?: CSSProperties;
}

export declare function WebGLLiquidGlass(props: WebGLLiquidGlassProps): JSX.Element;
export default LiquidGlass;