import { sceneIneligibility } from './sharedScene';

/**
 * On Chromium every SVG panel is its own GPU filter pass per frame, while one shared WebGL scene composites any
 * number of panels in a single canvas. renderer="auto" therefore moves a crowd of sibling panels to WebGL: from
 * CROWD_ON scene-eligible siblings, back to SVG below CROWD_OFF (no flapping while a list grows or shrinks).
 * Backdrops with video or iframes stay on SVG, which shows them live.
 */
export const CROWD_ON = 16, CROWD_OFF = 12;

interface Crowd { members: Map<HTMLElement, (webgl: boolean) => void>; webgl: boolean }
const crowds = new WeakMap<HTMLElement, Crowd>();

function settle(root: HTMLElement, crowd: Crowd) {
  const next = crowd.webgl ? crowd.members.size >= CROWD_OFF : crowd.members.size >= CROWD_ON;
  if (next !== crowd.webgl) { crowd.webgl = next; crowd.members.forEach(update => update(next)); }
  if (!crowd.members.size) crowds.delete(root);
}

/**
 * Counts `panel` in the crowd grouped under `root` (its parent by default) and reports whether that crowd renders
 * through the shared WebGL scene, now and whenever that changes. Returns undefined without joining when the panel
 * could not share a scene over `source`, or that backdrop holds live video or iframes. Without a source yet (a
 * page scene supplies it later) only the grouping is checked.
 */
export function joinGlassCrowd(panel: HTMLElement, source: HTMLElement | null | undefined, onChange: (webgl: boolean) => void,
  root: HTMLElement | null = panel.parentElement): (() => void) | undefined {
  if (!root || !root.contains(panel) || root === panel) return undefined;
  if (source && (sceneIneligibility(panel, source, root) || source.querySelector('video, iframe'))) return undefined;
  let crowd = crowds.get(root);
  if (!crowd) { crowd = { members: new Map(), webgl: false }; crowds.set(root, crowd); }
  const own = crowd;
  own.members.set(panel, onChange);
  settle(root, own); onChange(own.webgl);
  return () => { own.members.delete(panel); settle(root, own); };
}
