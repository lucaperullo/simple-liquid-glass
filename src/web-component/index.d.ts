/**
 * `<liquid-glass>` custom element (framework-agnostic). Importing the module auto-registers it.
 *
 * Observed attributes (all optional, kebab-case): `radius`, `frost`, `blur`, `saturation`,
 * `displace`, `scale`, `border-color`, `lightness`, `alpha`, `angle`, `shape-adapt`, `lens`,
 * `lens-strength`, `lens-center`, `liquid`, `liquid-speed`, `liquid-scale`.
 *
 * Refraction renders on Chromium / Edge / Android-Chrome; Safari / iOS / Firefox get a frosted-glass
 * fallback (live-backdrop refraction is a Chromium-only capability).
 */
export declare class LiquidGlassElement extends HTMLElement {
  static get observedAttributes(): string[];
  connectedCallback(): void;
  disconnectedCallback(): void;
  attributeChangedCallback(): void;
}

/** Manually register the element (optionally under a custom tag). No-op during SSR. */
export declare function defineLiquidGlass(tag?: string): void;
