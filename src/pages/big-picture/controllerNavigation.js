const directions = [["up", "UP"], ["down", "DOWN"], ["left", "LEFT"], ["right", "RIGHT"]];
const actions = [["a", "CONFIRM"], ["b", "BACK"], ["menu", "MENU"], ["y", "SEARCH"],
  ["x", "X"], ["previousPage", "PREVIOUS_PAGE"], ["nextPage", "NEXT_PAGE"]];

// Keep this state across renders so held buttons cannot leak through a page or dialog change.
export function readNavigationInput(input, state, now, blocked = false) {
  const buttons = { ...input, previousPage: !!(input?.lb || input?.lt), nextPage: !!(input?.rb || input?.rt) };
  const previous = state.buttons || {};
  state.buttons = buttons;
  const direction = directions.find(([key]) => buttons[key]);
  if (!input || blocked) {
    state.direction = direction?.[0] || null;
    state.repeatAt = now + 280;
    return null;
  }
  const pressed = actions.find(([key]) => buttons[key] && !previous[key]);
  if (pressed) return pressed[1];
  if (!direction) {
    state.direction = null;
    return null;
  }
  const [key, action] = direction;
  if (state.direction !== key) {
    state.direction = key;
    state.repeatAt = now + 280;
    return action;
  }
  if (now >= state.repeatAt) {
    state.repeatAt = now + 90;
    return action;
  }
  return null;
}

export function visibilityDelta(start, end, visibleStart, visibleEnd) {
  if (start < visibleStart) return start - visibleStart;
  if (end > visibleEnd) return Math.min(end - visibleEnd, start - visibleStart);
  return 0;
}

const scrollAnimations = new WeakMap();
const horizontalRails = ".bp-row, .bp-classic-row, .bp-navigation-tabs";

// Native smooth scrolling can take several hundred milliseconds and restarts on
// each held-direction repeat. Retarget a short animation from its actual position.
export function scrollToFocus(element, target, immediate = false) {
  const previous = scrollAnimations.get(element);
  if (previous !== undefined) cancelAnimationFrame(previous);
  scrollAnimations.delete(element);
  const fromTop = element.scrollTop || 0;
  const fromLeft = element.scrollLeft || 0;
  const top = target.top ?? fromTop;
  const left = target.left ?? fromLeft;
  if (immediate) {
    element.scrollTo({ top, left, behavior: "instant" });
    return;
  }
  const start = performance.now();
  const step = now => {
    if (element.isConnected === false) {
      scrollAnimations.delete(element);
      return;
    }
    const progress = Math.min(1, Math.max(0, (now - start) / 90));
    const eased = 1 - (1 - progress) ** 3;
    element.scrollTo({
      top: fromTop + (top - fromTop) * eased,
      left: fromLeft + (left - fromLeft) * eased,
      behavior: "instant",
    });
    if (progress < 1) scrollAnimations.set(element, requestAnimationFrame(step));
    else scrollAnimations.delete(element);
  };
  scrollAnimations.set(element, requestAnimationFrame(step));
}

export function cancelSurfaceScroll(root) {
  if (!root) return;
  for (const element of [root, ...root.querySelectorAll(horizontalRails)]) {
    const frame = scrollAnimations.get(element);
    if (frame !== undefined) cancelAnimationFrame(frame);
    scrollAnimations.delete(element);
  }
}

export function scrollSurfaceFocus(root, element) {
  if (!root || !element) return;
  const immediate = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const rect = element.getBoundingClientRect();
  const viewport = root.getBoundingClientRect();
  const navigation = root.querySelector(".bp-navigation");
  const footer = root.querySelector(".bp-home-footer");
  const inNavigation = navigation?.contains(element);
  const top = inNavigation ? viewport.top : Math.max(viewport.top, navigation?.getBoundingClientRect().bottom || viewport.top);
  const bottom = Math.min(viewport.bottom, footer?.getBoundingClientRect().top ?? viewport.bottom);
  const delta = visibilityDelta(rect.top, rect.bottom, top + 16, bottom - 16);
  if (inNavigation) scrollToFocus(root, { top: 0 }, true);
  else if (delta) scrollToFocus(root, { top: root.scrollTop + delta }, immediate);

  // Scroll the horizontal rail separately: nested scrollIntoView can leave the page stationary.
  const rail = element.closest(horizontalRails);
  if (rail) {
    const bounds = rail.getBoundingClientRect();
    const horizontal = visibilityDelta(rect.left, rect.right, bounds.left + 12, bounds.right - 12);
    if (horizontal) scrollToFocus(rail, { left: rail.scrollLeft + horizontal }, immediate);
  }
}
