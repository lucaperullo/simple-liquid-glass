import { useEffect, useState, type RefObject } from 'react';
import { joinGlassCrowd } from './webgl/crowd';

/** Whether this panel belongs to a crowd that renders through the shared WebGL scene. */
export function useGlassCrowd(panel: RefObject<HTMLElement | null>, enabled: boolean, backdrop: () => HTMLElement | null | undefined): boolean {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    const element = panel.current;
    const leave = enabled && element ? joinGlassCrowd(element, backdrop(), setWebgl) : undefined;
    if (!leave) setWebgl(false);
    return leave;
  }, [enabled, panel, backdrop]);
  return enabled && webgl;
}
