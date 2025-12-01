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
  FolderSync,
  FolderOpen,
  RotateCcw,
  Save,
  AlertCircle,
  ListOrdered,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { toast } from "sonner";
import { ScrollArea } from "./ui/scroll-area";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Card, CardContent } from "./ui/card";

const GamesBackupDialog = ({ game, open, onOpenChange }) => {
  const [activeScreen, setActiveScreen] = useState("options"); // options, backup, restore, restoreConfirm, backupsList
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupFailed, setBackupFailed] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [backupDetails, setBackupDetails] = useState({ error: null });
  const [restoreDetails, setRestoreDetails] = useState({ error: null });
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [backupsList, setBackupsList] = useState([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [loadBackupsError, setLoadBackupsError] = useState(null);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const { t } = useLanguage();
  const { settings } = useSettings();

  useEffect(() => {
    if (open) {
      // Reset states when dialog opens
      setActiveScreen("options");
      setBackupFailed(false);
      setRestoreFailed(false);
      setBackupSuccess(false);
      setRestoreSuccess(false);
      (async () => {
        try {
          const enabled = await window.electron.isGameAutoBackupsEnabled(
            game.game || game.name,
            game.isCustom
          );
          setAutoBackupEnabled(!!enabled);
        } catch (e) {
          setAutoBackupEnabled(false);
        }
      })();
    }
  }, [open, game]);

  const handleToggleAutoBackup = async newBackupState => {
    try {
      if (newBackupState) {
        await window.electron.enableGameAutoBackups(
          game.game || game.name,
          game.isCustom
        );
        toast.success(t("library.backups.autoBackupEnabled"), {
          description: t("library.backups.autoBackupEnabledDesc", {
            game: game.game || game.name,
          }),
        });
      } else {
        await window.electron.disableGameAutoBackups(
          game.game || game.name,
          game.isCustom
        );
        toast.success(t("library.backups.autoBackupDisabled"), {
          description: t("library.backups.autoBackupDisabledDesc", {
            game: game.game || game.name,
          }),
        });
      }
      setAutoBackupEnabled(newBackupState);
    } catch (error) {
      console.error("Error toggling auto-backup:", error);
      toast.error(t("common.error"), {
        description: t("library.backups.autoBackupToggleError"),
      });
    }
  };

  const handleBackupGame = async () => {
    setActiveScreen("backup");
    setIsBackingUp(true);
    setBackupFailed(false);
    setBackupSuccess(false);
    setBackupDetails({ error: null });

    try {
      // Call the electron API to backup the game
      const result = await window.electron.ludusavi("backup", game.game || game.name);

      if (!result?.success) {
        setBackupFailed(true);
        if (result?.error) {
          setBackupDetails({ error: result.error });
        }
        throw new Error(result?.error || "Backup failed");
      }

      setBackupSuccess(true);

      toast.success(t("library.backups.backupSuccess"), {
        description: t("library.backups.backupSuccessDesc", {
          game: game.game || game.name,
        }),
      });
    } catch (error) {
      console.error("Backup failed:", error);
      setBackupFailed(true);
      toast.error(t("library.backups.backupFailed"));
    } finally {
      setIsBackingUp(false);
    }
  };

  const showRestoreConfirmation = () => {
    setActiveScreen("restoreConfirm");
  };

  const handleRestoreBackup = async (specificBackup = null) => {
    setActiveScreen("restore");
    setIsRestoring(true);
    setRestoreFailed(false);
    setRestoreSuccess(false);
    setRestoreDetails({ error: null });

    try {
      // Call the electron API to restore the backup
      // If specificBackup is provided, use it for the restore
      const result = await window.electron.ludusavi(
        "restore",
        game.game || game.name,
        specificBackup ? specificBackup.name : null
      );

      if (!result?.success) {
        setRestoreFailed(true);
        if (result?.error) {
          setRestoreDetails({ error: result.error });
        }
        throw new Error(result?.error || "Restore failed");
      }

      setRestoreSuccess(true);

      toast.success(t("library.backups.restoreSuccess"), {
        description: t("library.backups.restoreSuccessDesc", {
          game: game.game || game.name,
        }),
      });
    } catch (error) {
      console.error("Restore failed:", error);
      setRestoreFailed(true);
      toast.error(t("library.backups.restoreFailed"));
    } finally {
      setIsRestoring(false);
      setSelectedBackup(null);
    }
  };

  const handleSelectBackup = backup => {
    setSelectedBackup(backup);
    setActiveScreen("restoreSpecificConfirm");
  };

  const openBackupFolder = () => {
    window.electron.openGameDirectory("backupDir");
  };

  const handleListBackups = async () => {
    setActiveScreen("backupsList");
    setIsLoadingBackups(true);
    setLoadBackupsError(null);
    setBackupsList([]);

    try {
      // Call the electron API to list backups
      const result = await window.electron.ludusavi(
        "list-backups",
        game.game || game.name
      );

      if (!result?.success) {
        setLoadBackupsError(result?.error || "Failed to load backups");
        throw new Error(result?.error || "Failed to load backups");
      }

      // Parse the returned data structure
      const data = result.data;
      const gameName = game.game || game.name;

      if (data && data.games && data.games[gameName] && data.games[gameName].backups) {
        const gameBackups = data.games[gameName].backups.map(backup => ({
          name: backup.name,
          timestamp: backup.when,
          os: backup.os,
          locked: backup.locked,
          path: data.games[gameName].backupPath,
        }));

        setBackupsList(gameBackups);
      } else {
        // No backups found for this game
        setBackupsList([]);
      }
    } catch (error) {
      console.error("Failed to load backups:", error);
      setLoadBackupsError(error.message || "Failed to load backups");
      toast.error(t("library.backups.loadBackupsFailed"));
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const renderOptionsScreen = () => (
    <div className="space-y-6 py-2">
      <div className="grid grid-cols-1 gap-4">
        <Card className="border-primary/20 transition-colors hover:border-primary/40">
          <CardContent className="p-4">
            <Button
              className="flex w-full items-center justify-between bg-gradient-to-r from-primary/80 to-primary hover:from-primary hover:to-primary/90"
              onClick={handleBackupGame}
            >
              <div className="flex items-center gap-2 text-secondary">
                <Save className="h-5 w-5" />
                <span>
                  {t("library.backups.backupNow", { game: game.game || game.name })}
                </span>
              </div>
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="border-muted/60 transition-colors hover:border-muted">
            <CardContent className="p-4">
              <Button
                className="flex h-full w-full flex-col items-center justify-center gap-2 py-4"
                variant="outline"
                onClick={showRestoreConfirmation}
                disabled={!settings.ludusavi.enabled}
              >
                <RotateCcw className="h-5 w-5" />
                <span className="text-sm">{t("library.backups.restoreLatest")}</span>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-muted/60 transition-colors hover:border-muted">
            <CardContent className="p-4">
              <Button
                className="flex h-full w-full flex-col items-center justify-center gap-2 py-4"
                variant="outline"
                onClick={openBackupFolder}
              >
                <FolderOpen className="h-5 w-5" />
                <span className="text-sm">{t("library.backups.openBackupFolder")}</span>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-muted/60 transition-colors hover:border-muted">
          <CardContent className="p-4">
            <Button
              className="flex w-full items-center justify-between"
              variant="outline"
              onClick={handleListBackups}
            >
              <div className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5" />
                <span>{t("library.backups.listBackups")}</span>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-2" />

      <Card className="border-muted/40">
        <CardContent className="p-4">
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-1">
              <Label htmlFor="autoBackup" className="text-base font-medium">
                {t("library.backups.autoBackupOnGameClose")}
              </Label>
              <span className="block text-sm text-muted-foreground">
                {t("library.backups.autoBackupDesc")}
              </span>
            </div>
            <Switch
              id="autoBackup"
              checked={autoBackupEnabled}
              onCheckedChange={handleToggleAutoBackup}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderRestoreConfirmScreen = () => (
    <div className="space-y-4 py-2">
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
          <div className="rounded-full bg-amber-500/10 p-3">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <div className="text-center">
            <h3 className="mb-2 text-lg font-medium text-amber-500">
              {t("library.backups.restoreWarningTitle")}
            </h3>
            <span className="mb-2 block text-sm">
              {t("library.backups.restoreWarningDesc", { game: game.game || game.name })}
            </span>
            <span className="mb-2 block text-sm font-medium">
              {t("library.backups.restoreWarningOverwrite")}
            </span>
            <span className="block text-sm text-muted-foreground">
              {t("library.backups.restoreWarningGameClosed")}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderBackupScreen = () => (
    <div className="space-y-4 py-2">
      {isBackingUp && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <div className="rounded-full bg-primary/10 p-3">
              <Loader className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <h3 className="mb-1 text-lg font-medium">
                {t("library.backups.backingUpDescription", {
                  game: game.game || game.name,
                })}
              </h3>
              <span className="block text-sm text-muted-foreground">
                {t("library.backups.waitingBackup")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {!isBackingUp && backupSuccess && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <div className="rounded-full bg-green-500/10 p-3">
              <CircleCheck className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <h3 className="mb-1 text-lg font-medium text-green-500">
                {t("library.backups.backupSuccess")}
              </h3>
              <span className="block text-sm">
                {t("library.backups.backupSuccessDesc", { game: game.game || game.name })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {!isBackingUp && backupFailed && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <div className="bg-destructive/10 rounded-full p-3">
              <AlertTriangle className="text-destructive h-8 w-8" />
            </div>
            <div className="text-center">
              <h3 className="text-destructive mb-1 text-lg font-medium">
                {t("library.backups.backupFailed")}
              </h3>
              {backupDetails.error && (
                <ScrollArea className="border-destructive/20 mt-2 h-[100px] w-full rounded-md border p-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">{backupDetails.error}</span>
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderRestoreScreen = () => (
    <div className="space-y-4 py-2">
      {isRestoring && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <div className="rounded-full bg-primary/10 p-3">
              <Loader className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <h3 className="mb-1 text-lg font-medium">
                {t("library.backups.restoringDescription", {
                  game: game.game || game.name,
                })}
              </h3>
              <span className="block text-sm text-muted-foreground">
                {t("library.backups.waitingRestore")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {!isRestoring && restoreSuccess && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <div className="rounded-full bg-green-500/10 p-3">
              <CircleCheck className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <h3 className="mb-1 text-lg font-medium text-green-500">
                {t("library.backups.restoreSuccess")}
              </h3>
              <span className="block text-sm">
                {t("library.backups.restoreSuccessDesc", {
                  game: game.game || game.name,
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {!isRestoring && restoreFailed && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <div className="bg-destructive/10 rounded-full p-3">
              <AlertTriangle className="text-destructive h-8 w-8" />
            </div>
            <div className="text-center">
              <h3 className="text-destructive mb-1 text-lg font-medium">
                {t("library.backups.restoreFailed")}
              </h3>
              {restoreDetails.error && (
                <ScrollArea className="border-destructive/20 mt-2 h-[100px] w-full rounded-md border p-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">{restoreDetails.error}</span>
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderRestoreSpecificConfirmScreen = () => (
    <div className="space-y-4 py-2">
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
          <div className="rounded-full bg-amber-500/10 p-3">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <div className="text-center">
            <h3 className="mb-2 text-lg font-medium text-amber-500">
              {t("library.backups.restoreWarningTitle")}
            </h3>
            <span className="mb-2 block text-sm">
              {t("library.backups.restoreSpecificWarningDesc", {
                game: game.game || game.name,
                backup: selectedBackup
                  ? new Date(selectedBackup.timestamp).toLocaleString()
                  : "",
              })}
            </span>
            <span className="mb-2 block text-sm font-medium">
              {t("library.backups.restoreWarningOverwrite")}
            </span>
            <span className="block text-sm text-muted-foreground">
              {t("library.backups.restoreWarningGameClosed")}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderBackupsListScreen = () => (
    <div className="space-y-4 py-2">
      {isLoadingBackups && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <div className="rounded-full bg-primary/10 p-3">
              <Loader className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <h3 className="mb-1 text-lg font-medium">
                {t("library.backups.loadingBackups")}
              </h3>
              <span className="block text-sm text-muted-foreground">
                {t("library.backups.pleaseWait")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoadingBackups && loadBackupsError && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <div className="bg-destructive/10 rounded-full p-3">
              <AlertTriangle className="text-destructive h-8 w-8" />
            </div>
            <div className="text-center">
              <h3 className="text-destructive mb-1 text-lg font-medium">
                {t("library.backups.loadBackupsFailed")}
              </h3>
              {loadBackupsError && (
                <ScrollArea className="border-destructive/20 mt-2 h-[100px] w-full rounded-md border p-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">{loadBackupsError}</span>
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoadingBackups && !loadBackupsError && backupsList.length === 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <div className="rounded-full bg-amber-500/10 p-3">
              <AlertCircle className="h-8 w-8 text-amber-500" />
            </div>
            <div className="text-center">
              <h3 className="mb-1 text-lg font-medium text-amber-500">
                {t("library.backups.noBackupsFound")}
              </h3>
              <span className="block text-sm">
                {t("library.backups.createBackupFirst")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoadingBackups && !loadBackupsError && backupsList.length > 0 && (
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {backupsList.map((backup, index) => (
              <Card
                key={index}
                className="cursor-pointer border-muted/60 transition-colors hover:border-primary/40"
                onClick={() => handleSelectBackup(backup)}
              >
                <CardContent className="p-3">
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {new Date(backup.timestamp).toLocaleString()}
                      </span>
                      <span className="text-sm text-muted-foreground">{backup.name}</span>
                    </div>
                    {backup.path && (
                      <span className="truncate text-xs text-muted-foreground">
                        {backup.path}
                      </span>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {backup.os}
                      </span>
                      {backup.locked && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
                          {t("library.backups.locked")}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeScreen) {
      case "backup":
        return renderBackupScreen();
      case "restore":
        return renderRestoreScreen();
      case "restoreConfirm":
        return renderRestoreConfirmScreen();
      case "restoreSpecificConfirm":
        return renderRestoreSpecificConfirmScreen();
      case "backupsList":
        return renderBackupsListScreen();
      case "options":
      default:
        return renderOptionsScreen();
    }
  };

  const renderFooterButtons = () => {
    if (activeScreen === "options") {
      return (
        <Button
          variant="outline"
          className="text-primary"
          onClick={() => onOpenChange(false)}
        >
          {t("common.close")}
        </Button>
      );
    }

    if (activeScreen === "restoreConfirm") {
      return (
        <>
          <Button
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={handleRestoreBackup}
          >
            {t("library.backups.restoreButton")}
          </Button>
          <Button
            variant="outline"
            className="text-primary"
            onClick={() => setActiveScreen("options")}
          >
            {t("common.cancel")}
          </Button>
        </>
      );
    }

    if (activeScreen === "restoreSpecificConfirm") {
      return (
        <>
          <Button
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={() => handleRestoreBackup(selectedBackup)}
          >
            {t("library.backups.restoreButton")}
          </Button>
          <Button
            variant="outline"
            className="text-primary"
            onClick={() => {
              setSelectedBackup(null);
              setActiveScreen("backupsList");
            }}
          >
            {t("common.cancel")}
          </Button>
        </>
      );
    }

    if (activeScreen === "backupsList") {
      return (
        <Button
          variant="outline"
          className="text-primary"
          onClick={() => setActiveScreen("options")}
          disabled={isLoadingBackups}
        >
          {t("common.back")}
        </Button>
      );
    }

    if (activeScreen === "backup") {
      return (
        <>
          {backupFailed && !isBackingUp && (
            <Button
              className="bg-primary/90 text-secondary hover:bg-primary"
              onClick={handleBackupGame}
              disabled={isBackingUp}
            >
              {t("library.backups.tryAgain")}
            </Button>
          )}
          <Button
            variant="outline"
            className="text-primary"
            onClick={() => setActiveScreen("options")}
            disabled={isBackingUp}
          >
            {isBackingUp ? t("common.close") : t("common.back")}
          </Button>
        </>
      );
    }

    if (activeScreen === "restore") {
      return (
        <>
          {restoreFailed && !isRestoring && (
            <Button
              className="text-primary-foreground bg-primary/90 hover:bg-primary"
              onClick={handleRestoreBackup}
              disabled={isRestoring}
            >
              {t("library.backups.tryAgain")}
            </Button>
          )}
          <Button
            variant="outline"
            className="text-primary"
            onClick={() => setActiveScreen("options")}
            disabled={isRestoring}
          >
            {isRestoring ? t("common.close") : t("common.back")}
          </Button>
        </>
      );
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            {activeScreen === "options" ? (
              <div className="flex items-center gap-2">
                <FolderSync className="h-5 w-5 text-primary" />
                {t("library.backups.gameBackupTitle")}
              </div>
            ) : activeScreen === "backup" ? (
              isBackingUp ? (
                t("library.backups.creatingBackup")
              ) : (
                t("library.backups.backupResult")
              )
            ) : activeScreen === "restoreConfirm" ? (
              t("library.backups.confirmRestore")
            ) : activeScreen === "restoreSpecificConfirm" ? (
              t("library.backups.confirmSpecificRestore")
            ) : activeScreen === "backupsList" ? (
              t("library.backups.backupsList")
            ) : isRestoring ? (
              t("library.backups.restoringBackup")
            ) : (
              t("library.backups.restoreResult")
            )}
          </AlertDialogTitle>
          {/* Wrap the content in a span instead of using AlertDialogDescription directly */}
          <span className="text-sm text-muted-foreground">{renderContent()}</span>
        </AlertDialogHeader>
        <AlertDialogFooter>{renderFooterButtons()}</AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default GamesBackupDialog;
