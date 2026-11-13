import { useState, useEffect, useRef } from "react";
import { useLibraryBackupStore } from "@/services/library/libraryBackupStore";
import { useNavigate, useLocation } from "react-router-dom";
import { subscribeToStatus, getCurrentStatus } from "@/services/app/serverStatus";
import {
  subscribeToDownloads,
  getActiveDownloadCount,
} from "@/services/integrations/khinsiderService";
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
  CheckCircle2,
  WifiOff,
  Hammer,
  X,
  Download,
  Flag,
  FlaskConical,
  ExternalLink,
  Gamepad2,
  TestTube2,
  Loader,
  Search,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useSearch } from "@/context/SearchContext";
import { UPDATE_PHASES, useVersionStatus } from "@/services/app/updateCheckingService";
import { exportToSvg } from "@/lib/exportToSvg";
import { useAppIcon } from "@/hooks/useAppIcon";
import { useSettings } from "@/context/SettingsContext";
import { WindowControls } from "@/components/WindowControls";
import { FEATURE_CENTER_EVENTS, openFeatureCenter } from "@/lib/featureCenterEvents";
import { MENU_BAR_HEIGHT_STYLE } from "@/lib/appChromeGeometry";
import { getMenuBarLayoutOrder } from "@/lib/menuBarLayout";
import {
  MENU_BAR_MIN_WIDTH_PX,
  getMenuBarMode,
  getMenuBarResponsivePolicyForMode,
} from "@/lib/menuBarResponsivePolicy";

const getViewportWidth = () =>
  typeof window === "undefined" ? MENU_BAR_MIN_WIDTH_PX : window.innerWidth;

const MenuBar = () => {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const controlsStyle = settings.windowControlsStyle;
  // The side setting moves the brand to one edge and window controls to the opposite edge.
  const mirrored = settings.menuBarSide === "right";
  const layoutOrder = getMenuBarLayoutOrder(settings.menuBarSide);
  const navigate = useNavigate();
  const location = useLocation();
  const { openSearch } = useSearch();
  const libraryBackupBusy = useLibraryBackupStore(state => state.busy);
  const libraryBackupProgress = useLibraryBackupStore(state => state.progress);
  const libraryBackupScreen = useLibraryBackupStore(state => state.screen);
  const libraryBackupCompleted = useLibraryBackupStore(state => state.results.length);
  const openLibraryBackups = useLibraryBackupStore(state => state.setOpen);
  const [serverStatus, setServerStatus] = useState(() => {
    // Default status if no valid cache exists
    return {
      ok: true,
      noInternet: false,
      api: { ok: true },
      storage: { ok: true },
    };
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const iconData = useAppIcon();
  const [showTorrentWarning, setShowTorrentWarning] = useState(false);
  const [appBranch, setAppBranch] = useState("live");
  const [isDev, setIsDev] = useState(false);
  const { phase: updatePhase, downloadProgress } = useVersionStatus();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasController, setHasController] = useState(false);
  const [audioDownloadCount, setAudioDownloadCount] = useState(0);
  const [menuBarMode, setMenuBarMode] = useState(() =>
    getMenuBarMode(getViewportWidth())
  );
  const mainContentRef = useRef(null);

  const responsivePolicy = getMenuBarResponsivePolicyForMode(menuBarMode);
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const modifierKey = platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl";
  const showSearchPill =
    !location.pathname.startsWith("/welcome") && location.pathname !== "/bigpicture";

  useEffect(() => {
    const updateMenuBarMode = () => {
      const nextMode = getMenuBarMode(getViewportWidth());
      setMenuBarMode(currentMode => (currentMode === nextMode ? currentMode : nextMode));
    };

    window.addEventListener("resize", updateMenuBarMode);
    return () => window.removeEventListener("resize", updateMenuBarMode);
  }, []);

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
    const checkBranch = async () => {
      const branch = (await window.electron.getBranch?.()) ?? "live";
      setAppBranch(branch);
    };
    checkBranch();
  }, []);

  useEffect(() => {
    const checkForController = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const hasControllerConnected = Array.from(gamepads).some(
        g => g && g.connected && g.axes.length >= 2 && g.buttons.length >= 10
      );
      setHasController(hasControllerConnected);
    };

    checkForController();

    // Chromium only exposes a controller once it is used, and fires
    // gamepadconnected at that moment, so polling adds nothing.
    window.addEventListener("gamepadconnected", checkForController);
    window.addEventListener("gamepaddisconnected", checkForController);

    return () => {
      window.removeEventListener("gamepadconnected", checkForController);
      window.removeEventListener("gamepaddisconnected", checkForController);
    };
  }, []);

  useEffect(() => {
    setAudioDownloadCount(getActiveDownloadCount());
    const unsubscribe = subscribeToDownloads(count => {
      setAudioDownloadCount(count);
    });
    return () => unsubscribe();
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
      className="fixed z-50 flex w-full select-none items-center"
      style={{ ...MENU_BAR_HEIGHT_STYLE, WebkitAppRegion: "drag" }}
    >
      {/* data-boot-row / data-boot-pop: staggered pop-in as the boot logo lands (app.css) */}
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-3" data-boot-row>
        <div className={`flex items-center ${layoutOrder.brand}`}>
          <div
            className={`flex items-center gap-2 ${mirrored ? "flex-row-reverse" : ""}`}
          >
            {iconData && (
              // Opens My Ascendara in the System Center; the logo flies into it
              <button
                type="button"
                onClick={event =>
                  openFeatureCenter(FEATURE_CENTER_EVENTS.system, {
                    tab: "about",
                    origin: event.currentTarget.querySelector("[data-app-logo]"),
                  })
                }
                title={t("featureCenters.system.about.openFromLogo")}
                aria-label={t("featureCenters.system.about.openFromLogo")}
                className="rounded-md outline-none transition-transform duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
                style={{ WebkitAppRegion: "no-drag" }}
              >
                <img
                  src={iconData}
                  alt="Ascendara"
                  data-app-logo
                  className="block h-6 w-6"
                  draggable={false}
                />
              </button>
            )}
            <span
              className={`${responsivePolicy.showBrandLabel ? "" : "sr-only"} text-sm font-medium text-foreground`}
              data-boot-pop
            >
              Ascendara
            </span>
          </div>
        </div>

        <div
          className="flex shrink-0 cursor-pointer items-center gap-1"
          onClick={handleStatusClick}
          title={t("server-status.title")}
          data-tour="server-status"
          data-menubar-priority="critical"
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
                serverStatus.r2?.ok
                  ? "bg-green-500 hover:bg-green-600"
                  : "animate-pulse bg-red-500 hover:bg-red-600"
              }`}
            />
          )}
        </div>

        {/* Branch badges */}
        {responsivePolicy.showBranchIdentity && appBranch === "public-testing" && (
          <span
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-yellow-500/20 bg-yellow-500/10 px-1 py-0.5 text-[14px] text-yellow-500"
            title={t("app.publicTesting")}
            data-menubar-priority="secondary"
          >
            <TestTube2 className="h-4 w-4 shrink-0" />
            <span
              className={
                responsivePolicy.showSecondaryLabels ? "font-semibold" : "sr-only"
              }
            >
              {t("app.publicTesting")}
            </span>
          </span>
        )}
        {responsivePolicy.showBranchIdentity && appBranch === "experimental" && (
          <span
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-red-400/20 bg-red-400/10 px-1 py-0.5 text-[14px] text-red-400"
            title={t("app.experiment")}
            data-menubar-priority="secondary"
          >
            <FlaskConical className="h-4 w-4 shrink-0" />
            <span
              className={
                responsivePolicy.showSecondaryLabels ? "font-semibold" : "sr-only"
              }
            >
              {t("app.experiment")}
            </span>
          </span>
        )}

        {showTorrentWarning && (
          <span
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-red-500/20 bg-red-500/10 px-1 py-0.5 text-[14px] text-red-500"
            title={t("app.torrentWarning")}
            data-menubar-priority="critical"
          >
            <Flag className="h-3 w-3 shrink-0" />
            <span className={responsivePolicy.showCriticalLabels ? "" : "sr-only"}>
              {t("app.torrentWarning")}
            </span>
          </span>
        )}

        {isDev && responsivePolicy.showSecondary && (
          <span
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-blue-500/20 bg-blue-500/10 px-1 py-0.5 text-[14px] text-blue-500"
            title={t("app.runningInDev")}
            data-menubar-priority="secondary"
          >
            <Hammer className="h-3 w-3 shrink-0" />
            <span className={responsivePolicy.showSecondaryLabels ? "" : "sr-only"}>
              {t("app.runningInDev")}
            </span>
          </span>
        )}

        {hasController &&
          location.pathname !== "/bigpicture" &&
          responsivePolicy.showSecondary && (
            <button
              onClick={() => navigate("/bigpicture")}
              className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[14px] text-primary transition-colors hover:bg-primary/20"
              style={{ WebkitAppRegion: "no-drag" }}
              title={t("bigPicture.enterBigPicture")}
              data-menubar-priority="secondary"
            >
              <Gamepad2 className="h-3 w-3 shrink-0" />
              <span className={responsivePolicy.showSecondaryLabels ? "" : "sr-only"}>
                {t("bigPicture.enterBigPicture")}
              </span>
            </button>
          )}

        {libraryBackupBusy && (
          <button
            type="button"
            onClick={() => {
              openLibraryBackups(true);
              navigate("/library");
            }}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[14px] text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ WebkitAppRegion: "no-drag" }}
            title={t("library.libraryBackups.backgroundDetails", {
              game: libraryBackupProgress?.game || "",
            })}
            data-menubar-priority="activity"
          >
            <Loader className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
            <span className={responsivePolicy.showActivityLabels ? "" : "sr-only"}>
              {t(`library.libraryBackups.background.${libraryBackupScreen}`, {
                completed: libraryBackupCompleted,
                total: libraryBackupProgress?.total || 0,
              })}
            </span>
          </button>
        )}

        {/* Show downloading update badge when downloading */}
        {updatePhase === UPDATE_PHASES.DOWNLOADING && (
          <div
            className="flex shrink-0 items-center gap-2"
            data-menubar-priority="critical"
          >
            <span
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-green-500/20 bg-green-500/10 px-1 py-0.5 text-[14px] text-green-500"
              title={t("app.downloading-update")}
            >
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
              <span className={responsivePolicy.showCriticalLabels ? "" : "sr-only"}>
                {t("app.downloading-update")}
              </span>
            </span>
          </div>
        )}

        {/* Show audio downloading badge when downloading audio files */}
        {audioDownloadCount > 0 && (
          <span
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[14px] text-blue-500"
            title={t("app.loading-audio", { count: audioDownloadCount })}
            data-menubar-priority="activity"
          >
            <div className="relative h-4 w-4 flex-shrink-0">
              {/* Spinning loader circle */}
              <svg
                className="absolute inset-0 h-full w-full animate-spin"
                viewBox="0 0 16 16"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="5"
                  fill="none"
                  strokeWidth="2"
                  className="stroke-blue-500/20"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="5"
                  fill="none"
                  strokeWidth="2"
                  className="stroke-blue-500"
                  strokeDasharray="15.7"
                  strokeDashoffset="7.85"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className={responsivePolicy.showActivityLabels ? "" : "sr-only"}>
              {t("app.loading-audio", { count: audioDownloadCount })}
            </span>
          </span>
        )}

        {/* Show outdated badge only while an update still needs downloading */}
        {updatePhase === UPDATE_PHASES.AVAILABLE && (
          <div
            className="flex shrink-0 items-center gap-2"
            data-menubar-priority="critical"
          >
            <span
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-yellow-500/20 bg-yellow-500/10 px-1 py-0.5 text-[14px] text-yellow-500"
              title={t("app.outdated")}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className={responsivePolicy.showCriticalLabels ? "" : "sr-only"}>
                {t("app.outdated")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("request-app-update"))}
              className="shrink-0 rounded border border-yellow-500/20 bg-yellow-500/10 p-1 text-yellow-500 transition-colors hover:bg-yellow-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
              style={{ WebkitAppRegion: "no-drag" }}
              title={t("app.toasts.updateNow")}
              aria-label={t("app.toasts.updateNow")}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {updatePhase === UPDATE_PHASES.READY && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("request-app-update"))}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-[14px] text-green-500 transition-colors hover:bg-green-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            style={{ WebkitAppRegion: "no-drag" }}
            title={t("app.toasts.installAndRestart")}
            aria-label={t("app.toasts.installAndRestart")}
            data-menubar-priority="critical"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className={responsivePolicy.showCriticalLabels ? "" : "sr-only"}>
              {t("app.toasts.updateReady")}
            </span>
          </button>
        )}
        <div className={`flex-1 ${layoutOrder.spacer}`} />
        {isDev && responsivePolicy.showSecondary && (
          <div className={`flex shrink-0 items-center ${layoutOrder.devAction}`}>
            <button
              onClick={handleExportSvg}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[14px] text-blue-500 transition-colors hover:bg-blue-500/20"
              style={{ WebkitAppRegion: "no-drag" }}
              title={t("app.exportSvg", "Export SVG")}
              data-menubar-priority="secondary"
            >
              <Download className="h-3 w-3 shrink-0" />
              <span className={responsivePolicy.showSecondaryLabels ? "" : "sr-only"}>
                {t("app.exportSvg", "Export SVG")}
              </span>
            </button>
          </div>
        )}
        {showSearchPill && (
          <button
            type="button"
            onClick={() => openSearch("global")}
            className={`flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-muted/50 pl-2.5 pr-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${layoutOrder.search}`}
            style={{ WebkitAppRegion: "no-drag" }}
            aria-label={t("globalSearch.placeholder.global")}
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className={responsivePolicy.showSearchLabel ? "pr-4" : "sr-only"}>
              {t("globalSearch.placeholder.global")}
            </span>
            {responsivePolicy.showSearchShortcut && (
              <kbd className="inline-flex h-5 select-none items-center rounded-full border border-border bg-background px-2 font-mono text-[10px] font-medium">
                {modifierKey}+K
              </kbd>
            )}
          </button>
        )}
      </div>
      <WindowControls
        variant={controlsStyle === "traffic" ? "traffic" : "icons"}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleFullscreenToggle}
        mirrored={mirrored}
        t={t}
        className={
          // Traffic lights get the native inset; icon buttons carry their own padding
          controlsStyle === "traffic"
            ? mirrored
              ? "order-first ml-4"
              : "mr-4"
            : mirrored
              ? "order-first ml-2"
              : "mr-2"
        }
      />
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent className="max-w-2xl bg-background">
          <AlertDialogHeader>
            <div
              className="absolute right-4 top-4 cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setIsDialogOpen(false)}
            >
              <X className="h-5 w-5" />
            </div>
            <AlertDialogTitle>{t("server-status.title")}</AlertDialogTitle>

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
                          serverStatus.r2?.ok
                            ? t("server-status.healthy")
                            : t("server-status.unhealthy")}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {serverStatus.monitor?.ok &&
                          serverStatus.api?.ok &&
                          serverStatus.storage?.ok &&
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
                    <div className="grid grid-cols-3 gap-3">
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
