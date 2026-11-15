import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import {
  ChevronRight,
  Cloud,
  ListEnd,
  Puzzle,
  RefreshCw,
  Smartphone,
  Zap,
} from "lucide-react";

/** Which Ascend features apply to this game, with a join prompt for guests. */
export default function AscendPerks({
  gameName,
  isAuthenticated,
  hasSubscription,
  supportsModManaging,
  supportsFlingTrainer,
  supportsAutoUpdates,
  onGetAscend,
  onBrowseMods,
}) {
  const { t } = useLanguage();
  const perks = [
    { icon: Cloud, label: t("download.cloudSaving") },
    { icon: Smartphone, label: t("download.remoteDownloads") },
    { icon: ListEnd, label: t("download.queueDownloads") },
    supportsModManaging && {
      icon: Puzzle,
      label: t("download.modManaging"),
      onClick: onBrowseMods,
      tooltip: t("download.browseModsTooltip"),
    },
    supportsFlingTrainer && { icon: Zap, label: t("download.trainer") },
    supportsAutoUpdates && { icon: RefreshCw, label: t("download.autoUpdates") },
  ].filter(Boolean);

  return (
    <section className="rounded-xl bg-gradient-to-br from-primary/[0.08] via-card to-primary/[0.04] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("common.ascend")}</h2>
          {(!isAuthenticated || !hasSubscription) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("download.ascendFeaturesLocked", {
                gameName: gameName || "This game",
              })}
            </p>
          )}
        </div>
        {!isAuthenticated && (
          <Button
            size="sm"
            className="shrink-0 font-semibold text-secondary"
            onClick={onGetAscend}
          >
            {t("download.getAscend")}
          </Button>
        )}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {perks.map(({ icon: Icon, label, onClick, tooltip }) => {
          const content = (
            <>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {label}
              </span>
              {onClick && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </>
          );
          return (
            <li key={label} className="min-w-0">
              {onClick ? (
                <button
                  type="button"
                  title={tooltip}
                  onClick={onClick}
                  className="-m-1 flex w-[calc(100%+0.5rem)] min-w-0 items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {content}
                </button>
              ) : (
                <div className="flex min-w-0 items-center gap-2.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
