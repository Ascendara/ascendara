import React, { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  AlertTriangle,
  CircleCheck,
  Loader,
  FileSearch,
  RefreshCw,
  FileWarning,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { toast } from "sonner";
import { ScrollArea } from "./ui/scroll-area";
import { Card, CardContent } from "./ui/card";
import { Separator } from "./ui/separator";

const VerifyingGameDialog = ({ game, open, onOpenChange }) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLegacyGame, setIsLegacyGame] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [downloadingData, setDownloadingData] = useState({
    verifyError: [],
    verifying: false,
  });
  const { t } = useLanguage();

  const fetchGameData = async () => {
    try {
      const games = await window.electron.getGames();
      const currentGame = games.find(g => g.game === game.game || g.game === game.name);
      if (currentGame?.downloadingData) {
        setDownloadingData(currentGame.downloadingData);
      }
    } catch (error) {
      console.error("Error fetching game data:", error);
    }
  };

  const handleVerifyGame = async () => {
    setIsVerifying(true);
    setIsLegacyGame(false);
    setVerificationFailed(false);
    setDownloadingData(prev => ({ ...prev, verifying: true, verifyError: [] }));

    try {
      const result = await window.electron.verifyGame(game.game || game.name);

      if (
        result.error?.includes("ENOENT") &&
        result.error?.includes("filemap.ascendara.json")
      ) {
        setIsLegacyGame(true);
      } else {
        // Wait 2 seconds before checking status
        await new Promise(resolve => setTimeout(resolve, 2000));
        await fetchGameData();

        if (!result.success) {
          setVerificationFailed(true);
          if (result.errors) {
            setDownloadingData(prev => ({ ...prev, verifyError: result.errors }));
          }
          throw new Error(result.error);
        }
        toast.success(t("downloads.verificationSuccess"), {
          description: t("downloads.verificationSuccessDesc"),
        });
      }
    } catch (error) {
      console.error("Verification failed:", error);
      if (
        error.message?.includes("ENOENT") &&
        error.message?.includes("filemap.ascendara.json")
      ) {
        setIsLegacyGame(true);
      } else {
        setVerificationFailed(true);
        toast.error(t("downloads.verificationFailed"));
      }
    } finally {
      setIsVerifying(false);
      setDownloadingData(prev => ({ ...prev, verifying: false }));
    }
  };

  useEffect(() => {
    if (open) {
      handleVerifyGame();
    }
  }, [open]);

  const hasVerifyError =
    downloadingData.verifyError && downloadingData.verifyError.length > 0;
  const isVerifyingGame = downloadingData.verifying;

  const renderVerifyingContent = () => (
    <Card className="mb-4 border-primary/20">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-3 text-primary">
          <Loader className="h-5 w-5 animate-spin" />
          <span className="font-medium">{t("downloads.verifying")}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {t("downloads.verifyingDescription")}
        </span>
      </CardContent>
    </Card>
  );

  const renderSuccessContent = () => (
    <Card className="mb-4 border-green-500/30 bg-green-500/5">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-3 text-green-500">
          <CircleCheck className="h-5 w-5" />
          <span className="font-medium">{t("downloads.verificationSuccess")}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {t("downloads.verificationSuccessDesc")}
        </span>
      </CardContent>
    </Card>
  );

  const renderLegacyContent = () => (
    <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-3 text-amber-500">
          <FileWarning className="h-5 w-5" />
          <span className="font-medium">{t("library.cannotVerifyFiles")}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {t("downloads.actions.legacyGameVerification")}
        </span>
      </CardContent>
    </Card>
  );

  const renderErrorContent = () => (
    <div className="space-y-4">
      <Card className="border-destructive/30 bg-destructive/5 mb-4">
        <CardContent className="space-y-4 p-4">
          <div className="text-destructive flex items-center gap-3">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              {downloadingData.verifyError.length === 1
                ? t("downloads.verificationFailed1", {
                    numFailed: downloadingData.verifyError.length,
                  })
                : t("downloads.verificationFailed2", {
                    numFailed: downloadingData.verifyError.length,
                  })}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            {t("downloads.verificationFailedDesc")}
          </span>
        </CardContent>
      </Card>

      <Card className="border-muted/40">
        <CardContent className="p-4">
          <ScrollArea className="h-[200px] w-full rounded-md">
            <div className="space-y-2">
              {downloadingData.verifyError.map((error, index) => (
                <div
                  key={index}
                  className="border-b border-border pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span className="font-medium">{error.file}</span>
                  <div className="mt-1 text-muted-foreground">
                    <span>{error.error}</span>
                    {error.expected_size && (
                      <div className="mt-1">
                        Expected size: {error.expected_size} bytes
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <a
          className="inline-flex cursor-pointer items-center text-sm text-primary hover:underline"
          onClick={() => {
            window.electron.openURL(
              "https://ascendara.app/docs/troubleshooting/common-issues#verification-issues"
            );
          }}
        >
          {t("common.learnMore")}
        </a>
      </div>
    </div>
  );

  const renderActionButtons = () => (
    <div className="space-y-4">
      {(hasVerifyError || verificationFailed) && !isVerifyingGame && !isLegacyGame && (
        <Card className="border-primary/20 transition-colors hover:border-primary/40">
          <CardContent className="p-4">
            <Button
              className="flex w-full items-center justify-between bg-gradient-to-r from-primary/80 to-primary hover:from-primary hover:to-primary/90"
              onClick={handleVerifyGame}
              disabled={isVerifyingGame}
            >
              <div className="flex items-center gap-2 text-secondary">
                <RefreshCw className="h-5 w-5" />
                <span>{t("downloads.verifyAgain")}</span>
              </div>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-muted/60 transition-colors hover:border-muted">
        <CardContent className="p-4">
          <Button
            className="w-full"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isVerifyingGame}
          >
            {t("common.ok")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FileSearch className="h-6 w-6 text-primary" />
            {isLegacyGame ? t("library.cannotVerifyFiles") : t("library.verifyGameFiles")}
          </AlertDialogTitle>
          <span className="text-sm text-muted-foreground">
            <div className="py-2">
              {isVerifyingGame && renderVerifyingContent()}

              {!isVerifyingGame &&
                !hasVerifyError &&
                !isVerifying &&
                !isLegacyGame &&
                !verificationFailed &&
                renderSuccessContent()}

              {!isVerifyingGame && isLegacyGame && renderLegacyContent()}

              {!isVerifyingGame &&
                (hasVerifyError || verificationFailed) &&
                !isLegacyGame &&
                renderErrorContent()}

              <Separator className="my-4" />

              {renderActionButtons()}
            </div>
          </span>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default VerifyingGameDialog;
