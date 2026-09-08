# Imperative-Code Audit · simple-liquid-glass + showcase · 2026-09-08

**Status:** User approved clusters 1–7; all seven are implemented and verified. See the [completion record](./cleanup-2026-09-08/README.md) and per-cluster patches. The audit below preserves the original findings; clusters 8–10 remain deferred.

## Summary
- Files scanned: 125 (78 library, 47 showcase source/config/test files). This is a source inventory and targeted semantic audit, not a claim that every runtime path has been exercised.
- Clusters found: 10 (7 high-confidence, 3 borderline).
- Estimated call sites affected: approximately 36 file-level migration sites, with overlap between clusters; exact patch counts belong in the refactor manifests.
- Project's prevailing language: en.
- Source edits at audit time: none. Subsequent approved implementation is recorded in the completion record above.
- Both repositories have substantial uncommitted work from the current session. Before refactoring, preserve per-file snapshots including untracked files. Rollbacks must restore those snapshots, not reset to HEAD or discard the current release/showcase work.

Paths below use **S** = `/Users/lucaperullo/Desktop/workspace/simple-liquid-glass-showcase` and **L** = `/Users/lucaperullo/Desktop/workspace/simple-liquid-glass`.

## Discovery checklist and recall verification

The [complete inventory](./2026-09-08-imperative-inventory.md) lists all 125 scanned paths and every matching source location for each broad-token search, including rejected matches and test fixtures. Long literals are abbreviated; source files remain authoritative.

- [ ] Retired modules: `Draggable`, `GlassCursor`, `WebComponentDemo`, `codegen`, `DEFAULTS`, `PRESETS`, `LIBRARY_DEFAULTS`.
- [ ] Clipboard behavior: `clipboard`, `execCommand`, `copyText`, `copied`.
- [ ] Release identity: `5.0`, `5.1`, `LATEST_`, `RELEASES`, `PACKAGE_PROMPT`, install commands.
- [ ] Quality policy: `quality`, `autodetect`, `mobileFallback`, `SCENE_GLASS`.
- [ ] Demo ownership: `DEMOS`, `sceneCss`, `previewCss`, `sceneThumb`, `sourceFor`, `SOURCES`, `import.meta.glob`, `/media/`.
- [ ] Lens vocabulary: `LensMode`, `lensProfile`, `NATIVE_PROFILES`, `LENS_PROFILES`, lens names.
- [ ] Motion/browser classification: `matchMedia(`, `userAgent`, `isIOS`, `isMobile`, `isChromium`, `supportsSvg`.
- [ ] Parallel declarations and embedded map shapes: `type`, `interface`, `enum`, `Record<`.
- [ ] Manual lab references: `verify/`, `safari-validation`, `safari-lab`, `tests/browser/`, preview ports.
- [ ] CSS: root variables, retired hero/cursor/playground selectors, repeated material-canvas rules.

The `Record` bodies were checked: library quality maps use `LiquidQuality`; liquid presets use `PresetSpec`/`LiquidConfig`; demo source maps are string maps; the checklist keyboard map is a distinct concern. No hidden fourth copy of a status-like union was found. Test fixtures, renderer boundary types, and optional-vs-resolved elastic options are not treated as interchangeable types.

## Clusters

## Cluster 1 — Retired showcase implementations · confidence: high

**Members** (this is the AI slop):
- S `src/components/Draggable.tsx:3` — old spring-back drag component, with no runtime consumer; current drag behavior is in `GlassMemo.tsx`.
- S `src/components/GlassCursor.tsx:36` — retired cursor with its own luminance parsing and animation loop; not mounted by App.
- S `src/pages/examples/WebComponentDemo.tsx:3` — absent from the active demo registry.
- S `src/lib/codegen.ts:11` — `controlsToJsx`, with no consumer.
- S `src/lib/presets.ts:3,14,48,89,94` — obsolete Controls, DEFAULTS, LIBRARY_DEFAULTS, Preset and PRESETS used only by the retired generator or not used at all. `SCENE_GLASS` at line 83 remains live.
- S `src/components/DemoShell.tsx:8,10` — broad eager raw-source globs still pull unlisted examples and unrelated Glass components into the source-viewer chunk. These are source strings, not mounted components.

**Canonical form**:
- File: existing `src/components/GlassMemo.tsx`, `src/components/LensStudio.tsx`, and `src/lib/presets.ts`.
- Name: GlassMemo, LensStudio, SCENE_GLASS.
- Shape: retain the working drag component, current settings model, and the small shared glass policy.
- Why this name: these are already the live owners; a second generic drag abstraction would recreate the problem.

**Migration**:
- 6 files affected: remove the four retired modules; trim presets; restrict DemoShell source selection with Cluster 5.
- Approximately 360 lines of obsolete TS/TSX can be removed before any CSS cleanup. This is a source estimate, not a promised compressed bundle saving.
- Estimated risk: low.
- Tests / type-check expected to catch breakage: yes for imports; browser route/source-viewer checks required for glob behavior.

**Diff preview**:
```tsx
// Before: an unused Controls/defaults/PRESETS system plus the live SCENE_GLASS.
// After: presets.ts owns only SCENE_GLASS; LensStudio remains the actual editor.
// Remove Draggable.tsx; preserve GlassMemo's bounded, persistent drag behavior.
```

## Cluster 2 — Layered showcase styling · confidence: high

**Members** (this is the AI slop):
- S `src/main.tsx:7–8` — imports the old theme and new studio stylesheet together.
- S `src/styles/theme.css:6,547` — two root-theme definitions; `mobileSheet` repeats at 230/569 and `pgBgThumb` at 444/566.
- S `src/styles/studio.css:1,16,28` — repeated `.studio-canvas` rules in the same scope.
- S `src/styles/studio.css:1,8,16` — repeated `.film-glass` rules for a retired homepage.
- S `src/styles/studio.css:21,28` — repeated `.opening-copy h1`; numerous appended mobile/material overrides.
- Retired `.editorial-hero`, `.hero-landscape`, `.wide-film`, cursor, and old playground selectors remain alongside the current immersive experience.

**Canonical form**:
- File: `src/styles/theme.css` for shared tokens/base/legacy-demo primitives; `src/styles/studio.css` for the current studio, with ordered component and responsive sections.
- Name: existing semantic class names and CSS custom properties.
- Shape: one base rule per selector per media scope, with explicit responsive overrides; retain live legacy-demo styles.
- Why this name: preserve the current markup and computed appearance rather than create a third theme.

**Migration**:
- 3 files reviewed/updated: the two stylesheets and their import ownership in main.tsx.
- Current source CSS totals 69,563 bytes. Only a subset is removable; different media queries and intentional specificity are not duplicate behavior.
- Remove selectors only after checking JSX, generated class strings, pseudo-states and all demo routes. Consolidate cascade order property-by-property.
- Estimated risk: medium.
- Tests / type-check expected to catch breakage: no for CSS appearance; desktop/mobile screenshot and interaction checks are mandatory.

**Diff preview**:
```css
/* Before: .studio-canvas is incrementally redefined in several passes. */
/* After: one complete desktop rule, followed by its deliberate responsive rule. */
.studio-canvas { /* final effective properties */ }
@media (max-width: 900px) { .studio-canvas { /* mobile differences */ } }
```

## Cluster 3 — Copy behavior · confidence: high

**Members** (this is the AI slop):
- S `src/components/CodeBlock.tsx:5–8` — calls clipboard directly, swallows failure, then reports success; it can also throw before `.catch` when clipboard is unavailable on HTTP.
- S `src/lib/copyText.ts:1–6` — existing async boolean result with HTTP-preview fallback.
- S `src/components/PackageActions.tsx:7` and `src/components/LensStudio.tsx:25` — already use the canonical helper correctly.

**Canonical form**:
- File: `src/lib/copyText.ts`.
- Name: copyText.
- Shape: `(text: string) => Promise<boolean>`.
- Why this name: the existing shared helper already expresses the operation and handles the preview environment.

**Migration**:
- 1 implementation call site changes: CodeBlock; verify the 2 existing consumers.
- Keep each component's presentation local. Do not create a universal copy-state abstraction merely because labels differ.
- Estimated risk: low.
- Tests / type-check expected to catch breakage: types partly; test success, rejected clipboard access, and fallback behavior explicitly.

**Diff preview**:
```tsx
// Before
navigator.clipboard.writeText(code).catch(() => {})
setCopied(true)
// After
setCopied(await copyText(code))
```

## Cluster 4 — Release identity and install metadata · confidence: high

**Members** (this is the AI slop):
- S `src/lib/releases.ts:13,82–85` — declares latest release as 5.0.0.
- S `src/pages/WhatsNew.tsx:28–32` — consumes that stale latest value.
- S `src/components/GlassNav.tsx:7` and `src/components/Footer.tsx:2` — hard-code 5.1 / 5.1.0 separately.
- S `src/lib/packagePrompt.ts:1` and `src/pages/UseWithAI.tsx:4` — duplicate current-version values and release links.
- S `src/components/PackageActions.tsx:8` — owns another install-command literal.

**Canonical form**:
- File: `src/lib/releases.ts` (existing release registry).
- Name: LATEST_RELEASE, LATEST_VERSION, LATEST_VERSION_SHORT, PACKAGE_INFO.
- Shape: existing Release records plus `{name, installCommand, npmUrl, repositoryUrl}` derived from the current release where appropriate.
- Why this name: the file already promises to govern current-version presentation; restore that contract.

**Migration**:
- 7 files: releases, WhatsNew, GlassNav, Footer, packagePrompt, UseWithAI, PackageActions.
- Add the real 5.1.0 release entry; derive current labels/prompt/link metadata. Preserve historical version strings as history.
- Validate the latest display against the installed dependency version. The separate npm package manifest remains the publication boundary, not an import of sibling repository source.
- Estimated risk: low.
- Tests / type-check expected to catch breakage: yes for imports; explicit metadata consistency check required.

**Diff preview**:
```tsx
// Before
<sup>5.1</sup>
// After
<sup>{LATEST_VERSION_SHORT}</sup>
// The AI prompt interpolates LATEST_VERSION rather than maintaining another literal.
```

## Cluster 5 — Demo scene and source ownership · confidence: high

**Members** (this is the AI slop):
- S `src/lib/demos.ts:3–18` — stores previewCss and sceneCss; scene takes an unused color argument and chooses imagery by a seed's character count.
- S `src/pages/ExamplesHub.tsx:6` — independently chooses the preview image by demo index parity, ignoring previewCss.
- S `src/components/DemoShell.tsx:8–15` — separate broad source globs and special cases for MusicPlayer/Interactive.

**Canonical form**:
- File: `src/lib/demos.ts`.
- Name: DEMOS / DemoEntry.
- Shape: `{slug, title, blurb, scene: {image, position?}, Component, loadSource: () => Promise<string>}`.
- Why this name: the registry already owns routes and titles; it should also own their image and source mapping.

**Migration**:
- 3 consumers/files: demos registry, ExamplesHub, DemoShell.
- Declare each demo image once; both thumbnail and scene render it. Explicit lazy raw imports load only the selected demo source. Preserve the current dedicated music/checklist source mapping in the registry.
- Estimated risk: medium.
- Tests / type-check expected to catch breakage: yes for types/imports; route navigation, lazy source loading, code copying and thumbnail/scene correspondence need browser checks.

**Diff preview**:
```tsx
// Before
const image = i % 2 ? 'dunes' : 'coast'
if (file === 'MusicPlayer') return WIDGET_SOURCES['./GlassMusicPlayer.tsx']
// After
<img src={demo.scene.image} alt="" />
const source = await demo.loadSource()
```

## Cluster 6 — Maximum-quality showcase policy · confidence: high

**Members** (this is the AI slop):
- S `src/lib/presets.ts:83–87` — SCENE_GLASS already defines extreme, disabled autodetect and mobile SVG.
- S `src/components/StudioGlass.tsx:3` — repeats those values independently.
- S `src/pages/examples/Modal.tsx:35`, `Notifications.tsx:29`, `LiquidAnimation.tsx:12–13`, `Dock.tsx:20`, `Weather.tsx:16`, `Login.tsx:15`, `Pricing.tsx:36`, `LensModes.tsx:17–18`, `Gallery.tsx:27` — spread the policy, then redundantly repeat quality settings.
- S `src/pages/WhatsNew.tsx:43` — independent inline policy.
- Retired GlassCursor is handled by Cluster 1. Literal values in standalone documentation snippets are examples, not additional runtime policies.

**Canonical form**:
- File: `src/lib/presets.ts`, reduced to its live declaration after Cluster 1.
- Name: SCENE_GLASS.
- Shape: `Readonly<Pick<LiquidGlassProps, 'quality' | 'autodetectquality' | 'mobileFallback'>>` with extreme / false / svg.
- Why this name: reuse the existing shared owner instead of inventing a competing constant.

**Migration**:
- 11 runtime consumers listed above; preserve their individual radius, frost, saturation and artistic settings.
- StudioGlass applies the shared policy after caller props, preserving the highest-quality requirement.
- Estimated risk: low.
- Tests / type-check expected to catch breakage: yes; check resolved quality and mobile fallback in representative demos.

**Diff preview**:
```tsx
// Before
<LiquidGlass {...SCENE_GLASS} quality="extreme" autodetectquality={false} radius={22} />
// After
<LiquidGlass {...SCENE_GLASS} radius={22} />
```

## Cluster 7 — Lens vocabulary · confidence: high

**Members** (this is the AI slop):
- L `src/core/displacementMap.ts:16` and `src/index.tsx:9` — independent, identical LensMode unions.
- L `src/web-component/index.ts:81–82` — repeats the same list and union cast.
- L `src/core/nativeOptics.ts:3–12` — authoritative native profile keys, while L `src/index.tsx:65` repeats their names in the prop type.
- S `src/components/LensStudio.tsx:25` — enumerates profile names separately in select options and shuffle.

**Canonical form**:
- File: L `src/core/displacementMap.ts` for legacy modes; existing L `src/core/nativeOptics.ts` for native profiles; S LensStudio imports the published LENS_PROFILES catalog.
- Name: LENS_MODES / LensMode; LensProfile derived from `keyof typeof NATIVE_PROFILES`.
- Shape: readonly mode tuple with derived union and membership guard; profile-key union derived from the profile table.
- Why this name: legacy lens modes and native material profiles remain separate concepts; each gets one owner.

**Migration**:
- 5 files: library displacementMap, index, web-component, nativeOptics; showcase LensStudio.
- Preserve the existing exported LensMode name via re-export. Reuse the already-published LENS_PROFILES value in the showcase; display descriptions can remain a presentation-only map.
- Estimated risk: low to medium.
- Tests / type-check expected to catch breakage: yes, including generated declarations, web-component accepted values and consumer-type checks.

**Diff preview**:
```ts
// Before: two separate LensMode unions and another web-component array.
// After in displacementMap.ts:
export const LENS_MODES = ['classic', 'convex', 'shift', 'rim'] as const;
export type LensMode = typeof LENS_MODES[number];
// index.tsx re-exports LensMode; the web component uses the same guard.
```

## Borderline candidates (need user judgment)

### Cluster 8 — Motion preference subscriptions · confidence: borderline
- S Home.tsx:18 and MediaScene.tsx:8 read the same preference, but own different lifecycles. GlassCursor's two matchMedia calls disappear with Cluster 1.
- L index.tsx:474, interactive/index.tsx:35, core/useQuality.ts:26 and web-component/index.ts:98 also read it. Some subscribe live; others intentionally sample at effect/render time.
- Possible canonical form: a small framework-neutral subscribe/read utility inside the library, with a separate showcase helper. Do not introduce React dependencies into the web component or share source across repositories.
- Cost: 4 library + 2 showcase sites; risk medium. Defer until tests establish change-event behavior; a blanket shared hook would alter semantics.

### Cluster 9 — Browser classification · confidence: borderline
- L index.tsx:375–409/463, core/useQuality.ts:64–65 and web-component/index.ts:17–22 repeat user-agent facts.
- They are not identical policies: strict iOS detection also inspects vendor, touch support, window.webkit and Mobile. Quality's mobile classification is not the same as SVG support.
- Possible canonical form: one pure browser-facts function with distinct named support/policy decisions, plus existing SSR/mount guards.
- Cost: 3 files, several call sites; risk high. Defer rather than risk changing Safari/iPadOS handling during cleanup.

### Cluster 10 — Manual validation artifacts · confidence: borderline
- L `verify/` contains seven manual pages/data/server files. Safari preview scripts and docs/safari-validation assets record device-specific work.
- Some are not CI inputs, but automated visual tests still use tests/browser/safari.html and optics.html. Absence from imports does not make manual validation evidence disposable.
- Possible canonical form: keep automated fixtures in tests/browser, document one retained manual-lab entry point, archive obsolete trials only after reviewing their purpose.
- Risk medium. Do not delete these as part of the high-confidence pass.

## Out of scope (intentionally skipped)
- i18n locale files: none found in the scanned application/library sources.
- Generated code/artifacts: node_modules, dist, .types, generated declaration bundles, sourcemaps, build outputs and lockfile contents.
- Vendor: L src/vendor/samasante, its license, and THIRD_PARTY_NOTICES.md. Required attribution is not cleanup debris.
- Existing public React, interactive, mirror and web-component APIs: preserve behavior and exports. The web component's different capability surface is a boundary, not a duplicate implementation to erase.
- Historical release records, authored docs/plans, media, and physical-device validation results: not removed merely because they mention old versions.
- Separate CSS-color parsers: general Rgba parsing and background-expression handling have different contracts; no automatic merge.
- Optional PointerElasticOptions versus required ResolvedElastic: related input/resolved shapes, not interchangeable public types.
- Cosmetic mass renaming, dependency upgrades, deleting tests, and resetting either working tree.

## Suggested execution order
1. Cluster 3 — correct the copy path using the existing helper.
2. Cluster 4 — restore one current-release identity.
3. Cluster 6 — consolidate quality policy.
4. Cluster 5 — make DEMOS own scenes and source loading.
5. Cluster 1 — remove proven retired modules and dead preset declarations.
6. Cluster 7 — consolidate lens types/catalog consumers with compatibility re-exports.
7. Cluster 2 — consolidate CSS last, against the final active route/component set.
8. Defer Clusters 8–10 for separate judgment.

## Verification plan
- Library: type-check, complete Jest suite, build, published consumer types, size limits, relevant browser refraction checks. No lint script exists in its package.json; report that explicitly rather than fabricate a passing lint check.
- Showcase: TypeScript build configuration, ESLint, production build, browser routes, copy success/failure, music controls, drag, all lens settings, lazy demo sources, responsive screenshots, reduced-motion mode and overflow checks.
- Keep one manifest per executed cluster: canonical owner, touched/skipped sites, exact check results, line-count delta and rollback snapshot.
- No implementation verification was run during this read-only audit; prior release checks are not presented as audit results.

Phase 4 approved by the user and completed for clusters 1–7.

The invoked skill explicitly says: “Do not proceed to phase 4 until the user explicitly approves.” Approval is requested for the concrete high-confidence clusters above, not for the inventory work already completed.
