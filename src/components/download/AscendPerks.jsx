import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { Cloud, ListEnd, Puzzle, RefreshCw, Smartphone, Zap } from "lucide-react";

/** Which Ascend features apply to this game, with a join prompt for guests. */
export default function AscendPerks({
  gameName,
  isAuthenticated,
  hasSubscription,
  supportsModManaging,
  supportsFlingTrainer,
  supportsAutoUpdates,
  onGetAscend,
}) {
  const { t } = useLanguage();
  const perks = [
    { icon: Cloud, label: t("download.cloudSaving") },
    { icon: Smartphone, label: t("download.remoteDownloads") },
    { icon: ListEnd, label: t("download.queueDownloads") },
    supportsModManaging && { icon: Puzzle, label: t("download.modManaging") },
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
        {perks.map(({ icon: Icon, label }) => (
          <li key={label} className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
              <Icon className="h-4 w-4 text-primary" />
            </span>
            <span className="truncate text-sm font-medium text-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
