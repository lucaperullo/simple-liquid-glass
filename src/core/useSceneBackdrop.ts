import {useEffect,useRef,useState,useCallback,type RefObject} from 'react';
import {findScene,SCENE_CHANGE,type SceneBinding,type SceneController} from './sceneRegistry';

/** Connect any renderer to its closest scene. Explicit sources should disable this binding. */
export function useSceneBackdrop(panel:RefObject<HTMLElement|null>,enabled=true){
 const backdropRef=useRef<HTMLCanvasElement|null>(null);
 const binding=useRef<SceneBinding|null>(null);
 const [state,setState]=useState({connected:false,ready:false});
 useEffect(()=>{
  if(!enabled){setState(previous=>previous.connected||previous.ready?{connected:false,ready:false}:previous);return}
  const element=panel.current;if(!element)return;
  let scene:SceneController|undefined,live=true;
  const connect=()=>{
   const next=findScene(element);if(next===scene)return;
   binding.current?.release();binding.current=null;backdropRef.current=null;scene=next;
   setState({connected:!!next,ready:false});
   if(next){const acquired=next.register(element,ready=>{if(live&&scene===next)setState({connected:true,ready})});binding.current=acquired;backdropRef.current=acquired.canvas}
  };
  const changed=(event:Event)=>{if(event.target instanceof Node&&event.target.contains(element))connect()};
  element.ownerDocument.addEventListener(SCENE_CHANGE,changed);connect();
  return()=>{live=false;element.ownerDocument.removeEventListener(SCENE_CHANGE,changed);binding.current?.release();binding.current=null;backdropRef.current=null};
 },[enabled,panel]);
 const refresh=useCallback(()=>binding.current?.refresh(),[]);
 return {...state,backdropRef,refresh};
}
