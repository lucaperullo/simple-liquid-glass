import {useRef, useState} from 'react'
import {Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Heart} from 'lucide-react'
import StudioGlass from './StudioGlass'

const tracks = [
  {title:'Blue hour',subtitle:'Coastal studies',src:'/media/blue-hour.mp3',cover:'/media/coast.jpg'},
  {title:'Slow sun',subtitle:'Desert studies',src:'/media/slow-sun.mp3',cover:'/media/dunes.jpg'},
]
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`
export default function GlassMusicPlayer(){
 const audio=useRef<HTMLAudioElement>(null),resumeOnLoad=useRef(false)
 const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(.65),[liked,setLiked]=useState<number[]>([]),[error,setError]=useState('')
 const track=tracks[index]
 const play=async()=>{try{await audio.current?.play();setError('')}catch{setError('Playback could not start. Tap play to retry.')}}
 const changeTrack=(direction:number,resume=playing)=>{resumeOnLoad.current=resume;setIndex(i=>(i+direction+tracks.length)%tracks.length);setTime(0);setDuration(0);setError('')}

 return <div className="music-widget"><StudioGlass backdropSelector="#listen > video.scene-media" radius={32}><div className="music-inner">
  <audio ref={audio} src={track.src} preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onLoadedMetadata={e=>{setDuration(e.currentTarget.duration);e.currentTarget.volume=volume;if(resumeOnLoad.current){resumeOnLoad.current=false;void play()}}} onEnded={()=>changeTrack(1,true)} onError={()=>setError('Audio unavailable. Please retry.')} />
  <div className="widget-eyebrow"><span className="tiny-dot"/> THE LISTENING ROOM <span>AMBIENT STUDIES</span></div>
  <div className="music-track"><img src={track.cover} alt=""/><div><h3>{track.title}</h3><p>{track.subtitle}</p></div><button aria-label="Save track" aria-pressed={liked.includes(index)} onClick={()=>setLiked(v=>v.includes(index)?v.filter(i=>i!==index):[...v,index])}><Heart size={19} fill={liked.includes(index)?'currentColor':'none'}/></button></div>
  <label className="music-seek"><span className="sr-only">Seek track</span><input aria-label="Seek track" type="range" min={0} max={duration||32} step={.1} value={time} disabled={!duration} onChange={e=>{if(audio.current){audio.current.currentTime=+e.target.value;setTime(+e.target.value)}}}/><span><output>{clock(time)}</output><output>{clock(duration)}</output></span></label>
  <div className="music-controls"><button aria-label="Previous track" onClick={()=>changeTrack(-1)}><SkipBack size={21}/></button><button className="music-play" aria-label={playing?'Pause music':'Play music'} onClick={()=>playing?audio.current?.pause():void play()}>{playing?<Pause size={24} fill="currentColor"/>:<Play size={24} fill="currentColor"/>}</button><button aria-label="Next track" onClick={()=>changeTrack(1)}><SkipForward size={21}/></button></div>
  <div className="music-volume"><button aria-label={volume?'Mute music':'Unmute music'} onClick={()=>{const v=volume?0:.65;setVolume(v);if(audio.current)audio.current.volume=v}}>{volume?<Volume2 size={17}/>:<VolumeX size={17}/>}</button><input aria-label="Music volume" type="range" min={0} max={1} step={.01} value={volume} onChange={e=>{setVolume(+e.target.value);if(audio.current)audio.current.volume=+e.target.value}}/><span>ORIGINAL AMBIENT</span></div>
  {error&&<p role="status">{error}</p>}
 </div></StudioGlass></div>
}
