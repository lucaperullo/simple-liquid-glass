import {computedPropertyNames} from './computedProperties';
export const backgroundProperty = (name:string) => /^(?:-webkit-)?background(?:-|$)/.test(name);
/** Same value conversion as the current capture; no property values are cached here. */
export function computedDeclarations(node:HTMLElement, style=getComputedStyle(node)):Map<string,string> {
 const result=new Map<string,string>();
 for(const name of computedPropertyNames(style)){
  let value=style.getPropertyValue(name);
  if(name==='font-size'&&value.endsWith('px'))value=`${Math.floor(parseFloat(value))-0.1}px`;
  if(name==='display'&&value==='inline'&&node instanceof HTMLIFrameElement)value='block';
  if(name==='d'&&node.getAttribute('d'))value=`path(${node.getAttribute('d')})`;
  if(value)result.set(name,value);
 }
 return result;
}
