import ContextMenu from "@/components/ContextMenu";
import Layout from "@/components/Layout";
import MenuBar from "@/components/MenuBar";
import MiniPlayer from "@/components/MiniPlayer";
import SupportDialog from "@/components/SupportDialog";
import PlatformWarningDialog from "@/components/PlatformWarningDialog";
import WatcherWarnDialog from "@/components/WatcherWarnDialog";
import BrokenVersionDialog from "@/components/BrokenVersionDialog";
import FirstIndexDialog from "@/components/FirstIndexDialog";
import UpdateOverlay from "@/components/UpdateOverlay";
import { LanguageProvider } from "@/context/LanguageContext";
import { TourProvider } from "@/context/TourContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { analytics } from "@/services/analyticsService";
import {
  initializeStatusService,
  cleanupStatusService,
} from "@/services/ascendStatusService";
import { setActivity, ActivityType, clearActivity } from "@/services/userStatusService";
import { getUnreadMessageCount, verifyAscendAccess } from "@/services/firebaseService";
import gameService from "@/services/gameService";
import { checkForUpdates } from "@/services/updateCheckingService";
import checkQbittorrentStatus from "@/services/qbittorrentCheckService";
import { motion } from "framer-motion";
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
import Ascend from "./pages/Ascend";
import Library from "./pages/Library";
import FolderView from "./pages/FolderView";
import LocalRefresh from "./pages/LocalRefresh";
import Search from "./pages/Search";
import Settings from "./pages/Settings";
import Welcome from "./pages/Welcome";
import i18n from "./i18n";
import "./index.css";
import "./styles/scrollbar.css";
import { AlertTriangle, BugIcon, RefreshCwIcon, Clock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

// Check for trial expiration warning and show dialog
const TrialWarningChecker = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showTrialWarning, setShowTrialWarning] = useState(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (!user?.uid || hasCheckedRef.current) return;

    const checkTrialStatus = async () => {
      try {
        const accessStatus = await verifyAscendAccess();

        // Only show warning if user is on trial (not subscribed, not verified)
        // and has less than 7 days remaining
        if (
          !accessStatus.isSubscribed &&
          !accessStatus.isVerified &&
          accessStatus.daysRemaining > 0 &&
          accessStatus.daysRemaining <= 7
        ) {
          setTrialDaysRemaining(accessStatus.daysRemaining);
          setShowTrialWarning(true);
          hasCheckedRef.current = true;
        }
      } catch (error) {
        console.error("[TrialWarningChecker] Error checking trial status:", error);
      }
    };

    // Delay the check to let the app initialize
    const timeout = setTimeout(checkTrialStatus, 5000);
    return () => clearTimeout(timeout);
  }, [user?.uid]);

  const handleSubscribe = () => {
    setShowTrialWarning(false);
    navigate("/ascend");
  };

  return (
    <AlertDialog open={showTrialWarning} onOpenChange={setShowTrialWarning}>
      <AlertDialogContent className="border-border">
        <AlertDialogHeader>
          <div className="flex items-center gap-4">
            <Clock className="mb-2 h-10 w-10 text-yellow-500" />
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("ascend.access.trialEndingSoon")}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <div className="text-foreground">
                {t("ascend.access.trialEndingSoonMessage", { days: trialDaysRemaining })}
              </div>
              <div className="text-muted-foreground">
                {t("ascend.access.trialEndingSoonAction")}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-3 sm:justify-end">
          <AlertDialogCancel className="text-foreground">
            {t("common.close")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleSubscribe}>
            {t("ascend.subscription.upgrade")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    analytics.trackPageView(pathname);
  }, [pathname]);

  return null;
};

// Track user activity and update Firebase customMessage
const UserActivityTracker = () => {
  const { pathname, state } = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) return;

    // Map routes to activity types
    const updateActivity = async () => {
      switch (pathname) {
        case "/":
          await setActivity(ActivityType.BROWSING_LIBRARY);
          break;
        case "/search":
          await setActivity(ActivityType.SEARCHING_GAMES);
          break;
        case "/library":
          await setActivity(ActivityType.BROWSING_LIBRARY);
          break;
        case "/downloads":
        case "/torboxdownloads":
          await setActivity(ActivityType.BROWSING_DOWNLOADS);
          break;
        case "/settings":
          await setActivity(ActivityType.IN_SETTINGS);
          break;
        case "/ascend":
          await setActivity(ActivityType.IN_ASCEND);
          break;
        case "/download":
          // When viewing a specific game's download page
          const gameName = state?.gameData?.game || state?.gameData?.name;
          if (gameName) {
            await setActivity(ActivityType.VIEWING_GAME, gameName);
          } else {
            await setActivity(ActivityType.SEARCHING_GAMES);
          }
          break;
        case "/gamescreen":
          // When viewing a game's details
          const gameScreenName = state?.game?.game || state?.game?.name;
          if (gameScreenName) {
            await setActivity(ActivityType.VIEWING_GAME, gameScreenName);
          }
          break;
        default:
          await setActivity(ActivityType.IDLE);
          break;
      }
    };

    updateActivity();
  }, [pathname, state, user?.uid]);

  // Listen for game launch/close events
  useEffect(() => {
    if (!user?.uid) return;

    const handleGameLaunch = (_, data) => {
      const gameName = data?.game || "a game";
      setActivity(ActivityType.PLAYING_GAME, gameName);
    };

    const handleGameClosed = (_, data) => {
      // Restore to browsing library when game closes
      setActivity(ActivityType.BROWSING_LIBRARY);
    };

    // Listen for game events from Electron
    window.electron?.ipcRenderer?.on("game-launch-success", handleGameLaunch);
    window.electron?.ipcRenderer?.on("game-closed", handleGameClosed);

    return () => {
      window.electron?.ipcRenderer?.off("game-launch-success", handleGameLaunch);
      window.electron?.ipcRenderer?.off("game-closed", handleGameClosed);
    };
  }, [user?.uid]);

  // Listen for download events
  useEffect(() => {
    if (!user?.uid) return;

    let currentDownloadGame = null;

    const handleDownloadProgress = data => {
      // Only update if the game name changed to avoid spamming Firebase
      if (data?.game && data.game !== currentDownloadGame) {
        currentDownloadGame = data.game;
        setActivity(ActivityType.DOWNLOADING, data.game);
      }
    };

    const handleDownloadComplete = data => {
      currentDownloadGame = null;
      // Return to browsing after download completes
      setActivity(ActivityType.BROWSING_LIBRARY);
    };

    const unsubProgress = window.electron?.onDownloadProgress?.(handleDownloadProgress);
    const unsubComplete = window.electron?.onDownloadComplete?.(handleDownloadComplete);

    return () => {
      if (typeof unsubProgress === "function") unsubProgress();
      if (typeof unsubComplete === "function") unsubComplete();
    };
  }, [user?.uid]);

  // Clear activity when app closes
  useEffect(() => {
    if (!user?.uid) return;

    const handleAppClose = () => {
      clearActivity();
    };

    window.electron?.onAppClose?.(handleAppClose);

    return () => {
      clearActivity();
    };
  }, [user?.uid]);

  return null;
};

// Initialize Ascend status service when user is authenticated
const AscendStatusInitializer = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.uid) {
      console.log("[App] Initializing Ascend status service for user:", user.uid);
      initializeStatusService(null, user.uid).catch(err => {
        console.error("[App] Failed to initialize status service:", err);
      });

      return () => {
        cleanupStatusService();
      };
    }
  }, [user?.uid]);

  return null;
};

// Check for new messages and show notifications
const MessageNotificationChecker = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const lastCheckedRef = useRef({});
  const checkIntervalRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) {
      // Clear interval if user logs out
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      lastCheckedRef.current = {};
      return;
    }

    const checkForNewMessages = async () => {
      try {
        const result = await getUnreadMessageCount();
        if (result.error || result.newMessages.length === 0) return;

        // Check for new messages we haven't notified about
        result.newMessages.forEach(msg => {
          const lastNotified = lastCheckedRef.current[msg.conversationId] || 0;

          // Only notify if this is a new message (more unread than before)
          if (msg.unreadCount > lastNotified) {
            // Show toast notification
            toast(t("ascend.messages.newMessage", { name: msg.senderName }), {
              description:
                msg.messageText?.substring(0, 50) +
                (msg.messageText?.length > 50 ? "..." : ""),
              action: {
                label: t("common.view"),
                onClick: () => navigate("/ascend"),
              },
              duration: 5000,
            });
          }

          // Update last checked count
          lastCheckedRef.current[msg.conversationId] = msg.unreadCount;
        });
      } catch (e) {
        console.error("[MessageNotificationChecker] Error:", e);
      }
    };

    // Initial check after a short delay
    const initialTimeout = setTimeout(checkForNewMessages, 3000);

    // Check every 30 seconds
    checkIntervalRef.current = setInterval(checkForNewMessages, 30000);

    return () => {
      clearTimeout(initialTimeout);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [user?.uid, t, navigate]);

  return null;
};

const AppRoutes = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { user } = useAuth();
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
  const [showFirstIndexDialog, setShowFirstIndexDialog] = useState(false);
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
        const handleGameProtocol = async (event, { gameID }) => {
          console.log("Received game protocol URL with gameID:", gameID);
          if (!gameID) {
            console.error("No gameID received in game protocol URL");
            return;
          }

          try {
            // Clean the gameID by removing any query parameters or slashes
            const cleanGameID = gameID.replace(/[?/]/g, "");
            console.log("Looking up game with cleaned gameID:", cleanGameID);

            // Find the game using the efficient lookup service
            const game = await gameService.findGameByGameID(cleanGameID);
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
        }

        // Always ensure loading is set to false after initialization completes
        await ensureMinLoadingTime();
        setIsLoading(false);
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

  // Check if user needs to set up game index for the first time
  useEffect(() => {
    const checkFirstIndex = async () => {
      // Only check after loading is done and welcome is not showing
      if (isLoading || showWelcome) return;

      try {
        const hasIndexBefore = await window.electron.getTimestampValue("hasIndexBefore");
        console.log("Has indexed before:", hasIndexBefore);

        // If hasIndexBefore doesn't exist or is false, show the dialog
        if (!hasIndexBefore) {
          // Small delay to let other dialogs settle
          setTimeout(() => {
            setShowFirstIndexDialog(true);
          }, 1000);
        }
      } catch (error) {
        console.error("Error checking first index status:", error);
      }
    };
    checkFirstIndex();
  }, [isLoading, showWelcome]);

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
            "linear-gradient(135deg, rgb(var(--color-startup-accent, var(--color-primary)) / 0.1) 0%, rgb(var(--color-startup-background, var(--color-background))) 100%)",
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

  if (showWelcome === null && isLoading) {
    console.log("Rendering null - showWelcome is null and still loading");
    return null;
  }

  // If showWelcome is null but we're not loading, default to false to prevent blank screen
  const effectiveShowWelcome = showWelcome ?? false;

  if (location.pathname === "/welcome" && !effectiveShowWelcome) {
    console.log("Redirecting from welcome to home");
    return <Navigate to="/" replace />;
  }

  if (location.pathname === "/" && effectiveShowWelcome) {
    console.log("Redirecting from home to welcome");
    return <Navigate to="/welcome" replace />;
  }

  console.log("Rendering main routes with location:", location.pathname);

  return (
    <>
      <MenuBar />
      {effectiveShowWelcome ? (
        <Routes>
          <Route path="/extralanguages" element={<ExtraLanguages />} />
          <Route path="/localrefresh" element={<LocalRefresh />} />
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
        <Routes location={location} key={user?.uid || "logged-out"}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="library" element={<Library />} />
            <Route path="folderview/:folderName" element={<FolderView />} />
            <Route path="gamescreen" element={<GameScreen />} />
            <Route path="downloads" element={<Downloads />} />
            <Route path="torboxdownloads" element={<TorboxDownloads />} />
            <Route path="settings" element={<Settings />} />
            <Route path="sidecaranddependencies" element={<SidecarAndDependencies />} />
            <Route path="localrefresh" element={<LocalRefresh />} />
            <Route path="profile" element={<Profile />} />
            <Route path="ascend" element={<Ascend />} />
            <Route path="workshopdownloader" element={<WorkshopDownloader />} />
            <Route path="download" element={<DownloadPage />} />
            <Route path="extralanguages" element={<ExtraLanguages />} />
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
      {showFirstIndexDialog && (
        <FirstIndexDialog onClose={() => setShowFirstIndexDialog(false)} />
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
      toastOptions={{
        style: {
          background: "rgb(var(--color-background) / 0.8)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          color: "rgb(var(--color-foreground))",
          border: "1px solid rgb(var(--color-border) / 0.5)",
          borderRadius: "12px",
          padding: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
        },
        descriptionStyle: {
          color: "rgb(var(--color-muted-foreground))",
        },
        actionButtonStyle: {
          background: "rgb(var(--color-primary))",
          color: "rgb(var(--color-primary-foreground))",
          border: "none",
          borderRadius: "8px",
          fontWeight: "500",
        },
        actionButtonHoverStyle: {
          background: "rgb(var(--color-primary))",
          opacity: 0.9,
        },
        cancelButtonStyle: {
          background: "rgb(var(--color-muted) / 0.5)",
          color: "rgb(var(--color-muted-foreground))",
          border: "1px solid rgb(var(--color-border) / 0.3)",
          borderRadius: "8px",
        },
        cancelButtonHoverStyle: {
          background: "rgb(var(--color-muted) / 0.7)",
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
            <AuthProvider>
              <TourProvider>
                <Router>
                  <ToasterWithTheme />
                  <ContextMenu />
                  <ScrollToTop />
                  <AscendStatusInitializer />
                  <UserActivityTracker />
                  <MessageNotificationChecker />
                  <TrialWarningChecker />
                  <AppRoutes />
                  <MiniPlayer
                    expanded={playerExpanded}
                    onToggleExpand={() => setPlayerExpanded(!playerExpanded)}
                  />
                </Router>
              </TourProvider>
            </AuthProvider>
          </SettingsProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
