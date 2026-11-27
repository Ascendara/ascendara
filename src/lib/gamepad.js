// Picks the controller the player is using. Tools like DS4Windows or Steam Input
// add a virtual Xbox pad next to the real one, and the real one may then stop
// sending input, so the first pad in the list can't be trusted. Follow whichever
// pad was last pressed instead.
let activePadIndex = null;

const usable = pad => pad?.connected && pad.axes.length >= 2 && pad.buttons.length >= 10;

const actuated = pad =>
  pad.buttons.some(button => button.pressed || button.value > 0.5) ||
  Math.abs(pad.axes[0] || 0) > 0.35 ||
  Math.abs(pad.axes[1] || 0) > 0.35;

export function resetActiveGamepad() {
  activePadIndex = null;
}

export function getActiveGamepad() {
  let pads;
  try {
    pads = Array.from(navigator.getGamepads?.() || []).filter(usable);
  } catch {
    return null;
  }
  if (!pads.length) {
    activePadIndex = null;
    return null;
  }
  const current = pads.find(pad => pad.index === activePadIndex);
  const pad =
    current && actuated(current) ? current : pads.find(actuated) || current || pads[0];
  activePadIndex = pad.index;
  return pad;
}
