import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Play,Pause,Volume2} from 'lucide-react';
import {LiquidGlassText} from 'simple-liquid-text';
import 'simple-liquid-text/styles.css';
import Glass from './Glass';

export default function FamilyPreviews(){
 const root=useRef<HTMLDivElement>(null),audio=useRef<HTMLAudioElement>(null);
 const [nearby,setNearby]=useState(false),[fontReady,setFontReady]=useState(false),[playing,setPlaying]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
 useEffect(()=>{
  const preload=new IntersectionObserver(([e])=>{if(e.isIntersecting){setNearby(true);preload.disconnect()}},{rootMargin:'500px'});preload.observe(root.current!);
  const visibility=new IntersectionObserver(([e])=>{if(!e.isIntersecting)audio.current?.pause()});visibility.observe(root.current!);
  return()=>{preload.disconnect();visibility.disconnect()};
 },[]);
 useEffect(()=>{if(!nearby)return;let active=true;void document.fonts.ready.then(()=>{if(active)setFontReady(true)});return()=>{active=false}},[nearby]);
 async function toggle(){if(!audio.current)return;if(playing){audio.current.pause();return}setError('');try{await audio.current.play()}catch{setError('Audio could not load. Try again.')}}
 return <div className="family-previews" ref={root}>
  <article className="family-preview"><div className="family-scene family-glass-scene"><img className="family-scenery" src="/media/family-coast.jpg" alt="Turquoise water along the coast" loading="lazy"/><span className="family-scene-label">A LIVING MATERIAL FOR THE WEB</span><div className="family-player-position">{nearby&&<Glass backdropSelector=".family-glass-scene > .family-scenery" className="family-player" radius={32}><div className="family-player-content"><div className="family-track"><img src="/media/family-coast.jpg" alt="" width="52" height="52"/><div><span>THE LISTENING ROOM</span><h3>Slow Sun</h3><p>A moment by the water.</p></div><Volume2 size={19}/></div><div className="family-player-controls"><button onClick={toggle} aria-label={playing?'Pause family music preview':'Play family music preview'}>{playing?<Pause size={22}/>:<Play size={22}/>}</button><div className="family-progress" role="progressbar" aria-label="Music playback" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{transform:`scaleX(${progress/100})`}}/></div></div><span className="family-player-error" role="status">{error}</span></div></Glass>}</div><span className="family-scene-note">PRESS PLAY. STAY A WHILE.</span></div><a className="family-preview-link" href="https://glass.lucaperullo.it/"><div><span>01 / THE INTERFACE</span><h3>Simple Liquid Glass</h3><p>Real refraction. Components you can touch.</p></div><ArrowUpRight size={30}/></a></article>
  <article className="family-preview"><div className="family-scene family-text-scene"><img className="family-scenery" src="/media/family-dunes.jpg" alt="Rose-colored dunes shaped by wind" loading="lazy"/><span className="family-scene-label">A LENS IN EVERY LETTER</span><div className="family-liquid-type">{fontReady?<LiquidGlassText renderer="auto" backdropSelector=".family-text-scene > .family-scenery" refraction={88} borderWidth={.3} borderColor="rgba(255,255,255,.5)" fillColor="rgba(255,255,255,.06)" shadow="0 2px 8px rgba(0,0,0,.15)">Stay fluid.</LiquidGlassText>:<span className="family-type-pending">Stay fluid.</span>}</div><span className="family-scene-note">YOUR FONT. A DIFFERENT FEELING.</span></div><a className="family-preview-link" href="https://text.lucaperullo.it/"><div><span>02 / THE LETTERFORM</span><h3>Simple Liquid Text</h3><p>Your words, shaped from the same material.</p></div><ArrowUpRight size={30}/></a></article>
  <audio ref={audio} src="/media/family-slow-sun.mp3" preload="none" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onTimeUpdate={()=>{const a=audio.current;if(a)setProgress(a.duration?100*a.currentTime/a.duration:0)}}/>
 </div>;
}
