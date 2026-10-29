import { sharedValue } from '../shared';
interface Entry { image: HTMLImageElement; users: number }
const images = sharedValue('mapImages.v1', () => new Map<string, Entry>());
/** Concurrent surfaces with the same map share its decoded image and GPU upload. */
export function acquireMapImage(uri: string) {
  let entry = images.get(uri);
  if (!entry) {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = uri;
    entry = { image, users: 0 }; images.set(uri, entry);
  }
  entry.users++;
  const owned = entry;
  let released = false;
  return { image: owned.image, release() {
    if (released) return;
    released = true;
    if (!--owned.users && images.get(uri) === owned) images.delete(uri);
  } };
}
