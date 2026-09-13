// Original generic Android handset, authored for this showcase. Dimensions in scene units.
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {writeFile} from 'node:fs/promises';
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.()})}};
const phone=new T.Group();phone.name='Simple Titanium Android';
function slab(w,h,r,depth,material,z){const s=new T.Shape();const x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);const geo=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:3,curveSegments:16});const mesh=new T.Mesh(geo,material);mesh.position.z=z;phone.add(mesh);return mesh;}
const titanium=new T.MeshStandardMaterial({color:0x8d9da5,metalness:1,roughness:.27});
const dark=new T.MeshStandardMaterial({color:0x080d12,metalness:.25,roughness:.23});
slab(3.42,7.12,.39,.23,titanium,-.18).name='Titanium unibody';
slab(3.34,7.04,.37,.035,dark,.06).name='Polished screen bezel';
slab(3.3,7,.37,.02,dark,-.22).name='Back panel';
for(const [y,h] of [[1.1,.65],[2.05,.85]]){const button=new T.Mesh(new T.BoxGeometry(.055,h,.12),titanium);button.position.set(1.74,y,-.04);phone.add(button);}
const data=await new GLTFExporter().parseAsync(phone,{binary:true});await writeFile(new URL('../public/models/simple-android.glb',import.meta.url),Buffer.from(data));
