/** Computed styles expose a stable standard-property prefix in supported engines.
 * Values are always read fresh. Custom-property names are enumerated on every call.
 * Nonconforming/changed lists fall back to complete enumeration.
 */
const standardByPrototype = new WeakMap<object, readonly string[]>();
export function computedPropertyNames(style: CSSStyleDeclaration): readonly string[] {
  const prototype = Object.getPrototypeOf(style) as object;
  const standard = standardByPrototype.get(prototype);
  if (standard?.length && style.length >= standard.length && style[0] === standard[0]
    && style[standard.length - 1] === standard[standard.length - 1]) {
    if (style.length === standard.length) return standard;
    const custom: string[] = [];
    for (let i = standard.length; i < style.length; i++) {
      const name = style[i];
      if (!name.startsWith('--')) return enumerate(style, prototype);
      custom.push(name);
    }
    return [...standard, ...custom];
  }
  return enumerate(style, prototype);
}
function enumerate(style: CSSStyleDeclaration, prototype: object): string[] {
  const names: string[] = [];
  for (let i = 0; i < style.length; i++) names.push(style[i]);
  const firstCustom = names.findIndex(name => name.startsWith('--'));
  const split = firstCustom < 0 ? names.length : firstCustom;
  if (split && names.slice(split).every(name => name.startsWith('--'))) {
    standardByPrototype.set(prototype, names.slice(0, split));
  } else standardByPrototype.delete(prototype);
  return names;
}
/** Enumerate only the variable tail; avoid allocating hundreds of standard names on cache hits. */
export function computedCustomPropertyNames(style: CSSStyleDeclaration): readonly string[] {
  const standard=standardByPrototype.get(Object.getPrototypeOf(style) as object);
  if(standard?.length&&style.length>=standard.length&&style[0]===standard[0]&&style[standard.length-1]===standard[standard.length-1]){
    const result:string[]=[];
    for(let i=standard.length;i<style.length;i++){const name=style[i];if(!name.startsWith('--'))return computedPropertyNames(style).filter(n=>n.startsWith('--'));result.push(name)}
    return result;
  }
  return computedPropertyNames(style).filter(n=>n.startsWith('--'));
}
