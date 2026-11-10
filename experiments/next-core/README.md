# 6.0 engine core: `simple-liquid-glass/next`

The engine's bench scene: the page describes glass cards to `createGlassHost()`, and the renderer in `src/next`
draws and animates them from a worker.

    npm run build && node experiments/next-core/test.mjs     # Chromium and WebKit

The page loads the built entry as `./lib/next.esm.js`. The test's server maps that to `dist/`. To open the
page with any other static server, or to measure it on a phone, copy the build in first (`lib/` is not
committed):

    npm run build && mkdir -p experiments/next-core/lib && cp dist/next.esm.js experiments/next-core/lib/
    python3 experiments/next-core/phone.py experiments/next-core --runs 3 \
      --configs "mode=main&scale=1.5" "mode=worker&scale=1.5" "mode=worker&scale=2" "mode=worker&scale=1.5&views=4"

`phone.py` needs `websocket-client`, one authorised adb device with Chrome in front, and a screen bright
enough for its top refresh rate. The query parameters are listed at the top of `main.js`. `golden/` holds the
approved pictures of the built-in glass; `UPDATE_GOLDEN=1 node experiments/next-core/test.mjs` replaces them.

The results below up to "Materials" were measured before the material model, with an earlier built-in
material; the frame rates were measured again with the current one (see "Materials").

## Result: ZTE Z2357N, Chrome 156, 2026-11-10

Tapped every 0.35 s, 3 runs × 6 s each, display at 120 Hz. "Presented" is what SurfaceFlinger showed for
Chrome's surface. Raw rows: `results-zte-2026-11-10.jsonl`.

| Where it draws | Canvas           | Glass fps | Presented fps | Page's own frames |
| -------------- | ---------------- | --------- | ------------- | ----------------- |
| page thread    | 1.5× (522 × 955) | 61.1      | 61.0–61.2     | 61.1              |
| worker         | 1× (348 × 637)   | 120       | 119.1–120     | 61.2              |
| worker         | 1.5× (522 × 955) | 120       | 118.1–120     | 61.2              |
| worker         | 2× (696 × 1273)  | 119.4–120 | 118.1–118.2   | 61.1–61.2         |

One layer holds the display's rate (≥ 115 fps presented at 1.5× and at 2×).

**Correction.** This table first had rows for "6 layers": 105–113 fps presented. They were wrong about what
they measured. A worker keeps only four WebGL contexts alive, so two of the six canvases had lost theirs and
were blank. The engine now refuses a fifth worker layer (`MAX_WORKER_LAYERS`), and the rows were measured
again with four (raw rows: `results-zte-layers-2026-11-10.jsonl`):

| Where it draws              | Canvas | Glass fps   | Presented fps |
| --------------------------- | ------ | ----------- | ------------- |
| worker, 4 layers of 2 cards | 1.5×   | 117.9–118.3 | 108.7–112.0   |
| worker, 4 layers of 2 cards | 2×     | 117.3–117.7 | 108.0–108.8   |

Four layers moving at once fall short of one layer's 118–120: a canvas costs frames at presentation however
little is drawn in it, so a page should use few layers. Stepping the springs and issuing the draw calls takes
0.11 ms a frame for one layer. Battery temperature was 21.7–26 °C.

## Scroll and video backdrops: ZTE Z2357N, Chrome 156, 2026-11-10

**Glass fixed over a page that scrolls** (`&scroll`). The page thread reports its scroll position once per
frame of its own (60 a second on this phone); the renderer carries it forward between reports. Measured with
`scroll-lag.py`: the picture has a ruler in it, the glass does not displace, and a screenshot taken mid-scroll
shows how far the ruler seen through the glass is from the ruler beside it. 5 screenshots per row, device px
(this phone has 2 per CSS px); positive is behind the page. Raw rows: `results-zte-scroll-2026-11-10.jsonl`.

    python3 experiments/next-core/scroll-lag.py experiments/next-core --runs 5            # a steady drag
    python3 experiments/next-core/scroll-lag.py experiments/next-core --runs 5 --fling    # a flick, coasting

| Where it draws    | Scroll          | Glass fps | Glass behind the page, px | In time       |
| ----------------- | --------------- | --------- | ------------------------- | ------------- |
| page thread       | drag, 1400 px/s | 60        | 9, 21, 10, 24, 21         | 6–17 ms       |
| worker            | drag, 1400 px/s | 120       | −13, −2, −1, −1, 0        | −9 to 0 ms    |
| worker, `lead=8`  | drag, 1400 px/s | 120       | −13, −9, −11, −10, −11    | −9 to −6 ms   |
| worker, `lead=16` | drag, 1400 px/s | 120       | −24, −20, −24, −26, −23   | −19 to −14 ms |
| page thread       | fling           | 60        | 36, 16, 30, 35, 29        | –             |
| worker            | fling           | 120       | −3, −1, −1, −2, −18       | –             |

From the worker the glass is redrawn for every frame of the display and sits within 1–3 device px of the page
in 8 of 10 screenshots; in the other two it was about one frame ahead. Drawn on the page thread it trails by
half a frame to two. `lead` moves the glass ahead by the time it names, so 0 is the right default here. The
prediction is off by 1–2 CSS px on average when the next report arrives.

**A playing video as the backdrop** (`&video=lib/film60.mp4`, 1280 × 720 H.264; make one with
`ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=60 -t 8 -pix_fmt yuv420p experiments/next-core/lib/film60.mp4`).
Cards tapped every 0.35 s, 3 runs × 6 s, `phone.py`. Raw rows: `results-zte-video-2026-11-10.jsonl`.

| Where it draws | Canvas | Video  | Glass fps | Presented fps |
| -------------- | ------ | ------ | --------- | ------------- |
| worker         | 1.5×   | 30 fps | 119.8–120 | 118.1–119.1   |
| worker         | 1.5×   | 60 fps | 120       | 118.1–119.1   |
| worker         | 2×     | 60 fps | 119.8–120 | 119.1–120     |
| page thread    | 1.5×   | 60 fps | 61.1      | 79.6–84.0     |

Each video frame crosses to the worker as a `VideoFrame`, without a copy, and refills the layer's one texture.

Not measured: a fling's lag in time (its speed at the screenshot is not known), horizontal scroll, scroll
inside an element (only the window's is followed), a page capture as the backdrop, and video above 720p.

## Materials: ZTE Z2357N, Chrome 156, 2026-11-10

The built-in `glass` through the material model, six cards tapped every 0.35 s, 3 runs × 6 s, from the worker.
"Around the shapes" is how the engine draws: two triangles around each shape, the rest of the canvas cleared
and never shaded. "Whole canvas" is the same material made to shade every pixel, as the engine did before.
3× is a stress case, well past the screen's own resolution.

| Canvas           | Shaded            | Glass fps   | Presented fps |
| ---------------- | ----------------- | ----------- | ------------- |
| 2× (696 × 1273)  | around the shapes | 120         | 118.1–120     |
| 2×               | whole canvas      | 120         | 119.1–120     |
| 3× (1044 × 1910) | around the shapes | 119.6–119.8 | 116.3–118.1   |
| 3×               | whole canvas      | 117.1–117.9 | 88.4–91.1     |

At the screen's resolution both hold the display's rate. At 3× shading only around the shapes keeps it
(116–118 fps presented) where shading the whole canvas falls to 88–91. The gain depends on how much of the
canvas is empty: a material whose `bleed` makes the rectangles overlap gets less of it.

`phone.py` now reads the newest of Chrome's surfaces: Chrome can leave an old one listed with its last frames,
which an earlier version of the harness sometimes read instead (a row of identical 58.2 fps gave it away).

## Page content on moving glass: ZTE Z2357N, Chrome 156, 2026-11-10

A card's text and pictures are page content; the card's glass is animated by the renderer. Given
`content: element`, the engine runs the card's spring on the page thread ahead of time and hands its path to
the browser's compositor as a keyframe animation that starts at the same moment as the glass's, so both move
at the display's rate. `content-lag.py` measures how well they stay together: one flat card travels 457 CSS px
once a second, its content carries a rule 40 px below the card's edge, and screenshots taken mid-flight show
how far the rule is from where it belongs. The distance is turned into time along the spring's known path.
Raw rows: `results-zte-content-2026-11-10.jsonl`.

    python3 experiments/next-core/content-lag.py experiments/next-core --shots 140 --configs "mode=worker" "mode=main"

| Glass drawn             | Mid-flight screenshots | Content ahead of its glass, ms |
| ----------------------- | ---------------------- | ------------------------------ |
| worker                  | 18                     | 0.0–0.2 in 14, 3.4–3.6 in 4    |
| worker, `contentLead=4` | 6                      | −3.6 to 6.9, median 3.5        |
| page thread             | 18                     | 6.3–7.5 in 15, 0 in 3          |

That first run flattered it. Four more of 100 screenshots each, back to back on the build above and on the
one after it (the two do not differ), gave 56 mid-flight readings from the worker:

| Content from its glass           | Readings of 56 |
| -------------------------------- | -------------- |
| on it (0.3 ms or less)           | 35             |
| 1.8–5.8 ms, either way           | 12             |
| a frame (7.0–7.8 ms), either way | 9              |

So from the worker the content is on its glass in about three screenshots of five and within one frame of
it, ahead or behind, in the rest. With the glass drawn on the page thread the content runs ahead of it:
about 7 ms in the first run, 3 to 12 ms in the resize run below.

### A card that changes size

The compositor moves elements; it cannot lay them out. With `contentClip: element` (the content's parent, a
window that hides what overflows it) the engine moves the window so that its bottom-right corner is the
shape's and moves the content back by as much, so the content keeps its corner and is cut off where the
glass ends. Both are translations, so nothing is scaled or drawn again; what the content looks like at each
size is the application's to lay out (once, at the size the card is going to or coming from).
`resize-lag.py` measures it on the `&content&clip&grow` page: one flat card grows from 150 × 136 CSS px to
nearly the whole view and back once a second, its content carries two white bands that run on past the card, and
a screenshot shows where each band is cut and where the glass ends. Raw rows:
`results-zte-resize-2026-11-10.jsonl`.

    python3 experiments/next-core/resize-lag.py experiments/next-core --shots 140

| Glass drawn | Mid-flight screenshots | The cut ahead of the glass's edge, ms (right and bottom agree)           |
| ----------- | ---------------------- | ------------------------------------------------------------------------ |
| worker      | 25 (two runs)          | −5.2 to 4.3: 2.2–4.3 ahead in 12, 2.7–5.2 behind in 10, 1.3 or less in 3 |
| page thread | 14                     | 1.9 to 11.6: about 3 in 6, 8.5–11.6 in 8                                 |

From the worker the cut is never more than 5.2 ms (0.6 of a frame) from the glass's edge, on either side; in the
run that recorded distances, at most 9 device px across and 23 down. It is rarely exactly on it, unlike a card
that only moves, and I do not know why. The glass held 116 fps in this scene (a flat card over most of the
screen at 1.5×), 120 in the moving one.

What this does not show: content laid out again while its card resizes (text that wraps as the card widens:
that is a layout, at the page's rate), rounded corners on the cut (it is square), a card sent somewhere
else mid-flight, several cards starting at different moments, and Safari
(WebKit under test, with software rendering, showed the content 38 px from its card mid-flight; on a real
device that is unmeasured). The finger the harness rests on the page to keep the display at 120 Hz also
raises the page thread's own frames to 120, so the page-thread row is kinder than a page left alone.

## Layers stacked in one canvas

`simple-liquid-glass/next/stack` is the same engine built with `src/next/stacking.ts` saying `true`: a layer can
have others stacked over it (`layer.stack()`), drawn into its canvas in order, each over the glass before it,
which its material can read with `slg_below(screen)`; `setClip()` keeps a stacked layer to a rectangle. The core
entry carries none of it. `stack.html` is its scene and `node experiments/next-core/stack.test.mjs` checks it
in Chromium and WebKit, from a worker and on the page thread.
