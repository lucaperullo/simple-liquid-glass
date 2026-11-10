/**
 * What only the page thread can see, sampled for the renderer: where the page is scrolled to, and the
 * frames of a playing video.
 */
import type { BackdropFrame } from './scene';

/** The page's scroll position, or the origin where there is no page (server rendering). */
export function scrollPosition(): { x: number; y: number } {
  return typeof window === 'undefined' ? { x: 0, y: 0 } : { x: window.scrollX, y: window.scrollY };
}

/**
 * Reports the window's scroll position once now, then once per page frame for as long as it changes.
 * `time` is on the clock all threads share. Returns a function that stops it.
 */
export function watchScroll(emit: (x: number, y: number, time: number) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let sampling = false;
  let lastX = window.scrollX;
  let lastY = window.scrollY;
  let still = 0;

  const sample = (now: number): void => {
    const { x, y } = scrollPosition();
    still = x === lastX && y === lastY ? still + 1 : 0;
    lastX = x;
    lastY = y;
    emit(x, y, performance.timeOrigin + now);
    // Two samples in the same place tell the renderer the speed is zero, so it comes to rest exactly here.
    if (still < 2) requestAnimationFrame(sample);
    else sampling = false;
  };
  const onScroll = (): void => {
    if (sampling) return;
    sampling = true;
    still = 0;
    requestAnimationFrame(sample);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  emit(lastX, lastY, performance.timeOrigin + performance.now());
  return () => {
    window.removeEventListener('scroll', onScroll);
  };
}

/**
 * Hands each new frame of a playing video to `emit`, which owns it from then on. Uses the frame itself
 * (`VideoFrame`, no copy) where the browser has it and a bitmap copy otherwise. Returns a function that
 * stops it.
 */
export function watchVideo(video: HTMLVideoElement, emit: (frame: BackdropFrame) => void): () => void {
  let stopped = false;
  let copying = false;

  const capture = (): void => {
    if (typeof VideoFrame === 'function') {
      try {
        emit(new VideoFrame(video));
      } catch {
        // No decoded frame to wrap yet (the video is still loading); the next callback will have one.
      }
      return;
    }
    // One copy at a time: a slow copy drops frames instead of queueing them.
    if (copying) return;
    copying = true;
    createImageBitmap(video).then(
      (bitmap) => {
        copying = false;
        if (stopped) bitmap.close();
        else emit(bitmap);
      },
      () => {
        copying = false;
      },
    );
  };

  if ('requestVideoFrameCallback' in video) {
    const onFrame = (): void => {
      if (stopped) return;
      capture();
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  } else {
    // No per-frame callback: look once per page frame and take a frame when the video has moved on.
    const element: HTMLVideoElement = video;
    let shown = -1;
    const onPageFrame = (): void => {
      if (stopped) return;
      if (element.currentTime !== shown && element.readyState >= 2) {
        shown = element.currentTime;
        capture();
      }
      requestAnimationFrame(onPageFrame);
    };
    requestAnimationFrame(onPageFrame);
  }
  return () => {
    stopped = true;
  };
}
