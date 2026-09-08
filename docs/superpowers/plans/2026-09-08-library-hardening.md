# Library hardening implementation plan

Goal: strengthen the existing library while preserving React 16.8–19 support and zero runtime dependencies.

- [x] Add failing regression tests for SSR imports, hydration, effect modes, mirror cleanup and safe clones.
- [x] Introduce hydration-safe IDs with a React 16/17 fallback; defer browser detection until mount; handle missing ResizeObserver and truly disable filters in off mode.
- [x] Extract background processing and component hooks into focused modules, preserving behavior.
- [x] Harden mirror source validation, clone isolation, resize tracking and cleanup.
- [x] Generate public declarations from TypeScript source and enforce type checking.
- [x] Add real-browser integration tests and a React version compatibility matrix to CI.
- [x] Correct documentation claims, run tests/build/size checks, and document remaining validation limits.

Validation: regression tests must fail before fixes; then unit/component tests, strict type checking, production bundles, bundle budgets, browser tests and published-entry SSR smoke checks.

## Verified results

- 44 tests across 10 unit/component suites pass.
- 12 integration tests pass across Chromium, Firefox, and WebKit; WebKit mirror screenshot inspected.
- Built React entry points render, hydrate and unmount on React 16.8.6, 17.0.2, 18.3.1, and 19.2.7; legacy entry points use distinct IDs.
- Source type checking and published-declaration consumer checks pass.
- All builds and unchanged size budgets pass: core 7.96 kB, interactive 8.93 kB, mirror 8.02 kB, web component 2.02 kB (Brotli, size-limit).
- Compatible development dependency updates leave npm audit reporting zero vulnerabilities.
- Physical-device iOS performance, historical browser releases, and arbitrary backdrop fidelity remain outside this verification. Nothing was published.
