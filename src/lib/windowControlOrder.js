/**
 * Window controls always keep the close action at the outer window edge.
 * The visual style is deliberately orthogonal to action placement.
 *
 * Right-side controls: minimize -> fullscreen -> close.
 * Left-side (mirrored) controls: close -> fullscreen -> minimize.
 */
export const WINDOW_CONTROL_ORDER = Object.freeze(["minimize", "fullscreen", "close"]);

export function getWindowControlOrder(mirrored = false) {
  return mirrored ? [...WINDOW_CONTROL_ORDER].reverse() : [...WINDOW_CONTROL_ORDER];
}
