import React, { useState } from 'react';
import {createRoot} from 'react-dom/client';
import {LiquidGlass} from '../../src';
function App(){
 const [angle,setAngle]=useState(0),[off,setOff]=useState(false);
 return <><button onClick={()=>setAngle(90)}>Rotate</button><button onClick={()=>setOff(true)}>Stop</button>
 <LiquidGlass data-testid="default" quality="high" style={{width:200,height:100}}>Default</LiquidGlass>
 <LiquidGlass data-testid="legacy" quality="high" angle={angle} lens="convex" lensStrength={.8} lensCenter={[.4,.6]} liquid="ripple" liquidScale={5} liquidSpeed={1} effectMode={off?'off':'svg'} style={{width:200,height:100}}>4.1 controls</LiquidGlass></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
