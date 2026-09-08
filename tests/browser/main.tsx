import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { LiquidGlass } from '../../dist/index.esm.js';
import { LiquidGlassInteractive } from '../../dist/interactive.esm.js';
import '../../dist/web-component.esm.js';

const params = new URLSearchParams(location.search);
const props = { track: params.has('track'), backdropSelector: '#backdrop', autoTextColor: true, forceTextColor: true,
  effectMode: params.get('effect') || 'auto', mobileFallback: params.has('mirror') ? 'css-only' : undefined };
const Component = params.has('interactive') ? LiquidGlassInteractive : LiquidGlass;
const single = <Component {...props}><button id="content">Glass content</button></Component>;
const count = Math.min(6, Math.max(1, Number(params.get('panels')) || 1));
const app = count === 1 ? single : <>{Array.from({ length: count }, (_, i) =>
  <div key={i} style={{ position: 'absolute', left: (i % 3) * 240, top: Math.floor(i / 3) * 170, width: 220, height: 140 }}>
    <Component {...props} radius={i * 12}><span>Panel {i + 1}</span></Component>
  </div>)}</>;
const container = document.getElementById('root')!;
if ((window as any).__SSR__) container.innerHTML = (window as any).__SSR__;
const root = (window as any).__SSR__ ? hydrateRoot(container, app) : createRoot(container);
if (!(window as any).__SSR__) root.render(app);
(window as any).unmountGlass = () => root.unmount();
