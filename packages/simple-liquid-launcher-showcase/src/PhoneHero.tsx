import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CSS3DObject,CSS3DRenderer} from 'three/addons/renderers/CSS3DRenderer.js';
import {Camera,Phone,MessageCircle,Globe,CloudSun,Wifi,BatteryFull,Search,Pause,Play} from 'lucide-react';
import Glass from './Glass';
import {launcherApps} from './launcherApps';
import './phone-hero.css';

export default function PhoneHero({variant='hero',mode='home'}:{variant?:'hero'|'journey'|'details';mode?:'home'|'wallpapers'|'options'}){
 const [wallpaper,setWallpaper]=useState('cobalt');
 const backdrop=useRef<HTMLDivElement>(null);
 const progress=useRef(0);
 const host=useRef<HTMLDivElement>(null),screen=useRef<HTMLDivElement>(null);
 const [ready,setReady]=useState(false),[fallback,setFallback]=useState(false),[page,setPage]=useState(0),[paused,setPaused]=useState(false),[visible,setVisible]=useState(true);
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const motion=useRef({paused,visible,reduced});motion.current={paused,visible,reduced};
 useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(q.matches);q.addEventListener('change',change);return()=>q.removeEventListener('change',change)},[]);
 useEffect(()=>{const io=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.05});io.observe(host.current!);return()=>io.disconnect()},[]);
 useEffect(()=>{if(paused||!visible||reduced||variant!=='hero')return;const timer=setInterval(()=>{if(!document.hidden)setPage(p=>1-p)},4200);return()=>clearInterval(timer)},[paused,visible,reduced,variant]);
 useEffect(()=>{if(variant!=='journey')return;const update=()=>{const section=host.current?.closest('.glass-journey');if(section){const rect=section.getBoundingClientRect();progress.current=Math.max(0,Math.min(1,-rect.top/(rect.height-innerHeight)))}};update();window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);return()=>{window.removeEventListener('scroll',update);window.removeEventListener('resize',update)}},[variant]);
 useEffect(()=>{
  const mount=host.current!,element=screen.current!;let disposed=false,frame=0,model:THREE.Group|undefined;
  let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'})}catch{setFallback(true);return}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.z=13;
  scene.add(new THREE.HemisphereLight(0xe8f4ff,0x33425b,3));
  for(const [x,y,z,power] of [[-5,5,7,55],[5,0,4,40]]){const light=new THREE.PointLight(0xffffff,power);light.position.set(x,y,z);scene.add(light)}
  const dom=new CSS3DRenderer();dom.domElement.className='phone-dom-layer';mount.append(renderer.domElement,dom.domElement);
  const domScene=new THREE.Scene(),glassScreen=new CSS3DObject(element);glassScreen.scale.setScalar(.01);domScene.add(glassScreen);
  const resize=()=>{const {width,height}=mount.getBoundingClientRect();renderer.setSize(width,height);dom.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix()};
  const observer=new ResizeObserver(resize);observer.observe(mount);resize();
  const disposeModel=(root:THREE.Object3D)=>root.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(m=>m.dispose())}});
  new GLTFLoader().load('/models/simple-android.glb',gltf=>{if(disposed){disposeModel(gltf.scene);return}model=gltf.scene;scene.add(model);setReady(true)},undefined,()=>setFallback(true));
  let time=0,last=0,smoothed=0;
  const render=(now:number)=>{frame=requestAnimationFrame(render);const dt=Math.min((now-last)/1000,.05);last=now;if(!motion.current.visible||document.hidden)return;
   if(!motion.current.paused&&!motion.current.reduced&&variant!=='details')time+=dt;
   smoothed+=(progress.current-smoothed)*.09;
   const turn=variant==='journey'&&!motion.current.reduced?smoothed:0;
   const rotation=new THREE.Euler(.04+Math.sin(time*.47)*.035,-.15+Math.sin(time*.36)*.09+(variant==='journey'?(.5-turn*.65):0),-.045+Math.sin(time*.3)*.018+(variant==='journey'?(.1-turn*.13):0));
   const y=motion.current.reduced?0:Math.sin(time*.7)*.11;
   if(model){model.rotation.copy(rotation);model.position.y=y}
   glassScreen.rotation.copy(rotation);glassScreen.position.set(0,0,.127).applyEuler(rotation);glassScreen.position.y+=y;
   if(variant==='journey'){const pages=element.querySelector<HTMLElement>('.phone-pages');if(pages)pages.style.transform=`translateX(-${Math.max(0,Math.min(1,(turn-.35)/.3))*50}%)`}
   renderer.render(scene,camera);dom.render(domScene,camera);
  };frame=requestAnimationFrame(render);
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();if(model)disposeModel(model);renderer.dispose();mount.append(element);renderer.domElement.remove();dom.domElement.remove()};
 },[]);
 return <div className={`hero-phone-composition phone-variant-${variant}`}>
  <div className={`hero-phone-stage ${ready?'is-ready':''} ${fallback?'phone-fallback':''}`} ref={host} aria-label="3D Android handset with live liquid glass launcher">
   <div className="phone-screen" ref={screen}>
    <div ref={backdrop} className="phone-wallpaper" style={{backgroundImage:`url(/media/web-${wallpaper}.webp)`}}/>
    <div className="phone-camera"/>
    <div className="phone-status"><span>09:41</span><span><Wifi size={12}/><BatteryFull size={16}/></span></div>
    <div className="phone-pages" hidden={mode!=='home'} style={{transform:`translateX(-${page*50}%)`}}>
     <div className="phone-page"><div className="phone-clock"><span>MONDAY, SEPTEMBER 9</span><strong>09:41</strong><p>A little more everyday.</p></div><Glass backdropRef={backdrop} backdropVersion={wallpaper} className="phone-weather" radius={20}><div><CloudSun size={28}/><span>24°<small>Mostly sunny</small></span></div></Glass><div className="phone-app-grid">{launcherApps.slice(0,4).map(({name,Icon})=><div key={name}><Glass backdropRef={backdrop} backdropVersion={wallpaper} radius={19}><span className="phone-app-icon"><Icon size={25} strokeWidth={1.4}/></span></Glass><small>{name}</small></div>)}</div></div>
     <div className="phone-page"><div className="phone-page-title"><span>ROOM FOR YOUR ROUTINE</span><h3>Your everyday.</h3></div><div className="phone-app-grid">{launcherApps.map(({name,Icon})=><div key={name}><Glass backdropRef={backdrop} backdropVersion={wallpaper} radius={19}><span className="phone-app-icon"><Icon size={25} strokeWidth={1.4}/></span></Glass><small>{name}</small></div>)}</div><div className="phone-note">A familiar home.<br/>A different feeling.</div></div>
    </div>
    {mode==='wallpapers'&&<div className="phone-settings"><span>MAKE IT YOURS</span><h3>Change the atmosphere.</h3><p>Your wallpaper. A new way to see it.</p><div className="phone-wallpaper-options">{[{id:'cobalt',name:'Cobalt'},{id:'copper-satin',name:'Copper'},{id:'alpine',name:'Alpine'}].map(w=><div key={w.id} className={wallpaper===w.id?'selected':''}><img src={`/media/web-${w.id}.webp`} alt=""/><span>{w.name}</span></div>)}</div><Glass backdropRef={backdrop} backdropVersion={wallpaper} radius={22}><div className="phone-material-note">Liquid glass<small>Light that follows your wallpaper.</small></div></Glass></div>}
    {mode==='options'&&<div className="phone-settings"><span>A LITTLE MORE YOU</span><h3>Less clutter.<br/>More control.</h3><p>Keep your essentials close.</p>{['Wallpapers & glass','Default home app','App language','Gestures'].map(label=><Glass backdropRef={backdrop} backdropVersion={wallpaper} key={label} radius={18}><div className="phone-option-row">{label}<span>↗</span></div></Glass>)}<small className="phone-settings-note">Explore the settings in the Android app.</small></div>}
    <div className="phone-pagination" aria-hidden="true"><i className={page===0?'active':''}/><i className={page===1?'active':''}/></div>
    <div className="phone-fixed-bottom"><Glass backdropRef={backdrop} backdropVersion={wallpaper} radius={25}><div className="phone-search"><Search size={14}/>Search</div></Glass><Glass backdropRef={backdrop} backdropVersion={wallpaper} radius={25}><div className="phone-dock"><Phone/><MessageCircle/><Globe/><Camera/></div></Glass></div><div className="phone-gesture"/>
   </div>
  </div>
  {variant==='details'&&mode==='wallpapers'&&<div className="phone-wallpaper-controls" role="group" aria-label="Phone wallpaper">{[{id:'cobalt',name:'Cobalt'},{id:'copper-satin',name:'Copper'},{id:'alpine',name:'Alpine'}].map(w=><button key={w.id} aria-label={`Choose ${w.name}`} aria-pressed={wallpaper===w.id} onClick={()=>setWallpaper(w.id)}>{w.name}</button>)}</div>}
  {variant==='hero'&&<div className="phone-caption"><span>LIVE GLASS · WEB PREVIEW</span><button onClick={()=>setPage(p=>1-p)} aria-label="Swipe launcher page">{page===0?'Home':'Apps'} <span>→</span></button><button onClick={()=>setPaused(p=>!p)} aria-label={paused?'Play phone animation':'Pause phone animation'}>{paused?<Play size={12}/>:<Pause size={12}/>}</button></div>}
 </div>
}
