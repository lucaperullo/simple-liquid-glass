// Layers stacked in one canvas (simple-liquid-glass/next/stack), for stack.test.mjs: a red box; over it a
// layer that reads the glass beneath it and paints half-clear green where there is some, red where there is
// none; and over both a blue layer kept to a small clip.
//   stack.html?mode=worker|page
import { createGlassHost } from './lib/next-stack.esm.js';
import { createGlassHost as createCoreHost } from './lib/next.esm.js';

const mode = new URLSearchParams(location.search).get('mode') || 'worker';
const host = createGlassHost({ thread: mode === 'page' ? 'page' : 'auto', reducedMotion: false });
host.defineMaterial({
  id: 'solid',
  shade: 'vec4 slg_shade(vec2 p, vec3 field) { return vec4(colour, 1.0); }',
  uniforms: { colour: [1, 0, 0] },
});
host.defineMaterial({
  id: 'probe',
  shade: `vec4 slg_shade(vec2 p, vec3 field) {
    return slg_below(slg_screen(p)).a > 0.5 ? vec4(0.0, 1.0, 0.0, 0.5) : vec4(1.0, 0.0, 0.0, 0.5);
  }`,
});
const statuses = [];
const note = (name) => (status, detail) => statuses.push(`${name}: ${status} ${detail}`.trim());
const base = host.addLayer(document.getElementById('glass'), {
  scale: 1,
  fixed: true,
  material: 'solid',
  onStatus: note('base'),
});
base.addShape({ x: 20, y: 20, width: 160, height: 120, radius: 0 }, { spring: null });
const probe = base.stack({ material: 'probe', onStatus: note('probe') });
const probed = probe.addShape({ x: 100, y: 60, width: 130, height: 120, radius: 0 });
const blue = base.stack({ material: 'solid', params: { colour: [0, 0, 1] }, onStatus: note('blue') });
blue.setClip({ left: 240, top: 150, width: 40, height: 30 });
blue.addShape({ x: 0, y: 0, width: 300, height: 200, radius: 0 }, { spring: null });

// A layer of the core has no `stack`.
const core = createCoreHost({ thread: 'page' });
const plain = core.addLayer(document.createElement('canvas'));
window.__stack = {
  host,
  base,
  statuses,
  coreStacks: typeof plain.stack,
  // The probe springs 60 px to the right (it stays over the red box's edge).
  move: () => probed.set({ x: (probed.at = probed.at === 160 ? 100 : 160) }),
  lose: () => base.simulateContextLoss(50),
  removeBlue: () => blue.remove(),
  removeBase: () => base.remove(),
};
