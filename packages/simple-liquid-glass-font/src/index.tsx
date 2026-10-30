import {useLiquidGlassBackdrop} from 'simple-liquid-glass/backdrop';
import { createWebGLSurface, joinGlassCrowd, supportsSvgBackdrop, type GlassRenderer, type WebGLSurface, type WebGLSurfaceStatus } from 'simple-liquid-glass/webgl';
import React, { useEffect, useId, useRef, useState, useMemo } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';
import { glyphOptics } from './fields';

export interface LiquidGlassTextProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Single-line text. Font styles are inherited from the surrounding element. */
  children: string;
  /** Automatic WebGL on Safari, iOS and Firefox, and for 16 or more words side by side on desktop Chromium;
   * select webgl for Chromium always. */
  renderer?: GlassRenderer;
  /** WebGL words in the same container share one canvas ('auto'); 'off' keeps one canvas per word. */
  webglScene?: 'auto' | 'off';
  /** Explicit sibling background. Select video/canvas directly for live frames. */
  backdropRef?: React.RefObject<HTMLElement | null>;
  backdropSelector?: string;
  /** Change after external stylesheet/theme changes to refresh HTML capture. */
  backdropVersion?: string | number;
  /** Background blur in CSS pixels. Default: 0.3. */
  blur?: number;
  /** Background saturation multiplier. Default: 1.2. */
  saturation?: number;
  /** Translucent CSS color painted inside the letters. */
  tint?: string;
  /** SVG displacement scale in CSS pixels (0–300). Default: 88. */
  refraction?: number;
  /** Width of the curved letter edge in CSS pixels (1–32). Default: 8. */
  bevel?: number;
  /** Difference between the red and blue displacement scales (0–8). Default: 1.5. */
  dispersion?: number;
  /** Directional edge highlight intensity (0–2). Default: 0.8. */
  specular?: number;
  /** Letter outline width in CSS pixels (0–6). Default: 1. */
  borderWidth?: number;
  /** CSS outline color. Default: 75% white. */
  borderColor?: string;
  /** CSS fill over the glass. Default: 10% white. */
  fillColor?: string;
  /** CSS text-shadow. Default: a soft dark shadow; "none" disables it. */
  shadow?: string;
}

const bounded = (value: number, fallback: number, max: number, min = 0) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
// Words are grouped by the element holding their wrappers: their glass is composited in one canvas there.
// Canvas resolves family names, not CSS system-font keywords: computed styles quote generic keywords, and
// -apple-system / BlinkMacSystemFont are CSS-only aliases. Map them so the glyph raster uses the same face.
const GENERIC = /^(system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|sans-serif|serif|monospace|cursive|fantasy)$/;
const canvasFamily = (family: string) => family.split(',').map(name => {
  const bare = name.trim().replace(/^["']|["']$/g, '');
  return bare === '-apple-system' || bare === 'BlinkMacSystemFont' ? 'system-ui' : GENERIC.test(bare) ? bare : `"${bare}"`;
}).join(', ');
const groupRoot = (layout: HTMLElement) => layout.parentElement?.parentElement ?? null;
const isMobile = () => /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

export function LiquidGlassText({
  children, renderer = 'auto', webglScene = 'auto', backdropRef, backdropSelector, backdropVersion, blur = .3, saturation = 1.2, tint = 'rgb(255 255 255 / 0.04)',
  refraction = 88, bevel = 8, dispersion = 1.5, specular = .8,
  borderWidth = 1, borderColor = 'rgb(255 255 255 / 0.75)',
  fillColor = 'rgb(255 255 255 / 0.1)', shadow = '0 2px 4px rgb(0 0 0 / 0.25)',
  className, style, ...props
}: LiquidGlassTextProps) {
  const layoutRef = useRef<HTMLSpanElement>(null);
  const gpuHolder = useRef<HTMLSpanElement>(null);
  const gpu = useRef<WebGLSurface | null>(null);
  const binding = useRef<{ element: HTMLElement; source: HTMLElement; shared: boolean } | null>(null);
  const [visible, setVisible] = useState(true);
  const [solidText, setSolidText] = useState(false);
  const [gpuStatus, setGpuStatus] = useState<WebGLSurfaceStatus>('pending');
  const textRef = useRef<HTMLSpanElement>(null);
  const baselineRef = useRef<HTMLSpanElement>(null);
  const [mask, setMask] = useState<string>();
  const [optics, setOptics] = useState<{ map: string; highlight: string; glyphs: ImageData; width: number; height: number }>();
  const [crowded, setCrowded] = useState(false);
  const [native, setNative] = useState<boolean>();
  const filterId = `slgf-lens-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const bend = bounded(refraction, 88, 300);
  const edge = bounded(bevel, 8, 32, 1);
  const spread = bend === 0 ? 0 : bounded(dispersion, 1.5, 8);
  const blurRadius = bounded(blur, .3, 32);
  const saturationValue = bounded(saturation, 1.2, 3);

  useEffect(() => {
    const text = textRef.current;
    const marker = baselineRef.current;
    if (!text || !marker) return;
    // CSS.supports alone also returns true in engines that do not render SVG backdrop filters.
    setNative(supportsSvgBackdrop(navigator.userAgent, navigator.maxTouchPoints || 0));
    let active = true;
    let lastMeasurement = '';
    const measure = () => {
      if (!active) return;
      const computed = getComputedStyle(text);
      const width = parseFloat(computed.width);
      const height = parseFloat(computed.height);
      if (!width || !height) { lastMeasurement = ''; setMask(undefined); setOptics(undefined); return; }
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${canvasFamily(computed.fontFamily)}`;
      const signature = JSON.stringify([children, edge, width, height, ratio, marker.offsetTop, font,
        computed.fontKerning, computed.fontStretch, computed.fontVariantCaps,
        computed.letterSpacing, computed.wordSpacing, computed.direction, computed.textTransform,
        document.fonts?.check(font, children)]);
      if (signature === lastMeasurement) return;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return;
      lastMeasurement = signature;
      context.scale(canvas.width / width, canvas.height / height);
      context.font = font;
      context.fontKerning = computed.fontKerning as CanvasFontKerning;
      context.fontStretch = computed.fontStretch as CanvasFontStretch;
      context.fontVariantCaps = computed.fontVariantCaps as CanvasFontVariantCaps;
      context.letterSpacing = computed.letterSpacing;
      context.wordSpacing = computed.wordSpacing;
      context.direction = computed.direction as CanvasDirection;
      context.textAlign = 'left';
      let content = children;
      if (computed.textTransform === 'uppercase') content = content.toLocaleUpperCase();
      if (computed.textTransform === 'lowercase') content = content.toLocaleLowerCase();
      context.fillText(content, 0, marker.offsetTop, width);
      // The raster is the glyph mask (also for a shared WebGL scene); the lens field is built off the main thread.
      const glyphs = context.getImageData(0, 0, canvas.width, canvas.height);
      void glyphOptics(signature, glyphs, edge * ratio).then(built => {
        if (!active || lastMeasurement !== signature) return;
        setMask(built.mask);
        setOptics({ map: built.map, highlight: built.highlight, glyphs: built.glyphs, width, height });
      }, () => { if (active && lastMeasurement === signature) lastMeasurement = ''; });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(text);
    window.addEventListener('resize', measure);
    const fontLoaded = (event: FontFaceSetLoadEvent) => {
      const family = getComputedStyle(text).fontFamily.toLowerCase();
      if (event.fontfaces.some(face => family.includes(face.family.replace(/["']/g, '').toLowerCase()))) lastMeasurement = '';
      measure();
    };
    document.fonts?.addEventListener('loadingdone', fontLoaded);
    void document.fonts?.ready.then(measure);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.fonts?.removeEventListener('loadingdone', fontLoaded);
    };
  }, [children, className, style, edge]);

  useEffect(() => {
    const media = matchMedia('(forced-colors: active), (prefers-reduced-transparency: reduce), print');
    const update = () => setSolidText(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  // Chromium draws every SVG word in its own GPU pass; a crowd of words renders through one WebGL canvas instead.
  useEffect(() => {
    const element = layoutRef.current;
    if (renderer !== 'auto' || webglScene === 'off' || !native || solidText || !element || isMobile()) { setCrowded(false); return; }
    let source: HTMLElement | null = null;
    try { source = backdropRef?.current ?? (backdropSelector ? document.querySelector<HTMLElement>(backdropSelector) : null); } catch { /* invalid selector */ }
    const leave = joinGlassCrowd(element, source, setCrowded, groupRoot(element));
    if (!leave) setCrowded(false);
    return leave;
  }, [renderer, webglScene, native, solidText, backdropRef, backdropSelector]);
  const wantsGPU = !solidText && native !== undefined && (!native || renderer === 'webgl' || crowded);
  const scene=useLiquidGlassBackdrop(layoutRef,wantsGPU&&visible&&!backdropRef&&!backdropSelector);
  const gpuReady = wantsGPU && gpuStatus === 'active';
  const gpuOptions = useMemo(() => ({ map: optics?.map ?? '', scale: bend, dispersion: spread,
    additiveDispersion: true, neutralPoint: 128/255, specular: 0, classic: false,
    radius: 0, blur: blurRadius, saturation: saturationValue * 100, mask: optics?.glyphs
  }), [optics?.map, optics?.glyphs, bend, spread, blurRadius, saturationValue]);
  useEffect(() => {
    if (!layoutRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => setVisible(entries[entries.length - 1].isIntersecting), { rootMargin: '150px' });
    observer.observe(layoutRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const clear = () => { gpu.current?.destroy(); gpu.current = null; binding.current = null; };
    if (!wantsGPU || !visible || !optics || (scene.connected&&!scene.ready)) { clear(); setGpuStatus('pending'); return; }
    const element = layoutRef.current, output = gpuHolder.current;
    if (!element || !output) return;
    let source = backdropRef?.current ?? scene.backdropRef.current ?? null;
    try { if (!source && backdropSelector) source = document.querySelector<HTMLElement>(backdropSelector); }
    catch { clear(); setGpuStatus('invalid-selector'); return; }
    if (!source) { clear(); setGpuStatus('missing-backdrop'); return; }
    if (source.contains(element) || element.contains(source)) { clear(); setGpuStatus('invalid-backdrop'); return; }
    const shared = webglScene !== 'off';
    if (binding.current?.element === element && binding.current.source === source && binding.current.shared === shared) return;
    clear(); binding.current = { element, source, shared }; setGpuStatus('pending');
    try { gpu.current = createWebGLSurface(element, output, source, gpuOptions, setGpuStatus, shared ? { root: groupRoot(element) } : undefined); }
    catch { setGpuStatus('webgl-unavailable'); }
  });
  useEffect(() => () => { gpu.current?.destroy(); gpu.current = null; binding.current = null; }, []);
  useEffect(() => { gpu.current?.update(gpuOptions); }, [gpuOptions]);
  useEffect(() => { if (backdropVersion !== undefined) {scene.refresh();void gpu.current?.refresh().catch(() => {});} }, [backdropVersion]);

  // The SVG lens masks itself to the glyphs inside its filter: Chrome ignores a CSS mask on a backdrop filter inside
  // a rounded overflow clip, and an in-filter mask also follows the text through transforms.
  const svgLens = !gpuReady && !wantsGPU && !!native && !!optics;
  const cssMask = mask && !svgLens ? `url("${mask}")` : undefined, tintMask = mask ? `url("${mask}")` : undefined;
  const variables = {
    '--slgf-filter': gpuReady ? 'none' : svgLens ? `url(#${filterId})` : `blur(${blurRadius}px) saturate(${saturationValue})`,
    '--slgf-tint': tint,
    '--slgf-border-width': `${bounded(borderWidth, 1, 6)}px`,
    '--slgf-border-color': borderColor,
    '--slgf-fill-color': fillColor,
    '--slgf-shadow': shadow,
    '--slgf-specular': bounded(specular, .8, 2),
    ...style
  } as CSSProperties;

  return <span {...props} className={['slgf-text', className].filter(Boolean).join(' ')} style={variables}>
    <span ref={layoutRef} className="slgf-layout" data-ready={mask ? 'true' : undefined} data-renderer={gpuReady ? 'webgl' : svgLens ? 'native' : 'frosted'} data-renderer-reason={wantsGPU ? gpuStatus : undefined}>
      <span ref={textRef} className="slgf-letters">{children}<span ref={baselineRef} className="slgf-baseline" aria-hidden="true" /></span>
      <span className="slgf-backdrop" aria-hidden="true" style={{ maskImage: cssMask, WebkitMaskImage: cssMask }}><span ref={gpuHolder} style={{ position: 'absolute', inset: 0, visibility: gpuReady ? 'visible' : 'hidden', pointerEvents: 'none' }} /></span>
      <span className="slgf-tint" aria-hidden="true" data-mask={mask ? '' : undefined} style={{ maskImage: tintMask, WebkitMaskImage: tintMask }} />
      <span className="slgf-highlight" aria-hidden="true" style={{ backgroundImage: optics ? `url("${optics.highlight}")` : undefined }} />
      <svg className="slgf-filter" aria-hidden="true" focusable="false">
        {optics && <defs><filter id={filterId} filterUnits="userSpaceOnUse" x={-bend - 16} y={-bend - 16}
          width={optics.width + 2 * (bend + 16)} height={optics.height + 2 * (bend + 16)} colorInterpolationFilters="sRGB">
          <feImage href={optics.map} x="0" y="0" width={optics.width} height={optics.height} preserveAspectRatio="none" result="rawMap" />
          <feComponentTransfer in="rawMap" result="map">
            <feFuncR type="linear" slope="1" intercept={-1 / 510} />
            <feFuncG type="linear" slope="1" intercept={-1 / 510} />
          </feComponentTransfer>
          {spread === 0 ? <feDisplacementMap in="SourceGraphic" in2="map" scale={bend} xChannelSelector="R" yChannelSelector="G" /> : <>
            <feDisplacementMap in="SourceGraphic" in2="map" scale={bend + spread} xChannelSelector="R" yChannelSelector="G" result="redDisplaced" />
            <feColorMatrix in="redDisplaced" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={bend} xChannelSelector="R" yChannelSelector="G" result="greenDisplaced" />
            <feColorMatrix in="greenDisplaced" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={Math.max(0, bend - spread)} xChannelSelector="R" yChannelSelector="G" result="blueDisplaced" />
            <feColorMatrix in="blueDisplaced" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue" />
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="lensed" />
          </>}
          <feGaussianBlur stdDeviation={blurRadius} result="frosted" />
          <feColorMatrix in="frosted" type="saturate" values={String(saturationValue)} result="saturated" />
          <feImage href={mask} x="0" y="0" width={optics.width} height={optics.height} preserveAspectRatio="none" result="glyphs" />
          <feComposite in="saturated" in2="glyphs" operator="in" />
        </filter></defs>}
      </svg>
    </span>
  </span>;
}
