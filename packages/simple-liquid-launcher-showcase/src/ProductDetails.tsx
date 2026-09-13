import {useState} from 'react';
import {ArrowUpRight,Grid2X2,Palette,SlidersHorizontal} from 'lucide-react';
import './product-details.css';
import PhoneHero from './PhoneHero';
const details=[
 {id:'home',name:'Your space',Icon:Grid2X2,title:'Everything, where you want it.',text:'Your apps, your folders, your favorite little shortcuts. Arrange your home screen around the way you move through the day.',label:'Apps, folders & your everyday favorites'},
 {id:'wallpapers',name:'Your atmosphere',Icon:Palette,title:'Change the view. Keep the feeling.',text:'Start with a bundled wallpaper or bring your own photo. Tune the glass intensity until the view feels like yours.',label:'Wallpapers & glass intensity'},
 {id:'options',name:'Your rhythm',Icon:SlidersHorizontal,title:'The essentials. Within reach.',text:'Hold Search for wallpapers, language settings and a gesture guide. The controls you need, tucked away until you need them.',label:'Launcher settings & gestures'},
];
export default function ProductDetails(){
 const [selected,setSelected]=useState(0);
 return <section className="everyday-section" aria-labelledby="android-heading">
  <div className="everyday-heading"><span className="everyday-eyebrow">AT HOME ON ANDROID</span><h2 id="android-heading">Make room<br/>for <em>your world.</em></h2><p>A home screen is a personal thing.<br/>Make this one feel like you.</p></div>
  <div className="everyday-experience">
   <div className="everyday-controls"><div className="everyday-tabs" role="tablist" aria-label="Explore the Android launcher">{details.map(({id,name,Icon},i)=><button key={id} id={`tab-${id}`} role="tab" aria-selected={selected===i} aria-controls={`panel-${id}`} tabIndex={selected===i?0:-1} onClick={()=>setSelected(i)} onKeyDown={e=>{if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?details.length-1:(i+(e.key==='ArrowDown'||e.key==='ArrowRight'?1:details.length-1))%details.length;setSelected(next);document.getElementById(`tab-${details[next].id}`)?.focus()}}}><Icon size={20} strokeWidth={1.3}/><span>{name}</span><ArrowUpRight size={17}/></button>)}</div>
    <div className="everyday-description" key={details[selected].id}><h3>{details[selected].title}</h3><p>{details[selected].text}</p></div>
    <a className="everyday-download" href="#download">Find your new home <ArrowUpRight size={18}/></a>
   </div>
   <div className="everyday-stage"><div className="everyday-orbit" aria-hidden="true"/><span className="everyday-stage-label">LIVE LIQUID GLASS</span><div id={`panel-${details[selected].id}`} role="tabpanel" aria-labelledby={`tab-${details[selected].id}`}><PhoneHero variant="details" mode={details[selected].id as 'home'|'wallpapers'|'options'}/></div><span className="everyday-authentic">Interactive web recreation · Native app available for Android 13+</span></div>
  </div>
 </section>
}
