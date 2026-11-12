import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { getAppBranch } from "@/components/AppBranchPicker";

const DISMISSED_KEY = "live-update-offer-dismissed";

/**
 * True when the user already chose to stay on their branch for this live version
 */
export const isLiveUpdateOfferDismissed = version => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === version;
  } catch {
    return false;
  }
};

/**
 * Offered on a testing branch once live is newer than anything the branch has:
 * switch to live, or stay and wait for the branch's next build
 */
const LiveUpdateOfferDialog = ({ branch, version, open, onOpenChange }) => {
  const { t } = useTranslation();
  const [isSwitching, setIsSwitching] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isSwitching) return;
    const handler = value => setProgress(value);
    window.electron.onBranchSwitchProgress?.(handler);
    return () => window.electron.removeBranchSwitchProgressListener?.(handler);
  }, [isSwitching]);

  if (!version) return null;
  const branchLabel = t(getAppBranch(branch).labelKey);

  const stay = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, version);
    } catch {
      // The offer just shows again next launch
    }
    onOpenChange(false);
  };

  const switchToLive = async event => {
    event.preventDefault();
    setIsSwitching(true);
    setProgress(0);
    try {
      // On success the installer takes over and the app closes
      const result = await window.electron.switchBranch("live");
      if (result?.success) return;
      if (result?.errorType === "notAvailable") {
        toast.error(
          t("settings.appBranch.switchDialog.errors.notAvailable", result.errorData)
        );
      } else if (result?.errorType === "connectionFailed") {
        toast.error(t("settings.appBranch.switchDialog.errors.connectionFailed"));
      } else if (result?.errorType === "timeout") {
        toast.error(t("settings.appBranch.switchDialog.errors.timeout"));
      } else {
        toast.error(result?.error || t("liveUpdateOffer.switchFailed"));
      }
    } catch {
      toast.error(t("liveUpdateOffer.switchFailed"));
    }
    setIsSwitching(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={value => {
        if (!isSwitching) onOpenChange(value);
      }}
    >
      <AlertDialogContent className="border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("liveUpdateOffer.title")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p className="text-foreground">
                {t("liveUpdateOffer.description", { version, branch: branchLabel })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("liveUpdateOffer.stayHint", { branch: branchLabel })}
              </p>
              {isSwitching && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{t("liveUpdateOffer.downloading")}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="text-primary"
            disabled={isSwitching}
            onClick={stay}
          >
            {t("liveUpdateOffer.stay", { branch: branchLabel })}
          </AlertDialogCancel>
          <AlertDialogAction disabled={isSwitching} onClick={switchToLive}>
            {isSwitching ? (
              <span className="flex items-center gap-2">
                <Loader className="h-4 w-4 animate-spin" />
                {t("liveUpdateOffer.switching")}
              </span>
            ) : (
              t("liveUpdateOffer.switch", { version })
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LiveUpdateOfferDialog;
