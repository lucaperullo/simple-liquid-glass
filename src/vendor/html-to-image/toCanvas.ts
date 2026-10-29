import type {StyledCloneCache} from './cloneCache'
import type {SvgRasterCache} from './SvgRasterCache'
// Adapted from html-to-image 1.11.11 (MIT); see THIRD_PARTY_NOTICES.md.
import { Options } from 'html-to-image/es/types'
import { cloneStyledNode } from './clone-node'
import {embedImages,embedBackground} from './embed-images'
import { applyStyle } from 'html-to-image/es/apply-style'
import { embedWebFonts } from 'html-to-image/es/embed-webfonts'
import {
  getImageSize,
  getPixelRatio,
  createImage,
  nodeToDataURL,
  checkCanvasDimensions,
} from 'html-to-image/es/util'

async function prepare<T extends HTMLElement>(
  node: T,
  options: Options = {},
  cache?: StyledCloneCache,
  reuse=false,
) {
  const { width, height } = getImageSize(node, options)
  const clonedNode = (await cloneStyledNode(node, options,cache,reuse)) as HTMLElement
  const beforeFonts=clonedNode.firstChild;
  await embedWebFonts(clonedNode, options)
  const fontAdded=clonedNode.firstChild!==beforeFonts;
  const targets=cache?.embeddingTargets(clonedNode);
  if(targets) { for(const target of targets) await embedBackground(target,options); }
  else await embedImages(clonedNode, options)
  const frame=cache?.frame(clonedNode)??null
  cache?.resourcesReady(clonedNode,fontAdded)
  applyStyle(clonedNode, options)
  return {clonedNode,width,height,frame}
}

export async function toSvg<T extends HTMLElement>(node:T,options:Options={},cache?:StyledCloneCache,reuse=false):Promise<string>{
  const {clonedNode,width,height}=await prepare(node,options,cache,reuse)
  return nodeToDataURL(clonedNode,width,height)
}

export interface PreviousPaint {canvas?:HTMLCanvasElement;url?:string;signature?:string;unchanged?:boolean}
export async function toCanvas<T extends HTMLElement>(node:T,options:Options={},cache?:StyledCloneCache,reuse=false,raster?:SvgRasterCache,previous?:PreviousPaint):Promise<HTMLCanvasElement>{
  const {clonedNode,width,height,frame}=await prepare(node,options,cache,reuse)
  const ratio=options.pixelRatio||getPixelRatio()
  const canvasWidth=options.canvasWidth||width,canvasHeight=options.canvasHeight||height
  const makeCanvas=()=>{
    const canvas=document.createElement('canvas')
    canvas.width=canvasWidth*ratio;canvas.height=canvasHeight*ratio
    if(!options.skipAutoScale)checkCanvasDimensions(canvas)
    canvas.style.width=`${canvasWidth}`;canvas.style.height=`${canvasHeight}`
    if(options.backgroundColor){const context=canvas.getContext('2d')!;context.fillStyle=options.backgroundColor;context.fillRect(0,0,canvas.width,canvas.height)}
    return canvas
  }
  const canvas=makeCanvas()
  const signature=[canvas.width,canvas.height,options.backgroundColor??''].join(':')
  let url:string|undefined
  if(previous&&frame?.reused&&!frame.changed.length&&previous.canvas&&previous.signature===signature){
    url=await nodeToDataURL(clonedNode,width,height)
    if(url===previous.url){previous.unchanged=true;return previous.canvas}
  }
  if(previous)previous.unchanged=false
  const layered=await raster?.render(node,clonedNode,width,height,frame,canvas,makeCanvas)
  if(layered){if(previous){previous.canvas=undefined;previous.url=undefined;previous.signature=undefined}return layered}
  url??=await nodeToDataURL(clonedNode,width,height)
  const img=await createImage(url)
  canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height)
  if(previous){previous.canvas=url.length<=1024*1024?canvas:undefined;previous.url=url.length<=1024*1024?url:undefined;previous.signature=signature}
  return canvas
}

