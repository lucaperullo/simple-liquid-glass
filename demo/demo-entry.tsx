import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { LiquidGlass } from '../src/index';

type Mode = 'auto' | 'svg' | 'blur' | 'webgl' | 'off';

function useDrag(initial: { x: number; y: number }) {
  const [pos, setPos] = useState(initial);
  const dragging = useRef<null | { dx: number; dy: number }>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPos({ x: e.clientX - dragging.current.dx, y: e.clientY - dragging.current.dy });
  };
  const onPointerUp = () => {
    dragging.current = null;
  };
  return { pos, handlers: { onPointerDown, onPointerMove, onPointerUp } };
}

function App() {
  const [mode, setMode] = useState<Mode>('auto');
  const [scale, setScale] = useState(160);
  const [aberration, setAberration] = useState(1);
  const { pos, handlers } = useDrag({ x: 40, y: 180 });

  const modes: Mode[] = ['auto', 'svg', 'blur', 'webgl', 'off'];

  return (
    <>
      {/* draggable glass pane */}
      <div
        {...handlers}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: 320,
          height: 180,
          zIndex: 10,
          cursor: 'grab',
          touchAction: 'none'
        }}
      >
        <LiquidGlass
          key={mode + scale + '-' + aberration /* remount so webgl picks up params */}
          effectMode={mode}
          mobileFallback={mode === 'svg' ? 'svg' : undefined}
          scale={scale}
          radius={36}
          blur={2}
          aberrationIntensity={aberration}
          saturation={150}
        >
          <div style={{ padding: 18, fontFamily: 'system-ui, sans-serif', color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.5)', userSelect: 'none' }}>
            <strong style={{ fontSize: 18 }}>Liquid Glass</strong>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>
              mode: <b>{mode}</b> — drag me around
            </div>
          </div>
        </LiquidGlass>
      </div>

      {/* second static pane — verifies the shared WebGL context/snapshot */}
      <div style={{ position: 'fixed', right: 24, top: 320, width: 220, height: 120, zIndex: 9 }}>
        <LiquidGlass
          key={'b' + mode + scale + '-' + aberration}
          effectMode={mode}
          mobileFallback={mode === 'svg' ? 'svg' : undefined}
          scale={scale}
          radius={28}
          blur={2}
          aberrationIntensity={aberration}
          saturation={150}
        >
          <div style={{ padding: 14, fontFamily: 'system-ui, sans-serif', color: '#fff', fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,.5)', userSelect: 'none' }}>
            pane #2 (static)<br />shared context test
          </div>
        </LiquidGlass>
      </div>

      {/* control bar (excluded from webgl snapshot) */}
      <div
        data-liquid-ignore=""
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          background: 'rgba(0,0,0,0.75)',
          borderRadius: 14,
          padding: '10px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: '#fff',
          fontSize: 13,
          maxWidth: '94vw'
        }}
      >
        {modes.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              background: mode === m ? '#4ecdc4' : 'rgba(255,255,255,0.15)',
              color: mode === m ? '#000' : '#fff'
            }}
          >
            {m}
          </button>
        ))}
        <label>
          scale {scale}
          <input type="range" min={0} max={360} value={scale} onChange={(e) => setScale(+e.target.value)} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
        </label>
        <label>
          aberration {aberration}
          <input type="range" min={0} max={4} step={0.5} value={aberration} onChange={(e) => setAberration(+e.target.value)} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
        </label>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
