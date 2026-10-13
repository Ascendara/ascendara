import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { motion, AnimatePresence, animate, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw,
  CircleCheck,
  AlertCircle,
  Loader,
  Database,
  ArrowLeft,
  ArrowRight,
  Folder,
  Settings2,
  Star,
  X,
  Plus,
  Ban,
  Zap,
  Upload,
  Cloud,
  ExternalLink,
  Calendar,
  PencilIcon,
  Globe,
  ShieldCheck,
  Search as SearchIcon,
  AlertTriangle,
  ClipboardList,
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
import { cn } from "@/lib/utils";

// The shared index refresh finishes almost instantly, so hold the busy state
// long enough to be seen and then confirm the result on the button itself.
const MIN_REFRESH_BUSY_MS = 700;
const REFRESH_DONE_MS = 2500;

const AnimatedNumber = ({ value }) => {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const previousRef = useRef(value);

  useEffect(() => {
    const from = previousRef.current;
    previousRef.current = value;
    if (value == null || from == null || from === value || reduceMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: latest => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  return display != null ? display.toLocaleString() : "—";
};

const SettingRow = ({ icon: Icon, title, description, active, footer, children }) => (
  <div className="px-5 py-4">
    <div className="flex items-center gap-3">
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-green-500" : "text-muted-foreground"
        )}
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
    {footer && <div className="mt-3 pl-7">{footer}</div>}
  </div>
);

const LocalRefresh = ({ embedded = false, onBack, renderManager }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, updateSetting } = useSettings();
  const { user, isAuthenticated } = useAuth();

  // Hardcoded flag to show/hide extra sources that aren't ready yet
  const SHOW_EXTRA_SOURCES = false;

  // Get welcomeStep, indexRefreshStarted, and indexComplete from navigation state if coming from Welcome page
  const welcomeStep = location.state?.welcomeStep;

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
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [localIndexPath, setLocalIndexPath] = useState("");
  const [hasIndexBefore, setHasIndexBefore] = useState(false);
  const [newBlacklistId, setNewBlacklistId] = useState("");
  const wasFirstIndexRef = useRef(false);
  // Snapshot of the previous custom source, used to revert the selection if
  // the user bails out of the manual-paste fallback without ingesting JSON.
  const previousCustomSourceRef = useRef(null);
  const [indexInfo, setIndexInfo] = useState(null); // { gameCount, date, size }
  // Whether the API is keeping the index fresh itself, or is blocked and needs help
  const [indexStatus, setIndexStatus] = useState(null);
  const [relayState, setRelayState] = useState("idle"); // idle, running, done, error
  const [relayError, setRelayError] = useState(null);
  const [downloadingIndex, setDownloadingIndex] = useState(null);
  const [indexDownloadProgress, setIndexDownloadProgress] = useState(null); // { progress, phase, downloaded, total }
  const [justRefreshed, setJustRefreshed] = useState(false);
  const downloadStartedAtRef = useRef(0);
  const justRefreshedTimerRef = useRef(null);
  const [, setRelativeTimeTick] = useState(0);

  // External Sources Mode (user-configurable source bucket)
  const [customSourcesMode, setCustomSourcesMode] = useState(false);
  const [customSource, setCustomSource] = useState(null); // { id, name, url, gamesCount, ... }
  const [customSourceLastSynced, setCustomSourceLastSynced] = useState(null);
  const [customSourceGameCount, setCustomSourceGameCount] = useState(null);
  const [sourceBrowserOpen, setSourceBrowserOpen] = useState(false);
  const [bucketSources, setBucketSources] = useState([]);
  const [bucketSourcesLoading, setBucketSourcesLoading] = useState(false);
  const [bucketSourcesError, setBucketSourcesError] = useState(null);
  const [bucketSearchQuery, setBucketSearchQuery] = useState("");
  // URL of the active source bucket. Users enter this manually; the Ascendara
  // API decides which bucket hosts are allowed (e.g. library.hydra.wiki).
  // `sourceBucketUrl` is the committed value (persisted, gates Browse);
  // `sourceBucketUrlDraft` is what's in the input while the user is typing.
  const [sourceBucketUrl, setSourceBucketUrl] = useState("");
  const [sourceBucketUrlDraft, setSourceBucketUrlDraft] = useState("");
  const [isSyncingCustomSource, setIsSyncingCustomSource] = useState(false);

  // Manual paste fallback (triggered on 403 from upstream source)
  const [manualPasteOpen, setManualPasteOpen] = useState(false);
  const [manualPasteText, setManualPasteText] = useState("");
  const [manualPasteError, setManualPasteError] = useState(null);
  const [isIngestingManual, setIsIngestingManual] = useState(false);
  const [manualPasteSourceUrl, setManualPasteSourceUrl] = useState(null);

  // Library of sources the user has selected/synced, so they can switch back
  // and forth without having to re-browse the bucket each time.
  const [customSourcesLibrary, setCustomSourcesLibrary] = useState([]);

  // Torrent-only source warning (shown when a synced source has no non-torrent
  // hosts and the user hasn't enabled torrenting in Settings yet)
  const [torrentWarningOpen, setTorrentWarningOpen] = useState(false);
  const [torrentWarningSource, setTorrentWarningSource] = useState(null);

  // JSON Import Dialog
  const [showJsonImportDialog, setShowJsonImportDialog] = useState(false);
  const [jsonImportText, setJsonImportText] = useState("");
  const [jsonImportError, setJsonImportError] = useState(null);
  const [isProcessingJson, setIsProcessingJson] = useState(false);
  const [showJsonConfirmDialog, setShowJsonConfirmDialog] = useState(false);
  const [jsonImportData, setJsonImportData] = useState(null); // { type, gameCount, keys, sampleGames }
  const [jsonListName, setJsonListName] = useState(""); // For naming custom lists

  // Custom Lists Management
  const [customLists, setCustomLists] = useState([]); // Array of custom lists
  const [activeCustomList, setActiveCustomList] = useState(null); // Currently active custom list
  const [showListNameDialog, setShowListNameDialog] = useState(false); // Dialog for naming new lists

  const fetchIndexInfo = async () => {
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
  };

  const fetchIndexStatus = async () => {
    const status = await window.electron.getIndexStatus();
    if (status?.success) setIndexStatus(status);
  };

  useEffect(() => {
    fetchIndexStatus();
    const interval = setInterval(fetchIndexStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch the pages the API can't reach right now on this machine
  const handleHelpRefresh = async () => {
    setRelayState("running");
    setRelayError(null);
    const result = await window.electron.startIndexRelay();
    if (result?.success) {
      setRelayState("done");
      setLastRefreshTime(new Date());
      fetchIndexInfo();
    } else {
      setRelayState("error");
      setRelayError(result?.error || null);
    }
  };

  // Keep relative times ("2 minutes ago") moving while the page stays open
  useEffect(() => {
    const interval = setInterval(() => setRelativeTimeTick(tick => tick + 1), 30000);
    return () => {
      clearInterval(interval);
      clearTimeout(justRefreshedTimerRef.current);
    };
  }, []);

  // Load settings and ensure localIndex is set, also check if refresh is running
  useEffect(() => {
    const initializeSettings = async () => {
      try {
        const settings = await window.electron.getSettings();

        // Load custom sources library
        if (settings?.customSourcesLibrary) {
          setCustomSourcesLibrary(settings.customSourcesLibrary);
        }

        // Load custom lists
        if (settings?.customLists) {
          setCustomLists(settings.customLists);
        }

        // Load active custom list
        if (settings?.activeCustomList) {
          setActiveCustomList(settings.activeCustomList);
        }

        // Load custom source mode
        if (settings?.customSourcesMode) {
          setCustomSourcesMode(settings.customSourcesMode);
        }

        // Load the user-configured source bucket URL (e.g. library.hydra.wiki)
        if (typeof settings?.sourceBucketUrl === "string") {
          setSourceBucketUrl(settings.sourceBucketUrl);
          setSourceBucketUrlDraft(settings.sourceBucketUrl);
        }

        // Load custom source
        if (settings?.customSource) {
          setCustomSource(settings.customSource);
          if (settings.customSource.lastSynced) {
            setCustomSourceLastSynced(new Date(settings.customSource.lastSynced));
          }
          if (settings.customSource.gameCount) {
            setCustomSourceGameCount(settings.customSource.gameCount);
          }
        }

        // Load local index path (stored under `localIndex` in settings)
        if (settings?.localIndex) {
          setLocalIndexPath(settings.localIndex);
        } else if (window.electron?.getDefaultLocalIndexPath) {
          const defaultPath = await window.electron.getDefaultLocalIndexPath();
          setLocalIndexPath(defaultPath);
          await updateSetting("localIndex", defaultPath);
        }

        // Remember whether an index already exists so the primary action
        // reads "Refresh now" instead of "Get the index"
        if (window.electron?.getTimestampValue) {
          const hasIndexed = await window.electron.getTimestampValue("hasIndexBefore");
          if (hasIndexed === true) {
            setHasIndexBefore(true);
          }
        }

        // Load last refresh time
        if (settings?.lastLocalIndexRefresh) {
          setLastRefreshTime(new Date(settings.lastLocalIndexRefresh));
        }

        // Resolve the index path once for status queries below
        const resolvedIndexPath =
          settings?.localIndex ||
          (window.electron?.getDefaultLocalIndexPath
            ? await window.electron.getDefaultLocalIndexPath()
            : null);

        // Read the saved timestamp even when no refresh is currently running.
        if (resolvedIndexPath && window.electron?.getLocalRefreshProgress) {
          try {
            const progress =
              await window.electron.getLocalRefreshProgress(resolvedIndexPath);
            // Use lastSuccessfulTimestamp which persists across refresh attempts
            if (progress?.lastSuccessfulTimestamp) {
              setLastRefreshTime(new Date(progress.lastSuccessfulTimestamp * 1000));
            }
          } catch (e) {
            console.log("No progress file found for last refresh time");
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

    fetchIndexInfo();
  }, [t]);

  // Listen for index refresh events from the main process
  useEffect(() => {
    // Public index download event handlers
    const handlePublicDownloadStarted = () => {
      console.log("Public index download started");
      downloadStartedAtRef.current = Date.now();
      clearTimeout(justRefreshedTimerRef.current);
      setJustRefreshed(false);
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
      if (window.electron?.setTimestampValue) {
        await window.electron.setTimestampValue("hasIndexBefore", true);
      }
      // Auto-enable local index if this was the user's first index
      if (wasFirstIndexRef.current) {
        await updateSetting("usingLocalIndex", true);
        wasFirstIndexRef.current = false;
      }
      // Clear caches so the app loads fresh data
      // Do NOT invalidate imageCacheService settings cache - the localIndex path hasn't changed.
      console.log("[LocalRefresh] Public index download complete, clearing caches");
      imageCacheService.memoryCache.clear();
      imageCacheService.memoryCacheOrder = [];
      await imageCacheService.clearIndexedDB();
      gameService.clearMemoryCache();
      localStorage.removeItem("ascendara_games_cache");
      localStorage.removeItem("local_ascendara_games_timestamp");
      localStorage.removeItem("local_ascendara_metadata_cache");
      localStorage.removeItem("local_ascendara_last_updated");

      // Dispatch custom event to notify other components to refresh their data
      console.log("[LocalRefresh] Dispatching index-refreshed event");
      window.dispatchEvent(
        new CustomEvent("index-refreshed", {
          detail: { timestamp: Date.now() },
        })
      );

      const busyFor = Date.now() - downloadStartedAtRef.current;
      if (busyFor < MIN_REFRESH_BUSY_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_REFRESH_BUSY_MS - busyFor));
      }
      setDownloadingIndex(null);
      setIndexDownloadProgress(null);
      setHasIndexBefore(true);
      setLastRefreshTime(new Date()); // Set last refresh time to now
      setJustRefreshed(true);
      clearTimeout(justRefreshedTimerRef.current);
      justRefreshedTimerRef.current = setTimeout(
        () => setJustRefreshed(false),
        REFRESH_DONE_MS
      );
      fetchIndexInfo();
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

    window.electron.onPublicIndexDownloadStarted?.(handlePublicDownloadStarted);
    window.electron.onPublicIndexDownloadComplete?.(handlePublicDownloadComplete);
    window.electron.onPublicIndexDownloadError?.(handlePublicDownloadError);
    window.electron.onPublicIndexDownloadProgress?.(handlePublicDownloadProgress);

    return () => {
      window.electron.offPublicIndexDownloadStarted?.();
      window.electron.offPublicIndexDownloadComplete?.();
      window.electron.offPublicIndexDownloadError?.();
      window.electron.offPublicIndexDownloadProgress?.();
    };
  }, []);

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
  // External Sources Mode handlers
  // ---------------------------------------------------------------------------

  const handleToggleCustomSourcesMode = async enabled => {
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
          "External sources enabled. Set a source bucket URL to begin."
      );
    } else {
      // Revert to using local index if one is built; app.jsx / Search.jsx will re-read
      toast.info(
        t("localRefresh.customModeDisabled") ||
          "External sources disabled. Reverting to the official index."
      );
    }
    // Notify other pages (Search/Library) to re-fetch games
    window.dispatchEvent(
      new CustomEvent("index-refreshed", { detail: { timestamp: Date.now() } })
    );
  };

  // Fetch the list of sources for a given bucket URL.
  const fetchBucketSources = useCallback(
    async bucketUrl => {
      setBucketSourcesLoading(true);
      setBucketSourcesError(null);
      try {
        const targetBucket = String(bucketUrl || sourceBucketUrl || "");
        if (!targetBucket.trim()) {
          setBucketSources([]);
          setBucketSourcesError(
            t("localRefresh.bucketUrlRequired") ||
              "Enter a source bucket URL to continue."
          );
          return;
        }

        const url =
          "https://api.ascendara.app/api/sources/bucket?url=" +
          encodeURIComponent(targetBucket) +
          "&page=1&limit=100";

        let parsed;
        let ok;
        let status;
        if (window.electron?.request) {
          const res = await window.electron.request(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            timeout: 20000,
          });
          status = res.status;
          ok = res.ok;
          try {
            parsed = JSON.parse(res.data);
          } catch (_) {
            parsed = null;
          }
        } else {
          const r = await fetch(url);
          status = r.status;
          ok = r.ok;
          try {
            parsed = await r.json();
          } catch (_) {
            parsed = null;
          }
        }

        if (!ok) {
          // 404 = URL is not a recognized bucket. Surface the server message so
          // the UX can coach the user toward a valid bucket
          if (status === 404) {
            setBucketSources([]);
            setBucketSourcesError(
              parsed?.message ||
                t("localRefresh.bucketUrlUnrecognized") ||
                "This URL is not a recognized source bucket."
            );
            return;
          }
          throw new Error(parsed?.message || `HTTP ${status}`);
        }

        const sources = Array.isArray(parsed?.sources) ? parsed.sources : [];
        setBucketSources(sources);
      } catch (err) {
        console.error("Failed to fetch bucket sources:", err);
        setBucketSourcesError(err?.message || "Failed to fetch sources");
      } finally {
        setBucketSourcesLoading(false);
      }
    },
    [sourceBucketUrl, t]
  );

  const handleSaveSourceBucketUrl = async rawUrl => {
    const trimmed = (rawUrl || "").trim();
    setSourceBucketUrl(trimmed);
    setSourceBucketUrlDraft(trimmed);
    await updateSetting("sourceBucketUrl", trimmed);
    if (trimmed) {
      toast.success(t("localRefresh.sourceBucketSaved") || "Source bucket saved");
    }
  };

  const handleOpenSourceBrowser = () => {
    // Require the user to have configured a bucket URL first. The API decides
    // which bucket hosts are accepted; the client just forwards the URL.
    if (!sourceBucketUrl.trim()) {
      toast.error(
        t("localRefresh.bucketUrlRequired") || "Enter a source bucket URL to continue."
      );
      return;
    }
    setSourceBrowserOpen(true);
    if (!bucketSourcesLoading) {
      fetchBucketSources(sourceBucketUrl);
    }
  };

  // ---------------------------------------------------------------------------
  // Library / torrent helpers
  // ---------------------------------------------------------------------------

  // Merge a source entry into the persisted library (dedupe by URL) and save.
  const upsertLibraryEntry = useCallback(
    async entry => {
      if (!entry?.url) return [];
      let next = [];
      setCustomSourcesLibrary(prev => {
        const filtered = (prev || []).filter(s => s?.url !== entry.url);
        next = [entry, ...filtered].slice(0, 20); // cap at 20 saved sources
        return next;
      });
      await updateSetting("customSourcesLibrary", next);
      return next;
    },
    [updateSetting]
  );

  const removeLibraryEntry = useCallback(
    async url => {
      if (!url) return;
      let next = [];
      setCustomSourcesLibrary(prev => {
        next = (prev || []).filter(s => s?.url !== url);
        return next;
      });
      await updateSetting("customSourcesLibrary", next);
    },
    [updateSetting]
  );

  // Check source metadata (topDownloadOption) to see if the upstream
  // only advertises torrent links. This is the authoritative signal when
  // browsing sources, because it doesn't require syncing first.
  const isSourceMetaTorrentOnly = source => {
    const opts = Array.isArray(source?.topDownloadOption)
      ? source.topDownloadOption
      : null;
    if (!opts || opts.length === 0) return false;
    return opts.every(o => String(o?.name || "").toLowerCase() === "torrent");
  };

  // Inspect a mapped dataset to determine whether it's torrent-only.
  // Bucket sources map magnet links to download_links.torrent, and most DDL hosts
  // produce non-torrent keys (gofile, buzzheavier, 1fichier, etc.).
  const isTorrentOnlyDataset = games => {
    if (!Array.isArray(games) || games.length === 0) return false;
    let sampled = 0;
    let nonTorrent = 0;
    for (const g of games) {
      const links = g?.download_links;
      if (!links || typeof links !== "object") continue;
      sampled++;
      const keys = Object.keys(links).filter(k => (links[k] || []).length > 0);
      if (keys.some(k => k !== "torrent")) nonTorrent++;
      if (sampled >= 50) break; // sampling is enough
    }
    if (sampled === 0) return false;
    return nonTorrent === 0;
  };

  const maybeWarnTorrentOnly = async (source, games) => {
    try {
      const torrentOnly = isSourceMetaTorrentOnly(source) || isTorrentOnlyDataset(games);
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

  const handleSelectCustomSource = async source => {
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

    // Hard-block torrent-only sources when torrenting is disabled. We show
    // the warning dialog (which links to Settings) but do NOT commit the
    // selection -- the user has to enable torrenting first.
    if (isSourceMetaTorrentOnly(payload)) {
      try {
        const current = await window.electron.getSettings();
        if (!current?.torrentEnabled) {
          setTorrentWarningSource({ ...payload, torrentOnly: true, blocked: true });
          setTorrentWarningOpen(true);
          return;
        }
      } catch (e) {
        console.warn("[LocalRefresh] torrent pre-check failed:", e);
      }
    }

    // Clear active custom list when picking a regular external source.
    if (activeCustomList) {
      setActiveCustomList(null);
      await updateSetting("activeCustomList", null);
    }

    // Snapshot the previously-active source so we can revert if the user
    // cancels out of the manual-paste fallback without ingesting anything.
    previousCustomSourceRef.current = customSource;
    setCustomSource(payload);
    setCustomSourceLastSynced(null);
    setCustomSourceGameCount(null);
    await updateSetting("customSource", payload);
    await upsertLibraryEntry(payload);
    setSourceBrowserOpen(false);
    toast.success(
      (t("localRefresh.customSourceSelected") || "Selected custom source") +
        ": " +
        payload.name
    );
    // Immediately sync the source after selection
    await handleSyncCustomSource(payload);
  };

  // Switch the active source to a previously-saved library entry. Reuses the
  // cached mapped data if fresh (<12h), otherwise refetches.
  const handleSwitchToSavedSource = async entry => {
    if (!entry?.url) return;
    const now = Date.now();
    const payload = { ...entry, lastUsed: now };

    // Clear active custom list when switching to a regular external source.
    if (activeCustomList) {
      setActiveCustomList(null);
      await updateSetting("activeCustomList", null);
    }

    setCustomSource(payload);
    setCustomSourceLastSynced(entry.lastSynced ? new Date(entry.lastSynced) : null);
    setCustomSourceGameCount(
      typeof entry.gameCount === "number" ? entry.gameCount : null
    );
    await updateSetting("customSource", payload);
    await upsertLibraryEntry(payload);

    // Clear all caches to force reload with new data
    gameService.clearMemoryCache();
    localStorage.removeItem("ascendara_games_cache");
    localStorage.removeItem("local_ascendara_games_timestamp");
    localStorage.removeItem("local_ascendara_metadata_cache");
    localStorage.removeItem("local_ascendara_last_updated");

    window.dispatchEvent(
      new CustomEvent("index-refreshed", { detail: { timestamp: now } })
    );
    toast.success(
      (t("localRefresh.customSourceSwitched") || "Switched source") + ": " + payload.name
    );
  };

  const handleSyncCustomSource = async sourceOverride => {
    const source = sourceOverride || customSource;
    if (!source?.url) {
      toast.error(t("localRefresh.customSourceNone") || "No custom source selected");
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
      // Any HTTP error (403 Cloudflare, 404, 429, generic network failure, etc.)
      // means we couldn't refetch automatically. Open the URL in the user's
      // browser so they can grab the JSON themselves and paste it back in.
      const isFetchFailure =
        /Custom source HTTP|HTTP\s*\d+|Failed to fetch|NetworkError|ETIMEDOUT|ENOTFOUND|ECONNRESET/i.test(
          msg
        );
      // If we already have saved JSON for this source, don't revert -- the
      // user's data is still usable, we just couldn't refresh it.
      const hasSavedJson = !!source?.lastSynced;
      if (isFetchFailure) {
        toast.error(
          (t("localRefresh.customSourceSyncFailed") || "Sync failed") +
            " - " +
            (t("localRefresh.customSourcePasteFallback") ||
              "paste the JSON manually to update.")
        );
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
        // Sync failed outright -- only revert if we never had data for this
        // source to begin with. Otherwise keep the existing saved payload.
        if (!hasSavedJson) {
          await revertPendingCustomSource();
        }
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
    setCustomSourceLastSynced(prev?.lastSynced ? new Date(prev.lastSynced) : null);
    setCustomSourceGameCount(typeof prev?.gameCount === "number" ? prev.gameCount : null);
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
      // Clear active custom list when ingesting JSON for a regular external source.
      if (activeCustomList) {
        setActiveCustomList(null);
        await updateSetting("activeCustomList", null);
      }

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
        // Flag this source as user-provided so gameService never tries to
        // re-fetch it from the upstream URL (the user's pasted JSON is
        // persisted to disk and will be used on future loads).
        userProvided: true,
      };
      setCustomSource(nextPayload);
      await updateSetting("customSource", nextPayload);
      await upsertLibraryEntry(nextPayload);

      // Clear all caches to force reload with new data
      gameService.clearMemoryCache();
      localStorage.removeItem("ascendara_games_cache");
      localStorage.removeItem("local_ascendara_games_timestamp");
      localStorage.removeItem("local_ascendara_metadata_cache");
      localStorage.removeItem("local_ascendara_last_updated");

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

  const handlePasteJsonFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setJsonImportText(text);
        setJsonImportError(null);
      }
    } catch (e) {
      console.warn("Clipboard read failed:", e);
    }
  };

  const handleProcessJsonImport = async () => {
    if (!jsonImportText.trim()) return;

    setIsProcessingJson(true);
    setJsonImportError(null);

    try {
      const parsedData = JSON.parse(jsonImportText);
      const validation = validateAndDetectJsonFormat(parsedData);

      if (!validation.isValid) {
        setJsonImportError(validation.error);
        return;
      }

      setJsonImportData(validation.data);

      // Auto-fill list name if there's a name field in the JSON
      if (
        parsedData.name &&
        typeof parsedData.name === "string" &&
        parsedData.name.trim()
      ) {
        setJsonListName(parsedData.name.trim());
      } else {
        setJsonListName("");
      }

      setShowJsonConfirmDialog(true);
      setJsonImportText("");
      setShowJsonImportDialog(false);
    } catch (err) {
      console.error("JSON parsing failed:", err);
      setJsonImportError(err?.message || "Invalid JSON format");
    } finally {
      setIsProcessingJson(false);
    }
  };

  const handleConfirmJsonImport = async () => {
    if (!jsonImportData || !jsonListName.trim()) return;

    try {
      // Use the original JSON data as-is without conversion
      const originalData = jsonImportData.originalData;
      const count = jsonImportData.gameCount;
      const now = Date.now();

      // Create a custom list entry
      const customListData = {
        id: `custom_list_${now}`,
        name: jsonListName.trim(),
        itemCount: count,
        format: jsonImportData.type,
        createdAt: now,
        lastUsed: now,
        originalJson: originalData, // Store the original JSON structure
        keys: jsonImportData.keys,
        sampleItems: jsonImportData.sampleGames,
      };

      // Store the JSON data directly in a way that can be accessed by the game service
      if (window.electron?.setCustomListData) {
        await window.electron.setCustomListData(customListData.id, originalData);
      }

      // Add to custom lists and persist.
      const updatedLists = [...customLists, customListData];
      setCustomLists(updatedLists);
      await updateSetting("customLists", updatedLists);

      // Close dialogs before switching so the UI feels responsive.
      setShowJsonConfirmDialog(false);
      setJsonImportData(null);
      setJsonImportText("");
      setJsonListName("");

      // Activate the newly-imported list through the same pipeline used by
      // list switching so the game service actually loads it as the source.
      await handleSwitchToList(customListData);

      window.dispatchEvent(
        new CustomEvent("custom-list-imported", {
          detail: { list: customListData, timestamp: now },
        })
      );
    } catch (err) {
      console.error("JSON import failed:", err);
      toast.error(err?.message || "Failed to import JSON data");
    }
  };

  // Normalize any supported custom list JSON into bucket-compatible {name, downloads: []}
  // so the game service pipeline (ingestCustomSourceJson) can consume it uniformly.
  const normalizeListDataToBucketFormat = (raw, fallbackName) => {
    if (!raw || typeof raw !== "object") return null;
    if (Array.isArray(raw.downloads)) {
      return { name: raw.name || fallbackName, ...raw };
    }
    if (Array.isArray(raw.games)) {
      const downloads = raw.games.map(g => {
        // Collect URIs from every common shape used by community JSONs.
        const uris = [];
        if (Array.isArray(g.uris)) uris.push(...g.uris);
        if (g.uri) uris.push(g.uri);
        if (g.magnet) uris.push(g.magnet);
        if (g.url) uris.push(g.url);
        if (g.dirlink) uris.push(g.dirlink);
        if (g.download_links && typeof g.download_links === "object") {
          for (const val of Object.values(g.download_links)) {
            if (Array.isArray(val)) uris.push(...val);
            else if (typeof val === "string") uris.push(val);
          }
        }
        return {
          title: g.title || g.name || g.game || "Unknown",
          uris: uris.filter(Boolean),
          uploadDate:
            g.uploadDate || g.date || g.latest_update || new Date().toISOString(),
          fileSize: g.fileSize || g.size || "N/A",
        };
      });
      return { name: raw.name || fallbackName, downloads };
    }
    return null;
  };

  // Custom Lists Management Functions
  // A custom list is just a user-imported external source. Reuse the same pipeline.
  const handleSwitchToList = async list => {
    try {
      const now = Date.now();

      // If an external (non-custom-list) source is currently active, push it
      // down to the saved sources library so it can be swapped back later.
      if (customSource && !customSource.isCustomList) {
        await upsertLibraryEntry(customSource);
      }

      // Ensure external sources mode is enabled (custom lists live within it).
      if (!customSourcesMode) {
        setCustomSourcesMode(true);
        await updateSetting("customSourcesMode", true);
      }

      // Pull stored JSON for this list. Prefer electron-backed storage, but
      // fall back to the copy embedded in the list object (set at import time)
      // so lists always work even if disk storage is unavailable.
      let raw = null;
      try {
        if (window.electron?.getCustomListData) {
          raw = await window.electron.getCustomListData(list.id);
        }
      } catch (e) {
        console.warn("[LocalRefresh] getCustomListData failed:", e);
      }
      if (!raw) raw = list.originalJson || null;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch (_) {
          /* fall through */
        }
      }

      const normalized = normalizeListDataToBucketFormat(raw, list.name);
      if (
        !normalized ||
        !Array.isArray(normalized.downloads) ||
        normalized.downloads.length === 0
      ) {
        console.error(
          "[LocalRefresh] Custom list normalize failed. raw keys:",
          raw && typeof raw === "object" ? Object.keys(raw) : typeof raw
        );
        toast.error(t("localRefresh.listDataInvalid") || "Custom list data is invalid");
        return;
      }

      // Build a customSource payload that looks just like any other external
      // source. The URL is a stable synthetic key used only as a cache key.
      const customSourcePayload = {
        id: list.id,
        name: list.name,
        url: `custom_list_${list.id}`,
        gameCount: normalized.downloads.length,
        lastSynced: now,
        lastUsed: now,
        isCustomList: true,
      };

      // IMPORTANT: settings.customSource must be set BEFORE ingestCustomSourceJson
      // since the game service reads customSource from settings internally.
      await updateSetting("customSource", customSourcePayload);
      setCustomSource(customSourcePayload);
      setCustomSourceLastSynced(new Date(now));
      setCustomSourceGameCount(normalized.downloads.length);
      setActiveCustomList(list);
      await updateSetting("activeCustomList", list);

      // Clear legacy caches and memory cache so the new source loads fresh.
      gameService.clearMemoryCache();
      gameService.clearCustomSourceCache(customSourcePayload.url);
      localStorage.removeItem("ascendara_games_cache");
      localStorage.removeItem("local_ascendara_games_timestamp");
      localStorage.removeItem("local_ascendara_metadata_cache");
      localStorage.removeItem("local_ascendara_last_updated");

      // Feed the normalized JSON through the exact same pipeline external
      // sources use. This populates the URL-keyed cache so future reads return
      // this data without attempting a network fetch.
      await gameService.ingestCustomSourceJson(normalized);

      if (window.electron?.setTimestampValue) {
        await window.electron.setTimestampValue("hasIndexBefore", true);
        setHasIndexBefore(true);
      }

      window.dispatchEvent(
        new CustomEvent("index-refreshed", { detail: { timestamp: now } })
      );

      toast.success(
        (t("localRefresh.listSwitched") || "Switched to list") + `: ${list.name}`
      );
    } catch (err) {
      console.error("Failed to switch to list:", err);
      toast.error(err?.message || "Failed to switch list");
    }
  };

  const handleRenameList = async (list, suppliedName) => {
    const newName =
      suppliedName ??
      prompt(
        t("localRefresh.enterNewName") || "Enter new name for this list:",
        list.name
      );

    if (newName && newName.trim() && newName.trim() !== list.name) {
      try {
        const updatedLists = customLists.map(l =>
          l.id === list.id ? { ...l, name: newName.trim() } : l
        );
        setCustomLists(updatedLists);
        await updateSetting("customLists", updatedLists);

        // Update active list if it's the one being renamed
        if (activeCustomList?.id === list.id) {
          const updatedActiveList = { ...activeCustomList, name: newName.trim() };
          setActiveCustomList(updatedActiveList);
          await updateSetting("activeCustomList", updatedActiveList);
        }

        toast.success(t("localRefresh.listRenamed") || "List renamed successfully");
      } catch (err) {
        console.error("Failed to rename list:", err);
        toast.error(err?.message || "Failed to rename list");
      }
    }
  };

  const handleDeleteList = async (list, alreadyConfirmed = false) => {
    const confirmed =
      alreadyConfirmed ||
      confirm(
        (t("localRefresh.confirmDeleteList") ||
          "Are you sure you want to delete this list?") + ` "${list.name}"`
      );

    if (confirmed) {
      try {
        const updatedLists = customLists.filter(l => l.id !== list.id);
        setCustomLists(updatedLists);
        await updateSetting("customLists", updatedLists);

        // Remove from electron storage
        if (window.electron?.removeCustomListData) {
          await window.electron.removeCustomListData(list.id);
        }

        // Remove from active list if it was the active one
        if (activeCustomList?.id === list.id) {
          setActiveCustomList(null);
          await updateSetting("activeCustomList", null);
        }

        toast.success(t("localRefresh.listDeleted") || "List deleted successfully");
      } catch (err) {
        console.error("Failed to delete list:", err);
        toast.error(err?.message || "Failed to delete list");
      }
    }
  };

  const validateAndDetectJsonFormat = data => {
    if (!data || typeof data !== "object") {
      return { isValid: false, error: "Invalid JSON: must be an object" };
    }

    // Check for games array format
    if (data.games && Array.isArray(data.games)) {
      if (data.games.length === 0) {
        return { isValid: false, error: "Games array is empty" };
      }

      // Extract keys from sample games
      const sampleGames = data.games.slice(0, 3);
      const keys = new Set();
      sampleGames.forEach(game => {
        if (game && typeof game === "object") {
          Object.keys(game).forEach(key => keys.add(key));
        }
      });

      return {
        isValid: true,
        data: {
          type: "games",
          gameCount: data.games.length,
          keys: Array.from(keys),
          sampleGames,
          originalData: data,
        },
      };
    }

    // Check for downloads array format
    if (data.downloads && Array.isArray(data.downloads)) {
      if (data.downloads.length === 0) {
        return { isValid: false, error: "Downloads array is empty" };
      }

      // Extract keys from sample downloads
      const sampleGames = data.downloads.slice(0, 3);
      const keys = new Set();
      sampleGames.forEach(download => {
        if (download && typeof download === "object") {
          Object.keys(download).forEach(key => keys.add(key));
        }
      });

      return {
        isValid: true,
        data: {
          type: "downloads",
          gameCount: data.downloads.length,
          keys: Array.from(keys),
          sampleGames,
          originalData: data,
        },
      };
    }

    return {
      isValid: false,
      error:
        'Unsupported format. Expected { "games": [...] } or { "name": "...", "downloads": [...] }',
    };
  };

  const filteredBucketSources = useMemo(() => {
    const q = bucketSearchQuery.trim().toLowerCase();
    if (!q) return bucketSources;
    return bucketSources.filter(s => {
      const title = (s?.title || s?.name || "").toLowerCase();
      const desc = (s?.description || "").toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [bucketSources, bucketSearchQuery]);

  // Handle back navigation
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (welcomeStep) {
      navigate("/welcome", {
        state: {
          welcomeStep,
        },
      });
    } else {
      navigate(-1);
    }
  };

  const addBlacklistId = () => {
    const id = newBlacklistId.trim();
    if (id && !settings?.blacklistIDs?.includes(id)) {
      updateSetting("blacklistIDs", [...(settings?.blacklistIDs || []), id]);
      setNewBlacklistId("");
    }
  };

  // Derived view state
  const isIndexReady = hasIndexBefore;
  const modeLocked = !!downloadingIndex || isSyncingCustomSource;
  const heroGameCount = customSourcesMode
    ? (activeCustomList?.itemCount ??
      customSourceGameCount ??
      customSource?.gameCount ??
      customSource?.gamesCount)
    : indexInfo?.gameCount;
  const rawSourceRating =
    customSource?.rating && typeof customSource.rating === "object"
      ? customSource.rating.avg
      : typeof customSource?.rating === "number"
        ? customSource.rating
        : null;
  const sourceRating =
    rawSourceRating == null || Number.isNaN(Number(rawSourceRating))
      ? null
      : Number(rawSourceRating);
  const lastRefreshLabel = customSourcesMode
    ? activeCustomList?.createdAt
      ? formatLastRefreshTime(new Date(activeCustomList.createdAt))
      : customSourceLastSynced
        ? formatLastRefreshTime(customSourceLastSynced)
        : t("localRefresh.never") || "Never"
    : lastRefreshTime
      ? formatLastRefreshTime(lastRefreshTime)
      : t("localRefresh.never") || "Never";
  const otherSavedSources = customSourcesLibrary.filter(
    s => s?.url && s.url !== customSource?.url
  );
  const inactiveCustomLists = customLists.filter(
    list => list.id !== activeCustomList?.id
  );
  return (
    <div
      className={`${embedded ? "" : welcomeStep ? "mt-0 pt-10" : "mt-6"} ${embedded ? "" : "min-h-screen"} bg-background text-foreground`}
    >
      <div
        className={
          renderManager ? "bp-index-workflow" : "container mx-auto max-w-4xl px-4 py-8"
        }
      >
        {renderManager ? (
          renderManager({
            lastRefreshTime,
            localIndexPath,
            hasIndexBefore,
            indexInfo,
            downloadingIndex,
            indexDownloadProgress,
            customSourcesMode,
            customSource,
            customSourceGameCount,
            customSourceLastSynced,
            sourceBucketUrl,
            sourceBucketUrlDraft,
            setSourceBucketUrlDraft,
            isSyncingCustomSource,
            customSourcesLibrary,
            customLists,
            activeCustomList,
            isAuthenticated,
            settings,
            updateSetting,
            newBlacklistId,
            setNewBlacklistId,
            formatLastRefreshTime,
            handleChangeLocation,
            handleToggleCustomSourcesMode,
            handleSaveSourceBucketUrl,
            handleOpenSourceBrowser,
            handleSwitchToSavedSource,
            removeLibraryEntry,
            handleSyncCustomSource,
            setShowJsonImportDialog,
            handleSwitchToList,
            handleRenameList,
            handleDeleteList,
          })
        ) : (
          <>
            {/* First-time Setup Banner */}
            {welcomeStep && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Database className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">
                      {t("localRefresh.firstTimeSetup") ||
                        "First-Time Setup: Build Your Game Index"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {isIndexReady
                        ? t("localRefresh.setupCompleteMessage") ||
                          "Index ready! Click Continue to proceed with setup."
                        : t("localRefresh.setupInProgressMessage") ||
                          "Download or build your game index to continue setup."}
                    </p>
                  </div>
                </div>
                {isIndexReady && (
                  <Button onClick={handleBack} className="shrink-0 gap-2 text-secondary">
                    {t("localRefresh.continueSetup") || "Continue Setup"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </motion.div>
            )}

            {/* Header */}
            <div className="mb-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="-ml-2 mb-3 gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("common.back") || "Back"}
              </Button>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {t("localRefresh.title") || "Local Game Index"}
                  </h1>
                  <p className="mt-1 text-muted-foreground">
                    {t("localRefresh.description")}
                  </p>
                </div>

                {/* Index mode: official index vs. external sources */}
                <div
                  role="tablist"
                  className="inline-flex shrink-0 items-center rounded-lg bg-muted p-1"
                >
                  {[
                    {
                      custom: false,
                      Icon: Database,
                      label: t("localRefresh.ascendaraIndex") || "Ascendara Index",
                    },
                    {
                      custom: true,
                      Icon: Globe,
                      label: t("localRefresh.customSourcesMode") || "External Sources",
                    },
                  ].map(({ custom, Icon, label }) => (
                    <button
                      key={String(custom)}
                      type="button"
                      role="tab"
                      aria-selected={customSourcesMode === custom}
                      disabled={modeLocked}
                      onClick={() => {
                        if (customSourcesMode !== custom) {
                          handleToggleCustomSourcesMode(custom);
                        }
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                        customSourcesMode === custom
                          ? "bg-background text-foreground shadow"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* The API is blocked from refreshing the index and needs a hand */}
              {!customSourcesMode && indexStatus?.blocked && (
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-4",
                    relayState === "done"
                      ? "border-green-500/30 bg-green-500/10"
                      : "border-orange-500/30 bg-orange-500/10"
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {relayState === "done" ? (
                      <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {relayState === "done"
                          ? t("localRefresh.relayDone") ||
                            "Thanks, the index is up to date"
                          : t("localRefresh.relayTitle") ||
                            "The game index can't update itself right now"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {relayState === "error"
                          ? relayError ||
                            t("localRefresh.relayFailed") ||
                            "That didn't work. You can try again."
                          : relayState === "done"
                            ? t("localRefresh.relayDoneDesc") ||
                              "Everyone using Ascendara gets the update you just helped with."
                            : t("localRefresh.relayDesc") ||
                              "The game source is blocking Ascendara's server. You can help by letting Ascendara fetch the latest games from your connection. A small window may ask you to confirm you're human."}
                      </p>
                    </div>
                  </div>
                  {relayState !== "done" && (
                    <Button
                      onClick={handleHelpRefresh}
                      disabled={relayState === "running" || !!downloadingIndex}
                      className="shrink-0 gap-2 text-secondary"
                    >
                      {relayState === "running" ? (
                        <>
                          <Loader className="h-4 w-4 animate-spin" />
                          {t("localRefresh.relayRunning") || "Refreshing..."}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          {t("localRefresh.relayAction") || "Help refresh"}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* Active index overview */}
              <section className="relative overflow-hidden rounded-xl border border-border/60 bg-card">
                <div className="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-gradient-to-l from-primary/10 to-transparent" />
                <AnimatePresence>
                  {justRefreshed && (
                    <motion.div
                      key="refresh-sweep"
                      initial={{ x: "-100%", opacity: 1 }}
                      animate={{ x: "100%" }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.9, ease: "easeOut" }}
                      className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-primary/15 to-transparent"
                    />
                  )}
                </AnimatePresence>
                <div className="relative px-6 pt-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="mb-0 truncate text-xl font-semibold leading-tight">
                      {customSourcesMode
                        ? activeCustomList?.name ||
                          customSource?.name ||
                          t("localRefresh.noSourceSelected") ||
                          "No source selected"
                        : t("localRefresh.ascendaraIndex") || "Ascendara Index"}
                    </h2>
                    {customSourcesMode ? (
                      <Badge
                        variant="outline"
                        className="border-primary/40 bg-primary/10 text-[10px] uppercase tracking-wide text-primary"
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
                                className="cursor-help gap-1 border-emerald-500/40 bg-emerald-500/10 text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-300"
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    {customSourcesMode
                      ? activeCustomList
                        ? (t("localRefresh.heroDescCustomListActive") ||
                            "Browsing custom list") +
                          ` "${activeCustomList.name}" (${activeCustomList.itemCount?.toLocaleString() || 0} ${t("localRefresh.items") || "items"})`
                        : customSource?.url
                          ? t("localRefresh.heroDescCustomActive") ||
                            "Pulling games from your selected external source."
                          : t("localRefresh.heroDescCustomEmpty") ||
                            "Set a source bucket URL below to start pulling games."
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

                  {/* Stats */}
                  <div className="mt-6 flex flex-wrap items-end justify-between gap-4 pb-5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">
                        <AnimatedNumber value={heroGameCount} />
                      </span>
                      <span className="text-lg font-medium text-muted-foreground">
                        {t("localRefresh.games") || "games"}
                      </span>
                    </div>
                    <dl className="flex gap-7 pb-1.5 text-right">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {customSourcesMode
                            ? t("localRefresh.lastSynced") || "Last synced"
                            : t("localRefresh.lastRefresh") || "Last refresh"}
                        </dt>
                        <dd className="text-base font-semibold text-foreground">
                          <motion.span
                            key={lastRefreshLabel}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="inline-block"
                          >
                            {lastRefreshLabel}
                          </motion.span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {customSourcesMode
                            ? t("localRefresh.rating") || "Rating"
                            : t("localRefresh.indexUpdated") || "Index age"}
                        </dt>
                        <dd className="flex items-center justify-end gap-1 text-base font-semibold tabular-nums text-foreground">
                          {customSourcesMode ? (
                            activeCustomList ? (
                              "Not Available"
                            ) : sourceRating != null ? (
                              <>
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                {sourceRating.toFixed(1)}
                              </>
                            ) : (
                              "—"
                            )
                          ) : indexInfo?.date ? (
                            new Date(indexInfo.date).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Primary actions */}
                {(!customSourcesMode ||
                  !!customSource?.url ||
                  !!sourceBucketUrl.trim()) && (
                  <div className="relative flex flex-wrap items-center justify-end gap-3 border-t border-border/60 bg-muted/20 px-6 py-3">
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {customSourcesMode ? (
                        customSource?.url ? (
                          <>
                            <Button
                              variant="outline"
                              onClick={handleOpenSourceBrowser}
                              disabled={isSyncingCustomSource}
                              className="gap-2"
                            >
                              <Globe className="h-4 w-4" />
                              {t("localRefresh.changeSource") || "Change source"}
                            </Button>
                            <Button
                              onClick={() => handleSyncCustomSource()}
                              disabled={isSyncingCustomSource || !sourceBucketUrl.trim()}
                              className="gap-2 text-secondary"
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
                          </>
                        ) : sourceBucketUrl.trim() ? (
                          <Button
                            onClick={handleOpenSourceBrowser}
                            className="gap-2 text-secondary"
                          >
                            <Globe className="h-4 w-4" />
                            {t("localRefresh.browseSources") || "Browse sources"}
                          </Button>
                        ) : null
                      ) : (
                        <Button
                          className="min-w-[9.5rem] gap-2 overflow-hidden text-secondary"
                          onClick={async () => {
                            if (downloadingIndex) return;
                            try {
                              await window.electron.downloadSharedIndex(localIndexPath);
                            } catch (e) {
                              console.error("Failed to start download:", e);
                              toast.error(
                                t("localRefresh.indexDownloadFailed") ||
                                  "Failed to start download"
                              );
                            }
                          }}
                          disabled={!!downloadingIndex}
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={
                                downloadingIndex
                                  ? "busy"
                                  : justRefreshed
                                    ? "done"
                                    : "idle"
                              }
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ duration: 0.15 }}
                              className="inline-flex items-center gap-2"
                            >
                              {downloadingIndex ? (
                                <>
                                  <Loader className="h-4 w-4 animate-spin" />
                                  {t("localRefresh.refreshingIndex")}
                                </>
                              ) : justRefreshed ? (
                                <>
                                  <CircleCheck className="h-4 w-4" />
                                  {t("localRefresh.upToDate")}
                                </>
                              ) : (
                                <>
                                  <Cloud className="h-4 w-4" />
                                  {hasIndexBefore
                                    ? t("localRefresh.refreshNow") || "Refresh now"
                                    : t("localRefresh.getStarted") || "Get the index"}
                                </>
                              )}
                            </motion.span>
                          </AnimatePresence>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* Official index preferences */}
              {!customSourcesMode && (
                <section>
                  <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">
                    {t("localRefresh.settings") || "Settings"}
                  </h2>
                  <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
                    <SettingRow
                      icon={Calendar}
                      title={t("localRefresh.backgroundSync") || "Keep Index Up to Date"}
                      description={
                        t("localRefresh.backgroundSyncDesc") ||
                        "Ascendara checks for new games in the background and updates your index automatically"
                      }
                    >
                      <Switch
                        checked={settings?.backgroundIndexSync !== false}
                        onCheckedChange={checked =>
                          updateSetting("backgroundIndexSync", checked)
                        }
                      />
                    </SettingRow>
                  </div>
                </section>
              )}

              {/* External sources */}
              {customSourcesMode && (
                <section>
                  <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {t("localRefresh.customSourcesMode") || "External Sources"}
                    </h2>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      {t("localRefresh.experimental") || "Experimental"}
                    </Badge>
                  </div>
                  <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
                    <div className="space-y-3 px-5 py-4">
                      <p className="text-sm text-muted-foreground">
                        {t("localRefresh.customSourcesModeDesc") ||
                          "Pull games from an external source bucket of your choice instead of Ascendara's official index."}
                      </p>
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
                    </div>

                    {/* Source bucket URL */}
                    <div className="space-y-2 px-5 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-sm font-medium text-foreground">
                          {t("localRefresh.sourceBucketLabel") || "Source bucket URL"}
                        </Label>
                        <button
                          type="button"
                          onClick={() =>
                            setSourceBucketUrlDraft("https://library.hydra.wiki/")
                          }
                          className="text-xs text-primary hover:underline"
                        >
                          {t("localRefresh.sourceBucketUseRecommended") ||
                            "Use recommended"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="url"
                          inputMode="url"
                          placeholder="Bucket URL..."
                          value={sourceBucketUrlDraft}
                          onChange={e => setSourceBucketUrlDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveSourceBucketUrl(sourceBucketUrlDraft);
                            }
                          }}
                          disabled={isSyncingCustomSource}
                          className="h-9 flex-1 text-sm"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSaveSourceBucketUrl(sourceBucketUrlDraft)}
                          disabled={
                            isSyncingCustomSource ||
                            !sourceBucketUrlDraft.trim() ||
                            sourceBucketUrlDraft.trim() === sourceBucketUrl.trim()
                          }
                          className="h-9 text-secondary"
                        >
                          {t("localRefresh.sourceBucketSet") || "Set"}
                        </Button>
                        {sourceBucketUrl.trim() && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveSourceBucketUrl("")}
                            disabled={isSyncingCustomSource}
                            className="h-9"
                            title={t("common.clear") || "Clear"}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("localRefresh.sourceBucketHint") ||
                          "Paste the URL of the source collection you want to pull from. Recommended: "}
                        <span className="font-mono text-foreground">
                          https://library.hydra.wiki/
                        </span>
                      </p>
                    </div>

                    {!customSource?.url && (
                      <div className="flex flex-wrap gap-2 px-5 py-4">
                        <Button
                          onClick={handleOpenSourceBrowser}
                          disabled={!sourceBucketUrl.trim() || isSyncingCustomSource}
                          variant="outline"
                          className="flex-1 gap-2"
                        >
                          <Globe className="h-4 w-4" />
                          {t("localRefresh.browseSources") || "Browse sources"}
                        </Button>
                        <Button
                          onClick={() => setShowJsonImportDialog(true)}
                          variant="outline"
                          className="flex-1 gap-2"
                        >
                          <Upload className="h-4 w-4" />
                          {t("localRefresh.importJson") || "Import JSON Data"}
                        </Button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Saved sources */}
              {customSourcesMode && otherSavedSources.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {t("localRefresh.savedSources") || "Saved sources"}
                    </h2>
                    <span className="text-xs text-muted-foreground/70">
                      {t("localRefresh.savedSourcesHint") || "Click to switch"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {otherSavedSources.slice(0, 6).map(entry => (
                      <div
                        key={entry.url}
                        role="button"
                        tabIndex={isSyncingCustomSource ? -1 : 0}
                        aria-disabled={isSyncingCustomSource}
                        onClick={() => {
                          if (isSyncingCustomSource) return;
                          handleSwitchToSavedSource(entry);
                        }}
                        onKeyDown={e => {
                          if (isSyncingCustomSource) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSwitchToSavedSource(entry);
                          }
                        }}
                        className="group flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                      >
                        <Database className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium">{entry.name}</p>
                            {entry.torrentOnly && (
                              <span
                                title={t("localRefresh.torrentOnly") || "Torrent only"}
                                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
                              />
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {typeof entry.gameCount === "number"
                              ? `${entry.gameCount.toLocaleString()} ${t("localRefresh.games") || "games"}`
                              : entry.url}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            removeLibraryEntry(entry.url);
                          }}
                          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                          title={t("common.remove") || "Remove"}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Custom lists */}
              {customSourcesMode && (
                <section>
                  <div className="mb-2 flex items-end justify-between gap-3 px-1">
                    <div className="min-w-0">
                      <h2 className="text-sm font-medium text-muted-foreground">
                        {t("localRefresh.customLists") || "Custom Lists"}
                      </h2>
                      <p className="text-xs text-muted-foreground/70">
                        {t("localRefresh.customListsDesc") ||
                          "Create and manage your own game lists from imported JSON data."}
                      </p>
                    </div>
                    <Button
                      onClick={() => setShowJsonImportDialog(true)}
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      {t("localRefresh.importNewList") || "Import New List"}
                    </Button>
                  </div>

                  {activeCustomList && (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                      <CircleCheck className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {activeCustomList.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activeCustomList.itemCount?.toLocaleString() || 0}{" "}
                          {t("localRefresh.items") || "items"}
                        </p>
                      </div>
                      <Badge className="shrink-0 text-xs text-secondary">
                        {t("localRefresh.activeList") || "Active List"}
                      </Badge>
                    </div>
                  )}

                  {inactiveCustomLists.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {inactiveCustomLists.slice(0, 6).map(list => (
                        <div
                          key={list.id}
                          role="button"
                          tabIndex={-1}
                          onClick={() => handleSwitchToList(list)}
                          className="group flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                        >
                          <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-medium">{list.name}</p>
                              {list.format && (
                                <Badge variant="outline" className="text-[10px]">
                                  {list.format}
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {list.itemCount?.toLocaleString() || 0}{" "}
                              {t("localRefresh.items") || "items"}
                            </p>
                          </div>
                          <div className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleRenameList(list);
                              }}
                              className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                              title={t("common.rename") || "Rename"}
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleDeleteList(list);
                              }}
                              className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                              title={t("common.delete") || "Delete"}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Advanced */}
              <Accordion
                type="single"
                collapsible
                className="overflow-hidden rounded-xl border border-border/60 bg-card"
              >
                <AccordionItem value="advanced" className="border-b-0">
                  <AccordionTrigger className="px-5 py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      {t("localRefresh.advancedTitle") ||
                        t("localRefresh.settings") ||
                        "Advanced"}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="divide-y divide-border/60 border-t border-border/60">
                      {/* Storage Location */}
                      <SettingRow
                        icon={Folder}
                        title={t("localRefresh.storageLocation") || "Storage"}
                        footer={
                          <div className="flex items-center gap-2">
                            <Input
                              value={localIndexPath}
                              readOnly
                              className="h-8 flex-1 bg-muted/50 font-mono text-xs"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0 px-2"
                              onClick={handleChangeLocation}
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        }
                      />

                      {/* Blacklist */}
                      <SettingRow
                        icon={Ban}
                        title={t("localRefresh.blacklist") || "Blacklist"}
                        footer={
                          <>
                            <div className="flex items-center gap-2">
                              <Input
                                type="text"
                                placeholder="Game ID"
                                value={newBlacklistId}
                                onChange={e => setNewBlacklistId(e.target.value.trim())}
                                className="h-8 flex-1 text-xs"
                                onKeyDown={e => {
                                  if (e.key === "Enter") addBlacklistId();
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                disabled={!newBlacklistId}
                                onClick={addBlacklistId}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {settings?.blacklistIDs?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {settings.blacklistIDs.map(id => (
                                  <div
                                    key={id}
                                    className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
                                  >
                                    <span className="font-mono">{id}</span>
                                    <button
                                      onClick={() =>
                                        updateSetting(
                                          "blacklistIDs",
                                          settings.blacklistIDs.filter(i => i !== id)
                                        )
                                      }
                                      className="rounded p-0.5 hover:bg-red-500/20 hover:text-red-600 disabled:opacity-50"
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        }
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </>
        )}

        {/* External Source Bucket Browser Dialog */}
        <Dialog open={sourceBrowserOpen} onOpenChange={setSourceBrowserOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
                {t("localRefresh.sourceBrowserTitle")}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t("localRefresh.sourceBrowserDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("localRefresh.sourceBrowserSearchPlaceholder")}
                  value={bucketSearchQuery}
                  onChange={e => setBucketSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="max-h-[55vh] min-h-[200px] space-y-2 overflow-y-auto pr-1">
                {bucketSourcesLoading && (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader className="h-4 w-4 animate-spin" />
                    {t("localRefresh.sourcesLoading") || "Loading sources..."}
                  </div>
                )}
                {bucketSourcesError && !bucketSourcesLoading && (
                  <div className="mt-4 flex flex-col items-center gap-2 p-4 text-sm text-primary">
                    <AlertCircle className="h-5 w-5" />
                    <span>{bucketSourcesError}</span>
                    <Button
                      size="sm"
                      className="text-primary"
                      variant="outline"
                      onClick={fetchBucketSources}
                    >
                      {t("common.retry") || "Retry"}
                    </Button>
                  </div>
                )}
                {!bucketSourcesLoading &&
                  !bucketSourcesError &&
                  filteredBucketSources.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {t("localRefresh.sourcesNoResults") ||
                        "No sources match your search."}
                    </div>
                  )}
                {!bucketSourcesLoading &&
                  !bucketSourcesError &&
                  filteredBucketSources.map(source => {
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
                {t("localRefresh.sourcesAttribution")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-primary"
                onClick={() => setSourceBrowserOpen(false)}
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
                {t("localRefresh.torrentOnlyDialogTitle") ||
                  "This source uses torrents only"}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-muted-foreground">
                <span className="block">
                  {(torrentWarningSource?.blocked
                    ? t("localRefresh.torrentOnlyDialogBlocked") ||
                      "{{name}} only publishes magnet links, so you can't select it until torrenting is enabled in Settings."
                    : t("localRefresh.torrentOnlyDialogBody") ||
                      "{{name}} only publishes magnet links. To download anything from it you'll need to enable torrenting in Settings."
                  ).replace("{{name}}", torrentWarningSource?.name || "This source")}
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
                {t("localRefresh.torrentOnlyDialogOpenSettings") || "Open Settings"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Manual paste fallback dialog (shown when upstream returns 403) */}
        <Dialog
          open={manualPasteOpen}
          onOpenChange={open => {
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
                  <code className="flex-1 truncate font-mono text-[11px] text-foreground">
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
                className="h-56 w-full resize-none rounded-md border bg-background p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              />

              {manualPasteError && (
                <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs">
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

        {/* JSON Import Dialog */}
        <Dialog open={showJsonImportDialog} onOpenChange={setShowJsonImportDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
                {t("localRefresh.jsonImportTitle") || "Import Game JSON Data"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t("localRefresh.jsonImportDesc") ||
                  "Paste your game JSON data below. Supports both standard game formats and download list formats."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-muted bg-muted/30 p-3">
                <span className="text-sm text-muted-foreground">
                  {t("localRefresh.jsonLearnMore") ||
                    "Learn more about supported formats"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-xs text-primary"
                  onClick={() => {
                    window.electron.openURL(
                      "https://ascendara.app/docs/features/external-sources"
                    );
                  }}
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  {t("common.docs") || "Docs"}
                </Button>
              </div>

              <textarea
                value={jsonImportText}
                onChange={e => {
                  setJsonImportText(e.target.value);
                  if (jsonImportError) setJsonImportError(null);
                }}
                placeholder={
                  t("localRefresh.jsonImportPlaceholder") ||
                  'Paste your JSON data here (e.g., { "games": [...] } or { "name": "...", "downloads": [...] })'
                }
                spellCheck={false}
                className="h-56 w-full resize-none rounded-md border bg-background p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              />

              {jsonImportError && (
                <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs">
                  {jsonImportError}
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-primary"
                onClick={handlePasteJsonFromClipboard}
                disabled={isProcessingJson}
              >
                {t("localRefresh.pasteFromClipboard") || "Paste from clipboard"}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary"
                  onClick={() => setShowJsonImportDialog(false)}
                  disabled={isProcessingJson}
                >
                  {t("common.cancel") || "Cancel"}
                </Button>
                <Button
                  size="sm"
                  className="text-muted"
                  onClick={handleProcessJsonImport}
                  disabled={isProcessingJson || !jsonImportText.trim()}
                >
                  {isProcessingJson
                    ? t("localRefresh.processing") || "Processing..."
                    : t("localRefresh.processJson") || "Process JSON"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* JSON Import Confirmation Dialog */}
        <Dialog open={showJsonConfirmDialog} onOpenChange={setShowJsonConfirmDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
                {t("localRefresh.jsonConfirmTitle") || "Confirm JSON Import"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t("localRefresh.jsonConfirmDesc") ||
                  "Review the detected structure and game count before importing."}
              </DialogDescription>
            </DialogHeader>

            {jsonImportData && (
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <PencilIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">
                      {t("localRefresh.listName") || "List Name"}
                    </span>
                  </div>
                  <Input
                    value={jsonListName}
                    onChange={e => setJsonListName(e.target.value)}
                    placeholder={
                      t("localRefresh.listNamePlaceholder") ||
                      "Enter a name for this list..."
                    }
                    className="w-full"
                  />
                </Card>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Card className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Database className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">
                        {t("localRefresh.jsonDetectedFormat") || "Detected Structure"}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {jsonImportData.type === "games"
                        ? `Array: "games" (${jsonImportData.gameCount} items)`
                        : jsonImportData.type === "downloads"
                          ? `Array: "downloads" (${jsonImportData.gameCount} items)`
                          : `Object with ${jsonImportData.gameCount} items`}
                    </Badge>
                  </Card>

                  <Card className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-semibold">
                        {t("localRefresh.jsonItemCount") || "Total Items"}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-primary">
                      {jsonImportData.gameCount.toLocaleString()}
                    </div>
                  </Card>
                </div>

                <Card className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">
                      {t("localRefresh.jsonDetectedKeys") || "Detected Keys"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {jsonImportData.keys.map((key, index) => (
                      <Badge key={index} variant="outline" className="text-[10px]">
                        {key}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {t("localRefresh.jsonLearnMore") ||
                        "Learn more about supported formats"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        if (window.electron?.openURL) {
                          window.electron.openURL("https://ascendara.app/docs");
                        } else {
                          window.open("https://ascendara.app/docs", "_blank");
                        }
                      }}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" />
                      {t("common.docs") || "Docs"}
                    </Button>
                  </div>
                </Card>

                {jsonImportData.sampleGames && jsonImportData.sampleGames.length > 0 && (
                  <Card className="p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Star className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">
                        {t("localRefresh.jsonSampleItems") || "Sample Items"}
                      </span>
                    </div>
                    <div className="max-h-32 space-y-2 overflow-y-auto">
                      {jsonImportData.sampleGames.map((item, index) => (
                        <div key={index} className="border-l-2 border-muted pl-2 text-xs">
                          <div className="font-mono text-primary">
                            {jsonImportData.type === "games"
                              ? item.game || item.title || `Item ${index + 1}`
                              : item.title || item.name || `Item ${index + 1}`}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {Object.keys(item)
                              .slice(0, 3)
                              .map(key => {
                                const value = item[key];
                                let displayValue = "";

                                if (typeof value === "string") {
                                  displayValue =
                                    value.length > 30
                                      ? value.substring(0, 30) + "..."
                                      : value;
                                } else if (typeof value === "object" && value !== null) {
                                  if (key === "uris" && Array.isArray(value)) {
                                    // Special handling for URIs array - check this FIRST
                                    displayValue =
                                      value
                                        .slice(0, 2)
                                        .map(uri =>
                                          typeof uri === "string"
                                            ? uri.substring(0, 20) + "..."
                                            : "Object"
                                        )
                                        .join(", ") + (value.length > 2 ? "..." : "");
                                  } else if (Array.isArray(value)) {
                                    displayValue = `Array[${value.length}]`;
                                  } else {
                                    displayValue = `Object{${Object.keys(value).length}}`;
                                  }
                                } else {
                                  displayValue = String(value);
                                }

                                return (
                                  <span key={key} className="mr-2">
                                    {key}: {displayValue}
                                  </span>
                                );
                              })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <p className="font-medium">
                        {t("localRefresh.jsonDynamicAdapt") || "Dynamic Adaptation"}
                      </p>
                      <p className="mt-1 leading-relaxed">
                        {t("localRefresh.jsonDynamicAdaptDesc") ||
                          "Ascendara will automatically adapt to your JSON structure without requiring format conversion. The detected keys and structure will be preserved."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-primary"
                onClick={() => setShowJsonConfirmDialog(false)}
              >
                {t("common.cancel") || "Cancel"}
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmJsonImport}
                disabled={!jsonListName.trim()}
                className="bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {t("localRefresh.importJson") || "Import JSON Data"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default LocalRefresh;
