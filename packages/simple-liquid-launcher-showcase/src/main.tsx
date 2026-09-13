import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowDown,ArrowUpRight,Download,Menu,X} from 'lucide-react';
import './style.css';
import './redesign.css';
import './capsule.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import {useCapsuleMotion} from './useCapsuleMotion';
import './glass-journey.css';
import Glass from './Glass';
import FamilyPreviews from './FamilyPreviews';
import './family-previews.css';
import ProductDetails from './ProductDetails';
import './editorial.css';
import PhoneHero from './PhoneHero';

const release={version:'0.8.0',apk:'/releases/simple-liquid-glass-launcher-0.8.0.apk',size:'8.3 MB'};
function DownloadLink({className='button'}:{className?:string}){return <a className={className} href={release.apk} download><Download size={18}/><span>Download for Android</span><ArrowUpRight size={18}/></a>}
function App(){
 useCapsuleMotion();
 const [menu,setMenu]=useState(false);
 return <><a className="skip" href="#experience">Skip to the launcher</a><main>
  <section className="cinema-hero" id="top" aria-label="Simple Liquid Launcher">
   <img className="cinema-art" src="/media/web-cobalt.webp" alt="" fetchPriority="high"/>
   <div className="cinema-shade"/>
   <header className="header"><a className="brand" href="#top"><img src="/favicon.svg" width="32" height="32" alt=""/><strong>simple</strong><span>liquid launcher</span></a><button className="menu" aria-label={menu?'Close menu':'Open menu'} aria-expanded={menu} aria-controls="navigation" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button><nav id="navigation" className={menu?'links open':'links'} aria-label="Main navigation" onClick={()=>setMenu(false)}><a href="#experience">The experience</a><a href="#wallpapers">Wallpapers</a><a href="#family">The family</a><a href="#download">Get the launcher <ArrowUpRight size={15}/></a></nav></header>
   <div className="cinema-intro"><span>THE OFFICIAL ANDROID LAUNCHER</span><span>0.8.0 / PUBLIC PREVIEW</span></div>
   <h1 className="cinema-heading"><span className="line"><span>Your world.</span></span><span className="line"><span>In a new light<span className="hero-period">.</span></span></span></h1>
   <PhoneHero/>
   <div className="cinema-bottom"><p>A native Android home screen.<br/>Shaped by light. Arranged by you.</p><Glass backdropSelector=".cinema-art" className="hero-glass-cta" radius={60}><a href="#live-experience" className="cinema-explore"><span>Step inside</span><ArrowDown size={24}/></a></Glass><a href={release.apk} download className="cinema-download">Download for Android <ArrowUpRight size={18}/></a></div>
  </section>
  <section className="glass-journey" id="live-experience" aria-label="A closer look at liquid glass">
   <div className="glass-journey-sticky"><div className="journey-kicker"><span>FAMILIAR. UNTIL THE LIGHT MOVES.</span><span>SCROLL TO EXPLORE ↓</span></div><div className="journey-word" aria-hidden="true">Fluid.</div><div className="journey-copy journey-copy-intro"><h2>A different<br/>kind of home.</h2><p>A little depth. A little light.<br/>Everything you reach for, reimagined.</p></div><PhoneHero variant="journey"/><div className="journey-copy journey-copy-outro"><span>THE MATERIAL IS ALIVE</span><h2>Watch the light<br/><em>change its mind.</em></h2><p>Apps glide across the wallpaper.<br/>Glass bends the view as they move.</p><a href="#experience">Make it your own <ArrowDown size={17}/></a></div><div className="journey-footnote"><span>REAL REFRACTION · iOS WEBGL SUPPORT</span><span>BUILT WITH SIMPLE LIQUID GLASS</span></div></div>
  </section>
  <section id="experience" className="material-intro section"><div className="section-label"><span>FROM A MATERIAL STUDY TO YOUR HOME SCREEN.</span><span>MADE TO BE TOUCHED.</span></div><h2>Less on the surface.<br/><em>More beneath it.</em></h2><div className="material-bottom"><p>Glass that bends the view, rather than hiding it. Familiar gestures, without the clutter. A home screen with room for your own rhythm.<br/><br/>Explore the material above. Take the native Android experience with you below.</p><div><DownloadLink/><span className="release">Android 13+ · 0.8.0 preview · 8.3 MB</span></div></div></section>
  <ProductDetails/>
  <section id="wallpapers" className="wallpapers section"><div className="section-label"><span>ARTWORK, GIVEN ROOM TO BREATHE.</span><span>THE WEB STUDIES</span></div><div className="wallpaper-heading"><h2>A wider<br/><em>point of view.</em></h2><p>Landscape studies created for this web experience.<br/>The app includes portrait wallpapers and ten procedural presets.</p></div><div className="wallpaper-gallery">{[{id:'cobalt',name:'Cobalt',note:'Light, in motion.'},{id:'copper-satin',name:'Copper Satin',note:'A warmer kind of fluid.'},{id:'alpine',name:'Alpine',note:'A little room to breathe.'}].map(w=><figure key={w.id}><img src={`/media/web-${w.id}.webp`} alt={`${w.name} landscape artwork for the web showcase`} loading="lazy" width="1672" height="941"/><figcaption><span>{w.name}</span><span>{w.note}</span></figcaption></figure>)}</div></section>
  <section id="download" className="download-section section" style={{isolation:'isolate'}}><div className="download-intro"><span className="eyebrow">YOUR NEXT HOME SCREEN.</span><h2>Take the<br/><em>feeling with you.</em></h2><DownloadLink/><p className="download-meta">Version {release.version} · Android 13 or newer · {release.size}</p><p className="preview-note">This is a development-signed preview, available as a direct APK download. It replaces your home screen, not Android’s lock screen or system interface.</p><a className="checksum" href="/releases/SHA256SUMS.txt">Download checksum <ArrowUpRight size={14}/></a></div><div id="install-backdrop" aria-hidden="true" style={{position:'absolute',inset:0,background:'#cfdbc2',zIndex:-1}}/><Glass backdropSelector="#install-backdrop" className="install-glass" radius={32}><div className="install"><h3>A few steps. A new view.</h3><ol><li><span>↓</span><div><h4>Download and install.</h4><p>Open the APK on your Android phone. If prompted, allow your browser to install this app.</p></div></li><li><span>⌂</span><div><h4>Choose your new Home.</h4><p>In Android’s default Home app settings, select <strong>Liquid Glass</strong> — that’s the app’s name on your phone.</p></div></li><li><span>✦</span><div><h4>Make it yours.</h4><p>Long-press an empty space to arrange Home. Hold Search for wallpapers and launcher options.</p></div></li></ol><p className="install-footnote">You can switch back to your previous launcher in Android’s default Home settings at any time.</p></div></Glass><div className="download-facts"><span>No account. No internet permission.</span><span>No root or bootloader unlock.</span><span>English · Italiano · Español</span></div><details className="release-notes"><summary>What to know about this preview <ArrowDown size={16}/></summary><p>Tested on an Android 16 emulator. Physical-device performance, including Samsung gesture transitions, still needs validation. Work/private profiles, notification badges and widget resizing are not yet implemented. The layout is designed for portrait use.</p></details></section>
  <section id="family" className="family section"><div className="section-label"><span>ONE FAMILY. DIFFERENT SURFACES.</span><span>KEEP EXPLORING</span></div><h2>One material.<br/><em>Three perspectives.</em></h2><FamilyPreviews/></section>
 </main><footer><a className="brand" href="#top"><img src="/favicon.svg" width="30" height="30" alt=""/><strong>simple</strong><span>liquid launcher</span></a><span>OFFICIAL ANDROID PREVIEW · {release.version}</span><a href="/media/credits.txt">Media credits <ArrowUpRight size={14}/></a><a href="#top">Back to top ↑</a></footer></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
