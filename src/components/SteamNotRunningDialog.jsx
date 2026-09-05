import React, { useState } from "react";
import { Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SteamNotRunningDialog = ({ open, onClose, t }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleStartSteam = async () => {
    setIsLoading(true);
    await window.electron.startSteam();

    // Wait for 2 seconds then close
    setTimeout(() => {
      setIsLoading(false);
      onClose();
    }, 2000);
  };

  const handleDontShowAgain = () => {
    localStorage.setItem("hideSteamWarning", "true");
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("library.steamNotRunning")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-muted-foreground">
            {t("library.steamNotRunningMessage")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={handleDontShowAgain}
          >
            {t("gameScreen.dontShowSteamWarning")}
          </Button>

          <Button
            className="text-secondary"
            onClick={handleStartSteam}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("gameScreen.startingSteam")}
              </>
            ) : (
              t("gameScreen.startSteam")
            )}
          </Button>

          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("common.ok")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default SteamNotRunningDialog;
