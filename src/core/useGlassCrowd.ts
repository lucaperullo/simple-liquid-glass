import { useEffect, useState, type RefObject } from 'react';
import { sceneIneligibility } from './webgl/sharedScene';

/**
 * On Chromium every SVG panel is its own GPU filter pass per frame, while one shared WebGL scene composites any
 * number of panels in a single canvas. renderer="auto" therefore moves a crowd of sibling panels to WebGL: from
 * CROWD_ON scene-eligible siblings, back to SVG below CROWD_OFF (no flapping while a list grows or shrinks).
 * Backdrops with video or iframes stay on SVG, which shows them live.
 */
export const CROWD_ON = 16, CROWD_OFF = 12;

interface Crowd { members: Map<HTMLElement, () => void>; webgl: boolean }
const crowds = new WeakMap<HTMLElement, Crowd>();

function settle(parent: HTMLElement, crowd: Crowd) {
  const next = crowd.webgl ? crowd.members.size >= CROWD_OFF : crowd.members.size >= CROWD_ON;
  if (next !== crowd.webgl) { crowd.webgl = next; crowd.members.forEach(update => update()); }
  if (!crowd.members.size) crowds.delete(parent);
}

/** Whether this panel belongs to a crowd that renders through the shared WebGL scene. */
export function useGlassCrowd(panel: RefObject<HTMLElement | null>, enabled: boolean, backdrop: () => HTMLElement | null | undefined): boolean {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    const element = panel.current, parent = element?.parentElement;
    if (!enabled || !element || !parent) { setWebgl(false); return; }
    const source = backdrop();
    if (source && (sceneIneligibility(element, source) || source.querySelector('video, iframe'))) { setWebgl(false); return; }
    let crowd = crowds.get(parent);
    if (!crowd) { crowd = { members: new Map(), webgl: false }; crowds.set(parent, crowd); }
    const own = crowd, update = () => setWebgl(own.webgl);
    own.members.set(element, update);
    settle(parent, own); update();
    return () => { own.members.delete(element); settle(parent, own); };
  }, [enabled, panel, backdrop]);
  return enabled && webgl;
}
