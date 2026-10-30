import { installLiquidGLOptics } from './liquidGLOptics';
import {useSceneBackdrop} from '../useSceneBackdrop';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createWebGLEngine } from './runtime';
import { joinSharedScene } from './sharedScene';
import type { WebGLEngine, WebGLOptions, WebGLStatus } from './types';

export function useWebGL(enabled: boolean, panel: RefObject<HTMLElement | null>, holder: RefObject<HTMLElement | null>,
  options: WebGLOptions, backdropRef?: RefObject<HTMLElement | null>, selector?: string, version?: string | number, scene = true) {
  const backdropScene=useSceneBackdrop(panel,enabled&&!backdropRef&&!selector);
  // A panel a shared scene can no longer draw (reparented, scaled) keeps its own canvas from then on.
  const [evicted, setEvicted] = useState(false);
  const [status, setStatus] = useState<WebGLStatus>('pending');
  const engine = useRef<WebGLEngine | null>(null);
  const binding = useRef<{ element: HTMLElement; target: HTMLElement; source: HTMLElement; shared: boolean } | null>(null);
  const latest = useRef(options); latest.current = options;
  useEffect(() => {
    const clear = () => { engine.current?.destroy(); engine.current = null; binding.current = null; };
    if (!enabled || (backdropScene.connected && !backdropScene.ready)) { clear(); setStatus('pending'); return; }
    const element = panel.current, target = holder.current;
    if (!element || !target) return;
    let source = backdropRef?.current ?? backdropScene.backdropRef.current ?? null;
    try { if (!source && selector) source = document.querySelector<HTMLElement>(selector); }
    catch { clear(); setStatus('invalid-selector'); return; }
    if (!source) { clear(); setStatus('missing-backdrop'); return; }
    if (source.contains(element) || element.contains(source)) { clear(); setStatus('invalid-backdrop'); return; }
    const shared = scene && !evicted;
    if (binding.current?.element === element && binding.current?.target === target && binding.current?.source === source && binding.current?.shared === shared) return;
    clear(); binding.current = { element, target, source, shared };
    setStatus('pending');
    try { engine.current = (shared ? joinSharedScene(element, target, source, latest.current, setStatus, installLiquidGLOptics, () => setEvicted(true)) : undefined)
      ?? createWebGLEngine(element, target, source, latest.current, setStatus, installLiquidGLOptics); }
    catch { setStatus('webgl-unavailable'); }
  }); // Resolve ref.current again after commits, including route/source replacement.
  useEffect(() => () => { engine.current?.destroy(); engine.current = null; binding.current = null; }, []);
  useEffect(() => { engine.current?.update(options); }, [options]);
  useEffect(() => { if (version !== undefined) void engine.current?.refresh().catch(() => {}); }, [version]);
  return { status, refresh: () => {backdropScene.refresh();return engine.current?.refresh() ?? Promise.resolve();} };
}
