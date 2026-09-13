import React, { useEffect, useRef, useState } from 'react';
import VisibleLiquidText from './components/VisibleLiquidText';
import {typefaces,textMaterial} from './typography';

export default function Workbench() {
  const [font, setFont] = useState<string>(typefaces[0].family);
  const [blur, setBlur] = useState(.3);
  const [refraction, setRefraction] = useState(88);
  const [borderWidth, setBorderWidth] = useState(textMaterial.borderWidth);
  const [borderColor, setBorderColor] = useState(textMaterial.borderColor);
  const [fill, setFill] = useState(.04);
  const [shadow, setShadow] = useState(.15);
  const [enabled, setEnabled] = useState(true);
  const [dispersion, setDispersion] = useState(1.5);
  const [text, setText] = useState('Liquid.');
  const [mode, setMode] = useState<'video' | 'scroll'>('video');
  const [paused, setPaused] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [videoError, setVideoError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const scrollContent = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const observer=new IntersectionObserver(([entry])=>{
      if(!paused&&entry.isIntersecting)void element.play().catch(()=>setPaused(true));
      else element.pause();
    });
    observer.observe(element);
    return()=>observer.disconnect();
  }, [paused, mode]);

  useEffect(() => {
    const element = heading.current;
    if (!element || mode !== 'scroll') return;
    const scroll = (event: WheelEvent) => {
      if (!scroller.current) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.current.clientHeight : 1;
      scroller.current.scrollTop += event.deltaY * unit;
    };
    element.addEventListener('wheel', scroll, { passive: false });
    return () => element.removeEventListener('wheel', scroll);
  }, [mode]);

  return <div className="workbench">
    <div className="scene-toolbar">
      <div className="scene-tabs" role="group" aria-label="Background scene">
        <button type="button" aria-pressed={mode === 'video'} onClick={() => setMode('video')}>Film</button>
        <button type="button" aria-pressed={mode === 'scroll'} onClick={() => setMode('scroll')}>Scroll content</button>
      </div>
      <div className="scene-actions"><button className="playback" type="button" aria-pressed={enabled} onClick={() => setEnabled(value => !value)}>Refraction {enabled ? 'on' : 'off'}</button>
      {mode === 'video' ? <button className="playback" type="button" onClick={() => setPaused(value => !value)}>{paused ? 'Play video' : 'Pause video'}</button> : <span className="toolbar-hint">Scroll inside the scene ↓</span>}</div>
    </div>
    <section className={`scene scene--${mode}`} aria-label="Glass text preview">
      {mode === 'video' ? <>
        <video ref={video} className="scene-video" src="/media/coast.mp4" poster="/media/coast-poster.jpg" muted loop playsInline preload="auto" aria-label="Coastal film behind the glass" onError={() => setVideoError(true)} />
        {videoError && <p className="video-error">Video unavailable. Try the scrollable scene.</p>}
      </> : <div ref={scroller} className="scene-scroll" tabIndex={0} aria-label="Scrollable backdrop"><div ref={scrollContent}>
        <article className="story-cover"><span>FIELD NOTES / 001</span><h3>Between<br />land & sea.</h3><p>Slow down. Look closer. There is a whole world in the details.</p><span className="scroll-cue">KEEP SCROLLING ↓</span></article>
        <article className="story-type"><span>02 / A CHANGE OF PERSPECTIVE</span><h3>Nothing<br />stands still.</h3><p>These are real words underneath the glass. Scroll them through the letters and watch their edges bend.</p><div className="ruler" /></article>
        <article className="story-photo"><span>03 / OPEN WATER</span><h3>Find your<br />own current.</h3><p>Live content. Clear centers. Curved edges.</p></article>
      </div></div>}
      <h2 ref={heading} className="glass-heading" style={{ fontFamily: font, fontWeight: typefaces.find(item=>item.family===font)?.weight ?? 700, fontStyle:typefaces.find(item=>item.family===font)?.style ?? 'normal' }}><VisibleLiquidText key={mode} backdropRef={mode === 'video' ? video : scrollContent} blur={blur} refraction={enabled ? refraction : 0} dispersion={dispersion} bevel={10} tint="transparent" borderWidth={borderWidth} borderColor={borderColor} fillColor={`rgb(255 255 255 / ${fill})`} shadow={shadow === 0 ? 'none' : `0 2px 4px rgb(0 0 0 / ${shadow})`} data-testid="glass">{text}</VisibleLiquidText></h2>
      <span className="scene-label">{mode === 'video' ? 'LIVE FILM' : 'LIVE SCROLL'} / GLYPH-SHAPED REFRACTION</span>
    </section>
    <form onSubmit={event => event.preventDefault()}>
      <label>Words<input aria-label="Words" maxLength={18} value={text} onChange={event => setText(event.target.value)} /></label>
      <label>Font<select aria-label="Font" value={font} onChange={event => setFont(event.target.value)}>
        {typefaces.map(item=><option key={item.name} value={item.family}>{item.name}</option>)}<option value="Georgia, serif">Georgia — serif</option><option value="Arial, sans-serif">Arial — sans serif</option><option value="Courier New, monospace">Courier New — monospace</option>
      </select></label>
      <label>Refraction · {refraction}px<input aria-label="Refraction" type="range" min="0" max="300" value={refraction} onChange={event => setRefraction(Number(event.target.value))} /></label>
      <label>Color separation · {dispersion}px<input aria-label="Color separation" type="range" min="0" max="6" step=".1" value={dispersion} onChange={event => setDispersion(Number(event.target.value))} /></label>
      <label>Blur · {blur}px<input aria-label="Blur" type="range" min="0" max="16" step=".1" value={blur} onChange={event => setBlur(Number(event.target.value))} /></label>
      <label>Border · {borderWidth}px<input aria-label="Border width" type="range" min="0" max="6" step=".1" value={borderWidth} onChange={event => setBorderWidth(Number(event.target.value))} /></label>
      <label>Border color<select aria-label="Border color" value={borderColor} onChange={event => setBorderColor(event.target.value)}>
        <option value="rgb(255 255 255 / 0.4)">Soft white</option><option value="#ffffff">White</option><option value="#18362f">Dark green</option><option value="#000000">Black</option>
      </select></label>
      <label>White fill · {Math.round(fill * 100)}%<input aria-label="Fill opacity" type="range" min="0" max="1" step=".01" value={fill} onChange={event => setFill(Number(event.target.value))} /></label>
      <label>Shadow · {Math.round(shadow * 100)}%<input aria-label="Shadow opacity" type="range" min="0" max="1" step=".01" value={shadow} onChange={event => setShadow(Number(event.target.value))} /></label>
    </form>
  </div>;
}
