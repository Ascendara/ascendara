import ContextMenu from "@/components/ContextMenu";
import Layout from "@/components/Layout";
import MenuBar from "@/components/MenuBar";
import MiniPlayer from "@/components/MiniPlayer";
import SupportDialog from "@/components/SupportDialog";
import PlatformWarningDialog from "@/components/PlatformWarningDialog";
import WatcherWarnDialog from "@/components/WatcherWarnDialog";
import BrokenVersionDialog from "@/components/BrokenVersionDialog";
import PageTransition from "@/components/PageTransition";
import UpdateOverlay from "@/components/UpdateOverlay";
import { LanguageProvider } from "@/context/LanguageContext";
import { TourProvider } from "@/context/TourContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { analytics } from "@/services/analyticsService";
import gameService from "@/services/gameService";
import { checkForUpdates } from "@/services/updateCheckingService";
import checkQbittorrentStatus from "@/services/qbittorrentCheckService";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AdminWarningScreen from "@/components/AdminWarningScreen";
import {
  Navigate,
  Route,
  HashRouter as Router,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Toaster, toast } from "sonner";
import DownloadPage from "./pages/Download";
import Downloads from "./pages/Downloads";
import ExtraLanguages from "./pages/ExtraLanguages";
import Home from "./pages/Home";
import WorkshopDownloader from "./pages/WorkshopDownloader";
import SidecarAndDependencies from "./pages/SidecarAndDependencies";
import TorboxDownloads from "./pages/TorboxDownloads";
import GameScreen from "./pages/GameScreen";
import Profile from "./pages/Profile";
import Library from "./pages/Library";
import FolderView from "./pages/FolderView";
import Search from "./pages/Search";
import Settings from "./pages/Settings";
import Welcome from "./pages/Welcome";
import i18n from "./i18n";
import "./index.css";
import "./styles/scrollbar.css";
import { AlertTriangle, BugIcon, RefreshCwIcon } from "lucide-react";

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    analytics.trackPageView(pathname);
  }, [pathname]);

  return null;
};

const AppRoutes = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [isAdmin, setIsAdmin] = useState(false);
  const [showWelcome, setShowWelcome] = useState(null);
  const [isNewInstall, setIsNewInstall] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialRedirect, setHasInitialRedirect] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [iconData, setIconData] = useState("");
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [showPlatformWarning, setShowPlatformWarning] = useState(false);
  const [isBrokenVersion, setIsBrokenVersion] = useState(false);
  const location = useLocation();
  const hasChecked = useRef(false);
  const loadStartTime = useRef(Date.now());
  const hasShownUpdateNotification = useRef(false);
  const hasShownUpdateReadyNotification = useRef(false);
  const protocolHandlerRef = useRef(null);

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

  const ensureMinLoadingTime = () => {
    const currentTime = Date.now();
    const elapsedTime = currentTime - loadStartTime.current;
    const minLoadingTime = 1000;

    if (elapsedTime < minLoadingTime) {
      return new Promise(resolve => setTimeout(resolve, minLoadingTime - elapsedTime));
    }
    return Promise.resolve();
  };

  const checkWelcomeStatus = async () => {
    try {
      console.log("Checking welcome status...");
      const isNew = await window.electron.isNew();
      console.log("Is new install:", isNew);
      const isV7 = await window.electron.isV7();
      console.log("Is V7:", isV7);

      setIsNewInstall(isNew);
      setShowWelcome(isNew || !isV7);

      console.log("Welcome check:", { isNew, isV7, shouldShow: isNew || !isV7 });
      return { isNew, isV7 };
    } catch (error) {
      console.error("Error checking welcome status:", error);
      setShowWelcome(false);
      return null;
    } finally {
      await ensureMinLoadingTime();
      setIsLoading(false);
    }
  };

  const checkAndSetWelcomeStatus = async () => {
    const hasLaunched = await window.electron.hasLaunched();
    if (!hasLaunched) {
      const data = await checkWelcomeStatus();
      setWelcomeData(data);
      // Update launch count since this is the first launch
      const launchCount = await window.electron.updateLaunchCount();
      if (launchCount === 5) {
        setTimeout(() => {
          setShowSupportDialog(true);
        }, 4000);
      }
    } else {
      const isV7 = await window.electron.isV7();
      setShowWelcome(!isV7);
      setWelcomeData({ isNew: false, isV7 });
    }
    return hasLaunched;
  };

  const [welcomeData, setWelcomeData] = useState(null);
  const [showWatcherWarn, setShowWatcherWarn] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      if (hasChecked.current) return;
      hasChecked.current = true;

      console.log("Starting app initialization...");

      // Check if running in admin mode
      const hasAdmin = await window.electron.hasAdmin();
      setIsAdmin(hasAdmin);
      if (hasAdmin) {
        console.log("Running in admin mode - blocking app usage");
        await ensureMinLoadingTime();
        setIsLoading(false);
        return;
      }

      try {
        // Set up game protocol URL listener
        const handleGameProtocol = async (event, { imageId }) => {
          console.log("Received game protocol URL with imageId:", imageId);
          if (!imageId) {
            console.error("No imageId received in game protocol URL");
            return;
          }

          try {
            // Clean the imageId by removing any query parameters or slashes
            const cleanImageId = imageId.replace(/[?/]/g, "");
            console.log("Looking up game with cleaned imageId:", cleanImageId);

            // Find the game using the efficient lookup service
            const game = await gameService.findGameByImageId(cleanImageId);
            console.log("Found game:", game);

            if (!game) {
              toast.error("Game not found", {
                description: "The requested game could not be found.",
              });
              return;
            }

            console.log("Navigating to download page with game:", game.game);
            // Navigate to the download page with the game data in the expected format
            navigate("/download", {
              replace: true, // Use replace to avoid browser back button issues
              state: {
                gameData: {
                  ...game, // Pass all game data directly
                  download_links: game.download_links || {}, // Ensure download_links exists
                },
              },
            });
          } catch (error) {
            console.error("Error handling game protocol:", error);
            toast.error("Error", {
              description: "Failed to load game information.",
            });
          }
        };

        // Store the handler in the ref so we can access it in cleanup
        protocolHandlerRef.current = handleGameProtocol;

        // Register the protocol listener using the ipcRenderer from preload
        window.electron.ipcRenderer.on("protocol-game-url", protocolHandlerRef.current);

        // Check if we're forcing a loading screen from settings
        const forceLoading = localStorage.getItem("forceLoading");
        if (forceLoading) {
          localStorage.removeItem("forceLoading");
          await ensureMinLoadingTime();
          setIsLoading(false);
          return;
        }

        // Check if we're forcing the installing screen from settings
        const forceInstalling = localStorage.getItem("forceInstalling");
        if (forceInstalling) {
          localStorage.removeItem("forceInstalling");
          setIsInstalling(true);
          setTimeout(() => {
            setIsInstalling(false);
            window.location.reload();
          }, 2000);
          return;
        }

        // Check if we're finishing up from settings
        const finishingUp = localStorage.getItem("finishingUp");
        if (finishingUp) {
          localStorage.removeItem("finishingUp");
          setTimeout(async () => {
            await window.electron.setTimestampValue("isUpdating", false);
            await window.electron.deleteInstaller();
            setIsUpdating(false);
            window.location.reload();
          }, 2000);
          return;
        }

        // Check if we're finishing up an update
        const isUpdatingValue = await window.electron.getTimestampValue("isUpdating");
        setIsUpdating(isUpdatingValue);

        if (isUpdatingValue) {
          // Clear the updating flag after a delay
          setTimeout(async () => {
            await window.electron.setTimestampValue("isUpdating", false);
            setIsUpdating(false);
            setIsLoading(false);
            await checkAndSetWelcomeStatus();
            toast(t("app.toasts.justUpdated"), {
              description: t("app.toasts.justUpdatedDesc", { version: __APP_VERSION__ }),
              action: {
                label: t("app.toasts.viewChangelog"),
                onClick: () =>
                  window.electron.openURL("https://ascendara.app/changelog?individual"),
              },
              duration: 10000,
              id: "update-completed",
            });
          }, 2000);
          return;
        }

        const hasLaunched = await checkAndSetWelcomeStatus();
        const isWindows = await window.electron.isOnWindows();
        if (hasLaunched && isWindows) {
          const isWatchdogActive = await window.electron.isWatchdogRunning();
          if (!isWatchdogActive) {
            await ensureMinLoadingTime();
            setIsLoading(false);
            setShowWatcherWarn(true);
            return;
          }

          await ensureMinLoadingTime();
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error in app initialization:", error);
        await ensureMinLoadingTime();
        setIsLoading(false);
        setShowWelcome(false);
      }
    };

    initializeApp();

    // Cleanup function to ensure loading states are reset and listeners are removed
    return () => {
      setIsLoading(false);
      setIsUpdating(false);
      setIsInstalling(false);
      if (protocolHandlerRef.current) {
        window.electron.ipcRenderer.removeListener(
          "protocol-game-url",
          protocolHandlerRef.current
        );
      }
    };
  }, []);

  useEffect(() => {
    // Remove the initial loader once React is ready
    if (!isLoading && !isUpdating && !isInstalling) {
      const loader = document.getElementById("initial-loader");
      if (loader) {
        loader.style.transition = "opacity 0.3s";
        loader.style.opacity = "0";
        setTimeout(() => {
          loader.style.display = "none";
        }, 300);
      }
    }
  }, [isLoading, isUpdating, isInstalling]);

  const handleWelcomeComplete = async (withTour = false) => {
    setWelcomeData({ isNew: false, isV7: true });
    setShowWelcome(false);

    if (withTour) {
      navigate("/?tour=true", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  };

  useEffect(() => {
    const checkPlatform = async () => {
      const isWindows = await window.electron.isOnWindows();
      if (!isWindows) {
        setShowPlatformWarning(true);
      }
    };
    checkPlatform();
  }, []);

  useEffect(() => {
    const checkVersion = async () => {
      const isBroken = await window.electron.isBrokenVersion();
      console.log("Is broken version:", isBroken);
      setIsBrokenVersion(isBroken);
    };
    checkVersion();
  }, []);

  const handleInstallAndRestart = async () => {
    setIsInstalling(true);
    // Set isUpdating timestamp first
    await window.electron.setTimestampValue("isUpdating", true);
    setTimeout(() => {
      setIsUpdating(true);
      window.electron.updateAscendara();
    }, 1000);
  };

  useEffect(() => {
    console.log("State update:", {
      isLoading,
      showWelcome,
      isNewInstall,
      welcomeData,
    });
  }, [isLoading, showWelcome, isNewInstall, welcomeData]);

  useEffect(() => {
    if (
      !isLoading &&
      location.pathname === "/" &&
      !showWelcome &&
      settings?.defaultOpenPage &&
      settings.defaultOpenPage !== "home" &&
      !hasInitialRedirect
    ) {
      console.log(`Redirecting to default landing page: ${settings.defaultOpenPage}`);
      setHasInitialRedirect(true);
      navigate(`/${settings.defaultOpenPage}`, { replace: true });
    }
  }, [
    isLoading,
    location.pathname,
    showWelcome,
    settings?.defaultOpenPage,
    hasInitialRedirect,
    navigate,
  ]);
  console.log("AppRoutes render - Current state:", {
    showWelcome,
    location: location?.pathname,
    isLoading,
  });

  // Version check effect
  useEffect(() => {
    if (showWelcome) return;
    let isSubscribed = true;

    const checkVersionAndSetupUpdates = async () => {
      try {
        const settings = await window.electron.getSettings();
        const isLatestVersion = await checkForUpdates();

        if (
          !isLatestVersion &&
          !hasShownUpdateNotification.current &&
          !settings.autoUpdate
        ) {
          hasShownUpdateNotification.current = true;
          toast(t("app.toasts.outOfDate"), {
            description: t("app.toasts.outOfDateDesc"),
            action: {
              label: t("app.toasts.updateNow"),
              onClick: () => window.electron.openURL("https://ascendara.app/"),
            },
            duration: 10000,
            id: "update-available",
          });
        }
      } catch (error) {
        console.error("Error checking version:", error);
      }
    };

    const updateReadyHandler = () => {
      if (!isSubscribed || hasShownUpdateReadyNotification.current) return;

      hasShownUpdateReadyNotification.current = true;
      toast(t("app.toasts.updateReady"), {
        description: t("app.toasts.updateReadyDesc"),
        action: {
          label: t("app.toasts.installAndRestart"),
          onClick: handleInstallAndRestart,
        },
        duration: Infinity,
        id: "update-ready",
      });
    };

    checkVersionAndSetupUpdates();

    // Check if update is already downloaded
    window.electron.isUpdateDownloaded().then(isDownloaded => {
      if (isDownloaded) {
        updateReadyHandler();
      }
    });

    window.electron.onUpdateReady(updateReadyHandler);

    return () => {
      isSubscribed = false;
      window.electron.removeUpdateReadyListener(updateReadyHandler);
    };
  }, [showWelcome]);

  if (isAdmin) {
    return <AdminWarningScreen />;
  }

  if (isInstalling) {
    return <UpdateOverlay />;
  }

  if (isLoading || isUpdating) {
    console.log("Rendering loading screen...");
    return (
      <motion.div
        className="loading-container"
        initial={{ opacity: 1 }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, rgb(var(--color-primary) / 0.1) 0%, rgb(var(--color-background)) 100%)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
        }}
      >
        <motion.img
          src={iconData}
          alt="Loading"
          style={{ width: "128px", height: "128px" }}
          animate={{
            scale: [0.95, 1, 0.95],
            opacity: [0.8, 1, 0.8],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </motion.div>
    );
  }

  if (showWelcome === null) {
    console.log("Rendering null - showWelcome is null");
    return null;
  }

  if (location.pathname === "/welcome" && !showWelcome) {
    console.log("Redirecting from welcome to home");
    return <Navigate to="/" replace />;
  }

  if (location.pathname === "/" && showWelcome) {
    console.log("Redirecting from home to welcome");
    return <Navigate to="/welcome" replace />;
  }

  console.log("Rendering main routes with location:", location.pathname);

  return (
    <>
      <MenuBar />
      {showWelcome ? (
        <Routes>
          <Route path="/extralanguages" element={<ExtraLanguages />} />
          <Route
            path="*"
            element={
              <Welcome
                isNewInstall={isNewInstall}
                welcomeData={welcomeData}
                onComplete={handleWelcomeComplete}
              />
            }
          />
        </Routes>
      ) : (
        <Routes location={location}>
          <Route path="/" element={<Layout />}>
            <Route
              index
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="home">
                    <Home />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="search"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="search">
                    <Search />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="library"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="library">
                    <Library />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="folderview/:folderName"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="folderview">
                    <FolderView />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="gamescreen"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="gamescreen">
                    <GameScreen />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="downloads"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="downloads">
                    <Downloads />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="torboxdownloads"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="torboxdownloads">
                    <TorboxDownloads />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="settings"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="settings">
                    <Settings />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="sidecaranddependencies"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="sidecaranddependencies">
                    <SidecarAndDependencies />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="profile"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="profile">
                    <Profile />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="workshopdownloader"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="workshopdownloader">
                    <WorkshopDownloader />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="download"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="download">
                    <DownloadPage />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route
              path="extralanguages"
              element={
                <AnimatePresence mode="wait">
                  <PageTransition key="extralanguages">
                    <ExtraLanguages />
                  </PageTransition>
                </AnimatePresence>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
      {showSupportDialog && <SupportDialog onClose={() => setShowSupportDialog(false)} />}
      {showPlatformWarning && (
        <PlatformWarningDialog onClose={() => setShowPlatformWarning(false)} />
      )}
      {isBrokenVersion && (
        <BrokenVersionDialog onClose={() => setIsBrokenVersion(false)} />
      )}
      <WatcherWarnDialog open={showWatcherWarn} onOpenChange={setShowWatcherWarn} />
    </>
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Track error with analytics
    analytics.trackError(error, {
      componentStack: errorInfo.componentStack,
      severity: "fatal",
      componentName: this.constructor.name,
      previousRoute: this.props.location?.state?.from,
      userFlow: this.props.location?.state?.flow,
      props: JSON.stringify(this.props, (key, value) => {
        // Avoid circular references and sensitive data
        if (key === "children" || typeof value === "function") return "[Redacted]";
        return value;
      }),
      state: JSON.stringify(this.state),
      customData: {
        renderPhase: "componentDidCatch",
        reactVersion: React.version,
        lastRender: Date.now(),
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="w-full max-w-lg space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
            <div className="space-y-2">
              <div className="flex justify-center">
                <AlertTriangle className="h-12 w-12 text-primary" />
              </div>
              <h2 className="text-center text-2xl font-bold text-primary">
                {i18n.t("app.crashScreen.title")}
              </h2>
              <p className="text-center text-muted-foreground">
                {i18n.t("app.crashScreen.description")}
              </p>
            </div>

            <div className="space-y-4 rounded-md bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                {i18n.t("app.crashScreen.troubleshooting")}
              </p>
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                <li>{i18n.t("app.crashScreen.clearCache")}</li>
                <li>{i18n.t("app.crashScreen.checkConnection")}</li>
                <li>{i18n.t("app.crashScreen.contactSupport")}</li>
              </ul>
            </div>

            <div className="flex justify-center gap-4">
              <button
                onClick={() => (window.location.href = "/")}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-secondary ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <RefreshCwIcon className="h-4 w-4" />
                {i18n.t("app.crashScreen.reload")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function ToasterWithTheme() {
  const { theme } = useTheme();

  return (
    <Toaster
      position="top-right"
      className="!border-border !bg-card !text-card-foreground"
      toastOptions={{
        style: {
          background: "rgb(var(--color-card))",
          color: "rgb(var(--color-card-foreground))",
          border: "1px solid rgb(var(--color-border))",
          padding: "16px",
        },
        descriptionStyle: {
          color: "rgb(var(--color-muted-foreground))",
        },
        actionButtonStyle: {
          background: "rgb(var(--color-primary))",
          color: "rgb(var(--color-primary-foreground))",
          border: "none",
        },
        actionButtonHoverStyle: {
          background: "rgb(var(--color-primary))",
          opacity: 0.8,
        },
        cancelButtonStyle: {
          background: "rgb(var(--color-muted))",
          color: "rgb(var(--color-muted-foreground))",
          border: "none",
        },
        cancelButtonHoverStyle: {
          background: "rgb(var(--color-muted))",
          opacity: 0.8,
        },
      }}
    />
  );
}

function App() {
  const { t } = useTranslation();
  const [playerExpanded, setPlayerExpanded] = useState(false);

  useEffect(() => {
    const checkUpdates = async () => {
      const hasUpdate = await checkForUpdates();
    };

    checkUpdates();
  }, []);

  useEffect(() => {
    const calculateStorageInfo = async () => {
      try {
        const downloadDir = await window.electron.getDownloadDirectory();
        if (downloadDir) {
          // Pre-fetch both drive space and directory size
          await Promise.all([
            window.electron.getDriveSpace(downloadDir),
            window.electron.getInstalledGamesSize(),
          ]);
        }
      } catch (error) {
        console.error("[App] Error calculating storage info:", error);
      }
    };

    calculateStorageInfo();
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkQbittorrent = async () => {
      // Check if torrenting is enabled in settings
      const settings = await window.electron.getSettings();
      if (!mounted) return; // Don't proceed if unmounted

      if (settings.torrentEnabled) {
        const status = await checkQbittorrentStatus();
        if (!mounted) return; // Don't proceed if unmounted

        if (!status.active) {
          toast.error(t("app.qbittorrent.notAccessible"), {
            description: status.error || t("app.qbittorrent.checkWebUI"),
            duration: 10000,
          });
        }
      }
    };

    checkQbittorrent().catch(error => {
      if (mounted) {
        console.error("[App] Error checking qBittorrent:", error);
      }
    });

    // Cleanup function
    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      * {
        -webkit-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      
      input, textarea {
        -webkit-user-select: text;
        -ms-user-select: text;
        user-select: text;
      }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    const updateScrollbarStyle = () => {
      const sideScrollBar = localStorage.getItem("sideScrollBar") === "true";
      if (sideScrollBar) {
        document.documentElement.classList.add("custom-scrollbar");
      } else {
        document.documentElement.classList.remove("custom-scrollbar");
      }
    };

    // Initial setup
    updateScrollbarStyle();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <SettingsProvider>
            <TourProvider>
              <Router>
                <ToasterWithTheme />
                <ContextMenu />
                <ScrollToTop />
                <AnimatePresence mode="wait">
                  <AppRoutes />
                </AnimatePresence>
                <MiniPlayer
                  expanded={playerExpanded}
                  onToggleExpand={() => setPlayerExpanded(!playerExpanded)}
                />
              </Router>
            </TourProvider>
          </SettingsProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
