import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Database,
  ExternalLink,
  FileJson,
  FolderOpen,
  Gamepad2,
  Globe,
  InfoIcon,
  Layers,
  Puzzle,
  RefreshCw,
  Tags,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

const DAY = 24 * 60 * 60 * 1000;
const FRESH_DAYS = 7;
const AGING_DAYS = 14;

const FRESHNESS_STYLES = {
  fresh: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
  aging: "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  outdated: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  unknown: "border-border bg-muted/40 text-muted-foreground",
};

const FRESHNESS_DOT = {
  fresh: "bg-green-500",
  aging: "bg-yellow-500",
  outdated: "bg-red-500",
  unknown: "bg-muted-foreground",
};

function parseIndexDate(lastRefreshTime, getDate) {
  if (lastRefreshTime instanceof Date && !isNaN(lastRefreshTime)) return lastRefreshTime;
  if (!getDate || getDate === "Not available") return null;
  const parsed = new Date(getDate);
  return isNaN(parsed) ? null : parsed;
}

function formatRelative(date, language) {
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(language || "en", { numeric: "auto" });
  if (abs < 60 * 60 * 1000) return rtf.format(Math.round(diff / 60000), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / 3600000), "hour");
  if (abs < 30 * DAY) return rtf.format(Math.round(diff / DAY), "day");
  if (abs < 365 * DAY) return rtf.format(Math.round(diff / (30 * DAY)), "month");
  return rtf.format(Math.round(diff / (365 * DAY)), "year");
}

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold tabular-nums leading-tight text-foreground">
          {value}
        </p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

function CustomSourceLink({ metadata, t }) {
  if (!metadata.customSource || !metadata.sourceUrl) return null;
  const listId = String(metadata.sourceUrl).startsWith("custom_list_")
    ? metadata.sourceUrl
    : null;

  if (listId) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-medium text-blue-600 dark:text-blue-300">
          {t("search.customList")}
        </span>
        <button
          type="button"
          onClick={() => window.electron?.showCustomListInFolder?.(listId)}
          className="text-primary hover:underline"
        >
          {t("search.showInFolder")}
        </button>
        <span className="text-muted-foreground/60">/</span>
        <button
          type="button"
          onClick={() => window.electron?.openCustomListFile?.(listId)}
          className="text-primary hover:underline"
        >
          {t("search.openFile")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => window.electron?.openURL?.(metadata.sourceUrl)}
      className="mt-0.5 block break-all text-left text-xs text-muted-foreground hover:text-primary hover:underline"
    >
      {metadata.sourceUrl}
    </button>
  );
}

export default function IndexInfoDialog({
  metadata,
  games,
  lastRefreshTime,
  onOpenSettings,
}) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const isLocal = !!metadata.local;

  // Only walk the catalog while the dialog is open
  const stats = useMemo(() => {
    if (!open || !Array.isArray(games)) return null;
    let dlc = 0;
    let online = 0;
    const categories = new Set();
    for (const game of games) {
      if (game.dlc) dlc++;
      if (game.online) online++;
      if (Array.isArray(game.category)) {
        for (const cat of game.category) categories.add(cat);
      }
    }
    return { dlc, online, categories: categories.size };
  }, [open, games]);

  const indexDate = parseIndexDate(isLocal ? lastRefreshTime : null, metadata.getDate);
  const ageDays = indexDate ? (Date.now() - indexDate.getTime()) / DAY : null;
  const freshness =
    !isLocal || ageDays === null
      ? "unknown"
      : ageDays <= FRESH_DAYS
        ? "fresh"
        : ageDays <= AGING_DAYS
          ? "aging"
          : "outdated";

  const gameCount = Number(metadata.games) || 0;
  const isEmpty = isLocal && gameCount === 0;
  const sourceName = metadata.sourceName || metadata.source;
  const fmt = n => Number(n || 0).toLocaleString(language);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          aria-label={t("search.indexInfo.open")}
          className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <InfoIcon className="h-4 w-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md gap-0 border-border p-0">
        <AlertDialogCancel className="absolute right-3 top-3 z-10 mt-0 h-8 w-8 border-none bg-transparent p-0 text-muted-foreground hover:bg-muted hover:text-foreground sm:mt-0">
          <X className="h-4 w-4" />
        </AlertDialogCancel>

        {/* Header */}
        <div className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-transparent px-6 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              {isLocal ? <Database className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
            </div>
            <div className="min-w-0 pr-8">
              <AlertDialogTitle className="text-xl font-bold text-foreground">
                {isLocal
                  ? t("search.localIndexedInformation")
                  : t("search.indexedInformation")}
              </AlertDialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                {sourceName && (
                  <span className="rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-medium text-foreground">
                    {sourceName}
                  </span>
                )}
                {isLocal && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-medium",
                      FRESHNESS_STYLES[freshness]
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", FRESHNESS_DOT[freshness])}
                    />
                    {t(`search.indexInfo.freshness.${freshness}`)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <AlertDialogDescription className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {isLocal ? (
              t("search.localIndexedDescription")
            ) : (
              <>
                {t("search.indexedInformationDescription")}{" "}
                <button
                  type="button"
                  onClick={() => window.electron.openURL("https://ascendara.app/dmca")}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {t("common.learnMore")}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </>
            )}
          </AlertDialogDescription>
        </div>

        <div className="space-y-4 px-6 py-5">
          {!isLocal && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("search.usinganApiWarning")}</span>
            </div>
          )}

          {isEmpty && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("search.indexInfo.empty")}</span>
            </div>
          )}

          {isLocal && freshness === "outdated" && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("search.outdatedIndexWarning")}</span>
            </div>
          )}

          {/* Stats */}
          {isLocal && !isEmpty ? (
            <div className="grid grid-cols-2 gap-2">
              <StatTile
                icon={Gamepad2}
                label={t("search.totalGames")}
                value={fmt(gameCount)}
              />
              <StatTile
                icon={Tags}
                label={t("search.categories")}
                value={stats ? fmt(stats.categories) : "—"}
              />
              <StatTile
                icon={Puzzle}
                label={t("search.indexInfo.withDlc")}
                value={stats ? fmt(stats.dlc) : "—"}
              />
              <StatTile
                icon={Globe}
                label={t("search.indexInfo.onlinePlay")}
                value={stats ? fmt(stats.online) : "—"}
              />
            </div>
          ) : (
            !isLocal && (
              <StatTile
                icon={Gamepad2}
                label={t("search.totalGames")}
                value={fmt(gameCount)}
              />
            )
          )}

          {/* Details */}
          <div className="divide-y divide-border/60 rounded-lg border border-border/60 px-3">
            <DetailRow
              icon={Clock}
              label={
                metadata.customSource ? t("search.lastSynced") : t("search.lastUpdated")
              }
            >
              {indexDate ? (
                <>
                  <span className="font-medium">
                    {formatRelative(indexDate, language)}
                  </span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {indexDate.toLocaleString(language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {t("search.indexInfo.notAvailable")}
                </span>
              )}
            </DetailRow>

            <DetailRow icon={Layers} label={t("search.source")}>
              <span className="font-medium">{sourceName || "—"}</span>
              {metadata.listVersion && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {t("search.indexInfo.version", { version: metadata.listVersion })}
                </span>
              )}
              <CustomSourceLink metadata={metadata} t={t} />
            </DetailRow>

            {isLocal && metadata.localIndexPath && (
              <DetailRow icon={FileJson} label={t("search.indexInfo.location")}>
                <button
                  type="button"
                  title={metadata.localIndexPath}
                  onClick={() =>
                    window.electron?.openFolderPath?.(metadata.localIndexPath)
                  }
                  className="group flex w-full min-w-0 items-center gap-1.5 text-left"
                >
                  <span className="truncate font-mono text-xs text-muted-foreground group-hover:text-primary">
                    {metadata.localIndexPath}
                  </span>
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                </button>
              </DetailRow>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-border/60 bg-muted/20 px-6 py-4">
          {isLocal && metadata.localIndexPath && (
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => window.electron?.openFolderPath?.(metadata.localIndexPath)}
            >
              <FolderOpen className="h-4 w-4" />
              {t("search.indexInfo.openFolder")}
            </Button>
          )}
          <Button
            className="flex-1 gap-2 text-secondary"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            {isLocal ? t("search.refreshLocalIndex") : t("search.switchToLocalIndex")}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
