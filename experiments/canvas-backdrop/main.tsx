// One canvas backdrop under n glass panels: the G4 upload test, the pixel check and the canvas benchmark.
// ?n=5|48 &animate=0|1 &scene=auto|off &optics=native|liquidgl &blur=0
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { LiquidGlass } from '../../src/index';

const params = new URLSearchParams(location.search);
const n = Number(params.get('n') ?? 5), animate = params.get('animate') !== '0';
const optics = params.get('optics') === 'liquidgl' ? 'liquidgl' : 'native';
const blur = Number(params.get('blur') ?? 0);

function paint(canvas: HTMLCanvasElement, t: number) {
  const dpr = devicePixelRatio || 1, w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1d3b8f'); g.addColorStop(.5, '#d0426b'); g.addColorStop(1, '#f2b134');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // Stripes and discs give the refraction edges to bend.
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (let x = -h; x < w; x += 60 * dpr) { ctx.beginPath(); ctx.moveTo(x + (t * .05 * dpr) % (60 * dpr), 0); ctx.lineTo(x + 18 * dpr + (t * .05 * dpr) % (60 * dpr), 0); ctx.lineTo(x + h + 18 * dpr + (t * .05 * dpr) % (60 * dpr), h); ctx.lineTo(x + h + (t * .05 * dpr) % (60 * dpr), h); ctx.fill(); }
  for (let i = 0; i < 9; i++) {
    const a = t / 1400 + i * 0.7;
    ctx.fillStyle = `hsl(${i * 40} 90% 55%)`;
    ctx.beginPath(); ctx.arc(w * (.5 + .4 * Math.cos(a * (1 + i * .1))), h * (.5 + .4 * Math.sin(a * 1.3)), (30 + i * 6) * dpr, 0, Math.PI * 2); ctx.fill();
  }
}

function App() {
  const backdrop = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = backdrop.current!;
    let raf = 0, frames = 0;
    const lab = ((window as any).canvasLab = { frames: 0, paint: (t: number) => paint(canvas, t) });
    paint(canvas, Number(params.get('t') ?? 0));
    if (!animate) return;
    const loop = (t: number) => { paint(canvas, t); lab.frames = ++frames; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const W = innerWidth, H = innerHeight, gap = 12;
  const cols = Math.max(1, Math.round(Math.sqrt(n * W / H))), rows = Math.ceil(n / cols);
  const pw = (W - gap * (cols + 1)) / cols, ph = Math.min((H - gap * (rows + 1)) / rows, pw * .8);
  return <>
    <canvas ref={backdrop} id="backdrop"/>
    <div id="panels">{Array.from({ length: n }, (_, i) => <LiquidGlass key={i} className="panel" data-panel={i} renderer="webgl"
      webglScene={params.get('scene') === 'off' ? 'off' : 'auto'} optics={optics} blur={blur}
      backdropRef={backdrop} radius={Math.min(24, ph / 2)} glassColor="rgba(255,255,255,.04)"
      style={{ left: gap + (i % cols) * (pw + gap), top: gap + Math.floor(i / cols) * (ph + gap), width: pw, height: ph }}>
      <span style={{ display: 'block', padding: 8 }}>{i + 1}</span></LiquidGlass>)}</div>
  </>;
}
createRoot(document.getElementById('app')!).render(<App/>);
