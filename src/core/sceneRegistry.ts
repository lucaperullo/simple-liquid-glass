export interface SceneBinding {
  canvas: HTMLCanvasElement;
  refresh(): void;
  release(): void;
}
export interface SceneController {
  register(panel: HTMLElement, ready: (ready: boolean) => void): SceneBinding;
}
// A node-local symbol survives independently bundled core/backdrop/text entry points.
const key=Symbol.for('simple-liquid-glass.scene.v1');
type SceneNode=HTMLElement & {[key]?:SceneController};
export const SCENE_CHANGE='liquid-glass-scene-change';
export function installScene(root:HTMLElement,controller:SceneController){
 (root as SceneNode)[key]=controller;
 root.dispatchEvent(new CustomEvent(SCENE_CHANGE,{bubbles:true}));
 return()=>{if((root as SceneNode)[key]===controller){delete (root as SceneNode)[key];root.dispatchEvent(new CustomEvent(SCENE_CHANGE,{bubbles:true}))}};
}
export function findScene(panel:HTMLElement):SceneController|undefined{
 for(let node=panel.parentElement;node;node=node.parentElement){const scene=(node as SceneNode)[key];if(scene)return scene}
}
