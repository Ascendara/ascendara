import { useEffect } from "react";
import { holdLoad } from "@/lib/loadGate";

// Keeps the startup splash up while `active` is true, for a page whose
// loading state lives in React state (a spinner, a data fetch). A no-op once
// the app has booted.
export function useLoadHold(active) {
  useEffect(() => {
    if (!active) return;
    return holdLoad();
  }, [active]);
}
