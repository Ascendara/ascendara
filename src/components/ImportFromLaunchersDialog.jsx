import { ChevronRight, HardDrive, UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useLanguage } from "@/context/LanguageContext";
import { storeNames } from "@/lib/storeLibrary";

function Option({ icon: Icon, title, description, badge, status, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-4 rounded-xl border border-border/60 bg-card p-4 text-left outline-none transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
          {description}
        </span>
        {status && <span className="mt-2 block text-xs font-medium text-primary">{status}</span>}
      </span>
      <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

// One place to start when bringing games over from other launchers. It explains
// the two ways in plain words, then hands off to the matching flow.
export default function ImportFromLaunchersDialog({
  open,
  onOpenChange,
  onScanThisPC,
  onConnectStores,
  connectedStores = [],
  isScanning = false,
}) {
  const { t } = useLanguage();
  const connectedNames = connectedStores.map(store => storeNames[store]).join(", ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] gap-0 border-border bg-background p-0 text-foreground sm:max-w-lg">
        <DialogHeader className="px-6 pb-4 pt-6 text-left">
          <DialogTitle className="pr-6">{t("library.importChooser.title")}</DialogTitle>
          <DialogDescription className="pr-6 leading-relaxed">
            {t("library.importChooser.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 pb-6">
          <Option
            icon={HardDrive}
            title={t("library.importChooser.scanTitle")}
            description={t("library.importChooser.scanDescription")}
            badge={t("library.importChooser.recommended")}
            status={isScanning ? t("library.importChooser.scanRunning") : null}
            onClick={onScanThisPC}
          />
          <Option
            icon={UserRound}
            title={t("library.importChooser.storesTitle")}
            description={t("library.importChooser.storesDescription")}
            status={
              connectedStores.length
                ? t("library.importChooser.storesConnected", { stores: connectedNames })
                : null
            }
            onClick={onConnectStores}
          />
          <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
            {t("library.importChooser.hint")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
