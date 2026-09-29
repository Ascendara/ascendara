import { useLayoutEffect, useRef } from "react";
import { subscribeController } from "./controllerDispatcher";

export function useControllerInput(onAction, { enabled = true, blocked = false, priority = 10 } = {}) {
  const latest = useRef({ onAction, enabled, blocked, priority });
  useLayoutEffect(() => {
    latest.current = { onAction, enabled, blocked, priority };
  });
  useLayoutEffect(() => subscribeController(
    action => latest.current.onAction(action),
    () => latest.current
  ), []);
}
