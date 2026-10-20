import { motion } from "framer-motion";
import { AlertTriangle, CircleCheck, Loader } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";

/**
 * Progress bar and friendly status line for a download folder check.
 * check comes from useDownloadFolderCheck.
 */
export function DownloadFolderCheckProgress({ check }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center gap-3 px-1 pt-1">
        {check.state !== "done" ? (
          <Loader className="h-5 w-5 shrink-0 animate-spin text-primary" />
        ) : check.passed ? (
          <CircleCheck className="h-5 w-5 shrink-0 text-green-500" />
        ) : (
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
        )}
        <p className="text-sm font-medium">
          {t(`downloadFolderCheck.stage.${check.stage.message}`)}
        </p>
      </div>
      <Progress
        value={check.stage.value}
        className={`${check.stage.barClass} ${
          check.state === "done" && !check.passed ? "[&>div]:bg-amber-500" : ""
        }`}
      />
    </>
  );
}

/**
 * Outcome box shown once a check finishes. children render under the
 * explanation, for actions like protecting the folder.
 */
export function DownloadFolderCheckResult({ check, children }) {
  const { t } = useTranslation();
  if (check.state !== "done") return null;
  const issue = check.basicFailed
    ? "basic"
    : check.antivirusIssue
      ? "antivirus"
      : "download";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left ${
        check.passed
          ? "border-green-500/40 bg-green-500/10"
          : "border-amber-500/30 bg-amber-500/10"
      }`}
    >
      {check.passed ? (
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
      ) : (
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      )}
      <div className="space-y-1 text-sm">
        {check.passed ? (
          <p className="font-semibold">{t("downloadFolderCheck.passed")}</p>
        ) : (
          <>
            <p className="font-semibold">
              {t(`downloadFolderCheck.errors.${issue}Title`)}
            </p>
            <p className="text-muted-foreground">
              {t(`downloadFolderCheck.errors.${issue}`)}
            </p>
            {children}
            {check.errors && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  {t("downloadFolderCheck.details")}
                </summary>
                <p className="mt-1 whitespace-pre-line break-words font-mono">
                  {check.errors}
                </p>
              </details>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
