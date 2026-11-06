import { useEffect } from "react";
import { useSettings } from "@/context/SettingsContext";
import {
  debridProviders,
  resumePendingTorrents,
} from "@/services/downloads/debridService";
import { readRecords } from "@/services/downloads/debridRecords";
import { toast } from "sonner";
import TorrentPartsDialog from "@/components/debrid/TorrentPartsDialog";
import HandoffCountdown from "@/components/debrid/HandoffCountdown";

// One toast per torrent: its id is shared by the countdown and the "Downloading" toast,
// so each new state replaces the last one instead of stacking.
const toastId = (storageKey, recordKey) => `debrid-handoff:${storageKey}:${recordKey}`;

// Shows a ticking toast when a torrent's hand-off starts waiting or is rescheduled.
// A waiting pass that only refreshes its time keeps the same state: no toast every tick.
function announceWaits(shown) {
  for (const { metadataStorageKey: storageKey } of debridProviders) {
    for (const [recordKey, entry] of Object.entries(readRecords(storageKey))) {
      const reason = entry?.handoffWaitReason;
      if (!recordKey.startsWith("torrent:") || !reason || entry.localDownloadStarted)
        continue;
      const id = toastId(storageKey, recordKey);
      const state = reason === "retrying" ? `${reason}@${entry.nextHandoffAt}` : reason;
      if (shown.get(id) === state) continue;
      shown.set(id, state);
      toast.info(
        <HandoffCountdown storageKey={storageKey} recordKey={recordKey} className="" />,
        { id, duration: 8000 }
      );
    }
  }
}

export default function DebridBackgroundTasks() {
  const { settings } = useSettings();
  useEffect(() => {
    let running = false;
    let again = false;
    let lastError;
    const shown = new Map();
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
          if (result.status === "fulfilled" && result.value) {
            const { game, storageKey, recordKey } = result.value;
            const id = toastId(storageKey, recordKey);
            shown.delete(id);
            toast.success(`Downloading ${game} to your PC`, { id });
          }
        announceWaits(shown);
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
