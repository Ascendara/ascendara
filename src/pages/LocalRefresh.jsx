import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  ArrowRight,
  FolderOpen,
  Folder,
  Settings2,
  Star,
  Info,
  X,
  Plus,
  Ban,
  Cpu,
  Zap,
  LoaderIcon,
  Share2,
  Upload,
  Download,
  Cloud,
  ExternalLink,
  Calendar,
  PencilIcon,
  Globe,
  ShieldCheck,
  Search as SearchIcon,
  AlertTriangle,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useNavigate, useLocation } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import imageCacheService from "@/services/imageCacheService";
import gameService from "@/services/gameService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LocalRefresh = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, updateSetting } = useSettings();
  const { user, isAuthenticated } = useAuth();

  // Hardcoded flag to show/hide extra sources that aren't ready yet
  const SHOW_EXTRA_SOURCES = false;

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
  const [selectedSource, setSelectedSource] = useState("steamrip");
  const [showCookieRefreshDialog, setShowCookieRefreshDialog] = useState(false);
  const [cookieRefreshCount, setCookieRefreshCount] = useState(0);
  const cookieSubmittedRef = useRef(false);
  const lastCookieToastTimeRef = useRef(0);
  const cookieDialogOpenRef = useRef(false);
  const wasFirstIndexRef = useRef(false);
  // Snapshot of the previous custom source, used to revert the selection if
  // the user bails out of the manual-paste fallback without ingesting JSON.
  const previousCustomSourceRef = useRef(null);
  const [checkingApi, setCheckingApi] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [indexInfo, setIndexInfo] = useState(null); // { gameCount, date, size }
  const [downloadingIndex, setDownloadingIndex] = useState(null);
  const [indexDownloadProgress, setIndexDownloadProgress] = useState(null); // { progress, phase, downloaded, total }
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState("7");
  const [autoRefreshMethod, setAutoRefreshMethod] = useState("shared"); // "shared" or "manual"

  // Custom Sources Mode (Hydra Library)
  const [customSourcesMode, setCustomSourcesMode] = useState(false);
  const [customSource, setCustomSource] = useState(null); // { id, name, url, gamesCount, ... }
  const [customSourceLastSynced, setCustomSourceLastSynced] = useState(null);
  const [customSourceGameCount, setCustomSourceGameCount] = useState(null);
  const [hydraBrowserOpen, setHydraBrowserOpen] = useState(false);
  const [hydraSources, setHydraSources] = useState([]);
  const [hydraSourcesLoading, setHydraSourcesLoading] = useState(false);
  const [hydraSourcesError, setHydraSourcesError] = useState(null);
  const [hydraSearchQuery, setHydraSearchQuery] = useState("");
  const [isSyncingCustomSource, setIsSyncingCustomSource] = useState(false);

  // Manual paste fallback (triggered on 403 from upstream source)
  const [manualPasteOpen, setManualPasteOpen] = useState(false);
  const [manualPasteText, setManualPasteText] = useState("");
  const [manualPasteError, setManualPasteError] = useState(null);
  const [isIngestingManual, setIsIngestingManual] = useState(false);
  const [manualPasteSourceUrl, setManualPasteSourceUrl] = useState(null);

  // Library of sources the user has selected/synced, so they can switch back
  // and forth without having to re-browse Hydra each time.
  const [customSourcesLibrary, setCustomSourcesLibrary] = useState([]);

  // Torrent-only source warning (shown when a synced source has no non-torrent
  // hosts and the user hasn't enabled torrenting in Settings yet)
  const [torrentWarningOpen, setTorrentWarningOpen] = useState(false);
  const [torrentWarningSource, setTorrentWarningSource] = useState(null);

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
        if (settings?.localRefreshSource !== undefined) {
          setSelectedSource(settings.localRefreshSource);
        }
        if (settings?.autoRefreshEnabled !== undefined) {
          setAutoRefreshEnabled(settings.autoRefreshEnabled);
        }
        if (settings?.autoRefreshInterval !== undefined) {
          setAutoRefreshInterval(settings.autoRefreshInterval);
        }
        if (settings?.autoRefreshMethod !== undefined) {
          setAutoRefreshMethod(settings.autoRefreshMethod);
        }
        if (settings?.customSourcesMode !== undefined) {
          setCustomSourcesMode(!!settings.customSourcesMode);
        }
        if (settings?.customSource && typeof settings.customSource === "object") {
          setCustomSource(settings.customSource);
          if (settings.customSource.lastSynced) {
            setCustomSourceLastSynced(new Date(settings.customSource.lastSynced));
          }
          if (typeof settings.customSource.gameCount === "number") {
            setCustomSourceGameCount(settings.customSource.gameCount);
          }
        }
        if (Array.isArray(settings?.customSourcesLibrary)) {
          setCustomSourcesLibrary(settings.customSourcesLibrary);
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
          // Track if this is the user's first index for auto-enabling
          wasFirstIndexRef.current = hasIndexed !== true;
        }

        // Load last refresh time from progress.json lastSuccessfulTimestamp
        if (indexPath && window.electron?.getLocalRefreshProgress) {
          try {
            const progress = await window.electron.getLocalRefreshProgress(indexPath);
            // Use lastSuccessfulTimestamp which persists across refresh attempts
            if (progress?.lastSuccessfulTimestamp) {
              setLastRefreshTime(new Date(progress.lastSuccessfulTimestamp * 1000));
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

        // Check if public index download is in progress
        if (window.electron?.getPublicIndexDownloadStatus) {
          const downloadStatus = await window.electron.getPublicIndexDownloadStatus();
          if (downloadStatus.isDownloading) {
            console.log("Public index download is in progress, restoring UI state");
            setDownloadingIndex("public");
          }
        }
      } catch (error) {
        console.error("Failed to initialize settings:", error);
      }
    };
    initializeSettings();

    // Check API health and fetch index info on mount
    const checkApiHealth = async () => {
      setCheckingApi(true);
      try {
        const healthResponse = await fetch("https://api.ascendara.app/health");
        const healthData = await healthResponse.json();
        const isHealthy = healthData.status === "healthy";
        setApiAvailable(isHealthy);

        // If API is healthy, fetch index metadata
        if (isHealthy) {
          try {
            const infoResponse = await fetch("https://api.ascendara.app/localindex/info");
            const infoData = await infoResponse.json();
            if (infoData.success) {
              setIndexInfo({
                gameCount: infoData.gameCount,
                date: infoData.date,
                size: infoData.size,
              });
            }
          } catch (infoErr) {
            console.error("Failed to fetch index info:", infoErr);
          }
        }
      } catch (e) {
        console.error("Failed to check API health:", e);
        setApiAvailable(false);
      } finally {
        setCheckingApi(false);
      }
    };
    checkApiHealth();
  }, [t]);

  // Listen for refresh progress updates from the backend
  useEffect(() => {
    const handleProgressUpdate = async data => {
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
          swapping: t("localRefresh.swapping") || "Finalizing...",
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
        // Use lastSuccessfulTimestamp from progress data if available
        if (data.lastSuccessfulTimestamp) {
          setLastRefreshTime(new Date(data.lastSuccessfulTimestamp * 1000));
        } else {
          setLastRefreshTime(new Date());
        }

        // Clear caches so the app loads fresh data with new imgIDs
        console.log("[LocalRefresh] Refresh complete, clearing caches to load new data");
        imageCacheService.invalidateSettingsCache();
        await imageCacheService.clearCache(true); // Skip auto-refresh, we'll reload manually
        gameService.clearMemoryCache();
        localStorage.removeItem("ascendara_games_cache");
        localStorage.removeItem("local_ascendara_games_timestamp");
        localStorage.removeItem("local_ascendara_metadata_cache");
        localStorage.removeItem("local_ascendara_last_updated");

        toast.success(
          t("localRefresh.refreshComplete") || "Game list refresh completed!"
        );

        // Auto-enable local index if this was the user's first index
        if (wasFirstIndexRef.current) {
          await updateSetting("usingLocalIndex", true);
          wasFirstIndexRef.current = false;
        }

        // Dispatch custom event to notify other components to refresh their data
        // This allows seamless updates without requiring a full page reload
        console.log("[LocalRefresh] Dispatching index-refreshed event");
        window.dispatchEvent(new CustomEvent("index-refreshed", {
          detail: { timestamp: Date.now() }
        }));
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
        // Read lastSuccessfulTimestamp from progress.json
        try {
          const progress = await window.electron.getLocalRefreshProgress(localIndexPath);
          if (progress?.lastSuccessfulTimestamp) {
            setLastRefreshTime(new Date(progress.lastSuccessfulTimestamp * 1000));
          } else {
            setLastRefreshTime(new Date());
          }
        } catch (e) {
          setLastRefreshTime(new Date());
        }
        toast.success(
          t("localRefresh.refreshComplete") || "Game list refresh completed!"
        );
        // Auto-enable local index if this was the user's first index
        if (wasFirstIndexRef.current) {
          await updateSetting("usingLocalIndex", true);
          wasFirstIndexRef.current = false;
        }
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

    const handleUploading = () => {
      console.log("Upload started");
      setIsUploading(true);
      setUploadError(null);
      setCurrentStep(t("localRefresh.uploading") || "Uploading index...");
    };

    const handleUploadComplete = () => {
      console.log("Upload complete");
      setIsUploading(false);
      toast.success(t("localRefresh.uploadComplete") || "Index uploaded successfully!");
    };

    const handleUploadError = data => {
      console.log("Upload error:", data);
      setIsUploading(false);
      setUploadError(data?.error || "Upload failed");
      toast.error(t("localRefresh.uploadFailed") || "Failed to upload index");
    };

    // Public index download event handlers
    const handlePublicDownloadStarted = () => {
      console.log("Public index download started");
      setDownloadingIndex("public");
      setIndexDownloadProgress({
        progress: 0,
        phase: "downloading",
        downloaded: 0,
        total: 0,
      });
    };

    const handlePublicDownloadComplete = async () => {
      console.log("Public index download complete");
      setDownloadingIndex(null);
      setIndexDownloadProgress(null);
      toast.success(t("localRefresh.indexDownloaded") || "Public index downloaded!");
      if (window.electron?.setTimestampValue) {
        await window.electron.setTimestampValue("hasIndexBefore", true);
      }
      // Auto-enable local index if this was the user's first index
      if (wasFirstIndexRef.current) {
        await updateSetting("usingLocalIndex", true);
        wasFirstIndexRef.current = false;
      }
      setHasIndexBefore(true);
      setLastRefreshTime(new Date()); // Set last refresh time to now
      
      // Clear caches so the app loads fresh data
      console.log("[LocalRefresh] Public index download complete, clearing caches");
      imageCacheService.invalidateSettingsCache();
      await imageCacheService.clearCache(true);
      gameService.clearMemoryCache();
      localStorage.removeItem("ascendara_games_cache");
      localStorage.removeItem("local_ascendara_games_timestamp");
      localStorage.removeItem("local_ascendara_metadata_cache");
      localStorage.removeItem("local_ascendara_last_updated");
      
      // Dispatch custom event to notify other components to refresh their data
      console.log("[LocalRefresh] Dispatching index-refreshed event");
      window.dispatchEvent(new CustomEvent("index-refreshed", {
        detail: { timestamp: Date.now() }
      }));
    };

    const handlePublicDownloadError = data => {
      console.log("Public index download error:", data);
      setDownloadingIndex(null);
      setIndexDownloadProgress(null);
      toast.error(
        data?.error || t("localRefresh.indexDownloadFailed") || "Failed to download"
      );
    };

    const handlePublicDownloadProgress = data => {
      console.log("Public index download progress:", data);
      setIndexDownloadProgress(data);
    };

    // Subscribe to IPC events
    if (window.electron?.onLocalRefreshProgress) {
      window.electron.onLocalRefreshProgress(handleProgressUpdate);
      window.electron.onLocalRefreshComplete(handleComplete);
      window.electron.onLocalRefreshError(handleError);
      window.electron.onLocalRefreshCookieNeeded?.(handleCookieNeeded);

      // Upload events
      window.electron.ipcRenderer.on("local-refresh-uploading", handleUploading);
      window.electron.ipcRenderer.on(
        "local-refresh-upload-complete",
        handleUploadComplete
      );
      window.electron.ipcRenderer.on("local-refresh-upload-error", (_, data) =>
        handleUploadError(data)
      );

      // Public index download events
      window.electron.onPublicIndexDownloadStarted?.(handlePublicDownloadStarted);
      window.electron.onPublicIndexDownloadComplete?.(handlePublicDownloadComplete);
      window.electron.onPublicIndexDownloadError?.(handlePublicDownloadError);
      window.electron.onPublicIndexDownloadProgress?.(handlePublicDownloadProgress);

      return () => {
        window.electron.offLocalRefreshProgress?.();
        window.electron.offLocalRefreshComplete?.();
        window.electron.offLocalRefreshError?.();
        window.electron.offLocalRefreshCookieNeeded?.();
        window.electron.ipcRenderer.off("local-refresh-uploading", handleUploading);
        window.electron.ipcRenderer.off(
          "local-refresh-upload-complete",
          handleUploadComplete
        );
        window.electron.ipcRenderer.off("local-refresh-upload-error", handleUploadError);
        window.electron.offPublicIndexDownloadStarted?.();
        window.electron.offPublicIndexDownloadComplete?.();
        window.electron.offPublicIndexDownloadError?.();
        window.electron.offPublicIndexDownloadProgress?.();
      };
    }
  }, []);

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
          source: selectedSource,
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


  // ---------------------------------------------------------------------------
  // Custom Sources Mode handlers (Hydra Library)
  // ---------------------------------------------------------------------------

  const handleToggleCustomSourcesMode = async (enabled) => {
    setCustomSourcesMode(enabled);
    await updateSetting("customSourcesMode", enabled);
    // Force full reload of game data on next request
    gameService.clearMemoryCache();
    localStorage.removeItem("ascendara_games_cache");
    localStorage.removeItem("local_ascendara_games_timestamp");
    localStorage.removeItem("local_ascendara_metadata_cache");
    if (enabled) {
      // Ensure usingLocalIndex reflects that we're NOT using the official local index
      await updateSetting("usingLocalIndex", false);
      toast.info(
        t("localRefresh.customModeEnabled") ||
          "Custom Sources Mode enabled. Select a source to begin."
      );
    } else {
      // Revert to using local index if one is built; app.jsx / Search.jsx will re-read
      toast.info(
        t("localRefresh.customModeDisabled") ||
          "Custom Sources Mode disabled. Reverting to official index."
      );
    }
    // Notify other pages (Search/Library) to re-fetch games
    window.dispatchEvent(
      new CustomEvent("index-refreshed", { detail: { timestamp: Date.now() } })
    );
  };

  const fetchHydraSources = useCallback(async () => {
    setHydraSourcesLoading(true);
    setHydraSourcesError(null);
    try {
      const url = "https://api.hydralibrary.com/sources?page=1&limit=100";
      let parsed;
      if (window.electron?.request) {
        const res = await window.electron.request(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          timeout: 20000,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        parsed = JSON.parse(res.data);
      } else {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        parsed = await r.json();
      }
      const sources = Array.isArray(parsed?.sources) ? parsed.sources : [];
      setHydraSources(sources);
    } catch (err) {
      console.error("Failed to fetch Hydra sources:", err);
      setHydraSourcesError(err?.message || "Failed to fetch sources");
    } finally {
      setHydraSourcesLoading(false);
    }
  }, []);

  const handleOpenHydraBrowser = () => {
    setHydraBrowserOpen(true);
    // Fetch fresh list every time the dialog opens (cheap)
    if (!hydraSourcesLoading) {
      fetchHydraSources();
    }
  };

  // ---------------------------------------------------------------------------
  // Library / torrent helpers
  // ---------------------------------------------------------------------------

  // Merge a source entry into the persisted library (dedupe by URL) and save.
  const upsertLibraryEntry = useCallback(async (entry) => {
    if (!entry?.url) return [];
    let next = [];
    setCustomSourcesLibrary((prev) => {
      const filtered = (prev || []).filter((s) => s?.url !== entry.url);
      next = [entry, ...filtered].slice(0, 20); // cap at 20 saved sources
      return next;
    });
    await updateSetting("customSourcesLibrary", next);
    return next;
  }, [updateSetting]);

  const removeLibraryEntry = useCallback(async (url) => {
    if (!url) return;
    let next = [];
    setCustomSourcesLibrary((prev) => {
      next = (prev || []).filter((s) => s?.url !== url);
      return next;
    });
    await updateSetting("customSourcesLibrary", next);
  }, [updateSetting]);

  // Check Hydra source metadata (topDownloadOption) to see if the upstream
  // only advertises torrent links. This is the authoritative signal when
  // browsing sources, because it doesn't require syncing first.
  const isSourceMetaTorrentOnly = (source) => {
    const opts = Array.isArray(source?.topDownloadOption)
      ? source.topDownloadOption
      : null;
    if (!opts || opts.length === 0) return false;
    return opts.every(
      (o) => String(o?.name || "").toLowerCase() === "torrent"
    );
  };

  // Inspect a mapped dataset to determine whether it's torrent-only.
  // Hydra maps magnet links to download_links.torrent, and most DDL hosts
  // produce non-torrent keys (gofile, buzzheavier, 1fichier, etc.).
  const isTorrentOnlyDataset = (games) => {
    if (!Array.isArray(games) || games.length === 0) return false;
    let sampled = 0;
    let nonTorrent = 0;
    for (const g of games) {
      const links = g?.download_links;
      if (!links || typeof links !== "object") continue;
      sampled++;
      const keys = Object.keys(links).filter((k) => (links[k] || []).length > 0);
      if (keys.some((k) => k !== "torrent")) nonTorrent++;
      if (sampled >= 50) break; // sampling is enough
    }
    if (sampled === 0) return false;
    return nonTorrent === 0;
  };

  const maybeWarnTorrentOnly = async (source, games) => {
    try {
      const torrentOnly =
        isSourceMetaTorrentOnly(source) || isTorrentOnlyDataset(games);
      if (!torrentOnly) return;
      const current = await window.electron.getSettings();
      if (current?.torrentEnabled) return;
      setTorrentWarningSource({ ...source, torrentOnly: true });
      setTorrentWarningOpen(true);
      // Mark the source so the UI can decorate it later
      await upsertLibraryEntry({
        ...source,
        torrentOnly: true,
        lastUsed: Date.now(),
      });
    } catch (e) {
      console.warn("[LocalRefresh] torrent-only check failed:", e);
    }
  };

  const handleSelectCustomSource = async (source) => {
    if (!source?.url) return;
    const payload = {
      id: source.id,
      name: source.title || source.name || "Custom Source",
      url: source.url,
      gamesCount: source.gamesCount || null,
      description: source.description || "",
      status: Array.isArray(source.status) ? source.status : [],
      rating: source.rating || null,
      addedDate: source.addedDate || null,
      topDownloadOption: Array.isArray(source.topDownloadOption)
        ? source.topDownloadOption
        : null,
      torrentOnly: isSourceMetaTorrentOnly(source) || undefined,
    };
    payload.lastUsed = Date.now();
    // Snapshot the previously-active source so we can revert if the user
    // cancels out of the manual-paste fallback without ingesting anything.
    previousCustomSourceRef.current = customSource;
    setCustomSource(payload);
    setCustomSourceLastSynced(null);
    setCustomSourceGameCount(null);
    await updateSetting("customSource", payload);
    await upsertLibraryEntry(payload);
    setHydraBrowserOpen(false);
    toast.success(
      (t("localRefresh.customSourceSelected") || "Selected custom source") +
        ": " +
        payload.name
    );
    // If the Hydra metadata already tells us this is a torrent-only source
    // and the user hasn't enabled torrenting, surface the warning BEFORE we
    // try to sync. We also short-circuit the sync so the user isn't hit
    // with the 403 / manual-paste dialog on top of the torrent warning.
    if (isSourceMetaTorrentOnly(payload)) {
      try {
        const current = await window.electron.getSettings();
        if (!current?.torrentEnabled) {
          setTorrentWarningSource({ ...payload, torrentOnly: true });
          setTorrentWarningOpen(true);
          // Clear the revert snapshot -- the user explicitly picked this
          // source and we're just waiting on them to decide about torrents.
          previousCustomSourceRef.current = null;
          return;
        }
      } catch (e) {
        console.warn("[LocalRefresh] torrent pre-check failed:", e);
      }
    }
    // Immediately sync the source after selection
    await handleSyncCustomSource(payload);
  };

  // Switch the active source to a previously-saved library entry. Reuses the
  // cached mapped data if fresh (<12h), otherwise refetches.
  const handleSwitchToSavedSource = async (entry) => {
    if (!entry?.url) return;
    const now = Date.now();
    const payload = { ...entry, lastUsed: now };
    setCustomSource(payload);
    setCustomSourceLastSynced(
      entry.lastSynced ? new Date(entry.lastSynced) : null
    );
    setCustomSourceGameCount(
      typeof entry.gameCount === "number" ? entry.gameCount : null
    );
    await updateSetting("customSource", payload);
    await upsertLibraryEntry(payload);
    // Force other pages to reload with the new source's cache
    gameService.clearMemoryCache();
    window.dispatchEvent(
      new CustomEvent("index-refreshed", { detail: { timestamp: now } })
    );
    toast.success(
      (t("localRefresh.customSourceSwitched") || "Switched source") +
        ": " +
        payload.name
    );
  };

  const handleSyncCustomSource = async (sourceOverride) => {
    const source = sourceOverride || customSource;
    if (!source?.url) {
      toast.error(
        t("localRefresh.customSourceNone") || "No custom source selected"
      );
      return;
    }
    if (isSyncingCustomSource) return;
    setIsSyncingCustomSource(true);
    try {
      const data = await gameService.refreshCustomSource();
      const count = data?.games?.length || 0;
      const now = Date.now();
      setCustomSourceLastSynced(new Date(now));
      setCustomSourceGameCount(count);
      const nextPayload = {
        ...source,
        lastSynced: now,
        lastUsed: now,
        gameCount: count,
      };
      setCustomSource(nextPayload);
      await updateSetting("customSource", nextPayload);
      // Save to library so the user can swap back to it later
      await upsertLibraryEntry(nextPayload);
      // Also flip hasIndexBefore so gating UI treats this as "ready"
      if (window.electron?.setTimestampValue) {
        await window.electron.setTimestampValue("hasIndexBefore", true);
        setHasIndexBefore(true);
      }
      toast.success(
        (t("localRefresh.customSourceSynced") || "Custom source synced") +
          ` (${count.toLocaleString()} ${t("localRefresh.games") || "games"})`
      );
      // Notify other pages
      window.dispatchEvent(
        new CustomEvent("index-refreshed", { detail: { timestamp: now } })
      );
      // If this source only offers torrent links and the user hasn't enabled
      // torrenting yet, surface a guided prompt.
      await maybeWarnTorrentOnly(nextPayload, data?.games);
    } catch (err) {
      console.error("Custom source sync failed:", err);
      const msg = String(err?.message || "");
      const is403 = /HTTP\s*403/i.test(msg);
      if (is403) {
        // Upstream is Cloudflare-challenged or otherwise blocking us.
        // Open the URL in the user's browser so they can solve the challenge
        // and paste the resulting JSON back into Ascendara.
        setManualPasteSourceUrl(source.url);
        setManualPasteText("");
        setManualPasteError(null);
        setManualPasteOpen(true);
        try {
          if (window.electron?.openURL) {
            await window.electron.openURL(source.url);
          }
        } catch (openErr) {
          console.warn("Failed to open source URL:", openErr);
        }
      } else {
        toast.error(
          (t("localRefresh.customSourceSyncFailed") || "Sync failed") +
            (err?.message ? `: ${err.message}` : "")
        );
        // Sync failed outright (non-403) -- revert the selection so the UI
        // doesn't show a "set" source that was never actually loaded.
        await revertPendingCustomSource();
      }
    } finally {
      setIsSyncingCustomSource(false);
    }
  };

  // Revert `customSource` to whatever was active before the user picked a new
  // one, used when they back out of the manual-paste dialog without pasting.
  const revertPendingCustomSource = async () => {
    const prev = previousCustomSourceRef.current;
    previousCustomSourceRef.current = null;
    setCustomSource(prev || null);
    setCustomSourceLastSynced(
      prev?.lastSynced ? new Date(prev.lastSynced) : null
    );
    setCustomSourceGameCount(
      typeof prev?.gameCount === "number" ? prev.gameCount : null
    );
    try {
      await updateSetting("customSource", prev || null);
    } catch (e) {
      console.warn("Failed to revert customSource setting:", e);
    }
  };

  const handleIngestManualJson = async () => {
    if (isIngestingManual) return;
    setManualPasteError(null);
    setIsIngestingManual(true);
    try {
      const data = await gameService.ingestCustomSourceJson(manualPasteText);
      const count = data?.games?.length || 0;
      const now = Date.now();
      setCustomSourceLastSynced(new Date(now));
      setCustomSourceGameCount(count);
      const nextPayload = {
        ...(customSource || {}),
        lastSynced: now,
        lastUsed: now,
        gameCount: count,
      };
      setCustomSource(nextPayload);
      await updateSetting("customSource", nextPayload);
      await upsertLibraryEntry(nextPayload);
      if (window.electron?.setTimestampValue) {
        await window.electron.setTimestampValue("hasIndexBefore", true);
        setHasIndexBefore(true);
      }
      toast.success(
        (t("localRefresh.customSourceSynced") || "Custom source synced") +
          ` (${count.toLocaleString()} ${t("localRefresh.games") || "games"})`
      );
      window.dispatchEvent(
        new CustomEvent("index-refreshed", { detail: { timestamp: now } })
      );
      await maybeWarnTorrentOnly(nextPayload, data?.games);
      // Ingest succeeded -- commit the selection by clearing the revert snapshot.
      previousCustomSourceRef.current = null;
      setManualPasteOpen(false);
      setManualPasteText("");
    } catch (err) {
      console.error("Manual JSON ingest failed:", err);
      setManualPasteError(err?.message || String(err));
    } finally {
      setIsIngestingManual(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setManualPasteText(text);
        setManualPasteError(null);
      }
    } catch (e) {
      console.warn("Clipboard read failed:", e);
    }
  };

  const filteredHydraSources = useMemo(() => {
    const q = hydraSearchQuery.trim().toLowerCase();
    if (!q) return hydraSources;
    return hydraSources.filter((s) => {
      const title = (s?.title || s?.name || "").toLowerCase();
      const desc = (s?.description || "").toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [hydraSources, hydraSearchQuery]);

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
      <div className="container mx-auto max-w-3xl px-4 py-8">
        {/* First-time Setup Banner */}
        {welcomeStep && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 overflow-hidden rounded-lg border-2 border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5"
          >
            <div className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                    <Database className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {t("localRefresh.firstTimeSetup") || "First-Time Setup: Build Your Game Index"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {refreshStatus === "completed" || hasIndexBefore
                        ? t("localRefresh.setupCompleteMessage") || "Index ready! Click Continue to proceed with setup."
                        : t("localRefresh.setupInProgressMessage") || "Download or build your game index to continue setup."}
                    </p>
                  </div>
                </div>
                {(refreshStatus === "completed" || hasIndexBefore) && (
                  <Button
                    size="lg"
                    onClick={handleBack}
                    className="shrink-0 gap-2 text-secondary"
                  >
                    <ArrowRight className="h-4 w-4" />
                    {t("localRefresh.continueSetup") || "Continue Setup"}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}

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
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">
                  {t("localRefresh.title") || "Local Game Index"}
                </h1>
                {settings?.usingLocalIndex && (
                  <Badge className="hover:bg-green/500/10 mb-2 gap-1 bg-green-500/10 text-green-600 dark:text-green-400">
                    <Zap className="h-3 w-3" />
                    {t("localRefresh.usingLocalIndex") || "Active"}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-muted-foreground">
                {t("localRefresh.description")}
              </p>
            </div>
            {lastRefreshTime && (
              <div className="hidden text-right text-sm text-muted-foreground sm:block">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span>{t("localRefresh.lastRefresh") || "Last refresh"}</span>
                </div>
                <span className="font-medium">
                  {formatLastRefreshTime(lastRefreshTime)}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4">
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 p-0 shadow-md ring-1 ring-border/60">
              <div
                className={`absolute inset-x-0 top-0 h-24 opacity-50 ${
                  customSourcesMode
                    ? "bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent"
                    : "bg-gradient-to-br from-primary/20 via-blue-500/10 to-transparent"
                }`}
              />
              <div className="relative p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-14 w-14 mt-2 shrink-0 items-center justify-center rounded-2xl shadow-sm ${
                      customSourcesMode
                        ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
                        : "bg-gradient-to-br from-primary to-blue-500 text-white"
                    }`}
                  >
                    {customSourcesMode ? (
                      <Globe className="h-7 w-7" />
                    ) : (
                      <Database className="h-7 w-7" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl mt-2 font-bold leading-tight">
                        {customSourcesMode
                          ? customSource?.name ||
                            t("localRefresh.noSourceSelected") ||
                            "No source selected"
                          : t("localRefresh.ascendaraIndex") || "Ascendara Index"}
                      </h2>
                      {customSourcesMode ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-purple-500/40 bg-purple-500/10 text-[10px] uppercase tracking-wide text-purple-600 dark:text-purple-300"
                        >
                          {t("localRefresh.customMode") || "Custom"}
                        </Badge>
                      ) : settings?.usingLocalIndex ? (
                        <Badge className="gap-1 bg-green-500/15 text-green-600 hover:bg-green-500/15 dark:text-green-400">
                          <Zap className="h-3 w-3" />
                          {t("localRefresh.usingLocalIndex") || "Active"}
                        </Badge>
                      ) : null}
                      {customSourcesMode &&
                        Array.isArray(customSource?.status) &&
                        customSource.status.includes("Trusted") && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-300 cursor-help"
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                  {t("localRefresh.trusted") || "Trusted"}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-secondary">
                                <p>
                                  {t("localRefresh.trustedTooltip") ||
                                    "Trusted sources are widely used by the community and known to be reliable and safe."}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      {customSourcesMode && customSource?.torrentOnly && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-orange-500/40 bg-orange-500/10 text-[10px] uppercase tracking-wide text-orange-600 dark:text-orange-400"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {t("localRefresh.torrentOnly") || "Torrent only"}
                        </Badge>
                      )}
                    </div>
                    <p className="mb-4 text-sm text-muted-foreground">
                      {customSourcesMode
                        ? customSource?.url
                          ? t("localRefresh.heroDescCustomActive") ||
                            "Pulling games from this Hydra Library-compatible source."
                          : t("localRefresh.heroDescCustomEmpty") ||
                            "Pick a Hydra Library source below to start pulling games."
                        : t("localRefresh.heroDescAscendara") ||
                          "Your offline copy of Ascendara's curated game database."}
                          &nbsp;
                    <a
                      className="inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                      onClick={() =>
                        window.electron.openURL(
                          "https://ascendara.app/docs/features/external-sources"
                        )
                      }
                    >
                      {t("common.learnMore")}
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border/50 bg-background/60 p-3 backdrop-blur-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("localRefresh.games") || "Games"}
                    </div>
                    <div className="mt-1 text-2xl font-bold leading-none">
                      {(() => {
                        const count = customSourcesMode
                          ? customSourceGameCount ??
                            customSource?.gameCount ??
                            customSource?.gamesCount
                          : indexInfo?.gameCount;
                        return count != null ? count.toLocaleString() : "—";
                      })()}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background/60 p-3 backdrop-blur-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {customSourcesMode
                        ? t("localRefresh.lastSynced") || "Last synced"
                        : t("localRefresh.lastRefresh") || "Last refresh"}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold">
                      {customSourcesMode
                        ? customSourceLastSynced
                          ? formatLastRefreshTime(customSourceLastSynced)
                          : t("localRefresh.never") || "Never"
                        : lastRefreshTime
                          ? formatLastRefreshTime(lastRefreshTime)
                          : t("localRefresh.never") || "Never"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background/60 p-3 backdrop-blur-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {customSourcesMode
                        ? t("localRefresh.rating") || "Rating"
                        : t("localRefresh.indexUpdated") || "Index age"}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-sm font-semibold">
                      {customSourcesMode
                        ? (() => {
                            const r = customSource?.rating;
                            const avg =
                              r && typeof r === "object"
                                ? r.avg
                                : typeof r === "number"
                                  ? r
                                  : null;
                            if (avg == null || Number.isNaN(Number(avg)))
                              return "—";
                            return (
                              <>
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                {Number(avg).toFixed(1)}
                              </>
                            );
                          })()
                        : indexInfo?.date
                          ? new Date(indexInfo.date).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" }
                            )
                          : "—"}
                    </div>
                  </div>
                </div>

                {/* Primary action bar */}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  {isRefreshing ? (
                    <Button
                      variant="destructive"
                      size="lg"
                      onClick={() => setShowStopDialog(true)}
                      className="gap-2"
                    >
                      <StopCircle className="h-4 w-4" />
                      {t("localRefresh.stop") || "Stop"}
                    </Button>
                  ) : isUploading ? (
                    <Button size="lg" disabled className="gap-2">
                      <Loader className="h-4 w-4 animate-spin" />
                      {t("localRefresh.sharing") || "Sharing..."}
                    </Button>
                  ) : customSourcesMode ? (
                    customSource?.url ? (
                      <>
                        <Button
                          size="lg"
                          onClick={() => handleSyncCustomSource()}
                          disabled={isSyncingCustomSource}
                          className="gap-2 text-secondary sm:flex-1"
                        >
                          {isSyncingCustomSource ? (
                            <>
                              <Loader className="h-4 w-4 animate-spin" />
                              {t("localRefresh.syncing") || "Syncing..."}
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4" />
                              {t("localRefresh.syncNow") || "Sync now"}
                            </>
                          )}
                        </Button>
                        <Button
                          size="lg"
                          variant="outline"
                          onClick={handleOpenHydraBrowser}
                          disabled={isSyncingCustomSource}
                          className="gap-2"
                        >
                          <Globe className="h-4 w-4" />
                          {t("localRefresh.changeSource") || "Change source"}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="lg"
                        onClick={handleOpenHydraBrowser}
                        className="gap-2 text-secondary sm:flex-1"
                      >
                        <Globe className="h-4 w-4" />
                        {t("localRefresh.browseHydraSources") || "Browse sources"}
                      </Button>
                    )
                  ) : (
                    <>
                      {apiAvailable ? (
                        <Button
                          size="lg"
                          className="gap-2 text-secondary sm:flex-1"
                          onClick={async () => {
                            if (downloadingIndex || isRefreshing || isUploading)
                              return;
                            try {
                              await window.electron.downloadSharedIndex(
                                localIndexPath
                              );
                            } catch (e) {
                              console.error("Failed to start download:", e);
                              toast.error(
                                t("localRefresh.indexDownloadFailed") ||
                                  "Failed to start download"
                              );
                            }
                          }}
                          disabled={
                            downloadingIndex || isRefreshing || isUploading
                          }
                        >
                          {downloadingIndex ? (
                            <>
                              <Loader className="h-4 w-4 animate-spin" />
                              {indexDownloadProgress?.phase === "extracting"
                                ? indexDownloadProgress.currentGame
                                  ? indexDownloadProgress.currentGame
                                  : indexDownloadProgress.progress >= 1
                                    ? `${t("localRefresh.extracting") || "Extracting"} ${Math.floor(indexDownloadProgress.progress)}%`
                                    : t("localRefresh.extracting") ||
                                      "Extracting..."
                                : indexDownloadProgress?.progress > 0
                                  ? `${Math.floor(indexDownloadProgress.progress)}%`
                                  : t("localRefresh.downloading") ||
                                    "Downloading..."}
                            </>
                          ) : (
                            <>
                              <Cloud className="h-4 w-4" />
                              {hasIndexBefore
                                ? t("localRefresh.refreshNow") || "Refresh now"
                                : t("localRefresh.getStarted") ||
                                  "Get the index"}
                            </>
                          )}
                        </Button>
                      ) : null}
                      <Button
                        size="lg"
                        variant={apiAvailable ? "outline" : "default"}
                        className={
                          apiAvailable
                            ? "gap-2"
                            : "gap-2 text-secondary sm:flex-1"
                        }
                        onClick={handleOpenRefreshDialog}
                      >
                        <Play className="h-4 w-4" />
                        {refreshStatus === "completed"
                          ? t("localRefresh.scrapeAgain") || "Scrape again"
                          : t("localRefresh.scrapeManually") ||
                            "Scrape manually"}
                      </Button>
                    </>
                  )}
                </div>

                {/* Contextual hint / status line */}
                {(currentStep || uploadError || refreshStatus === "error") && (
                  <p
                    className={`mt-3 text-xs ${
                      uploadError || refreshStatus === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {uploadError ||
                      currentStep ||
                      (refreshStatus === "error"
                        ? t("localRefresh.statusError") || "Last refresh failed"
                        : "")}
                  </p>
                )}
              </div>
            </Card>
            {!customSourcesMode && (
              <Card className="overflow-hidden p-0">
                <div className="flex items-start gap-3 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-blue-500/15">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">
                          {t("localRefresh.autoRefresh") || "Automatic Index Refreshing"}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {autoRefreshEnabled && isAuthenticated
                            ? (
                                t("localRefresh.autoRefreshActiveSummary") ||
                                "Refreshes every {{days}} days using {{method}}"
                              )
                                .replace("{{days}}", autoRefreshInterval)
                                .replace(
                                  "{{method}}",
                                  autoRefreshMethod === "shared"
                                    ? t("localRefresh.sharedIndex") ||
                                        "shared index"
                                    : t("localRefresh.manualScrape") || "scraping"
                                )
                            : t("localRefresh.autoRefreshCardDesc") ||
                              "Keep your index up to date automatically"}
                        </p>
                      </div>
                      <Switch
                        checked={autoRefreshEnabled && isAuthenticated}
                        onCheckedChange={async (checked) => {
                          if (!isAuthenticated) {
                            toast.info(
                              t("localRefresh.autoRefreshRequiresAscend") ||
                                "Sign in to Ascend to enable automatic refreshing"
                            );
                            navigate("/ascend");
                            return;
                          }
                          setAutoRefreshEnabled(checked);
                          await updateSetting("autoRefreshEnabled", checked);
                          toast.success(
                            checked
                              ? t("localRefresh.autoRefreshEnabled") ||
                                  "Automatic refresh enabled"
                              : t("localRefresh.autoRefreshDisabled") ||
                                  "Automatic refresh disabled"
                          );
                        }}
                        disabled={!isAuthenticated}
                      />
                    </div>
                  </div>
                </div>
                <AnimatePresence>
                  {autoRefreshEnabled && isAuthenticated && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-border/60 bg-muted/20"
                    >
                      <div className="space-y-4 p-5">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={async () => {
                              setAutoRefreshMethod("shared");
                              await updateSetting("autoRefreshMethod", "shared");
                            }}
                            className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                              autoRefreshMethod === "shared"
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border hover:bg-accent/50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Cloud className="h-4 w-4" />
                              <span className="text-xs font-semibold">
                                {t("localRefresh.sharedIndex") || "Shared Index"}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {t("localRefresh.sharedIndexDesc") ||
                                "Download pre-built index from community"}
                            </p>
                          </button>
                          <button
                            onClick={async () => {
                              setAutoRefreshMethod("manual");
                              await updateSetting("autoRefreshMethod", "manual");
                            }}
                            className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                              autoRefreshMethod === "manual"
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border hover:bg-accent/50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Settings2 className="h-4 w-4" />
                              <span className="text-xs font-semibold">
                                {t("localRefresh.manualScrape") || "Manual Scrape"}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {t("localRefresh.manualScrapeDesc") ||
                                "Build your own index by scraping"}
                            </p>
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">
                            {t("localRefresh.refreshInterval") || "Refresh Every"}
                          </Label>
                          <Select
                            value={autoRefreshInterval}
                            onValueChange={async (value) => {
                              setAutoRefreshInterval(value);
                              await updateSetting("autoRefreshInterval", value);
                            }}
                          >
                            <SelectTrigger className="h-8 w-[160px] bg-background text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="2">
                                {t("localRefresh.intervalOptions.twoDays") || "2 Days"}
                              </SelectItem>
                              <SelectItem value="3">
                                {t("localRefresh.intervalOptions.threeDays") || "3 Days"}
                              </SelectItem>
                              <SelectItem value="5">
                                {t("localRefresh.intervalOptions.fiveDays") || "5 Days"}
                              </SelectItem>
                              <SelectItem value="7">
                                {t("localRefresh.intervalOptions.oneWeek") || "1 Week"}
                              </SelectItem>
                              <SelectItem value="10">
                                {t("localRefresh.intervalOptions.tenDays") || "10 Days"}
                              </SelectItem>
                              <SelectItem value="14">
                                {t("localRefresh.intervalOptions.twoWeeks") || "2 Weeks"}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {!isAuthenticated && (
                  <div className="flex items-start gap-2 border-t border-border/60 bg-purple-500/5 px-5 py-3 text-xs text-muted-foreground">
                    <Info className="h-4 w-4 shrink-0 text-purple-500" />
                    <span>
                      {t("localRefresh.autoRefreshAscendInfo") ||
                        "Sign in to Ascend to enable automatic index refreshing and keep your game library up to date effortlessly."}
                    </span>
                  </div>
                )}
              </Card>
            )}

            {/* Share Index compact */}
            {!customSourcesMode && (
              <Card className="p-5">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      settings?.shareLocalIndex
                        ? "bg-gradient-to-br from-green-500/15 to-emerald-500/15"
                        : "bg-muted"
                    }`}
                  >
                    <Share2
                      className={`h-5 w-5 ${
                        settings?.shareLocalIndex
                          ? "text-green-600 dark:text-green-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">
                          {t("localRefresh.shareIndex") || "Share your index"}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("localRefresh.shareIndexDesc") ||
                            "Help others by uploading your index after refresh"}
                        </p>
                      </div>
                      <Switch
                        checked={!!settings?.shareLocalIndex}
                        onCheckedChange={(checked) =>
                          updateSetting("shareLocalIndex", checked)
                        }
                        disabled={isRefreshing}
                      />
                    </div>
                    {settings?.shareLocalIndex &&
                      settings?.blacklistIDs?.some(
                        (id) =>
                          !["ABSXUc", "AWBgqf", "ATaHuq"].includes(id)
                      ) && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-orange-500/10 p-2.5 text-xs text-orange-600 dark:text-orange-400">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            {t("localRefresh.blacklistWarning") ||
                              "Your index won't be shared because you have custom blacklisted games. Remove them to share your index with the community."}
                          </span>
                        </div>
                      )}
                  </div>
                </div>
              </Card>
            )}

            {/* Custom Sources - compact switch card; expands to show source list */}
            <Card className="overflow-hidden p-0">
              <div className="flex items-start gap-3 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/15 to-pink-500/15">
                  <Globe className="h-5 w-5 text-purple-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                          {t("localRefresh.customSourcesMode") ||
                            "Custom Sources Mode"}
                        </h3>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase tracking-wide"
                        >
                          {t("localRefresh.experimental") || "Experimental"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("localRefresh.customSourcesModeDesc") ||
                          "Pull games from Hydra Library-compatible sources instead of Ascendara's official index."}
                      </p>
                    </div>
                    <Switch
                      checked={customSourcesMode}
                      onCheckedChange={handleToggleCustomSourcesMode}
                      disabled={
                        isRefreshing || isUploading || isSyncingCustomSource
                      }
                    />
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {customSourcesMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-border/60 bg-muted/20"
                  >
                    <div className="space-y-3 p-5">
                      <div className="flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-xs text-orange-700 dark:text-orange-300">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-medium">
                            {t("localRefresh.customSourceTradeoffsTitle") ||
                              "Reduced metadata"}
                          </p>
                          <p className="mt-1 leading-relaxed">
                            {t("localRefresh.customSourceTradeoffsDesc") ||
                              "Custom sources don't include cover images, categories, or popularity data."}
                          </p>
                        </div>
                      </div>

                      {customSourcesLibrary.filter(
                        (s) => s?.url && s.url !== customSource?.url
                      ).length > 0 && (
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold text-muted-foreground">
                              {t("localRefresh.savedSources") || "Saved sources"}
                            </p>
                            <span className="text-[10px] text-muted-foreground/70">
                              {t("localRefresh.savedSourcesHint") ||
                                "Click to switch"}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {customSourcesLibrary
                              .filter(
                                (s) => s?.url && s.url !== customSource?.url
                              )
                              .slice(0, 6)
                              .map((entry) => (
                                <div
                                  key={entry.url}
                                  role="button"
                                  tabIndex={isSyncingCustomSource ? -1 : 0}
                                  aria-disabled={isSyncingCustomSource}
                                  onClick={() => {
                                    if (isSyncingCustomSource) return;
                                    handleSwitchToSavedSource(entry);
                                  }}
                                  onKeyDown={(e) => {
                                    if (isSyncingCustomSource) return;
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      handleSwitchToSavedSource(entry);
                                    }
                                  }}
                                  className="group flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-background p-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                                >
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted">
                                    <Database className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                      <p className="truncate text-xs font-semibold">
                                        {entry.name}
                                      </p>
                                      {entry.torrentOnly && (
                                        <span
                                          title={
                                            t("localRefresh.torrentOnly") ||
                                            "Torrent only"
                                          }
                                          className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500"
                                        />
                                      )}
                                    </div>
                                    <p className="truncate text-[10px] text-muted-foreground">
                                      {typeof entry.gameCount === "number"
                                        ? `${entry.gameCount.toLocaleString()} ${t("localRefresh.games") || "games"}`
                                        : entry.url}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeLibraryEntry(entry.url);
                                    }}
                                    className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                    title={t("common.remove") || "Remove"}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {!customSource?.url && (
                        <Button
                          onClick={handleOpenHydraBrowser}
                          variant="outline"
                          className="w-full gap-2"
                        >
                          <Globe className="h-4 w-4" />
                          {t("localRefresh.browseHydraSources") ||
                            "Browse Hydra Sources"}
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            <AnimatePresence>
              {(isRefreshing || isUploading || refreshStatus === "completed") && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Card className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">
                          {isUploading
                            ? t("localRefresh.sharing") || "Sharing..."
                            : refreshStatus === "completed"
                              ? t("localRefresh.statusCompleted") || "Complete"
                              : t("localRefresh.progress") || "Progress"}
                        </span>
                        {isUploading ? null : currentPhase ===
                          "waiting_for_cookie" ? (
                          <span className="font-medium text-orange-500">
                            {t("localRefresh.waitingForCookieShort") ||
                              "Waiting..."}
                          </span>
                        ) : !(
                            currentPhase === "fetching_posts" ||
                            currentPhase === "fetching_categories" ||
                            currentPhase === "initializing" ||
                            currentPhase === "starting"
                          ) ? (
                          <span className="font-semibold">
                            {Math.round(progress)}%
                          </span>
                        ) : null}
                      </div>
                      {isUploading ? (
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900/30">
                          <div
                            className="absolute h-full rounded-full bg-blue-500"
                            style={{
                              animation:
                                "progress-loading 1.5s ease-in-out infinite",
                            }}
                          />
                        </div>
                      ) : currentPhase === "waiting_for_cookie" ? (
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-orange-200 dark:bg-orange-900/30">
                          <div
                            className="absolute h-full rounded-full bg-orange-500"
                            style={{
                              animation:
                                "progress-loading 2s ease-in-out infinite",
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
                              animation:
                                "progress-loading 1.5s ease-in-out infinite",
                            }}
                          />
                        </div>
                      ) : (
                        <Progress value={progress} className="h-2" />
                      )}
                      {currentPhase === "processing_posts" &&
                        totalGames > 0 &&
                        !isUploading && (
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {t("localRefresh.gamesProcessed") || "Games"}
                            </span>
                            <span className="font-semibold text-foreground">
                              {processedGames.toLocaleString()} /{" "}
                              {totalGames.toLocaleString()}
                            </span>
                          </div>
                        )}
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {errors.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <button
                    onClick={() => setShowErrors(!showErrors)}
                    className="bg-destructive/10 flex w-full items-center justify-between rounded-lg p-3 text-sm"
                  >
                    <div className="text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-semibold">
                        {t("localRefresh.errors") || "Errors"} ({errors.length})
                      </span>
                    </div>
                    {showErrors ? (
                      <ChevronUp className="text-destructive/60 h-4 w-4" />
                    ) : (
                      <ChevronDown className="text-destructive/60 h-4 w-4" />
                    )}
                  </button>
                  <AnimatePresence>
                    {showErrors && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 max-h-40 space-y-1 overflow-y-auto"
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

            <Accordion type="single" collapsible className="rounded-lg border border-border bg-card">
              <AccordionItem value="advanced" className="border-b-0 px-4">
                <AccordionTrigger className="py-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    {t("localRefresh.advancedTitle") || t("localRefresh.settings") || "Advanced"}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
              <div className="divide-y divide-border rounded-lg border border-border/60">
                {/* Storage Location */}
                <div className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t("localRefresh.storageLocation") || "Storage"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={localIndexPath}
                      readOnly
                      className="h-8 flex-1 bg-muted/50 text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      onClick={handleChangeLocation}
                      disabled={isRefreshing}
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Performance */}
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t("localRefresh.performanceSettings") || "Performance"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">
                        {t("localRefresh.workerCount") || "Workers"}
                      </Label>
                      <Input
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
                        className="h-7 w-16 text-center text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">
                        {t("localRefresh.gamesPerPage") || "Per Page"}
                      </Label>
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
                        className="h-7 w-16 text-center text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Blacklist */}
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Ban className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t("localRefresh.blacklist") || "Blacklist"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder="Game ID"
                      value={newBlacklistId}
                      onChange={e => setNewBlacklistId(e.target.value.trim())}
                      className="h-7 flex-1 text-xs"
                      disabled={isRefreshing}
                      onKeyDown={e => {
                        if (e.key === "Enter" && newBlacklistId) {
                          const id = newBlacklistId.trim();
                          if (id && !settings?.blacklistIDs?.includes(id)) {
                            updateSetting("blacklistIDs", [
                              ...(settings?.blacklistIDs || []),
                              id,
                            ]);
                            setNewBlacklistId("");
                          }
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={isRefreshing || !newBlacklistId}
                      onClick={() => {
                        const id = newBlacklistId.trim();
                        if (id && !settings?.blacklistIDs?.includes(id)) {
                          updateSetting("blacklistIDs", [
                            ...(settings?.blacklistIDs || []),
                            id,
                          ]);
                          setNewBlacklistId("");
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {settings?.blacklistIDs?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {settings.blacklistIDs.map(id => (
                        <div
                          key={id}
                          className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
                        >
                          <span className="font-mono">{id}</span>
                          <button
                            onClick={() =>
                              updateSetting(
                                "blacklistIDs",
                                settings.blacklistIDs.filter(i => i !== id)
                              )
                            }
                            disabled={isRefreshing}
                            className="hover:bg-destructive/20 hover:text-destructive rounded p-0.5 disabled:opacity-50"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* About - adapts copy based on whether Custom Sources Mode is active */}
              <Card className="bg-muted/30 p-4">
              <div className="flex gap-3">
                {customSourcesMode ? (
                  <Globe className="h-5 w-5 shrink-0 text-purple-500" />
                ) : (
                  <Database className="h-5 w-5 shrink-0 text-primary" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">
                      {customSourcesMode
                        ? t("localRefresh.whatThisDoesCustom") || "Custom Sources"
                        : t("localRefresh.whatThisDoes") || "About"}
                    </h3>
                    {customSourcesMode && customSource?.name && (
                      <Badge variant="secondary" className="text-[10px]">
                        {customSource.name}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {customSourcesMode
                      ? customSource?.url
                        ? (t("localRefresh.whatThisDoesCustomActiveDesc") ||
                          "Browsing {{name}} ({{count}} games). Data refreshes every 12 hours or when you hit Sync Now. Switch sources anytime from the list above.")
                          .replace("{{name}}", customSource.name || "your source")
                          .replace(
                            "{{count}}",
                            (customSourceGameCount ??
                              customSource.gameCount ??
                              customSource.gamesCount ??
                              0
                            ).toLocaleString()
                          )
                        : t("localRefresh.whatThisDoesCustomDesc") ||
                          "Pull games from any Hydra Library-compatible JSON source. Pick one to get started."
                      : t("localRefresh.whatThisDoesDescription") ||
                        "Store game data locally for faster browsing and offline access."}
                  </p>
                  {customSourcesMode && customSource?.torrentOnly && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md border border-orange-500/30 bg-orange-500/5 p-2 text-[11px] text-orange-700 dark:text-orange-300">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        {t("localRefresh.torrentOnlyHint") ||
                          "This source only offers torrent links. Enable torrenting in Settings to download."}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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

        {/* Hydra Library Source Browser Dialog */}
        <Dialog open={hydraBrowserOpen} onOpenChange={setHydraBrowserOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
                <Globe className="h-5 w-5" />
                {t("localRefresh.hydraBrowserTitle")}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t("localRefresh.hydraBrowserDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={
                    t("localRefresh.hydraSearchPlaceholder")
                  }
                  value={hydraSearchQuery}
                  onChange={(e) => setHydraSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="max-h-[55vh] min-h-[200px] space-y-2 overflow-y-auto pr-1">
                {hydraSourcesLoading && (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader className="h-4 w-4 animate-spin" />
                    {t("localRefresh.hydraLoading") || "Loading sources..."}
                  </div>
                )}
                {hydraSourcesError && !hydraSourcesLoading && (
                  <div className="flex flex-col items-center gap-3 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span>{hydraSourcesError}</span>
                    <Button size="sm" variant="outline" onClick={fetchHydraSources}>
                      {t("common.retry") || "Retry"}
                    </Button>
                  </div>
                )}
                {!hydraSourcesLoading &&
                  !hydraSourcesError &&
                  filteredHydraSources.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {t("localRefresh.hydraNoResults") || "No sources match your search."}
                    </div>
                  )}
                {!hydraSourcesLoading &&
                  !hydraSourcesError &&
                  filteredHydraSources.map((source) => {
                    const isSelected = customSource?.id === source.id;
                    const trusted =
                      Array.isArray(source.status) && source.status.includes("Trusted");
                    return (
                      <button
                        key={source.id || source.url}
                        type="button"
                        onClick={() => handleSelectCustomSource(source)}
                        disabled={isSyncingCustomSource}
                        className={`flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-all disabled:opacity-50 ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="truncate text-sm font-semibold text-primary">
                                {source.title || source.name}
                              </h4>
                              {trusted && (
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                              )}
                              {isSelected && (
                                <CircleCheck className="h-3.5 w-3.5 text-primary" />
                              )}
                            </div>
                            {source.description && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {source.description}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right text-xs text-muted-foreground">
                            {typeof source.gamesCount === "number" && (
                              <div className="font-medium text-foreground">
                                {source.gamesCount.toLocaleString()}{" "}
                                {t("localRefresh.games") || "games"}
                              </div>
                            )}
                            {source.rating?.avg != null && (
                              <div className="flex items-center justify-end gap-1">
                                <Star className="h-3 w-3 text-amber-500" />
                                <span>{source.rating.avg.toFixed(2)}</span>
                                {source.rating.total ? (
                                  <span className="text-muted-foreground/70">
                                    ({source.rating.total})
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                        {Array.isArray(source.topDownloadOption) &&
                          source.topDownloadOption.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {source.topDownloadOption.slice(0, 4).map((opt, idx) => (
                                <Badge
                                  key={`${source.id}-${opt.name}-${idx}`}
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {opt.name}
                                  {typeof opt.count === "number" &&
                                    ` · ${opt.count.toLocaleString()}`}
                                </Badge>
                              ))}
                            </div>
                          )}
                      </button>
                    );
                  })}
              </div>
            </div>

            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {t("localRefresh.hydraAttribution")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-primary"
                onClick={() => setHydraBrowserOpen(false)}
              >
                {t("common.close") || "Close"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open={torrentWarningOpen} onOpenChange={setTorrentWarningOpen}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                {t("localRefresh.torrentOnlyDialogTitle") ||
                  "This source uses torrents only"}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-muted-foreground">
                <span className="block">
                  {(t("localRefresh.torrentOnlyDialogBody") ||
                    "{{name}} only publishes magnet links. To download anything from it you'll need to enable torrenting in Settings.")
                    .replace(
                      "{{name}}",
                      torrentWarningSource?.name || "This source"
                    )}
                </span>
                <span className="block rounded-md border border-orange-500/30 bg-orange-500/5 p-2 text-xs text-orange-700 dark:text-orange-300">
                  {t("localRefresh.torrentOnlyDialogVpn") ||
                    "Torrenting exposes your IP to peers — using a VPN is strongly recommended."}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-primary">
                {t("localRefresh.torrentOnlyDialogLater") || "Not now"}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-orange-500 text-white hover:bg-orange-600"
                onClick={() => {
                  setTorrentWarningOpen(false);
                  navigate("/settings", {
                    state: { scrollTo: "torrent-downloads", scrollToBottom: true },
                  });
                }}
              >
                {t("localRefresh.torrentOnlyDialogOpenSettings") ||
                  "Open Settings"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Manual paste fallback dialog (shown when upstream returns 403) */}
        <Dialog
          open={manualPasteOpen}
          onOpenChange={(open) => {
            setManualPasteOpen(open);
            // If the dialog is being closed (via cancel / escape / backdrop)
            // and the user never successfully ingested anything, revert the
            // pending source selection so we don't persist an unloaded source.
            if (!open && previousCustomSourceRef.current !== null) {
              revertPendingCustomSource();
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
                <ShieldCheck className="h-5 w-5 text-amber-500" />
                {t("localRefresh.manualPasteTitle") ||
                  "Couldn't fetch source automatically"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t("localRefresh.manualPasteDesc") ||
                  "The source is protected by a browser challenge (Cloudflare) that Ascendara can't solve on its own. We've opened the source URL in your browser — once the page loads the JSON, copy the entire text and paste it below."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {manualPasteSourceUrl && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <code className="flex-1 truncate text-foreground font-mono text-[11px]">
                    {manualPasteSourceUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-primary"
                    onClick={() => {
                      if (window.electron?.openURL && manualPasteSourceUrl) {
                        window.electron.openURL(manualPasteSourceUrl);
                      }
                    }}
                  >
                    {t("localRefresh.openAgain") || "Open again"}
                  </Button>
                </div>
              )}

              <textarea
                value={manualPasteText}
                onChange={e => {
                  setManualPasteText(e.target.value);
                  if (manualPasteError) setManualPasteError(null);
                }}
                placeholder={
                  t("localRefresh.manualPastePlaceholder") ||
                  'Paste the full JSON here (should start with { "name": ... "downloads": [...] })'
                }
                spellCheck={false}
                className="h-56 w-full text-foreground resize-none rounded-md border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-primary/40"
              />

              {manualPasteError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {manualPasteError}
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-primary"
                onClick={handlePasteFromClipboard}
                disabled={isIngestingManual}
              >
                {t("localRefresh.pasteFromClipboard") || "Paste from clipboard"}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary"
                  onClick={() => setManualPasteOpen(false)}
                  disabled={isIngestingManual}
                >
                  {t("common.cancel") || "Cancel"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleIngestManualJson}
                  disabled={isIngestingManual || !manualPasteText.trim()}
                >
                  {isIngestingManual
                    ? t("localRefresh.importing") || "Importing..."
                    : t("localRefresh.importJson") || "Import JSON"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default LocalRefresh;
