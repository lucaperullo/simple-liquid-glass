let cloneId = 0;

/** Decorative snapshot: isolate document IDs and remove interaction from the copy. */
export function cloneBackdrop(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  // Preserve root presentation before its ID and ancestry change in the decorative copy.
  // In particular, ID-based backgrounds otherwise become transparent after namespacing.
  const computed = getComputedStyle(source);
  for (const property of Array.from(computed)) {
    clone.style.setProperty(property, computed.getPropertyValue(property));
  }
  const prefix = `lg-clone-${++cloneId}-`;
  clone.setAttribute('inert', '');
  clone.setAttribute('aria-hidden', 'true');
  clone.querySelectorAll('script, iframe, object, embed, [data-liquid-glass]').forEach(node => node.remove());
  const elements = [clone, ...Array.from(clone.querySelectorAll('*'))];
  const ids = new Map<string, string>();
  for (const el of elements) {
    if (el.id) {
      const id = `${prefix}${ids.size}`;
      ids.set(el.id, id);
      el.id = id;
    }
    el.removeAttribute('autofocus');
    el.removeAttribute('name');
    if (el.matches('a, button, input, select, textarea, [tabindex], [contenteditable]')) {
      el.setAttribute('tabindex', '-1');
      el.setAttribute('contenteditable', 'false');
    }
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  }
  // Preserve local SVG paint/filter references after namespacing IDs.
  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      let value = attr.value.replace(/url\(['"]?#([^)'" ]+)['"]?\)/g,
        (match, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : match);
      if ((attr.name === 'href' || attr.name === 'xlink:href') && value.startsWith('#')) {
        value = ids.has(value.slice(1)) ? `#${ids.get(value.slice(1))}` : value;
      }
      if (value !== attr.value) el.setAttribute(attr.name, value);
    }
  }
  return clone;
}
