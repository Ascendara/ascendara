import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { AlertTriangle, History, Library, RotateCcw, Undo2 } from "lucide-react";

const TONES = {
  primary: "border-primary/40 bg-primary/10 text-primary",
  warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-500",
  caution: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

function Notice({ tone, icon: Icon, children, actions }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{children}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}

/** Contextual banners shown above the game header. Renders nothing when empty. */
export default function DownloadNotices({
  showRetryExtraction,
  retryingExtraction,
  onRetryExtraction,
  isGameInstalled,
  onGoToLibrary,
  showAntivirusWarning,
  onEnableProtection,
  onDismissAntivirusWarning,
  olderVersion,
  onBackToLatest,
  onOpenTimemachine,
}) {
  const { t } = useLanguage();

  if (!showRetryExtraction && !isGameInstalled && !showAntivirusWarning && !olderVersion) {
    return null;
  }

  return (
    <div className="space-y-2">
      {olderVersion && (
        <Notice
          tone="primary"
          icon={History}
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                className="text-primary hover:bg-primary/10 hover:text-primary"
                onClick={onOpenTimemachine}
              >
                {t("download.timemachine.otherVersions")}
              </Button>
              <Button size="sm" className="gap-1.5 text-secondary" onClick={onBackToLatest}>
                <Undo2 className="h-3.5 w-3.5" />
                {t("download.timemachine.backToLatest")}
              </Button>
            </>
          }
        >
          <span className="font-medium">{t("download.timemachine.viewingOlderTitle")}</span>{" "}
          {t("download.timemachine.viewingOlder", {
            version: olderVersion.version || t("download.timemachine.unknownVersion"),
            latest: olderVersion.latest || t("download.timemachine.unknownVersion"),
          })}
        </Notice>
      )}

      {showRetryExtraction && (
        <Notice
          tone="warning"
          icon={RotateCcw}
          actions={
            <Button
              size="sm"
              className="text-secondary"
              onClick={onRetryExtraction}
              disabled={retryingExtraction}
            >
              {t("downloads.retryExtraction")}
            </Button>
          }
        >
          {t(
            "downloads.retryRetainedDescription",
            "Retry extraction using the files already downloaded for this game."
          )}
        </Notice>
      )}

      {isGameInstalled && (
        <Notice
          tone="primary"
          icon={Library}
          actions={
            <Button size="sm" className="text-secondary" onClick={onGoToLibrary}>
              <Library className="mr-2 h-3 w-3" />
              {t("download.goToLibrary") || "Go to Library"}
            </Button>
          }
        >
          <span className="font-medium">
            {t("download.alreadyInstalled") ||
              "You already have this game installed in your library."}
          </span>
        </Notice>
      )}

      {showAntivirusWarning && (
        <Notice
          tone="warning"
          icon={AlertTriangle}
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                className="text-yellow-600/70 hover:bg-yellow-500/10 hover:text-yellow-600 dark:text-yellow-500/70"
                onClick={onDismissAntivirusWarning}
              >
                {t("download.dontShowAgain")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-yellow-500/40 text-yellow-600 hover:bg-yellow-500/20 dark:text-yellow-500"
                onClick={onEnableProtection}
              >
                {t("download.enableProtection")}
              </Button>
            </>
          }
        >
          <span className="font-medium">{t("download.antivirusWarning")}:</span>{" "}
          {t("download.antivirusWarningDesc")}
        </Notice>
      )}
    </div>
  );
}
