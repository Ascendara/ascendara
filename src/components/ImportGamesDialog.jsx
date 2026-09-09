import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Download,
  Gamepad2,
  HardDrive,
  Image,
  Loader2,
  Search,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/context/LanguageContext";
import { cn, sanitizeText } from "@/lib/utils";
import gameService from "@/services/gameService";
import pendingLibrarySwapService from "@/services/pendingLibrarySwapService";

const LAUNCHERS = ["steam", "epic", "gog", "ubisoft", "battlenet"];
const ACTIVE_PHASES = ["scanning", "importing", "assets"];
const FINAL_PHASES = ["complete", "cancelled", "error"];
const STEPS = [
  { phase: "scanning", icon: Search },
  { phase: "importing", icon: Download },
  { phase: "assets", icon: Image },
];

export default function ImportGamesDialog({
  open,
  onOpenChange,
  onLibraryChanged,
  onBusyChange,
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState(LAUNCHERS);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catalogMatches, setCatalogMatches] = useState({});
  const latest = useRef(null);
  const mounted = useRef(false);
  const startGuard = useRef(false);
  const stopGuard = useRef(false);
  const eventVersion = useRef(0);
  const checkedMatches = useRef(new Set());
  const callbacks = useRef({ onLibraryChanged, onBusyChange });

  useEffect(() => {
    callbacks.current = { onLibraryChanged, onBusyChange };
  }, [onLibraryChanged, onBusyChange]);

  const acceptState = useCallback(next => {
    if (!mounted.current || !next || typeof next.revision !== "number") return;
    const previous = latest.current;
    if (previous && next.revision <= previous.revision) {
      return;
    }
    latest.current = next;
    setState(next);
    setLoading(false);
    setError(null);
    if (next.id && (next.id !== previous?.id || next.revision > previous?.revision)) {
      startGuard.current = false;
      setStarting(false);
    }
    if (!ACTIVE_PHASES.includes(next.phase)) {
      stopGuard.current = false;
      setStopping(false);
    }
    if (
      next.id &&
      ((next.id !== previous?.id && next.imported > 0) ||
        next.assetCompleted > (previous?.assetCompleted || 0) ||
        ((next.phase !== previous?.phase || next.id !== previous?.id) &&
          (next.phase === "assets" || FINAL_PHASES.includes(next.phase))))
    ) {
      callbacks.current.onLibraryChanged?.();
    }
  }, []);

  const refreshState = useCallback(async () => {
    const version = eventVersion.current;
    const snapshot = await window.electron.getLauncherImportState();
    if (
      version === eventVersion.current ||
      (snapshot?.id === latest.current?.id &&
        snapshot?.revision > latest.current?.revision)
    ) {
      acceptState(snapshot);
    }
  }, [acceptState]);

  useEffect(() => {
    mounted.current = true;
    let unsubscribe;
    try {
      unsubscribe = window.electron.onLauncherImportProgress(next => {
        eventVersion.current += 1;
        acceptState(next);
      });
      refreshState().catch(() => {
        if (mounted.current && !latest.current) {
          setError("stateUnavailable");
          setLoading(false);
        }
      });
    } catch {
      setError("stateUnavailable");
      setLoading(false);
    }
    return () => {
      mounted.current = false;
      unsubscribe?.();
    };
  }, [acceptState, refreshState]);

  const active = ACTIVE_PHASES.includes(state?.phase);
  const busy = starting || active;
  const finished = FINAL_PHASES.includes(state?.phase);
  const supported = LAUNCHERS.filter(id => state?.supportedLaunchers?.includes(id));
  const selectedIds = supported.filter(id => selected.includes(id));
  const launchers = state?.launchers || [];
  const items = state?.items || [];

  useEffect(() => {
    const pending = items.filter(
      item =>
        item.status === "added" &&
        typeof item.game === "string" &&
        !checkedMatches.current.has(item.game)
    );
    if (!pending.length) return;
    pending.forEach(item => checkedMatches.current.add(item.game));
    (async () => {
      for (const item of pending) {
        try {
          const match = await gameService.findCatalogMatch(item.game);
          if (mounted.current && match) {
            setCatalogMatches(prev => ({ ...prev, [item.game]: match }));
          }
        } catch {
          // Catalog lookup is best-effort; missing matches are simply not offered
        }
      }
    })();
  }, [items]);

  const handleSwapToDownload = catalogGame => {
    const importedGameName = Object.entries(catalogMatches).find(
      ([, match]) => match === catalogGame
    )?.[0];
    if (importedGameName) {
      pendingLibrarySwapService.add(sanitizeText(catalogGame.game), importedGameName);
    }
    onOpenChange(false);
    navigate("/download", { state: { gameData: catalogGame } });
  };
  const found = launchers.reduce((total, launcher) => total + (launcher.found || 0), 0);
  const scanned = launchers.filter(launcher =>
    ["complete", "error"].includes(launcher.status)
  ).length;
  const processed = (state?.imported || 0) + (state?.skipped || 0) + (state?.failed || 0);
  const stepIndex = STEPS.findIndex(step => step.phase === state?.phase);
  const progress =
    state?.phase === "scanning"
      ? (scanned / Math.max(launchers.length, 1)) * 100
      : state?.phase === "importing"
        ? (processed / Math.max(found, 1)) * 100
        : ((state?.assetCompleted || 0) / Math.max(state?.assetTotal || 0, 1)) * 100;
  const hasIssues =
    (state?.failed || 0) > 0 ||
    launchers.some(
      launcher => launcher.status === "error" || launcher.warnings?.length
    ) ||
    items.some(item => ["partial", "missing", "error"].includes(item.assets));
  const statusKey = stopping
    ? "stopping"
    : starting
      ? "starting"
      : state?.phase === "complete" && hasIssues
        ? "partial"
        : state?.phase || "idle";

  useEffect(() => {
    callbacks.current.onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const handleStart = async () => {
    if (startGuard.current || active || !selectedIds.length) return;
    startGuard.current = true;
    setStarting(true);
    setError(null);
    try {
      const result = await window.electron.startLauncherImport(selectedIds);
      if (!mounted.current) return;
      if (!result?.success) {
        setError(
          ["busy", "invalidLaunchers", "directoryRequired"].includes(result?.error)
            ? result.error
            : "failed"
        );
        if (result?.error === "busy") await refreshState();
      } else {
        await refreshState();
      }
    } catch {
      if (mounted.current) setError("failed");
    } finally {
      startGuard.current = false;
      if (mounted.current) setStarting(false);
    }
  };

  const handleStop = async () => {
    if (stopGuard.current || !active) return;
    stopGuard.current = true;
    setStopping(true);
    setError(null);
    try {
      const requested = await window.electron.cancelLauncherImport();
      if (!mounted.current) return;
      if (!requested) {
        stopGuard.current = false;
        setStopping(false);
        setError("cancelFailed");
      }
      await refreshState();
    } catch {
      if (mounted.current) {
        stopGuard.current = false;
        setStopping(false);
        setError("cancelFailed");
      }
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshState();
    } catch {
      if (mounted.current) setError("stateUnavailable");
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 text-left">
          <div className="mb-2 flex items-center gap-3 pr-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Download className="h-5 w-5" aria-hidden="true" />
            </span>
            <DialogTitle>{t("library.launcherImport.title")}</DialogTitle>
          </div>
          <DialogDescription>{t("library.launcherImport.description")}</DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            variant="ghost"
            className="absolute right-3 top-3 h-9 w-9 p-0"
            aria-label={t("library.launcherImport.close")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogClose>

        <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
              {t("library.launcherImport.installedOnly")}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t("library.launcherImport.noSignIn")}
            </span>
          </div>

          <fieldset disabled={busy || loading} className="space-y-3">
            <legend className="text-sm font-medium">
              {t("library.launcherImport.chooseLaunchers")}
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LAUNCHERS.map(id => {
                const available = supported.includes(id);
                const checked = available && selected.includes(id);
                return (
                  <label
                    key={id}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl border p-3 transition-colors",
                      checked
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-muted/20",
                      !available || busy || loading
                        ? "cursor-default opacity-60"
                        : "cursor-pointer hover:border-primary/50 hover:bg-accent/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!available}
                      onChange={() =>
                        setSelected(current =>
                          current.includes(id)
                            ? current.filter(launcher => launcher !== id)
                            : [...current, id]
                        )
                      }
                      className="peer sr-only"
                    />
                    <span className="absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background" />
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        checked
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Gamepad2 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {t(`library.launcherImport.launchers.${id}`)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t(
                          `library.launcherImport.${loading ? "checking" : available ? "localInstallations" : "unsupported"}`
                        )}
                      </span>
                    </span>
                    {checked && (
                      <Check
                        className="h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("library.launcherImport.selectionHint")}
            </p>
          </fieldset>

          <ol
            className="grid grid-cols-3 gap-2"
            aria-label={t("library.launcherImport.stepsLabel")}
          >
            {STEPS.map(({ phase, icon: Icon }, index) => {
              const current = phase === state?.phase;
              const done = state?.phase === "complete" || stepIndex > index;
              return (
                <li
                  key={phase}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium",
                    current
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-muted/20 text-muted-foreground"
                  )}
                >
                  {done ? (
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  {t(`library.launcherImport.steps.${phase}`)}
                </li>
              );
            })}
          </ol>

          <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="flex items-start gap-3"
            >
              {busy || loading ? (
                <Loader2
                  className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary"
                  aria-hidden="true"
                />
              ) : hasIssues || state?.phase === "error" ? (
                <AlertCircle
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold">
                  {t(`library.launcherImport.status.${loading ? "loading" : statusKey}`)}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(
                    `library.launcherImport.statusHelp.${stopping ? "stopping" : busy ? "background" : finished ? (state?.phase === "cancelled" ? "cancelled" : "finished") : "idle"}`
                  )}
                </p>
                {active && (
                  <p className="text-xs text-muted-foreground">
                    {state.phase === "assets"
                      ? t("library.launcherImport.artworkProgress", {
                          completed: state.assetCompleted || 0,
                          total: state.assetTotal || 0,
                        })
                      : state.phase === "scanning"
                        ? t("library.launcherImport.scanProgress", {
                            completed: scanned,
                            total: launchers.length,
                          })
                        : t("library.launcherImport.addProgress", {
                            completed: processed,
                            total: found,
                          })}
                  </p>
                )}
              </div>
            </div>
            {active && (
              <Progress
                value={Math.min(100, progress)}
                aria-label={t(`library.launcherImport.steps.${state.phase}`)}
                className="h-1.5"
              />
            )}
            <dl className="grid grid-cols-4 gap-2 border-t border-border pt-3">
              {[
                ["found", found],
                ["added", state?.imported || 0],
                ["skipped", state?.skipped || 0],
                ["failed", state?.failed || 0],
              ].map(([key, value]) => (
                <div key={key} className="min-w-0 text-center">
                  <dd className="text-xl font-semibold tabular-nums">{value}</dd>
                  <dt className="break-words text-xs text-muted-foreground">
                    {t(`library.launcherImport.counters.${key}`)}
                  </dt>
                </div>
              ))}
            </dl>
          </section>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              {t(`library.launcherImport.errors.${error}`)}
            </div>
          )}

          {launchers.length > 0 && (
            <section
              className="space-y-2"
              aria-label={t("library.launcherImport.launcherResults")}
            >
              {launchers.map(launcher => (
                <div
                  key={launcher.id}
                  className="rounded-lg border border-border px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {t(`library.launcherImport.launchers.${launcher.id}`)}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {launcher.status === "scanning" && (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      )}
                      {t(`library.launcherImport.launcherStatus.${launcher.status}`, {
                        count: launcher.found || 0,
                      })}
                    </span>
                  </div>
                  {(launcher.status === "error" || launcher.warnings?.length > 0) && (
                    <p className="mt-1.5 leading-relaxed text-muted-foreground">
                      {t(
                        `library.launcherImport.${launcher.status === "error" ? "launcherError" : "launcherWarning"}`
                      )}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {items.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">
                {t("library.launcherImport.results", { count: items.length })}
              </h3>
              <div
                className="max-h-60 overflow-y-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                tabIndex={0}
                role="region"
                aria-label={t("library.launcherImport.resultsLabel")}
              >
                <ul className="divide-y divide-border">
                  {items.map((item, index) => (
                    <li
                      key={`${item.launcher}-${item.launcherId}-${index}`}
                      className="flex items-start gap-3 px-3 py-3"
                    >
                      <Gamepad2
                        className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">
                          {typeof item.game === "string"
                            ? item.game
                            : t("library.launcherImport.unknownGame")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(`library.launcherImport.launchers.${item.launcher}`)}
                        </p>
                        {item.assets && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {item.assets === "downloading" ? (
                              <Loader2
                                className="h-3 w-3 shrink-0 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Image className="h-3 w-3 shrink-0" aria-hidden="true" />
                            )}
                            {t(`library.launcherImport.assets.${item.assets}`)}
                          </p>
                        )}
                        {typeof item.game === "string" && catalogMatches[item.game] && (
                          <button
                            type="button"
                            onClick={() => handleSwapToDownload(catalogMatches[item.game])}
                            className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            <ArrowRightLeft className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {t("library.launcherImport.catalogMatchAction")}
                          </button>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                          item.status === "added"
                            ? "bg-primary/10 text-primary"
                            : item.status === "error"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {t(`library.launcherImport.itemStatus.${item.status}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {finished && found === 0 && items.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-5 text-center">
              <Search
                className="mx-auto mb-2 h-7 w-7 text-muted-foreground"
                aria-hidden="true"
              />
              <h3 className="text-sm font-semibold">
                {t("library.launcherImport.emptyTitle")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("library.launcherImport.emptyDescription")}
              </p>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("library.launcherImport.launcherRequired")}{" "}
            {t("library.launcherImport.playtimeNote")}
          </p>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t text-secondary border-border bg-muted/10 px-6 py-4 sm:items-center">
          {busy ? (
            <>
              <Button
                variant="outline"
                onClick={handleStop}
                disabled={starting || stopping}
                className="gap-2 text-primary"
              >
                {stopping ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t(`library.launcherImport.${stopping ? "stopRequested" : "stopQueue"}`)}
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                {t("library.launcherImport.runInBackground")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="text-primary" onClick={() => onOpenChange(false)}>
                {t("library.launcherImport.close")}
              </Button>
              {!state ? (
                <Button onClick={handleRefresh} disabled={loading}>
                  {t("library.launcherImport.retry")}
                </Button>
              ) : (
                <Button
                  onClick={handleStart}
                  disabled={loading || !selectedIds.length}
                  className="gap-2"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  {t(`library.launcherImport.${finished ? "scanAgain" : "start"}`)}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
