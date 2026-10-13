import GameReviews from "@/components/GameReviews";
import AscendPerks from "@/components/download/AscendPerks";
import {
  DirectoryConflictDialog,
  NewUserGuideDialog,
  NoDownloadPathDialog,
  ProviderBlockedDialog,
  QueueDialog,
  ReinstallDialog,
  SelectPathDialog,
  UpdateDialog,
  VerifiedDialog,
} from "@/components/download/DownloadDialogs";
import DownloadHero from "@/components/download/DownloadHero";
import DownloadNotices from "@/components/download/DownloadNotices";
import DownloadPanel from "@/components/download/DownloadPanel";
import GameOverview from "@/components/download/GameOverview";
import ReportGameDialog from "@/components/download/ReportGameDialog";
import SystemRequirements from "@/components/download/SystemRequirements";
import { canRetryExtraction, retryExtraction } from "@/services/extractionRetryService";
import { AlertDialog, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { sanitizeText } from "@/lib/utils";
import imageCacheService from "@/services/imageCacheService";
import steamGridImageService from "@/services/steamGridImageService";
import { cacheDownloadData } from "@/services/retryGameDownloadService";
import {
  addToQueue,
  hasActiveDownloads,
  getDownloadQueue,
} from "@/services/downloadQueueService";
import pendingLibrarySwapService from "@/services/pendingLibrarySwapService";
import { forceSyncDownloads, notifyDownloadStart } from "@/services/downloadSyncService";
import {
  Check,
  CheckIcon,
  ChevronLeft,
  Clock,
  Heart,
  Share,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import checkQbittorrentStatus from "@/services/qbittorrentCheckService";
import { toast } from "sonner";
import TimemachineDialog from "@/components/TimemachineDialog";
import steamService from "@/services/gameInfoService";
import hltbService from "@/services/hltbService";
import torboxService from "@/services/torboxService";
import {
  fetchProviderPatterns,
  getProviderPattern,
} from "@/services/providerPatternService";
import nexusModsService from "@/services/nexusModsService";
import flingTrainerService from "@/services/flingTrainerService";
import verifiedGamesService from "@/services/verifiedGamesService";
import gameService from "@/services/gameService";
import installedGamesService from "@/services/installedGamesService";
import {
  SEAMLESS_PROVIDERS,
  VERIFIED_PROVIDERS as CENTRAL_VERIFIED_PROVIDERS,
  TORBOX_PROVIDER_DISPLAY_NAMES,
} from "@/config/providers";

const LOCAL_FALLBACK_PATTERNS = {
  fileditch: /https?:\/\/(fileditchfiles\.me|fileditch\.com)\/file\.php\?f=.+/i,
  fileditchfiles: /https?:\/\/(fileditchfiles\.me|fileditch\.com)\/file\.php\?f=.+/i,
  buzzheavier:
    /^https?:\/\/(?:[a-z0-9-]+\.)?(?:bzzhr\.to|fafda\.to)\/(?:d\/)?[A-Za-z0-9]+(?:\?.*)?$/i,
  megadb: /^https?:\/\/(?:[a-z0-9-]+\.)?megadb\.(?:net|xyz)\/.+$/i,
};

// Async validation using API patterns
const isValidURL = async (url, provider, patterns) => {
  const trimmedUrl = url.trim();
  if (trimmedUrl === "") {
    return true;
  }
  const apiPattern = patterns ? getProviderPattern(provider, patterns) : null;
  const fallbackPattern = LOCAL_FALLBACK_PATTERNS[provider] || null;
  if (apiPattern?.test(trimmedUrl)) return true;
  if (fallbackPattern?.test(trimmedUrl)) return true;
  return false;
};

const sanitizeGameName = name => {
  return sanitizeText(name);
};

// Helper function to check Torbox service status for a specific provider
const checkTorboxStatus = async provider => {
  try {
    const response = await fetch("/api/torbox/webdl/hosters");
    if (!response.ok) {
      throw new Error("Failed to fetch Torbox status");
    }
    const data = await response.json();

    const torboxName = TORBOX_PROVIDER_DISPLAY_NAMES[provider.toLowerCase()];
    if (!torboxName) {
      console.log(`No TorBox mapping for provider: ${provider}`);
      return null;
    }

    // Find the hoster in the response array
    const hoster = data.data?.find(h => h.name === torboxName);
    if (hoster) {
      return {
        provider: provider,
        status: hoster.status ? "online" : "offline",
        isOnline: hoster.status === true,
      };
    }

    console.log(`Hoster ${torboxName} not found in TorBox API response`);
    return null;
  } catch (error) {
    console.error("Error checking Torbox status:", error);
    return null;
  }
};

// Helper function to check if there are active downloads
const checkActiveDownloads = async () => {
  try {
    // Check for pending download lock (prevents race condition when navigating quickly)
    const pendingDownload = localStorage.getItem("pendingDownloadLock");
    if (pendingDownload) {
      const lockTime = parseInt(pendingDownload, 10);
      // Lock expires after 10 seconds (in case of crash/error)
      if (Date.now() - lockTime < 10000) {
        return 1; // Treat as active download
      } else {
        localStorage.removeItem("pendingDownloadLock");
      }
    }

    const games = await window.electron.getGames();
    const activeDownloads = games.filter(game => {
      const { downloadingData } = game;
      return (
        downloadingData &&
        (downloadingData.downloading ||
          downloadingData.extracting ||
          downloadingData.updating)
      );
    });
    return activeDownloads.length;
  } catch (error) {
    console.error("Error checking active downloads:", error);
    return 0;
  }
};

// Set download lock before starting download
const setDownloadLock = () => {
  localStorage.setItem("pendingDownloadLock", Date.now().toString());
};

// Clear download lock (called when download actually starts or fails)
const clearDownloadLock = () => {
  localStorage.removeItem("pendingDownloadLock");
};

export default function DownloadPage() {
  const { state } = useLocation();
  const location = useLocation();
  const navigate = useNavigate();
  const [providerPatterns, setProviderPatterns] = useState(null);
  const [gameData, setGameData] = useState(state?.gameData);
  const [isUpdating, setIsUpdating] = useState(state?.gameData?.isUpdating || false);
  const { t } = useLanguage();
  const { settings, setSettings } = useSettings();
  const { isAuthenticated, userData } = useAuth();

  useEffect(() => {
    fetchProviderPatterns()
      .then(setProviderPatterns)
      .catch(err => {
        console.error("Failed to fetch provider patterns", err);
        setProviderPatterns(null);
      });
  }, []);

  // Fetch Steam API data
  const fetchSteamData = async gameName => {
    try {
      // Steam API is always available (hardcoded)
      setSteamLoading(true);
      setSteamError(null);

      try {
        const data = await steamService.getGameDetails(gameName);

        if (data) {
          setSteamData(data);
        } else {
          console.log("No game data found for:", gameData.game);
          setSteamError("No game data found");
        }
      } catch (error) {
        console.error("Error fetching game data:", error);
        setSteamError(error.message || "Error fetching game data");
      } finally {
        setSteamLoading(false);
      }
    } catch (error) {
      console.error("Error in fetchGameInfo:", error);
      setSteamLoading(false);
      setSteamError(error.message || "An unexpected error occurred");
    }
  };

  // Clear data when leaving the page
  useEffect(() => {
    return () => {
      // Only clear if we're actually navigating away from the download page
      if (!location.pathname.includes("download")) {
        // Clear all state
        setSelectedProvider("");
        setInputLink("");
        setIsStartingDownload(false);
        setShowNoDownloadPath(false);
        setCachedImage(null);
        setIsValidLink(true);
        setShowCopySuccess(false);
        setShowShareCopySuccess(false);
        setShowNewUserGuide(false);
        pendingBrowserLinkRef.current = null;

        // Remove the state from history
        window.history.replaceState({}, document.title, location.pathname);
      }
    };
  }, [location]);

  // Log and validate game data
  useEffect(() => {
    if (!gameData) {
      console.error("No game data available");
      return;
    }
    console.log("Received game data:", gameData);
  }, [gameData, navigate]);

  // Fetch Steam data when game data changes
  // Steam API is always available (hardcoded), so we always fetch
  useEffect(() => {
    if (gameData && gameData.game) {
      fetchSteamData(gameData.game);
    }
  }, [gameData]);

  // Fetch HowLongToBeat completion times
  useEffect(() => {
    setHltbData(null);
    if (!gameData?.game) return;
    let cancelled = false;
    hltbService.getGameTimes(gameData.game).then(times => {
      if (!cancelled) setHltbData(times);
    });
    return () => {
      cancelled = true;
    };
  }, [gameData?.game]);

  // State declarations
  const [selectedProvider, setSelectedProvider] = useState("");
  const [inputLink, setInputLink] = useState("");
  const [isStartingDownload, setIsStartingDownload] = useState(false);

  // When provider changes, re-validate the input link
  useEffect(() => {
    const validate = async () => {
      if (!inputLink.trim()) {
        setIsValidLink(true);
        return;
      }
      if (providerPatterns) {
        const valid = await isValidURL(inputLink, selectedProvider, providerPatterns);
        setIsValidLink(valid);
      } else {
        setIsValidLink(false);
      }
    };
    validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, providerPatterns]);
  const [useAscendara, setUseAscendara] = useState(false);
  const [showBrowserDownloadTip, setShowBrowserDownloadTip] = useState(
    () => localStorage.getItem("browser-download-tip-dismissed") !== "true"
  );
  const [isDev, setIsDev] = useState(false);
  const [showNoDownloadPath, setShowNoDownloadPath] = useState(false);
  const [cachedImage, setCachedImage] = useState(null);
  const [coverGridUrl, setCoverGridUrl] = useState(null);
  const [isValidLink, setIsValidLink] = useState(true);
  const [torrentRunning, setIsTorrentRunning] = useState(false);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [showShareCopySuccess, setShowShareCopySuccess] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [timemachineSetting, setTimemachineSetting] = useState(false);
  const [showSelectPath, setShowSelectPath] = useState(false);
  const [showTimemachineSelection, setShowTimemachineSelection] = useState(false);
  const [showNewUserGuide, setShowNewUserGuide] = useState(false);
  const pendingBrowserLinkRef = useRef(null);
  const [lastProcessedUrl, setLastProcessedUrl] = useState(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [showQueuePrompt, setShowQueuePrompt] = useState(false);
  const [pendingDownloadData, setPendingDownloadData] = useState(null);
  const [steamData, setSteamData] = useState(null);
  const [steamError, setSteamError] = useState(null);
  const [steamLoading, setSteamLoading] = useState(false);
  const [hltbData, setHltbData] = useState(null);
  const [gameRating, setGameRating] = useState(gameData?.rating || 0);
  const [writtenReviews, setWrittenReviews] = useState({ gameID: null, count: 0 });
  const reviewsRef = useRef(null);
  const [supportsModManaging, setSupportsModManaging] = useState(false);
  const [nexusGameData, setNexusGameData] = useState(null);
  const [supportsFlingTrainer, setSupportsFlingTrainer] = useState(false);
  const [flingTrainerData, setFlingTrainerData] = useState(null);
  const [isPlayLater, setIsPlayLater] = useState(() => {
    const list = JSON.parse(localStorage.getItem("play-later-games") || "[]");
    return list.some(g => g.game === state?.gameData?.game);
  });
  const [isFavorite, setIsFavorite] = useState(() => {
    const favs = JSON.parse(localStorage.getItem("game-favorites") || "[]");
    return favs.includes(state?.gameData?.game);
  });
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifiedDialog, setShowVerifiedDialog] = useState(false);
  const [torboxDisabledForSession, setTorboxDisabledForSession] = useState(false);
  const [isExternalSourcesMode, setIsExternalSourcesMode] = useState(false);
  const [antivirusWarningDismissed, setAntivirusWarningDismissed] = useState(false);
  const [isGameInstalled, setIsGameInstalled] = useState(false);
  const [showReinstallWarning, setShowReinstallWarning] = useState(false);
  const [pendingReinstallUrl, setPendingReinstallUrl] = useState(null);
  const [showProviderBlockedDialog, setShowProviderBlockedDialog] = useState(false);
  // Folder-name conflict: an existing directory with this game's name was
  // found in the target games directory before starting a new download.
  const [directoryConflict, setDirectoryConflict] = useState(null); // { path, sanitizedName, pendingArgs }
  const [conflictStep, setConflictStep] = useState("choose"); // "choose" | "confirmDelete" | "confirmMerge"
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [retainedDownload, setRetainedDownload] = useState(null);
  const [retryingExtraction, setRetryingExtraction] = useState(false);
  useEffect(() => {
    let disposed = false;
    window.electron
      .getGames()
      .then(games => {
        const match = games.find(
          game =>
            game.game === sanitizeText(gameData?.game || "") && canRetryExtraction(game)
        );
        if (!disposed) setRetainedDownload(match || null);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [gameData?.game]);
  const handleRetryRetainedExtraction = async () => {
    if (retryingExtraction || !retainedDownload) return;
    setRetryingExtraction(true);
    try {
      await retryExtraction(retainedDownload);
      navigate("/downloads");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRetryingExtraction(false);
    }
  };

  // Sync isFavorite when changed from elsewhere (e.g. Library favorites tab)
  useEffect(() => {
    if (!gameData?.game) return;
    const sync = () => {
      const favs = JSON.parse(localStorage.getItem("game-favorites") || "[]");
      setIsFavorite(favs.includes(gameData.game));
    };
    window.addEventListener("favorites-updated", sync);
    return () => window.removeEventListener("favorites-updated", sync);
  }, [gameData?.game]);

  // Load antivirus warning dismissed state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem("antivirusWarningDismissed");
    if (dismissed === "true") {
      setAntivirusWarningDismissed(true);
    }
  }, []);

  // Check if game is already installed
  useEffect(() => {
    if (!gameData?.game) return;
    installedGamesService
      .checkGameStatus(gameData.game, gameData.version)
      .then(({ isInstalled, needsUpdate }) => {
        setIsGameInstalled(isInstalled && !needsUpdate && !gameData.isUpdating);
      });
  }, [gameData?.game, gameData?.version, gameData?.isUpdating]);

  useEffect(() => {
    setGameRating(gameData?.rating || 0);
  }, [gameData?.gameID, gameData?.rating]);

  // Load when the index was last refreshed
  useEffect(() => {
    const checkIndexAge = async () => {
      try {
        const currentSettings = await window.electron.getSettings();
        const indexPath = currentSettings?.localIndex;
        if (!indexPath || !currentSettings.usingLocalIndex) return;

        if (window.electron?.getLocalRefreshProgress) {
          const progress = await window.electron.getLocalRefreshProgress(indexPath);
          if (progress?.lastSuccessfulTimestamp) {
            const lastRefresh = new Date(progress.lastSuccessfulTimestamp * 1000);
            setLastRefreshTime(lastRefresh);
          }
        }
      } catch (error) {
        console.error("Error checking index age:", error);
      }
    };

    if (settings.usingLocalIndex) {
      checkIndexAge();
    }
  }, [settings.usingLocalIndex]);

  // Check Nexus Mods support for the game
  useEffect(() => {
    const checkNexusModSupport = async () => {
      if (gameData?.game) {
        try {
          const result = await nexusModsService.checkModSupport(gameData.game);
          setSupportsModManaging(result.supported);
          setNexusGameData(result.gameData);
        } catch (error) {
          console.error("Error checking Nexus Mods support:", error);
          setSupportsModManaging(false);
        }
      }
    };

    checkNexusModSupport();
  }, [gameData?.game]);

  // Check FLiNG Trainer support for the game
  useEffect(() => {
    const checkFlingTrainerSupport = async () => {
      if (gameData?.game) {
        try {
          const result = await flingTrainerService.checkTrainerSupport(gameData.game);
          setSupportsFlingTrainer(result.supported);
          setFlingTrainerData(result.trainerData);
        } catch (error) {
          console.error("Error checking FLiNG Trainer support:", error);
          setSupportsFlingTrainer(false);
        }
      }
    };

    checkFlingTrainerSupport();
  }, [gameData?.game]);

  // Check if game is verified
  useEffect(() => {
    if (!gameData?.gameID) return;

    verifiedGamesService.loadVerifiedGames().then(() => {
      setIsVerified(verifiedGamesService.isVerified(gameData.gameID));
    });
  }, [gameData?.gameID]);

  // Check if game is in Play Later list
  useEffect(() => {
    if (!gameData?.game) return;
    const playLaterGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");
    const isInList = playLaterGames.some(g => g.game === gameData.game);
    setIsPlayLater(isInList);
  }, [gameData?.game]);

  // Check if user is in external sources mode
  useEffect(() => {
    const checkExternalSourcesMode = async () => {
      try {
        const { metadata } = await gameService.getCachedData();
        const isCustomSource = metadata?.customSource === true;
        setIsExternalSourcesMode(isCustomSource);
      } catch (error) {
        console.error("Error checking external sources mode:", error);
        setIsExternalSourcesMode(false);
      }
    };

    checkExternalSourcesMode();
  }, []);

  // Keep the whereToDownload ref in sync with the latest function
  useEffect(() => {
    whereToDownloadRef.current = whereToDownload;
  });

  // Track if autoStart has been processed
  const autoStartProcessed = useRef(false);

  // Handle autoStart for seamless downloads
  useEffect(() => {
    const startSeamlessDownload = async () => {
      if (
        state?.autoStart &&
        gameData?.download_links &&
        !isStartingDownload &&
        !autoStartProcessed.current
      ) {
        const availableHosts = Object.keys(gameData.download_links);
        const seamlessHost = availableHosts.find(host =>
          SEAMLESS_PROVIDERS.includes(host)
        );

        if (seamlessHost) {
          console.log("[AutoStart] Starting download with seamless host:", seamlessHost);
          autoStartProcessed.current = true;

          // Set the provider in state for UI display
          setSelectedProvider(seamlessHost);

          // Get the download link for this provider
          const downloadLink = gameData.download_links[seamlessHost]?.[0];
          if (downloadLink) {
            console.log(
              "[AutoStart] Provider set, waiting for state update before calling whereToDownload"
            );
            // Wait a bit for the state to update before calling whereToDownload
            // This ensures handleDownload will see the correct selectedProvider
            await new Promise(resolve => setTimeout(resolve, 200));
            console.log("[AutoStart] Calling whereToDownload with link:", downloadLink);
            // Call whereToDownload which will handle the download flow
            await whereToDownload(downloadLink);
          }
        }
      }
    };

    startSeamlessDownload();
  }, [state?.autoStart, gameData?.download_links, isStartingDownload]);

  // Handle Play Later Click
  const handlePlayLater = () => {
    const playLaterGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");

    if (isPlayLater) {
      const updatedList = playLaterGames.filter(g => g.game !== gameData.game);
      localStorage.setItem("play-later-games", JSON.stringify(updatedList));
      localStorage.removeItem(`play-later-image-${gameData.game}`);
      setIsPlayLater(false);
    } else {
      const gameToSave = {
        game: gameData.game,
        gameID: gameData.gameID,
        imgID: gameData.imgID,
        version: gameData.version,
        size: gameData.size,
        category: gameData.category,
        dlc: gameData.dlc,
        online: gameData.online,
        download_links: gameData.download_links,
        desc: gameData.desc,
        addedAt: Date.now(),
      };
      playLaterGames.push(gameToSave);
      localStorage.setItem("play-later-games", JSON.stringify(playLaterGames));
      // play-later card images are no longer cached in localStorage (quota
      // issues); they're fetched on demand via IPC / SteamGridDB instead.
      setIsPlayLater(true);
    }
    window.dispatchEvent(new CustomEvent("play-later-updated"));
  };

  const handleToggleFavorite = () => {
    const favs = JSON.parse(localStorage.getItem("game-favorites") || "[]");
    const meta = JSON.parse(localStorage.getItem("game-favorites-meta") || "{}");
    let updated;
    if (isFavorite) {
      updated = favs.filter(n => n !== gameData.game);
      delete meta[gameData.game];
    } else {
      updated = [...favs, gameData.game];
      meta[gameData.game] = {
        imgID: gameData.imgID || null,
        gameID: gameData.gameID || null,
        version: gameData.version || null,
        size: gameData.size || null,
        category: gameData.category || null,
        dlc: gameData.dlc || false,
        online: gameData.online || false,
        download_links: gameData.download_links || null,
        desc: gameData.desc || null,
      };
    }
    localStorage.setItem("game-favorites", JSON.stringify(updated));
    localStorage.setItem("game-favorites-meta", JSON.stringify(meta));
    setIsFavorite(!isFavorite);
    window.dispatchEvent(new CustomEvent("favorites-updated"));
  };

  const handleEnableProtection = async () => {
    try {
      const result = await window.electron.folderExclusion(true);
      if (result && result.success) {
        setSettings(prev => ({
          ...prev,
          excludeFolders: true,
        }));
        toast.success("Protection enabled");
      } else {
        toast.error(result?.error || "Failed to enable");
      }
    } catch (error) {
      toast.error("Failed to enable protection");
    }
  };

  const handleDismissAntivirusWarning = () => {
    setAntivirusWarningDismissed(true);
    localStorage.setItem("antivirusWarningDismissed", "true");
  };

  // Keep browser handoffs connected to the latest download options.
  const whereToDownloadRef = useRef(whereToDownload);
  const seamlessProviders = SEAMLESS_PROVIDERS;
  const VERIFIED_PROVIDERS = CENTRAL_VERIFIED_PROVIDERS;

  const pendingDirectUrl = useRef(null);
  async function whereToDownload(directUrl = null) {
    pendingDirectUrl.current = directUrl;
    console.log("[DL] whereToDownload called, directUrl:", directUrl);
    // Check if game is wanting to update
    if (gameData.isUpdating) {
      // Handle update flow
      setShowUpdatePrompt(true);
      return;
    }

    // Warn if game is already installed
    if (isGameInstalled) {
      setPendingReinstallUrl(directUrl);
      setShowReinstallWarning(true);
      return;
    }

    // Check if additional directories are set in settings
    if (settings.additionalDirectories && settings.additionalDirectories.length > 0) {
      // Show path selection dialog
      setShowSelectPath(true);
    } else {
      // No additional directories, proceed with direct download
      await handleDownload(directUrl, 0);
    }
  }

  // Resolve a detected folder-name conflict per the user's chosen action,
  // then resume the download that was paused waiting for a decision.
  async function resolveDirectoryConflict(action, { saveData = false } = {}) {
    if (!directoryConflict) return;
    const { pendingArgs, sanitizedName } = directoryConflict;

    setIsResolvingConflict(true);
    try {
      if (action === "rename") {
        const result = await window.electron.renameExistingGameDirectory(
          gameData.game,
          pendingArgs.dir || 0
        );
        if (!result?.success) {
          toast.error(t("download.toast.renameFailed"));
          return;
        }
        toast.success(t("download.toast.renamedExisting"));
      } else if (action === "delete") {
        if (saveData) {
          await window.electron.saveDeletedGameData(sanitizedName);
        }
        await window.electron.deleteGame(sanitizedName);
        toast.success(t("download.toast.deletedExisting"));
      }
      // "merge" requires no action here; the download will write into the
      // existing folder, keeping any files that aren't overwritten.

      setDirectoryConflict(null);
      setConflictStep("choose");
      await handleDownload(
        pendingArgs.directUrl,
        pendingArgs.dir,
        pendingArgs.forceStart,
        true
      );
    } catch (error) {
      console.error("Failed to resolve directory conflict:", error);
      toast.error(t("download.toast.conflictResolveFailed"));
    } finally {
      setIsResolvingConflict(false);
    }
  }

  // If the user chose to switch this game from an imported (launcher-tied) copy
  // to an Ascendara-managed download, remove the old imported entry right as the
  // real download starts, so it downloads like any other normal game from here on.
  async function consumePendingLauncherSwap(sanitizedGameName) {
    const importedGameName = pendingLibrarySwapService.take(sanitizedGameName);
    if (!importedGameName) return;
    try {
      await window.electron.removeCustomGame(importedGameName);
      toast.success(t("library.launcherImport.swapComplete", { game: gameData.game }));
    } catch (error) {
      console.warn("Could not remove imported game before swap download:", error);
    }
  }

  async function handleDownload(
    directUrl = null,
    dir = null,
    forceStart = false,
    skipConflictCheck = false
  ) {
    const downloadProvider =
      browserDirectUrl.current === directUrl && directUrl ? "direct" : selectedProvider;
    const sanitizedGameName = sanitizeText(gameData.game);
    console.log("[DL] handleDownload called", {
      directUrl,
      dir,
      forceStart,
      downloadProvider,
      sanitizedGameName,
    });
    console.log("[DL] settings.downloadDirectory:", settings.downloadDirectory);
    console.log("[DL] showNoDownloadPath:", showNoDownloadPath);
    if (showNoDownloadPath) {
      console.log("[DL] EARLY RETURN: showNoDownloadPath");
      return;
    }

    // Check if download directory is set and valid
    if (!settings.downloadDirectory || settings.downloadDirectory.trim() === "") {
      console.log("[DL] EARLY RETURN: no downloadDirectory");
      setShowNoDownloadPath(true);
      toast.error(t("download.toast.noDownloadDirectory"));
      return;
    }

    if (!gameData) {
      console.error("No game data available");
      toast.error(t("download.toast.noGameData"));
      return;
    }

    // Scan the target games directory for a folder that already has this
    // game's name (e.g. a leftover install) before starting a fresh
    // download. Skipped for update flows, which intentionally reuse the
    // existing folder, and once the user has already resolved a conflict.
    if (!skipConflictCheck && !gameData.isUpdating) {
      try {
        const conflict = await window.electron.checkGameDirectoryConflict(
          gameData.game,
          dir || 0
        );
        if (conflict?.exists) {
          setConflictStep("choose");
          setDirectoryConflict({
            path: conflict.path,
            sanitizedName: conflict.sanitizedName,
            pendingArgs: { directUrl, dir, forceStart },
          });
          return;
        }
      } catch (error) {
        console.error("Error checking game directory conflict:", error);
      }
    }

    // Check if there's an active download
    const hasActive = await hasActiveDownloads();
    console.log("[DL] hasActive:", hasActive, "isAuthenticated:", isAuthenticated);

    if (hasActive && !forceStart) {
      const isVrGame = gameData.category?.includes("Virtual Reality");
      const downloadData = {
        url: directUrl || inputLink || "",
        gameName: sanitizedGameName,
        online: gameData.online || false,
        dlc: gameData.dlc || false,
        isVr: isVrGame || false,
        updateFlow: gameData.isUpdating || false,
        version: gameData.version || "",
        imgID: gameData.imgID,
        size: gameData.size || "",
        additionalDirIndex: dir || 0,
        gameID: gameData.gameID || "",
        directUrl: directUrl,
        browserDirect: downloadProvider === "direct",
        browserAssetGameId: gameData.browserAssetGameId,
        dir: dir,
      };

      // Non-Ascend users can queue 1 download max
      if (!isAuthenticated) {
        const currentQueue = getDownloadQueue();
        if (currentQueue.length >= 1) {
          toast.error(t("download.toast.downloadQueueLimit"));
          return;
        }
        // Allow queuing 1 download
        setPendingDownloadData(downloadData);
        setShowQueuePrompt(true);
        return;
      }

      // Ascend users get the queue dialog with unlimited queue
      setPendingDownloadData(downloadData);
      setShowQueuePrompt(true);
      return;
    }

    // Handle magnet/torrent links from custom (external) sources. These come
    // through gameData.download_links.torrent = ["magnet:?xt=..."] from the
    // Hydra-compatible JSON format. They're not DDL providers, so we skip the
    // provider UI entirely and hand the magnet URI straight to the downloader.
    const isMagnet = s =>
      typeof s === "string" && s.trim().toLowerCase().startsWith("magnet:");
    const torrentLinksFromGame = Array.isArray(gameData.download_links?.torrent)
      ? gameData.download_links.torrent.filter(Boolean)
      : [];
    const isTorrentProvider =
      downloadProvider === "torrent" ||
      isMagnet(directUrl) ||
      (!downloadProvider && torrentLinksFromGame.some(isMagnet));
    const shouldUseTorboxForTorrent =
      settings.useTorboxForTorrents !== false &&
      torboxService.isEnabled(settings) &&
      !torboxDisabledForSession;

    const queueTorrentInTorbox = async magnetLink => {
      if (isStartingDownload) {
        console.log("Download already in progress, skipping");
        return { success: true };
      }

      setIsStartingDownload(true);
      toast.info(t("download.toast.processingLink"));

      try {
        const apiKey = torboxService.getApiKey(settings);
        const result = await torboxService.createTorrentFromMagnet(
          magnetLink,
          apiKey,
          gameData.game
        );
        const storageKey = result.torrentId ? `torrent:${result.torrentId}` : magnetLink;
        const torboxData = JSON.parse(localStorage.getItem("torboxGameNames") || "{}");
        const downloadData = {
          name: gameData.game,
          timestamp: Date.now(),
          imgUrl: gameData.imgID || null,
          provider: "torrent",
          torboxType: "torrent",
          originalUrl: magnetLink,
          downloadId: result.torrentId,
          gameData: {
            game: gameData.game,
            version: gameData.version || "",
            size: gameData.size || "",
            imgID: gameData.imgID || null,
            gameID: gameData.gameID || "",
            online: gameData.online || false,
            dlc: gameData.dlc || false,
            vr: gameData.category?.includes("Virtual Reality") || false,
            download_links: gameData.download_links || {},
          },
        };

        torboxData[magnetLink] = downloadData;
        torboxData[storageKey] = downloadData;
        localStorage.setItem("torboxGameNames", JSON.stringify(torboxData));

        toast.dismiss();
        toast.success(t("download.toast.downloadQueued"));
        navigate("/torboxdownloads");
        return { success: true };
      } catch (error) {
        console.error("Error processing torrent with TorBox:", error);
        toast.dismiss();
        return { success: false, error };
      } finally {
        setIsStartingDownload(false);
      }
    };

    if (isTorrentProvider) {
      const magnetLink =
        (isMagnet(directUrl) ? directUrl : null) ||
        torrentLinksFromGame.find(isMagnet) ||
        torrentLinksFromGame[0];

      if (!magnetLink) {
        console.log("[DL] EARLY RETURN: no magnet link in torrent provider");
        toast.error(t("download.toast.invalidLink"));
        return;
      }

      if (shouldUseTorboxForTorrent) {
        const torboxResult = await queueTorrentInTorbox(magnetLink);
        if (torboxResult.success) return;
        if (!settings.fallbackToQbittorrentOnTorboxFailure) {
          toast.error(
            torboxResult.error?.message || t("download.toast.torboxProcessingError")
          );
          return;
        }
        toast.info(t("download.toast.torboxTorrentFallback"));
      }

      if (!settings.torrentEnabled) {
        toast.error(
          t("download.toast.torrentDisabled") ||
            "Enable torrenting in Settings to download this game."
        );
        return;
      }

      if (!torrentRunning) {
        toast.error(
          t("download.downloadOptions.torrentInstructions.noTorrent") ||
            "qBittorrent is not running. Start qBittorrent and try again."
        );
        return;
      }

      if (isStartingDownload) {
        console.log("Download already in progress, skipping");
        return;
      }
      setIsStartingDownload(true);
      await consumePendingLauncherSwap(sanitizedGameName);
      cacheDownloadData(sanitizedGameName, gameData);

      try {
        const isVrGame = gameData.category?.includes("Virtual Reality");
        await window.electron.downloadFile(
          magnetLink,
          sanitizedGameName,
          gameData.online || false,
          gameData.dlc || false,
          isVrGame || false,
          gameData.isUpdating || false,
          gameData.version || "",
          gameData.imgID,
          gameData.size || "",
          dir,
          gameData.gameID || ""
        );

        notifyDownloadStart(sanitizedGameName, gameData.game);

        try {
          await fetch("https://api.ascendara.app/stats/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ game: gameData.game }),
          });
        } catch (error) {
          console.error("Failed to track download:", error);
        }

        const removeDownloadListener = window.electron.onDownloadProgress(
          downloadInfo => {
            if (downloadInfo.game === sanitizedGameName) {
              setIsStartingDownload(false);
              removeDownloadListener();
              forceSyncDownloads();
            }
          }
        );

        setTimeout(() => {
          toast.success(t("download.toast.torrentSent"));
          navigate("/downloads");
        }, 2500);
      } catch (error) {
        console.error("Torrent download failed:", error);
        toast.error(t("download.toast.downloadFailed"));
        setIsStartingDownload(false);
        clearDownloadLock();
      }
      return;
    }

    // Handle torrent links if Fitgirl is the source
    if (settings.gameSource === "fitgirl") {
      const torrentLink = gameData.torrentLink;
      if (torrentLink) {
        if (shouldUseTorboxForTorrent && isMagnet(torrentLink)) {
          const torboxResult = await queueTorrentInTorbox(torrentLink);
          if (torboxResult.success) return;
          if (!settings.fallbackToQbittorrentOnTorboxFailure) {
            toast.error(
              torboxResult.error?.message || t("download.toast.torboxProcessingError")
            );
            return;
          }
          toast.info(t("download.toast.torboxTorrentFallback"));
        }

        if (!settings.torrentEnabled) {
          toast.error(
            t("download.toast.torrentDisabled") ||
              "Enable torrenting in Settings to download this game."
          );
          return;
        }

        if (!torrentRunning) {
          toast.error(
            t("download.downloadOptions.torrentInstructions.noTorrent") ||
              "qBittorrent is not running. Start qBittorrent and try again."
          );
          return;
        }

        if (isStartingDownload) {
          console.log("Download already in progress, skipping");
          return;
        }

        setIsStartingDownload(true);
        await consumePendingLauncherSwap(sanitizedGameName);

        // Cache the download page data for retry functionality
        cacheDownloadData(sanitizedGameName, gameData);

        try {
          const isVrGame = gameData.category?.includes("Virtual Reality");
          await window.electron.downloadFile(
            torrentLink,
            sanitizedGameName,
            gameData.online || false,
            gameData.dlc || false,
            isVrGame || false, // isVr
            gameData.isUpdating || false, // updateFlow
            gameData.version || "",
            gameData.imgID,
            gameData.size || "",
            dir,
            gameData.gameID || ""
          );

          // Notify webapp that download started immediately
          console.log("[Download] Download initiated! Calling notifyDownloadStart");
          notifyDownloadStart(sanitizedGameName, gameData.game);

          // Track download statistics
          try {
            await fetch("https://api.ascendara.app/stats/download", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ game: gameData.game }),
            });
          } catch (error) {
            console.error("Failed to track download:", error);
          }

          // Keep isStarting true until download actually begins
          const removeDownloadListener = window.electron.onDownloadProgress(
            downloadInfo => {
              if (downloadInfo.game === sanitizedGameName) {
                setIsStartingDownload(false);
                removeDownloadListener();
                // Trigger immediate sync to monitor endpoint
                forceSyncDownloads();
              }
            }
          );

          setTimeout(() => {
            toast.success(t("download.toast.torrentSent"));
            navigate("/downloads");
          }, 2500);
        } catch (error) {
          console.error("Download failed:", error);
          toast.error(t("download.toast.downloadFailed"));
          setIsStartingDownload(false);
          clearDownloadLock();
        }
        return;
      }
    }
    // Determine if this provider should use Torbox (only if API key is configured and not disabled for session)
    const shouldUseTorbox = () =>
      torboxProviders.includes(downloadProvider) &&
      torboxService.isEnabled(settings) &&
      !torboxDisabledForSession;

    // Handle providers when TorBox is disabled for session
    // This includes both seamless providers and TorBox providers that have been disabled
    if (torboxProviders.includes(downloadProvider) && torboxDisabledForSession) {
      // If directUrl is not provided, get it from gameData
      if (!directUrl) {
        let providerLinks = gameData.download_links?.[downloadProvider] || [];
        const validProviderLink = Array.isArray(providerLinks)
          ? providerLinks.find(link => link && typeof link === "string")
          : typeof providerLinks === "string"
            ? providerLinks
            : null;

        console.log(
          "[DL] TorBox disabled - using direct link:",
          validProviderLink,
          "providerLinks:",
          providerLinks
        );
        if (!validProviderLink) {
          console.log("[DL] EARLY RETURN: no valid provider link with TorBox disabled");
          toast.error(t("download.toast.invalidLink"));
          return;
        }

        // Properly format the link
        directUrl = validProviderLink.replace(/^(?:https?:)?\/\//, "https://");
      } else {
        // directUrl provided (e.g., from extension), ensure it has proper protocol
        console.log("[DL] Using provided directUrl with TorBox disabled:", directUrl);
        directUrl = directUrl.replace(/^(?:https?:)?\/\//, "https://");
      }
    }
    // Handle seamless providers (gofile, pixeldrain) when not using Torbox
    else if (
      (downloadProvider === "gofile" || downloadProvider === "pixeldrain") &&
      !shouldUseTorbox()
    ) {
      // If directUrl is not provided, get it from gameData
      if (!directUrl) {
        let providerLinks = gameData.download_links?.[downloadProvider] || [];
        const validProviderLink = Array.isArray(providerLinks)
          ? providerLinks.find(link => link && typeof link === "string")
          : typeof providerLinks === "string"
            ? providerLinks
            : null;

        console.log(
          "[DL] seamless provider link:",
          validProviderLink,
          "providerLinks:",
          providerLinks
        );
        if (!validProviderLink) {
          console.log("[DL] EARLY RETURN: no valid seamless provider link");
          toast.error(t("download.toast.invalidLink"));
          return;
        }

        // Properly format the link
        directUrl = validProviderLink.replace(/^(?:https?:)?\/\//, "https://");
      } else {
        // directUrl provided (e.g., from extension), ensure it has proper protocol
        console.log("[DL] Using provided directUrl for seamless provider:", directUrl);
        directUrl = directUrl.replace(/^(?:https?:)?\/\//, "https://");
      }
    }

    // Handle providers using Torbox service
    if (shouldUseTorbox()) {
      // Use directUrl if provided (e.g., from extension), otherwise get from gameData
      let providerLink = directUrl;

      if (!providerLink) {
        // Get the link array and find a valid one
        const links = gameData.download_links?.[downloadProvider] || [];
        providerLink = Array.isArray(links)
          ? links.find(link => link && typeof link === "string")
          : links;
      }

      // Ensure the link has proper protocol
      if (providerLink && !providerLink.startsWith("http")) {
        providerLink = "https:" + providerLink;
      }

      if (!providerLink || !isValidLink) {
        console.log("Invalid link:", providerLink, isValidLink);
        toast.error(t("download.toast.invalidLink"));
        return;
      }

      // Check TorBox hoster status for the selected provider
      const torboxStatus = await checkTorboxStatus(downloadProvider);
      if (!torboxStatus || !torboxStatus.isOnline) {
        toast.error(t("download.toast.torboxOffline"));
        setIsStartingDownload(false);
        clearDownloadLock();
        return;
      }

      if (isStartingDownload) {
        console.log("Download already in progress, skipping");
        return;
      }

      setIsStartingDownload(true);
      toast.info(t("download.toast.processingLink"));

      try {
        console.log(`Processing ${downloadProvider} link with Torbox:`, providerLink);
        const apiKey = torboxService.getApiKey(settings);

        // Save comprehensive download data to local storage for TorboxDownloads
        try {
          // Get existing torbox data or initialize empty object
          const torboxData = JSON.parse(localStorage.getItem("torboxGameNames") || "{}");

          // Create a complete download data object with all necessary info
          const downloadData = {
            name: gameData.game,
            timestamp: Date.now(),
            imgUrl: gameData.imgID || null,
            provider: downloadProvider,
            originalUrl: providerLink,
            // Save all the necessary game data for download processing
            gameData: {
              game: gameData.game,
              version: gameData.version || "",
              size: gameData.size || "",
              imgID: gameData.imgID || null,
              online: gameData.online || false,
              dlc: gameData.dlc || false,
              download_links: gameData.download_links || {},
            },
          };

          // Store with the URL as key (will be used to match with download ID)
          torboxData[providerLink] = downloadData;

          // Save back to local storage
          localStorage.setItem("torboxGameNames", JSON.stringify(torboxData));
          console.log(
            "Saved comprehensive download data to local storage:",
            gameData.game
          );
        } catch (err) {
          console.error("Error saving download data to local storage:", err);
        }

        const result = await torboxService.getDirectDownloadLinkFromUrl(
          providerLink,
          apiKey
        );

        if (!result) {
          throw new Error("Failed to process download");
        }

        console.log("Got Torbox result:", result);

        // If we have a download ID, update the stored data with the ID for better matching
        if (result.item && result.item.id) {
          try {
            const torboxData = JSON.parse(
              localStorage.getItem("torboxGameNames") || "{}"
            );

            // Get the existing data for this URL if available
            const existingData = torboxData[providerLink] || {
              name: gameData.game,
              timestamp: Date.now(),
              imgUrl: gameData.imgID || null,
              provider: downloadProvider,
              originalUrl: providerLink,
              gameData: {
                game: gameData.game,
                version: gameData.version || "",
                size: gameData.size || "",
                imgID: gameData.imgID || null,
                online: gameData.online || false,
                dlc: gameData.dlc || false,
                download_links: gameData.download_links || {},
              },
            };

            // Create a new entry with the download ID as key
            torboxData[result.item.id] = {
              ...existingData,
              downloadId: result.item.id,
              // Add any additional data from the result
              files: result.item.files || [],
              status: result.item.status || result.status || "unknown",
              size: result.item.size || existingData.gameData.size || "",
            };

            localStorage.setItem("torboxGameNames", JSON.stringify(torboxData));
            console.log("Updated download data with ID:", result.item.id);
          } catch (err) {
            console.error("Error updating download data with ID:", err);
          }
        }

        // Check if the download is cached and ready
        if (result.status === "ready" && result.item) {
          toast.dismiss();
          toast.success(t("download.toast.linkProcessed"));

          // If we have a direct URL, use it
          if (result.url) {
            directUrl = result.url;
          } else {
            // Otherwise redirect to TorboxDownloads page
            toast.info(t("download.toast.downloadReady"));
            navigate("/torboxdownloads");
            setIsStartingDownload(false);
            return;
          }
        } else {
          // Download is not cached yet, redirect to TorboxDownloads page
          toast.dismiss();
          toast.info(t("download.toast.downloadQueued"));
          navigate("/torboxdownloads");
          setIsStartingDownload(false);
          return;
        }
      } catch (error) {
        console.error(`Error processing ${downloadProvider} link with Torbox:`, error);
        toast.dismiss();
        toast.error(
          error?.code === "UNSUPPORTED_SITE"
            ? t("download.toast.torboxUnsupportedSite", {
                provider: downloadProvider,
              })
            : t("download.toast.torboxProcessingError")
        );
        setIsStartingDownload(false);
        return;
      }
    }

    // For manual downloads with other providers, check if we have a valid link
    else if (!directUrl) {
      if (!downloadProvider) {
        console.log("[DL] EARLY RETURN: no provider selected");
        return;
      }
      if (!inputLink || !isValidLink) {
        console.log(
          "[DL] EARLY RETURN: inputLink:",
          inputLink,
          "isValidLink:",
          isValidLink
        );
        return;
      }
    }

    if (isStartingDownload) {
      console.log("Download already in progress, skipping");
      return;
    }

    const urlToUse = directUrl || inputLink;
    console.log("Starting download with URL:", urlToUse);

    setIsStartingDownload(true);
    await consumePendingLauncherSwap(sanitizedGameName);

    // Cache the download page data for retry functionality
    cacheDownloadData(sanitizedGameName, gameData);

    try {
      const isVrGame = gameData.category?.includes("Virtual Reality");

      await window.electron.downloadFile(
        urlToUse,
        sanitizedGameName,
        gameData.online || false,
        gameData.dlc || false,
        isVrGame || false,
        gameData.isUpdating || false,
        gameData.version || "",
        gameData.imgID,
        gameData.size || "",
        dir,
        gameData.gameID || "",
        downloadProvider === "direct",
        gameData.browserAssetGameId
      );

      // Notify webapp that download started immediately
      console.log("[Download] Download initiated! Calling notifyDownloadStart");
      notifyDownloadStart(sanitizedGameName, gameData.game);

      // Track download statistics
      try {
        await fetch("https://api.ascendara.app/stats/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: gameData.game }),
        });
      } catch (error) {
        console.error("Failed to track download:", error);
      }

      // Listen for binary spawn errors (async, fires after handler returns)
      const removeErrorListener = window.electron.onDownloadError(errData => {
        if (errData.game === sanitizedGameName) {
          console.error("[Download] download-error received:", errData.error);
          toast.error(`Download failed: ${errData.error}`);
          setIsStartingDownload(false);
          clearDownloadLock();
          removeErrorListener();
        }
      });

      // Keep isStarting true until download actually begins
      const removeDownloadListener = window.electron.onDownloadProgress(downloadInfo => {
        console.log(
          "[Download] Progress event received:",
          downloadInfo.game,
          "Looking for:",
          sanitizedGameName
        );
        if (downloadInfo.game === sanitizedGameName) {
          console.log("[Download] Download progress detected");
          setIsStartingDownload(false);
          removeDownloadListener();
          removeErrorListener();
          // Trigger immediate sync to monitor endpoint
          forceSyncDownloads();
        }
      });

      setTimeout(() => {
        toast.success(t("download.toast.downloadStarted"));
        navigate("/downloads");
      }, 2500);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error(t("download.toast.downloadFailed"));
      setIsStartingDownload(false);
      clearDownloadLock();
    }
  }

  useEffect(() => {
    const checkQbittorrent = async () => {
      if (settings.torrentEnabled) {
        const status = await checkQbittorrentStatus();
        setIsTorrentRunning(status.active);
      }
    };
    checkQbittorrent();
  }, [t, settings.torrentEnabled]);

  useEffect(() => {
    const checkDevMode = async () => {
      const isDevMode = await window.electron.isDev();
      setIsDev(isDevMode);
    };
    checkDevMode();
  }, []);

  const browserDirectUrl = useRef(null);
  const handledBrowserRequest = useRef(null);
  useEffect(() => {
    const receive = async request => {
      if (!request?.url || handledBrowserRequest.current === request.id) return;
      handledBrowserRequest.current = request.id;
      browserDirectUrl.current = request.url;
      setInputLink(request.url);
      setIsValidLink(true);
      await whereToDownloadRef.current(request.url);
    };
    if (state?.browserDownload) {
      void receive(state.browserDownload).catch(() =>
        toast.error(t("download.toast.downloadFailed"))
      );
      navigate(location.pathname, {
        replace: true,
        state: { ...state, browserDownload: undefined },
      });
    }
  }, [state, location.pathname, navigate, t]);

  // Intercepted download URL listener effect - handles downloads captured from the
  // external browser window used for Buzzheavier/SteamRIP referrer spoofing.
  // This intentionally does not gate on providerPatterns; if the API patterns fail
  // to load, we fall back to the local fallback patterns so the download still
  // starts automatically.
  useEffect(() => {
    let isMounted = true;

    const handler = async (event, url) => {
      if (!url?.startsWith("ascendara://") || !isMounted) {
        return;
      }

      try {
        const encodedUrl = url.replace("ascendara://", "");
        const decodedUrl = decodeURIComponent(encodedUrl);
        const cleanUrl = decodedUrl.endsWith("/") ? decodedUrl.slice(0, -1) : decodedUrl;

        if (cleanUrl === lastProcessedUrl) {
          console.log("Ignoring duplicate intercepted URL:", cleanUrl);
          return;
        }
        setLastProcessedUrl(cleanUrl);

        console.log("Handling intercepted download URL:", cleanUrl);
        for (const provider of VERIFIED_PROVIDERS) {
          const patternsToUse = providerPatterns || LOCAL_FALLBACK_PATTERNS;
          const valid = await isValidURL(cleanUrl, provider, patternsToUse);
          if (valid) {
            console.log("Intercepted URL matched provider:", provider);
            setSelectedProvider(provider);
            setInputLink(cleanUrl);
            setIsValidLink(true);
            await whereToDownloadRef.current(cleanUrl);
            return;
          }
        }
        console.log("No provider matched intercepted URL:", cleanUrl);
        toast.error(t("download.toast.invalidLink"));
      } catch (error) {
        console.error("Error handling intercepted download URL:", error);
        toast.error(t("download.toast.invalidProtocolUrl"));
      }
    };

    const unsubscribe = window.electron.onInterceptedDownloadUrl(handler);
    return () => {
      isMounted = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const removeListener = window.electron.onExternalWindowBlocked(() => {
      setShowProviderBlockedDialog(true);
    });
    return () => removeListener && removeListener();
  }, []);

  useEffect(() => {
    setTimemachineSetting(settings.showOldDownloadLinks);
  }, [settings.showOldDownloadLinks]);

  useEffect(() => {
    window.scrollTo(0, 0);
    const loadCachedImage = async () => {
      if (gameData?.imgID) {
        const image = await imageCacheService.getImage(gameData.imgID);
        setCachedImage(image);
        return;
      }
      // Fallback: custom-source games (no imgID) -> resolve SteamGrid cover by name
      if (gameData?.game) {
        const peeked = steamGridImageService.peek(gameData.game);
        if (peeked) {
          setCachedImage(steamGridImageService.pickUrl(peeked, "hero"));
          return;
        }
        const assets = await steamGridImageService.getAssets(gameData.game);
        setCachedImage(steamGridImageService.pickUrl(assets, "hero"));
      }
    };
    // Resolve a portrait SteamGridDB cover (600x900) for the detail-page cover
    // slot. SGDB is the primary art source; Steam header_image is the fallback
    // and is applied directly at render time if this comes back null.
    const loadCoverGrid = async () => {
      if (!gameData?.game) return;
      try {
        const full = await steamGridImageService.getFullAssets(gameData.game);
        if (full?.grid) {
          setCoverGridUrl(full.grid);
        }
      } catch (e) {
        // Silent: Steam cover fallback renders automatically
      }
    };
    loadCoverGrid();
    loadCachedImage();
    checkDownloadPath();
  }, [gameData, navigate]);

  useEffect(() => {
    const savedPreference = localStorage.getItem("useAscendara");
    if (savedPreference !== null) {
      setUseAscendara(JSON.parse(savedPreference));
    }
  }, []);

  const checkDownloadPath = async () => {
    try {
      if (!settings.downloadDirectory) {
        setShowNoDownloadPath(true);
      }
    } catch (error) {
      console.error("Error getting settings:", error);
    }
  };
  const handleInputChange = async e => {
    const newLink = e.target.value;
    setInputLink(newLink);

    if (newLink.trim() === "") {
      setIsValidLink(true);
      return;
    }

    // Try to detect provider from URL if none selected
    if (!selectedProvider) {
      for (const provider of VERIFIED_PROVIDERS) {
        if (providerPatterns) {
          const valid = await isValidURL(newLink, provider, providerPatterns);
          if (valid) {
            setSelectedProvider(provider);
            setIsValidLink(true);
            return;
          }
        }
      }
    }

    if (providerPatterns) {
      const valid = await isValidURL(newLink, selectedProvider, providerPatterns);
      setIsValidLink(valid);
    } else {
      setIsValidLink(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = event => {
      // This page can stay mounted while hidden (e.g. behind the persistent
      // Search page), so only react to Escape while /download is the active route.
      if (event.key === "Escape" && location.pathname === "/download") {
        navigate(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, location.pathname]);

  const openBrowserLink = ({ link, needsReferrerSpoofing }) => {
    if (needsReferrerSpoofing) {
      return window.electron.openURL(link, { referrer: "https://steamrip.com/" });
    }
    return window.electron.openURL(link);
  };

  const handleCloseGuide = () => {
    setShowNewUserGuide(false);
    if (pendingBrowserLinkRef.current) {
      const pendingLink = pendingBrowserLinkRef.current;
      pendingBrowserLinkRef.current = null;
      openBrowserLink(pendingLink);
    }
  };

  const checkIfNewUser = async () => {
    if (!settings.downloadDirectory) {
      return true;
    }
    const games = await window.electron.getGames();
    return games.length === 0;
  };

  const handleCopyLink = async () => {
    let link = downloadLinks[selectedProvider][0].startsWith("//")
      ? `https:${downloadLinks[selectedProvider][0]}`
      : downloadLinks[selectedProvider][0];
    await navigator.clipboard.writeText(link);
    setShowCopySuccess(true);
    setTimeout(() => setShowCopySuccess(false), 1000);

    const isNewUser = await checkIfNewUser();
    if (isNewUser) {
      setShowNewUserGuide(true);
    }
  };

  const handleOpenInBrowser = async () => {
    let link = downloadLinks[selectedProvider][0].startsWith("//")
      ? `https:${downloadLinks[selectedProvider][0]}`
      : downloadLinks[selectedProvider][0];

    const needsReferrerSpoofing =
      selectedProvider.toLowerCase() === "buzzheavier" ||
      selectedProvider.toLowerCase() === "megadb" ||
      /bzzhr\.(?:to|co)|buzzheavier|fafda\.to|fuckingfast\.(?:net|co)|megadb\.net/i.test(
        link
      );

    const browserLink = { link, needsReferrerSpoofing };
    if (await checkIfNewUser()) {
      pendingBrowserLinkRef.current = browserLink;
      setShowNewUserGuide(true);
    } else {
      await openBrowserLink(browserLink);
    }
  };

  const handleShareLink = async () => {
    const shareLink = `https://ascendara.app/game/${gameData.gameID}`;
    await navigator.clipboard.writeText(shareLink);
    setShowShareCopySuccess(true);
    setTimeout(() => setShowShareCopySuccess(false), 2000);
  };

  const downloadLinks = gameData?.download_links || {};
  const hasProviders = Object.keys(downloadLinks).length > 0;

  const providers = hasProviders
    ? Object.entries(downloadLinks)
        .filter(([provider, links]) => {
          if (!Array.isArray(links)) return false;
          if (links.length === 0) return false;
          const hasValidLink = links.some(
            link => typeof link === "string" && link.length > 0
          );
          if (!hasValidLink) return false;
          if (provider === "torrent") {
            const hasMagnet = links.some(
              link =>
                typeof link === "string" &&
                link.trim().toLowerCase().startsWith("magnet:")
            );
            return (
              hasMagnet &&
              (!!settings.torrentEnabled ||
                (settings.useTorboxForTorrents !== false &&
                  torboxService.isEnabled(settings)))
            );
          }
          return true;
        })
        .map(([provider]) => provider)
    : [];

  const prioritizeTorbox = settings.prioritizeTorboxOverSeamless;
  const torboxProviders = prioritizeTorbox ? providers : ["1fichier", "megadb"];

  console.log("Final Available Providers:", providers);

  useEffect(() => {
    if (gameData?.download_links) {
      const availableProviders = Object.keys(gameData.download_links).filter(
        provider => gameData.download_links[provider]?.length > 0
      );
      const ddlProviders = availableProviders.filter(p => p !== "torrent");

      if (ddlProviders.includes("gofile")) {
        setSelectedProvider("gofile");
      } else if (ddlProviders.includes("buzzheavier")) {
        setSelectedProvider("buzzheavier");
      } else if (torboxService.isEnabled(settings) && ddlProviders.includes("1fichier")) {
        setSelectedProvider("1fichier");
      } else if (ddlProviders.length > 0) {
        setSelectedProvider(ddlProviders[0]);
      } else if (
        availableProviders.includes("torrent") &&
        (settings.torrentEnabled ||
          (settings.useTorboxForTorrents !== false && torboxService.isEnabled(settings)))
      ) {
        setSelectedProvider("torrent");
      } else {
        setSelectedProvider("");
      }
    } else {
      setSelectedProvider("");
    }
  }, [
    gameData,
    settings.prioritizeTorboxOverSeamless,
    settings.torboxApiKey,
    settings.torrentEnabled,
  ]);

  if (gameData && gameData.game) {
    gameData.game = sanitizeGameName(gameData.game);
  }

  if (!gameData) {
    return (
      <div className="container mx-auto max-w-7xl p-6">
        <AlertDialog variant="destructive">
          <AlertDialogDescription>
            {t("download.toast.noGameData")}
          </AlertDialogDescription>
        </AlertDialog>
      </div>
    );
  }

  // Which download flow the panel shows for the selected provider
  const torboxEnabled = torboxService.isEnabled(settings);
  const torboxAvailable =
    torboxProviders.includes(selectedProvider) &&
    torboxEnabled &&
    !!torboxService.getApiKey(settings);
  const downloadMode =
    settings.gameSource === "fitgirl" && gameData.torrentLink
      ? "fitgirl"
      : selectedProvider === "torrent"
        ? "torrent"
        : torboxAvailable ||
            seamlessProviders.includes(selectedProvider) ||
            selectedProvider === "buzzheavier" ||
            selectedProvider === "megadb"
          ? "seamless"
          : "manual";

  const rawProviderLink = downloadLinks[selectedProvider]?.[0];
  const providerLink = rawProviderLink?.startsWith("//")
    ? `https:${rawProviderLink}`
    : rawProviderLink;

  const steamCover = steamData?.cover
    ? steamService.formatImageUrl(steamData.cover.url, "cover_big")
    : null;
  const bannerImage = steamData?.screenshots?.[0]
    ? steamService.formatImageUrl(steamData.screenshots[0].url, "screenshot_huge")
    : cachedImage;

  return (
    <div className="mx-auto w-full max-w-7xl pb-8 pt-4 fade-in">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.back")}
          <kbd className="rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium leading-none">
            Esc
          </kbd>
        </Button>

        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={
                    isFavorite
                      ? "text-primary hover:bg-primary/10 hover:text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }
                  onClick={handleToggleFavorite}
                >
                  <Heart className={`h-4 w-4 ${isFavorite ? "fill-primary" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-secondary">
                  {isFavorite
                    ? t("library.favoritesGallery.removeFromFavorites") ||
                      "Remove from favorites"
                    : t("library.filters.favorites.label") || "Add to favorites"}
                </p>
              </TooltipContent>
            </Tooltip>

            <Button
              variant="ghost"
              size="sm"
              className={`gap-1.5 ${
                isPlayLater
                  ? "text-primary hover:bg-primary/10 hover:text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={handlePlayLater}
            >
              {isPlayLater ? (
                <Check className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              {isPlayLater ? t("gameCard.addedToPlayLater") : t("gameCard.playLater")}
            </Button>

            {gameData.gameID && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={handleShareLink}
                  >
                    {showShareCopySuccess ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        {t("download.linkCopied")}
                      </>
                    ) : (
                      <Share className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-secondary">{t("download.shareGame")}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {settings.gameSource !== "fitgirl" && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setShowReportDialog(true)}
              >
                <TriangleAlert className="h-4 w-4" />
                {t("download.reportBroken")}
              </Button>
            )}
          </div>
        </TooltipProvider>
      </div>

      <div className="space-y-6">
        <DownloadNotices
          showRetryExtraction={!!retainedDownload}
          retryingExtraction={retryingExtraction}
          onRetryExtraction={handleRetryRetainedExtraction}
          isGameInstalled={isGameInstalled}
          onGoToLibrary={() => navigate("/library")}
          showAntivirusWarning={
            gameData.online &&
            !settings.excludeFolders &&
            !antivirusWarningDismissed &&
            window.electron.getPlatform() === "win32"
          }
          onEnableProtection={handleEnableProtection}
          onDismissAntivirusWarning={handleDismissAntivirusWarning}
        />

        {/* Game on the left, everything needed to download it on the right */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr]">
          <div className="min-w-0 lg:col-start-1">
            <DownloadHero
              gameData={gameData}
              bannerImage={bannerImage}
              coverImage={coverGridUrl || steamCover}
              coverFallback={steamCover}
              isVerified={isVerified}
              onShowVerified={() => setShowVerifiedDialog(true)}
              gameRating={gameRating}
              hasWrittenReviews={
                writtenReviews.gameID === gameData.gameID && writtenReviews.count > 0
              }
              onReadReviews={() =>
                reviewsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              steamRating={steamData?.rating ? (steamData.rating / 10).toFixed(1) : null}
              releaseDate={steamData?.release_date}
              hltbData={hltbData}
              showTimemachine={timemachineSetting}
              onOpenTimemachine={() => setShowTimemachineSelection(true)}
            />
          </div>

          <aside className="min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <DownloadPanel
              mode={downloadMode}
              gameData={gameData}
              settings={settings}
              providers={providers}
              selectedProvider={selectedProvider}
              onProviderChange={setSelectedProvider}
              torboxEnabled={torboxEnabled}
              torboxAvailable={torboxAvailable}
              torboxDisabledForSession={torboxDisabledForSession}
              onTorboxDisabledChange={setTorboxDisabledForSession}
              torrentRunning={torrentRunning}
              isStartingDownload={isStartingDownload}
              isDev={isDev}
              providerLink={providerLink}
              showCopySuccess={showCopySuccess}
              onCopyLink={handleCopyLink}
              onOpenInBrowser={handleOpenInBrowser}
              useAscendara={useAscendara}
              onUseAscendaraChange={checked => {
                setUseAscendara(checked);
                localStorage.setItem("useAscendara", JSON.stringify(checked));
              }}
              inputLink={inputLink}
              onInputChange={handleInputChange}
              isValidLink={isValidLink}
              onDownload={() => whereToDownload()}
              canRetryBrowserLink={!!browserDirectUrl.current}
              onRetryBrowserLink={() => whereToDownload(browserDirectUrl.current)}
              showBrowserDownloadTip={showBrowserDownloadTip}
              onBrowserDownloadTipChange={show => {
                setShowBrowserDownloadTip(show);
                if (show) {
                  localStorage.removeItem("browser-download-tip-dismissed");
                } else {
                  localStorage.setItem("browser-download-tip-dismissed", "true");
                }
              }}
            />
            <SystemRequirements minReqs={gameData.minReqs} />
            <AscendPerks
              gameName={gameData.game}
              isAuthenticated={isAuthenticated}
              hasSubscription={!!userData?.ascendSubscription?.active}
              supportsModManaging={supportsModManaging}
              supportsFlingTrainer={supportsFlingTrainer}
              supportsAutoUpdates={
                providers.some(p => seamlessProviders.includes(p)) &&
                !isExternalSourcesMode
              }
              onGetAscend={() => navigate("/ascend")}
            />
          </aside>

          <div className="min-w-0 space-y-6 lg:col-start-1">
            <GameOverview
              gameData={gameData}
              steamData={steamData}
              steamLoading={steamLoading}
              steamError={steamError}
            />
            <GameReviews
              key={gameData.gameID}
              gameID={gameData.gameID}
              onRating={setGameRating}
              onReviewCount={setWrittenReviews}
              sectionRef={reviewsRef}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ReportGameDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        gameData={gameData}
        useV2={!!(settings.usingLocalIndex && gameData.gameID)}
      />

      <TimemachineDialog
        gameData={gameData}
        onVersionSelect={version => setGameData(version)}
        open={showTimemachineSelection}
        onOpenChange={setShowTimemachineSelection}
      />

      <VerifiedDialog open={showVerifiedDialog} onOpenChange={setShowVerifiedDialog} />

      <NewUserGuideDialog
        open={showNewUserGuide}
        onClose={handleCloseGuide}
        onFinish={() => {
          setSettings({ downloadHandler: true })
            .then(() => {
              handleCloseGuide();
            })
            .catch(error => {
              console.error("Failed to save settings:", error);
            });
        }}
      />

      <ProviderBlockedDialog
        open={showProviderBlockedDialog}
        onOpenChange={setShowProviderBlockedDialog}
      />

      <NoDownloadPathDialog
        open={showNoDownloadPath}
        onOpenChange={setShowNoDownloadPath}
        onGoToSettings={() => {
          setShowNoDownloadPath(false);
          navigate("/settings");
        }}
      />

      <UpdateDialog
        open={showUpdatePrompt}
        onOpenChange={setShowUpdatePrompt}
        gameName={gameData.game}
        onConfirm={() => {
          setShowUpdatePrompt(false);
          handleDownload(pendingDirectUrl.current);
        }}
      />

      <ReinstallDialog
        open={showReinstallWarning}
        onOpenChange={setShowReinstallWarning}
        onGoToLibrary={() => {
          setShowReinstallWarning(false);
          navigate("/library");
        }}
        onContinue={() => {
          setShowReinstallWarning(false);
          setIsGameInstalled(false);
          if (
            settings.additionalDirectories &&
            settings.additionalDirectories.length > 0
          ) {
            setShowSelectPath(true);
          } else {
            handleDownload(pendingReinstallUrl, 0);
          }
        }}
      />

      <SelectPathDialog
        open={showSelectPath}
        onOpenChange={setShowSelectPath}
        defaultDirectory={settings.downloadDirectory}
        additionalDirectories={settings.additionalDirectories}
        onSelect={dirIndex => {
          handleDownload(pendingDirectUrl.current, dirIndex);
          setShowSelectPath(false);
        }}
      />

      <DirectoryConflictDialog
        conflict={directoryConflict}
        step={conflictStep}
        onStepChange={setConflictStep}
        busy={isResolvingConflict}
        gameName={gameData.game}
        onResolve={resolveDirectoryConflict}
        onDismiss={() => {
          setDirectoryConflict(null);
          setConflictStep("choose");
        }}
      />

      <QueueDialog
        open={showQueuePrompt}
        onOpenChange={setShowQueuePrompt}
        isAuthenticated={isAuthenticated}
        onCancel={() => {
          setShowQueuePrompt(false);
          setPendingDownloadData(null);
        }}
        onAddToQueue={() => {
          if (pendingDownloadData) {
            addToQueue(pendingDownloadData);
            toast.success(t("download.toast.downloadQueued"));
          }
          setShowQueuePrompt(false);
          setPendingDownloadData(null);
        }}
        onStartNow={() => {
          setShowQueuePrompt(false);
          if (pendingDownloadData) {
            handleDownload(pendingDownloadData.directUrl, pendingDownloadData.dir, true);
          }
          setPendingDownloadData(null);
        }}
      />
    </div>
  );
}
