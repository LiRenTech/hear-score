export const BASE_PIXELS_PER_SECOND = 48;
export const MAX_ZOOM = 3;
export const KEYBOARD_WIDTH = 45;

export function minimumZoom(viewportWidth: number, duration: number) {
  return Math.min(1, Math.max(1, viewportWidth - KEYBOARD_WIDTH) /
    (Math.max(1, duration || 16) * BASE_PIXELS_PER_SECOND));
}

// Keep adjacent grid lines at least 40px apart, even in a full-track view.
export function timelineStep(scale: number) {
  const target = Math.max(1, 40 / scale);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= target)!;
}

export function zoomedScrollLeft(scrollLeft: number, pointerX: number, oldZoom: number, newZoom: number) {
  return Math.max(0, (scrollLeft + pointerX) * newZoom / oldZoom - pointerX);
}
