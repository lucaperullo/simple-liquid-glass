import React, { useMemo, useEffect, useRef, useState, useId } from 'react';

type DisplacementChannel = 'R' | 'G' | 'B' | 'A';

export interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  mode?: string;
  scale?: number;
  radius?: number;
  border?: number;
  lightness?: number;
  displace?: number;
  alpha?: number;
  blur?: number;
  dispersion?: number;
  saturation?: number; // percent, 100 = normal
  aberrationIntensity?: number; // multiplier for chromatic separation
  frost?: number;
  borderColor?: string;
  glassColor?: string; // must be semi-transparent
  background?: string; // background color or gradient (CSS background value)
  autoTextColor?: boolean; // auto-detect background and set text color
  textOnDark?: string; // text color when background is dark
  textOnLight?: string; // text color when background is light
  forceTextColor?: boolean; // enforce text color on descendants
  className?: string;
  style?: React.CSSProperties;
  // iOS fallback controls
  iosMinBlur?: number; // minimum blur on iOS even when blur=0
  iosBlurMode?: 'auto' | 'off'; // allow opting out of the forced iOS blur
}

function isSemiTransparentColor(input: string | undefined | null): boolean {
  if (!input) return false;
  const color = input.trim();
  // rgba(r,g,b,a)
  const rgba = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d*\.?\d+)\s*\)$/i.exec(color);
  if (rgba) {
    const a = parseFloat(rgba[1]);
    return a > 0 && a < 1;
  }
  // hsla(h,s,l,a)
  const hsla = /^hsla\(.*?,\s*(\d*\.?\d+)\s*\)$/i.exec(color);
  if (hsla) {
    const a = parseFloat(hsla[1]);
    return a > 0 && a < 1;
  }
  // hsl(h s l / a) or hsl(h,s%,l%,a) with slash
  const hslSlash = /^hsl\(.*?\/\s*(\d*\.?\d+)\s*\)$/i.exec(color);
  if (hslSlash) {
    const a = parseFloat(hslSlash[1]);
    return a > 0 && a < 1;
  }
  // Hex with alpha: #RGBA or #RRGGBBAA
  const hex4 = /^#([0-9a-f]{4})$/i.exec(color);
  if (hex4) {
    const aHex = hex4[1].slice(3, 4);
    const a = parseInt(aHex + aHex, 16) / 255; // expand to 8-bit
    return a > 0 && a < 1;
  }
  const hex8 = /^#([0-9a-f]{8})$/i.exec(color);
  if (hex8) {
    const aHex = hex8[1].slice(6, 8);
    const a = parseInt(aHex, 16) / 255;
    return a > 0 && a < 1;
  }
  // No detectable alpha
  return false;
}

function addTransparencyToColor(color: string, alpha: number = 0.3): string {
  const trimmed = color.trim();
  
  // Handle hex colors
  const hex3 = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (hex3) {
    const r = parseInt(hex3[1][0] + hex3[1][0], 16);
    const g = parseInt(hex3[1][1] + hex3[1][1], 16);
    const b = parseInt(hex3[1][2] + hex3[1][2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  const hex6 = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (hex6) {
    const r = parseInt(hex6[1].slice(0, 2), 16);
    const g = parseInt(hex6[1].slice(2, 4), 16);
    const b = parseInt(hex6[1].slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  // Handle rgb colors
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(trimmed);
  if (rgb) {
    const r = parseInt(rgb[1], 10);
    const g = parseInt(rgb[2], 10);
    const b = parseInt(rgb[3], 10);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  // Handle hsl colors
  const hsl = /^hsl\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i.exec(trimmed);
  if (hsl) {
    const h = hsl[1].trim();
    const s = hsl[2].trim();
    const l = hsl[3].trim();
    return `hsla(${h}, ${s}, ${l}, ${alpha})`;
  }
  
  // If we can't parse it, return as is
  return trimmed;
}

function addTransparencyToGradient(gradient: string, alpha: number = 0.3): string {
  // Handle linear-gradient, radial-gradient, conic-gradient, etc.
  const gradientMatch = /^(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|repeating-conic-gradient)\s*\(/i.exec(gradient);
  if (!gradientMatch) return gradient;
  
  const gradientType = gradientMatch[1];
  const content = gradient.substring(gradientType.length + 1, gradient.length - 1);
  
  // Split by commas, but be careful with nested parentheses
  const parts: string[] = [];
  let current = '';
  let parenCount = 0;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '(') parenCount++;
    else if (char === ')') parenCount--;
    else if (char === ',' && parenCount === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  
  // Process each color stop
  const processedParts = parts.map(part => {
    // Check if this part contains a color
    const colorMatch = /(#[0-9a-f]{3,6}|rgb\([^)]+\)|hsl\([^)]+\)|rgba\([^)]+\)|hsla\([^)]+\))/i.exec(part);
    if (colorMatch) {
      const color = colorMatch[1];
      const transparentColor = addTransparencyToColor(color, alpha);
      return part.replace(color, transparentColor);
    }
    return part;
  });
  
  return `${gradientType}(${processedParts.join(', ')})`;
}

function processBackground(background: string | undefined, alpha: number = 0.3): string | undefined {
  if (!background) return undefined;
  
  // Check if it's already semi-transparent
  if (isSemiTransparentColor(background)) return background;
  
  // Check if it's a gradient
  if (background.includes('gradient')) {
    return addTransparencyToGradient(background, alpha);
  }
  
  // Check if it's a URL (image)
  if (background.includes('url(')) return background;
  
  // Treat as solid color
  return addTransparencyToColor(background, alpha);
}

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 200;

const preset = {
  scale: 160,
  radius: 50,
  border: 0.05,
  lightness: 53,
  displace: 5,
  alpha: 0.9,
  blur: 0,
  dispersion: 50,
  saturation: 140,
  aberrationIntensity: 0,
  frost: 0.1,
  borderColor: "rgba(120, 120, 120, 0.7)"
};

export function LiquidGlass({ 
  children,
  mode = "preset",
  scale = 160,
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
  glassColor,
  background,
  autoTextColor = false,
  textOnDark = '#ffffff',
  textOnLight = '#111111',
  forceTextColor = false,
  className = "",
  style = {},
  iosMinBlur = 7,
  iosBlurMode = 'auto',
  ...props
}: LiquidGlassProps) {
  // Configuration based on mode
  let config: {
    mode: string;
    scale: number;
    radius: number;
    border: number;
    lightness: number;
    displace: number;
    alpha: number;
    blur: number;
    dispersion: number;
    saturation: number;
    aberrationIntensity: number;
    frost: number;
    borderColor: string;
    blend: 'difference';
    x: DisplacementChannel;
    y: DisplacementChannel;
  };
  if (mode === "preset") {
    config = {
      // baseline to preset, but allow incoming props to override as per library behavior
      ...preset,
      scale,
      radius,
      border,
      lightness,
      displace,
      alpha,
      blur,
      dispersion,
      saturation,
      aberrationIntensity,
      frost,
      borderColor,
      mode: "preset",
      blend: "difference",
      x: "R",
      y: "B",
    };
  } else {
    config = {
      mode,
      scale,
      radius,
      border,
      lightness,
      displace,
      alpha,
      blur,
      dispersion,
      saturation,
      aberrationIntensity,
      frost,
      borderColor,
      blend: "difference",
      x: "R",
      y: "B"
    };
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT
  });
  const [effectiveTextColor, setEffectiveTextColor] = useState<string>(textOnLight);
  const textClassNameRef = useRef<string | null>(null);
  if (!textClassNameRef.current) {
    textClassNameRef.current = `lg-text-${Math.random().toString(36).slice(2, 9)}`;
  }

  function parseCssColorToRgba(color: string): { r: number; g: number; b: number; a: number } | null {
    const c = color.trim();
    let m: RegExpExecArray | null;
    if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i.exec(c))) {
      const r = parseInt(m[1], 10);
      const g = parseInt(m[2], 10);
      const b = parseInt(m[3], 10);
      const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
      return { r, g, b, a };
    }
    if ((m = /^#([0-9a-f]{3})$/i.exec(c))) {
      const hex = m[1];
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    }
    if ((m = /^#([0-9a-f]{4})$/i.exec(c))) {
      const hex = m[1];
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = parseInt(hex[3] + hex[3], 16) / 255;
      return { r, g, b, a };
    }
    if ((m = /^#([0-9a-f]{6})$/i.exec(c))) {
      const hex = m[1];
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b, a: 1 };
    }
    if ((m = /^#([0-9a-f]{8})$/i.exec(c))) {
      const hex = m[1];
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return { r, g, b, a };
    }
    // hsla/hsl are not needed for detection since computed style returns rgb/rgba
    return null;
  }

  function findNearestOpaqueBackground(element: HTMLElement | null): { r: number; g: number; b: number; a: number } | null {
    let el: HTMLElement | null = element;
    while (el) {
      const style = getComputedStyle(el);
      const bg = style.backgroundColor;
      const parsed = bg ? parseCssColorToRgba(bg) : null;
      if (parsed && parsed.a > 0) {
        return parsed;
      }
      el = el.parentElement;
    }
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    return bodyBg ? parseCssColorToRgba(bodyBg) : null;
  }

  function isRgbColorDark(rgb: { r: number; g: number; b: number }): boolean {
    const srgb = [rgb.r, rgb.g, rgb.b].map(v => v / 255);
    const linear = srgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return luminance < 0.5; // threshold
  }

  // Update dimensions when the container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (!containerRef.current) return;

      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      
      setDimensions({ width, height });
    };

    // Initial measurement
    updateDimensions();

    // Create ResizeObserver to watch for size changes
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Auto-detect background and set text color for children; updates on resize/scroll/mutations
  useEffect(() => {
    if (!autoTextColor) return;

    const update = () => {
      const target = containerRef.current?.parentElement ?? null;
      if (!target) return;
      const bg = findNearestOpaqueBackground(target);
      if (!bg) {
        setEffectiveTextColor(textOnLight);
        return;
      }
      const dark = isRgbColorDark({ r: bg.r, g: bg.g, b: bg.b });
      setEffectiveTextColor(dark ? textOnDark : textOnLight);
    };

    update();

    const onWindowChange = () => update();
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);

    const observers: MutationObserver[] = [];
    const observedNodes: HTMLElement[] = [];
    let el: HTMLElement | null = containerRef.current?.parentElement ?? null;
    while (el) {
      observedNodes.push(el);
      el = el.parentElement;
    }
    observedNodes.push(document.body);

    for (const node of observedNodes) {
      if (!node) continue;
      const obs = new MutationObserver(update);
      obs.observe(node, { attributes: true, attributeFilter: ['class', 'style'] });
      observers.push(obs);
    }

    return () => {
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
      observers.forEach(o => o.disconnect());
    };
  }, [autoTextColor, textOnDark, textOnLight]);

  // Effective radius in px clamped to box (prevents mismatch when radius > half size)
  const effectiveRadiusPx = Math.min(config.radius, dimensions.width / 2, dimensions.height / 2);

  // Generate displacement map SVG as data URI
  const displacementDataUri = useMemo(() => {
    const { width, height } = dimensions;
    const newwidth = width / 2;
    const newheight = height / 2;
    const borderWidth = Math.min(newwidth, newheight) * (config.border * 0.5);
    
    // Ensure radius doesn't exceed container constraints for consistent CSS/SVG behavior
    const effectiveRadius = Math.min(config.radius, width / 2, height / 2) / 2; // scaled to half-res viewBox
    
    const svgContent = `
      <svg viewBox="0 0 ${newwidth} ${newheight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="blue" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${newwidth}" height="${newheight}" fill="black"/>
        <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#red)" />
        <rect x="0" y="0" width="${newwidth}" height="${newheight}" rx="${effectiveRadius}" fill="url(#blue)" style="mix-blend-mode: ${config.blend}" />
        <rect x="${borderWidth}" y="${borderWidth}" width="${newwidth - borderWidth * 2}" height="${newheight - borderWidth * 2}" rx="${effectiveRadius}" fill="hsl(0 0% ${config.lightness}% / ${config.alpha})" style="filter:blur(${config.displace}px)" />
      </svg>
    `;
    
    const encoded = encodeURIComponent(svgContent);
    return `data:image/svg+xml,${encoded}`;
  }, [dimensions, config]);

  // Generate a unique ID for the SVG filter
  const uniqueFilterId = useId();
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
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
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

  // Build backdrop-filter string with iOS fallback
  const cssBlur = isIOS && iosBlurMode === 'auto' ? Math.max(blur, iosMinBlur) : blur;
  const backdropFilterValue = isIOS && iosBlurMode === 'auto'
    ? `blur(${cssBlur}px) saturate(${config.saturation}%)`
    : `saturate(${config.saturation}%) url(#${filterId})`;

  const glassMorphismStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: effectiveRadiusPx,
    position: "absolute",
    zIndex: 1,
    background: resolvedGlassBackground,
    backdropFilter: backdropFilterValue,
    WebkitBackdropFilter: backdropFilterValue,
    overflow: 'hidden'
  };

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
      {...props}
    >
      <div style={glassMorphismStyle}>
        <svg 
          className="liquid-glass-filter"
          style={{
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            position: "absolute",
            inset: 0
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter 
              id={filterId}
              colorInterpolationFilters="sRGB"
            >
              <feImage 
                href={displacementDataUri}
                x="0"
                y="0"
                width="100%"
                height="100%"
                result="map"
              />
              
              <feDisplacementMap 
                in="SourceGraphic"
                in2="map"
                scale={config.scale + config.dispersion * config.aberrationIntensity}
                xChannelSelector={config.x}
                yChannelSelector={config.y}
                result="dispRed"
              />
              <feColorMatrix 
                in="dispRed"
                type="matrix"
                values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
                result="red"
              />
              
              <feDisplacementMap 
                in="SourceGraphic"
                in2="map"
                scale={config.scale}
                xChannelSelector={config.x}
                yChannelSelector={config.y}
                result="dispGreen"
              />
              <feColorMatrix 
                in="dispGreen"
                type="matrix"
                values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
                result="green"
              />
              
              <feDisplacementMap 
                in="SourceGraphic"
                in2="map"
                scale={config.scale - config.dispersion * config.aberrationIntensity}
                xChannelSelector={config.x}
                yChannelSelector={config.y}
                result="dispBlue"
              />
              <feColorMatrix 
                in="dispBlue"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
                result="blue"
              />
              
              <feBlend 
                in="red"
                in2="green"
                mode="screen"
                result="rg"
              />
              <feBlend 
                in="rg"
                in2="blue"
                mode="screen"
                result="output"
              />
              <feGaussianBlur 
                in="output"
                stdDeviation={config.blur}
              />
            </filter>
          </defs>
        </svg>
      </div>
      
      <div 
        className="liquid-glass-border"
        style={gradientBorderStyle}
      />
      
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
          className={forceTextColor ? textClassNameRef.current ?? undefined : undefined}
        >
          {forceTextColor && autoTextColor && (
            <style>
              {`
                .${textClassNameRef.current}, .${textClassNameRef.current} * { transition: color 300ms ease; }
                .${textClassNameRef.current} { color: ${effectiveTextColor} !important; }
                .${textClassNameRef.current} * { color: ${effectiveTextColor} !important; }
              `}
            </style>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

LiquidGlass.displayName = "LiquidGlass";

export default LiquidGlass;
export { default as WebGLLiquidGlass } from './webgl/WebGLLiquidGlass';

// Removed non-working experimental components per user request