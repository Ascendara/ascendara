import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { useState, useEffect, useCallback } from "react";
import {
  fetchGameReleases,
  TimemachineBusyError,
} from "../services/games/timemachineService";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Check,
  Hourglass,
  HardDrive,
  History,
  RotateCw,
  SearchX,
  TriangleAlert,
  Undo2,
} from "lucide-react";

// Older API responses can list the same release more than once
function uniqueReleases(releases) {
  const seen = new Set();
  return releases.filter(entry => {
    if (seen.has(entry.version)) return false;
    seen.add(entry.version);
    return true;
  });
}

const formatDate = iso =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

function StateMessage({ icon: Icon, tone = "muted", title, children }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          tone === "error" ? "bg-red-500/15 text-red-500" : "bg-accent/40 text-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

export default function TimemachineDialog({
  gameData,
  latestGameData,
  onVersionSelect,
  open,
  onOpenChange,
}) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const { t } = useLanguage();
  // Always look history up by the live game, never by an older version's entry
  const baseGame = latestGameData || gameData;
  const gameID = baseGame?.gameID;
  const gameName = baseGame?.game;

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const data = await fetchGameReleases({ gameID, game: gameName });
      setReleases(uniqueReleases(data || []));
    } catch (err) {
      console.error("Error loading versions:", err);
      setReleases([]);
      setError(err instanceof TimemachineBusyError ? "busy" : "failed");
    } finally {
      setLoading(false);
    }
  }, [gameID, gameName]);

  useEffect(() => {
    if (open && (gameID || gameName)) {
      loadVersions();
    }
  }, [open, gameID, gameName, loadVersions]);

  const showingVersion = gameData?.version || "";
  const isShowing = entry => !!entry.version && entry.version === showingVersion;

  const releaseDate = entry =>
    formatDate(entry.firstSeen) ||
    entry.legacyDate ||
    t("download.timemachine.unknownDate");

  const liveRelease = releases.find(entry => entry.live);
  const viewingOlder = !!liveRelease && !isShowing(liveRelease);

  const switchTo = release => {
    onVersionSelect(release);
    onOpenChange(false);

    if (release.live) {
      toast.success(t("download.timemachine.backToLatestToast"), {
        description: release.version || undefined,
        duration: 3000,
      });
      return;
    }
    const versionText = release.version || t("download.timemachine.unknownVersion");
    toast.success(t("download.timemachine.versionChanged"), {
      description: t("download.timemachine.versionChangedDesc")
        .replace("{version}", versionText)
        .replace("{date}", releaseDate(release)),
      duration: 3000,
    });
  };

  const handleConfirm = () => {
    if (selected) switchTo(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-5 sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-foreground">
                {t("download.timemachine.title")}
              </DialogTitle>
              <DialogDescription>
                {t("download.timemachine.subtitle", { game: gameData?.game })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">
            {t("download.timemachine.currentlyShowing")}
          </span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-foreground">
              {showingVersion && showingVersion !== "-1"
                ? showingVersion
                : t("download.timemachine.unknownVersion")}
            </span>
            {viewingOlder && !loading && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs text-primary"
                onClick={() => switchTo(liveRelease)}
              >
                <Undo2 className="h-3.5 w-3.5" />
                {t("download.timemachine.backToLatest")}
              </Button>
            )}
          </div>
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <Skeleton key={i} className="h-[60px] w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <StateMessage
              icon={error === "busy" ? Hourglass : TriangleAlert}
              tone={error === "busy" ? "muted" : "error"}
              title={
                error === "busy"
                  ? t("download.timemachine.preparing")
                  : t("download.timemachine.loadError")
              }
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-foreground"
                onClick={loadVersions}
              >
                <RotateCw className="h-4 w-4" />
                {t("download.timemachine.retry")}
              </Button>
            </StateMessage>
          ) : releases.length === 0 ? (
            <StateMessage icon={SearchX} title={t("download.timemachine.noVersions")}>
              <p className="max-w-sm text-xs text-muted-foreground">
                {t("download.timemachine.noVersionsHint")}
              </p>
            </StateMessage>
          ) : (
            <div role="radiogroup" className="space-y-2">
              {releases.map((entry, index) => {
                const showing = isShowing(entry);
                const active = selected === entry;
                const replaced = !entry.live && formatDate(entry.lastSeen);
                return (
                  <button
                    key={entry.version || `release-${index}`}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={showing}
                    onClick={() => setSelected(entry)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent",
                      showing && "cursor-default opacity-60 hover:bg-transparent"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        active
                          ? "bg-primary text-secondary"
                          : "bg-accent/30 text-foreground"
                      )}
                    >
                      {active ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <History className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {entry.version || t("download.timemachine.unknownVersion")}
                        </span>
                        {entry.live && (
                          <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-500">
                            {t("download.timemachine.latest")}
                          </span>
                        )}
                        {showing && (
                          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            {t("download.timemachine.current")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {replaced
                            ? t("download.timemachine.releasedReplaced", {
                                released: releaseDate(entry),
                                replaced,
                              })
                            : releaseDate(entry)}
                        </span>
                        {entry.game?.size && (
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {entry.game.size}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!loading && !error && releases.some(entry => !entry.live) && (
          <p className="text-xs text-muted-foreground">
            {t("download.timemachine.oldLinksNotice")}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="text-primary"
            onClick={() => onOpenChange(false)}
          >
            {t("download.timemachine.cancel")}
          </Button>
          <Button
            type="button"
            className="text-secondary"
            disabled={!selected || loading}
            onClick={handleConfirm}
          >
            {t("download.timemachine.useVersion")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
