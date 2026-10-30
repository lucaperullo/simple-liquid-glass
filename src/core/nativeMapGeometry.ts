export const NATIVE_MAP_SIZE = 512;
/**
 * SVG maps are resent to the GPU process with every frame in which the glass or its backdrop moves, so their
 * decoded size is a per-frame cost. The lens field is smooth: 0.75 map pixels per CSS pixel of the longer side
 * is visually indistinguishable from 512. WebGL uploads its map once and keeps NATIVE_MAP_SIZE.
 */
export function svgNativeMapSize(width: number, height: number) {
  return Math.max(64, Math.min(NATIVE_MAP_SIZE, Math.ceil(Math.max(width, height) * .75)));
}
/** Fixed geometry-only surround (SVG only): strength updates never regenerate the map. */
export function nativeMapSurround(width: number, height: number) {
  const size = svgNativeMapSize(width, height);
  const x = Math.ceil(16 / Math.max(1, width) * size);
  const y = Math.ceil(16 / Math.max(1, height) * size);
  return { x, y, size, left: -x / size * width, top: -y / size * height,
    width: (size + x * 2) / size * width,
    height: (size + y * 2) / size * height };
}

export function canPadNativeMap(width:number,height:number){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return false;
  const {x,y,size}=nativeMapSurround(width,height),w=size+x*2,h=size+y*2;
  return w<=2048&&h<=2048&&w*h<=2*1024*1024;
}
