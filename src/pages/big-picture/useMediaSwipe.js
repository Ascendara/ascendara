import { useRef } from "react";

// Enough wheel travel to mean it: one mouse notch, or a deliberate trackpad swipe
const WHEEL_DISTANCE = 60;
// A pause this long starts a new wheel gesture
const WHEEL_GESTURE_GAP = 250;
const DRAG_DISTANCE = 80;
// The slide takes 500ms. Trackpad inertia must not flip it straight back.
const SETTLE_MS = 600;

// Whether something between target and container can still scroll that way
const innerScroll = (target, container, down) => {
  for (let el = target; el && el !== container; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight) continue;
    if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
    if (down ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0)
      return true;
  }
  return false;
};

/**
 * Wheel and drag between a game page's details and its screenshots, like Down/Up on a
 * controller. Spread the handlers on the element that slides between the two views.
 */
export function useMediaSwipe({ showMedia, open, close, enabled = true }) {
  const settledAt = useRef(0);
  const wheel = useRef({ at: 0, distance: 0, scrolled: false });
  const drag = useRef(null);
  const dragged = useRef(false);

  const go = down => {
    if (!enabled || down === showMedia || Date.now() - settledAt.current < SETTLE_MS)
      return false;
    settledAt.current = Date.now();
    (down ? open : close)();
    return true;
  };

  return {
    onWheel: event => {
      if (!event.deltaY) return;
      const down = event.deltaY > 0;
      const now = Date.now();
      const gesture = wheel.current;
      if (now - gesture.at > WHEEL_GESTURE_GAP || down !== gesture.distance > 0) {
        gesture.distance = 0;
        gesture.scrolled = false;
      }
      gesture.at = now;
      // A list scrolled to its end with this gesture stays put; the next one moves on
      if (innerScroll(event.target, event.currentTarget, down)) {
        gesture.scrolled = true;
        return;
      }
      if (gesture.scrolled) return;
      gesture.distance += event.deltaY;
      if (Math.abs(gesture.distance) >= WHEEL_DISTANCE && go(down)) gesture.distance = 0;
    },
    onPointerDown: event => {
      if (event.button !== 0) return;
      drag.current = { x: event.clientX, y: event.clientY, type: event.pointerType };
      dragged.current = false;
    },
    onPointerUp: event => {
      const start = drag.current;
      drag.current = null;
      if (!start) return;
      const dy = event.clientY - start.y;
      if (Math.abs(dy) < DRAG_DISTANCE || Math.abs(dy) < Math.abs(event.clientX - start.x))
        return;
      // Dragging the page up reveals what is below it
      const down = dy < 0;
      // Touch already scrolls the list under the finger; a mouse drag never does
      if (start.type === "touch" && innerScroll(event.target, event.currentTarget, down))
        return;
      dragged.current = go(down);
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    // The button a drag ends on must not also be pressed
    onClickCapture: event => {
      if (!dragged.current) return;
      dragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    // Images would otherwise start a native drag and swallow the pointer up
    onDragStart: event => event.preventDefault(),
  };
}
