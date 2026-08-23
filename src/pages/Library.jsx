import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/LanguageContext";
import { useLibrarySearch } from "@/hooks/useLibrarySearch";
import {
  Plus,
  FolderOpen,
  ExternalLink,
  User,
  HardDrive,
  Gamepad2,
  Gift,
  Search as SearchIcon,
  AlertTriangle,
  Heart,
  SquareLibrary,
  Tag,
  PackageOpen,
  Loader,
  Import,
  AlertCircle,
  CheckSquareIcon,
  SortAscIcon,
  ArrowUpAZ,
  ArrowDownAZ,
  ImageUp,
  FolderPlus,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudDownload,
  CloudUpload,
  Clock,
  DollarSign,
  ArrowDown,
  Play,
  Trash2,
  Sparkles,
  MessageSquareText,
  TriangleAlert,
  Layers,
  Timer,
  HardDriveDownload,
  Star,
  SlidersHorizontal,
  GripVertical,
  Download,
  History,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogCancel,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import gameService from "@/services/gameService";
import { safeSetItem } from "@/services/gameInfoCacheService";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import steamService from "@/services/gameInfoService";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import {
  getCloudLibrary,
  getGameAchievements,
  syncCloudLibrary,
  syncGameAchievements,
  verifyAscendAccess,
  getFriendsList,
} from "@/services/firebaseService";
import { calculateLibraryValue } from "@/services/cheapsharkService";
import { getDownloadQueue } from "@/services/downloadQueueService";

import NewFolderDialog from "@/components/NewFolderDialog";
import FolderCard from "@/components/FolderCard";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  loadFolders,
  saveFolders,
  createFolder,
  addGameToFolder,
  filterGamesNotInFolders,
  getGamesInFolders,
} from "@/lib/folderManager";

// Module-level cache so images survive page switches without re-fetching via IPC
const gameImageCache = new Map();


// Normalize every place that compares game names so casing, spaces, and
// filesystem-invalid characters cannot create duplicate library entries.
const normalizeGameName = name =>
  (name || "")
    .replace(/[<>:"/\\|?*]/g, "")
    .trim()
    .toLowerCase();

const getGameDisplayName = game => game?.game || game?.name || "";

const getLibraryIdentityKey = game => {
  const normalizedName = normalizeGameName(getGameDisplayName(game));
  if (game?.isFolder && normalizedName) return `folder:${normalizedName}`;
  if (normalizedName) return `name:${normalizedName}`;
  if (game?.gameID) return `id:${game.gameID}`;
  if (game?._queueId) return `queued:${game._queueId}`;
  return "";
};

const toFiniteNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getComparableTime = value => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsedAsNumber = Number(value);
  if (Number.isFinite(parsedAsNumber)) return parsedAsNumber;
  const parsedAsDate = Date.parse(value);
  return Number.isFinite(parsedAsDate) ? parsedAsDate : 0;
};

const pickMostRecentValue = (a, b) =>
  getComparableTime(b) > getComparableTime(a) ? b : a;

const mergeDuplicateLibraryGame = (existing, incoming) => {
  const existingIsInstalled = existing?.isCustom === false || existing?.custom === false;
  const incomingIsInstalled = incoming?.isCustom === false || incoming?.custom === false;

  // Prefer installed-game metadata over custom-game metadata, but keep the
  // highest stats so the user's hours do not disappear when duplicates merge.
  const preferred = incomingIsInstalled && !existingIsInstalled ? incoming : existing;
  const secondary = preferred === existing ? incoming : existing;

  return {
    ...secondary,
    ...preferred,
    game: getGameDisplayName(preferred) || getGameDisplayName(secondary),
    name: preferred?.name || preferred?.game || secondary?.name || secondary?.game,
    playTime: Math.max(
      toFiniteNumber(existing?.playTime),
      toFiniteNumber(incoming?.playTime)
    ),
    launchCount: Math.max(
      toFiniteNumber(existing?.launchCount),
      toFiniteNumber(incoming?.launchCount)
    ),
    lastPlayed: pickMostRecentValue(existing?.lastPlayed, incoming?.lastPlayed),
    _isDownloading: Boolean(existing?._isDownloading || incoming?._isDownloading),
    _isQueued: Boolean(existing?._isQueued || incoming?._isQueued),
  };
};

const dedupeLibraryGames = gameList => {
  const deduped = new Map();

  for (const [index, game] of (gameList || []).entries()) {
    const identityKey = getLibraryIdentityKey(game) || `unknown:${index}`;

    const existing = deduped.get(identityKey);
    deduped.set(
      identityKey,
      existing ? mergeDuplicateLibraryGame(existing, game) : game
    );
  }

  return Array.from(deduped.values());
};

const getLibraryCardKey = game =>
  getLibraryIdentityKey(game) ||
  `library-item:${game?.executable || game?.path || game?.installPath || "unknown"}`;

const Library = () => {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedGames, setSelectedGames] = useState([]);
  const handleSelectGame = game => {
    if (!game.isCustom) return;
    setSelectedGames(prev =>
      prev.includes(game.game) ? prev.filter(g => g !== game.game) : [...prev, game.game]
    );
  };

  // Bulk remove selected custom games
  const handleBulkRemove = async () => {
    if (selectedGames.length === 0) return;
    try {
      for (const gameName of selectedGames) {
        await window.electron.removeCustomGame(gameName);
      }
      setSelectedGames([]);
      setSelectionMode(false);
      await loadGames();
    } catch (error) {
      console.error("Bulk remove failed:", error);
    }
  };

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState(() => {
    const saved = localStorage.getItem("library-sortOrder");
    return saved || "asc";
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filters, setFilters] = useState({
    favorites: false,
    vrOnly: false,
    onlineGames: false,
  });
  const [lastLaunchedGame, setLastLaunchedGame] = useState(null);
  const lastLaunchedGameRef = useRef(null);
  const [isOnWindows, setIsOnWindows] = useState(true);
  const [coverSearchQuery, setCoverSearchQuery] = useState("");
  const [coverSearchResults, setCoverSearchResults] = useState([]);
  const [isCoverSearchLoading, setIsCoverSearchLoading] = useState(false);
  const [selectedGameImage, setSelectedGameImage] = useState(null);
  const [storageInfo, setStorageInfo] = useState(null);
  const [username, setUsername] = useState(null);
  const [queuedGames, setQueuedGames] = useState([]);

  const [favorites, setFavorites] = useState(() => {
    const savedFavorites = localStorage.getItem("game-favorites");
    return savedFavorites ? JSON.parse(savedFavorites) : [];
  });
  const [gameRatings, setGameRatings] = useState(() => {
    const saved = localStorage.getItem("game-ratings");
    return saved ? JSON.parse(saved) : {};
  });
  const [favGallerySortMode, setFavGallerySortMode] = useState(() => localStorage.getItem("fav-gallery-sort") || "rating");
  const [favGalleryGenreFilter, setFavGalleryGenreFilter] = useState("all");
  const [totalGamesSize, setTotalGamesSize] = useState(0);
  const [isCalculatingSize, setIsCalculatingSize] = useState(false);
  const [showStorageDetails, setShowStorageDetails] = useState(false);
  const [folders, setFolders] = useState(() => {
    const savedFolders = localStorage.getItem("library-folders");
    return savedFolders ? JSON.parse(savedFolders) : [];
  });
  // Cloud-only games state
  const [cloudOnlyGames, setCloudOnlyGames] = useState([]);
  const [loadingCloudGames, setLoadingCloudGames] = useState(false);
  const [restoringGame, setRestoringGame] = useState(null);
  const [cloudGameImages, setCloudGameImages] = useState({});
  // Play Later games state
  const [playLaterGames, setPlayLaterGames] = useState([]);
  // History (deleted games with preserved stats) state
  const [deletedGames, setDeletedGames] = useState([]);
  const [restoringDeletedGame, setRestoringDeletedGame] = useState(null);
  const [isSyncingLibrary, setIsSyncingLibrary] = useState(false);
  const [gameUpdates, setGameUpdates] = useState({}); // {gameID: updateInfo}
  const [isLibraryValueOpen, setIsLibraryValueOpen] = useState(false);
  const [libraryValueData, setLibraryValueData] = useState(() => {
    const cached = localStorage.getItem("library-value-cache");
    return cached ? JSON.parse(cached) : null;
  });
  const [cachedGameCount, setCachedGameCount] = useState(() => {
    return parseInt(localStorage.getItem("library-value-game-count") || "0", 10);
  });
  const [isCalculatingValue, setIsCalculatingValue] = useState(false);
  const [valueProgress, setValueProgress] = useState({ current: 0, total: 0, game: "" });
  const [sidebarTabOrder, setSidebarTabOrder] = useState(() => {
    const saved = localStorage.getItem("library-tab-order");
    return saved ? JSON.parse(saved) : ["all", "favoritesGallery", "cloud", "playLater", "history"];
  });
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem("library-tab-order");
    const order = saved ? JSON.parse(saved) : ["all", "favoritesGallery", "cloud", "playLater", "history"];
    return order[0] || "all";
  }); // "all" | "favoritesGallery" | "cloud" | "playLater" | "history"
  const dragTabRef = useRef(null);
  const dragOverTabRef = useRef(null);
  const [groupBy, setGroupBy] = useState(() => localStorage.getItem("library-groupBy") || "none"); // "none" | "directory"
  const [sortMode, setSortMode] = useState(() => localStorage.getItem("library-sortMode") || "alpha"); // "alpha" | "playtime"
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userData } = useAuth();
  const { settings } = useSettings();
  const [ascendAccess, setAscendAccess] = useState({
    hasAccess: false,
    isSubscribed: false,
    isVerified: false,
  });
  const [showAscendPanel, setShowAscendPanel] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [showRedesignDialog, setShowRedesignDialog] = useState(false);
  const [addGameRestoreEntry, setAddGameRestoreEntry] = useState(null); // {gameName, stub}

  useEffect(() => {
    safeSetItem("game-favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const handleFavoritesUpdated = () => {
      const saved = localStorage.getItem("game-favorites");
      setFavorites(saved ? JSON.parse(saved) : []);
    };
    window.addEventListener("favorites-updated", handleFavoritesUpdated);
    return () => window.removeEventListener("favorites-updated", handleFavoritesUpdated);
  }, []);

  useEffect(() => {
    safeSetItem("game-ratings", JSON.stringify(gameRatings));
  }, [gameRatings]);

  useEffect(() => {
    safeSetItem("fav-gallery-sort", favGallerySortMode);
  }, [favGallerySortMode]);

  const setGameRating = (gameName, rating) => {
    setGameRatings(prev => ({ ...prev, [gameName]: rating }));
  };

  useEffect(() => {
    const checkRedesignDialog = async () => {
      const alreadyShown = localStorage.getItem("library-welcome-v2-shown");
      if (alreadyShown) return;
      try {
        const hasLaunched = await window.electron.hasLaunched();
        if (hasLaunched) {
          setTimeout(() => setShowRedesignDialog(true), 800);
        }
      } catch (e) {
        console.error("Failed to check launch status for redesign dialog:", e);
      }
    };
    checkRedesignDialog();
  }, []);

  useLibrarySearch();

  // Verify Ascend access
  useEffect(() => {
    const checkAscendAccess = async () => {
      if (!user) {
        setAscendAccess({
          hasAccess: false,
          isSubscribed: false,
          isVerified: false,
        });
        return;
      }

      try {
        const result = await verifyAscendAccess();
        setAscendAccess({
          hasAccess: result.hasAccess,
          isSubscribed: result.isSubscribed,
          isVerified: result.isVerified,
        });
      } catch (error) {
        console.error("Error verifying Ascend access:", error);
        setAscendAccess({
          hasAccess: false,
          isSubscribed: false,
          isVerified: false,
        });
      }
    };

    checkAscendAccess();
  }, [user]);

  useEffect(() => {
    const checkWindows = async () => {
      const isWindows = await window.electron.isOnWindows();
      setIsOnWindows(isWindows);
    };
    checkWindows();
  }, []);

  useEffect(() => {
    // Add keyframes to document
    const styleSheet = document.styleSheets[0];
    const keyframes = `
      @keyframes shimmer {
        0% { transform: translateX(-100%) }
        100% { transform: translateX(100%) }
      }
    `;
    styleSheet.insertRule(keyframes, styleSheet.cssRules.length);
  }, []);

  useEffect(() => {
    lastLaunchedGameRef.current = lastLaunchedGame;
  }, [lastLaunchedGame]);

  // Merge queued stubs into the display list (skip if already showing locally).
  // Compare normalized names so "Game", " game ", and sanitized folder names do not duplicate.
  const existingGameNames = new Set(
    games
      .filter(g => !g.isFolder)
      .map(g => normalizeGameName(g.game || g.name))
  );
  const queuedStubs = queuedGames
    .filter(q => !existingGameNames.has(normalizeGameName(q.gameName)))
    .map(q => ({
      game: q.gameName,
      name: q.gameName,
      imgID: q.imgID || null,
      gameID: q.gameID || null,
      _isQueued: true,
      _queueId: q.id,
    }));
  const gamesWithQueued = dedupeLibraryGames([...games, ...queuedStubs]);

  // Filter games based on search query
  const filteredGames = gamesWithQueued
    .slice()
    .filter(game => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (game.game || game.name || "")
        .toLowerCase()
        .includes(searchLower);
      const matchesFavorites =
        !filters.favorites || favorites.includes(game.game || game.name);
      const matchesVr = !filters.vrOnly || game.isVr;
      const matchesOnline = !filters.onlineGames || game.online;
      return matchesSearch && matchesFavorites && matchesVr && matchesOnline;
    })
    .sort((a, b) => {
      // Folders always first
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      // Then favorites
      const aName = a.game || a.name || "";
      const bName = b.game || b.name || "";
      const aFavorite = favorites.includes(aName);
      const bFavorite = favorites.includes(bName);
      if (aFavorite !== bFavorite) {
        return aFavorite ? -1 : 1;
      }
      // Sort mode
      if (sortMode === "playtime") {
        const aTime = a.playTime || 0;
        const bTime = b.playTime || 0;
        return bTime - aTime;
      }
      // Alphabetical
      return sortOrder === "asc"
        ? aName.localeCompare(bName)
        : bName.localeCompare(aName);
    });

  // Save sortOrder/groupBy/sortMode to localStorage whenever they change
  useEffect(() => {
    safeSetItem("library-sortOrder", sortOrder);
  }, [sortOrder]);

  useEffect(() => {
    safeSetItem("library-groupBy", groupBy);
  }, [groupBy]);

  useEffect(() => {
    safeSetItem("library-sortMode", sortMode);
  }, [sortMode]);

  // Listen for folder changes (e.g. folder deleted, games moved back)
  useEffect(() => {
    const handleFoldersUpdated = () => {
      loadGames();
    };
    window.addEventListener("ascendara:folders-updated", handleFoldersUpdated);
    return () => {
      window.removeEventListener("ascendara:folders-updated", handleFoldersUpdated);
    };
  }, []);

  const toggleFavorite = gameName => {
    setFavorites(prev => {
      const newFavorites = prev.includes(gameName)
        ? prev.filter(name => name !== gameName)
        : [...prev, gameName];
      localStorage.setItem("game-favorites", JSON.stringify(newFavorites));
      window.dispatchEvent(new CustomEvent("favorites-updated"));
      return newFavorites;
    });
  };

  const fetchUsername = async () => {
    try {
      // Get username from localStorage with fallback to API
      const userPrefs = JSON.parse(localStorage.getItem("userProfile") || "{}");
      if (userPrefs.profileName) {
        setUsername(userPrefs.profileName);
        return userPrefs.profileName;
      }

      // Fallback to Electron API if not in localStorage
      const crackedUsername = await window.electron.getLocalCrackUsername();
      setUsername(crackedUsername || "Guest");
      return crackedUsername;
    } catch (error) {
      console.error("Error fetching username:", error);
      setUsername("Guest");
      return null;
    }
  };

  const formatBytes = bytes => {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 Byte";
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  };

  useEffect(() => {
    const fetchStorageInfo = async () => {
      try {
        const installPath = await window.electron.getDownloadDirectory();
        if (installPath) {
          const [driveSpace, gamesSize] = await Promise.all([
            window.electron.getDriveSpace(installPath),
            window.electron.getInstalledGamesSize(),
          ]);

          // Use the actual directory-specific game sizes from the backend
          if (
            driveSpace &&
            driveSpace.directories &&
            driveSpace.directories.length > 0 &&
            gamesSize.success &&
            !gamesSize.calculating &&
            gamesSize.directorySizes
          ) {
            // Map the drive space directories with their corresponding game sizes
            const directoriesWithGameSizes = driveSpace.directories.map(dir => {
              // Find the matching directory in the game sizes data
              const matchingDir = gamesSize.directorySizes.find(
                gameSizeDir => gameSizeDir.path === dir.path
              );

              return {
                ...dir,
                gamesSize: matchingDir ? matchingDir.size : 0,
              };
            });

            setStorageInfo({
              ...driveSpace,
              directories: directoriesWithGameSizes,
            });
          } else {
            setStorageInfo(driveSpace);
          }

          if (gamesSize.success) {
            setIsCalculatingSize(gamesSize.calculating);
            if (!gamesSize.calculating) {
              setTotalGamesSize(gamesSize.totalSize);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching storage info:", error);
      }
    };

    fetchStorageInfo();
  }, []);

  useEffect(() => {
    fetchUsername();
  }, []);

  // Keep track of whether we've initialized
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize once on mount
  useEffect(() => {
    const init = async () => {
      await loadGames();
      setIsInitialized(true);
    };
    init();
  }, []);

  // Poll every 3 s while any game is actively downloading or queued
  useEffect(() => {
    const interval = setInterval(() => {
      const hasDownloading = games.some(g => g._isDownloading);
      if (hasDownloading) loadGames();
      // Always refresh queue state
      const queue = getDownloadQueue();
      setQueuedGames(queue);
    }, 3000);
    return () => clearInterval(interval);
  }, [games]);

  // Sync queued games on mount and whenever the queue changes
  useEffect(() => {
    setQueuedGames(getDownloadQueue());
  }, []);

  // Load Play Later games from localStorage
  useEffect(() => {
    const loadPlayLaterGames = () => {
      const savedGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");
      setPlayLaterGames(savedGames);
    };

    loadPlayLaterGames();

    // Listen for updates from GameCard
    const handlePlayLaterUpdate = () => {
      loadPlayLaterGames();
    };
    window.addEventListener("play-later-updated", handlePlayLaterUpdate);

    return () => {
      window.removeEventListener("play-later-updated", handlePlayLaterUpdate);
    };
  }, []);

  // Handle removing a game from Play Later list
  const handleRemoveFromPlayLater = gameName => {
    const updatedList = playLaterGames.filter(g => g.game !== gameName);
    safeSetItem("play-later-games", JSON.stringify(updatedList));
    localStorage.removeItem(`play-later-image-${gameName}`);
    setPlayLaterGames(updatedList);
  };

  // Handle navigating to download page for Play Later game
  const handleDownloadPlayLater = game => {
    // Remove from Play Later list and cached image
    handleRemoveFromPlayLater(game.game);

    navigate("/download", {
      state: {
        gameData: game,
      },
    });
  };

  const handleRestoreDeletedGame = async deletedGame => {
    const gameName = deletedGame.game || deletedGame.name;

    if (!deletedGame.gameID) {
      toast.info(
        t("library.history.customGameInfo") ||
          "Add this game back with the exact same name to automatically restore its saved playtime."
      );
      setIsAddGameOpen(true);
      return;
    }

    setRestoringDeletedGame(gameName);
    try {
      let fullGame = null;
      try {
        fullGame = await gameService.findGameByGameID(deletedGame.gameID);
      } catch { /* fall through */ }
      if (!fullGame) {
        try {
          const results = await gameService.searchGames(gameName);
          fullGame = results.find(r => r.game === gameName) || null;
        } catch { /* fall through */ }
      }
      if (!fullGame) {
        toast.error(t("library.cloudRestore.gameNotFound") || "Game not found. It may have been removed.");
        return;
      }
      navigate("/download", { state: { gameData: fullGame } });
    } finally {
      setRestoringDeletedGame(null);
    }
  };

  // Permanently forget a game's History entry, discarding its saved stats
  const handleRemoveFromHistory = async deletedGame => {
    const gameName = deletedGame.game || deletedGame.name;
    try {
      await window.electron.discardDeletedGameData(gameName);
      setDeletedGames(prev => prev.filter(g => (g.game || g.name) !== gameName));
      toast.success(t("library.history.removed") || "Removed from History");
    } catch (error) {
      console.error("Error removing game from history:", error);
      toast.error(t("library.history.removeFailed") || "Failed to remove from History");
    }
  };

  // Check for game updates when games are loaded (only for Ascend subscribers)
  useEffect(() => {
    const checkGameUpdates = async () => {
      console.log("[Library] checkGameUpdates called, games:", games.length);

      // Only check if user has Ascend access
      if (!user || !ascendAccess.hasAccess) {
        console.log("[Library] Skipping update check - no Ascend access");
        setGameUpdates({});
        return;
      }

      // Only check for non-custom games with gameID
      const gamesWithId = games.filter(g => !g.isFolder && !g.isCustom && g.gameID);
      console.log(
        "[Library] Games with gameID:",
        gamesWithId.length,
        gamesWithId.map(g => ({ name: g.game, gameID: g.gameID, version: g.version }))
      );
      if (gamesWithId.length === 0) {
        console.log("[Library] No games with gameID found, skipping update check");
        return;
      }

      const updates = {};
      // Check updates in parallel but limit concurrency
      const checkPromises = gamesWithId.map(async game => {
        try {
          console.log(
            `[Library] Checking update for ${game.game} (${game.gameID}), version: ${game.version}`
          );
          const result = await gameService.checkGameUpdate(game.gameID, game.version);
          console.log(`[Library] Update result for ${game.game}:`, result);
          if (result?.updateAvailable) {
            console.log(`[Library] Update available for ${game.game}!`);
            updates[game.gameID] = result;
          }
        } catch (error) {
          console.error(`[Library] Error checking update for ${game.game}:`, error);
        }
      });

      await Promise.all(checkPromises);
      console.log("[Library] All updates checked, updates found:", updates);
      setGameUpdates(updates);
    };

    if (isInitialized && games.length > 0) {
      console.log(
        "[Library] Triggering update check, isInitialized:",
        isInitialized,
        "games.length:",
        games.length,
        "hasAccess:",
        ascendAccess.hasAccess
      );
      checkGameUpdates();
    }
  }, [isInitialized, games, user, ascendAccess.hasAccess]);

  // Load cloud-only games (games in cloud but not installed locally)
  useEffect(() => {
    const loadCloudOnlyGames = async () => {
      if (!user) {
        setCloudOnlyGames([]);
        return;
      }

      setLoadingCloudGames(true);
      try {
        const cloudResult = await getCloudLibrary();
        if (cloudResult.data?.games) {
          // Get local game names for comparison
          const installedGames = await window.electron.getGames();
          const customGames = await window.electron.getCustomGames();
          
          // Sanitize game name to match backend directory naming
          const sanitizeName = (name) => {
            if (!name) return "";
            return name.replace(/[<>:"/\\|?*]/g, "").trim().toLowerCase();
          };
          
          const localGameNames = new Set([
            ...(installedGames || []).map(g => sanitizeName(g.game || g.name)),
            ...(customGames || []).filter(g => !g._isDeleted).map(g => sanitizeName(g.game || g.name)),
          ]);

          // Filter to cloud games that are NOT installed locally
          // Include both regular games (with gameID) and custom games
          const cloudOnly = cloudResult.data.games.filter(
            g => !localGameNames.has(sanitizeName(g.name)) && (g.gameID || g.isCustom)
          );

          setCloudOnlyGames(cloudOnly);

          // Load images for cloud-only games (only for non-custom games with gameID).
          // Image data URLs are NOT cached in localStorage (quota issues); React
          // state holds them in-memory for the lifetime of the page.
          const images = {};
          for (const game of cloudOnly
            .filter(g => g.gameID && !g.isCustom)
            .slice(0, 20)) {
            try {
              if (game.gameID) {
                // For local index, we need to find the game's imgID
                let imageId = game.gameID;
                let imageLoaded = false;

                // 1. Try with electron
                try {
                  const imageBase64 = await window.electron.getGameImage(game.name);
                  if (imageBase64) {
                    images[game.name] = `data:image/jpeg;base64,${imageBase64}`;
                    imageLoaded = true;
                  }
                } catch (error) {
                  console.warn("Electron image not found for cloud game, trying fallbacks:", error);
                }

                // 2. For local index, try to load from local file system using imgID
                if (!imageLoaded && settings.usingLocalIndex) {
                  try {
                    const gameData = await gameService.findGameByGameID(game.gameID);
                    if (gameData?.imgID) imageId = gameData.imgID;

                    const localImagePath = `${settings.localIndex}/imgs/${imageId}.jpg`;
                    const imageData = await window.electron.ipcRenderer.readFile(localImagePath, "base64");
                    images[game.name] = `data:image/jpeg;base64,${imageData}`;
                    imageLoaded = true;
                  } catch (localError) {
                    console.warn("Could not load from local index:", localError);
                  }
                }

                // 3. Ascendara API
                if (!imageLoaded) {
                  try {
                    const imageUrl = `https://api.ascendara.app/v3/image/${game.gameID}`;
                    const response = await fetch(imageUrl);
                    if (response.ok) {
                      const blob = await response.blob();
                      const dataUrl = await new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                      });
                      images[game.name] = dataUrl;
                    }
                  } catch (error) {
                    console.error("Error loading cloud game image from API:", error);
                  }
                }
              }
            } catch (error) {
              console.error("Error loading cloud game image:", error);
            }
          }
          setCloudGameImages(images);
        }
      } catch (e) {
        console.error("Failed to load cloud library:", e);
      }
      setLoadingCloudGames(false);
    };

    loadCloudOnlyGames();
  }, [user, games]); // Re-run when user changes or games list changes

  // Restore game from cloud - find in local index and start download
  const handleRestoreFromCloud = async cloudGame => {
    // Handle custom games differently - they need to be manually re-added
    if (cloudGame.isCustom) {
      // Store cloud data in localStorage to restore after user manually adds the game
      const cloudRestoreData = {
        gameName: cloudGame.name,
        playTime: cloudGame.playTime,
        launchCount: cloudGame.launchCount,
        lastPlayed: cloudGame.lastPlayed,
        favorite: cloudGame.favorite,
        isCustom: true,
      };
      safeSetItem(
        `cloud-restore-${cloudGame.name}`,
        JSON.stringify(cloudRestoreData)
      );

      // Show info toast and open add game dialog
      toast.info(t("library.cloudRestore.customGameInfo"));
      setIsAddGameOpen(true);
      return;
    }

    if (!cloudGame.gameID) {
      toast.error(t("library.cloudRestore.noGameId"));
      return;
    }

    setRestoringGame(cloudGame.name);
    try {
      // Find the game in the local index using gameID
      const gameData = await gameService.findGameByGameID(cloudGame.gameID);
      if (!gameData) {
        toast.error(t("library.cloudRestore.gameNotFound"));
        setRestoringGame(null);
        return;
      }

      // Store cloud data in localStorage to restore after download completes
      const cloudRestoreData = {
        gameName: cloudGame.name,
        playTime: cloudGame.playTime,
        launchCount: cloudGame.launchCount,
        lastPlayed: cloudGame.lastPlayed,
        favorite: cloudGame.favorite,
      };
      safeSetItem(
        `cloud-restore-${cloudGame.name}`,
        JSON.stringify(cloudRestoreData)
      );

      // Navigate to download page with the game data
      navigate("/download", {
        state: {
          gameData: {
            ...gameData,
            fromCloudRestore: true,
          },
          fromCloudRestore: true,
        },
      });
    } catch (error) {
      console.error("Error restoring game from cloud:", error);
      toast.error(t("library.cloudRestore.error"));
    }
    setRestoringGame(null);
  };

  // Check for pending cloud restores when games are loaded
  // This handles the case where a cloud game was downloaded and we need to restore its data
  const checkPendingCloudRestores = async installedGames => {
    // Get all cloud-restore keys from localStorage
    const keysToCheck = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("cloud-restore-")) {
        keysToCheck.push(key);
      }
    }

    // Sanitize game name to match backend directory naming
    const sanitizeName = (name) => {
      if (!name) return "";
      return name.replace(/[<>:"/\\|?*]/g, "").trim().toLowerCase();
    };

    for (const key of keysToCheck) {
      const gameName = key.replace("cloud-restore-", "");
      // Check if this game is now installed using sanitized name comparison
      const isInstalled = installedGames.some(
        g => sanitizeName(g.game || g.name) === sanitizeName(gameName)
      );

      if (isInstalled) {
        try {
          const cloudRestoreDataStr = localStorage.getItem(key);
          if (cloudRestoreDataStr) {
            const cloudRestoreData = JSON.parse(cloudRestoreDataStr);
            console.log("Restoring cloud data for:", gameName, cloudRestoreData);

            // Restore the cloud data to the game's JSON file
            const result = await window.electron.restoreCloudGameData(
              gameName,
              cloudRestoreData
            );

            // Also restore achievements from cloud if available
            if (user) {
              try {
                const achievementsResult = await getGameAchievements(gameName);
                // Check if we have achievement data (could be in .achievements or directly in .data)
                if (achievementsResult.data) {
                  console.log(
                    "Restoring achievements for:",
                    gameName,
                    achievementsResult.data
                  );
                  await window.electron.writeGameAchievements(
                    gameName,
                    achievementsResult.data
                  );
                }
              } catch (achError) {
                console.error("Error restoring achievements:", achError);
              }
            }

            if (result.success) {
              toast.success(t("library.cloudRestore.restored"));
            } else {
              console.error("Failed to restore cloud data:", result.error);
            }

            // Clean up localStorage
            localStorage.removeItem(key);
          }
        } catch (error) {
          console.error("Error restoring cloud data:", error);
          localStorage.removeItem(key);
        }
      }
    }
  };

  const handleCreateFolder = name => {
    // Create new folder using the folderManager library
    const newFolder = createFolder(name);

    // Add to games list
    setGames(prev => [newFolder, ...prev]);

    // Update folders state
    setFolders(loadFolders());

    setIsNewFolderOpen(false);
  };

  const loadGames = async () => {
    try {
      // Get games from main process
      const installedGames = await window.electron.getGames();
      const customGames = await window.electron.getCustomGames();

      // Ensure we have arrays to work with
      const safeInstalledGames = Array.isArray(installedGames) ? installedGames : [];
      const safeCustomGames = Array.isArray(customGames)
        ? customGames.filter(g => !g._isDeleted)
        : [];

      // Track games moved to History (deleted with "Save Data") so they can
      // be shown/restored from the History tab instead of vanishing entirely.
      setDeletedGames(Array.isArray(customGames) ? customGames.filter(g => g._isDeleted) : []);

      // If a game that has a History stub has been reinstalled, silently merge
      // its saved playtime/stats back in and drop the stub, then reload once.
      const reinstalledWithStub = safeInstalledGames.filter(g => g._deletedStub);
      if (reinstalledWithStub.length > 0) {
        await Promise.all(
          reinstalledWithStub.map(g =>
            window.electron.restoreDeletedGameData(g.game || g.name).catch(() => {})
          )
        );
        return loadGames();
      }

      // Check for pending cloud restores (games that were downloaded from cloud)
      await checkPendingCloudRestores([...safeInstalledGames, ...safeCustomGames]);

      // Separate downloading games (show in library grayed out) from finished ones
      const filteredInstalledGames = safeInstalledGames.filter(
        game =>
          !game.downloadingData?.verifying &&
          (!game.downloadingData?.verifyError ||
            game.downloadingData.verifyError.length === 0)
      );

      // Combine both types of games
      const allGames = [
        ...(filteredInstalledGames || []).map(game => {
          const isActivelyDownloading =
            game.downloadingData?.downloading ||
            game.downloadingData?.extracting ||
            game.downloadingData?.updating ||
            game.downloadingData?.stopped;
          return {
            ...game,
            isCustom: false,
            _isDownloading: isActivelyDownloading || false,
          };
        }),
        ...(safeCustomGames || []).map(game => ({
          name: game.game,
          game: game.game, // Keep original property for compatibility
          version: game.version,
          online: game.online,
          dlc: game.dlc,
          isVr: game.isVr,
          executable: game.executable,
          playTime: game.playTime,
          isCustom: true,
          custom: true,
        })),
      ];

      // Load folders using the folderManager library
      const folders = loadFolders();

      // Add folders to the games list
      const foldersAsGames = folders.map(folder => ({
        ...folder,
        isFolder: true,
      }));

      // Remove duplicate records before rendering. Large libraries can return the
      // same title from installed + custom/imported sources with different stats.
      const dedupedGames = dedupeLibraryGames(allGames);

      // Filter out games that are in folders using the folderManager library
      const gamesNotInFolders = filterGamesNotInFolders(dedupedGames);

      // Set the folders state
      setFolders(folders);

      // Combine games not in folders with folder items
      setGames([...foldersAsGames, ...gamesNotInFolders]);
      setLoading(false);
    } catch (error) {
      console.error("Error loading games:", error);
      setError("Failed to load games");
      setLoading(false);
    }
  };

  const handleCloudSync = async () => {
    if (!user) {
      navigate("/ascend");
      return;
    }

    setIsSyncingLibrary(true);
    try {
      const installedGames = (await window.electron?.getGames?.()) || [];
      const customGames = (await window.electron?.getCustomGames?.()) || [];

      const allGames = [
        ...(installedGames || []).filter(
          g => !g.downloadingData?.downloading && !g.downloadingData?.extracting
        ),
        ...(customGames || []).filter(g => !g._isDeleted).map(g => ({ ...g, isCustom: true })),
      ];

      const gamesWithAchievements = await Promise.all(
        allGames.map(async game => {
          try {
            const gameName = game.game || game.name;
            const isCustom = game.isCustom || game.custom || false;

            let achievementData = null;

            if (isCustom && game.achievementWatcher?.achievements) {
              achievementData = game.achievementWatcher;
            } else {
              achievementData = await window.electron?.readGameAchievements?.(
                gameName,
                isCustom
              );
            }

            if (achievementData?.achievements?.length > 0) {
              const totalAchievements = achievementData.achievements.length;
              const unlockedAchievements = achievementData.achievements.filter(
                a => a.achieved
              ).length;

              await syncGameAchievements(gameName, isCustom, achievementData);

              return {
                ...game,
                achievementStats: {
                  total: totalAchievements,
                  unlocked: unlockedAchievements,
                  percentage: Math.round(
                    (unlockedAchievements / totalAchievements) * 100
                  ),
                },
              };
            }
          } catch (e) {
            console.warn(
              `Failed to fetch/sync achievements for ${game.game || game.name}:`,
              e
            );
          }
          return { ...game, achievementStats: null };
        })
      );

      const result = await syncCloudLibrary(gamesWithAchievements);
      if (result.success) {
        toast.success(t("ascend.cloudLibrary.synced") || "Library synced to cloud!");
      } else {
        toast.error(
          result.error || t("ascend.cloudLibrary.syncFailed") || "Failed to sync library"
        );
      }
    } catch (e) {
      console.error("Failed to sync library:", e);
      toast.error(t("ascend.cloudLibrary.syncFailed") || "Failed to sync library");
    }
    setIsSyncingLibrary(false);
  };

  const handlePlayGame = async game => {
    navigate("/gamescreen", {
      state: {
        gameData: game,
      },
    });
  };

  // Get current library game count
  const getCurrentGameCount = () => {
    return games.filter(g => !g.isFolder).length + getGamesInFolders().length;
  };

  // Check if library has changed since last calculation
  const libraryHasChanged = () => {
    const currentCount = getCurrentGameCount();
    return currentCount !== cachedGameCount;
  };

  const handleCalculateLibraryValue = async (forceRecalculate = false) => {
    setIsLibraryValueOpen(true);

    // If we have cached data and library hasn't changed, just show it
    if (!forceRecalculate && libraryValueData && !libraryHasChanged()) {
      return;
    }

    setIsCalculatingValue(true);
    setValueProgress({ current: 0, total: 0, game: "" });

    try {
      // Get all game titles from library (including games in folders)
      const allGameTitles = [
        ...games.filter(g => !g.isFolder).map(g => g.game || g.name),
        ...getGamesInFolders().map(g => g.game || g.name),
      ];

      if (allGameTitles.length === 0) {
        const emptyResult = { totalValue: 0, games: [], notFound: [] };
        setLibraryValueData(emptyResult);
        safeSetItem("library-value-cache", JSON.stringify(emptyResult));
        safeSetItem("library-value-game-count", "0");
        setCachedGameCount(0);
        setIsCalculatingValue(false);
        return;
      }

      setValueProgress({ current: 0, total: allGameTitles.length, game: "" });

      const result = await calculateLibraryValue(
        allGameTitles,
        (current, total, game, price) => {
          setValueProgress({ current, total, game });
        }
      );

      // Cache the result
      setLibraryValueData(result);
      safeSetItem("library-value-cache", JSON.stringify(result));
      safeSetItem("library-value-game-count", String(allGameTitles.length));
      setCachedGameCount(allGameTitles.length);
    } catch (error) {
      console.error("Error calculating library value:", error);
      toast.error(t("library.libraryValue.error") || "Failed to calculate library value");
    }
    setIsCalculatingValue(false);
  };

  const searchGameCovers = React.useCallback(async query => {
    if (!query.trim()) {
      setCoverSearchResults([]);
      return;
    }

    setIsCoverSearchLoading(true);
    try {
      const gameDetails = await steamService.getGameDetails(query);
      // Transform the results to match the expected format
      const results = gameDetails
        .map(game => ({
          id: game.id,
          url:
            game.screenshots && game.screenshots.length > 0
              ? steamService.formatImageUrl(game.screenshots[0].url, "screenshot_big")
              : null,
          name: game.name,
        }))
        .filter(game => game.url); // Only include games with screenshots
      setCoverSearchResults(results);
    } catch (error) {
      console.error("Error searching game covers:", error);
      setCoverSearchResults([]);
    } finally {
      setIsCoverSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchGameCovers(coverSearchQuery);
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [coverSearchQuery, searchGameCovers]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <div className="space-y-1">
            <h3 className="text-xl font-semibold tracking-tight">{t("library.loadingLibrary")}</h3>
            <p className="text-sm text-muted-foreground">{t("library.loadingLibraryMessage")}</p>
          </div>
        </div>
      </div>
    );
  }

  const tabGames = activeTab === "favorites"
    ? filteredGames.filter(g => !g.isFolder && favorites.includes(g.game || g.name))
    : filteredGames;

  const sidebarTabs = [
    {
      id: "all",
      label: t("library.pageTitle") || "Library",
      icon: <SquareLibrary className="h-4 w-4" />,
      count: games.filter(g => !g.isFolder).length + getGamesInFolders().length,
    },
    {
      id: "favoritesGallery",
      label: t("library.favoritesGallery.title") || "Favorites",
      icon: <Heart className="h-4 w-4" />,
      count: favorites.length,
    },
    {
      id: "cloud",
      label: t("library.cloudOnly.title") || "Cloud Library",
      icon: <Cloud className="h-4 w-4" />,
      count: cloudOnlyGames.length,
      hidden: !user,
    },
    {
      id: "playLater",
      label: t("library.playLater.title") || "Play Later",
      icon: <Clock className="h-4 w-4" />,
      count: playLaterGames.length,
    },
    {
      id: "history",
      label: t("library.history.title") || "History",
      icon: <History className="h-4 w-4" />,
      count: deletedGames.length,
    }
  ].filter(tab => !tab.hidden);

  return (
    <div className="fixed inset-0 top-[60px] flex overflow-hidden bg-background">
      {/* ── Left Sidebar ─────────────────────────────────────────── */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border/30 shadow-[1px_0_0_0_hsl(var(--border)/0.15)]">

        {/* ── User profile strip ── */}
        <div className="bg-muted/30 rounded-none">
          <div className="flex items-center gap-3 px-4 pb-3 pt-3">
            <button
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-colors hover:opacity-80"
              onClick={() => navigate("/profile")}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
                {userData?.photoURL
                  ? <img src={userData.photoURL} className="h-8 w-8 rounded-full object-cover" alt="" />
                  : <User className="h-3.5 w-3.5 text-primary" />
                }
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold leading-none text-foreground">{username || "Guest"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {games.filter(g => !g.isFolder).length + getGamesInFolders().length}{" "}
                  {t("library.gamesInLibrary") || "games"}
                </p>
              </div>
            </button>
            {ascendAccess.hasAccess && (
              <button
                title={showAscendPanel ? "Hide Ascend" : "Show Ascend"}
                onClick={async () => {
                  const next = !showAscendPanel;
                  setShowAscendPanel(next);
                  if (next && !friendsLoaded) {
                    const { friends: list } = await getFriendsList();
                    setFriends(list || []);
                    setFriendsLoaded(true);
                  }
                }}
                className={cn(
                  "shrink-0 rounded-md p-1.5 transition-colors",
                  showAscendPanel
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* ── Ascend panel ── */}
          {showAscendPanel && ascendAccess.hasAccess && (() => {
            const stats = userData?.profileStats;
            const level = stats?.level ?? 1;
            const xp = stats?.xp ?? 0;
            const nextXP = level * 500;
            const pct = Math.min(100, Math.round((xp / nextXP) * 100));
            const onlineFriends = friends.filter(f => f.status === "online" || f.status === "busy");
            return (
              <div className="px-4 pb-3 pt-1">
                {/* Level + XP */}
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-primary">Level {level}</span>
                  <span className="text-[10px] text-muted-foreground">{xp} / {nextXP} XP</span>
                </div>
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>

                {/* Online friends */}
                {friends.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      Friends {onlineFriends.length > 0 && <span className="text-primary">· {onlineFriends.length} online</span>}
                    </p>
                    <div className="space-y-1">
                      {friends.slice(0, 5).map(friend => (
                        <div key={friend.uid} className="flex items-center gap-2">
                          <div className="relative shrink-0">
                            {friend.photoURL
                              ? <img src={friend.photoURL} className="h-5 w-5 rounded-full object-cover" alt="" />
                              : <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                                  {friend.displayName?.[0]?.toUpperCase()}
                                </div>
                            }
                            <span className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-background",
                              friend.status === "online" ? "bg-green-500"
                              : friend.status === "busy" ? "bg-yellow-500"
                              : "bg-muted-foreground/40"
                            )} />
                          </div>
                          <span className="truncate text-[11px] text-foreground/80">{friend.displayName}</span>
                        </div>
                      ))}
                      {friends.length > 5 && (
                        <p className="text-[10px] text-muted-foreground">+{friends.length - 5} more</p>
                      )}
                    </div>
                  </div>
                )}
                {friends.length === 0 && friendsLoaded && (
                  <p className="text-[11px] text-muted-foreground">No friends yet</p>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── Library views ── */}
        <nav className="space-y-0.5 px-2 pt-3">
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Library</p>
          {(() => {
            const orderedTabs = [
              ...sidebarTabOrder
                .map(id => sidebarTabs.find(t => t.id === id))
                .filter(Boolean),
              ...sidebarTabs.filter(t => !sidebarTabOrder.includes(t.id)),
            ];
            return orderedTabs.map((tab, index) => (
              <div
                key={tab.id}
                onDragEnter={() => { dragOverTabRef.current = index; }}
                onDragOver={e => e.preventDefault()}
                className="group/drag relative"
              >
                {/* Grip handle — absolutely positioned, doesn't affect layout */}
                <div
                  draggable
                  onDragStart={e => { e.stopPropagation(); dragTabRef.current = index; }}
                  onDragEnd={e => {
                    e.stopPropagation();
                    const from = dragTabRef.current;
                    const to = dragOverTabRef.current;
                    if (from === null || to === null || from === to) { dragTabRef.current = null; dragOverTabRef.current = null; return; }
                    const newOrder = orderedTabs.map(t => t.id);
                    const [moved] = newOrder.splice(from, 1);
                    newOrder.splice(to, 0, moved);
                    setSidebarTabOrder(newOrder);
                    safeSetItem("library-tab-order", JSON.stringify(newOrder));
                    dragTabRef.current = null;
                    dragOverTabRef.current = null;
                  }}
                  className="absolute right-1 top-1/2 z-10 -translate-y-1/2 cursor-grab p-1 text-muted-foreground/25 opacity-0 transition-opacity group-hover/drag:opacity-100 active:cursor-grabbing"
                >
                  <GripVertical className="h-3 w-3" />
                </div>

                <button
                  onClick={() => { setActiveTab(tab.id); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all",
                    activeTab === tab.id
                      ? "bg-primary/10 font-semibold text-primary"
                      : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <span className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                    activeTab === tab.id ? "bg-primary/15 text-primary" : "text-muted-foreground"
                  )}>
                    {tab.icon}
                  </span>
                  <span className="flex-1 text-left">{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={cn(
                      "min-w-[1.25rem] rounded px-1 py-0.5 text-center text-[10px] font-bold tabular-nums transition-transform duration-150 group-hover/drag:translate-x-[-14px]",
                      activeTab === tab.id
                        ? "bg-primary/20 text-primary"
                        : "bg-muted/80 text-muted-foreground"
                    )}>
                      {tab.count}
                    </span>
                  )}
                </button>
              </div>
            ));
          })()}
        </nav>

        {/* ── Actions ── */}
        <div className="space-y-0.5 px-2 pt-3">
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Manage</p>

          <TooltipProvider>
            <AlertDialog key="add-game-dialog" open={isAddGameOpen} onOpenChange={setIsAddGameOpen}>
              <AlertDialogTrigger asChild>
                <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span>{t("library.addGame.title") || "Add Game"}</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-border bg-background sm:max-w-[425px]">
                <AlertDialogHeader className="space-y-2">
                  <AlertDialogTitle className="text-2xl font-bold text-foreground">
                    {t("library.addGame.title")}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs text-muted-foreground">
                    {t("library.addGameDescription2")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="max-h-[60vh] overflow-y-auto py-4">
                  <AddGameForm
                    onRestorePrompt={entry => setAddGameRestoreEntry(entry)}
                    onSuccess={() => {
                      setIsAddGameOpen(false);
                      setSelectedGameImage(null);
                      loadGames();
                    }}
                  />
                </div>
              </AlertDialogContent>
            </AlertDialog>

            <button
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground"
              onClick={() => setIsNewFolderOpen(true)}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                <FolderPlus className="h-4 w-4" />
              </span>
              <span>{t("library.newFolder.create") || "New Folder"}</span>
            </button>
            <NewFolderDialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen} onCreate={handleCreateFolder} />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground",
                    isSyncingLibrary && "cursor-not-allowed opacity-50"
                  )}
                  onClick={handleCloudSync}
                  disabled={isSyncingLibrary}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                    {isSyncingLibrary ? <Loader className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                  </span>
                  <span>{t("library.cloudSync") || "Sync to Cloud"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-secondary">
                {user ? t("library.cloudSync") || "Sync to Cloud" : t("library.signInToSync") || "Sign in to sync"}
              </TooltipContent>
            </Tooltip>

            <button
              onClick={() => handleCalculateLibraryValue()}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                <DollarSign className="h-4 w-4" />
              </span>
              <span className="truncate">
                {libraryValueData && !libraryHasChanged()
                  ? `$${libraryValueData.totalValue.toFixed(2)}`
                  : t("library.libraryValue.calculate") || "Library Value"}
              </span>
            </button>
          </TooltipProvider>
        </div>

        {/* ── Spacer pushes storage to bottom ── */}
        <div className="flex-1" />

        {/* ── Storage info ── */}
        <div className="px-4 pb-4 pt-2">
          <div className="rounded-lg bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <HardDrive className="h-3 w-3" />
                <span className="font-medium">{t("library.availableSpace") || "Available"}</span>
              </div>
              <span className="text-xs font-semibold text-foreground">
                {storageInfo ? formatBytes(storageInfo.freeSpace) : <Loader className="h-3 w-3 animate-spin" />}
              </span>
            </div>
            {storageInfo && (
              <>
                <div className="relative h-1 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-primary"
                    style={{ width: `${Math.min((totalGamesSize / storageInfo.totalSpace) * 100, 100)}%`, zIndex: 2 }}
                  />
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-muted-foreground/30"
                    style={{ width: `${Math.min(((storageInfo.totalSpace - storageInfo.freeSpace) / storageInfo.totalSpace) * 100, 100)}%`, zIndex: 1 }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{isCalculatingSize ? "…" : formatBytes(totalGamesSize)} games</span>
                  <span>{formatBytes(storageInfo.totalSpace)}</span>
                </div>

                {/* Multiple directories breakdown */}
                {storageInfo.directories && storageInfo.directories.length > 1 && (
                  <>
                    <button
                      onClick={() => setShowStorageDetails(prev => !prev)}
                      className="mt-1 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      {showStorageDetails ? "Hide details" : "Show details"}
                      <svg
                        className={cn("h-3 w-3 transition-transform", showStorageDetails && "rotate-180")}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {showStorageDetails && (
                      <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
                        {storageInfo.directories.map((dir, idx) => {
                          const usedPct = Math.min((dir.usedSpace / dir.totalSpace) * 100, 100);
                          const gamesPct = Math.min(((dir.gamesSize || 0) / dir.totalSpace) * 100, 100);
                          const label = dir.path.split(/[\\/]/).pop() || dir.path;
                          return (
                            <div key={dir.path || idx} className="space-y-1">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="max-w-[7rem] truncate font-medium text-foreground/80" title={dir.path}>
                                  {label}
                                </span>
                                <span className="text-muted-foreground">
                                  {formatBytes(dir.freeSpace)} free
                                </span>
                              </div>
                              <div className="relative h-1 overflow-hidden rounded-full bg-muted/50">
                                <div
                                  className="absolute left-0 top-0 h-full rounded-full bg-primary/70"
                                  style={{ width: `${gamesPct}%`, zIndex: 2 }}
                                  title={`Games: ${formatBytes(dir.gamesSize || 0)}`}
                                />
                                <div
                                  className="absolute left-0 top-0 h-full rounded-full bg-muted-foreground/20"
                                  style={{ width: `${usedPct}%`, zIndex: 1 }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Sticky toolbar */}
        <div className="flex shrink-0 items-center gap-3 bg-background/95 px-6 py-3 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border)/0.4)]">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("library.searchLibrary")}
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                if (e.target.value && activeTab !== "all") { setActiveTab("all"); }
              }}
              className="h-9 pl-9"
            />
          </div>

          <TooltipProvider>
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
              <DropdownMenuTrigger asChild>
                {(() => {
                  const activeFilterCount = [filters.vrOnly, filters.onlineGames].filter(Boolean).length;
                  const hasActiveFilters = activeFilterCount > 0 || sortMode !== "alpha" || groupBy !== "none";
                  return (
                    <button
                      type="button"
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-all",
                        hasActiveFilters
                          ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                          : "border-border/60 bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <SlidersHorizontal className="h-4 w-4 shrink-0" />
                      <span>{t("search.filters") || "Filter"}</span>
                      {hasActiveFilters && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-secondary">
                          {activeFilterCount + (sortMode !== "alpha" ? 1 : 0) + (groupBy !== "none" ? 1 : 0)}
                        </span>
                      )}
                    </button>
                  );
                })()}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                {/* Sort section */}
                <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{t("library.sort.aToZ").replace("Sort ", "") === "A to Z" ? "Sort" : "Sort"}</p>
                {[
                  { label: t("library.sort.aToZ"), icon: <ArrowUpAZ className="h-4 w-4" />, active: sortMode === "alpha" && sortOrder === "asc", onClick: () => { setSortOrder("asc"); setSortMode("alpha"); } },
                  { label: t("library.sort.zToA"), icon: <ArrowDownAZ className="h-4 w-4" />, active: sortMode === "alpha" && sortOrder === "desc", onClick: () => { setSortOrder("desc"); setSortMode("alpha"); } },
                  { label: t("library.sort.mostPlayed"), icon: <Timer className="h-4 w-4" />, active: sortMode === "playtime", onClick: () => setSortMode("playtime") },
                ].map(item => (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={item.onClick}
                    className={cn(
                      "cursor-pointer rounded-md px-2 py-1.5",
                      item.active ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                    )}
                  >
                    <span className={cn("mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", item.active ? "bg-primary/20 text-primary" : "bg-muted/60 text-muted-foreground")}>
                      {item.icon}
                    </span>
                    {item.label}
                    {item.active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator className="my-1.5" />

                {/* Group By section */}
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{t("library.sort.groupBy")}</p>
                {[
                  { label: t("library.sort.groupNone"), icon: <SquareLibrary className="h-4 w-4" />, active: groupBy === "none", onClick: () => setGroupBy("none") },
                  { label: t("library.sort.groupByDirectory"), icon: <HardDriveDownload className="h-4 w-4" />, active: groupBy === "directory", onClick: () => setGroupBy("directory") },
                ].map(item => (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={item.onClick}
                    className={cn(
                      "cursor-pointer rounded-md px-2 py-1.5",
                      item.active ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                    )}
                  >
                    <span className={cn("mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", item.active ? "bg-primary/20 text-primary" : "bg-muted/60 text-muted-foreground")}>
                      {item.icon}
                    </span>
                    {item.label}
                    {item.active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator className="my-1.5" />

                {/* Filters section */}
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{t("search.filters") || "Filters"}</p>
                <DropdownMenuItem
                  onClick={() => setFilters(prev => ({ ...prev, vrOnly: !prev.vrOnly }))}
                  className={cn("cursor-pointer rounded-md px-2 py-1.5", filters.vrOnly ? "bg-primary/10 text-primary font-medium" : "text-foreground")}
                >
                  <span className={cn("mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", filters.vrOnly ? "bg-primary/20 text-primary" : "bg-muted/60 text-muted-foreground")}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2 10C2 8.89543 2.89543 8 4 8H20C21.1046 8 22 8.89543 22 10V17C22 18.1046 21.1046 19 20 19H16.1324C15.4299 19 14.7788 18.6314 14.4174 18.029L12.8575 15.4292C12.4691 14.7818 11.5309 14.7818 11.1425 15.4292L9.58261 18.029C9.22116 18.6314 8.57014 19 7.86762 19H4C2.89543 19 2 18.1046 2 17V10Z" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3.81253 6.7812C4.5544 5.6684 5.80332 5 7.14074 5H16.8593C18.1967 5 19.4456 5.6684 20.1875 6.7812L21 8H3L3.81253 6.7812Z" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("library.filters.vrGames")}
                  {filters.vrOnly && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setFilters(prev => ({ ...prev, onlineGames: !prev.onlineGames }))}
                  className={cn("cursor-pointer rounded-md px-2 py-1.5", filters.onlineGames ? "bg-primary/10 text-primary font-medium" : "text-foreground")}
                >
                  <span className={cn("mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", filters.onlineGames ? "bg-primary/20 text-primary" : "bg-muted/60 text-muted-foreground")}>
                    <Gamepad2 className="h-4 w-4" />
                  </span>
                  {t("library.filters.onlineGames")}
                  {filters.onlineGames && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn("rounded-md p-2 hover:bg-secondary/50", selectionMode && "bg-primary/10 text-primary")}
                  type="button"
                  onClick={() => { setSelectionMode(prev => !prev); setSelectedGames([]); }}
                >
                  <CheckSquareIcon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-secondary">{t("library.multiselect")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {selectionMode && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-primary">
                {t("library.tools.selected", { count: selectedGames.length })}
              </span>
              <Button variant="destructive" size="sm" disabled={selectedGames.length === 0} onClick={handleBulkRemove}>
                {t("library.tools.bulkRemove")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setSelectionMode(false); setSelectedGames([]); }}>
                {t("common.cancel")}
              </Button>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        {/* Scrollable game grid */}
        <div className="flex-1 overflow-y-auto px-6 pt-5 pb-28">
          {/* ── Tab page header ── */}
          {activeTab !== "favoritesGallery" && (() => {
            const tabMeta = {
              all: {
                icon: <SquareLibrary className="h-5 w-5 text-primary" />,
                title: t("library.pageTitle") || "My Library",
                subtitle: t("library.pageSubtitle") || "All your installed games in one place.",
              },
              cloud: {
                icon: <Cloud className="h-5 w-5 text-primary" />,
                title: t("library.cloudOnly.title") || "Cloud Library",
                subtitle: t("library.cloudOnly.subtitle") || "Games stored in your cloud backup.",
              },
              playLater: {
                icon: <Clock className="h-5 w-5 text-primary" />,
                title: t("library.playLater.title") || "Play Later",
                subtitle: t("library.playLater.subtitle") || "Games you've saved to download later.",
              },
              history: {
                icon: <History className="h-5 w-5 text-primary" />,
                title: t("library.history.title") || "History",
                subtitle: t("library.history.subtitle") || "Games you've removed. Their playtime and stats are preserved here.",
              },
            };
            const meta = tabMeta[activeTab];
            if (!meta) return null;
            return (
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  {React.cloneElement(meta.icon, { className: "h-6 w-6 text-primary" })}
                </div>
                <div className="flex flex-col gap-0">
                  <h2 className="text-2xl font-bold leading-none text-foreground">{meta.title}</h2>
                  <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
                </div>
              </div>
            );
          })()}

          {/* ── All Games / Favorites tab ── */}
          {(activeTab === "all" || activeTab === "favorites") && (() => {
            const renderGameCard = game => (
              <div key={getLibraryCardKey(game)}>
                {game.isFolder ? (
                  <DroppableFolderCard
                    folder={game}
                    onDropGame={droppedGame => {
                      addGameToFolder(droppedGame, game.game);
                      const updatedFolders = loadFolders();
                      const updatedFolder = updatedFolders.find(f => f.game === game.game);
                      setFolders(updatedFolders);
                      setGames(prevGames =>
                        prevGames
                          .map(g => {
                            if (g.isFolder && g.game === game.game) return { ...updatedFolder };
                            return g;
                          })
                          .filter(g =>
                            (g.game || g.name) !== (droppedGame.game || droppedGame.name) ||
                            (g.isFolder && g.game === game.game)
                          )
                      );
                    }}
                  >
                    <FolderCard
                      key={game.game + "-" + (game.items ? game.items.length : 0)}
                      name={game.game || game.name}
                      folder={game}
                      refreshKey={game.items ? game.items.length : 0}
                    />
                  </DroppableFolderCard>
                ) : (
                  <DraggableGameCard game={game}>
                    <InstalledGameCard
                      game={game}
                      onPlay={() => selectionMode ? handleSelectGame(game) : handlePlayGame(game)}
                      favorites={favorites}
                      onToggleFavorite={() => toggleFavorite(game.game || game.name)}
                      selectionMode={selectionMode}
                      isSelected={selectedGames.includes(game.game)}
                      onSelectCheckbox={() => handleSelectGame(game)}
                      updateInfo={game.gameID ? gameUpdates[game.gameID] : null}
                    />
                  </DraggableGameCard>
                )}
              </div>
            );

            const gridClass = "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

            if (groupBy === "directory") {
              // Build directory groups from all filtered games so each section is complete
              const dirGroups = new Map();
              tabGames.forEach(game => {
                const dir = game._sourceDir || t("library.sort.addedGames");
                if (!dirGroups.has(dir)) dirGroups.set(dir, []);
                dirGroups.get(dir).push(game);
              });

              return (
                <DndProvider backend={HTML5Backend}>
                  {dirGroups.size === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                      <SquareLibrary className="mb-4 h-12 w-12 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">{t("library.noGamesFound")}</p>
                    </div>
                  )}
                  {[...dirGroups.entries()].map(([dir, dirGames]) => {
                    const label = dir.split(/[\\/]/).pop() || dir;
                    return (
                      <div key={dir} className="mb-8">
                        <div className="mb-3 flex items-center gap-2">
                          <HardDriveDownload className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70" title={dir}>{label}</span>
                          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">{dirGames.length}</span>
                          <div className="ml-1 flex-1 border-t border-border/30" />
                        </div>
                        <div className={gridClass}>
                          {dirGames.sort((a, b) => (a.isFolder === b.isFolder ? 0 : a.isFolder ? -1 : 1)).map(renderGameCard)}
                        </div>
                      </div>
                    );
                  })}
                </DndProvider>
              );
            }

            return (
              <DndProvider backend={HTML5Backend}>
                {tabGames.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <SquareLibrary className="mb-4 h-12 w-12 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {activeTab === "favorites" ? (t("library.filters.favorites.empty")) : t("library.noGamesFound") || "No games found"}
                    </p>
                  </div>
                ) : (
                  <div className={gridClass}>
                    {tabGames
                      .sort((a, b) => (a.isFolder === b.isFolder ? 0 : a.isFolder ? -1 : 1))
                      .map(renderGameCard)}
                  </div>
                )}
              </DndProvider>
            );
          })()}

          {/* ── Cloud Library tab ── */}
          {activeTab === "cloud" && (
            <>
              {loadingCloudGames ? (
                <div className="flex items-center justify-center py-24">
                  <Loader className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : cloudOnlyGames.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Cloud className="mb-4 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">{t("library.cloudOnly.empty") || "No cloud-only games"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {cloudOnlyGames.map(game => (
                    <CloudOnlyGameCard
                      key={getLibraryCardKey(game)}
                      game={game}
                      imageData={cloudGameImages[game.name]}
                      onRestore={() => handleRestoreFromCloud(game)}
                      isRestoring={restoringGame === game.name}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Play Later tab ── */}
          {activeTab === "playLater" && (
            <>
              {playLaterGames.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Clock className="mb-4 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">{t("library.playLater.empty") || "No games in Play Later"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {playLaterGames.map(game => (
                    <PlayLaterGameCard
                      key={getLibraryCardKey(game)}
                      game={game}
                      onDownload={() => handleDownloadPlayLater(game)}
                      onRemove={() => handleRemoveFromPlayLater(game.game)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── History tab (games deleted with "Save Data") ── */}
          {activeTab === "history" && (
            <>
              {deletedGames.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <History className="mb-4 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-foreground">{t("library.history.empty") || "No game history yet"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("library.history.emptyHint") || "Delete a game and choose \"Save Data\" to keep it here."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {deletedGames.map(game => (
                    <DeletedGameCard
                      key={getLibraryCardKey(game)}
                      game={game}
                      onRestore={() => handleRestoreDeletedGame(game)}
                      onRemove={() => handleRemoveFromHistory(game)}
                      isRestoring={restoringDeletedGame === (game.game || game.name)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Favorites Gallery tab ── */}
          {activeTab === "favoritesGallery" && (() => {
            // Installed games that are favorited
            const installedFavNames = new Set(
              games.filter(g => !g.isFolder).map(g => g.game || g.name)
            );
            // Stub entries for favorited games not yet installed
            const favMeta = JSON.parse(localStorage.getItem("game-favorites-meta") || "{}");
            const uninstalledFavStubs = favorites
              .filter(name => !installedFavNames.has(name))
              .map(name => ({
                game: name,
                name,
                _isStub: true,
                ...(favMeta[name] || {}),
              }));
            const favGames = [
              ...games.filter(g => !g.isFolder && favorites.includes(g.game || g.name)),
              ...uninstalledFavStubs,
            ];

            // Collect all genres from favorite games
            const genreSet = new Set();
            favGames.forEach(g => {
              const cats = Array.isArray(g.category) ? g.category : [];
              cats.forEach(c => genreSet.add(c));
            });
            const allGenres = ["all", ...Array.from(genreSet).sort()];

            // Filter by genre
            const genreFiltered = favGalleryGenreFilter === "all"
              ? favGames
              : favGames.filter(g => {
                  const cats = Array.isArray(g.category) ? g.category : [];
                  return cats.includes(favGalleryGenreFilter);
                });

            // Sort
            const sorted = [...genreFiltered].sort((a, b) => {
              const aName = a.game || a.name || "";
              const bName = b.game || b.name || "";
              switch (favGallerySortMode) {
                case "rating": {
                  const ar = gameRatings[aName] || 0;
                  const br = gameRatings[bName] || 0;
                  return br !== ar ? br - ar : aName.localeCompare(bName);
                }
                case "playtime": {
                  const at = a.playTime || 0;
                  const bt = b.playTime || 0;
                  return bt !== at ? bt - at : aName.localeCompare(bName);
                }
                case "recentlyPlayed": {
                  const al = a.lastPlayed || 0;
                  const bl = b.lastPlayed || 0;
                  return bl - al;
                }
                case "recentlyAdded": {
                  const aa = a.addedAt || 0;
                  const ba = b.addedAt || 0;
                  return ba - aa;
                }
                case "alpha":
                default:
                  return aName.localeCompare(bName);
              }
            });

            const sortOptions = [
              { id: "rating", label: t("library.favoritesGallery.sort.highestRating") || "Highest Rating" },
              { id: "playtime", label: t("library.favoritesGallery.sort.mostPlayed") || "Most Played" },
              { id: "recentlyPlayed", label: t("library.favoritesGallery.sort.recentlyPlayed") || "Recently Played" },
              { id: "recentlyAdded", label: t("library.favoritesGallery.sort.recentlyAdded") || "Recently Added" },
              { id: "alpha", label: t("library.sort.aToZ") || "A → Z" },
            ];

            return (
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                        <Heart className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex flex-col gap-0">
                        <h2 className="text-2xl font-bold leading-none text-foreground">
                          {t("library.favoritesGallery.title") || "Favorites"}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {t("library.favoritesGallery.subtitle") || "Your favorite games, rated and organized by you."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sort dropdown */}
                  <div className="flex shrink-0 items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          {t("library.favoritesGallery.sortBy") || "Sort by"}
                          <span className="ml-1 text-primary">
                            {sortOptions.find(s => s.id === favGallerySortMode)?.label || "Highest Rating"}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {sortOptions.map(opt => (
                          <DropdownMenuItem
                            key={opt.id}
                            className={cn("cursor-pointer", favGallerySortMode === opt.id && "bg-accent/50 font-semibold text-primary")}
                            onClick={() => setFavGallerySortMode(opt.id)}
                          >
                            {opt.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Genre filter chips */}
                {allGenres.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {allGenres.map(genre => {
                      const count = genre === "all"
                        ? favGames.length
                        : favGames.filter(g => (Array.isArray(g.category) ? g.category : []).includes(genre)).length;
                      return (
                        <button
                          key={genre}
                          onClick={() => setFavGalleryGenreFilter(genre)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all",
                            favGalleryGenreFilter === genre
                              ? "bg-primary text-secondary shadow-sm"
                              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <span className="capitalize">{genre === "all" ? (t("library.favoritesGallery.allGames") || "All Games") : genre}</span>
                          <span className={cn(
                            "rounded px-1 py-0.5 text-[10px] font-bold tabular-nums",
                            favGalleryGenreFilter === genre ? "bg-secondary/20 text-secondary" : "bg-muted text-muted-foreground"
                          )}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Gallery grid */}
                {sorted.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <Heart className="mb-4 h-12 w-12 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-foreground">{t("library.favoritesGallery.empty") || "No favorites yet"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("library.favoritesGallery.emptyHint") || "Hover over a game and click the heart icon to add it here."}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {sorted.map(game => (
                      <FavoritesGalleryCard
                        key={getLibraryCardKey(game)}
                        game={game}
                        rating={gameRatings[game.game || game.name] || 0}
                        onRate={rating => setGameRating(game.game || game.name, rating)}
                        onPlay={() => !game._isStub && handlePlayGame(game)}
                        onDownload={game._isStub ? async () => {
                          // Look up full game data from local index so the Download page
                          // receives download_links, version, size, etc.
                          const favMeta = JSON.parse(localStorage.getItem("game-favorites-meta") || "{}");
                          const meta = favMeta[game.game || game.name] || {};
                          let fullGame = null;
                          const gid = game.gameID || meta.gameID;
                          if (gid) {
                            try {
                              fullGame = await gameService.findGameByGameID(gid);
                            } catch { /* fall through */ }
                          }
                          if (!fullGame && (game.game || game.name)) {
                            try {
                              const results = await gameService.searchGames(game.game || game.name);
                              fullGame = results.find(r => r.game === (game.game || game.name)) || null;
                            } catch { /* fall through */ }
                          }
                          navigate("/download", { state: { gameData: fullGame || { ...game, ...meta } } });
                        } : undefined}
                        onUnfavorite={() => toggleFavorite(game.game || game.name)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Library Value Dialog */}
      <AlertDialog open={isLibraryValueOpen} onOpenChange={setIsLibraryValueOpen}>
        <AlertDialogContent className="flex max-h-[80vh] max-w-lg flex-col overflow-hidden">
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle className="flex items-center gap-2">
              {t("library.libraryValue.title") || "Library Value"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("library.libraryValue.description1")}&nbsp;
              <a
                className="cursor-pointer text-primary hover:underline"
                onClick={() => window.electron.openURL("https://apidocs.cheapshark.com/")}
              >
                {t("library.libraryValue.description2")}{" "}
                <ExternalLink className="mb-1 inline-block h-3 w-3" />
              </a>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {/* Ascend Promo for non-subscribers */}
            {!user && libraryValueData?.totalValue > 0 && (
              <div className="mb-4 rounded-lg border border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/20 p-2">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-primary">
                      {t("library.libraryValue.ascendPromo.title") ||
                        "You've saved a fortune!"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("library.libraryValue.ascendPromo.message", {
                        months: Math.floor(
                          libraryValueData.totalValue / 2
                        ).toLocaleString(),
                        years: Math.floor(
                          libraryValueData.totalValue / 2 / 12
                        ).toLocaleString(),
                      })}
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-2 h-auto p-0 text-xs text-primary"
                      onClick={() => {
                        setIsLibraryValueOpen(false);
                        navigate("/ascend");
                      }}
                    >
                      {t("library.libraryValue.ascendPromo.cta") || "Learn about Ascend"}{" "}
                      →
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {isCalculatingValue ? (
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <Loader className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {t("library.libraryValue.calculating") || "Calculating..."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {valueProgress.current} / {valueProgress.total}
                  </p>
                  {valueProgress.game && (
                    <p className="mt-1 max-w-[300px] truncate text-xs text-muted-foreground">
                      {valueProgress.game}
                    </p>
                  )}
                </div>
                <div className="w-full max-w-xs">
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all duration-300"
                      style={{
                        width: `${valueProgress.total > 0 ? (valueProgress.current / valueProgress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : libraryValueData ? (
              <div className="space-y-4">
                {/* Total Value */}
                <div className="rounded-lg bg-primary/10 p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("library.libraryValue.totalValue") || "Total Library Value"}
                  </p>
                  <p className="text-3xl font-bold text-primary">
                    ${libraryValueData.totalValue.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("library.libraryValue.gamesFound", {
                      count: libraryValueData.games.length,
                    }) || `${libraryValueData.games.length} games found`}
                  </p>
                </div>

                {/* Games List */}
                {libraryValueData.games.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-primary">
                      {t("library.libraryValue.breakdown") || "Price Breakdown"}
                    </p>
                    <div className="max-h-[200px] space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                      {libraryValueData.games
                        .sort((a, b) => b.price - a.price)
                        .map((game, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/50"
                          >
                            <span
                              className="truncate pr-2 text-primary"
                              title={game.title}
                            >
                              {game.title}
                            </span>
                            <span className="shrink-0 font-medium text-primary">
                              ${game.price.toFixed(2)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Not Found Games */}
                {libraryValueData.notFound.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("library.libraryValue.notFound", {
                        count: libraryValueData.notFound.length,
                      }) || `${libraryValueData.notFound.length} games not found`}
                    </p>
                    <div className="max-h-[100px] space-y-1 overflow-y-auto rounded-lg border border-border/50 p-2">
                      {libraryValueData.notFound.map((game, index) => (
                        <div
                          key={index}
                          className="truncate px-2 py-1 text-xs text-muted-foreground"
                          title={game}
                        >
                          {game}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <AlertDialogFooter className="flex justify-between sm:justify-between">
            {libraryValueData && !isCalculatingValue && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCalculateLibraryValue(true)}
                className="mr-auto text-primary"
              >
                {t("library.libraryValue.recalculate") || "Recalculate"}
              </Button>
            )}
            <AlertDialogCancel>{t("common.close") || "Close"}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Library Welcome Dialog ── */}
      <AlertDialog open={showRedesignDialog} onOpenChange={setShowRedesignDialog}>
        <AlertDialogContent className="border-border sm:max-w-[500px]">
          <AlertDialogHeader>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <AlertDialogTitle className="text-xl mt-2 font-bold text-foreground">
                {t("library.redesignWelcome.title")}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p className="text-sm text-muted-foreground">
                  {t("library.redesignWelcome.subtitle")}
                </p>
                <div className="space-y-2.5 rounded-lg bg-muted/40 p-3 text-sm">
                  {[
                    { icon: <GripVertical className="h-4 w-4 text-primary" />, title: t("library.redesignWelcome.feature1Title"), desc: t("library.redesignWelcome.feature1Desc") },
                    { icon: <Heart className="h-4 w-4 text-primary" />, title: t("library.redesignWelcome.feature2Title"), desc: t("library.redesignWelcome.feature2Desc") },
                    { icon: <Star className="h-4 w-4 text-primary" />, title: t("library.redesignWelcome.feature3Title"), desc: t("library.redesignWelcome.feature3Desc") },
                    { icon: <ArrowDown className="h-4 w-4 text-primary" />, title: t("library.redesignWelcome.feature4Title"), desc: t("library.redesignWelcome.feature4Desc") },
                    { icon: <SquareLibrary className="h-4 w-4 text-primary" />, title: t("library.redesignWelcome.feature5Title"), desc: t("library.redesignWelcome.feature5Desc") },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">{icon}</div>
                      <span className="text-foreground/80"><span className="font-medium text-foreground">{title}</span> — {desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                localStorage.setItem("library-welcome-v2-shown", "true");
                setShowRedesignDialog(false);
              }}
            >
              {t("library.redesignWelcome.cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Restore Game Data Dialog (for re-added custom games) ── */}
      {addGameRestoreEntry && (() => {
        const { gameName, stub } = addGameRestoreEntry;
        const secs = stub?.playTime || 0;
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const playtimeLabel = secs > 60 ? (h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`) : null;
        return (
          <AlertDialog open onOpenChange={() => {}}>
            <AlertDialogContent className="sm:max-w-[440px]">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-xl font-bold text-foreground">
                  {t("library.restoreGameDataTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 pt-1">
                    <p className="text-sm text-muted-foreground">
                      {t("library.restoreGameDataDescription", { game: gameName })}
                    </p>
                    {playtimeLabel && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <Timer className="h-4 w-4 shrink-0 text-primary" />
                        <span className="text-foreground/80">
                          <span className="font-medium text-foreground">{playtimeLabel}</span> of playtime saved
                        </span>
                      </div>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex gap-2">
                <Button variant="outline" className="text-primary" onClick={async () => {
                  try { await window.electron.discardDeletedGameData(gameName); } catch (e) {}
                  setAddGameRestoreEntry(null);
                }}>
                  {t("library.restoreGameDataNo")}
                </Button>
                <Button className="text-secondary" onClick={async () => {
                  try { await window.electron.restoreDeletedGameData(gameName); } catch (e) {}
                  setAddGameRestoreEntry(null);
                  await loadGames();
                }}>
                  {t("library.restoreGameDataYes")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </div>
  );
};

const AddGameCard = React.forwardRef((props, ref) => {
  const { t } = useLanguage();
  return (
    <Card
      ref={ref}
      className={cn(
        "group relative overflow-hidden transition-colors",
        "cursor-pointer border-2 border-dashed border-muted hover:border-primary"
      )}
      {...props}
    >
      <CardContent className="flex h-full min-h-[240px] flex-col items-center justify-center p-6 text-muted-foreground group-hover:text-primary">
        <div className="rounded-full bg-muted p-6 group-hover:bg-primary/10">
          <Plus className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">{t("library.addGame.title")}</h3>
        <p className="mt-2 text-center text-sm">{t("library.addGameDescription1")}</p>
      </CardContent>
    </Card>
  );
});

AddGameCard.displayName = "AddGameCard";

const hasShownRatingDisclaimer = () => !!localStorage.getItem("rating-disclaimer-shown");

const StarRating = ({ value, onChange, size = "sm" }) => {
  const [hovered, setHovered] = useState(null);
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => {
        const filled = (hovered ?? value) >= star;
        return (
          <button
            key={star}
            type="button"
            className="focus:outline-none"
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            onClick={e => { e.stopPropagation(); onChange(value === star ? 0 : star); }}
          >
            <Star
              className={cn(
                iconClass,
                "transition-colors",
                filled ? "fill-yellow-400 text-yellow-400" : "fill-none text-muted-foreground/50 hover:text-yellow-300"
              )}
            />
          </button>
        );
      })}
    </div>
  );
};

const FavoritesGalleryCard = memo(({ game, rating, onRate, onPlay, onDownload, onUnfavorite }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [imageData, setImageData] = useState(() => gameImageCache.get(game.game || game.name) ?? null);
  const [isHovered, setIsHovered] = useState(false);
  const [pendingRating, setPendingRating] = useState(null);
  const [showRatingDisclaimer, setShowRatingDisclaimer] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaveDataDialogOpen, setIsSaveDataDialogOpen] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);

  const handleContextMenu = e => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 240;
    const menuHeight = 200;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = Math.max(0, window.innerWidth - menuWidth);
    if (y + menuHeight > window.innerHeight) y = Math.max(0, y - menuHeight);
    setContextMenuPosition({ x, y });
    setContextMenuOpen(true);
  };

  const confirmDelete = () => {
    setIsDeleteDialogOpen(false);
    if (!game.isCustom) {
      setIsSaveDataDialogOpen(true);
    } else {
      performDelete(false);
    }
  };

  const performDelete = async (saveData) => {
    try {
      setIsUninstalling(true);
      const gameId = game.game || game.name;
      if (saveData) {
        await window.electron.saveDeletedGameData(gameId);
      }
      if (game.isCustom) {
        await window.electron.removeCustomGame(gameId);
      } else {
        await window.electron.deleteGame(gameId);
      }
      setIsUninstalling(false);
      setIsSaveDataDialogOpen(false);
      window.location.reload();
    } catch {
      setIsUninstalling(false);
    }
  };

  const handleRate = newRating => {
    if (!hasShownRatingDisclaimer()) {
      setPendingRating(newRating);
      setShowRatingDisclaimer(true);
    } else {
      onRate(newRating);
    }
  };
  const gameName = game.game || game.name || "";
  const categories = Array.isArray(game.category) ? game.category.slice(0, 2) : [];

  useEffect(() => {
    let cancelled = false;
    const gameId = game.game || game.name;
    if (gameImageCache.has(gameId)) {
      setImageData(gameImageCache.get(gameId));
      return;
    }
    (async () => {
      // Stub (uninstalled): use imageCacheService by imgID, then SteamGridDB by name
      if (game._isStub) {
        if (game.imgID) {
          try {
            const { default: imageCacheSvc } = await import("@/services/imageCacheService");
            const url = await imageCacheSvc.getImage(game.imgID, { priority: "normal", quality: "high" });
            if (url && !cancelled) {
              gameImageCache.set(gameId, url);
              setImageData(url);
              return;
            }
          } catch { /* fall through */ }
        }
        if (gameId) {
          try {
            const { default: sgSvc } = await import("@/services/steamGridImageService");
            const assets = await sgSvc.getAssets(gameId);
            const url = sgSvc.pickUrl(assets, "card");
            if (url && !cancelled) {
              gameImageCache.set(gameId, url);
              setImageData(url);
            }
          } catch { /* silent */ }
        }
        return;
      }
      // Installed game: prefer portrait grid image for 2:3 card layout
      try {
        const base64 =
          (await window.electron.getGameImage(gameId, "grid")) ||
          (await window.electron.getGameImage(gameId, "hero")) ||
          (await window.electron.getGameImage(gameId));
        if (!cancelled && base64) {
          const dataUrl = `data:image/jpeg;base64,${base64}`;
          gameImageCache.set(gameId, dataUrl);
          setImageData(dataUrl);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [game.game, game.name, game._isStub, game.imgID]);

  const formatPlaytime = secs => {
    if (!secs || secs < 60) return t("library.neverPlayed") || "Never played";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h === 0) return `${m} minutes`;
    if (m === 0) return `${h} hours`;
    return `${h} hours ${m} minutes`;
  };

  return (
    <>
      <AlertDialog open={showRatingDisclaimer} onOpenChange={setShowRatingDisclaimer}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" />
              {t("library.favoritesGallery.ratingDisclaimer.title") || "Personal Rating"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("library.favoritesGallery.ratingDisclaimer.description") || "This rating is stored locally on your device only. It's purely personal and is never shared, posted, or submitted anywhere."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              localStorage.setItem("rating-disclaimer-shown", "true");
              setShowRatingDisclaimer(false);
              if (pendingRating !== null) { onRate(pendingRating); setPendingRating(null); }
            }}>
              {t("common.gotIt") || "Got it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    {/* Delete confirmation */}
    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("library.confirmDelete")}</AlertDialogTitle>
          <AlertDialogDescription>{t("library.confirmDeleteDescription", { game: game.game || game.name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} disabled={isUninstalling}>
            {isUninstalling ? t("library.uninstalling") : t("library.delete", { game: game.game || game.name })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Save Game Data Dialog */}
    <AlertDialog open={isSaveDataDialogOpen} onOpenChange={setIsSaveDataDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">{t("library.saveGameDataTitle")}</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("library.saveGameDataDescription", { game: game.game || game.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <Button variant="outline" className="text-primary" onClick={() => performDelete(false)} disabled={isUninstalling}>
            {t("library.saveGameDataNo")}
          </Button>
          <Button className="text-secondary" onClick={() => performDelete(true)} disabled={isUninstalling}>
            {isUninstalling ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("library.deleting")}
              </>
            ) : (
              t("library.saveGameDataYes")
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Context menu portal */}
    {contextMenuOpen && createPortal(
      <div
        className="fixed inset-0 z-[9999]"
        onClick={() => setContextMenuOpen(false)}
        onContextMenu={e => e.preventDefault()}
      >
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
        <div
          className="absolute animate-in fade-in zoom-in-95 duration-200"
          style={{ top: contextMenuPosition.y, left: contextMenuPosition.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="min-w-[240px] overflow-hidden rounded-xl border border-border/50 bg-popover/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-center border-b border-border/50 px-3 py-3">
              <span className="text-sm font-semibold text-foreground">{game.game || game.name}</span>
            </div>
            <div className="p-1.5">
              {!game._isStub && game.executable && (
                <button
                  onClick={() => { setContextMenuOpen(false); onPlay(); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20">
                    <Play className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{t("common.contextMenu.playGame")}</div>
                    <div className="text-xs text-muted-foreground">{t("common.contextMenu.playGameDescription")}</div>
                  </div>
                </button>
              )}
              {!game._isStub && (
                <button
                  onClick={async () => { setContextMenuOpen(false); try { await window.electron.openGameDirectory(game.game || game.name); } catch {} }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/30">
                    <FolderOpen className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{t("common.contextMenu.openDirectory")}</div>
                    <div className="text-xs text-muted-foreground">{t("common.contextMenu.openDirectoryDescription")}</div>
                  </div>
                </button>
              )}
              <button
                onClick={() => { setContextMenuOpen(false); onUnfavorite(); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/30">
                  <Heart className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{t("library.favoritesGallery.removeFromFavorites") || "Remove from favorites"}</div>
                </div>
              </button>
              {!game._isStub && (
                <>
                  <div className="my-1.5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                  <button
                    onClick={() => { setContextMenuOpen(false); setIsDeleteDialogOpen(true); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-destructive/10 hover:translate-x-0.5"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-500/20">
                      <Trash2 className="h-4 w-4 text-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{game.isCustom ? t("common.contextMenu.removeGame") : t("common.contextMenu.deleteGame")}</div>
                      <div className="text-xs text-muted-foreground">{game.isCustom ? t("common.contextMenu.removeGameDescription") : t("common.contextMenu.deleteGameDescription")}</div>
                    </div>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}

    <Card
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card shadow-md transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-2xl hover:border-primary/40",
        "cursor-pointer"
      )}
      onClick={game._isStub ? onDownload : onPlay}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-0">
        <div className="relative aspect-[2/3] overflow-hidden">
          {imageData ? (
            <img
              src={imageData}
              alt={gameName}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Gamepad2 className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}

          {/* Star badge top-left */}
          {rating > 0 && (
            <div className="absolute left-2 top-2 z-20 flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-[11px] font-bold text-white">{rating}.0</span>
            </div>
          )}

          {/* Hover overlay */}
          <div className={cn(
            "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-3 transition-opacity duration-200",
            isHovered ? "opacity-100" : "opacity-0"
          )}>
            <p className="mb-1.5 line-clamp-2 text-sm font-bold leading-tight text-white">{gameName}</p>

            {/* Genre chips */}
            {categories.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {categories.map(cat => (
                  <span key={cat} className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/90">{cat}</span>
                ))}
              </div>
            )}

            {/* Playtime row — hidden for uninstalled stubs */}
            {!game._isStub && (
              <div className="mb-2 flex items-center gap-1.5 text-xs text-white/70">
                <Clock className="h-3 w-3 shrink-0" />
                <span>{formatPlaytime(game.playTime)}</span>
              </div>
            )}

            {/* Download badge for uninstalled stubs */}
            {game._isStub && (
              <div className="mb-2 flex items-center gap-1 rounded-md bg-primary/80 px-2 py-1 text-[11px] font-semibold text-white w-fit">
                <Download className="h-3 w-3" />
                {t("gameCard.viewDetails") || "Not installed"}
              </div>
            )}

            {/* Star rating row */}
            <div className="flex items-center justify-between">
              <StarRating value={rating} onChange={handleRate} />
              <button
                type="button"
                className="rounded-md p-1 hover:bg-white/20"
                onClick={e => { e.stopPropagation(); onUnfavorite(); }}
                title={t("library.favoritesGallery.removeFromFavorites") || "Remove from favorites"}
              >
                <Heart className="h-4 w-4 fill-primary text-primary" />
              </button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-0.5 px-3 py-2">
        <h3 className="w-full truncate text-sm font-semibold leading-tight text-foreground">{gameName}</h3>
        <div className="flex w-full items-center justify-between">
          <p className="text-xs text-muted-foreground">{formatPlaytime(game.playTime)}</p>
          {rating > 0 ? (
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(s => (
                <Star key={s} className={cn("h-2.5 w-2.5", s <= rating ? "fill-yellow-400 text-yellow-400" : "fill-none text-muted-foreground/30")} />
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">{t("library.favoritesGallery.noRating") || "Unrated"}</span>
          )}
        </div>
      </CardFooter>
    </Card>
    </>
  );
});

FavoritesGalleryCard.displayName = "FavoritesGalleryCard";

const InstalledGameCard = memo(
  ({
    game,
    onPlay,
    isSelected,
    favorites,
    onToggleFavorite,
    selectionMode,
    onSelectCheckbox,
    updateInfo,
  }) => {
    const { t } = useLanguage();
    const { settings } = useSettings();
    const navigate = useNavigate();
    const [isRunning, setIsRunning] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [imageData, setImageData] = useState(() => gameImageCache.get(game.game || game.name) ?? null);
    const [executableExists, setExecutableExists] = useState(null);
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    const [logoData, setLogoData] = useState(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isSaveDataDialogOpen, setIsSaveDataDialogOpen] = useState(false);
    const [isUninstalling, setIsUninstalling] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const isFavorite = favorites.includes(game.game || game.name);

    useEffect(() => {
      const checkExecutable = async () => {
        if (game.executable && !game.isCustom) {
          try {
            const execPath = `${game.game}/${game.executable}`;
            const exists = await window.electron.checkFileExists(execPath);
            setExecutableExists(exists);
          } catch (error) {
            console.error("Error checking executable:", error);
            setExecutableExists(false);
          }
        }
      };

      checkExecutable();
    }, [game.executable, game.isCustom, game.game]);

    // Check game running status periodically
    useEffect(() => {
      let isMounted = true;
      const gameId = game.game || game.name;

      const checkGameStatus = async () => {
        try {
          if (!isMounted) return;
          const running = await window.electron.isGameRunning(gameId);
          if (isMounted) {
            setIsRunning(running);
          }
        } catch (error) {
          console.error("Error checking game status:", error);
        }
      };

      // Initial check
      checkGameStatus();

      // Set up interval for periodic checks - reduced frequency to 3 seconds
      const interval = setInterval(checkGameStatus, 3000);

      // Cleanup function
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }, [game.game, game.name]); // Only depend on game ID properties

    // Load game image via IPC (no localStorage caching - data URLs blow out
    // the per-origin localStorage quota; IPC reads from disk are fast).
    // Module-level gameImageCache keeps images in memory across page switches.
    useEffect(() => {
      let isMounted = true;
      const gameId = game.game || game.name;

      const loadGameImage = async () => {
        // Already cached from a previous mount — no IPC call needed
        if (gameImageCache.has(gameId)) return;

        try {
          // Prefer portrait grid image (600x900) for the 2:3 card layout
          const imageBase64 = await window.electron.getGameImage(gameId, "grid");
          if (imageBase64 && isMounted) {
            const dataUrl = `data:image/jpeg;base64,${imageBase64}`;
            gameImageCache.set(gameId, dataUrl);
            setImageData(dataUrl);
            return;
          }
        } catch (error) {
          console.error("Error loading game image:", error);
        }
        // No image found on disk — attempt to repair (re-download) it
        if (!game.isCustom && isMounted) {
          try {
            const repairedBase64 = await window.electron.repairGameImage(gameId);
            if (repairedBase64 && isMounted) {
              const dataUrl = `data:image/jpeg;base64,${repairedBase64}`;
              gameImageCache.set(gameId, dataUrl);
              setImageData(dataUrl);
            }
          } catch (e) {
            console.warn("Could not repair game image:", e);
          }
        }
      };

      // Listen for game cover update events
      const handleCoverUpdate = event => {
        const { gameName, dataUrl } = event.detail;
        if (gameName === gameId && dataUrl && isMounted) {
          console.log(`Received cover update for ${gameName}`);
          gameImageCache.set(gameId, dataUrl);
          setImageData(dataUrl);
        }
      };

      // Add event listener for cover updates
      window.addEventListener("game-cover-updated", handleCoverUpdate);

      // Initial load
      loadGameImage();

      return () => {
        isMounted = false;
        // Clean up event listener
        window.removeEventListener("game-cover-updated", handleCoverUpdate);
      };
    }, [game.game, game.name]); // Only depend on game ID properties

    // Dialog state for editing cover
    const [showEditCoverDialog, setShowEditCoverDialog] = useState(false);
    const minSearchLength = 3;
    const [coverSearch, setCoverSearch] = useState({
      query: "",
      isLoading: false,
      results: [],
      selectedCover: null,
    });
    const [coverImageUrls, setCoverImageUrls] = useState({});

    // Load game logo
    useEffect(() => {
      let isMounted = true;
      const gameId = game.game || game.name;

      const loadLogo = async () => {
        try {
          const logoBase64 = await window.electron.ipcRenderer.invoke(
            "get-game-image",
            gameId,
            "logo"
          );
          if (logoBase64 && isMounted) {
            setLogoData(`data:image/png;base64,${logoBase64}`);
          } else {
            setLogoData(null);
          }
        } catch (e) {
          setLogoData(null);
        }
      };

      loadLogo();

      return () => {
        isMounted = false;
      };
    }, [game.game, game.name]);

    const handleContextMenu = e => {
      e.preventDefault();
      e.stopPropagation();
      
      const x = e.clientX;
      const y = e.clientY;
      const menuWidth = 260; // min-w-[260px] from the menu
      const menuHeight = 250; // More realistic estimate based on typical menu size
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      // Check if menu would go off right side
      if (x + menuWidth > viewportWidth) {
        adjustedX = Math.max(0, viewportWidth - menuWidth);
      }

      // Check if menu would go off bottom of screen
      if (y + menuHeight > viewportHeight) {
        // Open upward instead
        adjustedY = y - menuHeight;
      }

      // Ensure it doesn't go off top
      if (adjustedY < 0) {
        adjustedY = Math.max(0, Math.min(y, viewportHeight - menuHeight));
      }
      
      setContextMenuPosition({ x: adjustedX, y: adjustedY });
      setContextMenuOpen(true);
    };

    const handlePlayFromContext = async e => {
      e.stopPropagation();
      setContextMenuOpen(false);
      
      if (!game.executable && !game.isCustom) {
        toast.error(t("library.noExecutableSet"));
        return;
      }
      
      navigate("/gamescreen", {
        state: {
          gameData: game,
        },
      });
    };

    const handleRemoveGame = e => {
      e.stopPropagation();
      setContextMenuOpen(false);
      setIsDeleteDialogOpen(true);
    };

    const handleDeleteGame = e => {
      e.stopPropagation();
      setContextMenuOpen(false);
      setIsDeleteDialogOpen(true);
    };

    const confirmDeleteGame = () => {
      setIsDeleteDialogOpen(false);
      if (!game.isCustom) {
        setIsSaveDataDialogOpen(true);
      } else {
        performDelete(false);
      }
    };

    const performDelete = async (saveData) => {
      try {
        setIsUninstalling(true);
        const gameId = game.game || game.name;

        if (saveData) {
          await window.electron.saveDeletedGameData(gameId);
        }

        if (game.isCustom) {
          await window.electron.removeCustomGame(gameId);
        } else {
          await window.electron.deleteGame(gameId);
        }

        setIsUninstalling(false);
        setIsSaveDataDialogOpen(false);
        window.location.reload();
      } catch (error) {
        console.error("Error deleting game:", error);
        setIsUninstalling(false);
      }
    };

    const handleOpenDirectory = async e => {
      e.stopPropagation();
      setContextMenuOpen(false);
      
      try {
        await window.electron.openGameDirectory(game.game || game.name);
      } catch (error) {
        console.error("Failed to open directory:", error);
        toast.error(t("library.failedToOpenDirectory"));
      }
    };

    const handleCoverSearch = async query => {
      setCoverSearch(prev => ({
        ...prev,
        query,
        isLoading: true,
        results: [],
        selectedCover: null,
      }));
      if (query.length < minSearchLength) {
        setCoverSearch(prev => ({ ...prev, isLoading: false, results: [] }));
        setCoverImageUrls({});
        return;
      }
      try {
        // Use SteamGridDB for proper grid covers (600x900 portrait)
        const searchUrl = `https://api.ascendara.app/api/proxy/steamgrid/search/autocomplete/${encodeURIComponent(query)}`;
        const searchResponse = await fetch(searchUrl);

        if (!searchResponse.ok) {
          throw new Error('SteamGridDB search failed');
        }

        const searchData = await searchResponse.json();

        if (searchData.success && searchData.data && searchData.data.length > 0) {
          // Get grid images for the first few results
          const results = [];
          const imageUrls = {};

          for (const game of searchData.data.slice(0, 9)) {
            try {
              // Fetch 600x900 grid images for this game
              const gridsUrl = `https://api.ascendara.app/api/proxy/steamgrid/grids/game/${game.id}?styles=alternate&dimensions=600x900`;
              const gridsResponse = await fetch(gridsUrl);

              if (gridsResponse.ok) {
                const gridsData = await gridsResponse.json();

                if (gridsData.success && gridsData.data && gridsData.data.length > 0) {
                  // Use the first grid image
                  const firstGrid = gridsData.data[0];
                  const gameId = game.id.toString();

                  results.push({
                    game: game.name,
                    title: game.name,
                    gameID: gameId,
                    imgID: gameId,
                    img: firstGrid.url,
                  });

                  imageUrls[gameId] = firstGrid.url;
                }
              }
            } catch (gridError) {
              console.warn(`Could not fetch grids for ${game.name}:`, gridError);
            }
          }

          setCoverSearch(prev => ({ ...prev, isLoading: false, results: results }));
          setCoverImageUrls(imageUrls);
        } else {
          setCoverSearch(prev => ({ ...prev, isLoading: false, results: [] }));
          setCoverImageUrls({});
        }
      } catch (err) {
        console.error("Error searching covers:", err);
        setCoverSearch(prev => ({ ...prev, isLoading: false, results: [] }));
        setCoverImageUrls({});
      }
    };

    return (
      <>
        {/* Edit Cover Dialog */}
        <AlertDialog open={showEditCoverDialog} onOpenChange={setShowEditCoverDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-bold text-foreground">
                {t("library.changeCoverImage")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                {t("library.searchForCoverImage")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* Game Cover Search Section (copied and adapted from AddGameForm) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-grow">
                  <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-5 transform text-muted-foreground" />
                  <Input
                    id="coverSearch"
                    value={coverSearch.query}
                    onChange={e => handleCoverSearch(e.target.value)}
                    className="border-input bg-background pl-8 text-foreground"
                    placeholder={t("library.searchGameCover")}
                    minLength={minSearchLength}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("library.searchGameCoverNotice")}
                  </p>
                </div>
              </div>
              {/* Cover Search Results */}
              {coverSearch.query.length < minSearchLength ? (
                <div className="py-2 text-center text-sm text-muted-foreground">
                  {t("library.enterMoreChars", { count: minSearchLength })}
                </div>
              ) : coverSearch.isLoading ? (
                <div className="flex justify-center py-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                </div>
              ) : coverSearch.results.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {coverSearch.results.map((cover, index) => (
                    <div
                      key={index}
                      onClick={() =>
                        setCoverSearch(prev => ({ ...prev, selectedCover: cover }))
                      }
                      className={cn(
                        "relative aspect-video cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                        coverSearch.selectedCover === cover
                          ? "border-primary shadow-lg"
                          : "border-transparent hover:border-primary/50"
                      )}
                    >
                      <img
                        src={cover.img}
                        alt={cover.title}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity hover:opacity-100">
                        <p className="px-2 text-center text-sm text-white">
                          {cover.title}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-2 text-center text-sm text-muted-foreground">
                  {t("library.noResultsFound")}
                </div>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="text-primary"
                onClick={() => setShowEditCoverDialog(false)}
              >
                {t("common.cancel")}
              </AlertDialogCancel>
              <Button
                variant="primary"
                className="bg-primary text-secondary"
                disabled={!coverSearch.selectedCover}
                onClick={async () => {
                  if (!coverSearch.selectedCover) return;
                  // Fetch new image (no localStorage cache - persisted to disk
                  // by the main process via IPC)
                  try {
                    let dataUrl;
                    // For local index, load from local file system
                    if (settings.usingLocalIndex && coverSearch.selectedCover.gameID) {
                      if (coverImageUrls[coverSearch.selectedCover.gameID]) {
                        // Already loaded, convert blob URL to data URL for storage
                        const response = await fetch(
                          coverImageUrls[coverSearch.selectedCover.gameID]
                        );
                        const blob = await response.blob();
                        dataUrl = await new Promise(resolve => {
                          const reader = new FileReader();
                          reader.onloadend = () => resolve(reader.result);
                          reader.readAsDataURL(blob);
                        });
                      } else {
                        // Try to load from local file
                        const localImagePath = `${settings.localIndex}/imgs/${coverSearch.selectedCover.gameID}.jpg`;
                        const imageData = await window.electron.ipcRenderer.readFile(
                          localImagePath,
                          "base64"
                        );
                        dataUrl = `data:image/jpeg;base64,${imageData}`;
                      }
                    } else {
                      // Fetch from Steam CDN URL directly
                      const response = await fetch(coverSearch.selectedCover.img);
                      const blob = await response.blob();
                      dataUrl = await new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                      });
                    }
                    setImageData(dataUrl);
                    setShowEditCoverDialog(false);
                  } catch (e) {
                    console.error("Failed to update cover image", e);
                  }
                }}
              >
                {t("library.updateImage")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete/Remove Game Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-bold text-foreground">
                {t("library.confirmDelete")}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4 text-muted-foreground">
                {t("library.deleteConfirmMessage", { game: game.game || game.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex gap-2">
              <Button variant="outline" className="text-primary" onClick={() => setIsDeleteDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button className="text-secondary" onClick={confirmDeleteGame} disabled={isUninstalling}>
                {isUninstalling ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    {t("library.deleting")}
                  </>
                ) : (
                  t("library.delete", { game: game.game || game.name })
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Save Game Data Dialog */}
        <AlertDialog open={isSaveDataDialogOpen} onOpenChange={setIsSaveDataDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-bold text-foreground">
                {t("library.saveGameDataTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4 text-muted-foreground">
                {t("library.saveGameDataDescription", { game: game.game || game.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex gap-2">
              <Button variant="outline" className="text-primary" onClick={() => performDelete(false)} disabled={isUninstalling}>
                {t("library.saveGameDataNo")}
              </Button>
              <Button className="text-secondary" onClick={() => performDelete(true)} disabled={isUninstalling}>
                {isUninstalling ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    {t("library.deleting")}
                  </>
                ) : (
                  t("library.saveGameDataYes")
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Card
          className={cn(
            "group relative overflow-hidden rounded-xl border border-border bg-card shadow-md transition-all duration-200",
            !game._isDownloading && !game._isQueued && "hover:-translate-y-1 hover:shadow-xl hover:border-primary/30",
            (game._isDownloading || game._isQueued) && "opacity-60 cursor-default",
            isSelected && "ring-2 ring-primary",
            selectionMode && game.isCustom && "selectable-card",
            !game._isDownloading && !game._isQueued && "cursor-pointer"
          )}
          onClick={e => {
            if (game._isDownloading || game._isQueued) return;
            if (selectionMode && game.isCustom) {
              e.stopPropagation();
              onSelectCheckbox();
            } else {
              onPlay();
            }
          }}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {selectionMode && game.isCustom && (
            <div className="absolute left-2 top-2 z-20 flex items-center justify-center rounded bg-white/80 p-0.5 shadow backdrop-blur-sm">
              <input
                type="checkbox"
                checked={isSelected}
                tabIndex={-1}
                readOnly
                className="pointer-events-none h-5 w-5 rounded border-muted accent-primary focus:ring-primary"
              />
            </div>
          )}
          {/* Context Menu Portal */}
          {contextMenuOpen && createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-start justify-start"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenuOpen(false);
              }}
              onContextMenu={e => e.preventDefault()}
            >
              {/* Backdrop with blur */}
              <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
              
              {/* Context Menu */}
              <div
                className="absolute animate-in fade-in zoom-in-95 duration-200 transition-all"
                style={{
                  top: contextMenuPosition.y,
                  left: contextMenuPosition.x,
                }}
                onClick={e => e.stopPropagation()}
              >
                <div className="min-w-[260px] max-h-[80vh] overflow-hidden rounded-xl border border-border/50 bg-popover/95 shadow-2xl backdrop-blur-xl">
                  {/* Header with game logo */}
                  <div className="flex items-center justify-center border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent px-3 py-3">
                    {logoData ? (
                      <img 
                        src={logoData} 
                        alt={game.game || game.name} 
                        className="h-8 max-w-[200px] object-contain"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-foreground">
                        {game.game || game.name}
                      </span>
                    )}
                  </div>

                  {/* Menu Items */}
                  <div className="max-h-[calc(80vh-60px)] overflow-y-auto p-1.5">
                    {game.executable ? (
                      <button
                        onClick={handlePlayFromContext}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 transition-all group-hover:bg-primary">
                          <Play className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{t("common.contextMenu.playGame")}</div>
                          <div className="text-xs text-muted-foreground">
                            {t("common.contextMenu.playGameDescription")}
                          </div>
                        </div>
                      </button>
                    ) : null}
                    
                    <button
                      onClick={handleOpenDirectory}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/30">
                        <FolderOpen className="h-4 w-4 text-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{t("common.contextMenu.openDirectory")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("common.contextMenu.openDirectoryDescription")}
                        </div>
                      </div>
                    </button>
                    
                    {game.isCustom ? (
                      <button
                        onClick={handleRemoveGame}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-destructive/10 hover:translate-x-0.5"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-500/20">
                          <Trash2 className="h-4 w-4 text-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{t("common.contextMenu.removeGame")}</div>
                          <div className="text-xs text-muted-foreground">
                            {t("common.contextMenu.removeGameDescription")}
                          </div>
                        </div>
                      </button>
                    ) : (
                      <button
                        onClick={handleDeleteGame}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-destructive/10 hover:translate-x-0.5"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-500/20">
                          <Trash2 className="h-4 w-4 text-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{t("common.contextMenu.deleteGame")}</div>
                          <div className="text-xs text-muted-foreground">
                            {t("common.contextMenu.deleteGameDescription")}
                          </div>
                        </div>
                      </button>
                    )}
                    
                    {/* Divider between game actions and default options */}
                    <div className="my-1.5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    
                    {/* Report Issue */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsReportOpen(true);
                        setContextMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/30">
                        <TriangleAlert className="h-4 w-4 text-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{t("common.reportIssue")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("common.contextMenu.reportIssueDescription")}
                        </div>
                      </div>
                    </button>
                    
                    {/* Give Feedback */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.electron.openURL("https://ascendara.app/feedback");
                        setContextMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/30">
                        <MessageSquareText className="h-4 w-4 text-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{t("common.giveFeedback")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("common.contextMenu.shareFeedbackDescription")}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

          <CardContent className="p-0">
            <div className="relative aspect-[2/3] overflow-hidden">
              {imageData ? (
                <img
                  src={imageData}
                  alt={game.game}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <Gamepad2 className="h-12 w-12 text-muted-foreground/30" />
                </div>
              )}
              {/* Queued overlay */}
              {game._isQueued && (
                <>
                  <div className="absolute inset-0 bg-black/60" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded bg-black/70 px-2 py-1 text-xs font-bold text-white flex items-center gap-1">
                      <Loader className="h-3 w-3 animate-spin" />
                      Queued
                    </span>
                  </div>
                </>
              )}
              {/* Download progress fill overlay */}
              {game._isDownloading && (() => {
                const pct = parseFloat(game.downloadingData?.progressCompleted || 0);
                const isExtracting = game.downloadingData?.extracting;
                const isStopped = game.downloadingData?.stopped;
                const label = isExtracting
                  ? `Extracting…`
                  : isStopped
                  ? `Paused · ${pct.toFixed(0)}%`
                  : `${pct.toFixed(0)}%`;
                return (
                  <>
                    {/* dark mask covering the unfilled portion from top */}
                    <div
                      className="absolute inset-x-0 top-0 bg-black/60 transition-all duration-500"
                      style={{ height: `${100 - pct}%` }}
                    />
                    {/* colored fill from bottom */}
                    <div
                      className="absolute inset-x-0 bottom-0 bg-primary/30 transition-all duration-500"
                      style={{ height: `${pct}%` }}
                    />
                    {/* progress bar line at fill boundary */}
                    <div
                      className="absolute inset-x-0 h-0.5 bg-primary transition-all duration-500"
                      style={{ bottom: `${pct}%` }}
                    />
                    {/* label */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded bg-black/70 px-2 py-1 text-xs font-bold text-white">
                        {label}
                      </span>
                    </div>
                  </>
                );
              })()}
              {/* Running indicator */}
              {isRunning && (
                <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-green-500 to-emerald-400" />
              )}
              {/* Badges row */}
              <div className="absolute left-2 top-2 z-20 flex flex-col gap-1">
                {typeof game.launchCount === "undefined" && !game.isCustom && !game._isDownloading && !game._isQueued && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-bold text-primary">
                    {t("library.newBadge")}
                  </span>
                )}
                {updateInfo?.updateAvailable && (
                  <span className="flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-xs font-bold text-secondary">
                    <Import className="h-3 w-3" />
                    {t("gameScreen.updateBadge")}
                  </span>
                )}
              </div>
              {/* Hover overlay with title + actions */}
              <div className={cn(
                "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 transition-opacity duration-200",
                isHovered ? "opacity-100" : "opacity-0"
              )}>
                <p className="mb-2 line-clamp-2 text-sm font-semibold leading-tight text-white">
                  {game.game}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {game.online && <Gamepad2 className="h-3.5 w-3.5 text-white/70" />}
                    {game.dlc && <Gift className="h-3.5 w-3.5 text-white/70" />}
                    {isRunning && <span className="text-xs font-medium text-green-400">Playing</span>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:bg-white/20 hover:text-primary"
                    onClick={e => { e.stopPropagation(); onToggleFavorite(game.game || game.name); }}
                  >
                    <Heart className={cn("h-4 w-4", isFavorite ? "fill-primary text-primary" : "fill-none text-white")} />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-1 px-3 py-2">
            <h3 className="w-full truncate text-sm font-semibold leading-tight text-foreground">
              {game.game}
            </h3>
            <p className="text-xs text-muted-foreground">
              {(() => {
                const s = game.playTime;
                if (!s || s < 60) return t("library.neverPlayed");
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                if (h === 0) return `${m} minutes`;
                if (m === 0) return `${h} hours`;
                return `${h} hours ${m} minutes`;
              })()}
            </p>
          </CardFooter>
        </Card>
      </>
    );
  }
);

InstalledGameCard.displayName = "InstalledGameCard";

// Cloud-only game card with gray animation effect
const CloudOnlyGameCard = memo(({ game, imageData, onRestore, isRestoring }) => {
  const { t } = useLanguage();

  const formatPlaytime = seconds => {
    if (!seconds || seconds < 60) return t("library.neverPlayed");
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${minutes} minutes`;
    if (minutes === 0) return `${hours} hours`;
    return `${hours} hours ${minutes} minutes`;
  };

  const isCustomGame = game.isCustom;

  // Card-body click: this game isn't installed locally, so launching/inspecting
  // it isn't possible. Surface a clear warning telling the user to use the
  // Add & Restore button instead. The button's own onClick is stopped from
  // bubbling so it still works normally.
  const handleCardClick = () => {
    if (isRestoring) return;
    toast.warning(
      isCustomGame
        ? t("library.cloudOnly.noFilesFoundCustom") ||
            "No local files found for this custom game. Click \"Add & Restore\" to re-add it and recover your cloud playtime."
        : t("library.cloudOnly.noFilesFound") ||
            "No local files found for this game. Click \"Download & Restore\" to install it and recover your cloud playtime."
    );
  };

  return (
    <Card
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-xl",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      )}
    >
      <CardContent className="p-0">
        <div className="relative aspect-[2/3] overflow-hidden">
          {/* Gray overlay with shimmer animation */}
          <div
            className={cn(
              "absolute inset-0 z-10",
              isCustomGame
                ? "bg-gradient-to-br from-purple-400/60 via-purple-500/50 to-purple-600/60"
                : "bg-gradient-to-br from-gray-400/60 via-gray-500/50 to-gray-600/60"
            )}
          >
            {/* Animated shimmer effect */}
            <div
              className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
              }}
            />
          </div>
          {imageData ? (
            <img
              src={imageData}
              alt={game.name}
              className="h-full w-full border-b border-border object-cover grayscale"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Gamepad2 className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          {/* Cloud badge - different color for custom games */}
          <span
            className={cn(
              "absolute left-2 top-2 z-20 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-white",
              isCustomGame ? "bg-purple-500/90" : "bg-blue-500/90"
            )}
          >
            <Cloud className="h-3 w-3" />
            {isCustomGame
              ? t("library.cloudOnly.customBadge")
              : t("library.cloudOnly.badge")}
          </span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-1.5 px-3 py-2">
        <div className="flex w-full items-center gap-1.5">
          <h3 className="flex-1 truncate text-sm font-semibold leading-tight text-foreground">
            {game.name}
          </h3>
          {game.online && <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {game.dlc && <Gift className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </div>
        <div className="flex w-full items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">{formatPlaytime(game.playTime)}</span>
        </div>
        <Button
          size="sm"
          onClick={e => {
            e.stopPropagation();
            onRestore?.();
          }}
          disabled={isRestoring}
          className={cn(
            "w-full gap-1.5 text-xs text-white",
            isCustomGame
              ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              : "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
          )}
        >
          {isRestoring ? (
            <>
              <Loader className="h-3.5 w-3.5 animate-spin" />
              {t("library.cloudOnly.restoring")}
            </>
          ) : isCustomGame ? (
            <>
              <Plus className="h-3.5 w-3.5" />
              {t("library.cloudOnly.restoreCustom")}
            </>
          ) : (
            <>
              <CloudDownload className="h-3.5 w-3.5" />
              {t("library.cloudOnly.restore")}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
});

CloudOnlyGameCard.displayName = "CloudOnlyGameCard";

const persistPlayLaterCoverUrl = (gameName, url) => {
  if (!gameName || !url || url.startsWith("blob:")) return;
  try {
    const list = JSON.parse(localStorage.getItem("play-later-games") || "[]");
    const index = list.findIndex(g => g.game === gameName);
    if (index === -1 || list[index].coverUrl === url) return;
    list[index] = { ...list[index], coverUrl: url };
    safeSetItem("play-later-games", JSON.stringify(list));
  } catch (error) {
    console.warn("Failed to persist Play Later cover URL:", error);
  }
};

// Play Later game card
const PlayLaterGameCard = memo(({ game, onDownload, onRemove }) => {
  const { t } = useLanguage();
  const [imageData, setImageData] = useState(() => game.coverUrl || null);

  // Load Play Later card image. If we already have a persisted cover URL from
  // a previous session, use it immediately and skip re-fetching entirely.
  useEffect(() => {
    if (game.coverUrl) {
      setImageData(game.coverUrl);
      return;
    }

    let isMounted = true;
    const loadImage = async () => {
      // 1. Load via imgID when available (games from Search/Download always have one)
      if (game.imgID) {
        try {
          const imageCacheService = await import("@/services/imageCacheService");
          const url = await imageCacheService.default.getImage(game.imgID, {
            priority: "normal",
            quality: "high",
          });
          if (url && isMounted) {
            setImageData(url);
            persistPlayLaterCoverUrl(game.game, url);
            return;
          }
        } catch (error) {
          console.warn("imageCacheService failed for play later image:", error);
        }
      }

      // 2. Try SteamGridDB fallback when no imgID is available
      if (game.game && !game.imgID) {
        try {
          const steamGridImageService = await import("@/services/steamGridImageService");
          const assets = await steamGridImageService.default.getAssets(game.game);
          const imageUrl = steamGridImageService.default.pickUrl(assets, "card");
          if (imageUrl && isMounted) {
            setImageData(imageUrl);
            persistPlayLaterCoverUrl(game.game, imageUrl);
            return;
          }
        } catch (error) {
          console.warn("SteamGridDB fallback failed for play later image:", error);
        }
      }
    };
    loadImage();
    return () => {
      isMounted = false;
    };
  }, [game.game, game.imgID, game.coverUrl]);

  const formatAddedDate = timestamp => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-xl"
      )}
    >
      <CardContent className="p-0">
        <div className="relative aspect-[2/3] overflow-hidden">
          {/* Amber overlay with shimmer animation */}
          <div className="absolute inset-0 z-10 bg-gradient-to-br from-amber-400/40 via-orange-500/30 to-amber-600/40">
            <div
              className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
              }}
            />
          </div>
          {imageData ? (
            <img
              src={imageData}
              alt={game.game}
              className="h-full w-full border-b border-border object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Gamepad2 className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          {/* Play Later badge */}
          <span className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded bg-amber-500/90 px-2 py-0.5 text-xs font-medium text-white">
            <Clock className="h-3 w-3" />
            {t("library.playLater.badge")}
          </span>
          {/* Remove button */}
          <button
            onClick={e => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute right-2 top-2 z-20 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
            title={t("library.playLater.remove")}
          >
            <Plus className="h-3 w-3 rotate-45" />
          </button>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 px-3 py-2">
        <div className="flex w-full items-center gap-1.5">
          <h3 className="flex-1 truncate text-sm font-semibold leading-tight text-foreground">
            {game.game}
          </h3>
          {game.online && <Gamepad2 className="h-3.5 w-3.5 text-muted-foreground" />}
          {game.dlc && <Gift className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
          {game.size && <span>{game.size}</span>}
          {game.addedAt && (
            <span>
              {t("library.playLater.addedOn")} {formatAddedDate(game.addedAt)}
            </span>
          )}
        </div>
        <Button
          onClick={onDownload}
          className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
        >
          <ArrowDown className="h-4 w-4" />
          {t("library.playLater.download")}
        </Button>
      </CardFooter>
    </Card>
  );
});

PlayLaterGameCard.displayName = "PlayLaterGameCard";

const DeletedGameCard = memo(({ game, onRestore, onRemove, isRestoring }) => {
  const { t } = useLanguage();
  const [imageData, setImageData] = useState(() => gameImageCache.get(game.game || game.name) ?? null);
  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false);
  const gameName = game.game || game.name || "";
  const isCustomGame = !game.gameID;

  useEffect(() => {
    let cancelled = false;
    if (gameImageCache.has(gameName)) {
      setImageData(gameImageCache.get(gameName));
      return;
    }
    (async () => {
      if (game.imgID) {
        try {
          const { default: imageCacheSvc } = await import("@/services/imageCacheService");
          const url = await imageCacheSvc.getImage(game.imgID, { priority: "low", quality: "high" });
          if (url && !cancelled) {
            gameImageCache.set(gameName, url);
            setImageData(url);
            return;
          }
        } catch { /* fall through */ }
      }
      if (gameName) {
        try {
          const { default: sgSvc } = await import("@/services/steamGridImageService");
          const assets = await sgSvc.getAssets(gameName);
          const url = sgSvc.pickUrl(assets, "card");
          if (url && !cancelled) {
            gameImageCache.set(gameName, url);
            setImageData(url);
          }
        } catch { /* silent */ }
      }
    })();
    return () => { cancelled = true; };
  }, [gameName, game.imgID]);

  const formatPlaytime = seconds => {
    if (!seconds || seconds < 60) return t("library.neverPlayed") || "You haven't played this game yet";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${minutes} ${t("library.minutes") || "minutes"}`;
    if (minutes === 0) return `${hours} ${t("library.hours") || "hours"}`;
    return `${hours} ${t("library.hours") || "hours"} ${minutes} ${t("library.minutes") || "minutes"}`;
  };

  const formatDeletedAt = timestamp => {
    if (!timestamp) return "";
    try {
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return "";
    }
  };

  return (
    <>
      <Card
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-all duration-200",
          "hover:-translate-y-1 hover:shadow-xl"
        )}
      >
        <CardContent className="p-0">
          <div className="relative aspect-[2/3] overflow-hidden">
            {/* Muted overlay to distinguish from active library cards */}
            <div className="absolute inset-0 z-10 bg-background/60" />
            {imageData ? (
              <img
                src={imageData}
                alt={gameName}
                className="h-full w-full border-b border-border object-cover grayscale"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <History className="h-12 w-12 text-muted-foreground/30" />
              </div>
            )}
            {/* History badge */}
            <span className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded bg-muted-foreground/80 px-2 py-0.5 text-xs font-medium text-white">
              <History className="h-3 w-3" />
              {t("library.history.badge") || "Removed"}
            </span>
            {/* Remove from history button */}
            <button
              onClick={e => {
                e.stopPropagation();
                setIsConfirmRemoveOpen(true);
              }}
              className="absolute right-2 top-2 z-20 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              title={t("library.history.removeForever") || "Remove from History"}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-1.5 px-3 py-2">
          <div className="flex w-full items-center gap-1.5">
            <h3 className="flex-1 truncate text-sm font-semibold leading-tight text-foreground">
              {gameName}
            </h3>
            {game.online && <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {game.dlc && <Gift className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </div>
          <div className="flex w-full items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="truncate">{formatPlaytime(game.playTime)}</span>
          </div>
          {game.deletedAt && (
            <div className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <span className="truncate">
                {t("library.history.removedOn") || "Removed"} {formatDeletedAt(game.deletedAt)}
              </span>
            </div>
          )}
          <Button
            size="sm"
            onClick={onRestore}
            disabled={isRestoring}
            className="w-full gap-1.5 text-xs text-white bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/60"
          >
            {isRestoring ? (
              <>
                <Loader className="h-3.5 w-3.5 animate-spin" />
                {t("library.history.restoring") || "Finding game..."}
              </>
            ) : isCustomGame ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                {t("library.history.restoreCustom") || "Re-add & Restore"}
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                {t("library.history.restore") || "Redownload & Restore"}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={isConfirmRemoveOpen} onOpenChange={setIsConfirmRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground">
              {t("library.history.removeForeverTitle") || "Remove from History?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("library.history.removeForeverDescription", { game: gameName }) ||
                `This will permanently delete the saved playtime and stats for ${gameName}. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIsConfirmRemoveOpen(false);
                onRemove();
              }}
            >
              {t("library.history.removeForever") || "Remove from History"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

DeletedGameCard.displayName = "DeletedGameCard";

const AddGameForm = ({ onSuccess, onRestorePrompt }) => {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showImportingDialog, setShowImportingDialog] = useState(false);
  const [importSuccess, setImportSuccess] = useState(null);
  const [steamappsDirectory, setSteamappsDirectory] = useState("");
  const [isSteamappsDirectoryInvalid, setIsSteamappsDirectoryInvalid] = useState(false);

  // Handler for directory picking
  const handleChooseSteamappsDirectory = async () => {
    const dir = await window.electron.openDirectoryDialog();
    if (dir) setSteamappsDirectory(dir);
  };

  // Check if the steamappsDirectory contains 'common'
  useEffect(() => {
    if (steamappsDirectory && !steamappsDirectory.toLowerCase().includes("common")) {
      setIsSteamappsDirectoryInvalid(true);
    } else {
      setIsSteamappsDirectoryInvalid(false);
    }
  }, [steamappsDirectory]);

  const handleImportSteamGames = async () => {
    if (!steamappsDirectory) return;
    setIsSteamappsDirectoryInvalid(false);
    setShowImportDialog(false);
    setShowImportingDialog(true);
    setImportSuccess(null);
    try {
      await window.electron.importSteamGames(steamappsDirectory);
      setImportSuccess(true);
      await loadGames();
      setTimeout(() => {
        setShowImportingDialog(false);
        setImportSuccess(null);
      }, 1500);
    } catch (error) {
      setImportSuccess(false);
    }
  };

  // Close importing dialog
  const handleCloseImportingDialog = () => {
    setShowImportingDialog(false);
    setImportSuccess(null);
  };

  const [formData, setFormData] = useState({
    executable: "",
    name: "",
    hasVersion: false,
    version: "",
    isOnline: false,
    hasDLC: false,
  });
  const [coverSearch, setCoverSearch] = useState({
    query: "",
    isLoading: false,
    results: [],
    selectedCover: null,
  });
  const [coverImageUrls, setCoverImageUrls] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add debounce timer ref
  const searchDebounceRef = useRef(null);
  const minSearchLength = 2;

  const handleCoverSearch = async query => {
    // Update query immediately for UI responsiveness
    setCoverSearch(prev => ({ ...prev, query }));

    // Clear previous timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Don't search if query is too short
    if (!query.trim() || query.length < minSearchLength) {
      setCoverSearch(prev => ({ ...prev, results: [], isLoading: false }));
      setCoverImageUrls({});
      return;
    }

    // Set up new debounce timer
    searchDebounceRef.current = setTimeout(async () => {
      setCoverSearch(prev => ({ ...prev, isLoading: true }));
      try {
        // Use SteamGridDB for proper grid covers (600x900 portrait)
        const searchUrl = `https://api.ascendara.app/api/proxy/steamgrid/search/autocomplete/${encodeURIComponent(query)}`;
        const searchResponse = await fetch(searchUrl);

        if (!searchResponse.ok) {
          throw new Error('SteamGridDB search failed');
        }

        const searchData = await searchResponse.json();

        if (searchData.success && searchData.data && searchData.data.length > 0) {
          // Get grid images for the first few results
          const results = [];
          const imageUrls = {};

          for (const game of searchData.data.slice(0, 9)) {
            try {
              // Fetch 600x900 grid images for this game
              const gridsUrl = `https://api.ascendara.app/api/proxy/steamgrid/grids/game/${game.id}?styles=alternate&dimensions=600x900`;
              const gridsResponse = await fetch(gridsUrl);

              if (gridsResponse.ok) {
                const gridsData = await gridsResponse.json();

                if (gridsData.success && gridsData.data && gridsData.data.length > 0) {
                  // Use the first grid image
                  const firstGrid = gridsData.data[0];
                  const gameId = game.id.toString();

                  results.push({
                    game: game.name,
                    title: game.name,
                    gameID: gameId,
                    imgID: gameId,
                    img: firstGrid.url,
                  });

                  imageUrls[gameId] = firstGrid.url;
                }
              }
            } catch (gridError) {
              console.warn(`Could not fetch grids for ${game.name}:`, gridError);
            }
          }

          if (results.length > 0) {
            const firstResult = results[0];
            setCoverSearch(prev => ({
              ...prev,
              results: results,
              selectedCover: firstResult,
              isLoading: false,
            }));
            setCoverImageUrls(imageUrls);
            return;
          }
        }

        // If no results found, show empty state
        setCoverSearch(prev => ({
          ...prev,
          results: [],
          selectedCover: null,
          isLoading: false,
        }));
        setCoverImageUrls({});
      } catch (error) {
        console.error("Error searching covers:", error);
        setCoverSearch(prev => ({
          ...prev,
          results: [],
          selectedCover: null,
          isLoading: false
        }));
        setCoverImageUrls({});
        toast.error(t("library.coverSearchError"));
      }
    }, 300); // 300ms debounce
  };

  const handleChooseExecutable = async () => {
    const file = await window.electron.openFileDialog();
    if (file) {
      const gameName = file.split("\\").pop().replace(".exe", "");
      setFormData(prev => ({
        ...prev,
        executable: file,
        name: gameName,
      }));

      // Automatically search for game cover using Steam API
      if (gameName) {
        handleCoverSearch(gameName);
      }
    }
  };

  const handleSubmit = async e => {
    if (e) e.preventDefault();

    console.log("[AddGameForm] handleSubmit called", { formData, isSubmitting });

    if (isSubmitting) {
      console.log("[AddGameForm] Already submitting, returning");
      return;
    }

    setIsSubmitting(true);

    try {
      console.log("[AddGameForm] Checking for duplicate games...");
      // Check if a game with this name already exists in the library
      const installedGames = await window.electron.getGames();
      const customGames = await window.electron.getCustomGames();

      console.log("[AddGameForm] Got games:", {
        installedCount: installedGames?.length,
        customCount: customGames?.length,
      });

      const allExistingGames = [...(installedGames || []), ...(customGames || []).filter(g => !g._isDeleted)];

      const normalizedFormName = normalizeGameName(formData.name);
      const gameExists = allExistingGames.some(
        game => normalizeGameName(game.game || game.name) === normalizedFormName
      );

      console.log("[AddGameForm] Duplicate check result:", {
        gameExists,
        gameName: formData.name,
      });

      if (gameExists) {
        console.log("[AddGameForm] Duplicate found, showing error");
        setIsSubmitting(false);
        onSuccess(); // Close the add game dialog
        toast.error(t("library.addGame.duplicateError"));
        return;
      }

      console.log("[AddGameForm] Adding game to library...");
      // Pass the actual image URL from SteamGridDB (600x900 grid)
      const coverImageUrl = coverSearch.selectedCover?.img;
      const result = await window.electron.addGame(
        formData.name,
        formData.isOnline,
        formData.hasDLC,
        formData.version,
        formData.executable,
        coverImageUrl
      );

      console.log("[AddGameForm] Add game result:", result);

      if (result && !result.success) {
        console.error("[AddGameForm] Failed to add game:", result.error);
        setIsSubmitting(false);
        toast.error(result.error || "Failed to add game. Please try again.");
        return;
      }

      console.log("[AddGameForm] Game added successfully");

      // Download all game assets (grid, logo, hero) if a cover was selected
      if (coverSearch.selectedCover?.gameID) {
        console.log("[AddGameForm] Downloading game assets...");
        const assetTypes = [
          { type: "grids", key: "grid", filename: "grid.ascendara.jpg", params: "?styles=alternate&dimensions=600x900" },
          { type: "logos", key: "logo", filename: "logo.ascendara.png", params: "?styles=white&sort=score" },
          { type: "heroes", key: "hero", filename: "hero.ascendara.jpg", params: "?styles=alternate" },
        ];

        let downloadedCount = 0;
        for (const { type, filename, params } of assetTypes) {
          try {
            const url = `https://api.ascendara.app/api/proxy/steamgrid/${type}/game/${coverSearch.selectedCover.gameID}${params}`;
            const response = await fetch(url);

            if (response.ok) {
              const data = await response.json();
              if (data.success && data.data && data.data.length > 0) {
                const assetUrl = data.data[0].url;

                // Download the image
                const imageResponse = await fetch(assetUrl);
                const blob = await imageResponse.blob();

                // Convert to base64
                const reader = new FileReader();
                const base64Promise = new Promise(resolve => {
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(blob);
                });

                const dataUrl = await base64Promise;

                // Save to game directory via IPC
                await window.electron.saveGameAsset(formData.name, filename, dataUrl);
                downloadedCount++;

                // If this is the grid image, notify library card via event
                if (type === "grids") {
                  window.dispatchEvent(
                    new CustomEvent("game-cover-updated", {
                      detail: { gameName: formData.name, dataUrl },
                    })
                  );
                }
              }
            }
          } catch (e) {
            console.warn(`[AddGameForm] Failed to download ${type}:`, e);
          }
        }
        console.log(`[AddGameForm] Downloaded ${downloadedCount} assets`);
      }

      // Check if there is a saved deletion stub for this game name — prompt to restore
      try {
        const freshCustomGames = await window.electron.getCustomGames();
        const stub = (freshCustomGames || []).find(
          g => g._isDeleted && normalizeGameName(g.game) === normalizeGameName(formData.name)
        );
        if (stub && onRestorePrompt) {
          onRestorePrompt({ gameName: formData.name, stub });
        }
      } catch (e) {
        console.warn("[AddGameForm] Could not check for restore stub:", e);
      }

      toast.success(t("library.addGame.success"));
      setIsSubmitting(false);
      onSuccess();
    } catch (error) {
      console.error("[AddGameForm] Error in handleSubmit:", error);
      setIsSubmitting(false);
      toast.error("Failed to add game. Please try again.");
    }
  };

  return (
    <div className="space-y-4">

      {/* ── Executable picker + Steam import ── */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9 flex-1 justify-start truncate text-left text-sm font-normal text-foreground hover:bg-accent"
          onClick={handleChooseExecutable}
        >
          <FolderOpen className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-semibold text-muted-foreground">
            {formData.executable
              ? formData.executable.split("\\").pop()
              : t("library.chooseExecutableFile")}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 text-muted-foreground hover:bg-accent"
          onClick={() => setShowImportDialog(true)}
        >
          <Import className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
          {t("library.importSteamGames")}
        </Button>
      </div>

      {/* ── Game name ── */}
      <Input
        id="name"
        value={formData.name}
        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
        placeholder={t("library.gameName")}
        className="h-9 bg-background text-sm"
      />

      {/* ── Toggles row ── */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, hasVersion: !prev.hasVersion, version: prev.hasVersion ? "" : prev.version }))}
          className={cn(
            "flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs transition-colors",
            formData.hasVersion
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
          )}
        >
          <Tag className="h-3.5 w-3.5" />
          {t("library.version")}
        </button>
        <button
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, isOnline: !prev.isOnline }))}
          className={cn(
            "flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs transition-colors",
            formData.isOnline
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
          )}
        >
          <Gamepad2 className="h-3.5 w-3.5" />
          {t("library.hasOnlineFix")}
        </button>
        <button
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, hasDLC: !prev.hasDLC }))}
          className={cn(
            "flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs transition-colors",
            formData.hasDLC
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
          )}
        >
          <Gift className="h-3.5 w-3.5" />
          {t("library.includesAllDLCs")}
        </button>
      </div>

      {/* ── Version input (revealed when toggled) ── */}
      {formData.hasVersion && (
        <Input
          id="version"
          value={formData.version}
          onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))}
          placeholder={t("library.versionPlaceholder")}
          className="h-9 bg-background text-sm"
        />
      )}

      {/* ── Cover art search ── */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="coverSearch"
              value={coverSearch.query}
              onChange={e => handleCoverSearch(e.target.value)}
              className="h-9 bg-background pl-8 text-sm"
              placeholder={t("library.searchGameCover")}
              minLength={minSearchLength}
            />
          </div>

          {coverSearch.query.length < minSearchLength ? (
            <p className="text-center text-xs text-muted-foreground">
              {t("library.enterMoreChars", { count: minSearchLength })}
            </p>
          ) : coverSearch.isLoading ? (
            <div className="flex justify-center py-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : coverSearch.results.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {coverSearch.results.map((cover, index) => (
                <div
                  key={index}
                  onClick={() => setCoverSearch(prev => ({ ...prev, selectedCover: cover }))}
                  className={cn(
                    "relative aspect-[3/4] cursor-pointer overflow-hidden rounded-md border-2 transition-all",
                    coverSearch.selectedCover === cover
                      ? "border-primary shadow-md"
                      : "border-transparent hover:border-primary/40"
                  )}
                >
                  <img src={cover.img} alt={cover.title} className="h-full w-full object-cover" />
                  {coverSearch.selectedCover === cover && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                      <div className="rounded-full bg-primary p-1">
                        <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">{t("library.noResultsFound")}</p>
          )}
        </div>

        {/* Selected cover preview */}
        {coverSearch.selectedCover && (
          <div className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-lg border-2 border-primary shadow-md">
            <img
              src={coverSearch.selectedCover.img}
              alt={coverSearch.selectedCover.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>

      {/* ── Import Steam Games Dialog ── */}
      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground">
              {t("library.importSteamGames")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">
              <span>
                {t("library.importSteamGamesDescription")}{" "}
                <a
                  className="cursor-pointer text-primary hover:underline"
                  onClick={() => window.electron.openURL("https://ascendara.app/docs/features/overview#importing-from-steam")}
                >
                  {t("common.learnMore")} <ExternalLink className="mb-1 inline-block h-3 w-3" />
                </a>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="steamapps-directory" className="text-foreground">
              {t("library.steamappsDirectory")}
            </Label>
            <div className="flex gap-2">
              <Input id="steamapps-directory" value={steamappsDirectory} readOnly className="flex-1 bg-background" />
              <Button type="button" variant="outline" onClick={handleChooseSteamappsDirectory} className="bg-primary text-secondary">
                {t("library.chooseDirectory")}
              </Button>
            </div>
            {isSteamappsDirectoryInvalid && (
              <p className="text-sm font-semibold text-destructive">{t("library.steamappsDirectoryMissingCommon")}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSteamappsDirectory("")} className="text-primary">
              {t("common.cancel")}
            </AlertDialogCancel>
            <Button type="button" onClick={handleImportSteamGames} disabled={!steamappsDirectory} className="bg-primary text-secondary">
              {t("library.import")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Importing progress dialog ── */}
      <AlertDialog open={showImportingDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground">
              {importSuccess === null && <><Loader className="mr-2 inline h-5 w-5 animate-spin text-muted-foreground" />{t("library.importingGames")}</>}
              {importSuccess === true && t("library.importSuccessTitle")}
              {importSuccess === false && t("library.importFailedTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">
              {importSuccess === null && t("library.importingGamesDesc")}
              {importSuccess === true && t("library.importSuccessDesc")}
              {importSuccess === false && t("library.importFailedDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {importSuccess !== null && (
              <Button className="bg-primary text-secondary" onClick={handleCloseImportingDialog}>
                {t("common.ok")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Footer ── */}
      <AlertDialogFooter>
        <Button variant="outline" onClick={() => onSuccess()} className="text-primary">
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!formData.executable || !formData.name || isSubmitting}
          className="bg-primary text-secondary"
        >
          {isSubmitting ? (
            <><Loader className="mr-2 h-4 w-4 animate-spin" />{t("common.loading")}</>
          ) : (
            t("library.addGame.title")
          )}
        </Button>
      </AlertDialogFooter>
    </div>
  );
};

// Drag and Drop Components

// Draggable wrapper for game cards
const DraggableGameCard = ({ game, children }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "GAME",
    item: { ...game },
    collect: monitor => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div ref={drag} style={{ opacity: isDragging ? 0.5 : 1 }}>
      {children}
    </div>
  );
};

// Droppable wrapper for folder cards
const DroppableFolderCard = ({ folder, onDropGame, children }) => {
  const navigate = useNavigate();

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: "GAME",
    drop: item => {
      if (onDropGame) onDropGame(item);
    },
    canDrop: item => {
      // Prevent dropping a game that's already in this folder, even if casing or
      // filesystem sanitization differs.
      const droppedName = normalizeGameName(item.game || item.name);
      return !folder.items?.some(
        g => normalizeGameName(g.game || g.name) === droppedName
      );
    },
    collect: monitor => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  return (
    <div
      ref={drop}
      style={{
        background: isOver && canDrop ? "#e0e7ff" : "transparent",
        borderRadius: "8px",
        transition: "background-color 0.2s",
      }}
      onClick={() => navigate(`/folderview/${encodeURIComponent(folder.game)}`)}
    >
      {children}
    </div>
  );
};

export default Library;