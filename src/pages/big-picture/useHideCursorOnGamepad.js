import { useEffect } from "react";
import { observeController } from "./controllerDispatcher";

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

    const unsubscribe = observeController(input => {
      if (input && Object.values(input).some(value => value === true)) hideCursor();
    });

    // Cleanup when leaving the screen
    return () => {
      window.removeEventListener("mousemove", showCursor);
      window.removeEventListener("mousedown", showCursor);
      unsubscribe();
      document.body.style.cursor = "auto";
    };
  }, []);
};

export { useHideCursorOnGamepad };
