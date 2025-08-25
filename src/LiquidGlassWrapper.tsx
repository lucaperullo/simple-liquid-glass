import React, { useEffect, useMemo, useRef, useState } from 'react';
import WebGLLiquidGlass from './webgl/WebGLLiquidGlass';

export type LiquidGlassQuality = 'low' | 'med' | 'high' | 'ultra';
export type LiquidGlassDisplacementSource = 'procedural' | 'texture';
export type LiquidGlassBackgroundSampling = 'screenCopy' | 'html2canvas';

export interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: number;
  blurRadius?: number;
  tint?: string;
  borderRadius?: string | number;
  reflectivity?: number;
  roughness?: number;
  refractiveIndex?: number;
  animation?: boolean;
  animationSpeed?: number;
  displacementSource?: LiquidGlassDisplacementSource;
  caustics?: boolean;
  quality?: LiquidGlassQuality;
  backgroundSampling?: LiquidGlassBackgroundSampling;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function mapQualityToDpr(quality: LiquidGlassQuality | undefined): number {
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  switch (quality) {
    case 'low': return Math.min(dpr, 0.75);
    case 'med': return Math.min(dpr, 1);
    case 'high': return Math.min(dpr, 1.5);
    case 'ultra': return Math.min(dpr, 2);
    default: return Math.min(dpr, 1.5);
  }
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

export default function LiquidGlass({
  intensity = 0.6,
  blurRadius = 18,
  tint = 'rgba(255,255,255,0.12)',
  borderRadius = '16px',
  reflectivity = 0.35,
  roughness = 0.25,
  refractiveIndex = 1.45,
  animation = true,
  animationSpeed = 0.6,
  displacementSource = 'procedural',
  caustics = true,
  quality = 'high',
  backgroundSampling = 'screenCopy',
  children,
  className,
  style,
  ...rest
}: LiquidGlassProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const webgl = useMemo(() => (typeof window !== 'undefined' ? isWebGLAvailable() : false), []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dpi = mapQualityToDpr(quality);
  const renderScale = useMemo(() => {
    switch (quality) {
      case 'low': return 0.5;
      case 'med': return 0.75;
      case 'high': return 1.0;
      case 'ultra': return 1.0;
      default: return 1.0;
    }
  }, [quality]);

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: borderRadius as any,
    background: tint,
    ...style,
  };

  return (
    <div ref={containerRef} className={className} style={containerStyle} {...rest}>
      {webgl ? (
        <WebGLLiquidGlass
          width={size.width || 1}
          height={size.height || 1}
          dpi={dpi}
          renderScale={renderScale}
          captureBackground={true}
          className={undefined}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
      ) : (
        // Simple graceful fallback: render children with tint background kept.
        // A dedicated SVG fallback can replace this if needed.
        null
      )}
      {children && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      )}
    </div>
  );
}

