import {useEffect,useRef,useState} from 'react'
import {Pause,Play} from 'lucide-react'
export default function MediaScene({src,poster,label,className='',id,onReady}:{src:string;poster:string;label:string;className?:string;id?:string;onReady?:()=>void}){
 const ref=useRef<HTMLVideoElement>(null)
 const [paused,setPaused]=useState(true)
 const wanted=useRef(true)
 useEffect(()=>{
  const video=ref.current!;const media=matchMedia('(prefers-reduced-motion: reduce)');wanted.current=!media.matches
  const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting&&wanted.current)void video.play().catch(()=>setPaused(true));else video.pause()},{threshold:.15});observer.observe(video)
  const change=()=>{wanted.current=!media.matches;if(media.matches)video.pause()};media.addEventListener('change',change)
  return()=>{observer.disconnect();media.removeEventListener('change',change)}
 },[])
 return <>{id&&<img id={`${id}-poster`} className={`scene-media ${className}`} src={poster} alt="" aria-hidden="true"/>}<video id={id} ref={ref} className={`scene-media ${className}`} src={src} poster={poster} muted loop playsInline preload="none" onLoadedData={onReady} aria-label={label} onPlay={()=>setPaused(false)} onPause={()=>setPaused(true)}/><button className="media-toggle" aria-label={paused?`Play ${label}`:`Pause ${label}`} onClick={()=>{const video=ref.current!;wanted.current=video.paused;if(video.paused)void video.play().catch(()=>setPaused(true));else video.pause()}}>{paused?<Play size={14}/>:<Pause size={14}/>}</button></>
}
