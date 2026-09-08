# Remove the DOM-mirror; refraction is Chromium-only (honest browser support)

**Date:** 2026-06-18
**Status:** awaiting approval
**Type:** breaking change — library **4.0.0**

## Context & decision

The live-DOM **mirror** (clone a backdrop element + `filter: url(#feDisplacementMap)`) was meant to give
"real refraction on iOS/Safari/Firefox." On a real iPhone it **does not work** — WebKit's
`feDisplacementMap`/`feImage` support is unreliable, and it's hopeless for fixed/scrolling UI (e.g. a
nav). It was shipped as a headline feature (2.4.0 core mirror, 3.2 web-component mirror) and is claimed
across the docs. Those claims are false.

**Decision (owner):** remove the mirror **entirely** and remove **every** "works/refracts on iOS"
claim, across the **library + showcase + docs**. There is no WebGL alternative — no web API exposes a
live backdrop to WebGL; `html2canvas` (the removed 2.0.0 path) doesn't track live content. So:

> **Refraction is a Chromium / Edge / Android-Chrome enhancement.** On Safari / iOS / Firefox the
> component renders a deliberate **frosted glass** (blur + saturation + tint + border) — glass, not
> refraction. Documented honestly, with no false iOS-refraction promises.

## What STAYS (unchanged)
- The SVG-displacement refraction path on Chromium (the real, working effect).
- All visual props: `radius`, `scale`, `frost`, `blur`, `dispersion`, `lens`, `angle`, `liquid`, etc.
- `LiquidGlassInteractive` (pointer lean, `followPointer`, `clickRipple`) — Chromium refraction + frosted elsewhere.
- The web component `<liquid-glass>` (SVG on Chromium, frosted elsewhere).
- The frosted CSS fallback — now the *intended* non-Chromium experience (small polish so it reads as deliberate glass).

## Library removals (4.0.0 — breaking)

**Code**
- Delete `src/core/mirrorEngine.ts` (`useMirrorEngine`).
- Delete the `/mirror` entry point: `src/mirror/index.tsx`, `src/mirror/index.d.ts` (`LiquidGlassMirror`).
- Delete `src/web-component/mirror.ts` (`decideMirror`) + its test `src/__tests__/webComponentMirror.test.ts`.
- `src/index.tsx` / `src/index.d.ts`: remove props `backdropRef`, `backdropSelector`, `mirror`, `mirrorScale`, `track`, the `useMirrorEngine` call, `mirrorActive`, and the `mirrorHolderRef` layer. `backdropFilterValue` collapses to: SVG (Chromium) or frosted (else).
- `src/web-component/index.ts` / `.d.ts`: remove `decideMirror`, the `backdrop-selector`/`mirror`/`mirror-scale`/`track` attributes + holder; keep SVG-on-Chromium / frosted-else.
- `src/LiquidGlass.stories.tsx`: remove the `IOSMirrorRefraction` story.
- `src/core/displacementMap.ts`: remove any mirror-only references (verify — likely a comment).

**Package / build**
- `package.json`: remove the `"./mirror"` export; rewrite `description` (drop "REAL refraction on iOS/Safari/Firefox … live backdrop mirror"); fix `size-limit` names ("includes iOS mirror engine", the `mirror` entry, "+mirror engine"); review keywords (`safari-glass`/`firefox-glass`/`ios-glass` stay only if framed as *frosted* glass, not refraction).
- `rollup.config`: remove the `mirror` build entry; `scripts/copy-types.mjs`: drop `mirror.d.ts`.

**Docs**
- `README.md`: remove the comparison-table "real refraction on Safari/iOS" row, the "Real refraction on iOS/Safari/Firefox" sections (core + web component "new in 3.2"), and the headline claim. Add a **Browser support** matrix: Chromium = SVG refraction; Safari/iOS/Firefox = frosted glass (no refraction).
- `llms.txt`: same — drop iOS/Safari/Firefox-refraction lines, the `backdropRef`/backdrop-selector rows/recipes; add the support matrix + the rule "refraction is Chromium-only; elsewhere it's frosted glass."
- `skills/simple-liquid-glass/SKILL.md`: same — remove backdropRef/mirror rules + recipes; state the Chromium-only rule.
- `CHANGELOG.md`: add **4.0.0** — "Removed the DOM-mirror and the `/mirror` entry point; refraction is Chromium-only, frosted glass elsewhere. Removed props `backdropRef`/`backdropSelector`/`mirror`/`mirrorScale`/`track`." (Leave historical 2.4.0/3.2 entries as the record of what those versions did.)

## Showcase removals / reverts
- `GlassNav.tsx`: remove `backdropSelector=".aurora"` + `mirrorScale` (keep `mobileFallback="svg"`).
- `lib/presets.ts`: drop `backdropSelector` from `SCENE_GLASS` (keep `mobileFallback:'svg'`).
- `components/DemoShell.tsx` + `theme.css`: revert the `.demoSceneBg`/`.demoSceneContent` split (background back on `.demoScene`); remove `.demoSceneBg`/`.demoSceneContent`/`.pgStageBg` rules.
- `pages/Playground.tsx`: remove `.pgStageBg` element + `backdropSelector`/`track`.
- `pages/examples/IosMirror.tsx`: **delete**; remove from `lib/demos.ts` + `ExamplesHub` + nav/routing.
- `pages/examples/Pricing.tsx`, `Weather`, etc.: remove any leftover `backdropSelector`/`track` (from `SCENE_GLASS`).
- `pages/examples/WebComponentDemo.tsx`: remove the "(3.2+) refracts on iOS/Safari/Firefox" copy.
- `vite-env.d.ts`: remove the 3.2 `<liquid-glass>` mirror attributes (`backdrop-selector`/`mirror`/`mirror-scale`/`track`).
- Copy fixes: `Home.tsx`, `WhatsNew.tsx`, `UseWithAI.tsx` (the "iOS refraction" / backdropRef bullets), and reword `lib/releases.ts` entries so they no longer claim iOS/Safari refraction (state what actually shipped: frosted fallback; SVG refraction on Chromium).

## Showcase: new browser-support surface
- A compact, honest **Browser support** section on **Home** (recommended): "Real refraction on Chrome/Edge/Android-Chrome; a polished frosted glass on Safari/iOS/Firefox." Plus a one-line note on demo pages.

## Coordination & publish
1. Library: implement removals → `npm run build && npx jest && npx size-limit` green → bump **4.0.0** → **owner publishes** (account-bound; the npm/real-device gate).
2. Showcase: implement removals/copy → after 4.0.0 is on npm, bump dep `^4.0.0` + `npm install` → build → push (authored `lucaperullo@outlook.it` so Vercel deploys).

## Verification
- Library: build, `jest`, `size-limit` all green; grep confirms **zero** `mirror`/`backdropRef`/`backdropSelector`/`mirrorScale`/`useMirrorEngine` references and zero "refraction on iOS/Safari" claims remain.
- Showcase: build green; automated overflow sweep still clean at 375/768; grep confirms no mirror usage or iOS-refraction copy; Vercel deploy success.

## Risks / notes
- **Breaking:** anyone importing `simple-liquid-glass/mirror` or passing `backdropRef` breaks → major bump + clear CHANGELOG.
- Historical changelog entries (2.4.0/3.2) stay as a factual record, but their *forward-facing* "what's new" framing in the showcase is reworded to avoid implying current iOS-refraction support.
- The `_test_` and stories referencing the mirror are removed so the suite stays green.
