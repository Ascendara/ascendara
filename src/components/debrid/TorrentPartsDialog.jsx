import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes } from "@/components/debrid/DebridDownloadParts";
import { useLanguage } from "@/context/LanguageContext";
import { requestHandoffNow } from "@/services/downloads/debridTorrentHandoff";
import {
  getPendingPartChoices,
  saveTorrentPartChoice,
} from "@/services/downloads/debridParts";
import { useSettings } from "@/context/SettingsContext";
import { FitgirlInstallSwitches } from "@/components/FitgirlInstallToggles";
import {
  looksLikeFitgirl,
  readDownloadChoice,
  resolveFitgirlOptions,
  saveDownloadChoice,
} from "@/services/downloads/fitgirlInstallOptions";

const STORAGE_KEYS = ["realDebridGameData", "torboxGameNames"];
const keyOf = choice => `${choice.storageKey}|${choice.recordKey}`;

// Asks which parts of a torrent to download. Closing it keeps the torrent waiting
// behind a "Choose parts" button, so it is never stuck.
export default function TorrentPartsDialog() {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const [fitgirl, setFitgirl] = useState(null);
  const [pending, setPending] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [ticked, setTicked] = useState({});

  useEffect(() => {
    const poll = () => {
      try {
        setPending(getPendingPartChoices(STORAGE_KEYS));
      } catch (error) {
        console.warn("[Debrid] Could not read torrent part choices:", error.message);
      }
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, []);

  const current = pending.find(choice => !dismissed.has(keyOf(choice)));
  const waiting = pending.filter(choice => dismissed.has(keyOf(choice)));
  const currentKey = current && keyOf(current);

  // Every part starts ticked.
  useEffect(() => {
    if (current)
      setTicked(Object.fromEntries(current.files.map(file => [file.id, true])));
    // FitGirl packs: install switches prefilled from this download's choice or Settings.
    setFitgirl(
      current && (looksLikeFitgirl(current.name) || looksLikeFitgirl(current.game))
        ? resolveFitgirlOptions(settings, readDownloadChoice(current.game))
        : null
    );
    // Only reset when a different torrent comes up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  const dismiss = choice => setDismissed(set => new Set(set).add(keyOf(choice)));
  const reopen = choice =>
    setDismissed(set => {
      const next = new Set(set);
      next.delete(keyOf(choice));
      return next;
    });

  const chosen = current ? current.files.filter(file => ticked[file.id]) : [];
  const chosenSize = chosen.reduce((sum, file) => sum + (Number(file.size) || 0), 0);

  const download = () => {
    if (fitgirl) saveDownloadChoice(current.game, fitgirl);
    saveTorrentPartChoice(
      current.storageKey,
      current.recordKey,
      chosen.map(file => file.id)
    );
    requestHandoffNow();
    setPending(list => list.filter(choice => keyOf(choice) !== currentKey));
  };

  return (
    <>
      <Dialog open={Boolean(current)} onOpenChange={open => !open && dismiss(current)}>
        {current && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("debrid.torrentParts.dialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("debrid.torrentParts.dialogDescription", { name: current.name })}
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
              {current.files.map(file => (
                <li key={file.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                    <Checkbox
                      checked={Boolean(ticked[file.id])}
                      onCheckedChange={value =>
                        setTicked(map => ({ ...map, [file.id]: Boolean(value) }))
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>
                      {file.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(Number(file.size))}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {fitgirl && (
              <div className="space-y-3 rounded-xl bg-muted/40 p-4">
                <h3 className="text-sm font-semibold">
                  {t("fitgirlInstall.afterDownload")}
                </h3>
                <FitgirlInstallSwitches
                  value={fitgirl}
                  onChange={setFitgirl}
                  idPrefix="fitgirl-parts"
                />
              </div>
            )}
            <DialogFooter className="items-center gap-2 sm:justify-between">
              <span className="text-xs text-muted-foreground">
                {t("debrid.torrentParts.selected", {
                  count: chosen.length,
                  total: current.files.length,
                  size: formatBytes(chosenSize) || "0 B",
                })}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => dismiss(current)}>
                  {t("debrid.torrentParts.later")}
                </Button>
                <Button disabled={!chosen.length} onClick={download}>
                  {t("debrid.torrentParts.download")}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      {waiting.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-72 space-y-2">
          {waiting.map(choice => (
            <div
              key={keyOf(choice)}
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 shadow-lg"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("debrid.torrentParts.waiting")}
                </p>
                <p className="truncate text-sm font-medium" title={choice.name}>
                  {choice.name}
                </p>
              </div>
              <Button size="sm" onClick={() => reopen(choice)}>
                {t("debrid.torrentParts.chooseParts")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
