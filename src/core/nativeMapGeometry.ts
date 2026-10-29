export const NATIVE_MAP_SIZE = 512;
/** Fixed geometry-only surround: strength updates never regenerate the map. */
export function nativeMapSurround(width: number, height: number) {
  const x = Math.ceil(16 / Math.max(1, width) * NATIVE_MAP_SIZE);
  const y = Math.ceil(16 / Math.max(1, height) * NATIVE_MAP_SIZE);
  return { x, y, left: -x / NATIVE_MAP_SIZE * width, top: -y / NATIVE_MAP_SIZE * height,
    width: (NATIVE_MAP_SIZE + x * 2) / NATIVE_MAP_SIZE * width,
    height: (NATIVE_MAP_SIZE + y * 2) / NATIVE_MAP_SIZE * height };
}

export function canPadNativeMap(width:number,height:number){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return false;
  const {x,y}=nativeMapSurround(width,height),w=NATIVE_MAP_SIZE+x*2,h=NATIVE_MAP_SIZE+y*2;
  return w<=2048&&h<=2048&&w*h<=2*1024*1024;
}
