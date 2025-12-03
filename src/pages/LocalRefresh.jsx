import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw,
  Play,
  StopCircle,
  CircleCheck,
  AlertCircle,
  Loader,
  Database,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  FolderOpen,
  Folder,
  Settings2,
  ToggleRight,
  X,
  Plus,
  Ban,
  Cpu,
  Zap,
  LoaderIcon,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import RefreshIndexDialog from "@/components/RefreshIndexDialog";
import { useNavigate, useLocation } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";
import imageCacheService from "@/services/imageCacheService";
import gameService from "@/services/gameService";

const LocalRefresh = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, updateSetting } = useSettings();

  // Get welcomeStep, indexRefreshStarted, and indexComplete from navigation state if coming from Welcome page
  const welcomeStep = location.state?.welcomeStep;
  const indexRefreshStartedFromWelcome = location.state?.indexRefreshStarted;

  // Add CSS animation for indeterminate progress
  useEffect(() => {
    if (!document.getElementById("localrefresh-animations")) {
      const styleEl = document.createElement("style");
      styleEl.id = "localrefresh-animations";
      styleEl.textContent = `
        @keyframes progress-loading {
          0% { width: 0%; left: 0; }
          50% { width: 40%; left: 30%; }
          100% { width: 0%; left: 100%; }
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  // State for refresh process
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [totalGames, setTotalGames] = useState(0);
  const [processedGames, setProcessedGames] = useState(0);
  const [errors, setErrors] = useState([]);
  const [showErrors, setShowErrors] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [refreshStatus, setRefreshStatus] = useState("idle"); // idle, running, completed, error
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [showRefreshDialog, setShowRefreshDialog] = useState(false);
  const [localIndexPath, setLocalIndexPath] = useState("");
  const [currentPhase, setCurrentPhase] = useState(""); // Track current phase for indeterminate progress
  const [hasIndexBefore, setHasIndexBefore] = useState(false);
  const manuallyStoppedRef = useRef(false);
  const [newBlacklistId, setNewBlacklistId] = useState("");
  const [workerCount, setWorkerCount] = useState(8);
  const [fetchPageCount, setFetchPageCount] = useState(50);
  const [showCookieRefreshDialog, setShowCookieRefreshDialog] = useState(false);
  const [cookieRefreshCount, setCookieRefreshCount] = useState(0);
  const cookieSubmittedRef = useRef(false);
  const lastCookieToastTimeRef = useRef(0);
  const cookieDialogOpenRef = useRef(false);

  // Load settings and ensure localIndex is set, also check if refresh is running
  useEffect(() => {
    const initializeSettings = async () => {
      try {
        const settings = await window.electron.getSettings();

        // Load saved refresh preferences
        if (settings?.localRefreshWorkers !== undefined) {
          setWorkerCount(settings.localRefreshWorkers);
        }
        if (settings?.fetchPageCount !== undefined) {
          setFetchPageCount(settings.fetchPageCount);
        }

        // Check if localIndex is set, if not set it to default
        let indexPath = settings?.localIndex;
        if (!indexPath) {
          const defaultPath = await window.electron.getDefaultLocalIndexPath();
          await window.electron.updateSetting("localIndex", defaultPath);
          setLocalIndexPath(defaultPath);
          indexPath = defaultPath;
          console.log("Set default localIndex path:", defaultPath);
        } else {
          setLocalIndexPath(indexPath);
        }

        // Check if user has indexed before from timestamp
        if (window.electron?.getTimestampValue) {
          const hasIndexed = await window.electron.getTimestampValue("hasIndexBefore");
          setHasIndexBefore(hasIndexed === true);
        }

        // Load last refresh time from progress.json timestamp
        if (indexPath && window.electron?.getLocalRefreshProgress) {
          try {
            const progress = await window.electron.getLocalRefreshProgress(indexPath);
            if (progress?.timestamp) {
              // timestamp is in seconds (Unix epoch), convert to milliseconds
              setLastRefreshTime(new Date(progress.timestamp * 1000));
            }
          } catch (e) {
            console.log("No progress file found for last refresh time");
          }
        }

        // Check if a refresh is currently running and restore UI state
        if (window.electron?.getLocalRefreshStatus) {
          const status = await window.electron.getLocalRefreshStatus(indexPath);
          if (status.isRunning) {
            console.log("Refresh is running, restoring UI state:", status.progress);
            setIsRefreshing(true);
            setRefreshStatus("running");

            if (status.progress) {
              const data = status.progress;
              if (data.progress !== undefined) {
                // Cap progress at 100% to prevent display issues
                setProgress(Math.min(Math.round(data.progress * 100), 100));
              }
              if (data.phase) {
                setCurrentPhase(data.phase);
                const phaseMessages = {
                  starting: t("localRefresh.initializing") || "Initializing...",
                  initializing: t("localRefresh.initializing") || "Initializing...",
                  fetching_categories:
                    t("localRefresh.fetchingCategories") || "Fetching categories...",
                  fetching_posts:
                    t("localRefresh.fetchingPosts") || "Fetching game posts...",
                  processing_posts:
                    t("localRefresh.processingPosts") || "Processing games...",
                  fetching_views:
                    t("localRefresh.fetchingViews") || "Fetching view counts...",
                  waiting_for_cookie:
                    t("localRefresh.waitingForCookie") ||
                    "Cookie expired - waiting for new cookie...",
                  saving: t("localRefresh.saving") || "Saving data...",
                  done: t("localRefresh.done") || "Done",
                };
                setCurrentStep(phaseMessages[data.phase] || data.phase);
              }
              if (data.totalPosts !== undefined) {
                setTotalGames(data.totalPosts);
              }
              if (data.processedPosts !== undefined) {
                setProcessedGames(data.processedPosts);
              }
              if (data.errors && data.errors.length > 0) {
                setErrors(
                  data.errors.map(e => ({
                    message: e.message,
                    timestamp: new Date(e.timestamp * 1000),
                  }))
                );
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to initialize settings:", error);
      }
    };
    initializeSettings();
  }, [t]);

  // Listen for refresh progress updates from the backend
  useEffect(() => {
    const handleProgressUpdate = data => {
      console.log("Progress update received:", data);
      // Map progress.json fields to UI state
      if (data.progress !== undefined) {
        // Cap progress at 100% to prevent display issues
        setProgress(Math.min(Math.round(data.progress * 100), 100));
      }
      if (data.phase) {
        setCurrentPhase(data.phase); // Track phase for indeterminate progress
        const phaseMessages = {
          starting: t("localRefresh.initializing") || "Initializing...",
          initializing: t("localRefresh.initializing") || "Initializing...",
          fetching_categories:
            t("localRefresh.fetchingCategories") || "Fetching categories...",
          fetching_posts: t("localRefresh.fetchingPosts") || "Fetching game posts...",
          processing_posts: t("localRefresh.processingPosts") || "Processing games...",
          waiting_for_cookie:
            t("localRefresh.waitingForCookie") ||
            "Cookie expired - waiting for new cookie...",
          saving: t("localRefresh.saving") || "Saving data...",
          done: t("localRefresh.done") || "Done",
        };
        setCurrentStep(phaseMessages[data.phase] || data.phase);

        // Auto-show cookie dialog when waiting for cookie (but not if we just submitted one)
        if (
          (data.phase === "waiting_for_cookie" || data.waitingForCookie) &&
          !cookieSubmittedRef.current &&
          !cookieDialogOpenRef.current
        ) {
          cookieDialogOpenRef.current = true;
          setShowCookieRefreshDialog(true);
        }

        // Reset the cookie submitted flag when phase changes away from waiting_for_cookie
        // but only after a delay to prevent race conditions with multiple progress updates
        if (data.phase !== "waiting_for_cookie" && !data.waitingForCookie) {
          // Delay reset to ensure we don't get caught by rapid progress updates
          setTimeout(() => {
            cookieSubmittedRef.current = false;
          }, 2000);
        }
      }
      if (data.currentGame) {
        setCurrentStep(prev => `${prev} - ${data.currentGame}`);
      }
      if (data.totalPosts !== undefined) {
        setTotalGames(data.totalPosts);
      }
      if (data.processedPosts !== undefined) {
        setProcessedGames(data.processedPosts);
      }
      if (data.errors && data.errors.length > 0) {
        // Only add new errors
        const lastError = data.errors[data.errors.length - 1];
        setErrors(prev => {
          const exists = prev.some(e => e.message === lastError.message);
          if (!exists) {
            return [
              ...prev,
              {
                message: lastError.message,
                timestamp: new Date(lastError.timestamp * 1000),
              },
            ];
          }
          return prev;
        });
      }
      if (data.status === "completed") {
        setRefreshStatus("completed");
        setIsRefreshing(false);
        setHasIndexBefore(true); // Update UI immediately after successful refresh
        // Use timestamp from progress data if available
        if (data.timestamp) {
          setLastRefreshTime(new Date(data.timestamp * 1000));
        } else {
          setLastRefreshTime(new Date());
        }
        toast.success(
          t("localRefresh.refreshComplete") || "Game list refresh completed!"
        );
      } else if (data.status === "failed" || data.status === "error") {
        setRefreshStatus("error");
        setIsRefreshing(false);
        toast.error(t("localRefresh.refreshFailed") || "Game list refresh failed");
      }
    };

    const handleComplete = async data => {
      if (data.code === 0) {
        setRefreshStatus("completed");
        setIsRefreshing(false);
        setHasIndexBefore(true); // Update UI immediately after successful refresh
        manuallyStoppedRef.current = false;
        // Read timestamp from progress.json
        try {
          const progress = await window.electron.getLocalRefreshProgress(localIndexPath);
          if (progress?.timestamp) {
            setLastRefreshTime(new Date(progress.timestamp * 1000));
          } else {
            setLastRefreshTime(new Date());
          }
        } catch (e) {
          setLastRefreshTime(new Date());
        }
        toast.success(
          t("localRefresh.refreshComplete") || "Game list refresh completed!"
        );
      } else {
        // Don't show error if user manually stopped
        setIsRefreshing(false);
        if (manuallyStoppedRef.current) {
          // User manually stopped - keep idle status, don't show error
          manuallyStoppedRef.current = false;
          return;
        }
        setRefreshStatus("error");
        toast.error(t("localRefresh.refreshFailed") || "Game list refresh failed");
      }
    };

    const handleError = data => {
      setRefreshStatus("error");
      setIsRefreshing(false);
      setErrors(prev => [...prev, { message: data.error, timestamp: new Date() }]);
      toast.error(t("localRefresh.refreshFailed") || "Game list refresh failed");
    };

    const handleCookieNeeded = () => {
      console.log("Cookie refresh needed - showing dialog");
      setShowCookieRefreshDialog(true);
    };

    // Subscribe to IPC events
    if (window.electron?.onLocalRefreshProgress) {
      window.electron.onLocalRefreshProgress(handleProgressUpdate);
      window.electron.onLocalRefreshComplete(handleComplete);
      window.electron.onLocalRefreshError(handleError);
      window.electron.onLocalRefreshCookieNeeded?.(handleCookieNeeded);

      return () => {
        window.electron.offLocalRefreshProgress?.();
        window.electron.offLocalRefreshComplete?.();
        window.electron.offLocalRefreshError?.();
        window.electron.offLocalRefreshCookieNeeded?.();
      };
    }
  }, [t]);

  const handleOpenRefreshDialog = () => {
    setShowRefreshDialog(true);
  };

  const handleStartRefresh = async refreshData => {
    setIsRefreshing(true);
    setRefreshStatus("running");
    setProgress(0);
    setProcessedGames(0);
    setTotalGames(0);
    setErrors([]);
    setCurrentPhase("initializing");
    manuallyStoppedRef.current = false;
    setCookieRefreshCount(0);
    setCurrentStep(t("localRefresh.initializing") || "Initializing...");

    try {
      // Call the electron API to start the local refresh process
      if (window.electron?.startLocalRefresh) {
        const result = await window.electron.startLocalRefresh({
          outputPath: localIndexPath,
          cfClearance: refreshData.cfClearance,
          perPage: fetchPageCount,
          workers: workerCount,
          userAgent: refreshData.userAgent,
        });

        if (!result.success) {
          throw new Error(result.error || "Failed to start refresh");
        }
      } else {
        // Simulate progress for development/testing
        simulateRefresh();
      }
    } catch (error) {
      console.error("Failed to start refresh:", error);
      setRefreshStatus("error");
      setIsRefreshing(false);
      setErrors(prev => [...prev, { message: error.message, timestamp: new Date() }]);
      toast.error(t("localRefresh.startFailed") || "Failed to start refresh");
    }
  };

  const handleStopRefresh = async () => {
    setShowStopDialog(false);
    manuallyStoppedRef.current = true;
    try {
      if (window.electron?.stopLocalRefresh) {
        // Pass localIndexPath so Electron can restore backups
        await window.electron.stopLocalRefresh(localIndexPath);
      }
      setIsRefreshing(false);
      setRefreshStatus("idle");
      setCurrentStep(t("localRefresh.stopped") || "Refresh stopped");
      toast.info(
        t("localRefresh.refreshStopped") ||
          "Game list refresh stopped and backups restored"
      );
    } catch (error) {
      console.error("Failed to stop refresh:", error);
      manuallyStoppedRef.current = false;
      toast.error(t("localRefresh.stopFailed") || "Failed to stop refresh");
    }
  };

  const handleCookieRefresh = async refreshData => {
    // This is called when user provides a new cookie during mid-refresh
    if (refreshData.isCookieRefresh && refreshData.cfClearance) {
      try {
        if (window.electron?.sendLocalRefreshCookie) {
          const result = await window.electron.sendLocalRefreshCookie(
            refreshData.cfClearance
          );
          if (result.success) {
            cookieSubmittedRef.current = true; // Mark that cookie was successfully submitted BEFORE dialog closes
            setCookieRefreshCount(prev => prev + 1);
            // Don't call setShowCookieRefreshDialog here - the dialog's handleClose will do it
            // Debounce toast to prevent spam - only show if last toast was more than 3 seconds ago
            const now = Date.now();
            if (now - lastCookieToastTimeRef.current > 3000) {
              lastCookieToastTimeRef.current = now;
              toast.success(
                t("localRefresh.cookieRefreshed") || "Cookie refreshed, resuming..."
              );
            }
            return; // Return early so the dialog close handler knows cookie was sent
          } else {
            toast.error(
              result.error ||
                t("localRefresh.cookieRefreshFailed") ||
                "Failed to refresh cookie"
            );
          }
        }
      } catch (error) {
        console.error("Failed to send new cookie:", error);
        toast.error(t("localRefresh.cookieRefreshFailed") || "Failed to refresh cookie");
      }
    }
  };

  const handleCookieRefreshDialogClose = async open => {
    if (!open && showCookieRefreshDialog) {
      cookieDialogOpenRef.current = false;
      setShowCookieRefreshDialog(false);
      // Only stop refresh if user cancelled without submitting a cookie
      if (!cookieSubmittedRef.current) {
        await handleStopRefresh();
      }
      // Don't reset cookieSubmittedRef here - let the progress handler do it
      // after the phase changes away from waiting_for_cookie
    } else {
      cookieDialogOpenRef.current = open;
      setShowCookieRefreshDialog(open);
    }
  };

  const handleChangeLocation = async () => {
    try {
      const result = await window.electron.openDirectoryDialog();
      if (result) {
        await window.electron.updateSetting("localIndex", result);
        setLocalIndexPath(result);
        toast.success(t("localRefresh.locationChanged") || "Storage location updated");
      }
    } catch (error) {
      console.error("Failed to change location:", error);
      toast.error(t("localRefresh.locationChangeFailed") || "Failed to change location");
    }
  };

  // Simulation function for development/testing
  const simulateRefresh = () => {
    const steps = [
      { step: "Connecting to SteamRIP...", duration: 1000 },
      { step: "Fetching game list...", duration: 1500 },
      { step: "Processing game metadata...", duration: 2000 },
      { step: "Updating local index...", duration: 1500 },
      { step: "Finalizing...", duration: 1000 },
    ];

    let currentProgress = 0;
    const totalSteps = steps.length;
    const simulatedTotalGames = 25;
    setTotalGames(simulatedTotalGames);

    steps.forEach((stepInfo, index) => {
      setTimeout(
        () => {
          setCurrentStep(stepInfo.step);
          const stepProgress = ((index + 1) / totalSteps) * 100;
          setProgress(stepProgress);
          setProcessedGames(Math.floor((stepProgress / 100) * simulatedTotalGames));

          if (index === totalSteps - 1) {
            setTimeout(() => {
              setRefreshStatus("completed");
              setIsRefreshing(false);
              setHasIndexBefore(true); // Update UI immediately after successful refresh
              setLastRefreshTime(new Date());
              toast.success(
                t("localRefresh.refreshComplete") || "Game list refresh completed!"
              );
            }, 500);
          }
        },
        steps.slice(0, index + 1).reduce((acc, s) => acc + s.duration, 0)
      );
    });
  };

  const formatLastRefreshTime = date => {
    if (!date) return t("localRefresh.never") || "Never";
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("localRefresh.justNow") || "Just now";
    if (diffMins === 1)
      return `${diffMins} ${t("localRefresh.minuteAgo") || "minute ago"}`;
    if (diffMins < 60)
      return `${diffMins} ${t("localRefresh.minutesAgo") || "minutes ago"}`;
    if (diffHours === 1) return `${diffHours} ${t("localRefresh.hourAgo") || "hour ago"}`;
    if (diffHours < 24)
      return `${diffHours} ${t("localRefresh.hoursAgo") || "hours ago"}`;
    if (diffDays === 1) return `${diffDays} ${t("localRefresh.dayAgo") || "day ago"}`;
    return `${diffDays} ${t("localRefresh.daysAgo") || "days ago"}`;
  };

  // Handle enabling local index
  const handleEnableLocalIndex = async () => {
    console.log("[LocalRefresh] Clearing caches before switching to local index");
    imageCacheService.invalidateSettingsCache();
    await imageCacheService.clearCache(true);
    gameService.clearMemoryCache();
    localStorage.removeItem("ascendara_games_cache");
    localStorage.removeItem("local_ascendara_games_timestamp");
    localStorage.removeItem("local_ascendara_metadata_cache");
    localStorage.removeItem("local_ascendara_last_updated");
    await updateSetting("usingLocalIndex", true);
    toast.success(t("localRefresh.switchedToLocal"));
    window.location.reload();
  };

  // Handle back navigation
  const handleBack = () => {
    if (welcomeStep) {
      const stillRefreshing = isRefreshing || indexRefreshStartedFromWelcome;
      const isComplete = refreshStatus === "completed";
      navigate("/welcome", {
        state: {
          welcomeStep,
          indexRefreshStarted: stillRefreshing && !isComplete,
          indexComplete: isComplete,
        },
      });
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={`${welcomeStep ? "mt-0 pt-10" : "mt-6"} min-h-screen bg-background`}>
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("common.back") || "Back"}
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-primary">
              {t("localRefresh.title") || "Local Game Index"}
            </h1>
            {isRefreshing && (
              <Badge variant="secondary" className="gap-1">
                <Loader className="h-3 w-3 animate-spin" />
                {t("localRefresh.statusRunning") || "Refreshing..."}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-muted-foreground">
            {t("localRefresh.description") ||
              "Manage your local game index for faster browsing and offline access"}
          </p>
        </div>

        <div className="space-y-6">
          {/* Main Action Card */}
          <Card className="relative overflow-hidden border-border p-6">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
            <div className="relative">
              <div className="flex items-start justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-primary/10 p-3">
                    {isRefreshing ? (
                      <LoaderIcon className="h-7 w-7 animate-spin text-primary" />
                    ) : refreshStatus === "completed" ? (
                      <CircleCheck className="h-7 w-7 text-green-500" />
                    ) : refreshStatus === "error" ? (
                      <XCircle className="h-7 w-7 text-red-500" />
                    ) : (
                      <Database className="h-7 w-7 text-primary" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold">
                      {isRefreshing
                        ? t("localRefresh.statusRunning") || "Refreshing Index..."
                        : refreshStatus === "completed"
                          ? t("localRefresh.statusCompleted") || "Refresh Complete"
                          : refreshStatus === "error"
                            ? t("localRefresh.statusError") || "Refresh Failed"
                            : t("localRefresh.statusIdle") || "Ready to Refresh"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {currentStep ||
                        t("localRefresh.readyToStart") ||
                        "Click start to update your local game index"}
                    </p>
                    <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatLastRefreshTime(lastRefreshTime)}</span>
                      </div>
                      {settings?.usingLocalIndex && (
                        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                          <Zap className="h-3.5 w-3.5" />
                          <span>
                            {t("localRefresh.usingLocalIndex") || "Using Local Index"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {!isRefreshing ? (
                    <Button
                      onClick={handleOpenRefreshDialog}
                      size="lg"
                      className="gap-2 text-secondary"
                    >
                      {refreshStatus === "completed" ? (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          {t("localRefresh.refreshAgain") || "Refresh Again"}
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          {t("localRefresh.startRefresh") || "Start Refresh"}
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      size="lg"
                      onClick={() => setShowStopDialog(true)}
                      className="gap-2"
                    >
                      <StopCircle className="h-4 w-4" />
                      {t("localRefresh.stopRefresh") || "Stop"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress Section */}
              <AnimatePresence>
                {(isRefreshing || refreshStatus === "completed") && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 24 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="space-y-3 rounded-lg bg-muted/50 p-4"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t("localRefresh.progress") || "Progress"}
                      </span>
                      {currentPhase !== "fetching_posts" &&
                        currentPhase !== "fetching_categories" &&
                        currentPhase !== "initializing" &&
                        currentPhase !== "starting" &&
                        currentPhase !== "waiting_for_cookie" && (
                          <span className="font-medium">{Math.round(progress)}%</span>
                        )}
                      {currentPhase === "waiting_for_cookie" && (
                        <span className="font-medium text-orange-500">
                          {t("localRefresh.waitingForCookieShort") || "Waiting..."}
                        </span>
                      )}
                    </div>
                    {currentPhase === "waiting_for_cookie" ? (
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-orange-200 dark:bg-orange-900/30">
                        <div
                          className="absolute h-full rounded-full bg-orange-500"
                          style={{
                            animation: "progress-loading 2s ease-in-out infinite",
                          }}
                        />
                      </div>
                    ) : (currentPhase === "fetching_posts" ||
                        currentPhase === "fetching_categories" ||
                        currentPhase === "initializing" ||
                        currentPhase === "starting") &&
                      isRefreshing ? (
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="absolute h-full rounded-full bg-primary"
                          style={{
                            animation: "progress-loading 1.5s ease-in-out infinite",
                          }}
                        />
                      </div>
                    ) : (
                      <Progress value={progress} className="h-2" />
                    )}
                    {currentPhase === "processing_posts" && totalGames > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {t("localRefresh.gamesProcessed") || "Games Processed"}
                        </span>
                        <span className="font-medium">
                          {processedGames} / {totalGames}
                        </span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Errors Section */}
              <AnimatePresence>
                {errors.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4"
                  >
                    <button
                      onClick={() => setShowErrors(!showErrors)}
                      className="border-destructive/30 bg-destructive/5 hover:bg-destructive/10 flex w-full items-center justify-between rounded-lg border p-3 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="text-destructive h-4 w-4" />
                        <span className="text-destructive text-sm font-medium">
                          {t("localRefresh.errors") || "Errors"} ({errors.length})
                        </span>
                      </div>
                      {showErrors ? (
                        <ChevronUp className="text-destructive h-4 w-4" />
                      ) : (
                        <ChevronDown className="text-destructive h-4 w-4" />
                      )}
                    </button>
                    <AnimatePresence>
                      {showErrors && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-destructive/20 bg-destructive/5 mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2"
                        >
                          {errors.map((error, index) => (
                            <div
                              key={index}
                              className="bg-destructive/10 flex items-center justify-between rounded px-2 py-1 text-xs"
                            >
                              <span className="text-destructive font-mono">
                                {error.message}
                              </span>
                              <span className="text-destructive/60">
                                {error.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Card>

          {/* Enable Local Index Card - Only show if not using local index */}
          {!settings?.usingLocalIndex && (
            <Card className="border-border p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2.5">
                    <ToggleRight className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {t("localRefresh.switchToLocal") || "Enable Local Index"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {hasIndexBefore
                        ? t("localRefresh.switchToLocalReady") ||
                          "Your local index is ready to use"
                        : t("localRefresh.switchToLocalNotReady") ||
                          "Refresh the index first to enable"}
                    </p>
                  </div>
                </div>
                <Button
                  variant={hasIndexBefore ? "default" : "outline"}
                  className={hasIndexBefore ? "gap-2 text-secondary" : "gap-2"}
                  disabled={!hasIndexBefore || isRefreshing}
                  onClick={handleEnableLocalIndex}
                >
                  <ToggleRight className="h-4 w-4" />
                  {t("localRefresh.enableLocalIndex") || "Enable"}
                </Button>
              </div>
            </Card>
          )}

          {/* Settings Accordion */}
          <Card className="border-border">
            <Accordion type="single" collapsible className="w-full">
              {/* Storage Location */}
              <AccordionItem value="storage" className="border-b-0 px-6">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Folder className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <span className="font-medium">
                        {t("localRefresh.storageLocation") || "Storage Location"}
                      </span>
                      <p className="text-xs font-normal text-muted-foreground">
                        {t("localRefresh.storageLocationDesc") ||
                          "Where the local index is stored"}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={localIndexPath}
                      readOnly
                      className="flex-1 bg-muted/50 text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-2"
                      onClick={handleChangeLocation}
                      disabled={isRefreshing}
                    >
                      <FolderOpen className="h-4 w-4" />
                      {t("settings.selectDirectory") || "Browse"}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Performance Settings */}
              <AccordionItem
                value="performance"
                className="border-b-0 border-t border-border/50 px-6"
              >
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Cpu className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <span className="font-medium">
                        {t("localRefresh.performanceSettings") || "Performance"}
                      </span>
                      <p className="text-xs font-normal text-muted-foreground">
                        {t("localRefresh.performanceSettingsDesc") ||
                          "Configure refresh speed and resources"}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="worker-count" className="text-sm font-medium">
                        {t("localRefresh.workerCount") || "Worker Threads"}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("localRefresh.workerCountDesc") ||
                          "Parallel processing threads (1-16)"}
                      </p>
                    </div>
                    <Input
                      id="worker-count"
                      type="number"
                      min={1}
                      max={16}
                      value={workerCount}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        if (val >= 1 && val <= 16) {
                          setWorkerCount(val);
                          window.electron?.updateSetting("localRefreshWorkers", val);
                        }
                      }}
                      disabled={isRefreshing}
                      className="w-20 text-center"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">
                        {t("localRefresh.gamesPerPage") || "Games per Page"}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("localRefresh.gamesPerPageHint") ||
                          "Higher values are faster but may timeout (10-100)"}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      value={fetchPageCount}
                      onChange={e => {
                        const value = Math.min(
                          100,
                          Math.max(10, parseInt(e.target.value) || 50)
                        );
                        setFetchPageCount(value);
                        window.electron?.updateSetting("fetchPageCount", value);
                      }}
                      disabled={isRefreshing}
                      className="w-20 text-center"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Blacklist */}
              <AccordionItem
                value="blacklist"
                className="border-0 border-t border-border/50 px-6"
              >
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Ban className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <span className="font-medium">
                        {t("localRefresh.blacklist") || "Blacklisted Games"}
                      </span>
                      <p className="text-xs font-normal text-muted-foreground">
                        {t("localRefresh.blacklistDesc") ||
                          "Exclude specific games from the index"}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-4">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder={t("localRefresh.enterGameId") || "Enter game ID"}
                      value={newBlacklistId}
                      onChange={e => setNewBlacklistId(e.target.value)}
                      className="w-32 bg-muted/50 text-sm"
                      disabled={isRefreshing}
                      onKeyDown={e => {
                        if (e.key === "Enter" && newBlacklistId) {
                          const id = parseInt(newBlacklistId);
                          if (!isNaN(id) && !settings?.blacklistIDs?.includes(id)) {
                            const newList = [...(settings?.blacklistIDs || []), id];
                            updateSetting("blacklistIDs", newList);
                            setNewBlacklistId("");
                          }
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRefreshing || !newBlacklistId}
                      onClick={() => {
                        const id = parseInt(newBlacklistId);
                        if (!isNaN(id) && !settings?.blacklistIDs?.includes(id)) {
                          const newList = [...(settings?.blacklistIDs || []), id];
                          updateSetting("blacklistIDs", newList);
                          setNewBlacklistId("");
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {settings?.blacklistIDs?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {settings.blacklistIDs.map(id => (
                        <div
                          key={id}
                          className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-sm"
                        >
                          <span className="font-mono">{id}</span>
                          <button
                            onClick={() => {
                              const newList = settings.blacklistIDs.filter(i => i !== id);
                              updateSetting("blacklistIDs", newList);
                            }}
                            disabled={isRefreshing}
                            className="hover:bg-destructive/20 hover:text-destructive ml-0.5 rounded p-0.5 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>

          {/* Info Card */}
          <Card className="border-border bg-muted/30 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">
                  {t("localRefresh.whatThisDoes") || "What does this do?"}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("localRefresh.whatThisDoesDescription") ||
                    "The local index stores game data on your device for faster browsing and offline access. Refreshing updates the index with the latest games from SteamRIP."}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Stop Confirmation Dialog */}
        <AlertDialog open={showStopDialog} onOpenChange={setShowStopDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("localRefresh.stopConfirmTitle") || "Stop Refresh?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("localRefresh.stopConfirmDescription") ||
                  "Are you sure you want to stop the refresh process? Progress will be lost and you'll need to start again."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel") || "Cancel"}</AlertDialogCancel>
              <AlertDialogAction className="text-secondary" onClick={handleStopRefresh}>
                {t("localRefresh.stopRefresh") || "Stop Refresh"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Refresh Index Dialog */}
        <RefreshIndexDialog
          open={showRefreshDialog}
          onOpenChange={setShowRefreshDialog}
          onStartRefresh={handleStartRefresh}
        />

        {/* Cookie Refresh Dialog - reuses RefreshIndexDialog in cookie-refresh mode */}
        <RefreshIndexDialog
          open={showCookieRefreshDialog}
          onOpenChange={handleCookieRefreshDialogClose}
          onStartRefresh={handleCookieRefresh}
          mode="cookie-refresh"
          cookieRefreshCount={cookieRefreshCount}
        />
      </div>
    </div>
  );
};

export default LocalRefresh;
