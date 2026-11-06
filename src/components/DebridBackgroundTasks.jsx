import { useEffect } from "react";
import { useSettings } from "@/context/SettingsContext";
import { resumePendingTorrents } from "@/services/downloads/debridService";
import { toast } from "sonner";
import TorrentPartsDialog from "@/components/debrid/TorrentPartsDialog";

export default function DebridBackgroundTasks() {
  const { settings } = useSettings();
  useEffect(() => {
    let running = false;
    let again = false;
    let lastError;
    const poll = async () => {
      // A pass asked for while one runs follows right after it.
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        const results = await resumePendingTorrents(settings);
        for (const result of results)
          if (result.status === "fulfilled" && result.value)
            toast.success(`Downloading ${result.value.game} to your PC`);
        const failed = results.find(result => result.status === "rejected");
        if (failed) throw failed.reason;
        lastError = null;
      } catch (error) {
        console.warn("[Debrid] Could not start pending torrents:", error.message);
        if (error.message !== lastError) toast.error(error.message);
        lastError = error.message;
      } finally {
        running = false;
        if (again) {
          again = false;
          void poll();
        }
      }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    window.addEventListener("debrid-handoff-now", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("debrid-handoff-now", poll);
    };
  }, [settings]);
  return <TorrentPartsDialog />;
}
