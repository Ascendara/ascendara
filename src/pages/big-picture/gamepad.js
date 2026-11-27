// Browser-standard mapping covers Xbox, DualShock and DualSense controllers.
import { getActiveGamepad, resetActiveGamepad } from "@/lib/gamepad";

let padIndex = null;
let stickDirection = null;

export function resetGamepadInput() {
  resetActiveGamepad();
  padIndex = null;
  stickDirection = null;
}

const getGamepadInput = () => {
  const gp = getActiveGamepad();
  if (!gp) {
    padIndex = null;
    stickDirection = null;
    return null;
  }
  if (gp.index !== padIndex) stickDirection = null;
  padIndex = gp.index;

  const x = gp.axes[0] || 0;
  const y = gp.axes[1] || 0;
  const threshold = stickDirection ? 0.22 : 0.35;
  // Hysteresis avoids chatter near the deadzone; one dominant axis avoids diagonal drift.
  stickDirection =
    Math.max(Math.abs(x), Math.abs(y)) < threshold
      ? null
      : Math.abs(x) > Math.abs(y)
        ? x < 0
          ? "left"
          : "right"
        : y < 0
          ? "up"
          : "down";
  const pressed = index =>
    !!(gp.buttons[index]?.pressed || gp.buttons[index]?.value > 0.5);
  const dpad = [12, 13, 14, 15].some(pressed);
  return {
    up: pressed(12) || (!dpad && stickDirection === "up"),
    down: pressed(13) || (!dpad && stickDirection === "down"),
    left: pressed(14) || (!dpad && stickDirection === "left"),
    right: pressed(15) || (!dpad && stickDirection === "right"),
    a: pressed(0),
    b: pressed(1),
    x: pressed(2),
    y: pressed(3),
    menu: pressed(9) || pressed(8),
    lb: pressed(4),
    rb: pressed(5),
    lt: pressed(6),
    rt: pressed(7),
  };
};

export { getGamepadInput };
