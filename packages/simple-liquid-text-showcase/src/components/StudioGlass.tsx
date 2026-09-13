import {SCENE_GLASS} from '../lib/presets'
import LiquidGlass from 'simple-liquid-glass'
import type {LiquidGlassProps} from 'simple-liquid-glass'
export default function StudioGlass(props:LiquidGlassProps){return <LiquidGlass renderer="auto" radius={28} blur={1.5} saturation={115} aberrationIntensity={.12} frost={0} background="rgba(255,255,255,.10)" mirror={false} {...props} {...SCENE_GLASS} style={{height:'auto',boxShadow:'0 24px 64px rgba(8,30,30,.24), inset 0 1px 0 rgba(255,255,255,.65)',...props.style}}/>}
