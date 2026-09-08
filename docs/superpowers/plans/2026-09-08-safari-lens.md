# Safari lens refraction

Approved scope: replace noise-based mirror distortion with a rounded-rectangle lens field; verify scrolling, moving backgrounds, multiple panels, and physical iOS where available.

- [x] Test a symmetric, bounded displacement field with a clear center, rounded corners, and a smooth rim. Verify small/extreme panel shapes and strength limits.
- [x] Generate a bounded-resolution PNG displacement map only when a mirror is active. Cache by geometry. Keep the public mirrorScale API and cap unsafe amplitudes.
- [x] Render the map in lens coordinates with sRGB channel interpretation and explicit filter bounds. Remove the noise and whole-lens blur.
- [x] Test and correct scroll/translation tracking; avoid replaying source transforms in the clone.
- [x] Exercise multiple panels and changing shapes in Chromium, Firefox, and WebKit; inspect images and report measured frame timing without claiming device equivalence.
- [x] Run unit, type, package-build, compatibility, and size checks. Document behavior and physical-device test availability.

## Results

- 56 unit/component tests, including 12 optics geometry tests.
- 21 browser tests across Chromium, Firefox and WebKit: hydration, mirror lifecycle, displacement-map selection, scrolling, source translation, and six simultaneous animated lenses.
- iPhone 17 simulator / Safari 26.5: six maps, zero final alignment error. Screenshot inspected.
- Physical iPhone 15 Pro / Safari 26.6.1: nine reports from the isolated test page; each reported six maps and zero final alignment error. Median frame callback interval 17 ms; per-run p95 19–23 ms. These are callback scheduling measurements, not GPU times or a guarantee of 60 fps.
- Physical visual confirmation FAILED; see investigation below. Canvas/video, arbitrary subtree animation, rotation/scaling and large-document scenes are not validated.
- Builds, generated declaration consumer checks, React 16.8/17/18/19 checks, and size checks pass. Core is 8.55 kB Brotli; interactive 9.51 kB; mirror 8.60 kB; web component 2.02 kB. Core and interactive budgets were explicitly raised to 9/10 kB for the new feature.
- Device reports: `docs/safari-validation.json`.
- Local test page: build with `node scripts/build-safari-lab.mjs`, then serve with `node scripts/serve-safari-lab.mjs`. The network server allowlists only compiled preview assets; it cannot serve repository files.

## Physical visual failure — investigation remains open

The user rejected the physical iPhone result: only lens 1 visibly changed, with poor quality. The earlier map counts, alignment checks and callback timings did not establish visual correctness.

Fixed the clone losing root ID-based styling by copying root computed presentation before namespacing. Added a six-lens pixel regression comparing strength 0 and 26, requiring visible change and stable center pixels, including DPR 3. Clipping before the filter and normalized coordinates pass Playwright WebKit, but native Safari 26.5 in the simulator still scales/positions the map incorrectly and skews text. Do not treat the automated pass as native Safari acceptance.

Unsuccessful native probes: pixel coordinates, mixed coordinate units, explicit SVG viewport, identity convolution, foreignObject source, stricter clipping and geometry-specific filter IDs. A static map-only rendering exposed the incorrectly enlarged texture. Those additional experiments were removed. Remaining task: a native Safari-compatible displacement rendering path with actual visual validation and new timing measurements. No release is approved by this evidence.

## CSS workaround (v3)

Safari/iOS now uses a separate rendering path: a cached rounded alpha mask over a mildly magnified copy, with no SVG displacement primitives. This avoids the texture-positioning failure in the native simulator. Center pixels are transparent to the original backdrop, preserving clarity; the rim is an approximation and can blend high-contrast edges. No new runtime dependency or extra backdrop clone is added.

Validation: 57 unit/component tests, 25 browser tests (two Safari-only cases skipped on other engines), generated types, build and size checks pass. Pixel comparisons at DPR 3 verify every lens changes with strength while centers remain stable. Scroll and animated-translation tests account for intentional magnification. Native simulator screenshot: `docs/safari-validation/native-safari-css-rim.png`. Opened CSS rim v3 on the connected physical iPhone; visual acceptance pending.

Physical iPhone 15 Pro / Safari 26.6.1, corrected v3 alignment report: six CSS lenses, zero SVG maps, maximum alignment error 0.008 px, callback median 17 ms and p95 20 ms. These confirm placement and callback scheduling, not aesthetic acceptance or GPU frame rate.
