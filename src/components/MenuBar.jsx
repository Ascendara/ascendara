import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
  Gamepad2,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { checkForUpdates } from "@/services/updateCheckingService";
import { exportToSvg } from "@/lib/exportToSvg";

const MenuBar = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [isDev, setIsDev] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasController, setHasController] = useState(false);
  const mainContentRef = useRef(null);
  const checkIntervalRef = useRef(null);

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
      setIsFullscreen(!isWindows);
    };
    checkWindows();
  }, []);

  // Check initial maximization state
  useEffect(() => {
    const checkMaximized = async () => {
      const isMax = await window.electron.isWindowMaximized();
      setIsFullscreen(isMax);
    };
    checkMaximized();
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
    const checkForController = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const hasControllerConnected = Array.from(gamepads).some(
        g => g && g.connected && (g.axes.length >= 2 || g.buttons.length >= 10)
      );
      setHasController(hasControllerConnected);
    };

    checkForController();

    checkIntervalRef.current = setInterval(checkForController, 2000);

    window.addEventListener("gamepadconnected", checkForController);
    window.addEventListener("gamepaddisconnected", checkForController);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      window.removeEventListener("gamepadconnected", checkForController);
      window.removeEventListener("gamepaddisconnected", checkForController);
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
    // Uses "maximizeWindow"
    if (window.electron.maximizeWindow) {
      const isMax = await window.electron.maximizeWindow();
      setIsFullscreen(isMax);
    } else {
      // Fallback
      console.error("The maximizeWindow function is not defined in preload.js.");
    }
  };

  return (
    <div
      className="fixed z-50 flex h-10 w-full select-none items-center"
      style={{ WebkitAppRegion: "drag" }}
    >
      <div className="mt-2 flex h-full flex-1 items-center px-3">
        <div className="flex items-center">
          <div className="flex items-center">
              {iconData && (
                <img src={iconData} alt="Ascendara" className="mr-2 h-6 w-6" />
              )}
              <span className="text-sm font-medium">Ascendara</span>
            </div>
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
                serverStatus.monitor?.ok &&
                serverStatus.api?.ok &&
                serverStatus.storage?.ok &&
                serverStatus.lfs?.ok &&
                serverStatus.r2?.ok
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

        {isDev && (
          <span className="ml-2 flex items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1 py-0.5 text-[14px] text-blue-500">
            <Hammer className="h-3 w-3" />
            {t("app.runningInDev")}
          </span>
        )}

        {hasController && location.pathname !== "/bigpicture" && (
          <button
            onClick={() => navigate("/bigpicture")}
            className="ml-2 flex cursor-pointer items-center gap-1 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[14px] text-primary transition-colors hover:bg-primary/20"
            style={{ WebkitAppRegion: "no-drag" }}
            title={t("bigPicture.enterBigPicture")}
          >
            <Gamepad2 className="h-3 w-3" />
            {t("bigPicture.enterBigPicture")}
          </button>
        )}

        {/* Show downloading update badge when downloading */}
        {isDownloadingUpdate && (
          <div className="ml-2 flex items-center gap-2">
            <span className="flex items-center gap-1 rounded border border-green-500/20 bg-green-500/10 px-1 py-0.5 text-[14px] text-green-500">
              <div className="relative h-5 w-5 flex-shrink-0">
                {/* Track circle */}
                <svg
                  className="absolute inset-0 h-full w-full -rotate-90"
                  viewBox="0 0 16 16"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="5"
                    fill="none"
                    strokeWidth="2"
                    className="stroke-green-500/20"
                  />
                  {/* Progress circle - circumference = 2 * PI * r = 2 * 3.14159 * 5 ≈ 31.4 */}
                  <circle
                    cx="8"
                    cy="8"
                    r="5"
                    fill="none"
                    strokeWidth="2"
                    className="stroke-green-500"
                    strokeDasharray="31.4"
                    strokeDashoffset={31.4 - (downloadProgress / 100) * 31.4}
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
        {isDev && (
          <div className="ml-2 flex items-center">
            <button
              onClick={handleExportSvg}
              className="flex items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[14px] text-blue-500 transition-colors hover:bg-blue-500/20"
              style={{ WebkitAppRegion: "no-drag" }}
            >
              <Download className="h-3 w-3" />
              {t("app.exportSvg", "Export SVG")}
            </button>
          </div>
        )}
      </div>
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
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent className="max-w-2xl bg-background">
          <AlertDialogHeader>
            <div
              className="absolute right-4 top-4 cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setIsDialogOpen(false)}
            >
              <X className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-3xl font-bold text-foreground">
              {t("server-status.title")}
            </AlertDialogTitle>

            <AlertDialogDescription className="sr-only">
              {t("server-status.description")}
            </AlertDialogDescription>

            <div className="mt-6 space-y-5">
              {serverStatus.noInternet ? (
                <div className="rounded-xl border-2 border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-500/5 p-6">
                  <div className="flex items-center gap-4">
                    <div className="rounded-full bg-red-500/20 p-3">
                      <WifiOff className="h-7 w-7 text-red-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {t("server-status.no-internet")}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("server-status.check-connection")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={`rounded-xl border-2 p-5 transition-all ${
                      serverStatus.monitor?.ok &&
                      serverStatus.api?.ok &&
                      serverStatus.storage?.ok &&
                      serverStatus.lfs?.ok &&
                      serverStatus.r2?.ok
                        ? "border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-500/5"
                        : "border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-500/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-foreground">
                          {serverStatus.monitor?.ok &&
                          serverStatus.api?.ok &&
                          serverStatus.storage?.ok &&
                          serverStatus.lfs?.ok &&
                          serverStatus.r2?.ok
                            ? t("server-status.healthy")
                            : t("server-status.unhealthy")}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {serverStatus.monitor?.ok &&
                          serverStatus.api?.ok &&
                          serverStatus.storage?.ok &&
                          serverStatus.lfs?.ok &&
                          serverStatus.r2?.ok
                            ? t("server-status.healthy-description")
                            : t("server-status.unhealthy-description")}
                        </p>
                      </div>
                      <div
                        className={`h-4 w-4 rounded-full shadow-lg ${
                          serverStatus.monitor?.ok &&
                          serverStatus.api?.ok &&
                          serverStatus.storage?.ok &&
                          serverStatus.lfs?.ok &&
                          serverStatus.r2?.ok
                            ? "bg-green-500 shadow-green-500/50"
                            : "animate-pulse bg-red-500 shadow-red-500/50"
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("server-status.service-status")}
                    </h4>
                    <div className="grid grid-cols-4 gap-3">
                      {/* API Status - Main Endpoint - Takes 2 columns */}
                      <div
                        className={`group col-span-2 rounded-xl border-2 p-4 transition-all hover:scale-[1.02] ${
                          serverStatus.api?.ok
                            ? "border-green-500/30 bg-green-500/5 hover:border-green-500/50"
                            : "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-3 w-3 rounded-full shadow-lg ${
                                serverStatus.api?.ok
                                  ? "bg-green-500 shadow-green-500/50"
                                  : "bg-red-500 shadow-red-500/50"
                              }`}
                            />
                            <div>
                              <span className="font-semibold text-foreground">
                                {t("server-status.api-name")}
                              </span>
                              <p className="text-xs text-muted-foreground">
                                {t("server-status.api-subtitle")}
                              </p>
                            </div>
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {serverStatus.api?.ok
                            ? t("server-status.operational")
                            : serverStatus.api?.error || t("server-status.down")}
                        </p>
                      </div>

                      {/* LFS Status */}
                      <div
                        className={`group rounded-xl border-2 p-4 transition-all hover:scale-[1.02] ${
                          serverStatus.lfs?.ok
                            ? "border-green-500/30 bg-green-500/5 hover:border-green-500/50"
                            : "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-3 w-3 rounded-full shadow-lg ${
                                serverStatus.lfs?.ok
                                  ? "bg-green-500 shadow-green-500/50"
                                  : "bg-red-500 shadow-red-500/50"
                              }`}
                            />
                            <span className="font-semibold text-foreground">
                              {t("server-status.lfs-name")}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {serverStatus.lfs?.ok
                            ? t("server-status.operational")
                            : serverStatus.lfs?.error || t("server-status.down")}
                        </p>
                      </div>

                      {/* R2 Status */}
                      <div
                        className={`group rounded-xl border-2 p-4 transition-all hover:scale-[1.02] ${
                          serverStatus.r2?.ok
                            ? "border-green-500/30 bg-green-500/5 hover:border-green-500/50"
                            : "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-3 w-3 rounded-full shadow-lg ${
                                serverStatus.r2?.ok
                                  ? "bg-green-500 shadow-green-500/50"
                                  : "bg-red-500 shadow-red-500/50"
                              }`}
                            />
                            <span className="font-semibold text-foreground">
                              {t("server-status.r2-name")}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {serverStatus.r2?.ok
                            ? t("server-status.operational")
                            : serverStatus.r2?.error || t("server-status.down")}
                        </p>
                      </div>
                    </div>

                    {/* Second row - Monitor and CDN in 2x2 grid */}
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {/* Monitor Status */}
                      <div
                        className={`group rounded-xl border-2 p-4 transition-all hover:scale-[1.02] ${
                          serverStatus.monitor?.ok
                            ? "border-green-500/30 bg-green-500/5 hover:border-green-500/50"
                            : "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-3 w-3 rounded-full shadow-lg ${
                                serverStatus.monitor?.ok
                                  ? "bg-green-500 shadow-green-500/50"
                                  : "bg-red-500 shadow-red-500/50"
                              }`}
                            />
                            <span className="font-semibold text-foreground">
                              {t("server-status.monitor-name")}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {serverStatus.monitor?.ok
                            ? t("server-status.operational")
                            : serverStatus.monitor?.error || t("server-status.down")}
                        </p>
                      </div>

                      {/* Storage Status */}
                      <div
                        className={`group rounded-xl border-2 p-4 transition-all hover:scale-[1.02] ${
                          serverStatus.storage?.ok
                            ? "border-green-500/30 bg-green-500/5 hover:border-green-500/50"
                            : "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-3 w-3 rounded-full shadow-lg ${
                                serverStatus.storage?.ok
                                  ? "bg-green-500 shadow-green-500/50"
                                  : "bg-red-500 shadow-red-500/50"
                              }`}
                            />
                            <span className="font-semibold text-foreground">
                              {t("server-status.cdn-name")}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {serverStatus.storage?.ok
                            ? t("server-status.operational")
                            : serverStatus.storage?.error || t("server-status.down")}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {/* Status Page Link */}
              <div className="flex items-center justify-between rounded-xl border-2 border-border/50 bg-card/50 p-4 transition-all hover:border-primary/50 hover:bg-card/80">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("server-status.need-more-details")}
                </span>
                <button
                  onClick={() => window.electron.openURL("https://status.ascendara.app")}
                  className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
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
