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
  autoTextColor?: boolean; // auto-detect background and set text color
  textOnDark?: string; // text color when background is dark
  textOnLight?: string; // text color when background is light
  forceTextColor?: boolean; // enforce text color on descendants
  autoTextColorMode?: 'global' | 'perPixel'; // strategy for auto text color
  perPixelTargetSelector?: string; // CSS selector for elements to adapt in perPixel mode
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
  aberrationIntensity: 2,
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
  aberrationIntensity = 2,
  frost = 0.1,
  borderColor = "rgba(120, 120, 120, 0.7)",
  glassColor,
  autoTextColor = false,
  autoTextColorMode = 'global',
  perPixelTargetSelector = '[data-lg-autotext]',
  textOnDark = '#ffffff',
  textOnLight = '#111111',
  forceTextColor = false,
  className = "",
  style = {},
  iosMinBlur = 2,
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
  const glassRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const mirrorsRef = useRef<HTMLElement[]>([]);
  const [dimensions, setDimensions] = useState({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT
  });
  const [effectiveTextColor, setEffectiveTextColor] = useState<string>(textOnLight);
  const textClassNameRef = useRef<string | null>(null);
  if (!textClassNameRef.current) {
    textClassNameRef.current = `lg-text-${Math.random().toString(36).slice(2, 9)}`;
  }
  const perPixelClassNameRef = useRef<string | null>(null);
  if (!perPixelClassNameRef.current) {
    perPixelClassNameRef.current = `lg-perpixel-${Math.random().toString(36).slice(2, 9)}`;
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
    if (autoTextColorMode === 'perPixel') return; // CSS-only in perPixel mode

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
  }, [autoTextColor, autoTextColorMode, textOnDark, textOnLight]);

  // Automatically tag text-bearing descendants for perPixel mode
  useEffect(() => {
    if (!autoTextColor || autoTextColorMode !== 'perPixel') return;
    const root = contentRef.current;
    if (!root) return;

    const shouldTag = (el: HTMLElement): boolean => {
      if (el.hasAttribute('data-lg-no-autotext')) return false;
      if (el.hasAttribute('data-lg-autotext') || el.hasAttribute('data-lg-autotext-auto')) return false;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      // Must contain a non-empty text node
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && !!n.textContent && n.textContent.trim().length > 0);
      return hasText;
    };

    const tagAll = () => {
      const all = root.querySelectorAll('*');
      for (const node of Array.from(all)) {
        const el = node as HTMLElement;
        if (shouldTag(el)) el.setAttribute('data-lg-autotext-auto', '');
      }
    };

    tagAll();

    const mo = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type === 'childList') {
          rec.addedNodes.forEach(n => {
            if (n.nodeType === 1) {
              const el = n as HTMLElement;
              if (shouldTag(el)) el.setAttribute('data-lg-autotext-auto', '');
              el.querySelectorAll('*').forEach(child => {
                const c = child as HTMLElement;
                if (shouldTag(c)) c.setAttribute('data-lg-autotext-auto', '');
              });
            }
          });
        } else if (rec.type === 'attributes') {
          const el = rec.target as HTMLElement;
          if (shouldTag(el)) el.setAttribute('data-lg-autotext-auto', '');
        }
      }
    });
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });

    return () => {
      mo.disconnect();
      root.querySelectorAll('[data-lg-autotext-auto]').forEach(n => (n as HTMLElement).removeAttribute('data-lg-autotext-auto'));
    };
  }, [autoTextColor, autoTextColorMode, perPixelTargetSelector]);

  // Per-pixel mode: punch holes in the glass behind targeted text so blending sees the real background
  useEffect(() => {
    if (!autoTextColor || autoTextColorMode !== 'perPixel') return;
    if (!containerRef.current || !glassRef.current) return;

    let rafId = 0;
    const ensureMirrors = () => {
      const searchRoot = contentRef.current ?? containerRef.current!;
      const effectiveTargetSelector = `${perPixelTargetSelector}, [data-lg-autotext], [data-lg-autotext-auto]`;
      const targets = Array.from(searchRoot.querySelectorAll(effectiveTargetSelector)) as HTMLElement[];
      // remove mirrors for removed targets
      mirrorsRef.current = mirrorsRef.current.filter(m => {
        const targetId = m.getAttribute('data-lg-mirror-for');
        const stillExists = targets.some(t => t.dataset.lgMirrorId === targetId);
        if (!stillExists) {
          m.remove();
          return false;
        }
        return true;
      });
      // add mirrors for new targets
      for (const t of targets) {
        if (!t.dataset.lgMirrorId) {
          t.dataset.lgMirrorId = Math.random().toString(36).slice(2, 9);
        }
        const already = mirrorsRef.current.find(m => m.getAttribute('data-lg-mirror-for') === t.dataset.lgMirrorId);
        if (already) continue;
        const mirror = document.createElement('span');
        mirror.setAttribute('data-lg-mirror', '');
        mirror.setAttribute('data-lg-mirror-for', t.dataset.lgMirrorId);
        mirror.style.position = 'fixed';
        mirror.style.pointerEvents = 'none';
        mirror.style.mixBlendMode = 'difference';
        mirror.style.color = '#fff';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.zIndex = '2147483647';
        document.body.appendChild(mirror);
        mirrorsRef.current.push(mirror);
      }
    };
    const updateMask = () => {
      if (!containerRef.current || !glassRef.current) return;
      ensureMirrors();
      const containerRect = containerRef.current.getBoundingClientRect();
      const searchRoot = contentRef.current ?? containerRef.current;
      const effectiveTargetSelector = `${perPixelTargetSelector}, [data-lg-autotext], [data-lg-autotext-auto]`;
      const targets = Array.from(searchRoot!.querySelectorAll(effectiveTargetSelector)) as HTMLElement[];

      const baseImage = 'linear-gradient(#fff 0 0)';
      const images: string[] = [baseImage];
      const positions: string[] = ['0 0'];
      const sizes: string[] = ['100% 100%'];
      const repeats: string[] = ['no-repeat'];

      for (const t of targets) {
        const r = t.getBoundingClientRect();
        const left = Math.max(0, r.left - containerRect.left);
        const top = Math.max(0, r.top - containerRect.top);
        const width = Math.max(0, Math.min(containerRect.right, r.right) - Math.max(containerRect.left, r.left));
        const height = Math.max(0, Math.min(containerRect.bottom, r.bottom) - Math.max(containerRect.top, r.top));
        if (width <= 0 || height <= 0) continue;
        images.push('linear-gradient(#000 0 0)');
        positions.push(`${left}px ${top}px`);
        sizes.push(`${width}px ${height}px`);
        repeats.push('no-repeat');
      }

      const imgList = images.join(',');
      const posList = positions.join(',');
      const sizeList = sizes.join(',');
      const repList = repeats.join(',');
      const composites = new Array(Math.max(0, images.length - 1)).fill('exclude').join(',');
      const webkitComposites = new Array(Math.max(0, images.length - 1)).fill('xor').join(',');

      const el = glassRef.current;
      el.style.setProperty('mask-image', imgList);
      el.style.setProperty('mask-position', posList);
      el.style.setProperty('mask-size', sizeList);
      el.style.setProperty('mask-repeat', repList);
      if (composites) el.style.setProperty('mask-composite', composites);
      if (webkitComposites) el.style.setProperty('-webkit-mask-composite', webkitComposites);

      // Sync mirrors to targets
      for (const t of targets) {
        const id = t.dataset.lgMirrorId!;
        const mirror = mirrorsRef.current.find(m => m.getAttribute('data-lg-mirror-for') === id);
        if (!mirror) continue;
        const r = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        mirror.textContent = t.textContent || '';
        mirror.style.left = `${r.left}px`;
        mirror.style.top = `${r.top}px`;
        mirror.style.width = `${r.width}px`;
        mirror.style.height = `${r.height}px`;
        mirror.style.font = cs.font;
        mirror.style.lineHeight = cs.lineHeight;
        mirror.style.letterSpacing = cs.letterSpacing as string;
        mirror.style.textTransform = cs.textTransform as string;
        mirror.style.textShadow = 'none';
        mirror.style.textAlign = cs.textAlign as string;
        mirror.style.display = 'flex';
        mirror.style.alignItems = cs.display.includes('flex') ? (cs.alignItems as string) : 'center';
        mirror.style.justifyContent = cs.display.includes('flex') ? (cs.justifyContent as string) : 'center';
      }
      // Hide original text color to avoid double render glow
      for (const t of targets) {
        (t as HTMLElement).style.setProperty('color', 'transparent', 'important');
      }
    };

    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateMask();
      });
    };

    updateMask();

    const ro = new ResizeObserver(() => schedule());
    ro.observe(containerRef.current);
    const targetsObserve = () => {
      const searchRoot = contentRef.current ?? containerRef.current!;
      const effectiveTargetSelector = `${perPixelTargetSelector}, [data-lg-autotext], [data-lg-autotext-auto]`;
      const targets = Array.from(searchRoot.querySelectorAll(effectiveTargetSelector)) as HTMLElement[];
      for (const t of targets) ro.observe(t);
    };
    targetsObserve();

    const mo = new MutationObserver((records) => {
      // Ignore self-updates caused by setting styles on the glass layer
      const relevant = records.some(r => {
        const isSelf = glassRef.current && r.target === glassRef.current && r.attributeName === 'style';
        return !isSelf;
      });
      if (relevant) {
        schedule();
        targetsObserve();
      }
    });
    mo.observe(containerRef.current, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });

    const onScroll = () => schedule();
    const onMove = () => schedule();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('resize', onMove);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('resize', onMove);
      if (rafId) cancelAnimationFrame(rafId);
      if (glassRef.current) {
        glassRef.current.style.removeProperty('mask-image');
        glassRef.current.style.removeProperty('mask-position');
        glassRef.current.style.removeProperty('mask-size');
        glassRef.current.style.removeProperty('mask-repeat');
        glassRef.current.style.removeProperty('mask-composite');
        glassRef.current.style.removeProperty('-webkit-mask-composite');
      }
      // Remove mirrors and restore text colors
      const container = containerRef.current;
      if (container) {
        const targets = Array.from(container.querySelectorAll(perPixelTargetSelector)) as HTMLElement[];
        for (const t of targets) t.style.removeProperty('color');
      }
      for (const m of mirrorsRef.current) m.remove();
      mirrorsRef.current = [];
    };
  }, [autoTextColor, autoTextColorMode, perPixelTargetSelector]);

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

  const resolvedGlassBackground =
    glassColor && isSemiTransparentColor(glassColor)
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
    background: autoTextColor && autoTextColorMode === 'perPixel' ? 'transparent' : resolvedGlassBackground,
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
    ...style
  };

  return (
    <div 
      ref={containerRef}
      className={className}
      style={containerStyle}
      {...props}
    >
      <div style={glassMorphismStyle} ref={glassRef}>
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
            color: autoTextColor && autoTextColorMode !== 'perPixel' ? effectiveTextColor : undefined,
            transition: 'color 300ms ease'
          }}
          ref={contentRef}
          className={[
            forceTextColor && autoTextColor && autoTextColorMode !== 'perPixel' ? (textClassNameRef.current ?? '') : '',
            autoTextColor && autoTextColorMode === 'perPixel' ? (perPixelClassNameRef.current ?? '') : ''
          ].filter(Boolean).join(' ') || undefined}
        >
          {forceTextColor && autoTextColor && autoTextColorMode !== 'perPixel' && (
            <style>
              {`
                .${textClassNameRef.current}, .${textClassNameRef.current} * { transition: color 300ms ease; }
                .${textClassNameRef.current} { color: ${effectiveTextColor} !important; }
                .${textClassNameRef.current} * { color: ${effectiveTextColor} !important; }
              `}
            </style>
          )}
          {autoTextColor && autoTextColorMode === 'perPixel' && (
            <style>
              {`
                .${perPixelClassNameRef.current} ${perPixelTargetSelector},
                .${perPixelClassNameRef.current} [data-lg-autotext],
                .${perPixelClassNameRef.current} [data-lg-autotext-auto] {
                  position: relative;
                  z-index: 4;
                  color: #fff !important;
                  mix-blend-mode: difference !important;
                  filter: grayscale(1) contrast(1000) !important;
                  transition: filter 200ms ease, color 200ms ease;
                }
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

// Removed non-working experimental components per user request