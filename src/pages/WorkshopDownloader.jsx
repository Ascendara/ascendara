import React, { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wallpaper,
  FolderOpen,
  ArrowRight,
  Settings2,
  Coffee,
  Link,
  Download,
  Loader,
  DownloadCloud,
  ExternalLink,
  Package,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const WorkshopDownloader = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const [isSetup, setIsSetup] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadLogs, setDownloadLogs] = useState([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showFailureDialog, setShowFailureDialog] = useState(false);
  const [installLogs, setInstallLogs] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const isSteamCMDInstalled = await window.electron.isSteamCMDInstalled();
        setIsSetup(isSteamCMDInstalled);
      } catch (error) {
        console.error("Error checking SteamCMD installation:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSetup();
  }, []);

  useEffect(() => {
    // Set up download progress listener
    const removeDownloadListener = window.electron.onDownloadProgress(data => {
      setDownloadLogs(prev => [...prev, data.message]);
    });

    // Set up install progress listener
    const removeInstallListener = window.electron.onInstallProgress(data => {
      setInstallLogs(prev => [...prev, data.message]);
    });

    // Cleanup listeners on unmount
    return () => {
      removeDownloadListener();
      removeInstallListener();
    };
  }, []);

  const handleNext = async () => {
    if (step === 2) {
      setIsInstalling(true);
      setInstallLogs([]);
      try {
        const result = await window.electron.installSteamCMD();
        if (result.success) {
          setInstallLogs(prev => [...prev, "Installation completed successfully!"]);
          toast.success(t("workshopDownloader.installSuccess"));
          setIsSetup(true);
          setStep(step + 1);
        } else {
          setInstallLogs(prev => [...prev, `Installation failed: ${result.message || "Unknown error"}`]);
          toast.error(t("workshopDownloader.installError"));
        }
      } finally {
        setIsInstalling(false);
      }
    } else {
      setStep(step + 1);
    }
  };

  const renderMainInterface = () => {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="flex flex-col items-center justify-center space-y-6 text-center"
      >
        <Link className="h-16 w-16 text-primary" />
        <h2 className="text-2xl font-bold">{t("workshopDownloader.mainTitle")}</h2>
        <p className="max-w-xl text-muted-foreground">
          {t("workshopDownloader.mainDescription")}&nbsp;
          <a
            className="cursor-pointer items-center text-primary hover:underline"
            onClick={() =>
              window.electron.openURL("https://steamcommunity.com/workshop/browse")
            }
          >
            {t("workshopDownloader.goToWorkshop")}
            <ExternalLink className="mb-1 ml-1 inline-flex h-4 w-4" />
          </a>
        </p>

        <div className="w-full max-w-md space-y-4">
          <Input
            value={wallpaperUrl}
            onChange={e => setWallpaperUrl(e.target.value)}
            placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=XXXXXXXXXX"
            className="placeholder:text-xs"
          />
        </div>
        <div className="flex w-full max-w-md items-center space-x-2">
          <Button
            size="lg"
            className="flex-grow text-secondary"
            disabled={isDownloading || !wallpaperUrl}
            onClick={async () => {
              if (wallpaperUrl) {
                setIsDownloading(true);
                setDownloadLogs([]);
                try {
                  const result = await window.electron.downloadItem(wallpaperUrl);
                  if (result.success) {
                    toast.success(t("workshopDownloader.downloadSuccess"));
                  } else {
                    // Check if the error message indicates a download failure
                    if (result.message.includes("Workshop item download failed")) {
                      setShowFailureDialog(true);
                    } else {
                      toast.error(
                        result.message || t("workshopDownloader.downloadError")
                      );
                    }
                  }
                } catch (error) {
                  toast.error(t("workshopDownloader.downloadError"));
                  console.error("Error downloading wallpaper:", error);
                } finally {
                  setIsDownloading(false);
                  setWallpaperUrl("");
                }
              }
            }}
          >
            {isDownloading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("workshopDownloader.downloading")}
              </>
            ) : (
              <>
                {t("workshopDownloader.downloadLink")}{" "}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.electron.openGameDirectory("workshop")}
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>

        {/* Log Display Area */}
        {isDownloading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 w-full max-w-md"
          >
            <div className="max-h-48 overflow-y-auto rounded-lg border bg-background p-4 font-mono text-sm">
              <h3 className="mb-2 font-semibold text-primary">
                {t("workshopDownloader.downloadProgress")}
              </h3>
              <div className="space-y-1 text-muted-foreground">
                {downloadLogs.length > 0 ? (
                  downloadLogs.map((log, index) => (
                    <div key={index} className="whitespace-pre-wrap">
                      {log}
                    </div>
                  ))
                ) : (
                  <div className="text-center italic">
                    {t("workshopDownloader.waitingForLogs")}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Download Failure Dialog */}
        <AlertDialog open={showFailureDialog} onOpenChange={setShowFailureDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-bold text-foreground">
                {t("workshopDownloader.downloadFailure.title")}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <p>{t("workshopDownloader.downloadFailure.description")}</p>
                <ul className="list-disc space-y-1 pl-6">
                  {(() => {
                    const reasons = t("workshopDownloader.downloadFailure.reasons", {
                      returnObjects: true,
                    });
                    // Handle both string and array formats
                    if (typeof reasons === "string") {
                      try {
                        // Try to parse if it's a string representation of an array
                        const parsedReasons = JSON.parse(reasons.replace(/'/g, '"'));
                        return parsedReasons.map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ));
                      } catch (e) {
                        // If parsing fails, just return the string as a single item
                        return <li>{reasons}</li>;
                      }
                    } else if (Array.isArray(reasons)) {
                      // If it's already an array, use it directly
                      return reasons.map((reason, index) => (
                        <li key={index}>{reason}</li>
                      ));
                    } else {
                      // Fallback for any other case
                      return <li>The download failed. Please try again.</li>;
                    }
                  })()}
                </ul>
                <p>{t("workshopDownloader.downloadFailure.suggestion")}</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                className="text-secondary"
                onClick={() => setShowFailureDialog(false)}
              >
                {t("common.ok")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    );
  };

  const renderSetupStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center space-y-6 text-center"
          >
            <Package className="h-16 w-16 text-primary" />
            <h2 className="text-2xl font-bold">{t("workshopDownloader.welcome")}</h2>
            <p className="max-w-md text-muted-foreground">
              {t("workshopDownloader.welcomeDescription")}&nbsp;
              <a
                className="cursor-pointer items-center text-primary hover:underline"
                onClick={() =>
                  window.electron.openURL(
                    "https://ascendara.app/docs/features/overview#ascendara-workshop-downloader"
                  )
                }
              >
                {t("common.learnMore")}
                <ExternalLink className="mb-1 ml-1 inline-flex h-4 w-4" />
              </a>
            </p>
            <Button onClick={handleNext} size="lg" className="mt-8 text-secondary">
              {t("common.getStarted")} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center space-y-6 text-center"
          >
            <DownloadCloud className="h-16 w-16 text-primary" />
            <h2 className="text-2xl font-bold">
              {t("workshopDownloader.installSteamCMD")}
            </h2>
            <p className="max-w-xl text-muted-foreground">
              {t("workshopDownloader.installSteamCMDDescription")}
            </p>
            <Button
              onClick={handleNext}
              size="lg"
              className="mt-8 text-secondary"
              disabled={isInstalling}
            >
              {isInstalling ? (
                <>
                  <div className="mr-2 animate-spin">
                    <Loader className="h-4 w-4" />
                  </div>
                  {t("workshopDownloader.installingSteamCMD")}
                </>
              ) : (
                <>
                  {t("workshopDownloader.install")}{" "}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            {/* Installation Log Display Area */}
            {isInstalling && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 w-full max-w-md"
              >
                <div className="max-h-48 overflow-y-auto rounded-lg border bg-background p-4 font-mono text-sm">
                  <h3 className="mb-2 font-semibold text-primary">
                    Installation Progress
                  </h3>
                  <div className="space-y-1 text-muted-foreground">
                    {installLogs.length > 0 ? (
                      installLogs.map((log, index) => (
                        <div key={index} className="whitespace-pre-wrap">
                          {log}
                        </div>
                      ))
                    ) : (
                      <div className="text-center italic">
                        Initializing installation...
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex min-h-[80vh] items-center justify-center p-6">
      <AnimatePresence mode="wait">
        {isSetup ? renderMainInterface() : renderSetupStep()}
      </AnimatePresence>
    </div>
  );
};

export default WorkshopDownloader;
