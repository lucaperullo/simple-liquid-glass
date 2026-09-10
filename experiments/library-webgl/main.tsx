import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiquidGlass, type LiquidGlassHandle, type GlassRenderer } from '../../src/index';
import '../../src/web-component/index';
import './style.css';
const params = new URLSearchParams(location.search);
function Demo() {
  const source = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null);
  const glass = useRef<LiquidGlassHandle>(null);
  const [show, setShow] = useState(true), [changed, setChanged] = useState(false), [strength, setStrength] = useState(.16);
  const [strategy, setStrategy] = useState('starting');
  const isVideo = params.get('scene') === 'video';
  const renderer = (params.get('renderer') ?? 'auto') as GlassRenderer;
  (window as any).libraryLab = { glass, source, video, setShow, setStrength };
  return <>
    <header><div className="heading"><strong>Liquid Glass · Library renderer</strong><span>Real package component</span></div>
      <div className="controls"><label>Renderer<select value={renderer} onChange={e => { params.set('renderer',e.target.value);location.search=params.toString(); }}><option>auto</option><option>webgl</option><option>svg</option></select></label>
        <button onClick={() => {params.set('scene',isVideo?'static':'video');location.search=params.toString();}}>{isVideo?'Static content':'Video'}</button>
        <button id="mutate" onClick={() => setChanged(!changed)}>Change content</button>
        <button id="toggle" onClick={() => setShow(!show)}>Toggle glass</button>
        <label>Strength<input type="range" min="0" max=".4" step=".01" value={strength} onChange={e=>setStrength(+e.target.value)}/></label></div>
      <output>{strategy} · iOS uses WebGL automatically</output></header>
    <main id="scene-root">
      {isVideo ? <video ref={video} id="library-source" className="video-source" src="/packages/simple-liquid-glass-font/public/media/coast.mp4" muted loop autoPlay playsInline/> :
      <div ref={source} id="library-source" className="page-content">{['A clearer perspective.','Made for the everyday.','A little room to breathe.','Details in motion.','Something worth noticing.','Keep exploring.'].map((name,i)=><section key={name} style={{background:changed?'#4fe0a6':['#ffb99e','#a9d9d1','#bfc9f2','#e8c5eb','#d9e5a6','#ffcf83'][i]}}><div className="stripe"/><div className="copy"><small>FIELD NOTES / 0{i+1}</small><h1>{changed?'This content changed.':name}</h1><p>Scroll, bounce, and change direction. Both components use the library renderer and share this background.</p></div></section>)}</div>}
      {params.has('many') && Array.from({length:40},(_,i)=><LiquidGlass key={i} className="offscreen-glass" renderer={renderer} backdropRef={source} style={{position:'absolute',top:10000+i*100,left:20,width:160,height:60}}>Offscreen {i}</LiquidGlass>)}
      {isVideo && <div style={{height:'220vh'}}/>}
      {show && <><LiquidGlass ref={glass} id="library-glass" renderer={renderer} backdropRef={isVideo?video:source} radius={36} lensProfile="player" lensOptions={{strength}} quality="extreme" dispersion={50} aberrationIntensity={.5} glassColor="rgba(255,255,255,.03)" style={{position:'fixed',top:290,left:18,width:'calc(100% - 36px)',height:72,zIndex:10}} onDiagnosticsChange={d=>setStrategy(`${d.strategy} · ${d.reason}`)}><nav className="own-content"><b>FORMA</b><button className="nav-action" onClick={e=>e.currentTarget.textContent='Clicked'}>Explore</button><button className="nav-action">Library</button></nav></LiquidGlass>
      <LiquidGlass id="second-glass" renderer={renderer} backdropRef={isVideo?video:source} radius={32} lensProfile="material" style={{position:'fixed',bottom:24,right:24,width:72,height:64,zIndex:10}}><button className="nav-action" style={{width:'100%',height:'100%'}}>＋</button></LiquidGlass></>}
    </main>
  </>;
}
createRoot(document.getElementById('app')!).render(<Demo/>);
