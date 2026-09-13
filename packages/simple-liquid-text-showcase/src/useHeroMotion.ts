import {useEffect} from 'react';
import type {RefObject} from 'react';

/** Native scrolling; update the three hero transforms only when scroll changes. */
export function useHeroMotion(root:RefObject<HTMLElement|null>){
 useEffect(()=>{
  const section=root.current!;
  const title=section.querySelector<HTMLElement>('.journey-wordmark')!;
  const heading=title.querySelector('h1')!;
  const film=section.querySelector<HTMLElement>('.scene-media')!;
  const portal=section.querySelector<HTMLElement>('.journey-portal')!;
  const caption=section.querySelector<HTMLElement>('.journey-hero-bottom')!;
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const desktop=matchMedia('(min-width: 1001px)');
  const nativeScroll=CSS.supports('animation-timeline: view()');
  section.dataset.nativeScroll=String(nativeScroll);
  let frame=0,previous=-1;
  let entrance:Animation|undefined;
  let revealed=false;
  const update=()=>{
   frame=0;
   if(nativeScroll)return;
   const box=section.getBoundingClientRect();
   const progress=preference.matches||!desktop.matches?0:Math.max(0,Math.min(1,-box.top/Math.max(1,box.height-innerHeight)));
   if(progress===previous)return;
   previous=progress;
   title.style.transform=`translateY(${-24*progress}%)`;
   caption.style.transform=`translateY(${55*progress}px)`;
   caption.style.opacity=String(1-progress);
   film.style.transform=`scale(${1+.1*progress})`;
   portal.style.transform=`translateY(${-35*progress}px) scale(${1+.65*progress})`;
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const motion=()=>{
   if(preference.matches)entrance?.cancel();
   if(!preference.matches && !revealed && heading.querySelector('[data-ready="true"]')){revealed=true;entrance=heading.animate([{transform:'translateY(65%)'},{transform:'translateY(0)'}],{duration:1250,easing:'cubic-bezier(.16,1,.3,1)'});}
   previous=-1;schedule();
  };
  const readiness=new MutationObserver(()=>{if(heading.querySelector('[data-ready="true"]')){motion();readiness.disconnect();}});
  readiness.observe(heading,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ready']});
  motion();
  if(!nativeScroll)window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);
  preference.addEventListener('change',motion);
  desktop.addEventListener('change',schedule);
  return()=>{readiness.disconnect();entrance?.cancel();cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);preference.removeEventListener('change',motion);desktop.removeEventListener('change',schedule);};
 },[root]);
}
