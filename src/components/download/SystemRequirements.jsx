import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { Cpu, Loader } from "lucide-react";
import { useState } from "react";

const SPEC_KEYS = ["os", "cpu", "ram", "gpu", "directx"];

export default function SystemRequirements({ minReqs }) {
  const { t } = useLanguage();
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [systemSpecs, setSystemSpecs] = useState(null);
  const [systemSpecsLoading, setSystemSpecsLoading] = useState(false);

  if (!minReqs) return null;

  const handleCompare = async () => {
    setShowCompareDialog(true);
    setSystemSpecsLoading(true);
    try {
      const specs = await window.electron.fetchSystemSpecs();
      setSystemSpecs(specs);
    } catch (err) {
      console.error("Failed to fetch system specs:", err);
    } finally {
      setSystemSpecsLoading(false);
    }
  };

  return (
    <section className="rounded-xl bg-card p-5 shadow">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Cpu className="h-4 w-4 text-primary" />
          {t("download.systemRequirements")}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 bg-primary/10 text-xs text-primary hover:bg-primary/20 hover:text-primary"
          onClick={handleCompare}
        >
          {t("download.compareYourPC")}
        </Button>
      </div>
      <dl className="divide-y divide-border/40 text-sm">
        {SPEC_KEYS.filter(key => minReqs[key]).map(key => (
          <div key={key} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="shrink-0 text-muted-foreground">
              {t(`download.specs.${key}`)}
            </dt>
            <dd className="text-right font-medium text-foreground">{minReqs[key]}</dd>
          </div>
        ))}
      </dl>

      <AlertDialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
        <AlertDialogContent className="max-w-2xl border-border bg-background/95 p-6 backdrop-blur-sm">
          <AlertDialogHeader className="mb-4">
            <AlertDialogTitle>{t("download.compareYourPC")}</AlertDialogTitle>
          </AlertDialogHeader>

          {systemSpecsLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : systemSpecs ? (
            <div className="overflow-hidden rounded-lg border border-border/50">
              <div className="grid grid-cols-3 bg-primary/10">
                <div className="p-3 text-sm font-semibold text-muted-foreground">
                  {t("download.specs.component")}
                </div>
                <div className="border-l border-border/30 p-3 text-sm font-semibold text-primary">
                  {t("download.yourPC")}
                </div>
                <div className="border-l border-border/30 p-3 text-sm font-semibold text-primary">
                  {t("download.required")}
                </div>
              </div>
              {SPEC_KEYS.map(key => (
                <div
                  key={key}
                  className="grid grid-cols-3 border-t border-border/30 even:bg-card/30"
                >
                  <div className="p-3 text-sm font-medium text-muted-foreground">
                    {t(`download.specs.${key}`)}
                  </div>
                  <div className="border-l border-border/30 p-3 text-sm text-foreground">
                    {systemSpecs[key]}
                  </div>
                  <div className="border-l border-border/30 p-3 text-sm text-foreground">
                    {minReqs[key] || "-"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              {t("download.failedToLoadSpecs")}
            </div>
          )}

          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>{t("common.close")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
