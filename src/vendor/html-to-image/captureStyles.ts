/** Sharing only within one detached capture avoids any invalidation/cache lifetime. */
export function canShareStyles(root: HTMLElement): boolean {
  return [root, ...Array.from(root.querySelectorAll('*'))].every(node =>
    node instanceof HTMLElement && !node.shadowRoot && !node.tagName.includes('-') && !node.hasAttribute('is') &&
    !['STYLE', 'LINK', 'IFRAME', 'CANVAS', 'VIDEO', 'SLOT', 'TEMPLATE', 'SCRIPT', 'OBJECT', 'EMBED'].includes(node.tagName));
}

// Snapshot images have no pointer input, scrolling interaction or embedded
// animation keyframes. Retain visual/layout declarations; omit inert controls.
const inertSnapshotProperty=(name:string)=>/^(?:animation(?:-|$)|transition(?:-|$)|view-timeline(?:-|$)|scroll-timeline(?:-|$)|overscroll-behavior(?:-|$))/.test(name)||['cursor','pointer-events','touch-action','user-select','-webkit-user-select','-webkit-touch-callout','-webkit-tap-highlight-color','scroll-behavior','timeline-scope'].includes(name);
export class CaptureStyles {
  private nodes: Array<{ node: HTMLElement; declarations: Map<string, string> }> = [];
  add(node: HTMLElement, declarations: Map<string, string>) { this.nodes.push({ node, declarations }); }
  apply(root: HTMLElement) {
    if (!this.nodes.length) return;
    const intersect = (nodes: typeof this.nodes, excluded?: Map<string, string>) => {
      const values = new Map(nodes[0].declarations);
      // With no mask image, the embedder has nothing to rewrite. These repeated
      // declarations can stay in CSS; real masks keep every longhand inline.
      const unmasked = nodes.every(({ declarations }) =>
        ['mask-image', '-webkit-mask-image', '-webkit-mask-box-image-source', 'mask-border-source']
          .every(name => !declarations.has(name) || declarations.get(name) === 'none'));
      for (const { declarations } of nodes) {
        for (const [name, value] of values) if (declarations.get(name) !== value) values.delete(name);
      }
      for (const [name, value] of values) {
        if (excluded?.has(name) || /^(?:-webkit-)?background(?:-|$)/.test(name) ||
          (!unmasked && /^(?:-webkit-)?mask(?:-|$)/.test(name)) || /url\(/i.test(value)) values.delete(name);
      }
      return values;
    };
    const common = intersect(this.nodes);
    // The embedder reads and reassigns background/mask shorthands. Keep backgrounds
    // and active masks inline so moving a common longhand cannot change that round trip
    // (notably layered gradients in WebKit). Other URL-bearing values stay inline too.
    // Repeated components often share declarations that differ from their parent.
    // Group only within this snapshot, and intersect actual computed values rather
    // than assuming that a class implies identical styles or state.
    const groups = new Map<string, typeof this.nodes>();
    for (const item of this.nodes) {
      const key = `${item.node.tagName}\0${item.node.getAttribute('class') ?? ''}`;
      const group = groups.get(key);
      if (group) group.push(item); else groups.set(key, [item]);
    }
    const memberships = new Map<HTMLElement, { token: string; declarations: Map<string, string> }>();
    const rules: Array<{ token: string; declarations: Map<string, string> }> = [];
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const declarations = intersect(group, common);
      if (!declarations.size) continue;
      const rule = { token: `g${rules.length}`, declarations };
      rules.push(rule);
      for (const { node } of group) memberships.set(node, rule);
    }
    // The attribute cannot collide with selectors or native attributes in the source tree.
    let attribute = `data-slg-capture-${Math.random().toString(36).slice(2)}`;
    while (this.nodes.some(({ node }) => node.hasAttribute(attribute))) attribute += '-x';
    for (const { node, declarations } of this.nodes) {
      const group = memberships.get(node);
      node.style.cssText = '';
      for (const [name, value] of declarations) if (!inertSnapshotProperty(name) && !common.has(name) && !group?.declarations.has(name)) node.style.setProperty(name, value);
      node.setAttribute(attribute, group?.token ?? '');
    }
    const style = root.ownerDocument.createElement('style');
    const declaration=root.ownerDocument.createElement('div').style;
    const serialize = (values: Map<string, string>) => {
      declaration.cssText = '';
      for (const [name, value] of values) if(!inertSnapshotProperty(name)) declaration.setProperty(name, value);
      return declaration.cssText;
    };
    style.textContent = `[${attribute}]{${serialize(common)}}` + rules.map(rule => `[${attribute}~="${rule.token}"]{${serialize(rule.declarations)}}`).join('');
    root.insertBefore(style, root.firstChild);
    this.nodes = [];
  }
}
