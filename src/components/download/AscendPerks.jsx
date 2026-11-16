import { useState } from "react";
import { Button } from "@/components/ui/button";
import AscendLogo from "@/components/AscendLogo";
import AscendPerkDialog from "@/components/download/AscendPerkDialog";
import { useLanguage } from "@/context/LanguageContext";
import {
  ChevronRight,
  Cloud,
  ListEnd,
  Lock,
  Puzzle,
  RefreshCw,
  Smartphone,
  Zap,
} from "lucide-react";

/**
 * Which Ascend features apply to this game, with a join prompt for anyone
 * without access. Each one opens a dialog that explains it.
 */
export default function AscendPerks({
  gameName,
  isAuthenticated,
  hasAccess,
  supportsModManaging,
  supportsFlingTrainer,
  supportsAutoUpdates,
  onGetAscend,
  onBrowseMods,
}) {
  const { t } = useLanguage();
  const [openPerk, setOpenPerk] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const locked = !isAuthenticated || !hasAccess;
  const name = gameName || t("download.perkDialog.thisGame");
  const perks = [
    { id: "cloudSaves", icon: Cloud, label: t("download.cloudSaving") },
    { id: "remote", icon: Smartphone, label: t("download.remoteDownloads") },
    { id: "queue", icon: ListEnd, label: t("download.queueDownloads") },
    supportsModManaging && { id: "mods", icon: Puzzle, label: t("download.modManaging") },
    supportsFlingTrainer && { id: "trainer", icon: Zap, label: t("download.trainer") },
    supportsAutoUpdates && {
      id: "autoUpdates",
      icon: RefreshCw,
      label: t("download.autoUpdates"),
    },
  ].filter(Boolean);
  const showPerk = perk => {
    setOpenPerk(perk);
    setDialogOpen(true);
  };

  return (
    <section className="overflow-hidden rounded-xl bg-card shadow">
      <header className="flex items-start gap-3 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-5 pb-4 pt-5">
        <AscendLogo className="h-9 w-9 shrink-0 drop-shadow-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="mb-0 text-sm font-semibold leading-tight text-foreground">
              {t("common.ascend")}
            </h2>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {locked && <Lock className="h-2.5 w-2.5" />}
              {locked
                ? t("download.perkDialog.partOfAscend")
                : t("download.perkDialog.included")}
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {locked
              ? t("download.ascendFeaturesLocked", { gameName: name })
              : t("download.perksHint", { gameName: name })}
          </p>
        </div>
      </header>

      <ul className="divide-y divide-border/50 px-2 pb-2">
        {perks.map(perk => (
          <li key={perk.id}>
            <button
              type="button"
              title={t("download.perkDialog.learnAbout", { name: perk.label })}
              onClick={() => showPerk(perk)}
              className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primary/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15 transition-colors group-hover:bg-primary/20">
                <perk.icon className="h-4 w-4 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-tight text-foreground">
                  {perk.label}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {t(`download.perkDialog.${perk.id}.short`)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          </li>
        ))}
      </ul>

      {locked && (
        <div className="border-t border-border/60 px-5 py-4">
          <Button className="w-full font-semibold text-secondary" onClick={onGetAscend}>
            {t("download.getAscend")}
          </Button>
        </div>
      )}

      <AscendPerkDialog
        perk={openPerk}
        open={dialogOpen}
        gameName={gameName}
        locked={locked}
        onOpenChange={setDialogOpen}
        onGetAscend={onGetAscend}
        onBrowseMods={onBrowseMods}
      />
    </section>
  );
}
