/**
 * Window controls always keep the close action at the outer window edge.
 *
 * Right-side controls: minimize -> fullscreen -> close, in both styles.
 * Left-side (mirrored) controls: icons reverse to close -> fullscreen -> minimize,
 * while traffic lights keep the native macOS close -> minimize -> fullscreen.
 */
export const WINDOW_CONTROL_ORDER = Object.freeze(["minimize", "fullscreen", "close"]);
const TRAFFIC_LIGHT_ORDER = Object.freeze(["close", "minimize", "fullscreen"]);

export function getWindowControlOrder(mirrored = false, variant = "icons") {
  if (!mirrored) return [...WINDOW_CONTROL_ORDER];
  return variant === "traffic"
    ? [...TRAFFIC_LIGHT_ORDER]
    : [...WINDOW_CONTROL_ORDER].reverse();
}
