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
  AlertCircle,
  AlertTriangle,
  CircleCheck,
  Cloud,
  CloudUpload,
  FolderOpen,
  FolderSync,
  ListOrdered,
  Loader,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ScrollArea } from "./ui/scroll-area";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Card, CardContent } from "./ui/card";
import {
  uploadBackup,
  listBackups as listCloudBackups,
  getBackupDownloadUrl,
  deleteBackup,
} from "@/services/firebaseService";

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
  const [autoCloudBackupEnabled, setAutoCloudBackupEnabled] = useState(() => {
    // Load saved preference from localStorage
    const saved = localStorage.getItem(`cloudBackup_${game.game || game.name}`);
    return saved === "true";
  });
  const [backupsList, setBackupsList] = useState([]);
  const [cloudBackupsList, setCloudBackupsList] = useState([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [loadBackupsError, setLoadBackupsError] = useState(null);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [isUploadingToCloud, setIsUploadingToCloud] = useState(false);
  const [restoringCloudBackup, setRestoringCloudBackup] = useState(null);
  const { t } = useLanguage();
  const { settings } = useSettings();
  const { user, userData } = useAuth();

  // Check if user has active Ascend subscription or is verified (verified users get free Ascend)
  const hasActiveSubscription =
    userData?.verified ||
    (userData?.subscription?.status === "active" && !userData?.subscription?.isTrial);

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

  const handleBackupGame = async (uploadToCloud = false) => {
    setActiveScreen("backup");
    setIsBackingUp(true);
    setBackupFailed(false);
    setBackupSuccess(false);
    setBackupDetails({ error: null });

    try {
      const gameName = game.game || game.name;

      // Call the electron API to backup the game
      const result = await window.electron.ludusavi("backup", gameName);

      if (!result?.success) {
        setBackupFailed(true);
        if (result?.error) {
          setBackupDetails({ error: result.error });
        }
        throw new Error(result?.error || "Backup failed");
      }

      // Mark local backup as complete
      setIsBackingUp(false);

      toast.success(t("library.backups.backupSuccess"), {
        description: t("library.backups.backupSuccessDesc", {
          game: game.game || game.name,
        }),
      });

      // Upload to cloud if requested and user is authenticated
      let cloudUploadSuccess = true;
      if (uploadToCloud && user && autoCloudBackupEnabled) {
        cloudUploadSuccess = await handleUploadBackupToCloud(result);
      }

      // Mark entire operation as complete only if cloud upload succeeded (or wasn't attempted)
      if (cloudUploadSuccess) {
        setBackupSuccess(true);
      } else {
        setBackupFailed(true);
      }
    } catch (error) {
      console.error("Backup failed:", error);
      setBackupFailed(true);
      setIsBackingUp(false);
      toast.error(t("library.backups.backupFailed"));
    }
  };

  const handleUploadBackupToCloud = async backupResult => {
    if (!user) {
      toast.error("Please sign in to Ascend to use cloud backups");
      return false;
    }

    setIsUploadingToCloud(true);
    try {
      const gameName = game.game || game.name;
      const backupLocation = settings.ludusavi?.backupLocation;

      if (!backupLocation) {
        throw new Error("Backup location not configured in settings");
      }

      // Construct the path to the game's backup folder
      const gameBackupFolder = `${backupLocation}/${gameName}`;

      // Get list of backup files in the game folder
      const backupFiles = await window.electron.listBackupFiles(gameBackupFolder);
      if (!backupFiles || backupFiles.length === 0) {
        throw new Error("No backup files found in backup directory");
      }

      // Find the most recent .zip backup file
      const zipBackups = backupFiles.filter(f => f.endsWith(".zip"));
      if (zipBackups.length === 0) {
        throw new Error("No zip backup files found");
      }

      // Sort by filename (which includes timestamp) and get the most recent
      const latestBackup = zipBackups.sort().reverse()[0];
      const backupPath = `${gameBackupFolder}/${latestBackup}`;

      // Read the backup file
      const backupFile = await window.electron.readBackupFile(backupPath);
      if (!backupFile) {
        throw new Error("Failed to read backup file");
      }

      // Create a File object from the backup data
      const blob = new Blob([backupFile], { type: "application/zip" });
      const file = new File([blob], latestBackup, { type: "application/zip" });

      // Upload to cloud
      const uploadResult = await uploadBackup(
        file,
        gameName,
        `Auto backup - ${new Date().toLocaleString()}`
      );

      if (uploadResult.success) {
        toast.success("Backup uploaded to cloud successfully");
        return true;
      } else if (uploadResult.code === "SUBSCRIPTION_REQUIRED") {
        toast.error("Cloud backups require an active Ascend subscription");
        return false;
      } else {
        throw new Error(uploadResult.error);
      }
    } catch (error) {
      console.error("Failed to upload backup to cloud:", error);
      toast.error("Failed to upload backup to cloud: " + error.message);
      return false;
    } finally {
      setIsUploadingToCloud(false);
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
      const gameName = game.game || game.name;

      // Determine the latest backup if not specified
      let backupToRestore = specificBackup;
      if (!backupToRestore) {
        // Merge and sort all backups by timestamp to find the latest
        const allBackups = [
          ...backupsList.map(b => ({ ...b, source: "local" })),
          ...cloudBackupsList.map(b => ({ ...b, source: "cloud" })),
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (allBackups.length > 0) {
          backupToRestore = allBackups[0];
        }
      }

      // If it's a cloud backup, use the cloud restore flow
      if (backupToRestore && backupToRestore.isCloud) {
        await handleRestoreCloudBackup(backupToRestore);
        return;
      }

      // Call the electron API to restore the local backup
      const result = await window.electron.ludusavi(
        "restore",
        gameName,
        backupToRestore ? backupToRestore.name : null
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

  const handleRestoreCloudBackup = async cloudBackup => {
    setRestoringCloudBackup(cloudBackup.backupId);
    setActiveScreen("restore");
    setIsRestoring(true);
    setRestoreFailed(false);
    setRestoreSuccess(false);
    setRestoreDetails({ error: null });

    try {
      const gameName = cloudBackup.gameName;
      const backupLocation = settings.ludusavi?.backupLocation;
      let backupFilePath = null;
      let needsCleanup = false;

      // Check if backup exists locally first
      if (backupLocation) {
        try {
          const gameBackupFolder = `${backupLocation}/${gameName}`;
          const backupFiles = await window.electron.listBackupFiles(gameBackupFolder);

          if (backupFiles && backupFiles.length > 0) {
            // Check if this specific backup exists locally by matching the backup name
            const localBackup = backupFiles.find(
              f => f.includes(cloudBackup.name) || f === `${cloudBackup.name}.zip`
            );

            if (localBackup) {
              backupFilePath = `${gameBackupFolder}/${localBackup}`;
              toast.info("Restoring from local backup...");
            }
          }
        } catch (localCheckErr) {
          console.warn("Failed to check for local backup:", localCheckErr);
        }
      }

      // If not found locally, download from cloud
      if (!backupFilePath) {
        // Get download URL from backend
        const result = await getBackupDownloadUrl(cloudBackup.backupId);
        if (!result.downloadUrl) {
          if (result.code === "SUBSCRIPTION_REQUIRED") {
            toast.error("Active Ascend subscription required");
          } else {
            toast.error(result.error || "Failed to get download URL");
          }
          setRestoreFailed(true);
          setRestoreDetails({ error: result.error || "Failed to get download URL" });
          setRestoringCloudBackup(null);
          setIsRestoring(false);
          return;
        }

        // Download the backup file
        toast.info("Downloading backup from cloud...");

        const response = await fetch(result.downloadUrl);
        if (!response.ok) {
          throw new Error("Failed to download backup file");
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Save to temp location
        const tempPath = await window.electron.getTempPath();
        // Sanitize filename to remove invalid characters for Windows file paths
        const sanitizedName = cloudBackup.name
          .replace(/[<>:"/\\|?*]/g, "_")
          .replace(/\s+/g, "_");
        backupFilePath = `${tempPath}/${sanitizedName}.zip`;
        await window.electron.writeFile(backupFilePath, uint8Array);
        needsCleanup = true;
      }

      // Extract and restore using Ludusavi
      toast.info("Restoring backup...");

      const restoreResult = await window.electron.ludusavi({
        action: "restore",
        gameName: gameName,
        path: backupFilePath,
      });

      if (restoreResult.success) {
        setRestoreSuccess(true);
        toast.success(t("library.backups.restoreSuccess"), {
          description: t("library.backups.restoreSuccessDesc", {
            game: gameName,
          }),
        });
      } else {
        setRestoreFailed(true);
        setRestoreDetails({ error: restoreResult.error || "Restore failed" });
        toast.error(restoreResult.error || "Failed to restore backup");
      }

      // Clean up temp file if we downloaded it
      if (needsCleanup) {
        try {
          await window.electron.deleteFile(backupFilePath);
        } catch (cleanupErr) {
          console.warn("Failed to clean up temp file:", cleanupErr);
        }
      }
    } catch (e) {
      console.error("Failed to restore cloud backup:", e);
      setRestoreFailed(true);
      setRestoreDetails({ error: e.message });
      toast.error("Failed to restore backup: " + e.message);
    } finally {
      setRestoringCloudBackup(null);
      setIsRestoring(false);
    }
  };

  const openBackupFolder = () => {
    window.electron.openGameDirectory("backupDir");
  };

  const handleListBackups = async () => {
    setActiveScreen("backupsList");
    setIsLoadingBackups(true);
    setLoadBackupsError(null);
    setBackupsList([]);
    setCloudBackupsList([]);

    try {
      const gameName = game.game || game.name;

      // Load local backups
      const result = await window.electron.ludusavi("list-backups", gameName);

      if (!result?.success) {
        setLoadBackupsError(result?.error || "Failed to load backups");
        throw new Error(result?.error || "Failed to load backups");
      }

      // Parse the returned data structure
      const data = result.data;
      let gameBackups = [];

      if (data && data.games && data.games[gameName] && data.games[gameName].backups) {
        gameBackups = data.games[gameName].backups.map(backup => ({
          name: backup.name,
          timestamp: backup.when,
          os: backup.os,
          locked: backup.locked,
          path: data.games[gameName].backupPath,
          isLocal: true,
        }));

        setBackupsList(gameBackups);
      } else {
        setBackupsList([]);
      }

      // Load cloud backups if user is authenticated and has subscription
      if (user && hasActiveSubscription) {
        try {
          const cloudResult = await listCloudBackups(gameName);
          if (!cloudResult.error && cloudResult.backups) {
            const cloudBackups = cloudResult.backups.map(backup => {
              // Check if this backup also exists locally
              const existsLocally = gameBackups.some(
                local =>
                  local.name.includes(backup.backupName) ||
                  backup.backupName.includes(local.name)
              );

              return {
                backupId: backup.backupId,
                name: backup.backupName,
                timestamp: backup.createdAt,
                gameName: backup.gameName,
                size: backup.size,
                isCloud: true,
                existsLocally: existsLocally,
              };
            });
            setCloudBackupsList(cloudBackups);
          }
        } catch (cloudError) {
          console.error("Failed to load cloud backups:", cloudError);
          // Don't fail the whole operation if cloud backups fail
        }
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
    <div className="space-y-6 py-4">
      {/* Main Action - Backup Now */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 transition-all hover:border-primary/50 hover:shadow-lg">
        <CardContent className="p-6">
          <Button
            className="flex h-14 w-full items-center justify-center gap-3 bg-gradient-to-r from-primary/90 to-primary text-lg font-semibold text-secondary hover:from-primary hover:to-primary/90"
            onClick={() => handleBackupGame(autoCloudBackupEnabled)}
            disabled={isBackingUp || isUploadingToCloud}
          >
            {autoCloudBackupEnabled && user ? (
              <CloudUpload className="h-6 w-6" />
            ) : (
              <Save className="h-6 w-6" />
            )}
            <span>
              {t("library.backups.backupNow", { game: game.game || game.name })}
            </span>
          </Button>
        </CardContent>
      </Card>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-muted/60 transition-all hover:border-primary/40 hover:shadow-md">
          <CardContent className="p-5">
            <Button
              className="flex h-full w-full flex-col items-center justify-center gap-3 py-6"
              variant="outline"
              onClick={showRestoreConfirmation}
              disabled={!settings.ludusavi.enabled}
            >
              <div className="rounded-full bg-primary/10 p-3">
                <RotateCcw className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-medium">
                {t("library.backups.restoreLatest")}
              </span>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-muted/60 transition-all hover:border-primary/40 hover:shadow-md">
          <CardContent className="p-5">
            <Button
              className="flex h-full w-full flex-col items-center justify-center gap-3 py-6"
              variant="outline"
              onClick={handleListBackups}
            >
              <div className="rounded-full bg-primary/10 p-3">
                <ListOrdered className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-medium">
                {t("library.backups.listBackups")}
              </span>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-muted/60 transition-all hover:border-primary/40 hover:shadow-md">
          <CardContent className="p-5">
            <Button
              className="flex h-full w-full flex-col items-center justify-center gap-3 py-6"
              variant="outline"
              onClick={openBackupFolder}
            >
              <div className="rounded-full bg-primary/10 p-3">
                <FolderOpen className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-medium">
                {t("library.backups.openBackupFolder")}
              </span>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-4" />

      {/* Settings Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">
          {t("library.backups.settings")}
        </h3>

        <Card className="border-muted/40 transition-all hover:border-muted/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor="autoBackup"
                  className="flex items-center gap-2 text-base font-semibold"
                >
                  <div className="rounded-full bg-primary/10 p-1.5">
                    <FolderSync className="h-4 w-4 text-primary" />
                  </div>
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

        {/* Cloud Backup Toggle - shown to all users */}
        <Card
          className={`border-2 transition-all duration-300 ${
            user && hasActiveSubscription
              ? "border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-purple-500/5 hover:border-blue-500/50"
              : "border-muted/40 hover:border-muted/60"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-x-2">
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor="autoCloudBackup"
                  className="flex items-center gap-2 text-base font-medium"
                >
                  <div
                    className={`rounded-full p-1.5 ${
                      user && hasActiveSubscription
                        ? "bg-gradient-to-br from-blue-500 to-purple-500"
                        : "bg-muted"
                    }`}
                  >
                    <Cloud className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span
                    className={
                      user && hasActiveSubscription
                        ? "bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text font-semibold text-transparent"
                        : ""
                    }
                  >
                    {t("library.backups.autoCloudBackup")}
                  </span>
                  {user && hasActiveSubscription && (
                    <span className="ml-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white">
                      Active
                    </span>
                  )}
                </Label>
                <span className="block text-sm text-muted-foreground">
                  {user && hasActiveSubscription
                    ? t("library.backups.autoCloudBackupDesc")
                    : !user
                      ? "Sign in to Ascend to unlock cloud backups and keep your saves safe across devices"
                      : "Upgrade to Ascend Premium to unlock cloud backups and protect your game saves"}
                </span>
                {!user && (
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs text-blue-500 hover:text-blue-600"
                    onClick={() => (window.location.hash = "#/ascend")}
                  >
                    Learn more about Ascend →
                  </Button>
                )}
                {user && !hasActiveSubscription && (
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs text-blue-500 hover:text-blue-600"
                    onClick={() => (window.location.hash = "#/ascend")}
                  >
                    Upgrade to Premium →
                  </Button>
                )}
              </div>
              <Switch
                id="autoCloudBackup"
                checked={autoCloudBackupEnabled}
                onCheckedChange={checked => {
                  if (!user) {
                    toast.error("Please sign in to Ascend to use cloud backups", {
                      description: "Cloud backups require an Ascend account",
                    });
                    return;
                  }
                  if (!hasActiveSubscription) {
                    toast.error("Cloud backups require Ascend Premium", {
                      description: "Upgrade to Premium to unlock cloud backups",
                      action: {
                        label: "Upgrade",
                        onClick: () => (window.location.hash = "#/ascend"),
                      },
                    });
                    return;
                  }
                  setAutoCloudBackupEnabled(checked);
                  // Save preference to localStorage
                  localStorage.setItem(
                    `cloudBackup_${game.game || game.name}`,
                    checked.toString()
                  );
                  toast.success(
                    checked ? "Cloud backups enabled" : "Cloud backups disabled",
                    {
                      description: checked
                        ? "Backups will be automatically uploaded to cloud"
                        : "Backups will only be stored locally",
                    }
                  );
                }}
                disabled={!user || !hasActiveSubscription}
                className={`${
                  user && hasActiveSubscription
                    ? "data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-blue-500 data-[state=checked]:to-purple-500"
                    : "opacity-50"
                }`}
              />
            </div>
          </CardContent>
        </Card>
      </div>
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

  const renderBackupScreen = () => {
    // Determine step states
    const localBackupComplete = !isBackingUp && (isUploadingToCloud || backupSuccess);
    const cloudUploadComplete =
      !isUploadingToCloud && backupSuccess && autoCloudBackupEnabled && user;
    const showCloudStep = autoCloudBackupEnabled && user;

    return (
      <div className="space-y-4 py-2">
        {/* Step Progress Indicator */}
        {(isBackingUp || isUploadingToCloud || backupSuccess) && (
          <div className="mb-6 flex items-center justify-center gap-3 px-4">
            {/* Step 1: Local Backup */}
            <div className="flex items-center gap-3 transition-all duration-300">
              <div
                className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 ${
                  isBackingUp
                    ? "scale-110 border-2 border-primary bg-primary/20 shadow-lg shadow-primary/20"
                    : localBackupComplete
                      ? "border-2 border-green-500 bg-green-500/20 shadow-lg shadow-green-500/20"
                      : "border-2 border-muted bg-muted"
                }`}
              >
                {isBackingUp ? (
                  <>
                    <Loader className="h-5 w-5 animate-spin text-primary" />
                    <div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
                  </>
                ) : localBackupComplete ? (
                  <CircleCheck className="h-5 w-5 text-green-500" />
                ) : (
                  <Save className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col">
                <span
                  className={`text-sm font-semibold transition-colors duration-300 ${
                    isBackingUp
                      ? "text-primary"
                      : localBackupComplete
                        ? "text-green-500"
                        : "text-muted-foreground"
                  }`}
                >
                  Local Backup
                </span>
                {isBackingUp && (
                  <span className="animate-pulse text-xs text-muted-foreground">
                    In progress...
                  </span>
                )}
                {localBackupComplete && (
                  <span className="text-xs text-green-500">Complete</span>
                )}
              </div>
            </div>

            {/* Connector Line with Animation */}
            {showCloudStep && (
              <div className="relative h-0.5 w-16 overflow-hidden rounded-full bg-muted">
                <div
                  className={`absolute inset-0 bg-gradient-to-r from-green-500 to-blue-500 transition-transform duration-500 ${
                    localBackupComplete ? "translate-x-0" : "-translate-x-full"
                  }`}
                />
              </div>
            )}

            {/* Step 2: Cloud Upload */}
            {showCloudStep && (
              <div className="flex items-center gap-3 transition-all duration-300">
                <div
                  className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 ${
                    isUploadingToCloud
                      ? "scale-110 border-2 border-blue-500 bg-gradient-to-br from-blue-500/20 to-purple-500/20 shadow-lg shadow-blue-500/20"
                      : cloudUploadComplete
                        ? "border-2 border-green-500 bg-green-500/20 shadow-lg shadow-green-500/20"
                        : "border-2 border-muted bg-muted"
                  }`}
                >
                  {isUploadingToCloud ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin text-blue-500" />
                      <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/10" />
                    </>
                  ) : cloudUploadComplete ? (
                    <CircleCheck className="h-5 w-5 text-green-500" />
                  ) : (
                    <CloudUpload className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span
                    className={`text-sm font-semibold transition-colors duration-300 ${
                      isUploadingToCloud
                        ? "bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent"
                        : cloudUploadComplete
                          ? "text-green-500"
                          : "text-muted-foreground"
                    }`}
                  >
                    Cloud Upload
                  </span>
                  {isUploadingToCloud && (
                    <span className="animate-pulse text-xs text-muted-foreground">
                      Uploading...
                    </span>
                  )}
                  {cloudUploadComplete && (
                    <span className="text-xs text-green-500">Complete</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Local Backup in Progress */}
        {isBackingUp && (
          <Card className="border-primary/20 bg-primary/5 duration-300 animate-in fade-in">
            <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
              <div className="relative">
                <div className="rounded-full bg-primary/10 p-4">
                  <Loader className="h-10 w-10 animate-spin text-primary" />
                </div>
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/5" />
              </div>
              <div className="text-center">
                <h3 className="mb-1 text-lg font-semibold">
                  {t("library.backups.backingUpDescription", {
                    game: game.game || game.name,
                  })}
                </h3>
                <span className="block animate-pulse text-sm text-muted-foreground">
                  {t("library.backups.waitingBackup")}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cloud Upload in Progress */}
        {!isBackingUp && isUploadingToCloud && (
          <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-purple-500/10 duration-500 animate-in fade-in slide-in-from-bottom-4">
            <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
              <div className="relative">
                <div className="rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-4">
                  <Loader className="h-10 w-10 animate-spin text-blue-500" />
                </div>
                <div className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10" />
              </div>
              <div className="text-center">
                <h3 className="mb-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 bg-clip-text text-xl font-bold text-transparent duration-300 animate-in zoom-in">
                  Uploading to Cloud
                </h3>
                <span className="block animate-pulse text-sm text-muted-foreground">
                  Securing your backup in the cloud...
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Complete Success */}
        {!isBackingUp && !isUploadingToCloud && backupSuccess && (
          <Card className="border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/10 duration-500 animate-in fade-in zoom-in">
            <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
              <div className="relative">
                <div className="rounded-full bg-green-500/20 p-4">
                  <CircleCheck className="h-10 w-10 text-green-500" />
                </div>
                <div
                  className="absolute inset-0 animate-ping rounded-full bg-green-500/10"
                  style={{ animationIterationCount: 1 }}
                />
              </div>
              <div className="text-center">
                <h3 className="mb-2 text-xl font-bold text-green-500">
                  {autoCloudBackupEnabled && user
                    ? "Backup Complete!"
                    : t("library.backups.backupSuccess")}
                </h3>
                <span className="block text-sm text-muted-foreground">
                  {autoCloudBackupEnabled && user
                    ? `${game.game || game.name} has been backed up locally and uploaded to cloud storage.`
                    : t("library.backups.backupSuccessDesc", {
                        game: game.game || game.name,
                      })}
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
  };

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

      {!isLoadingBackups &&
        !loadBackupsError &&
        backupsList.length === 0 &&
        cloudBackupsList.length === 0 && (
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

      {!isLoadingBackups &&
        !loadBackupsError &&
        (backupsList.length > 0 || cloudBackupsList.length > 0) && (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {/* Unified Backups List - Sorted by timestamp */}
              {(() => {
                // Merge and sort all backups by timestamp (newest first)
                const allBackups = [
                  ...backupsList.map(b => ({ ...b, source: "local" })),
                  ...cloudBackupsList.map(b => ({ ...b, source: "cloud" })),
                ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                return allBackups.map((backup, index) => {
                  const isCloud = backup.isCloud || backup.source === "cloud";
                  const isLocal = backup.isLocal || backup.source === "local";

                  return (
                    <Card
                      key={`backup-${index}-${backup.backupId || backup.name}`}
                      className={`cursor-pointer transition-colors ${
                        isCloud
                          ? "border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-purple-500/5 hover:border-blue-500/50"
                          : "border-muted/60 hover:border-primary/40"
                      }`}
                      onClick={() => {
                        if (isCloud) {
                          handleRestoreCloudBackup(backup);
                        } else {
                          handleSelectBackup(backup);
                        }
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex flex-col">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {new Date(backup.timestamp).toLocaleString()}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {backup.name}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            {isCloud && (
                              <span className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white">
                                <Cloud className="mr-1 inline h-3 w-3" />
                                Cloud
                              </span>
                            )}
                            {(isLocal || backup.existsLocally) && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                <FolderSync className="mr-1 inline h-3 w-3" />
                                Local
                              </span>
                            )}
                            {backup.size && (
                              <span className="text-xs text-muted-foreground">
                                {(backup.size / 1024 / 1024).toFixed(2)} MB
                              </span>
                            )}
                          </div>
                          {backup.path && (
                            <span className="mt-1 truncate text-xs text-muted-foreground">
                              {backup.path}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                });
              })()}
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
      <AlertDialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <AlertDialogHeader className="flex-shrink-0">
          <AlertDialogTitle className="flex items-center gap-3 text-2xl font-bold text-foreground">
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
        </AlertDialogHeader>
        <ScrollArea className="flex-1 overflow-y-auto px-1">
          <div className="text-sm text-muted-foreground">{renderContent()}</div>
        </ScrollArea>
        <AlertDialogFooter className="flex-shrink-0">
          {renderFooterButtons()}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default GamesBackupDialog;
