import { useEffect } from "react";
import { useSettings } from "@/context/SettingsContext";
import { resumePendingTorrents } from "@/services/downloads/debridService";
import { toast } from "sonner";

export default function DebridBackgroundTasks() {
  const { settings } = useSettings();
  useEffect(() => {
    let running = false;
    let lastError;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        await resumePendingTorrents(settings);
        lastError = null;
      } catch (error) {
        console.warn("[Debrid] Could not start pending torrents:", error.message);
        if (error.message !== lastError) toast.error(error.message);
        lastError = error.message;
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [settings]);
  return null;
}
