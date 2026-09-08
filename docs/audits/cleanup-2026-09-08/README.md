# Approved cleanup completion · 2026-09-08

Implemented all seven approved clusters across the library and showcase, preserving the existing dirty working trees. No npm release or deployment was performed as part of this cleanup.

## Changes

| Cluster | Result | Manifest |
| --- | --- | --- |
| 1 | Removed retired drag/cursor/example/codegen modules and unused presets; 361 source lines removed. | [1](./1.md) |
| 2 | Removed 365 unused CSS selector branches and consolidated compatible rules without crossing responsive boundaries. | [2](./2.md) |
| 3 | Reused the clipboard helper; failed copies no longer report success. | [3](./3.md) |
| 4 | Centralized package links/install identity and corrected current release metadata to 5.1.0. | [4](./4.md) |
| 5 | Demo registry owns explicit scene images and lazy source imports; previews match their demos. | [5](./5.md) |
| 6 | Shared highest-quality policy applies consistently across showcase components. | [6](./6.md) |
| 7 | Consolidated lens modes, profile types and profile catalog consumers while preserving public API shapes. | [7](./7.md) |

Source CSS decreased from 69,563 to 47,596 bytes. Compiled CSS decreased from 58,690 to 32,629 bytes (44.4%). Readable CSS formatting increases line count; byte reduction is the appropriate stylesheet metric.

## Verification

- Library typecheck, build, published-consumer type checks and all size budgets passed.
- Jest: 82 tests across 15 suites passed.
- Chromium: both release compatibility and scrolling/strength optics tests passed.
- Library has no lint script; no library lint result is claimed.
- Showcase typecheck, ESLint and production build passed.
- Computed-style comparison across 16 routes and four widths (390, 768, 1024, 1440): all 64 snapshots unchanged after CSS cleanup.
- All 11 lazy demo source panels load and match gallery scene imagery.
- Copy success/failure, release metadata, music playback, modal dismissal, notifications, checklist drag/reset/tasks and lens settings checks passed.
- WebKit mobile navigation, reduced-motion behavior and overflow checks passed; no runtime errors observed in the functional checks.
- Both repositories passed `git diff --check`.

A preliminary CSS proposal that crossed responsive rules was rejected before source application. A drag test initially compared page coordinates before and after changing card height; the test was corrected to assert reset of the drag transform. The unchanged drag implementation passed the corrected check. These checks do not constitute physical-device performance measurements.

## Scope and recovery

Clusters 8–10 (motion subscriptions, browser classification and manual validation artifacts) remain deferred. Vendor code/notices, historical records, media, active public APIs and existing validation fixtures were retained.

Original working-tree snapshots are stored at `/private/tmp/glass-cleanup-baseline/simple-liquid-glass` and `/private/tmp/glass-cleanup-baseline/simple-liquid-glass-showcase`. Per-cluster manifests and patches in this directory document exact touched sites and checks. Temporary verification scripts/results are under `/private/tmp`; snapshots are local recovery aids and may be cleared by the operating system.
