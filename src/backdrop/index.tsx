import React,{useEffect,useLayoutEffect,useRef,forwardRef,useImperativeHandle} from 'react';
import {createSceneCapture,type SceneCaptureOptions} from './capture';
import {installScene,type SceneBinding} from '../core/sceneRegistry';
export {useSceneBackdrop as useLiquidGlassBackdrop} from '../core/useSceneBackdrop';
export {createSceneCapture as createLiquidGlassBackdrop} from './capture';
export type {SceneCaptureOptions} from './capture';
export interface LiquidGlassSceneProps extends React.HTMLAttributes<HTMLDivElement>,SceneCaptureOptions {}
const useClientLayoutEffect=typeof window==='undefined'?useEffect:useLayoutEffect;
/** An optional shared HTML/media backdrop. Explicit backdrop props always take precedence. */
export const LiquidGlassScene=forwardRef<HTMLDivElement,LiquidGlassSceneProps>(function LiquidGlassScene({children,fontEmbedCSS,maxCacheBytes,onCaptureError,...props},ref){
 const root=useRef<HTMLDivElement>(null),error=useRef(onCaptureError);error.current=onCaptureError;
 useImperativeHandle(ref,()=>root.current!,[]);
 useClientLayoutEffect(()=>{
  const element=root.current;if(!element)return;
  let capture:ReturnType<typeof createSceneCapture>|undefined;
  const bindings=new Set<SceneBinding>();
  const remove=installScene(element,{register(panel,onReady){
   capture??=createSceneCapture(element,{fontEmbedCSS,maxCacheBytes,onCaptureError:(e,section)=>error.current?.(e,section)});
   const inner=capture.register(panel,onReady);
   const binding={canvas:inner.canvas,refresh:inner.refresh,release(){if(!bindings.delete(binding))return;inner.release();if(!bindings.size){capture?.destroy();capture=undefined}}};bindings.add(binding);return binding;
  }});
  return()=>{remove();for(const binding of [...bindings])binding.release();capture?.destroy()};
 },[fontEmbedCSS,maxCacheBytes]);
 return <div {...props} ref={root} data-liquid-glass-scene="">{children}</div>;
});
