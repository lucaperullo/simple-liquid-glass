/**
 * `<liquid-glass>` custom element — framework-agnostic (vanilla / Vue / Svelte / Angular /
 * Astro / plain HTML). Reuses the canonical displacement-map generator so the look matches
 * the React component. Chromium gets the SVG-in-backdrop-filter refraction; other engines get
 * the frosted CSS fallback. SSR-safe (only touches the DOM when defined in a browser).
 *
 * Usage:
 *   <script type="module" src="…/simple-liquid-glass/web-component"></script>
 *   <liquid-glass radius="20" frost="0.15" style="width:320px;height:200px"> … </liquid-glass>
 */
import { buildDisplacementDataUri } from '../core/displacementMap';

const TAG = 'liquid-glass';
let uid = 0;

function isChromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/(iphone|ipad|ipod)/i.test(ua)) return false;
  if (/firefox|fxios/i.test(ua)) return false;
  return /(chrome|chromium|edg|opr)\//i.test(ua);
}

function attrNum(el: HTMLElement, name: string, fallback: number): number {
  const v = parseFloat(el.getAttribute(name) || '');
  return Number.isFinite(v) ? v : fallback;
}

const SHEEN =
  'linear-gradient(135deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 16%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 72%, rgba(255,255,255,0.12) 100%)';

export class LiquidGlassElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['radius', 'frost', 'blur', 'saturation', 'displace', 'scale', 'border-color', 'lightness', 'alpha'];
  }

  private readonly filterId = `lg-wc-${++uid}`;
  private readonly root: ShadowRoot;
  private ro?: ResizeObserver;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.render());
      this.ro.observe(this);
    }
  }

  disconnectedCallback(): void {
    this.ro?.disconnect();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  private render(): void {
    const radius = attrNum(this, 'radius', 50);
    const frost = attrNum(this, 'frost', 0.1);
    const blur = attrNum(this, 'blur', 0);
    const saturation = attrNum(this, 'saturation', 140);
    const displace = attrNum(this, 'displace', 5);
    const scale = attrNum(this, 'scale', 160);
    const lightness = attrNum(this, 'lightness', 53);
    const alpha = attrNum(this, 'alpha', 0.9);
    const border = 0.05;
    const borderColor = this.getAttribute('border-color') || 'rgba(120, 120, 120, 0.7)';

    const r = this.getBoundingClientRect();
    const width = r.width || 300;
    const height = r.height || 180;
    const chromium = isChromium();

    let backdrop: string;
    let glassBg: string;
    let glassShadow = '';
    let svg = '';

    if (chromium) {
      const uri = buildDisplacementDataUri({
        width, height, divisor: 3, quantStep: 24, radius, border, lightness, alpha, displace, blend: 'difference'
      });
      backdrop = `saturate(${saturation}%) url(#${this.filterId})`;
      glassBg = `hsl(0 0% 100% / ${frost})`;
      svg = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="${this.filterId}" color-interpolation-filters="sRGB"><feImage href="${uri}" x="0" y="0" width="100%" height="100%" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="B" result="out"/><feGaussianBlur in="out" stdDeviation="${blur}"/></filter></svg>`;
    } else {
      const frostPx = Math.max(blur, 9);
      backdrop = `blur(${frostPx}px) saturate(${Math.max(saturation, 160)}%) brightness(1.04)`;
      glassBg = `${SHEEN}, hsl(0 0% 100% / ${frost})`;
      glassShadow = 'box-shadow: 0 6px 22px rgba(0, 0, 0, 0.12);';
    }

    this.root.innerHTML = `
      <style>
        :host { display: block; position: relative; }
        .lg-glass { position: absolute; inset: 0; border-radius: ${radius}px; overflow: hidden;
          background: ${glassBg}; backdrop-filter: ${backdrop}; -webkit-backdrop-filter: ${backdrop}; ${glassShadow} }
        .lg-border { position: absolute; inset: 0; border-radius: ${radius}px; pointer-events: none;
          background: linear-gradient(315deg, ${borderColor} 0%, rgba(120,120,120,0) 30%, rgba(120,120,120,0) 70%, ${borderColor} 100%) border-box;
          -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0); mask-composite: exclude; border: 1px solid transparent; }
        .lg-content { position: relative; z-index: 2; width: 100%; height: 100%; }
      </style>
      <div class="lg-glass"></div>
      <div class="lg-border"></div>
      <div class="lg-content"><slot></slot></div>
      ${svg}
    `;
  }
}

export function defineLiquidGlass(tag: string = TAG): void {
  if (typeof window === 'undefined' || !window.customElements) return;
  if (!customElements.get(tag)) customElements.define(tag, LiquidGlassElement);
}

// Auto-register on import (the common case for a web component entry).
defineLiquidGlass();
