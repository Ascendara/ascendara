import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/context/LanguageContext";
import { Check, Info, Lock } from "lucide-react";
import AscendLogo from "@/components/AscendLogo";

/**
 * What one Ascend feature does for this game, with the next step: browsing
 * mods, joining Ascend, or just closing.
 * @param {{ id: string, icon: Function } | null} perk - kept while closing so the
 *   content stays put during the close animation
 */
export default function AscendPerkDialog({
  perk,
  open,
  gameName,
  locked,
  onOpenChange,
  onGetAscend,
  onBrowseMods,
}) {
  const { t } = useLanguage();
  if (!perk) return null;

  const key = `download.perkDialog.${perk.id}`;
  const name = gameName || t("download.perkDialog.thisGame");
  const points = [1, 2, 3].map(n => t(`${key}.point${n}`));
  // Only some features have a caveat worth knowing
  const note = t(`${key}.note`, { gameName: name, defaultValue: "" });
  const Icon = perk.icon;
  const close = () => onOpenChange(false);
  const browse = perk.id === "mods" && !locked && onBrowseMods;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pb-5 pt-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
              <Icon className="h-6 w-6 text-primary" />
            </span>
            <DialogHeader className="min-w-0 space-y-1.5 text-left sm:text-left">
              <Badge
                variant="outline"
                className="w-fit gap-1 border-primary/30 bg-primary/10 text-[10px] uppercase tracking-wide text-primary"
              >
                {locked ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <AscendLogo className="h-3.5 w-3.5" />
                )}
                {locked
                  ? t("download.perkDialog.partOfAscend")
                  : t("download.perkDialog.included")}
              </Badge>
              <DialogTitle className="mb-0 text-xl leading-tight">
                {t(`${key}.title`)}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                {t(`${key}.body`, { gameName: name })}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="space-y-4 px-6 pb-2">
          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("download.perkDialog.howItWorks")}
            </p>
            <ul className="space-y-2.5">
              {points.map(point => (
                <li key={point} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Check className="h-2.5 w-2.5 text-primary" />
                  </span>
                  <span className="text-foreground/90">{point}</span>
                </li>
              ))}
            </ul>
          </div>
          {note && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{note}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-6 py-4">
          {locked ? (
            <>
              <Button variant="outline" onClick={close}>
                {t("download.perkDialog.notNow")}
              </Button>
              <Button
                className="font-semibold text-secondary"
                onClick={() => {
                  close();
                  onGetAscend?.();
                }}
              >
                {t("download.getAscend")}
              </Button>
            </>
          ) : browse ? (
            <>
              <Button variant="outline" onClick={close}>
                {t("download.perkDialog.close")}
              </Button>
              <Button
                className="text-secondary"
                onClick={() => {
                  close();
                  onBrowseMods();
                }}
              >
                {t("download.perkDialog.browseMods")}
              </Button>
            </>
          ) : (
            <Button className="text-secondary" onClick={close}>
              {t("download.perkDialog.gotIt")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
