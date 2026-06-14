import React, { useRef, useState, useCallback } from 'react';
import { LiquidGlass } from 'simple-liquid-glass';
import { LiquidGlassInteractive } from 'simple-liquid-glass/interactive';

const REPO = 'https://github.com/lucaperullo/simple-liquid-glass';
const NPM = 'https://www.npmjs.com/package/simple-liquid-glass';

const BLOCK_COLORS = ['#ff5f6d', '#ffc371', '#2193b0', '#6dd5ed', '#c471f5', '#fa71cd'];

/** A vivid, sharp-edged background so the refraction is obvious as the glass passes over it. */
function ColorGrid({ refEl }: { refEl: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={refEl}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignContent: 'flex-start',
        background: '#0b1021',
      }}
    >
      {Array.from({ length: 72 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: '16.666%',
            height: 84,
            background: BLOCK_COLORS[i % BLOCK_COLORS.length],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.9)',
            fontWeight: 700,
            fontSize: 20,
          }}
        >
          {i + 1}
        </div>
      ))}
    </div>
  );
}

/** Draggable lens that refracts the sibling backdrop (real refraction on iOS/Safari via backdropRef). */
function DraggableLens({ backdropRef }: { backdropRef: React.RefObject<HTMLDivElement | null> }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, sx: 0, sy: 0, px: 0, py: 0 });

  const onDown = useCallback((e: React.PointerEvent) => {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(wrapRef.current?.style.transform || '');
    drag.current = { on: true, sx: e.clientX, sy: e.clientY, px: m ? +m[1] : 0, py: m ? +m[2] : 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current.on || !wrapRef.current) return;
    const x = drag.current.px + (e.clientX - drag.current.sx);
    const y = drag.current.py + (e.clientY - drag.current.sy);
    wrapRef.current.style.transform = `translate(${x}px, ${y}px)`;
  }, []);
  const onUp = useCallback(() => { drag.current.on = false; }, []);

  return (
    <div
      ref={wrapRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ width: 300, height: 188, touchAction: 'none', cursor: 'grab', willChange: 'transform' }}
    >
      <LiquidGlass backdropRef={backdropRef} track radius={30} mobileFallback="css-only">
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.45)', fontWeight: 600, userSelect: 'none' }}>
          drag me over the colors
        </div>
      </LiquidGlass>
    </div>
  );
}

function CopyInstall() {
  const [copied, setCopied] = useState(false);
  const cmd = 'npm i simple-liquid-glass';
  const copy = () => {
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="install" title="Copy to clipboard">
      <span className="prompt">$</span> {cmd}
      <span className="copy">{copied ? '✓ copied' : 'copy'}</span>
    </button>
  );
}

const Check = () => <span style={{ color: '#34d399', fontWeight: 700 }}>✓</span>;
const Cross = () => <span style={{ color: '#f87171', fontWeight: 700 }}>✗</span>;

export default function App() {
  const heroBgRef = useRef<HTMLDivElement>(null);

  return (
    <div className="page">
      {/* ============ HERO ============ */}
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Apple-style liquid glass · iOS 26 ready</span>
          <h1>
            Liquid glass that actually
            <br />
            <span className="grad">refracts on iPhone</span>.
          </h1>
          <p className="sub">
            The only <strong>zero-dependency</strong> React liquid-glass component with <strong>real
            refraction on iOS &amp; Safari</strong> — not a blur fallback. ~6.5&nbsp;KB, SSR-safe,
            React&nbsp;16.8–19, plus a web component for Vue/Svelte/Astro.
          </p>
          <div className="cta">
            <CopyInstall />
            <a className="btn ghost" href={REPO} target="_blank" rel="noreferrer">GitHub ★</a>
            <a className="btn ghost" href={NPM} target="_blank" rel="noreferrer">npm</a>
          </div>
          <p className="hint">Drag the glass across the grid → the squares bend through it. On a real iPhone, that distortion is live.</p>
        </div>

        {/* The showcase: lens + its sibling backdrop (NOT an ancestor → backdropRef works on iOS) */}
        <div className="stage">
          <ColorGrid refEl={heroBgRef} />
          <div className="stage-lens">
            <DraggableLens backdropRef={heroBgRef} />
          </div>
        </div>
      </header>

      {/* ============ FEATURE CARDS ============ */}
      <section className="features">
        <div className="feat-bg" />
        <div className="feat-grid">
          <LiquidGlass radius={22} aberrationIntensity={2} className="feat-card">
            <h3>Chromatic aberration</h3>
            <p>Red/blue light separation at the edges — Apple's signature look, tunable per instance.</p>
          </LiquidGlass>

          <LiquidGlassInteractive elasticity={0.35} radius={22} className="feat-card">
            <h3>Pointer-reactive</h3>
            <p>The <code>/interactive</code> variant leans toward the cursor with a tiny spring. Honors reduced-motion.</p>
          </LiquidGlassInteractive>

          <LiquidGlass radius={22} className="feat-card">
            <h3>Framework-agnostic</h3>
            <p>A <code>&lt;liquid-glass&gt;</code> web component drops the same effect into Vue, Svelte, Astro, or plain HTML.</p>
          </LiquidGlass>
        </div>
      </section>

      {/* ============ COMPARISON ============ */}
      <section className="compare">
        <h2>Why simple-liquid-glass</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th className="us">simple-liquid-glass</th>
                <th>liquid-glass-react</th>
                <th>@specy/liquid-glass</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Real refraction on <b>Safari / iOS</b></td><td className="us"><Check /></td><td><Cross /></td><td><Cross /> (WebGL)</td></tr>
              <tr><td>React <b>16.8 – 19</b></td><td className="us"><Check /></td><td><Cross /> (19 only)</td><td><Check /></td></tr>
              <tr><td>Bundle (gzip)</td><td className="us"><b>~6.5 KB</b></td><td>~33 KB</td><td>6.8 MB</td></tr>
              <tr><td>Zero runtime deps</td><td className="us"><Check /></td><td><Check /></td><td><Cross /> (Three.js)</td></tr>
              <tr><td>SSR-safe (Next.js)</td><td className="us"><Check /></td><td>⚠️</td><td><Cross /></td></tr>
              <tr><td>Web component</td><td className="us"><Check /></td><td><Cross /></td><td><Cross /></td></tr>
              <tr><td>Maintained (2026)</td><td className="us"><Check /></td><td><Cross /> (since Jun 2025)</td><td><Cross /></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ============ QUICK START ============ */}
      <section className="quickstart">
        <h2>Real iOS refraction in 3 lines</h2>
        <pre><code>{`const bg = useRef(null);

<div ref={bg}>{/* the background behind the glass */}</div>
<LiquidGlass backdropRef={bg} track>Glass that refracts on iOS</LiquidGlass>`}</code></pre>
        <p className="note">
          <code>backdropRef</code> points at a sibling/background element (not an ancestor). On Chromium
          you get native <code>backdrop-filter</code> refraction; on iOS/Safari/Firefox a live-DOM mirror
          delivers the real distortion. Omit it and you get a polished frosted-blur fallback.
        </p>
      </section>

      <footer className="footer">
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
        <a href={NPM} target="_blank" rel="noreferrer">npm</a>
        <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">Changelog</a>
        <span>MIT · ~6.5 KB · zero dependencies</span>
      </footer>
    </div>
  );
}
