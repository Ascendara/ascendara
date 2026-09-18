import { useEffect } from "react";
import { getGamepadInput } from "./gamepad";

const useHideCursorOnGamepad = () => {
  useEffect(() => {
    let lastCursorState = "auto";

    // Function to show cursor
    const showCursor = () => {
      if (lastCursorState !== "auto") {
        document.body.style.cursor = "auto";
        lastCursorState = "auto";
      }
    };

    // Function to hide cursor
    const hideCursor = () => {
      if (lastCursorState !== "none") {
        document.body.style.cursor = "none";
        lastCursorState = "none";
      }
    };

    window.addEventListener("mousemove", showCursor);
    window.addEventListener("mousedown", showCursor);

    // Loop for controller
    let animationFrameId;
    const loop = () => {
      const gp = getGamepadInput();

      if (gp) {
        const isGamepadActive = Object.values(gp).some(value => value === true);

        if (isGamepadActive) {
          hideCursor();
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    // Cleanup when leaving the screen
    return () => {
      window.removeEventListener("mousemove", showCursor);
      window.removeEventListener("mousedown", showCursor);
      cancelAnimationFrame(animationFrameId);
      document.body.style.cursor = "auto";
    };
  }, []);
};

export { useHideCursorOnGamepad };
