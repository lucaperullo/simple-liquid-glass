# simple-liquid-glass → #1: Growth Plan

> Goal: become the **#1 liquid-glass React library by npm weekly downloads.** Research-backed plan
> (competitor download data, npm/SEO ranking factors, growth channels), June 2026. Ready-to-paste
> launch copy lives in [`docs/launch/`](./launch/).

## 1. Situation & wedge

**Where we stand:** ~**#4** by weekly downloads (**~1,327/wk** at time of research). The leader is
**`liquid-glass-react`** (Max Rovensky) at **~26,061/wk** — a ~19.6× gap. It won on *timing + name
match*, not substance: it shipped 7 versions inside 48h of WWDC 2025, grabbed the verbatim search
term "liquid-glass-react," and has been **abandoned since June 11, 2025**. It hard-requires React 19
and shows **zero refraction on Safari/Firefox**.

**The wedge — one line, repeated everywhere:**

> **The only zero-dependency liquid-glass library with REAL refraction on iPhone & Safari — not a
> blur fallback. Works on React 16.8–19.**

Why it wins: (a) **true** — validated on a real iPhone via the `backdropRef` mirror engine; (b)
**un-copyable this quarter** — the leader is abandoned and can't respond; (c) **timely** — iOS 26
Liquid Glass is on 1B+ devices and WWDC 2026 is re-igniting search. Every competitor breaks on
Safari/iOS. That is the headline, the demo, the Reddit title, the dev.to title, and the npm
description.

**Secondary wedge** (for the React 16/17/18 base the leader excludes): "the drop-in liquid glass
that doesn't force a React 19 upgrade."

Substance is already on our side (smallest bundle, SSR-safe, 4 tree-shakable exports, web-component,
active releases). The deficit is **distribution + proof** — few GitHub stars and (until now) no
playable demo. Fix proof, ride the trend, take the gap (don't have to out-ship a dead project).

## 2. Do first (this week)

Ranked by impact ÷ effort.

1. **Deploy a playable live demo to `simple-liquid-glass.vercel.app`** (H / M). The #1 blocker — no
   one installs an effect they can't see. `demo/demo.html` already exists. `vercel --prod` with the
   iPhone-refraction showcase above the fold + a "copy `npm i simple-liquid-glass`" button.
2. **Rewrite npm keywords + description for the wedge** (H / L). ✅ *Done* — see `package.json`.
3. **README: wedge H1 + comparison table + `backdropRef` banner** (H / M). ✅ *Done*.
4. **Record one 20-second iPhone/Safari refraction clip on a busy background** (H / L). One asset
   feeds X, Bluesky, Reddit, dev.to, Product Hunt, YouTube Shorts.
5. **Open 3 awesome-list PRs** (M / L): `carolhsiaoo/awesome-liquid-glass`,
   `brillout/awesome-react-components`, `lukasmasuch/best-of-react`. Lead with "only library with
   real iOS/Safari refraction."

## 3. 30 / 60 / 90-day roadmap

### Days 0–30 — Proof + discoverability

| Action | Why it moves downloads | Impact | Effort |
|---|---|:--:|:--:|
| Deploy live playground (demo.html → Vercel) | Removes the #1 adoption blocker | H | M |
| npm keywords + description rewrite ✅ | Surfaces us under iOS/Safari/SSR/web-component searches | H | L |
| README wedge + comparison table + banner ✅ | Converts visitors; ranks for "liquid-glass-react safari" | H | M |
| 20s iPhone refraction demo (GIF+MP4) | Reusable hero asset for all launches | H | L |
| 3 awesome-list PRs | Permanent backlinks + passive funnel | M | L |
| dev.to deep-dive (real refraction without WebGL, works on iOS) | Durable SEO + newsletter pickup | M | M |
| "Show r/reactjs" post (value-first, link last) | 300–800 stars/post historically | M | L |
| GitHub topics + About to wedge ✅ | GitHub search + Google indexing | M | L |

### Days 31–60 — Distribution moat

| Action | Why | Impact | Effort |
|---|---|:--:|:--:|
| shadcn-style `registry.json` for LiquidGlass / Interactive / Mirror | `npx shadcn add` reaches devs who never search npm | H | M |
| **Product Hunt** launch (Tue/Wed 00:01 PST), "iOS 26 Liquid Glass for the web" | Day-of spike + durable backlink | H | M |
| Next.js starter template on Vercel marketplace | Surfaced at project-creation time | M | M |
| `docs/migration.md` v1→v2 (WebGL removed) ✅ | Recovers 1.4.x users who hit a hard error | M | L |
| Storybook: Quality Tiers + Chromatic Aberration + 100-instance stress | Surfaces hidden flagship knobs | M | M |
| YouTube Short / Reel ("install → glass in 60s") | Algorithmic non-follower reach | M | M |

### Days 61–90 — Compounding authority + feature gaps

| Action | Why | Impact | Effort |
|---|---|:--:|:--:|
| Bulge/magnify refraction mode | Matches Apple's lens; new launch beat | M | M |
| Expand web-component API (backdropSelector, autoTextColor, gradients) | Unlocks Vue/Svelte/Astro market | M | M |
| Cross-framework guides (Vue 3 / Svelte / Astro) | Captures non-React searches no competitor serves | M | M |
| Google SEO landing pages (`/glassmorphism`, `/apple-liquid-glass-css`) + JSON-LD | Ranks for "react liquid glass" (~1.2k/mo) | M | M |
| Showcase site → Codrops / CodePen / Awwwards | Backlinks + roundup citations | L | M |
| WWDC 2026 reaction post + tagged bump | Rides the live second-wave search spike | M | L |

## 4. Product gaps that block adoption (fix → why it converts)

1. **No hosted live demo (THE blocker).** Deploy `demo/demo.html` with iPhone refraction above the
   fold + copy-install CTA. → Turns a visitor into an installer with one interaction.
2. **`backdropRef` mandatory for iOS but silent when omitted.** ✅ Added a one-time dev `console.warn`
   on fallback engines + the README `[!IMPORTANT]` banner. → Stops the silent "it's broken on iPhone" bounce.
3. **No "choose your path" guide.** ✅ Added to README (simple / interactive / web-component). → Routes each user to a working snippet in <1 min.
4. **Quality presets + autodetect are invisible.** Add a "Quality Tiers" Storybook story + opt-in resolved-tier log. → Reassures perf-cautious teams.
5. **Chromatic aberration is a hidden knob.** Surface `aberrationIntensity` in basic usage + a dedicated story. → The flashiest feature should be seen first.
6. **Web-component API lags React.** Extend `observedAttributes` in `src/web-component/index.ts`. → Converts the Vue/Svelte/Astro market competitors abandon.
7. **No v1→v2 migration path.** ✅ `docs/migration.md`. → Recovers users who rage-bounce on upgrade.
8. **JSDoc gaps on `background`/string-union props.** Add valid `linear-gradient(...)`/`rgba(...)` examples. → Prevents the "looks wrong" first run.

## 5. Ship-now SEO / discoverability (status)

- ✅ **npm keywords** rewritten (iOS/Safari/Firefox/SSR/web-component/interactive/lightweight/React-versions). See `package.json`.
- ✅ **npm description** rewritten to the wedge (157 chars).
- ✅ **GitHub About** = wedge; **homepage** = the Vercel demo; **topics** reconciled (added `ios-26`, `apple-design`, `web-component`, `ssr`).
- ✅ **README**: wedge H1 subtitle, downloads + stars + demo badges, `[!IMPORTANT]` backdropRef banner, comparison table, "choose your path."
- ⏳ **Live demo deploy** (needs your Vercel auth) — the single biggest remaining lever.

**Target search queries:** "react liquid glass", "liquid-glass-react safari", "glassmorphism react
component", "apple liquid glass css", "ios 26 liquid glass web".

## 6. Launch sequence (copy in `docs/launch/`)

Tie everything to the live Apple wave (WWDC 2026 this month; iOS 26 on 1B+ devices). **Pre-flight:**
demo deployed · README wedge live ✅ · npm metadata published · 20s GIF+MP4 · a CodeSandbox/StackBlitz fork.

- **Week 1 — seed:** deploy demo, publish npm metadata, X + Bluesky demo-first clip (link in a reply), 3 awesome-list PRs.
- **Week 2 — authority:** dev.to deep-dive (canonical) + cross-post Hashnode + submit to React newsletters; "Show r/reactjs" (value-first), staggered to r/webdev + r/Frontend.
- **Week 3 — the big swing:** Product Hunt (Tue/Wed 00:01 PST, Developer Tools), framed "iOS 26 Liquid Glass for the web"; line up 10–15 first-hour upvoters; publish the YouTube Short.
- **Week 4–6 — habit:** ship shadcn registry → submit to registry.directory + shadcnregistry.com; submit Vercel Next.js starter.
- **Ongoing:** WWDC 2026 reaction beat — "what iOS 26 Liquid Glass means for the web + we already support it" + a tagged version bump.

## 7. Metrics

| Milestone | Target wk-downloads | Driver |
|---|--:|---|
| Day 30 | **2,500–3,500** | Demo live + keywords + Reddit/dev.to → #2 in segment |
| Day 60 | **6,000–9,000** | Product Hunt + shadcn registry + starter compounding |
| Day 90 | **12,000–16,000** | Registry/template habit + SEO + WWDC second wave |
| Win | **>26,061 sustained** | The leader is dead and bleeding React-16/17/18 + Safari/iOS users |

**Stars** (biggest perception gap): Day 30 ~150–400 · Day 60 ~800–1,500 · Day 90 ~2,000–3,000.

**Watch:** npm weekly-downloads gap vs `liquid-glass-react`; GitHub Traffic → referring sites &
stars/day; Google Search Console (once SEO pages ship); demo copy-install clicks & CodeSandbox forks.

**The one number that matters:** weekly downloads vs `liquid-glass-react`. The leader is abandoned —
the gap only has to be *taken*, not *out-shipped*.
