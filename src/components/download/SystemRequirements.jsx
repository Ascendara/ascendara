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
import { checkCanRun } from "@/lib/canRunCheck";
import { formatBytes } from "@/services/app/systemHealthService";
import { CheckCircle2, Cpu, HelpCircle, Loader, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

const SPEC_KEYS = ["os", "cpu", "ram", "gpu", "directx"];
const CARD_KEYS = [...SPEC_KEYS, "storage"];

const VERDICT_STYLE = {
  pass: { Icon: CheckCircle2, className: "text-green-500" },
  fail: { Icon: XCircle, className: "text-red-500 dark:text-red-400" },
  unknown: { Icon: HelpCircle, className: "text-muted-foreground" },
};

// Room on the emptiest-looking games folder: the folder is picked when the
// download starts, so any one that fits counts
async function loadFreeSpace(downloadDirectory) {
  if (!downloadDirectory) return undefined;
  const space = await window.electron.getDriveSpace(downloadDirectory);
  const free = (space?.directories || [])
    .filter(entry => !entry.error)
    .map(entry => entry.freeSpace);
  return free.length ? Math.max(...free) : undefined;
}

function verdictDetail(key, verdict, t) {
  if (key === "storage" && verdict.have !== undefined) {
    return verdict.status === "fail"
      ? t("download.canRun.needsSpace", {
          free: formatBytes(verdict.have),
          needed: formatBytes(verdict.needed),
        })
      : t("download.canRun.freeSpace", { free: formatBytes(verdict.have) });
  }
  if (verdict.have === undefined) return null;
  const value = key === "ram" ? formatBytes(verdict.have) : verdict.have;
  return t("download.canRun.yours", { value });
}

function Verdict({ specKey, verdict }) {
  const { t } = useLanguage();
  const { Icon, className } = VERDICT_STYLE[verdict.status];
  const detail = verdictDetail(specKey, verdict, t);
  return (
    <span className={`mt-0.5 flex items-center justify-end gap-1 text-xs ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>
        {t(`download.canRun.${verdict.status}`)}
        {detail && <span className="text-muted-foreground"> · {detail}</span>}
      </span>
    </span>
  );
}

export default function SystemRequirements({ minReqs, downloadSize, downloadDirectory }) {
  const { t } = useLanguage();
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [systemSpecs, setSystemSpecs] = useState(null);
  const [systemSpecsLoading, setSystemSpecsLoading] = useState(false);
  const [verdicts, setVerdicts] = useState({});

  useEffect(() => {
    if (!minReqs) return undefined;
    let cancelled = false;
    Promise.all([
      window.electron.fetchSystemSpecs(),
      loadFreeSpace(downloadDirectory).catch(() => undefined),
    ])
      .then(([specs, freeSpace]) => {
        if (!cancelled) {
          setVerdicts(checkCanRun(minReqs, specs, { freeSpace, downloadSize }));
        }
      })
      .catch(error => console.error("Failed to check system requirements:", error));
    return () => {
      cancelled = true;
    };
  }, [minReqs, downloadSize, downloadDirectory]);

  if (!minReqs) return null;
  const hasVerdicts = Object.keys(verdicts).length > 0;

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
        {CARD_KEYS.filter(key => minReqs[key]).map(key => (
          <div key={key} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="shrink-0 text-muted-foreground">
              {t(`download.specs.${key}`)}
            </dt>
            <dd className="text-right font-medium text-foreground">
              {minReqs[key]}
              {verdicts[key] && <Verdict specKey={key} verdict={verdicts[key]} />}
            </dd>
          </div>
        ))}
      </dl>
      {hasVerdicts && (
        <p className="mt-3 text-xs text-muted-foreground">{t("download.canRun.note")}</p>
      )}

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
