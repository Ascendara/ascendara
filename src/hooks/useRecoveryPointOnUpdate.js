import { useEffect } from "react";
import { createSettingsRecoveryPoint } from "@/services/recoveryService";

export function useRecoveryPointOnUpdate() {
  useEffect(() => {
    // Snapshot settings when the updater reports that the installer is ready.
    const handleUpdateReady = async () => {
      try {
        const point = await createSettingsRecoveryPoint("before-update");
        console.log("[Recovery] Created pre-update settings point:", point?.id);
      } catch (error) {
        console.warn("[Recovery] Could not create pre-update settings point:", error);
      }
    };

    const unsubscribe = window.electron?.onUpdateReady?.(handleUpdateReady);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      else window.electron?.removeUpdateReadyListener?.(handleUpdateReady);
    };
  }, []);
}
