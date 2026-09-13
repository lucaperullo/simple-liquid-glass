import LauncherFeature from './components/LauncherFeature';
import './launcher-feature.css';
import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import VisibleLiquidText from './components/VisibleLiquidText';
import {useHeroMotion} from './useHeroMotion';
import 'simple-liquid-text/styles.css';
import Workbench from './Workbench';
import StudioGlass from './components/StudioGlass';
import GlassMusicPlayer from './components/GlassMusicPlayer';
import GlassMemo from './components/GlassMemo';
import './components.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/cormorant-garamond/latin-600-italic.css';
import '@fontsource/dm-mono/latin-500.css';
import TypeInMotion from './TypeInMotion';
import {textMaterial} from './typography';
import MediaScene from './components/MediaScene';
import {ArrowDown,Copy,Sparkles} from 'lucide-react';
import './journey.css';
import './style.css';
import './hero.css';

const glassUrl = 'https://glass.lucaperullo.it/';
const npmUrl = 'https://www.npmjs.com/package/simple-liquid-text';
const install = 'npm install simple-liquid-text simple-liquid-glass';
const usage = `import { LiquidGlassText } from 'simple-liquid-text';
import 'simple-liquid-text/styles.css';

<video id="text-background" src="/film.mp4" autoPlay muted loop playsInline />
<h1 style={{ fontFamily: 'Georgia, serif', fontSize: 96 }}>
  <LiquidGlassText renderer="auto" backdropSelector="#text-background" refraction={88} borderWidth={0.3}>
    Your words.
  </LiquidGlassText>
</h1>`;

function CopyButton({text, children}: {text:string; children:React.ReactNode}) {
  const [status,setStatus] = useState('');
  return <div className="copy-action"><button onClick={async()=>{
    try {await navigator.clipboard.writeText(text); setStatus('Copied');}
    catch {setStatus('Select and copy the text below.');}
  }}>{children}<span aria-hidden="true">↗</span></button><span className="copy-status" role="status">{status}</span></div>;
}
function Film() {
  const video = useRef<HTMLVideoElement>(null);
  const [paused,setPaused] = useState(true);
  const wantsPlay = useRef(false);
  useEffect(()=>{
    const element = video.current!;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    wantsPlay.current = !preference.matches;
    const observer = new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting && wantsPlay.current) void element.play().catch(()=>setPaused(true));
      else element.pause();
    },{threshold:.15});
    observer.observe(element);
    const change = ()=>{wantsPlay.current = !preference.matches; if(preference.matches) element.pause();};
    preference.addEventListener('change',change);
    return ()=>{observer.disconnect();preference.removeEventListener('change',change);};
  },[]);
  return <><video ref={video} className="scene-media" src="/media/coast.mp4" poster="/media/coast-poster.jpg" muted loop playsInline preload="metadata" aria-label="Coastal film" onPlay={()=>setPaused(false)} onPause={()=>setPaused(true)}/><button className="film-toggle" onClick={()=>{
    const element=video.current!;wantsPlay.current=element.paused;
    if(element.paused) void element.play().catch(()=>setPaused(true)); else element.pause();
  }}>{paused?'Play film':'Pause film'}</button></>;
}
function App() {
  const hero=useRef<HTMLElement>(null);
  const [heroVideoReady,setHeroVideoReady]=useState(false);
  const heroBackdrop=heroVideoReady?'#text-hero-film':'#text-hero-film-poster';
  useHeroMotion(hero);
  const [open,setOpen] = useState(false);

  return <div className="glass-journey">
    <a className="skip-link" href="#studio">Skip to text studio</a>
    <header className="studio-header"><a className="studio-brand" href="#root"><img src="/logo.svg" alt=""/>simple <span>liquid text</span><sup>0.3</sup></a><button className="menu-button" aria-expanded={open} aria-controls="site-navigation" onClick={()=>setOpen(!open)}>{open?'Close':'Menu'}</button><nav id="site-navigation" className={`studio-links ${open?'is-open':''}`} aria-label="Main navigation" onClick={()=>setOpen(false)}><a href="#type-flow">Typefaces</a><a href="#studio">Text studio</a><a href="#use">Get started</a><a href={glassUrl}>Liquid glass ↗</a><a href="https://launcher.lucaperullo.it/">Launcher ↗</a><a href={npmUrl}>npm ↗</a></nav></header>
    <section ref={hero} className="journey-opening replica-opening" aria-label="Liquid text introduction"><div className="journey-hero">
      <MediaScene id="text-hero-film" onReady={()=>setHeroVideoReady(true)} src="/media/coast.mp4" poster="/media/coast-poster.jpg" label="Coastal opening film"/><div className="journey-shade"/>
      <div className="journey-wordmark"><span className="journey-eyebrow">SIMPLE BY DESIGN. EXTRAORDINARY BY NATURE.</span><h1><VisibleLiquidText backdropSelector={heroBackdrop} {...textMaterial}>Liquid text.</VisibleLiquidText></h1></div>
      <div className="journey-portal"><StudioGlass backdropSelector={heroBackdrop} radius={100} blur={.5} displacementScale={80} background="rgba(255,255,255,.035)" style={{width:'100%'}}><a href="#type-flow" className="portal-link"><span>See what’s<br/>on the other side.</span><ArrowDown size={28} strokeWidth={1}/></a></StudioGlass></div>
      <div className="journey-hero-bottom"><div className="journey-hero-caption"><h2>A living material.<br/>For a different web.</h2><a href="#type-flow" className="journey-text-link">SCROLL TO EXPLORE <ArrowDown size={16}/></a></div><div className="package-actions"><span className="package-intro">THE OPEN-SOURCE REACT TEXT COMPONENT</span><CopyButton text={install}><code>{install}</code><Copy size={17}/></CopyButton><CopyButton text={'Use simple-liquid-text to create selectable liquid text in my font. '+usage}><span><Sparkles size={15}/> Copy prompt for your AI</span><Copy size={14}/></CopyButton><span className="package-status">React 18–19 · Real-time iOS WebGL</span></div></div>
    </div></section>
    <TypeInMotion/>
    <div className="journey-room-frame"><section id="listen" className="journey-room companion-room" aria-label="The listening room">
      <Film/><div className="journey-shade"/>
      <div className="journey-room-heading"><span className="journey-eyebrow">WORDS AND SURFACES. ONE MATERIAL.</span><h2>Feel it.</h2><p>Type that bends the view.<br/>Glass that plays along.</p></div>
      <div className="journey-player"><GlassMusicPlayer/><span className="journey-object-note">PRESS PLAY. STAY A WHILE.</span></div>
      <div className="journey-room-bottom"><p>A real player, in real glass.<br/>The same components. A new voice.</p><a className="journey-text-link" href={glassUrl+'#listen'}>EXPLORE THE ORIGINAL ↗</a></div>
    </section></div>
    <div className="journey-room-frame"><section id="move" className="journey-room companion-room companion-notes" aria-label="The notes room">
      <img className="scene-media" src="/media/dunes.jpg" alt="Wind-shaped dunes" loading="lazy"/><div className="journey-shade"/>
      <div className="journey-room-heading"><span className="journey-eyebrow">MADE TO BE TOUCHED</span><h2>Move it.</h2><p>Pick up a thought.<br/>Find a different perspective.</p></div>
      <div className="journey-drag-stage"><GlassMemo glassProps={{backdropSelector:'#move > img.scene-media'}}/></div>
      <div className="journey-room-bottom"><p>Drag the handle, or use its arrow keys.<br/>Make a little plan.</p><a className="journey-text-link" href={glassUrl+'#wander'}>MEET SIMPLE LIQUID GLASS ↗</a></div>
    </section></div>
    <section id="studio" className="journey-lab"><div className="journey-section-label"><span>YOUR TYPE. YOUR MATERIAL.</span><span>THE TEXT ATELIER</span></div><div className="journey-lab-heading"><h2>Now, make<br/><em>it yours.</em></h2><div><p>Change the words. Choose a font.<br/>Find the edge between clear and extraordinary.</p><a href="#text-workbench" className="journey-text-link">TAKE A SEAT ↓</a></div></div><div id="text-workbench"><Workbench/></div><div className="journey-lab-caption"><span>LIVE FILM. SCROLLING CONTENT. REAL REFRACTION.</span><a href="#use">Bring it to your project ↗</a></div><p className="support-note">Real-time WebGL refraction is supported on iOS with an explicit background source. Video and canvas update live; HTML backgrounds refresh from cached snapshots. Chrome and Edge retain native SVG refraction. Text stays selectable.</p></section>
    <section id="use" className="journey-collection"><div className="journey-section-label"><span>FROM STUDY TO YOUR SCREEN</span><span>OPEN SOURCE · MIT</span></div><div className="journey-collection-heading"><h2>A familiar font.<br/><em>A new dimension.</em></h2><p>Load your font as usual. Choose a background directly, or wrap your page in LiquidGlassScene to share its background with glass and text.</p></div><div className="getting-started"><div><CopyButton text={install}><code>{install}</code></CopyButton><p>88px refraction by default, adjustable to 300px. Tune the outline, fill, shadow, and light to suit your background.</p><a className="journey-text-link" href={npmUrl}>READ THE FULL API ON NPM ↗</a></div><div className="code-sample"><CopyButton text={usage}>Copy example</CopyButton><pre><code>{usage}</code></pre></div></div></section>
    <LauncherFeature/>
    <section className="journey-finale"><div className="journey-finale-image"><img src="/media/coast.jpg" alt="Sunlit turquoise coast" loading="lazy"/><span>ONE FAMILY. A DIFFERENT POINT OF VIEW.</span></div><div className="journey-finale-content"><span className="journey-eyebrow">MEET THE OTHER SIDE.</span><h2>Beyond the words.<br/><em>A whole interface.</em></h2><div className="journey-finale-bottom"><div><p>Glass for your cards, players, and everyday interactions. Explore the original material.</p><a className="journey-text-link" href={glassUrl}>EXPLORE SIMPLE LIQUID GLASS ↗</a></div><div className="companion-mark">simple<br/><span>liquid glass.</span></div></div><div className="journey-colophon"><span>SIMPLE LIQUID TEXT · 0.3.0 · MIT</span><a href={npmUrl}>Get the package ↗</a><a href="/media/credits.txt">Media credits</a><a href={glassUrl}>Simple Liquid Glass ↗</a><a href="https://launcher.lucaperullo.it/">Simple Liquid Launcher ↗</a></div></div></section>
    <nav className="journey-dock text-dock" aria-label="Experience chapters"><span id="text-dock-backdrop" aria-hidden="true" style={{position:'absolute',inset:0,borderRadius:40,background:'linear-gradient(120deg,#304a40,#17241f)'}}/><StudioGlass backdropSelector="#text-dock-backdrop" radius={40} blur={5} background="rgba(18,25,22,.3)"><div className="journey-dock-inner"><a href="#type-flow">Type</a><a href="#listen">Feel</a><a href="#studio">Make</a></div></StudioGlass></nav>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
