import {useLayoutEffect} from 'react';
import gsap from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
gsap.registerPlugin(ScrollTrigger);

export function useCapsuleMotion(){
 useLayoutEffect(()=>{
  const media=gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)',()=>{
   const lenis=new Lenis({lerp:.085,smoothWheel:true,anchors:true});
   const tick=(time:number)=>lenis.raf(time*1000);
   lenis.on('scroll',ScrollTrigger.update);gsap.ticker.add(tick);
   const intro=gsap.timeline({defaults:{ease:'power4.out'}});
   intro.from('.cinema-heading .line>span',{yPercent:110,duration:1.35,stagger:.12},.1)
    .from('.cinema-intro',{y:20,opacity:0,duration:1},.45)
    .from('.cinema-bottom',{y:20,duration:1},.45);
   gsap.to('.cinema-art',{scale:1.12,yPercent:8,ease:'none',scrollTrigger:{trigger:'.cinema-hero',start:'top top',end:'bottom top',scrub:1}});
   gsap.to('.cinema-heading',{yPercent:-18,ease:'none',scrollTrigger:{trigger:'.cinema-hero',start:'top top',end:'bottom top',scrub:1}});
   const timeline=gsap.timeline({scrollTrigger:{trigger:'.glass-journey',start:'top top',end:'bottom bottom',scrub:.8,invalidateOnRefresh:true}});
   timeline.to('.journey-word',{xPercent:-25,ease:'none',duration:1},0)
    .fromTo('.phone-variant-journey',{xPercent:()=>innerWidth<700?0:30,scale:.86},{xPercent:()=>innerWidth<700?0:-32,scale:1.03,duration:1,ease:'power1.inOut'},0)
    .to('.journey-copy-intro',{y:-35,opacity:0,duration:.25},.15)
    .fromTo('.journey-copy-outro',{y:35,opacity:0},{y:0,opacity:1,duration:.3},.6);
   for(const el of document.querySelectorAll('.material-intro h2,.everyday-heading h2,.wallpaper-heading h2,.family h2')){
    gsap.from(el,{y:70,opacity:.1,duration:1.1,ease:'power4.out',scrollTrigger:{trigger:el,start:'top 88%',toggleActions:'play none none reverse'}});
   }
   gsap.utils.toArray<HTMLElement>('.wallpaper-gallery figure').forEach(card=>{
    gsap.fromTo(card.querySelector('img'),{scale:1.13},{scale:1,ease:'none',scrollTrigger:{trigger:card,start:'top bottom',end:'bottom top',scrub:1}});
   });
   let active=true;void document.fonts.ready.then(()=>{if(active)ScrollTrigger.refresh()});
   return()=>{active=false;gsap.ticker.remove(tick);lenis.destroy()};
  });
  return()=>media.revert();
 },[]);
}
