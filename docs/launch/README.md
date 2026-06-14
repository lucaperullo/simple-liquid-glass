# Launch playbook — simple-liquid-glass

Paste-ready launch copy for the v2.4.0 growth push. Strategy + sequencing live in
[`../GROWTH-PLAN.md`](../GROWTH-PLAN.md). Everything here leads with the one wedge:

> **The only zero-dependency liquid-glass library with REAL refraction on iPhone & Safari — not a
> blur fallback. Works on React 16.8–19.**

## ⛔️ Pre-flight — do these BEFORE posting anything

1. **Deploy the live demo** to `simple-liquid-glass.vercel.app` (`vercel --prod` from `demo/`). Every
   post links to it; without it, all this copy points at nothing.
2. **Verify the iOS refraction on a real iPhone** (Safari, not the simulator). The whole pitch is
   "real refraction on iPhone" — if it regressed, the launch backfires. This is the single
   must-pass gate.
3. **Record a 20s clip** (GIF + MP4) of dragging a glass pane over a busy photo on a real iPhone.
   This one asset feeds X/Bluesky, Reddit, dev.to, Product Hunt, and a YouTube Short.
4. **Publish the npm metadata** (already committed: keywords + description) — `npm publish` 2.4.0.

## Sequence (tie to the live Apple Liquid Glass / WWDC wave)

| Week | Channel | File |
|---|---|---|
| 1 | X / Bluesky demo clip (link in a reply) + 3 awesome-list PRs | [`x-bluesky-thread.md`](./x-bluesky-thread.md) |
| 2 | dev.to deep-dive (canonical) + "Show r/reactjs" / r/webdev | [`devto-article.md`](./devto-article.md), [`reddit.md`](./reddit.md) |
| 3 | Product Hunt (Tue/Wed 00:01 PST) + YouTube Short | [`product-hunt.md`](./product-hunt.md) |
| 4–6 | shadcn registry + Vercel starter template (slow burn) | see GROWTH-PLAN §3 |

## Awesome-list PRs (week 1, lead with "real iOS/Safari refraction")

- `carolhsiaoo/awesome-liquid-glass`
- `brillout/awesome-react-components`
- `lukasmasuch/best-of-react`

## Honesty rules (keep us credible)

- Never claim "#1" or cite download numbers we don't have.
- "Real refraction on iOS/Safari" is factually accurate — lead with it, don't trash competitors.
- Every claim (6.5 KB, zero deps, React 16.8–19, live-DOM mirror) is verifiable in `package.json` /
  README. Keep it that way.
