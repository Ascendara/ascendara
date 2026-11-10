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
import { matchRequirements } from "@/lib/steamMatch";
import { formatBytes } from "@/services/app/systemHealthService";
import steamService from "@/services/games/gameInfoService";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  HelpCircle,
  Info,
  Loader,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

const SPEC_KEYS = ["os", "cpu", "ram", "gpu", "directx"];
const CARD_KEYS = [...SPEC_KEYS, "storage"];

const VERDICT_STYLE = {
  pass: { Icon: CheckCircle2, className: "text-green-500" },
  close: { Icon: AlertCircle, className: "text-amber-500 dark:text-amber-400" },
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
    <span className="mt-1 flex items-start gap-1.5 text-xs font-normal leading-4">
      <Icon className={`mt-px h-3.5 w-3.5 shrink-0 ${className}`} />
      <span className="min-w-0 break-words">
        <span className={`font-medium ${className}`}>
          {t(`download.canRun.${verdict.status}`)}
        </span>
        {detail && <span className="text-muted-foreground"> · {detail}</span>}
      </span>
    </span>
  );
}

function CompareSummary({ verdicts }) {
  const { t } = useLanguage();
  const statuses = Object.values(verdicts).map(verdict => verdict.status);
  const passed = statuses.filter(status => status === "pass").length;
  const worst = statuses.includes("fail")
    ? "fail"
    : statuses.includes("close")
      ? "close"
      : passed > 0
        ? "pass"
        : "unknown";
  const { Icon, className } = VERDICT_STYLE[worst];
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {t("download.canRun.summary", { passed, total: statuses.length })}
    </span>
  );
}

export default function SystemRequirements({
  minReqs: indexReqs,
  gameName,
  steamData,
  downloadSize,
  downloadDirectory,
}) {
  const { t } = useLanguage();
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [systemSpecs, setSystemSpecs] = useState(null);
  const [systemSpecsLoading, setSystemSpecsLoading] = useState(false);
  const [verdicts, setVerdicts] = useState({});
  const [found, setFound] = useState({ title: null, match: null });

  // Unofficial indexes list no requirements: borrow Steam's when the name matches
  const hasIndexReqs = !!indexReqs && CARD_KEYS.some(key => indexReqs[key]);
  useEffect(() => {
    if (hasIndexReqs || !gameName) return undefined;
    let cancelled = false;
    matchRequirements(gameName, {
      known: steamData,
      lookup: steamService.getGameDetails,
    }).then(match => {
      if (!cancelled) setFound({ title: gameName, match });
    });
    return () => {
      cancelled = true;
    };
  }, [hasIndexReqs, gameName, steamData]);

  const matched = !hasIndexReqs && found.title === gameName ? found.match : null;
  const minReqs = hasIndexReqs ? indexReqs : matched?.minReqs;

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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <Cpu className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{t("download.systemRequirements")}</span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 rounded-lg bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/20 hover:text-primary"
          onClick={handleCompare}
        >
          {t("download.compareYourPC")}
        </Button>
      </div>
      <dl className="divide-y divide-border/40 text-sm">
        {CARD_KEYS.filter(key => minReqs[key]).map(key => (
          <div
            key={key}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-4 py-2.5 first:pt-0 last:pb-0"
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(`download.specs.${key}`)}
            </dt>
            <dd className="break-words font-medium leading-5 text-foreground">
              {minReqs[key]}
              {verdicts[key] && <Verdict specKey={key} verdict={verdicts[key]} />}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 space-y-1 border-t border-border/40 pt-3 text-xs leading-relaxed text-muted-foreground">
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{t("download.canRun.notRequired")}</span>
        </p>
        {matched && <p>{t("download.canRun.matchedAs", { name: matched.name })}</p>}
        {hasVerdicts && <p>{t("download.canRun.note")}</p>}
      </div>

      <AlertDialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
        <AlertDialogContent className="max-w-2xl gap-0 border-border bg-background/95 p-6 backdrop-blur-sm">
          <AlertDialogHeader className="mb-5 space-y-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Cpu className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 text-left">
                  <AlertDialogTitle className="mb-0 text-lg leading-tight">
                    {t("download.compareYourPC")}
                  </AlertDialogTitle>
                  {gameName && (
                    <p className="truncate text-sm text-muted-foreground">{gameName}</p>
                  )}
                </div>
              </div>
              {hasVerdicts && <CompareSummary verdicts={verdicts} />}
            </div>
          </AlertDialogHeader>

          {systemSpecsLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : systemSpecs ? (
            <div className="overflow-hidden rounded-xl border border-border/50">
              <div className="grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <div>{t("download.specs.component")}</div>
                <div>{t("download.yourPC")}</div>
                <div>{t("download.required")}</div>
              </div>
              <div className="max-h-[55vh] divide-y divide-border/40 overflow-y-auto">
                {CARD_KEYS.filter(key => minReqs[key]).map(key => {
                  const verdict = verdicts[key];
                  const style = verdict && VERDICT_STYLE[verdict.status];
                  const yours =
                    key === "storage"
                      ? verdict?.have !== undefined
                        ? t("download.canRun.freeSpace", {
                            free: formatBytes(verdict.have),
                          })
                        : null
                      : systemSpecs[key];
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-4 px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        {style ? (
                          <style.Icon className={`h-4 w-4 shrink-0 ${style.className}`} />
                        ) : (
                          <span className="h-4 w-4 shrink-0" />
                        )}
                        {t(`download.specs.${key}`)}
                      </div>
                      <div className="break-words">
                        <span className="text-foreground">{yours || "—"}</span>
                        {verdict && (
                          <span
                            className={`mt-0.5 block text-xs font-medium ${style.className}`}
                          >
                            {t(`download.canRun.${verdict.status}`)}
                          </span>
                        )}
                      </div>
                      <div className="break-words text-muted-foreground">
                        {minReqs[key]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-6 w-6" />
              {t("download.failedToLoadSpecs")}
            </div>
          )}

          <AlertDialogFooter className="mt-5 items-center gap-3 sm:justify-between">
            <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-md">
              {t("download.canRun.notRequired")}
              {hasVerdicts && <> {t("download.canRun.note")}</>}
            </p>
            <AlertDialogCancel className="mt-0">{t("common.close")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
