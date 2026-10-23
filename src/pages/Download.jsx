import GameReviews from "@/components/GameReviews";
import PrivateGameDetails from "@/components/download/PrivateGameDetails";
import AscendPerks from "@/components/download/AscendPerks";
import {
  ExistingInstallDialog,
  NewUserGuideDialog,
  NoDownloadPathDialog,
  ProviderBlockedDialog,
  QueueDialog,
  SelectPathDialog,
  UpdateDialog,
  VerifiedDialog,
} from "@/components/download/DownloadDialogs";
import DownloadHero from "@/components/download/DownloadHero";
import DownloadToolbar from "@/components/download/DownloadToolbar";
import DownloadNotices from "@/components/download/DownloadNotices";
import DownloadPanel from "@/components/download/DownloadPanel";
import GameOverview from "@/components/download/GameOverview";
import ReportGameDialog, {
  hasReportedGame,
} from "@/components/download/ReportGameDialog";
import ArtworkCorrectionDialog, {
  hasCorrectedArtwork,
} from "@/components/download/ArtworkCorrectionDialog";
import SystemRequirements from "@/components/download/SystemRequirements";
import {
  canRetryExtraction,
  retryExtraction,
} from "@/services/downloads/extractionRetryService";
import { AlertDialog, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { sanitizeText } from "@/lib/utils";
import { useGameViews } from "@/hooks/useGameViews";
import imageCacheService from "@/services/images/imageCacheService";
import steamGridImageService from "@/services/images/steamGridImageService";
import artworkOverrideService from "@/services/images/artworkOverrideService";
import gamePagePreparer from "@/services/games/gamePagePreparer";
import { cacheDownloadData } from "@/services/downloads/retryGameDownloadService";
import {
  addToQueue,
  hasActiveDownloads,
  getDownloadQueue,
} from "@/services/downloads/downloadQueueService";
import pendingLibrarySwapService from "@/services/downloads/pendingLibrarySwapService";
import {
  forceSyncDownloads,
  notifyDownloadStart,
} from "@/services/ascend/downloadSyncService";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import checkQbittorrentStatus from "@/services/downloads/qbittorrentCheckService";
import { Loader, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import HighballCompatibility, {
  useHighballCompat,
} from "@/components/HighballCompatibility";
import { toast } from "sonner";
import { checkInstallSpace } from "@/lib/installSpace";
import { formatBytes } from "@/services/app/systemHealthService";
import TimemachineDialog from "@/components/TimemachineDialog";
import steamService from "@/services/games/gameInfoService";
import hltbService from "@/services/integrations/hltbService";
import torboxService from "@/services/downloads/torboxService";
import {
  fetchProviderPatterns,
  getProviderPattern,
} from "@/services/downloads/providerPatternService";
import nexusModsService from "@/services/integrations/nexusModsService";
import flingTrainerService from "@/services/integrations/flingTrainerService";
import verifiedGamesService from "@/services/games/verifiedGamesService";
import gameService from "@/services/games/gameService";
import installedGamesService from "@/services/library/installedGamesService";
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
  return state?.gameData?.privateSource ? (
    <PrivateGameDetails initialGame={state.gameData} />
  ) : (
    <PublicDownloadPage />
  );
}

function PublicDownloadPage() {
  const { state } = useLocation();
  const location = useLocation();
  const navigate = useNavigate();
  const [providerPatterns, setProviderPatterns] = useState(null);
  const [gameData, setGameData] = useState(state?.gameData);
  // The live entry, kept while an older Time Machine version is being viewed
  const [latestGameData, setLatestGameData] = useState(null);
  const [isUpdating, setIsUpdating] = useState(state?.gameData?.isUpdating || false);
  const { t } = useLanguage();
  const { settings, setSettings } = useSettings();
  const { isAuthenticated, userData } = useAuth();

  const handleBack = () => {
    if (
      window.history.state &&
      typeof window.history.state.idx === "number" &&
      window.history.state.idx > 0
    ) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  useEffect(() => {
    if (state?.gameData) {
      setGameData(state.gameData);
      setLatestGameData(null);
      setIsUpdating(state.gameData.isUpdating || false);
    }
  }, [state?.gameData]);

  const handleTimemachineSelect = release => {
    const latest = latestGameData || gameData;
    if (release.live) {
      setGameData(latest);
      setLatestGameData(null);
      return;
    }
    setLatestGameData(latest);
    // Older entries can predate gameIDs and use other covers, so the page keeps
    // the live game's identity and only takes what belongs to that version
    setGameData({
      ...latest,
      ...release.game,
      gameID: latest.gameID,
      game: latest.game,
      imgID: latest.imgID,
      storyOnly: latest.storyOnly,
      hasHistory: true,
    });
  };

  const handleBackToLatest = () => {
    if (!latestGameData) return;
    setGameData(latestGameData);
    setLatestGameData(null);
    toast.success(t("download.timemachine.backToLatestToast"), {
      description: latestGameData.version || undefined,
      duration: 3000,
    });
  };

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
  // Set when the opening card already resolved this page's artwork and info
  const [initialPrepared] = useState(() => gamePagePreparer.peek(state?.gameData));
  // False while the page holds back to gather its artwork, so nothing swaps in view
  const [pagePrepared, setPagePrepared] = useState(!!initialPrepared || !state?.gameData);
  const [cachedImage, setCachedImage] = useState(initialPrepared?.cachedImage ?? null);
  const [coverGridUrl, setCoverGridUrl] = useState(initialPrepared?.coverGridUrl ?? null);
  // Approved community artwork correction; wins over name-matched artwork
  const [artworkOverride, setArtworkOverride] = useState(
    initialPrepared?.override ?? null
  );
  // False until we know whether an override exists, so the wrong art never flashes
  const [artworkReady, setArtworkReady] = useState(true);
  const [showArtworkDialog, setShowArtworkDialog] = useState(false);
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
  const [steamData, setSteamData] = useState(initialPrepared?.steamData ?? null);
  // Apple Silicon: how this game runs through Highball, and whether to warn first
  const macCompat = useHighballCompat({
    steamAppId: steamData?.appid,
    title: gameData?.game,
  });
  const [pendingCompatDownload, setPendingCompatDownload] = useState(null);
  const compatAcknowledgedRef = useRef(false);
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
  // Read-only: the ref is never attached, so opening this page does not count a view
  const [, viewCount] = useGameViews(gameData?.gameID, !gameData?.privateSource);
  const [showVerifiedDialog, setShowVerifiedDialog] = useState(false);
  const [torboxDisabledForSession, setTorboxDisabledForSession] = useState(false);
  const [isExternalSourcesMode, setIsExternalSourcesMode] = useState(false);
  const [antivirusWarningDismissed, setAntivirusWarningDismissed] = useState(false);
  const [isGameInstalled, setIsGameInstalled] = useState(false);
  const [showProviderBlockedDialog, setShowProviderBlockedDialog] = useState(false);
  // The game is installed or a folder with its name already exists, so the
  // download waits until the user decides what to do with the existing copy.
  const [existingInstall, setExistingInstall] = useState(null); // { installed, dir, conflicts, pendingArgs }
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

    // Installed games go straight to the existing-install prompt, which has
    // its own location picker, so skip the separate path selection here
    if (isGameInstalled) {
      await handleDownload(directUrl);
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

  const installDirectories = [
    { index: 0, path: settings.downloadDirectory },
    ...(settings.additionalDirectories || []).map((path, i) => ({ index: i + 1, path })),
  ];

  // Look for an existing folder with this game's name in every games directory
  async function findDirectoryConflicts() {
    const results = await Promise.all(
      installDirectories.map(({ index }) =>
        window.electron.checkGameDirectoryConflict(gameData.game, index).catch(error => {
          console.error("Error checking game directory conflict:", error);
          return null;
        })
      )
    );
    return Object.fromEntries(results.map((result, index) => [index, result]));
  }

  // Apply the user's choice for the existing copy, then resume the download
  // that was paused waiting for a decision.
  async function resolveExistingInstall(action, { saveData = false } = {}) {
    if (!existingInstall) return;
    const { dir, conflicts, pendingArgs } = existingInstall;
    const conflict = conflicts[dir];

    setIsResolvingConflict(true);
    try {
      if (conflict?.exists && action === "rename") {
        const result = await window.electron.renameExistingGameDirectory(
          gameData.game,
          dir
        );
        if (!result?.success) {
          toast.error(t("download.toast.renameFailed"));
          return;
        }
        toast.success(t("download.toast.renamedExisting"));
      } else if (conflict?.exists && action === "delete") {
        if (saveData) {
          await window.electron.saveDeletedGameData(conflict.sanitizedName);
        }
        await window.electron.deleteGame(conflict.sanitizedName);
        toast.success(t("download.toast.deletedExisting"));
      }
      // "merge" requires no action here; the download will write into the
      // existing folder, keeping any files that aren't overwritten.

      setExistingInstall(null);
      setIsGameInstalled(false);
      await handleDownload(pendingArgs.directUrl, dir, pendingArgs.forceStart, true);
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

  // Stops a download that can't fit and warns when the install may not
  async function confirmInstallSpace(dir) {
    const directory = dir ? settings.additionalDirectories?.[dir - 1] : settings.downloadDirectory;
    let freeSpace;
    try {
      const space = await window.electron.getDriveSpace(directory);
      freeSpace = space?.directories?.find(entry => entry.path === directory)?.freeSpace;
    } catch (error) {
      console.error("Error checking free space:", error);
    }
    const { status, needed, measured } = checkInstallSpace(gameData, freeSpace);
    if (status === "blocked") {
      toast.error(
        t("download.toast.notEnoughSpace", {
          needed: formatBytes(needed),
          free: formatBytes(freeSpace),
        })
      );
      return false;
    }
    if (status === "low") {
      toast.warning(
        t(measured ? "download.toast.lowSpaceMeasured" : "download.toast.lowSpaceEstimated", {
          needed: formatBytes(needed),
          free: formatBytes(freeSpace),
        })
      );
    }
    return true;
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

    // A game that cannot run on this Mac gets one confirmation before downloading
    if (macCompat?.downloadWarning && !compatAcknowledgedRef.current) {
      setPendingCompatDownload([directUrl, dir, forceStart, skipConflictCheck]);
      return;
    }

    // Before a fresh download, ask once what to do if the game is installed
    // or a folder with its name already exists (e.g. a leftover install).
    // Skipped for update flows, which intentionally reuse the existing
    // folder, and once the user has already made that decision.
    if (!skipConflictCheck && !gameData.isUpdating) {
      const conflicts = await findDirectoryConflicts();
      const targetDir = dir ?? 0;
      if (isGameInstalled || conflicts[targetDir]?.exists) {
        // Without an explicit location, preselect where the existing copy lives
        const existingDir = installDirectories.find(
          ({ index }) => conflicts[index]?.exists
        )?.index;
        setExistingInstall({
          installed: isGameInstalled,
          dir: dir == null && existingDir != null ? existingDir : targetDir,
          conflicts,
          pendingArgs: { directUrl, forceStart },
        });
        return;
      }
    }

    if (!gameData.isUpdating && !(await confirmInstallSpace(dir))) return;

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
    checkDownloadPath();
    if (!gameData) return;
    let cancelled = false;

    const applyPrepared = prepared => {
      setArtworkOverride(prepared.override);
      setCoverGridUrl(prepared.coverGridUrl);
      setCachedImage(prepared.cachedImage);
      setArtworkReady(true);
      setSteamData(prepared.steamData);
      setSteamError(prepared.steamData ? null : "No game data found");
      setSteamLoading(false);
    };

    // Usually ready already: the card that opened this page prepared it
    const ready = gamePagePreparer.peek(gameData);
    if (ready) {
      applyPrepared(ready);
      setPagePrepared(true);
      return;
    }
    // Opened from somewhere that didn't prepare it: hold the page until it's
    // ready, falling back to loading in place if that takes too long
    setPagePrepared(false);
    gamePagePreparer.prepare(gameData).then(prepared => {
      if (cancelled) return;
      if (prepared) {
        applyPrepared(prepared);
      } else {
        loadProgressively();
      }
      setPagePrepared(true);
    });

    function loadProgressively() {
      const usesOverrides = !!(gameData?.gameID && !gameData.privateSource);
      const cachedOverride = usesOverrides
        ? artworkOverrideService.peek(gameData.gameID)
        : null;
      setArtworkOverride(cachedOverride || null);
      setCoverGridUrl(cachedOverride?.gridUrl || null);
      setArtworkReady(!usesOverrides || cachedOverride !== undefined);

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
        if (usesOverrides) {
          // Refreshes the cached answer too, so newly approved fixes show up
          const override = await artworkOverrideService.fetch(gameData.gameID);
          if (cancelled) return;
          setArtworkOverride(override);
          setArtworkReady(true);
          if (override?.gridUrl) {
            setCoverGridUrl(override.gridUrl);
            return;
          }
          if (cachedOverride?.gridUrl) setCoverGridUrl(null);
        }
        try {
          const cover = await steamGridImageService.getCover(gameData.game);
          if (!cancelled && cover) {
            setCoverGridUrl(cover);
          }
        } catch (e) {
          // Silent: Steam cover fallback renders automatically
        }
      };
      if (gameData.game) fetchSteamData(gameData.game);
      loadCoverGrid();
      loadCachedImage();
    }

    return () => {
      cancelled = true;
    };
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
        handleBack();
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
  // On Ascendara's index, no links of any kind (not just none usable with the
  // current settings) means the files were taken down because they stopped working
  const filesUnavailable =
    settings.gameSource !== "fitgirl" &&
    !isExternalSourcesMode &&
    !Object.values(downloadLinks).some(
      links =>
        Array.isArray(links) &&
        links.some(link => typeof link === "string" && link.trim().length > 0)
    );

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

  // Approved correction or a verified game means the artwork is known to be right
  const artworkVerified = !!artworkOverride || isVerified;

  const rawProviderLink = downloadLinks[selectedProvider]?.[0];
  const providerLink = rawProviderLink?.startsWith("//")
    ? `https:${rawProviderLink}`
    : rawProviderLink;

  const steamCover = steamData?.cover
    ? steamService.formatImageUrl(steamData.cover.url, "cover_big")
    : null;
  const bannerImage =
    artworkOverride?.heroUrl ||
    (steamData?.screenshots?.[0]
      ? steamService.formatImageUrl(steamData.screenshots[0].url, "screenshot_huge")
      : cachedImage);

  if (!pagePrepared) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-7xl flex-col items-center justify-center gap-4 pb-8 pt-4 fade-in">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/15" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Loader className="h-6 w-6 animate-spin text-primary" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">
            {t("download.preparingGame")}
          </p>
          <p className="mt-1 max-w-sm truncate text-sm text-muted-foreground">
            {sanitizeText(gameData.game)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl pb-8 pt-4 fade-in">
      <DownloadToolbar
        onBack={handleBack}
        isFavorite={isFavorite}
        onToggleFavorite={handleToggleFavorite}
        isPlayLater={isPlayLater}
        onTogglePlayLater={handlePlayLater}
        canShare={!!gameData.gameID}
        shareCopied={showShareCopySuccess}
        onShare={handleShareLink}
        canReport={settings.gameSource !== "fitgirl"}
        artwork={
          gameData.gameID && artworkReady
            ? {
                verified: artworkVerified,
                approved: !!artworkOverride,
                gameVerified: isVerified,
                submitted: hasCorrectedArtwork(gameData),
              }
            : null
        }
        onFixArtwork={() => setShowArtworkDialog(true)}
        reported={hasReportedGame(gameData)}
        onReport={() => setShowReportDialog(true)}
      />

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
          olderVersion={
            latestGameData
              ? { version: gameData.version, latest: latestGameData.version }
              : null
          }
          onBackToLatest={handleBackToLatest}
          onOpenTimemachine={() => setShowTimemachineSelection(true)}
        />

        {/* Game on the left, everything needed to download it on the right */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr]">
          <div className="min-w-0 lg:col-start-1">
            <DownloadHero
              gameData={gameData}
              bannerImage={artworkReady ? bannerImage : null}
              coverImage={artworkReady ? coverGridUrl || steamCover : null}
              coverFallback={steamCover}
              artworkLoading={!artworkReady}
              isVerified={isVerified}
              onShowVerified={() => setShowVerifiedDialog(true)}
              gameRating={gameRating}
              viewCount={viewCount}
              hasWrittenReviews={
                writtenReviews.gameID === gameData.gameID && writtenReviews.count > 0
              }
              onReadReviews={() =>
                reviewsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              steamRating={steamData?.rating ? (steamData.rating / 10).toFixed(1) : null}
              releaseDate={steamData?.release_date}
              hltbData={hltbData}
              showTimemachine={
                timemachineSetting &&
                (!!gameData.hasHistory || !gameService.indexTracksHistory())
              }
              onOpenTimemachine={() => setShowTimemachineSelection(true)}
            />
          </div>

          <aside className="min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            {macCompat && (
              <section
                className={`space-y-2 rounded-xl border bg-card p-5 ${macCompat.downloadWarning ? "border-red-500/40" : "border-border/40"}`}
              >
                <div className="flex items-center gap-2">
                  <Wine className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {t("settings.macCompat.gameTitle")}
                  </span>
                </div>
                <HighballCompatibility compat={macCompat} />
              </section>
            )}
            <DownloadPanel
              mode={downloadMode}
              gameData={gameData}
              settings={settings}
              providers={providers}
              filesUnavailable={filesUnavailable}
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
        onFixArtwork={
          gameData.gameID && !artworkVerified && !hasCorrectedArtwork(gameData)
            ? () => {
                setShowReportDialog(false);
                setShowArtworkDialog(true);
              }
            : undefined
        }
      />

      {gameData.gameID && (
        <ArtworkCorrectionDialog
          open={showArtworkDialog}
          onOpenChange={setShowArtworkDialog}
          gameData={gameData}
        />
      )}

      <Dialog
        open={!!pendingCompatDownload}
        onOpenChange={open => !open && setPendingCompatDownload(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.macCompat.db.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {macCompat?.downloadWarning &&
                t(`settings.macCompat.db.warning.${macCompat.downloadWarning}`)}
            </DialogDescription>
          </DialogHeader>
          <HighballCompatibility compat={macCompat} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCompatDownload(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const args = pendingCompatDownload;
                compatAcknowledgedRef.current = true;
                setPendingCompatDownload(null);
                handleDownload(...args);
              }}
            >
              {t("settings.macCompat.db.downloadAnyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TimemachineDialog
        gameData={gameData}
        latestGameData={latestGameData || gameData}
        onVersionSelect={handleTimemachineSelect}
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

      <ExistingInstallDialog
        prompt={existingInstall}
        directories={installDirectories}
        busy={isResolvingConflict}
        gameName={gameData.game}
        onDirChange={dir => setExistingInstall(prev => prev && { ...prev, dir })}
        onConfirm={resolveExistingInstall}
        onGoToLibrary={() => {
          setExistingInstall(null);
          navigate("/library");
        }}
        onDismiss={() => setExistingInstall(null)}
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
            // The existing-install check already ran before the queue prompt
            handleDownload(
              pendingDownloadData.directUrl,
              pendingDownloadData.dir,
              true,
              true
            );
          }
          setPendingDownloadData(null);
        }}
      />
    </div>
  );
}
