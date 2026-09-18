// GAMEPAD UTILS
let lastLoggedState = null;

let lastLogTime = 0;

const getGamepadInput = () => {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];

  const gp = Array.from(gamepads).find(
    g => g && g.connected && g.axes.length >= 2 && g.buttons.length >= 10
  );

  if (!gp) return null;

  // Joysticks deadzone
  const threshold = 0.5;

  // Log raw gamepad data for debugging
  const axes0 = gp.axes[0];
  const axes1 = gp.axes[1];
  const dpadUp = gp.buttons[12]?.pressed;
  const dpadDown = gp.buttons[13]?.pressed;
  const dpadLeft = gp.buttons[14]?.pressed;
  const dpadRight = gp.buttons[15]?.pressed;

  const input = {
    up: dpadUp || axes1 < -threshold,
    down: dpadDown || axes1 > threshold,
    left: dpadLeft || axes0 < -threshold,
    right: dpadRight || axes0 > threshold,
    a: gp.buttons[0]?.pressed,
    b: gp.buttons[1]?.pressed,
    x: gp.buttons[2]?.pressed,
    y: gp.buttons[3]?.pressed,
    menu: gp.buttons[9]?.pressed || gp.buttons[8]?.pressed,
    lb: gp.buttons[4]?.pressed,
    rb: gp.buttons[5]?.pressed,
  };

  // Only log on state changes and max once per 500ms
  const now = Date.now();
  const currentState = `${input.up ? "U" : ""}${input.down ? "D" : ""}${input.left ? "L" : ""}${input.right ? "R" : ""}${input.a ? "A" : ""}${input.b ? "B" : ""}`;

  if (currentState && currentState !== lastLoggedState && now - lastLogTime > 500) {
    console.log("[GAMEPAD] Input:", {
      direction: { up: input.up, down: input.down, left: input.left, right: input.right },
      source: {
        dpad: { up: dpadUp, down: dpadDown, left: dpadLeft, right: dpadRight },
        axes: { x: axes0.toFixed(2), y: axes1.toFixed(2) },
      },
      buttons: { a: input.a, b: input.b },
    });
    lastLoggedState = currentState;
    lastLogTime = now;
  } else if (!currentState) {
    lastLoggedState = null;
  }

  return input;
};

export { lastLoggedState, lastLogTime, getGamepadInput };
