import React,{useLayoutEffect,useRef,useState,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import LiquidGlass from '../../dist/index.esm.js';
import {LiquidGlassScene} from '../../dist/backdrop.esm.js';
import {LiquidGlassText} from '../../packages/simple-liquid-glass-font/dist/index.js';
import '../../packages/simple-liquid-glass-font/dist/styles.css';
const scenario=new URLSearchParams(location.search).get('scenario')??'media';
function App(){
 const [show,setShow]=useState(true),[background,setBackground]=useState(scenario==='dynamic'?'transparent':'#e54767'),source=useRef<HTMLCanvasElement>(null);
 useLayoutEffect(()=>{(window as any).setSceneVisible=setShow;(window as any).setSceneBackground=setBackground;(window as any).paintScene=(color:string)=>{const c=source.current;if(c){const ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height)}};(window as any).paintScene('#3285d3')},[]);
 return <LiquidGlassScene id="scene" fontEmbedCSS="" style={{background,minHeight:1000}}>
  {(scenario==='media'||scenario==='text'||scenario==='explicit'||scenario==='dynamic')?<canvas ref={source} className="source" width={390} height={950}/>:scenario==='flow'?<section className="content"><div style={{height:350}}>Before glass</div>{show&&<LiquidGlass renderer="webgl" style={{height:120,width:220}}>In-flow glass</LiquidGlass>}<div className="flow-label">AFTER GLASS<br/>Layout stays put</div></section>:<><span>Prefix </span>Direct scene text<div style={{height:700}}/></>}
  {show&&scenario==='text'&&<LiquidGlassText id="scene-text" renderer="webgl" style={{position:'fixed',top:220,left:25,fontSize:64}}>GLASS</LiquidGlassText>}
  {show&&scenario==='explicit'&&<LiquidGlass id="explicit-glass" renderer="webgl" backdropRef={source} style={{position:'fixed',top:220,left:25,width:160,height:90}}>Explicit source</LiquidGlass>}
  {show&&<><LiquidGlass id="scene-dock" className="dock" renderer="webgl">Dock</LiquidGlass><LiquidGlass id="scene-upper" className="upper" renderer="webgl">Upper</LiquidGlass></>}
 </LiquidGlassScene>;
}
createRoot(document.querySelector('#app')!).render(<StrictMode><App/></StrictMode>);
