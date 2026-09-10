import { HtmlCapture } from '../../vendor/ybouane/HtmlCapture';

// Panels sharing a backdrop also share its raster and mutation/resize observers.
const sources = new WeakMap<HTMLElement, Source>();
class Source {
  readonly capture: HtmlCapture;
  readonly listeners = new Set<(error?: unknown) => void>();
  private observer: MutationObserver;
  private resize?: ResizeObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private queued = false;
  private disposed = false;
  private geometry = '';
  constructor(readonly element: HTMLElement) {
    this.capture = new HtmlCapture(element);
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => {
        const geometry = `${element.offsetWidth}:${element.offsetHeight}:${devicePixelRatio}`;
        if (geometry !== this.geometry) { this.geometry = geometry; this.schedule(); }
      });
      this.resize.observe(element);
    }
    element.addEventListener('load', this.schedule, true);
    element.addEventListener('input', this.schedule, true);
    element.addEventListener('change', this.schedule, true);
    window.addEventListener('resize', this.onResize);
  }
  private onResize = () => {
    const geometry = `${this.element.offsetWidth}:${this.element.offsetHeight}:${devicePixelRatio}`;
    if (geometry !== this.geometry) { this.geometry = geometry; this.schedule(); }
  };
  private schedule = () => {
    // Bound the wait: a stream of mutations must not postpone capture forever.
    if (this.disposed || this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.refresh().catch(() => {}); }, 120);
  };
  refresh = (): Promise<void> => {
    this.queued = true;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      await this.capture.prefetchFontEmbedCSS();
      while (this.queued && !this.disposed) {
        this.queued = false;
        const w = Math.max(1, this.element.offsetWidth), h = Math.max(1, this.element.offsetHeight);
        // Bound CPU snapshot memory as well as GPU uploads, including very long pages.
        this.capture.dpr = Math.min(devicePixelRatio || 1, 2, 16384 / w, 16384 / h, Math.sqrt(16 * 1024 * 1024 / (w * h)));
        await this.capture.captureElement(this.element, true);
        if (!this.disposed) this.listeners.forEach(listener => listener());
      }
    })().catch(error => {
      if (!this.disposed) this.listeners.forEach(listener => listener(error));
      throw error;
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  };
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.observer.disconnect(); this.resize?.disconnect();
    this.element.removeEventListener('load', this.schedule, true);
    this.element.removeEventListener('input', this.schedule, true);
    this.element.removeEventListener('change', this.schedule, true);
    window.removeEventListener('resize', this.onResize);
    this.capture.destroy();
  }
}
export function acquireSource(element: HTMLElement, listener: (error?: unknown) => void) {
  let source = sources.get(element);
  if (!source) { source = new Source(element); sources.set(element, source); }
  source.listeners.add(listener);
  const shared = source;
  return {
    capture: shared.capture,
    refresh: shared.refresh,
    release() {
      shared.listeners.delete(listener);
      if (!shared.listeners.size) { shared.dispose(); sources.delete(element); }
    }
  };
}
