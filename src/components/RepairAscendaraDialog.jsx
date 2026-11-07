import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import UpdateOverlay from "@/components/UpdateOverlay";

/**
 * Offer to reinstall Ascendara when files it ships with are missing, which
 * happens when antivirus quarantines one of the helper programs
 */
const RepairAscendaraDialog = ({ open, onOpenChange, missingFiles = [] }) => {
  const { t } = useTranslation();
  const [isRepairing, setIsRepairing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isRepairing) return;
    const handler = value => setProgress(value);
    window.electron.onRepairProgress?.(handler);
    return () => window.electron.removeRepairProgressListener?.(handler);
  }, [isRepairing]);

  const repair = async () => {
    setProgress(0);
    setIsRepairing(true);
    // The app restarts into the finishing screen, which reads these flags
    await window.electron.setTimestampValue("isUpdating", true);
    await window.electron.setTimestampValue("isRepairing", true);
    try {
      const result = await window.electron.repairAscendara();
      if (!result?.success) {
        // Repairs share the branch switch's download, and its error types
        const errorKey = `settings.appBranch.switchDialog.errors.${result?.errorType}`;
        throw new Error(
          result?.errorType ? t(errorKey, result.errorData) : result?.error
        );
      }
    } catch (error) {
      await window.electron.setTimestampValue("isUpdating", false);
      await window.electron.setTimestampValue("isRepairing", false);
      setIsRepairing(false);
      onOpenChange(false);
      toast.error(t("app.repair.failed", { error: error.message }));
    }
  };

  if (isRepairing) {
    return (
      <UpdateOverlay
        title={t("app.repair.overlayTitle")}
        description={t("app.repair.overlayDescription")}
        detail={progress < 100 ? t("app.repair.downloading", { progress }) : null}
        progress={progress}
      />
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("app.repair.title")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-muted-foreground">
              <p>{t("app.repair.description")}</p>
              {missingFiles.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("app.repair.missingFiles")}
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm">
                    {missingFiles.map(file => (
                      <li key={file} className="font-mono">
                        {file}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm">{t("app.repair.note")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <Button
            variant="outline"
            className="text-primary"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button className="bg-primary text-secondary" onClick={repair}>
            {t("app.repair.repair")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RepairAscendaraDialog;
