import React from 'react';
import { createRoot } from 'react-dom/client';
import { LiquidGlassText } from '../../src/index';
import '../../src/styles.css';

// ?words=N sibling words over one backdrop; ?scene=off opts out of the shared canvas.
const params = new URLSearchParams(location.search), words = Math.min(64, Number(params.get('words')) || 6);
createRoot(document.getElementById('words')!).render(<>{Array.from({ length: words }, (_, i) =>
  <LiquidGlassText key={i} backdropSelector="#bg" webglScene={params.get('scene') === 'off' ? 'off' : 'auto'}>{`Word ${i + 1}`}</LiquidGlassText>)}</>);
