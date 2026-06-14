/** `<liquid-glass>` custom element (framework-agnostic). Importing the module auto-registers it. */
export declare class LiquidGlassElement extends HTMLElement {
  static get observedAttributes(): string[];
  connectedCallback(): void;
  disconnectedCallback(): void;
  attributeChangedCallback(): void;
}

/** Manually register the element (optionally under a custom tag). No-op during SSR. */
export declare function defineLiquidGlass(tag?: string): void;
