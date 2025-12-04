import React, { useState, useEffect, useRef } from "react";
import { subscribeToStatus, getCurrentStatus } from "@/services/serverStatus";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "./ui/alert-dialog";
import {
  AlertTriangle,
  WifiOff,
  Hammer,
  X,
  Minus,
  Download,
  Flag,
  FlaskConical,
  Maximize,
  Minimize,
  ExternalLink,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { checkForUpdates } from "@/services/updateCheckingService";
import { exportToSvg } from "@/lib/exportToSvg";

const MenuBar = () => {
  const { t } = useLanguage();
  const [serverStatus, setServerStatus] = useState(() => {
    // Default status if no valid cache exists
    return {
      ok: true,
      noInternet: false,
      api: { ok: true },
      storage: { ok: true },
      lfs: { ok: true },
    };
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [iconData, setIconData] = useState("");
  const [showTorrentWarning, setShowTorrentWarning] = useState(false);
  const [isLatest, setIsLatest] = useState(true);
  const [isExperiment, setIsExperiment] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [leftSideActions, setLeftSideActions] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mainContentRef = useRef(null);

  // Check for dev mode
  useEffect(() => {
    const checkDevMode = async () => {
      const isDevMode = await window.electron.isDev();
      setIsDev(isDevMode);
    };
    checkDevMode();
  }, []);

  // Check if isOnWindows
  useEffect(() => {
    const checkWindows = async () => {
      const isWindows = await window.electron.isOnWindows();
      setLeftSideActions(!isWindows);
      setIsFullscreen(!isWindows);
    };
    checkWindows();
  }, []);

  useEffect(() => {
    const checkExperimentMode = async () => {
      const isExperiment = await window.electron.isExperiment();
      setIsExperiment(isExperiment);
    };
    checkExperimentMode();
  }, []);

  useEffect(() => {
    const checkLatestVersion = async () => {
      const isLatestVersion = await checkForUpdates();
      setIsLatest(isLatestVersion);
    };
    checkLatestVersion();

    let initialTimeout;
    let interval;

    // Only set up the update checking if the app is outdated
    if (!isLatest) {
      // Check timestamp file for downloading status, but only if auto-update is enabled
      const checkDownloadStatus = async () => {
        try {
          const settings = await window.electron.getSettings();
          // Only show downloading badge if auto-update is enabled
          if (settings.autoUpdate) {
            const timestamp =
              await window.electron.getTimestampValue("downloadingUpdate");
            setIsDownloadingUpdate(timestamp || false);
          } else {
            setIsDownloadingUpdate(false);
          }
        } catch (error) {
          console.error("Failed to read timestamp file:", error);
        }
      };

      // Initial delay before first check
      initialTimeout = setTimeout(checkDownloadStatus, 1000);

      // Set up interval for subsequent checks
      interval = setInterval(checkDownloadStatus, 1000);
    }

    return () => {
      if (initialTimeout) clearTimeout(initialTimeout);
      if (interval) clearInterval(interval);
    };
  }, [isLatest]);

  useEffect(() => {
    const handleDownloadProgress = (event, progress) => {
      setDownloadProgress(progress);
    };

    window.electron.ipcRenderer.on("update-download-progress", handleDownloadProgress);

    return () => {
      window.electron.ipcRenderer.removeListener(
        "update-download-progress",
        handleDownloadProgress
      );
    };
  }, []);

  useEffect(() => {
    const checkTorrentWarning = async () => {
      const savedSettings = await window.electron.getSettings();
      setShowTorrentWarning(savedSettings.torrentEnabled);
    };

    // Initial check
    checkTorrentWarning();

    // Listen for changes
    const handleTorrentChange = event => {
      setShowTorrentWarning(event.detail);
    };

    window.addEventListener("torrentSettingChanged", handleTorrentChange);

    // Cleanup
    return () => {
      window.removeEventListener("torrentSettingChanged", handleTorrentChange);
    };
  }, []);

  useEffect(() => {
    const checkStatus = () => {
      const status = getCurrentStatus();
      if (status) {
        setServerStatus(status);
      }
    };

    // Subscribe to status updates
    const unsubscribe = subscribeToStatus(status => {
      if (status) {
        setServerStatus(status);
      }
    });

    // Initial check
    checkStatus();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadIconPath = async () => {
      try {
        const data = await window.electron.getAssetPath("icon.png");
        if (data) {
          setIconData(data);
        }
      } catch (error) {
        console.error("Failed to load icon:", error);
      }
    };
    loadIconPath();
  }, []);

  useEffect(() => {
    // Assign ref to main content area
    mainContentRef.current = document.querySelector("main");
  }, []);

  const handleStatusClick = () => {
    setIsDialogOpen(true);
  };

  const handleExportSvg = async () => {
    if (mainContentRef.current) {
      try {
        await exportToSvg(mainContentRef.current, "ascendara-export");
      } catch (error) {
        console.error("Failed to export SVG:", error);
      }
    }
  };

  const handleFullscreenToggle = async () => {
    setIsFullscreen(await window.electron.toggleFullscreen());
  };

  return (
    <div
      className="fixed z-50 flex h-10 w-full select-none items-center"
      style={{ WebkitAppRegion: "drag" }}
    >
      {leftSideActions && (
        <div className="window-controls ml-3 mt-2 flex items-center">
          <button
            onClick={() => window.electron.closeWindow()}
            className="rounded p-1 hover:bg-gray-200"
          >
            <div className="h-3 w-3 rounded-full bg-red-500 hover:bg-red-600" />
          </button>
          <button
            onClick={() => window.electron.minimizeWindow()}
            className={`ml-1 rounded p-1 ${!isFullscreen ? "cursor-not-allowed" : "cursor-pointer"}`}
            disabled={!isFullscreen}
          >
            <div
              className={`h-3 w-3 rounded-full ${!isFullscreen ? "bg-gray-400" : "bg-yellow-500 hover:bg-yellow-600"}`}
            />
          </button>
          <button
            className="ml-2"
            onClick={handleFullscreenToggle}
            title={isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
          >
            <div className="h-3 w-3 rounded-full bg-green-500 hover:bg-green-600" />
          </button>
        </div>
      )}
      <div className="mt-2 flex h-full flex-1 items-center px-3">
        <div className="flex items-center">
          {leftSideActions ? (
            <div className="flex items-center">
              <span className="text-sm font-medium">Ascendara</span>
            </div>
          ) : (
            <div className="flex items-center">
              {iconData && (
                <img src={iconData} alt="Ascendara" className="mr-2 h-6 w-6" />
              )}
              <span className="text-sm font-medium">Ascendara</span>
            </div>
          )}
        </div>

        <div
          className="ml-1.5 flex cursor-pointer items-center gap-1"
          onClick={handleStatusClick}
          title={t("server-status.title")}
          style={{ WebkitAppRegion: "no-drag" }}
        >
          {serverStatus.noInternet ? (
            <WifiOff className="h-4 w-4 text-red-500" />
          ) : (
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                serverStatus.api?.ok && serverStatus.storage?.ok && serverStatus.lfs?.ok
                  ? "bg-green-500 hover:bg-green-600"
                  : "animate-pulse bg-red-500 hover:bg-red-600"
              }`}
            />
          )}
        </div>

        {/* Experiment mode */}
        {isExperiment && (
          <span className="ml-2 flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1 py-0.5 text-[14px] text-amber-500">
            <FlaskConical className="h-3 w-3" />
            {t("app.experiment")}
          </span>
        )}

        {showTorrentWarning && (
          <span className="ml-2 flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-1 py-0.5 text-[14px] text-red-500">
            <Flag className="h-3 w-3" />
            {t("app.torrentWarning")}
          </span>
        )}

        {/* Show downloading update badge when downloading */}
        {isDownloadingUpdate && (
          <div className="ml-2 flex items-center gap-2">
            <span className="flex items-center gap-1 rounded border border-green-500/20 bg-green-500/10 px-1 py-0.5 text-[14px] text-green-500">
              <div className="relative h-4 w-4">
                {/* Track circle */}
                <svg className="absolute inset-0 h-full w-full -rotate-90">
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    fill="none"
                    strokeWidth="3"
                    className="stroke-green-500/20"
                  />
                  {/* Progress circle - circumference = 2 * PI * r = 2 * 3.14159 * 6 ≈ 37.7 */}
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    fill="none"
                    strokeWidth="3"
                    className="stroke-green-500"
                    strokeDasharray="37.7"
                    strokeDashoffset={37.7 - (downloadProgress / 100) * 37.7}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              {t("app.downloading-update")}
            </span>
          </div>
        )}

        {/* Show outdated badge only when not downloading */}
        {!isLatest && !isDownloadingUpdate && (
          <div className="ml-2 flex items-center gap-2">
            <span className="flex items-center gap-1 rounded border border-yellow-500/20 bg-yellow-500/10 px-1 py-0.5 text-[14px] text-yellow-500">
              <AlertTriangle className="h-3 w-3" />
              {t("app.outdated")}
            </span>
          </div>
        )}
        <div className="flex-1" />
      </div>
      {!leftSideActions && (
        <div className="window-controls mr-2 flex items-center">
          <div className="flex items-center space-x-2">
            <button
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => window.electron.minimizeWindow()}
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              className="relative text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={handleFullscreenToggle}
              title={isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
            >
              <Minimize
                className={`absolute h-4 w-4 transition-opacity ${
                  isFullscreen ? "bg-background opacity-100" : "opacity-0"
                }`}
              />
              <Maximize
                className={`h-4 w-4 transition-opacity ${
                  isFullscreen ? "opacity-0" : "bg-background opacity-100"
                }`}
              />
            </button>
            <button
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => window.electron.closeWindow()}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent className="max-w-md bg-background">
          <AlertDialogHeader>
            <div
              className="fixed right-2 top-2 cursor-pointer p-2 text-foreground"
              onClick={() => setIsDialogOpen(false)}
            >
              <X className="h-4 w-4" />
            </div>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("server-status.title")}
            </AlertDialogTitle>

            <AlertDialogDescription className="sr-only">
              {t("server-status.description")}
            </AlertDialogDescription>

            <div className="mt-4 space-y-4">
              {serverStatus.noInternet ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                  <div className="flex items-center gap-3">
                    <WifiOff className="h-8 w-8 text-red-500" />
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {t("server-status.no-internet")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("server-status.check-connection")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`rounded-lg border p-4 ${
                    serverStatus.api?.ok &&
                    serverStatus.storage?.ok &&
                    serverStatus.lfs?.ok
                      ? "border-green-500/20 bg-green-500/5"
                      : "border-red-500/20 bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {serverStatus.api?.ok &&
                      serverStatus.storage?.ok &&
                      serverStatus.lfs?.ok
                        ? t("server-status.healthy")
                        : t("server-status.unhealthy")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {serverStatus.noInternet ? (
                      <div>
                        {t("server-status.no-internet")}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("server-status.check-connection")}
                        </p>
                      </div>
                    ) : serverStatus.api?.ok &&
                      serverStatus.storage?.ok &&
                      serverStatus.lfs?.ok ? (
                      t("server-status.healthy-description")
                    ) : (
                      <div>
                        {t("server-status.unhealthy-description")}
                        <ul className="mt-2 space-y-2">
                          {!serverStatus.api?.ok && (
                            <li key="apiDown" className="flex items-start">
                              <span className="mr-2 mt-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
                              <div>
                                <span className="font-medium">API</span>
                                <p className="text-xs text-muted-foreground">
                                  {t("server-status.api-description")}
                                </p>
                              </div>
                            </li>
                          )}
                          {!serverStatus.storage?.ok && (
                            <li key="storageDown" className="flex items-start">
                              <span className="mr-2 mt-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
                              <div>
                                <span className="font-medium">Storage</span>
                                <p className="text-xs text-muted-foreground">
                                  {t("server-status.storage-description")}
                                </p>
                              </div>
                            </li>
                          )}
                          {!serverStatus.lfs?.ok && (
                            <li key="lfsDown" className="flex items-start">
                              <span className="mr-2 mt-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
                              <div>
                                <span className="font-medium">LFS</span>
                                <p className="text-xs text-muted-foreground">
                                  {t("server-status.lfs-description")}
                                </p>
                              </div>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </p>
                </div>
              )}
              {/* Status Page Link */}
              <div className="flex items-center justify-between rounded-lg border bg-card/30 p-3">
                <span className="text-sm text-muted-foreground">
                  {t("server-status.need-more-details")}
                </span>
                <button
                  onClick={() => window.electron.openURL("https://status.ascendara.app")}
                  className="flex items-center gap-1 text-sm text-foreground hover:underline"
                >
                  {t("server-status.visit-status-page")}
                  <ExternalLink className="h-4 w-4" />
                </button>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MenuBar;
