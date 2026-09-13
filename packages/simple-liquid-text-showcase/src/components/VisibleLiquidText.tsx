import {useEffect,useRef,useState} from 'react';
import PreparedLiquidText from './PreparedLiquidText';
import type {LiquidGlassTextProps} from 'simple-liquid-text';

/** Keep selectable text in the layout, but prepare nearby lens maps before they enter the screen. */
export default function VisibleLiquidText(props:LiquidGlassTextProps){
 const root=useRef<HTMLSpanElement>(null);
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'500px 0px'});
  observer.observe(root.current!);
  return()=>observer.disconnect();
 },[]);
 return <span ref={root} className="visible-lens">{visible?<PreparedLiquidText {...props}/>:<span className="dormant-text">{props.children}</span>}</span>;
}
