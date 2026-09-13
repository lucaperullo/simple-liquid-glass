import {useEffect,useRef,useState} from 'react';
import {LiquidGlassText} from 'simple-liquid-text';
import type {LiquidGlassTextProps} from 'simple-liquid-text';

/** Wait for the inherited font before building its glyph maps. */
export default function PreparedLiquidText(props:LiquidGlassTextProps){
 const root=useRef<HTMLSpanElement>(null);
 const [fontReady,setFontReady]=useState(false);
 useEffect(()=>{
  let active=true;
  const style=getComputedStyle(root.current!);
  const font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  // A failed web font still has a valid system fallback to measure.
  const ready=()=>{if(active)setFontReady(true);};
  void document.fonts.load(font,props.children).then(()=>document.fonts.ready).then(ready,ready);
  return()=>{active=false;};
 },[props.children]);
 return <span ref={root} className="prepared-lens">{fontReady?<LiquidGlassText renderer="auto" {...props}/>:<span className="dormant-text">{props.children}</span>}</span>;
}
