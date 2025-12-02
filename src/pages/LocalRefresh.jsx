import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  FileText,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  FolderOpen,
  Folder,
  Settings2,
  ToggleRight,
  ArrowLeftRight,
  X,
  Plus,
  Ban,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

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
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showRefreshDialog, setShowRefreshDialog] = useState(false);
  const [localIndexPath, setLocalIndexPath] = useState("");
  const [currentPhase, setCurrentPhase] = useState(""); // Track current phase for indeterminate progress
  const [hasIndexBefore, setHasIndexBefore] = useState(false);
  const manuallyStoppedRef = useRef(false);
  const [newBlacklistId, setNewBlacklistId] = useState("");
  const [workerCount, setWorkerCount] = useState(8);

  // Load settings and ensure localIndex is set, also check if refresh is running
  useEffect(() => {
    const initializeSettings = async () => {
      try {
        const settings = await window.electron.getSettings();

        // Load saved refresh preferences
        if (settings?.localRefreshWorkers !== undefined) {
          setWorkerCount(settings.localRefreshWorkers);
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
                setProgress(Math.round(data.progress * 100));
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
        setProgress(Math.round(data.progress * 100));
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
          saving: t("localRefresh.saving") || "Saving data...",
          done: t("localRefresh.done") || "Done",
        };
        setCurrentStep(phaseMessages[data.phase] || data.phase);
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

    // Subscribe to IPC events
    if (window.electron?.onLocalRefreshProgress) {
      window.electron.onLocalRefreshProgress(handleProgressUpdate);
      window.electron.onLocalRefreshComplete(handleComplete);
      window.electron.onLocalRefreshError(handleError);

      return () => {
        window.electron.offLocalRefreshProgress?.();
        window.electron.offLocalRefreshComplete?.();
        window.electron.offLocalRefreshError?.();
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
    setLogs([]);
    setCurrentPhase("initializing");
    manuallyStoppedRef.current = false;
    setCurrentStep(t("localRefresh.initializing") || "Initializing...");

    try {
      // Call the electron API to start the local refresh process
      if (window.electron?.startLocalRefresh) {
        const result = await window.electron.startLocalRefresh({
          outputPath: localIndexPath,
          cfClearance: refreshData.cfClearance,
          perPage: settings?.fetchPageCount || 50,
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
        await window.electron.stopLocalRefresh();
      }
      setIsRefreshing(false);
      setRefreshStatus("idle");
      setCurrentStep(t("localRefresh.stopped") || "Refresh stopped");
      toast.info(t("localRefresh.refreshStopped") || "Game list refresh stopped");
    } catch (error) {
      console.error("Failed to stop refresh:", error);
      manuallyStoppedRef.current = false;
      toast.error(t("localRefresh.stopFailed") || "Failed to stop refresh");
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
          setLogs(prev => [...prev, { message: stepInfo.step, timestamp: new Date() }]);

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

  const getStatusIcon = () => {
    switch (refreshStatus) {
      case "running":
        return <Loader className="h-5 w-5 animate-spin text-primary" />;
      case "completed":
        return <CircleCheck className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Database className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (refreshStatus) {
      case "running":
        return t("localRefresh.statusRunning") || "Refreshing...";
      case "completed":
        return t("localRefresh.statusCompleted") || "Completed";
      case "error":
        return t("localRefresh.statusError") || "Error";
      default:
        return t("localRefresh.statusIdle") || "Ready";
    }
  };

  return (
    <div className={`${welcomeStep ? "mt-0 pt-10" : "mt-6"} min-h-screen bg-background`}>
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="space-y-8"
        >
          {/* Header with Back Button */}
          <div className="space-y-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // If we came from Welcome, navigate back with the step state and refresh status
                if (welcomeStep) {
                  // Check if refresh is currently running or completed
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
              }}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("common.back") || "Back"}
            </Button>

            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("localRefresh.title") || "Refresh Game List"}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {t("localRefresh.description") ||
                  "Re-scrape SteamRIP to fetch newly added games and update your local game index"}
              </p>
            </div>
          </div>

          {!settings?.usingLocalIndex && (
            <div
              className={`relative overflow-hidden rounded-xl border-2 p-6 transition-all ${
                hasIndexBefore
                  ? "border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
                  : "border-dashed border-muted-foreground/30 bg-muted/10"
              }`}
            >
              {hasIndexBefore && (
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
              )}
              <div className="relative flex flex-col items-center space-y-4 text-center">
                <div
                  className={`rounded-full p-4 ${
                    hasIndexBefore ? "bg-primary/20" : "bg-muted"
                  }`}
                >
                  <ArrowLeftRight
                    className={`h-8 w-8 ${
                      hasIndexBefore ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="space-y-2">
                  <h3
                    className={`text-xl font-bold ${
                      hasIndexBefore ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {t("localRefresh.switchToLocal") || "Switch to Local Index"}
                  </h3>
                  <p className="max-w-md text-sm text-muted-foreground">
                    {hasIndexBefore
                      ? t("localRefresh.switchToLocalReady")
                      : t("localRefresh.switchToLocalNotReady")}
                  </p>
                </div>
                <Button
                  size="lg"
                  variant={hasIndexBefore ? "default" : "outline"}
                  className={`gap-2 ${hasIndexBefore ? "text-secondary" : ""}`}
                  disabled={!hasIndexBefore || isRefreshing}
                  onClick={async () => {
                    // Clear all caches before switching to local index
                    console.log(
                      "[LocalRefresh] Clearing caches before switching to local index"
                    );

                    // Invalidate settings cache first
                    imageCacheService.invalidateSettingsCache();

                    // Clear image cache (memory + IndexedDB), skip auto-refresh since we're reloading
                    await imageCacheService.clearCache(true);

                    // Clear game service memory cache
                    gameService.clearMemoryCache();

                    // Clear localStorage caches
                    localStorage.removeItem("ascendara_games_cache");
                    localStorage.removeItem("local_ascendara_games_timestamp");
                    localStorage.removeItem("local_ascendara_metadata_cache");
                    localStorage.removeItem("local_ascendara_last_updated");

                    // Now enable local index
                    await updateSetting("usingLocalIndex", true);

                    toast.success(t("localRefresh.switchedToLocal"));

                    // Force reload the page to ensure fresh data
                    window.location.reload();
                  }}
                >
                  <ToggleRight className="h-4 w-4" />
                  {hasIndexBefore
                    ? t("localRefresh.enableLocalIndex") || "Enable Local Index"
                    : t("localRefresh.refreshFirst") || "Refresh Index First"}
                </Button>
              </div>
            </div>
          )}

          {/* Status Section */}
          <div className="space-y-6">
            {/* Status Bar */}
            <div className="flex items-center gap-6 rounded-xl bg-gradient-to-r from-primary/5 via-transparent to-transparent py-4 pl-5 pr-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  {getStatusIcon()}
                  {isRefreshing && (
                    <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-primary" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold">{getStatusText()}</span>
                  <span className="text-xs text-muted-foreground">
                    {currentStep ||
                      t("localRefresh.readyToStart") ||
                      "Ready to start refresh"}
                  </span>
                </div>
              </div>

              <div className="h-8 w-px bg-border/50" />

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatLastRefreshTime(lastRefreshTime)}</span>
              </div>

              <div className="ml-auto">
                {!isRefreshing ? (
                  <Button
                    onClick={handleOpenRefreshDialog}
                    size="sm"
                    className="gap-2 text-secondary"
                    disabled={isRefreshing}
                  >
                    {refreshStatus === "completed" ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t("localRefresh.refreshAgain") || "Refresh Again"}
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        {t("localRefresh.startRefresh") || "Start Refresh"}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowStopDialog(true)}
                    className="gap-2 text-primary"
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    {t("localRefresh.stopRefresh") || "Stop"}
                  </Button>
                )}
              </div>
            </div>

            {/* Progress Section */}
            <AnimatePresence>
              {(isRefreshing || refreshStatus === "completed") && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 rounded-lg border border-border bg-muted/30 p-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t("localRefresh.progress") || "Progress"}
                      </span>
                      {/* Show percentage only for non-fetching phases */}
                      {currentPhase !== "fetching_posts" &&
                        currentPhase !== "fetching_categories" &&
                        currentPhase !== "initializing" &&
                        currentPhase !== "starting" && (
                          <span className="font-medium">{Math.round(progress)}%</span>
                        )}
                    </div>
                    {/* Indeterminate progress for fetching phases */}
                    {(currentPhase === "fetching_posts" ||
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
                  </div>

                  {/* Show games processed only during processing phase */}
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
          </div>
          {/* Already Using Local Index Section */}
          {settings?.usingLocalIndex && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-green-500/20 p-2">
                  <CircleCheck className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-green-600 dark:text-green-400">
                    {t("localRefresh.usingLocalIndex") || "Using Local Index"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("localRefresh.usingLocalIndexDesc") ||
                      "You are currently using your local game index. Games are loaded from your local storage."}
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* Divider */}
          <div className="border-t border-border" />

          {/* Errors Section */}
          {errors.length > 0 && (
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              <button
                onClick={() => setShowErrors(!showErrors)}
                className="border-destructive/30 bg-destructive/5 hover:bg-destructive/10 flex w-full items-center justify-between rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="text-destructive h-5 w-5" />
                  <span className="text-destructive font-medium">
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
                    className="border-destructive/20 bg-destructive/5 max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3"
                  >
                    {errors.map((error, index) => (
                      <div
                        key={index}
                        className="bg-destructive/10 text-destructive rounded-md p-2 text-sm"
                      >
                        <span className="font-mono">{error.message}</span>
                        <span className="text-destructive/70 ml-2 text-xs">
                          {error.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Logs Section */}
          {logs.length > 0 && (
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">
                    {t("localRefresh.logs") || "Activity Log"} ({logs.length})
                  </span>
                </div>
                {showLogs ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              <AnimatePresence>
                {showLogs && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs"
                  >
                    {logs.map((log, index) => (
                      <div key={index} className="flex gap-2">
                        <span className="text-muted-foreground">
                          [{log.timestamp.toLocaleTimeString()}]
                        </span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Info Section */}
          <div className="rounded-lg border border-border bg-muted/20 p-5">
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
                    "This process re-scrapes SteamRIP to fetch newly added games and updates your local game index. This is useful when you want to see the latest games available for download."}
                </p>
              </div>
            </div>
          </div>

          {/* Storage Location Section */}
          <div className="rounded-lg border border-border bg-muted/20 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <Folder className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold">
                    {t("localRefresh.storageLocation") || "Storage Location"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("localRefresh.storageLocationDesc") ||
                      "Where the local game index and images are stored"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("localRefresh.storageLocationInfo")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={localIndexPath}
                    readOnly
                    className="flex-1 bg-background text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-2"
                    onClick={handleChangeLocation}
                    disabled={isRefreshing}
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t("settings.selectDirectory")}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Fetch Settings Section */}
          <div className="rounded-lg border border-border bg-muted/20 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <Settings2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold">
                    {t("localRefresh.fetchSettings") || "Fetch Settings"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("localRefresh.fetchSettingsDesc") ||
                      "Configure how games are fetched from the source"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="whitespace-nowrap text-sm text-muted-foreground">
                      {t("localRefresh.gamesPerPage") || "Games per page:"}
                    </label>
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      value={settings?.fetchPageCount || 50}
                      onChange={e => {
                        const value = Math.min(
                          100,
                          Math.max(10, parseInt(e.target.value) || 50)
                        );
                        updateSetting("fetchPageCount", value);
                      }}
                      className="w-20 bg-background text-sm"
                      disabled={isRefreshing}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("localRefresh.gamesPerPageHint") ||
                      "Lower values may help avoid timeouts (10-100)"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Blacklist Section */}
          <div className="rounded-lg border border-border bg-muted/20 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <Ban className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold">
                    {t("localRefresh.blacklist") || "Blacklisted Games"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("localRefresh.blacklistDesc") ||
                      "Games with these IDs will be excluded from the scrape"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder={t("localRefresh.enterGameId") || "Enter game ID"}
                    value={newBlacklistId}
                    onChange={e => setNewBlacklistId(e.target.value)}
                    className="w-32 bg-background text-sm"
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
                        className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
                      >
                        <span className="font-mono">{id}</span>
                        <button
                          onClick={() => {
                            const newList = settings.blacklistIDs.filter(i => i !== id);
                            updateSetting("blacklistIDs", newList);
                          }}
                          disabled={isRefreshing}
                          className="hover:bg-destructive/20 hover:text-destructive ml-1 rounded p-0.5 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

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
      </div>
    </div>
  );
};

export default LocalRefresh;
