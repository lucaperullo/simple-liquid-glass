# 6.0 engine core: `simple-liquid-glass/next`

The engine's bench scene: the page describes glass cards to `createGlassHost()`, and the renderer in `src/next`
draws and animates them from a worker.

    npm run build && node experiments/next-core/test.mjs     # Chromium and WebKit

The page loads the built entry as `./lib/next.esm.js`. The test's server maps that to `dist/`. To open the
page with any other static server, or to measure it on a phone, copy the build in first (`lib/` is not
committed):

    npm run build && mkdir -p experiments/next-core/lib && cp dist/next.esm.js experiments/next-core/lib/
    python3 experiments/next-core/phone.py experiments/next-core --runs 3 \
      --configs "mode=main&scale=1.5" "mode=worker&scale=1.5" "mode=worker&scale=2" "mode=worker&scale=1.5&views=6"

`phone.py` needs `websocket-client`, one authorised adb device with Chrome in front, and a screen bright
enough for its top refresh rate. The query parameters are listed at the top of `main.js`. `golden/` holds the
approved pictures of the built-in glass; `UPDATE_GOLDEN=1 node experiments/next-core/test.mjs` replaces them.

The results below up to "Materials" were measured before the material model, with an earlier built-in
material; the frame rates were measured again with the current one (see "Materials").

## Result: ZTE Z2357N, Chrome 156, 2026-11-10

Tapped every 0.35 s, 3 runs × 6 s each, display at 120 Hz. "Presented" is what SurfaceFlinger showed for
Chrome's surface. Raw rows: `results-zte-2026-11-10.jsonl`.

| Where it draws                   | Canvas           | Glass fps   | Presented fps | Page's own frames |
| -------------------------------- | ---------------- | ----------- | ------------- | ----------------- |
| page thread                      | 1.5× (522 × 955) | 61.1        | 61.0–61.2     | 61.1              |
| worker                           | 1× (348 × 637)   | 120         | 119.1–120     | 61.2              |
| worker                           | 1.5× (522 × 955) | 120         | 118.1–120     | 61.2              |
| worker                           | 2× (696 × 1273)  | 119.4–120   | 118.1–118.2   | 61.1–61.2         |
| worker, 6 layers of 2 cards      | 1.5×             | 116.4–117.9 | 105.0–107.3   | 60.7–60.9         |
| worker, 6 layers of 2 cards      | 2×               | 116.3–116.7 | 107.3–112.9   | 60.9–61.1         |
| page thread, 6 layers of 2 cards | 1.5×             | 58.2–59.3   | 59.1–59.8     | 58.2–59.3         |

One layer holds the display's rate (≥ 115 fps presented at 1.5× and at 2×). Six layers moving at once are
presented at 105–113: a canvas costs frames at presentation
however little is drawn in it, so a page should use few layers. Stepping the springs and issuing the draw
calls takes 0.11 ms a frame for one layer and 0.17 ms for six. Battery temperature was 21.7–22.5 °C.

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
