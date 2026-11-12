import { useState, useEffect, useCallback, useRef } from "react";
import {
  Calendar,
  HardDrive,
  History,
  Hourglass,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import {
  fetchGameReleases,
  TimemachineBusyError,
} from "@/services/games/timemachineService";
import { getControllerButtons, getButtonBadgeClass } from "./controller";
import { useControllerInput } from "./useControllerInput";

const formatDate = iso =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

// Older API responses can list the same release more than once
const uniqueReleases = releases => {
  const seen = new Set();
  return releases.filter(entry => {
    if (seen.has(entry.version)) return false;
    seen.add(entry.version);
    return true;
  });
};

// The Download page's Timemachine, driven by controller or keyboard
const TimemachineDialog = ({
  isOpen,
  game,
  showingVersion,
  onSelect,
  onClose,
  t,
  controllerType,
}) => {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const buttons = getControllerButtons(controllerType);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGameReleases({ gameID: game?.gameID, game: game?.game });
      const list = uniqueReleases(data || []);
      setReleases(list);
      const firstOther = list.findIndex(entry => entry.version !== showingVersion);
      setIndex(Math.max(0, firstOther));
    } catch (err) {
      console.error("[Timemachine] Error loading versions:", err);
      setReleases([]);
      setError(err instanceof TimemachineBusyError ? "busy" : "failed");
    } finally {
      setLoading(false);
    }
  }, [game?.gameID, game?.game, showingVersion]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  const handleInput = useCallback(
    action => {
      if (action === "BACK" || action === "MENU") {
        onClose();
      } else if (loading) {
        return;
      } else if (error) {
        if (action === "CONFIRM") load();
      } else if (action === "UP") {
        setIndex(prev => Math.max(0, prev - 1));
      } else if (action === "DOWN") {
        setIndex(prev => Math.min(releases.length - 1, prev + 1));
      } else if (action === "CONFIRM") {
        const release = releases[index];
        if (release && release.version !== showingVersion) onSelect(release);
      }
    },
    [loading, error, releases, index, showingVersion, onSelect, onClose, load]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = e => {
      const keyMap = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        Enter: "CONFIRM",
        Escape: "BACK",
        Backspace: "BACK",
      };
      if (!keyMap[e.key]) return;
      if (e.repeat && !e.key.startsWith("Arrow")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      handleInput(keyMap[e.key]);
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleInput, isOpen]);

  useControllerInput(handleInput, { priority: 30, enabled: isOpen });

  if (!isOpen) return null;

  const state = loading
    ? { icon: Hourglass, title: t("download.timemachine.loading") }
    : error === "busy"
      ? { icon: Hourglass, title: t("download.timemachine.preparing") }
      : error
        ? { icon: TriangleAlert, title: t("download.timemachine.loadError") }
        : releases.length === 0
          ? {
              icon: SearchX,
              title: t("download.timemachine.noVersions"),
              hint: t("download.timemachine.noVersionsHint"),
            }
          : null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[30000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-8 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border-2 border-primary/30 bg-card p-8 shadow-2xl animate-in fade-in-50 zoom-in-95">
        <div className="mb-2 flex items-center gap-4">
          <History className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold text-foreground">
            {t("download.timemachine.title")}
          </h2>
        </div>
        <p className="mb-6 text-lg text-muted-foreground">
          {t("download.timemachine.subtitle", { game: game?.game })}
        </p>

        {state ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <state.icon className="h-8 w-8 text-muted-foreground" />
            <p className="text-lg font-medium text-foreground">{state.title}</p>
            {state.hint && (
              <p className="max-w-md text-sm text-muted-foreground">{state.hint}</p>
            )}
            {error && (
              <p className="text-sm text-muted-foreground">
                <span
                  className={`mr-2 ${getButtonBadgeClass(controllerType)} bg-primary px-2 py-1 text-secondary`}
                >
                  {buttons.confirm}
                </span>
                {t("download.timemachine.retry")}
              </p>
            )}
          </div>
        ) : (
          <div
            ref={listRef}
            className="-mx-2 min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-1"
          >
            {releases.map((entry, idx) => {
              const showing = entry.version === showingVersion;
              const focused = idx === index;
              const replaced = !entry.live && formatDate(entry.lastSeen);
              const released =
                formatDate(entry.firstSeen) ||
                entry.legacyDate ||
                t("download.timemachine.unknownDate");
              return (
                <button
                  key={entry.version || `release-${idx}`}
                  data-index={idx}
                  type="button"
                  onClick={() => {
                    setIndex(idx);
                    if (!showing) onSelect(entry);
                  }}
                  className={`flex w-full items-center gap-4 rounded-xl px-5 py-4 text-left transition-all duration-150 ${
                    focused
                      ? "bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/30"
                      : "bg-muted text-foreground hover:bg-muted/80"
                  } ${showing ? "opacity-60" : ""}`}
                >
                  <History className="h-6 w-6 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-lg font-bold">
                        {entry.version || t("download.timemachine.unknownVersion")}
                      </span>
                      {entry.live && (
                        <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-semibold uppercase text-green-400">
                          {t("download.timemachine.latest")}
                        </span>
                      )}
                      {showing && (
                        <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold uppercase">
                          {t("download.timemachine.current")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-sm opacity-80">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {replaced
                          ? t("download.timemachine.releasedReplaced", {
                              released,
                              replaced,
                            })
                          : released}
                      </span>
                      {entry.game?.size && (
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-4 w-4" />
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

        {!state && releases.some(entry => !entry.live) && (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("download.timemachine.oldLinksNotice")}
          </p>
        )}

        <div className="mt-6 flex justify-center gap-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span>↑ / ↓ {t("bigPicture.navigate")}</span>
          <span>
            <span
              className={`mr-2 ${getButtonBadgeClass(controllerType)} bg-primary px-2 py-1 text-secondary`}
            >
              {buttons.confirm}
            </span>
            {t("download.timemachine.useVersion")}
          </span>
          <span>
            <span
              className={`mr-2 ${getButtonBadgeClass(controllerType)} border border-border bg-muted px-2 py-1 text-muted-foreground`}
            >
              {buttons.cancel}
            </span>
            {t("bigPicture.cancel")}
          </span>
        </div>
      </div>
    </div>
  );
};

export { TimemachineDialog };
