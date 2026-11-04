import { useEffect } from "react";
import { holdLoad } from "@/lib/loadGate";

// Keeps the splash or page transition waiting while `active` is true, for a
// page whose loading state lives in React state (a spinner, a data fetch).
export function useLoadHold(active) {
  useEffect(() => {
    if (!active) return;
    return holdLoad();
  }, [active]);
}
