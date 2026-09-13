import {useEffect,useRef,useState} from 'react';
import PreparedLiquidText from './components/PreparedLiquidText';
import {textMaterial,typefaces} from './typography';

export default function TypeInMotion(){
 const root=useRef<HTMLElement>(null);
 const [index,setIndex]=useState(0);
 const [visible,setVisible]=useState(false);
 const [paused,setPaused]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const font=typefaces[index];
 useEffect(()=>{
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));observer.observe(root.current!);
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const change=()=>setPaused(preference.matches);preference.addEventListener('change',change);
  return()=>{observer.disconnect();preference.removeEventListener('change',change);};
 },[]);
 return <section ref={root} id="type-flow" className="type-flow font-study" aria-label="Font study" data-paused={paused||!visible}>
  <img className="type-flow-background" src="/media/dunes.jpg" alt="" loading="lazy"/>
  <div className="type-flow-heading"><div><span className="journey-eyebrow">ONE MATERIAL. EVERY LETTERFORM.</span><h2>Find your character.</h2></div><div className="font-tabs" role="group" aria-label="Choose a typeface">{typefaces.map((item,i)=><button key={item.name} aria-pressed={i===index} onClick={()=>setIndex(i)}>{item.name}</button>)}</div></div>
  <div className="font-specimen" style={{fontFamily:font.family,fontWeight:font.weight,fontStyle:font.style}}><div className="single-loop">{<PreparedLiquidText backdropSelector="#type-flow > .type-flow-background" key={font.name} {...textMaterial}>Stay fluid. Keep moving.</PreparedLiquidText>}</div></div>
  <div className="type-flow-caption"><button className="loop-toggle" aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?'Resume text motion':'Pause text motion'}</button><span>{font.name.toUpperCase()}</span><a href="#studio">Make it yours ↗</a></div>
 </section>;
}
