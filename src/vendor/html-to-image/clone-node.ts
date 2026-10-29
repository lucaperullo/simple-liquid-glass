// Adapted style/form cloning from html-to-image 1.11.11 (MIT).
// Copyright (c) 2017-2023 W.Y.; see THIRD_PARTY_NOTICES.md.
import type { Options as BaseOptions } from 'html-to-image/es/types';
import { cloneNode as upstreamClone } from 'html-to-image/es/clone-node';
import { clonePseudoElements } from 'html-to-image/es/clone-pseudos';
import {computedDeclarations} from './styleValues';
import type {StyledCloneCache} from './cloneCache';
import { CaptureStyles, canShareStyles } from './captureStyles';
type Options = BaseOptions & { captureStyles: CaptureStyles; cacheStyles?:Map<HTMLElement,Map<string,string>> };

function cloneCSSStyle<T extends HTMLElement>(nativeNode: T, clonedNode: T, options: Options) {
  const targetStyle = clonedNode.style
  if (!targetStyle) {
    return
  }

  const sourceStyle = window.getComputedStyle(nativeNode)
  if (sourceStyle.cssText) {
    targetStyle.cssText = sourceStyle.cssText
    targetStyle.transformOrigin = sourceStyle.transformOrigin
  } else {
    const declarations = computedDeclarations(nativeNode, sourceStyle)
    options.cacheStyles?.set(nativeNode, declarations)
    options.captureStyles.add(clonedNode, declarations)
  }
}

function cloneInputValue<T extends HTMLElement>(nativeNode: T, clonedNode: T) {
  if (nativeNode instanceof HTMLTextAreaElement) {
    clonedNode.innerHTML = nativeNode.value
  }

  if (nativeNode instanceof HTMLInputElement) {
    clonedNode.setAttribute('value', nativeNode.value)
  }
}

function cloneSelectValue<T extends HTMLElement>(nativeNode: T, clonedNode: T) {
  if (nativeNode instanceof HTMLSelectElement) {
    const clonedSelect = clonedNode as any as HTMLSelectElement
    const selectedOption = Array.from(clonedSelect.children).find(
      (child) => nativeNode.value === child.getAttribute('value'),
    )

    if (selectedOption) {
      selectedOption.setAttribute('selected', '')
    }
  }
}


async function cloneTree(node: Node, options: Options, isRoot = false): Promise<Node | null> {
  if (!isRoot && options.filter && !options.filter(node as HTMLElement)) return null;
  const clone = node.cloneNode(false);
  for (const child of Array.from(node.childNodes)) {
    const next = await cloneTree(child, options);
    if (next) clone.appendChild(next);
  }
  if (node instanceof HTMLElement && clone instanceof HTMLElement) {
    cloneCSSStyle(node, clone, options);
    clonePseudoElements(node, clone);
    cloneInputValue(node, clone);
    cloneSelectValue(node, clone);
  }
  return clone;
}

/** Per-capture only: no cached computed styles, retained DOM or observer invalidation. */
export async function cloneStyledNode<T extends HTMLElement>(node: T, options: BaseOptions, cache?: StyledCloneCache, reuse=false): Promise<T> {
  if (!canShareStyles(node)) return (await upstreamClone(node, options, true))!;
  if(reuse&&cache&&!options.filter){const retained=cache.reuse(node);if(retained)return retained as T;}
  const start=cache&&!options.filter?cache.prepare(node):null;
  const cacheStyles=start?new Map<HTMLElement,Map<string,string>>():undefined;
  const captureStyles = new CaptureStyles();
  const clone = (await cloneTree(node, { ...options, captureStyles, cacheStyles }, true)) as T;
  captureStyles.apply(clone);
  if(cacheStyles)cache?.remember(node,clone,start,cacheStyles);
  return clone;
}
