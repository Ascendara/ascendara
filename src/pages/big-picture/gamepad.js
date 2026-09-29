// Browser-standard mapping covers Xbox, DualShock and DualSense controllers.
let activePadIndex = null;
let stickDirection = null;

const getGamepadInput = () => {
  let pads;
  try {
    pads = Array.from(navigator.getGamepads?.() || []).filter(pad => pad?.connected && pad.buttons.length >= 10);
  } catch {
    return null;
  }
  if (!pads.length) {
    activePadIndex = null;
    stickDirection = null;
    return null;
  }
  const actuated = pad => pad.buttons.some(button => button.pressed || button.value > 0.5) ||
    Math.abs(pad.axes[0] || 0) > 0.35 || Math.abs(pad.axes[1] || 0) > 0.35;
  const current = pads.find(pad => pad.index === activePadIndex);
  const gp = current && actuated(current) ? current : pads.find(actuated) || current || pads[0];
  if (gp.index !== activePadIndex) stickDirection = null;
  activePadIndex = gp.index;

  const x = gp.axes[0] || 0;
  const y = gp.axes[1] || 0;
  const threshold = stickDirection ? 0.22 : 0.35;
  // Hysteresis avoids chatter near the deadzone; one dominant axis avoids diagonal drift.
  stickDirection = Math.max(Math.abs(x), Math.abs(y)) < threshold ? null :
    Math.abs(x) > Math.abs(y) ? (x < 0 ? "left" : "right") : (y < 0 ? "up" : "down");
  const pressed = index => !!(gp.buttons[index]?.pressed || gp.buttons[index]?.value > 0.5);
  const dpad = [12, 13, 14, 15].some(pressed);
  return {
    up: pressed(12) || (!dpad && stickDirection === "up"),
    down: pressed(13) || (!dpad && stickDirection === "down"),
    left: pressed(14) || (!dpad && stickDirection === "left"),
    right: pressed(15) || (!dpad && stickDirection === "right"),
    a: pressed(0), b: pressed(1), x: pressed(2), y: pressed(3),
    menu: pressed(9) || pressed(8), lb: pressed(4), rb: pressed(5),
    lt: pressed(6), rt: pressed(7),
  };
};

export { getGamepadInput };
