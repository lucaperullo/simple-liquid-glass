// The engine's bench scene: glass cards over a picture, opened and closed by a tap. `window.__proof` is what
// the phone harness (phone.py) reads.
//
//   ?mode=worker|main  &scale=1.5  &views=1  &cards=6  &open=1 (start with the first card open)
//   &busy=0 (ms of page-thread work burned every frame)  &auto=700 (ms between toggles; 0 = taps only)
//   &light (the glass's light tuning)  &lean (its cheaper variant)  &custom=flat|last|broken (see below)
//   &material=<id> (a material from window.__benchMaterials)
//   &plain (no words in the picture)
//   &content (an element on every card, kept there by the engine)  &contentLead=0 (ms it starts early)
//   &slide (one card travelling the height of the view)
//   &clip (with &content: the content is cut off at its card's right and bottom edges as the card resizes)
//   &grow (one card that grows from its corner to fill the view)
//   &quiet (no on-screen readout)  &hold (the page takes touches itself)  &bend=18 (0: the glass does not displace)
//   &scroll (the picture is three viewports tall and scrolls under the glass)  &at=500 (start scrolled there)
//   &lead=0 (ms the renderer predicts the scroll ahead)
//   &video (the backdrop is a playing video: a canvas stream, or &video=<url of a file>)
//
// `./lib/next.esm.js` is the built entry (dist/next.esm.js): see README.md.
import { createGlassHost, GLASS_LIGHT } from './lib/next.esm.js';

const query = new URLSearchParams(location.search);
const mode = query.get('mode') || 'worker';
const scale = +query.get('scale') || 1.5;
const views = +query.get('views') || 1;
// At least two per view: a lone card fills its view open or closed, so nothing would move.
const cards = +query.get('cards') || Math.max(2, Math.round(6 / views));
const busy = +query.get('busy') || 0;
const auto = query.has('auto') ? +query.get('auto') : 700;
const scrolls = query.has('scroll');
const video = query.get('video');
const hud = document.getElementById('hud');
const stage = document.getElementById('stage');

// What the glass refracts: a picture the size of the viewport, drawn once.
const backdrop = document.getElementById('backdrop');
const pictureHeight = scrolls ? innerHeight * 3 : innerHeight;
backdrop.width = innerWidth;
backdrop.height = pictureHeight;
if (scrolls) {
  // The picture becomes the page: it scrolls, the glass stays where it is.
  document.documentElement.style.overflow = 'auto';
  document.body.style.cssText = `overflow: visible; height: ${pictureHeight}px`;
  backdrop.style.cssText = `position: absolute; top: 0; left: 0; height: ${pictureHeight}px`;
}
const paint = backdrop.getContext('2d');
const gradient = paint.createLinearGradient(0, 0, innerWidth, pictureHeight);
gradient.addColorStop(0, '#1d3b6e');
gradient.addColorStop(0.5, '#7a2f6b');
gradient.addColorStop(1, '#d9843a');
paint.fillStyle = gradient;
paint.fillRect(0, 0, innerWidth, pictureHeight);
for (let i = 0; i < 60; i++) {
  paint.fillStyle = `hsla(${(i * 47) % 360}, 80%, 65%, 0.55)`;
  paint.beginPath();
  paint.arc((i * 97) % innerWidth, (i * 151) % pictureHeight, 8 + ((i * 13) % 34), 0, 7);
  paint.fill();
}
paint.fillStyle = '#fff';
paint.font = '600 22px system-ui';
// `&plain` leaves the words out: fonts differ between browsers and machines, and the approved pictures of
// the glass (golden/) must not.
if (!query.has('plain')) {
  for (let y = 40; y < innerHeight; y += 64) paint.fillText('simple liquid glass 6.0  ·  engine core', 12, y);
}
if (scrolls) {
  // A ruler: a white line every 40 px. In a screenshot taken mid-scroll, how far the lines seen through the
  // glass sit from the lines beside it is how far the glass's idea of the scroll position is behind.
  for (let y = 0; y < pictureHeight; y += 40) paint.fillRect(0, y, innerWidth, 2);
}

// `&video`: what the glass refracts is a playing video covering the viewport instead of the picture.
let film = null;
let paintFilm = null;
if (video !== null) {
  film = document.body.insertBefore(document.createElement('video'), backdrop);
  film.muted = true;
  film.loop = true;
  film.playsInline = true;
  film.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100vh; object-fit: fill';
  backdrop.style.display = 'none';
  if (video) {
    film.src = video;
  } else {
    // No file given: film a canvas. `paintFilm(colour)` fills it, for test.mjs; a moving bar keeps frames coming.
    const source = document.createElement('canvas');
    source.width = 360;
    source.height = 640;
    const pen = source.getContext('2d');
    let colour = '#205080';
    paintFilm = (next) => (colour = next);
    requestAnimationFrame(function roll(now) {
      pen.fillStyle = colour;
      pen.fillRect(0, 0, 360, 640);
      pen.fillStyle = '#fff';
      pen.fillRect(0, (now / 4) % 640, 360, 6);
      requestAnimationFrame(roll);
    });
    film.srcObject = source.captureStream();
  }
  await film.play();
}

// Where the cards of one view go: `open` 0 = at rest, 1 = the first card open.
function layout(view, open) {
  // `&slide`: one card that travels the height of its view.
  if (query.has('grow')) {
    return [
      {
        x: 16,
        y: 40,
        width: open ? view.width - 32 : 150,
        height: open ? view.height - 80 : 136,
        radius: 22,
      },
    ];
  }
  if (query.has('slide')) {
    return [{ x: 16, y: open ? view.height - 176 : 40, width: view.width - 32, height: 136, radius: 22 }];
  }
  const gap = 14;
  const pad = 16;
  const width = view.width - pad * 2;
  const weights = Array.from({ length: cards }, (_, i) => (i === 0 ? 1 + open * 1.6 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const room = view.height - pad * 2 - gap * (cards - 1);
  let y = pad;
  return weights.map((weight, i) => {
    const height = (room * weight) / total;
    // Odd rows are narrower while closed and widen as the first card opens.
    const inset = i % 2 ? width * 0.22 * (1 - open) : 0;
    const box = { x: pad + inset, y, width: width - inset * 2, height, radius: 22 };
    y += height + gap;
    return box;
  });
}

if (query.has('at')) scrollTo(0, +query.get('at'));
const host = createGlassHost({
  thread: mode === 'main' ? 'page' : 'auto',
  reducedMotion: false,
  scrollLead: +query.get('lead') || 0,
  contentLead: +query.get('contentLead') || 0,
});
const params = {
  ...(query.has('light') ? GLASS_LIGHT : {}),
  ...(query.has('bend') ? { bend: +query.get('bend') } : {}),
};

// `&custom`: materials an application could define, for test.mjs.
//   flat: one colour, set by a uniform.  last: a `combine` that keeps only the last shape.  broken: bad GLSL.
//   field: its own field loop; each card takes the colour in its attributes.
const custom = query.get('custom');
const FIELD = `vec3 nearestColour;
vec3 slg_field(vec2 p) {
  vec3 f = vec3(0.0, 0.0, 1e5);
  for (int i = 0; i < SLG_CAPACITY; i++) {
    if (i >= slg_count) break;
    vec3 shape = slg_roundedBox(p - slg_boxes[i].xy, slg_boxes[i].zw, slg_radii[i]);
    if (shape.z < f.z) { f = shape; nearestColour = slg_attributesA[i].rgb + slg_attributesB[i].rgb; }
  }
  return f;
}`;
if (custom === 'field') {
  host.defineMaterial({
    id: custom,
    field: FIELD,
    shade: 'vec4 slg_shade(vec2 p, vec3 field) { return vec4(nearestColour, 1.0); }',
  });
} else if (custom) {
  host.defineMaterial({
    id: custom,
    uniforms: { colour: [1, 0, 0] },
    shade:
      custom === 'broken'
        ? 'vec4 slg_shade(vec2 p, vec3 field) { return nonsense; }'
        : 'vec4 slg_shade(vec2 p, vec3 field) { return vec4(colour, 1.0); }',
    ...(custom === 'last' ? { combine: 'vec3 slg_combine(vec3 a, vec3 b) { return b; }' } : {}),
  });
}
// For `field`: the first card red (in its first four attributes), the others blue (in its last four).
// (A bench outside this repository can say what its material's shapes carry: `window.__benchAttributes`.)
const attributesOf =
  window.__benchAttributes ?? ((index) => (index === 0 ? [1, 0, 0] : [0, 0, 0, 0, 0, 0, 1]));

// `&material=<id>`: one of the materials a page put in `window.__benchMaterials` before this script ran, for
// benches that live outside this repository.
for (const definition of window.__benchMaterials ?? []) host.defineMaterial(definition);
const named = custom ?? query.get('material');
const material = {
  ...(named ? { material: named } : {}),
  ...(custom ? {} : { params }),
  lean: query.has('lean'),
};
let open = query.get('open') === '1' ? 1 : 0;
const statuses = [];
const details = [];
const layers = [];
for (let i = 0; i < views; i++) {
  const canvas = stage.appendChild(document.createElement('canvas'));
  // The stage is `position: fixed`; so is the picture, unless `&scroll` made it the page.
  const layer = host.addLayer(canvas, {
    scale,
    ...material,
    fixed: true,
    onStatus: (status, detail) => statuses.push(status) && details.push(detail),
  });
  if (film) layer.streamBackdrop(film, { fixed: true });
  else if (scrolls)
    layer.setBackdrop(await createImageBitmap(backdrop), { rect: backdrop.getBoundingClientRect() });
  else layer.setBackdrop(await createImageBitmap(backdrop), { fixed: true });
  // `&content`: every card carries an element (a rule and a label) that the engine keeps on it. The rule
  // sits 40 px below the card's top edge, so a screenshot shows whether the two travel together.
  const board = query.has('content') ? stage.appendChild(document.createElement('div')) : null;
  if (board) board.style.cssText = 'position: absolute; inset: 0; pointer-events: none';
  const shapes = layout(canvas.getBoundingClientRect(), open).map((box, index) => {
    let content;
    let contentClip;
    if (board) {
      const at = 'position: absolute; left: 0; top: 0; will-change: transform';
      // `&clip`: the content sits in a window that the engine sizes and moves, and its bands run on past
      // the card's right and bottom edges, so a screenshot shows whether they are cut where the glass ends.
      if (query.has('clip')) {
        contentClip = board.appendChild(document.createElement('div'));
        contentClip.className = 'card-clip';
        contentClip.style.cssText = `${at}; overflow: hidden`;
      }
      content = (contentClip ?? board).appendChild(document.createElement('div'));
      content.className = 'card-content';
      content.style.cssText = contentClip ? at : `${at}; width: ${box.width}px`;
      const long = contentClip ? 'width: 3000px' : 'right: 0';
      content.innerHTML = `<div style="position: absolute; top: 40px; left: 0; ${long}; height: ${contentClip ? 24 : 2}px; background: #fff"></div>
        ${contentClip ? '<div style="position: absolute; top: 0; left: 40px; width: 24px; height: 3000px; background: #fff"></div>' : ''}
        <div style="position: absolute; top: 72px; left: 76px; font: 600 15px system-ui; white-space: nowrap">card ${index + 1}</div>`;
    }
    return layer.addShape(box, {
      attributes: attributesOf(index),
      ...(content ? { content } : {}),
      ...(contentClip ? { contentClip } : {}),
    });
  });
  layers.push({ canvas, layer, shapes });
}

function toggle() {
  open = open ? 0 : 1;
  for (const { canvas, shapes } of layers) {
    layout(canvas.getBoundingClientRect(), open).forEach((box, i) => shapes[i].set(box));
  }
}

// (A touch that scrolls the page is not a tap on the cards.)
// (Nor is one on the `&slide` page or a self-running `&grow` page, which a harness keeps a finger on to hold
// the display at its top rate.)
if (!scrolls && !query.has('slide') && !(query.has('grow') && auto)) addEventListener('pointerdown', toggle);
// `&hold`: Chrome on Android runs the page's frames at the display's rate while a finger is down on a page
// that takes the touch, which shows what the page thread could do without its 60 Hz cap.
if (query.has('hold')) {
  document.documentElement.style.touchAction = 'none';
  addEventListener('pointermove', () => {});
}
if (auto) setInterval(toggle, auto);

// The page's own frames: their cadence, and optionally some work to show the glass does not wait for it.
const pageIntervals = [];
let last = 0;
requestAnimationFrame(function tick(now) {
  if (last) pageIntervals.push(now - last);
  last = now;
  if (busy) {
    const until = performance.now() + busy;
    while (performance.now() < until);
  }
  requestAnimationFrame(tick);
});
function pageStats() {
  const sorted = pageIntervals.splice(0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 5) return { n };
  return {
    n,
    fps: +((1000 * n) / sorted.reduce((a, b) => a + b, 0)).toFixed(1),
    p50: +sorted[n >> 1].toFixed(1),
  };
}

// For the harness: cadence of the renderer and of the page since the previous call.
const thread = await host.ready;
window.__proof = {
  config: {
    mode,
    thread,
    scale,
    views,
    cards,
    busy,
    shader: 'analytic',
    present: 'direct',
    px: layers.map(({ canvas }) => {
      const box = canvas.getBoundingClientRect();
      return [Math.round(box.width * scale), Math.round(box.height * scale)];
    }),
  },
  async sample() {
    const { frames, ...rest } = await host.stats();
    return { glass: { n: frames, ...rest }, page: pageStats() };
  },
};
// For test.mjs.
window.__next = { host, layers, statuses, details, toggle, paintFilm, isOpen: () => open };

// The readout drains the same counters a harness samples: `&quiet` leaves them to the harness.
if (!query.has('quiet')) {
  setInterval(async () => {
    const { glass, page } = await window.__proof.sample();
    hud.textContent =
      // Three lines at most: a fourth would reach up into the stage.
      `${glass.thread} · ${scale}× · ${views} view(s) · scroll off by ${glass.scrollError} px\n` +
      `glass ${glass.fps} fps  p50 ${glass.p50}  p95 ${glass.p95}  draw ${glass.drawMs} ms  (${glass.n} frames)\n` +
      `page  ${page.fps ?? '–'} fps  p50 ${page.p50 ?? '–'}`;
  }, 1000);
}
