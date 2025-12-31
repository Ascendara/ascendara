import React, { useState, useEffect, useRef, useCallback, memo } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
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
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import igdbService from "@/services/gameInfoService";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import {
  getCloudLibrary,
  getGameAchievements,
  syncCloudLibrary,
  syncGameAchievements,
  verifyAscendAccess,
} from "@/services/firebaseService";
import { calculateLibraryValue } from "@/services/cheapsharkService";

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
  const [favorites, setFavorites] = useState(() => {
    const savedFavorites = localStorage.getItem("game-favorites");
    return savedFavorites ? JSON.parse(savedFavorites) : [];
  });
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
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [ascendAccess, setAscendAccess] = useState({
    hasAccess: false,
    isSubscribed: false,
    isVerified: false,
  });

  useEffect(() => {
    localStorage.setItem("game-favorites", JSON.stringify(favorites));
  }, [favorites]);

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

  const [CurPage, SetCurPage] = useState(() => {
    const PageState = Number(location?.state?.libraryPage);
    if (Number.isInteger(PageState) && PageState >= 1) return PageState;
    return 1;
  });
  const PAGE_SIZE = 15;

  // Current Page QOL <3
  // Makes sure to keep Current Library Page when going back from GameScreen.jsx :P

  useEffect(() => {
    const PState = Number(location?.state?.libraryPage);
    if (Number.isInteger(PState) && PState >= 1 && PState !== CurPage) {
      SetCurPage(PState)
    }
  }, [location?.key]);

  useEffect(() => {
    const PState = Number(location?.state?.libraryPage);
    if (PState == CurPage) return
    //
    navigate(location.pathname, {
      replace: true,
      state: { ...(location.state || {}), libraryPage: CurPage },
    });
  }, [CurPage, location.pathname, location.state, navigate]);

  // Filter games based on search query
  const filteredGames = games
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
      // Alphabetical
      return sortOrder === "asc"
        ? aName.localeCompare(bName)
        : bName.localeCompare(aName);
    });

  // Save sortOrder to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("library-sortOrder", sortOrder);
  }, [sortOrder]);

  // Pagination logic
  const totalPages = Math.ceil(filteredGames.length / PAGE_SIZE);
  const paginatedGames = filteredGames.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

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

  // Reset to first page if filter/search changes and current page is out of range
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const toggleFavorite = gameName => {
    setFavorites(prev => {
      const newFavorites = prev.includes(gameName)
        ? prev.filter(name => name !== gameName)
        : [...prev, gameName];
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
    localStorage.setItem("play-later-games", JSON.stringify(updatedList));
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
          const localGameNames = new Set([
            ...(installedGames || []).map(g => (g.game || g.name)?.toLowerCase()),
            ...(customGames || []).map(g => (g.game || g.name)?.toLowerCase()),
          ]);

          // Filter to cloud games that are NOT installed locally
          // Include both regular games (with gameID) and custom games
          const cloudOnly = cloudResult.data.games.filter(
            g => !localGameNames.has(g.name?.toLowerCase()) && (g.gameID || g.isCustom)
          );

          setCloudOnlyGames(cloudOnly);

          // Load images for cloud-only games (only for non-custom games with gameID)
          const images = {};
          for (const game of cloudOnly
            .filter(g => g.gameID && !g.isCustom)
            .slice(0, 20)) {
            try {
              const localStorageKey = `game-cover-${game.name}`;
              const cachedImage = localStorage.getItem(localStorageKey);
              if (cachedImage) {
                images[game.name] = cachedImage;
              } else if (game.gameID) {
                // For local index, we need to find the game's imgID
                let imageId = game.gameID;
                if (settings.usingLocalIndex) {
                  try {
                    const gameData = await gameService.findGameByGameID(game.gameID);
                    if (gameData?.imgID) {
                      imageId = gameData.imgID;
                    }
                  } catch (error) {
                    console.warn("Could not find game in local index:", error);
                    continue;
                  }
                }

                // For local index, try to load from local file system using imgID
                if (settings.usingLocalIndex && settings.localIndex) {
                  try {
                    const localImagePath = `${settings.localIndex}/imgs/${imageId}.jpg`;
                    const imageData = await window.electron.ipcRenderer.readFile(
                      localImagePath,
                      "base64"
                    );
                    const dataUrl = `data:image/jpeg;base64,${imageData}`;
                    images[game.name] = dataUrl;
                    try {
                      localStorage.setItem(localStorageKey, dataUrl);
                    } catch (e) {
                      console.warn("Could not cache cloud game image:", e);
                    }
                    continue;
                  } catch (localError) {
                    console.warn(
                      "Could not load from local index, skipping:",
                      localError
                    );
                  }
                } else {
                  // Fetch from API using gameID
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
                    try {
                      localStorage.setItem(localStorageKey, dataUrl);
                    } catch (e) {
                      console.warn("Could not cache cloud game image:", e);
                    }
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
      localStorage.setItem(
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
      localStorage.setItem(
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

    for (const key of keysToCheck) {
      const gameName = key.replace("cloud-restore-", "");
      // Check if this game is now installed
      const isInstalled = installedGames.some(
        g => (g.game || g.name)?.toLowerCase() === gameName.toLowerCase()
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

      // Check for pending cloud restores (games that were downloaded from cloud)
      await checkPendingCloudRestores([...installedGames, ...customGames]);

      // Filter out games that are being verified or downloading
      const filteredInstalledGames = installedGames.filter(
        game =>
          !game.downloadingData?.verifying &&
          !game.downloadingData?.downloading &&
          !game.downloadingData?.extracting &&
          !game.downloadingData?.updating &&
          !game.downloadingData?.stopped &&
          (!game.downloadingData?.verifyError ||
            game.downloadingData.verifyError.length === 0)
      );

      // Combine both types of games
      const allGames = [
        ...(filteredInstalledGames || []).map(game => ({
          ...game,
          isCustom: false,
        })),
        ...(customGames || []).map(game => ({
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

      // Filter out games that are in folders using the folderManager library
      const gamesNotInFolders = filterGamesNotInFolders(allGames);

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
        ...(customGames || []).map(g => ({ ...g, isCustom: true })),
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
        localStorage.setItem("library-value-cache", JSON.stringify(emptyResult));
        localStorage.setItem("library-value-game-count", "0");
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
      localStorage.setItem("library-value-cache", JSON.stringify(result));
      localStorage.setItem("library-value-game-count", String(allGameTitles.length));
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
      const gameDetails = await igdbService.getGameDetails(query);
      // Transform the results to match the expected format
      const results = gameDetails
        .map(game => ({
          id: game.id,
          url:
            game.screenshots && game.screenshots.length > 0
              ? igdbService.formatImageUrl(game.screenshots[0].url, "screenshot_big")
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
      <div className="container mx-auto">
        <div className="mx-auto flex min-h-[85vh] max-w-md flex-col items-center justify-center text-center">
          <div className="space-y-6">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold tracking-tight">
                {t("library.loadingLibrary")}
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground">
                {t("library.loadingLibraryMessage")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-7xl p-4 md:p-8">
        {error && (
          <div className="bg-destructive/10 text-destructive mb-4 rounded-lg p-4">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col">
            <div className="flex flex-row items-start justify-between">
              {/* Left side: Title and Search */}
              <div className="flex-1">
                <div className="mb-2 mt-6 flex items-center">
                  <h1 className="text-4xl font-bold tracking-tight text-primary">
                    {t("library.pageTitle")}
                  </h1>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="mb-2 ml-2 flex h-6 w-6 cursor-help items-center justify-center rounded-full bg-muted hover:bg-muted/80">
                          <span className="text-sm font-medium">?</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        className="space-y-2 p-4 text-secondary"
                      >
                        <p className="font-semibold">{t("library.iconLegend.header")}</p>
                        <Separator />
                        <div className="flex items-center gap-2">
                          <Gamepad2 className="h-4 w-4" />{" "}
                          <span>{t("library.iconLegend.onlineFix")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Gift className="h-4 w-4" />{" "}
                          <span>{t("library.iconLegend.allDlcs")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg
                            className="h-4 w-4 text-secondary"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M2 10C2 8.89543 2.89543 8 4 8H20C21.1046 8 22 8.89543 22 10V17C22 18.1046 21.1046 19 20 19H16.1324C15.4299 19 14.7788 18.6314 14.4174 18.029L12.8575 15.4292C12.4691 14.7818 11.5309 14.7818 11.1425 15.4292L9.58261 18.029C9.22116 18.6314 8.57014 19 7.86762 19H4C2.89543 19 2 18.1046 2 17V10Z"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M3.81253 6.7812C4.5544 5.6684 5.80332 5 7.14074 5H16.8593C18.1967 5 19.4456 5.6684 20.1875 6.7812L21 8H3L3.81253 6.7812Z"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>{" "}
                          <span>{t("library.iconLegend.vrGame")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <PackageOpen className="h-4 w-4" />{" "}
                          <span>{t("library.iconLegend.size")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4" />{" "}
                          <span>{t("library.iconLegend.version")}</span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Library Value Button */}
                <button
                  onClick={() => handleCalculateLibraryValue()}
                  className="mb-4 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/20"
                >
                  <DollarSign className="h-4 w-4" />
                  {libraryValueData && !libraryHasChanged() ? (
                    <span>${libraryValueData.totalValue.toFixed(2)}</span>
                  ) : (
                    <span>
                      {t("library.libraryValue.calculate") || "Calculate Library Value"}
                    </span>
                  )}
                </button>

                <div className="relative mr-12 flex items-center gap-2">
                  <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder={t("library.searchLibrary")}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                  <div className="ml-2 flex items-center gap-1">
                    <TooltipProvider>
                      <DropdownMenu
                        open={isDropdownOpen}
                        onOpenChange={setIsDropdownOpen}
                      >
                        <DropdownMenuTrigger asChild>
                          <button
                            className="rounded p-2 hover:bg-secondary/50"
                            type="button"
                          >
                            <SortAscIcon className="h-5 w-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => setSortOrder("asc")}
                            className={cn(
                              "cursor-pointer",
                              sortOrder === "asc" && "bg-accent/50"
                            )}
                          >
                            <ArrowUpAZ className="mr-2 h-4 w-4" />
                            {t("library.sort.aToZ")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setSortOrder("desc")}
                            className={cn(
                              "cursor-pointer",
                              sortOrder === "desc" && "bg-accent/50"
                            )}
                          >
                            <ArrowDownAZ className="mr-2 h-4 w-4" />
                            {t("library.sort.zToA")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            className="cursor-pointer"
                            checked={filters.favorites}
                            onCheckedChange={checked =>
                              setFilters(prev => ({ ...prev, favorites: checked }))
                            }
                          >
                            <Heart className="mr-2 h-4 w-4" />
                            {t("library.filters.favorites")}
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={filters.vrOnly}
                            onCheckedChange={checked =>
                              setFilters(prev => ({ ...prev, vrOnly: checked }))
                            }
                            className="cursor-pointer"
                          >
                            <svg
                              className="mr-2 h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M2 10C2 8.89543 2.89543 8 4 8H20C21.1046 8 22 8.89543 22 10V17C22 18.1046 21.1046 19 20 19H16.1324C15.4299 19 14.7788 18.6314 14.4174 18.029L12.8575 15.4292C12.4691 14.7818 11.5309 14.7818 11.1425 15.4292L9.58261 18.029C9.22116 18.6314 8.57014 19 7.86762 19H4C2.89543 19 2 18.1046 2 17V10Z"
                                stroke="currentColor"
                                strokeWidth={1.3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M3.81253 6.7812C4.5544 5.6684 5.80332 5 7.14074 5H16.8593C18.1967 5 19.4456 5.6684 20.1875 6.7812L21 8H3L3.81253 6.7812Z"
                                stroke="currentColor"
                                strokeWidth={1.3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            {t("library.filters.vrGames")}
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={filters.onlineGames}
                            onCheckedChange={checked =>
                              setFilters(prev => ({ ...prev, onlineGames: checked }))
                            }
                            className="cursor-pointer"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {t("library.filters.onlineGames")}
                          </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className={cn(
                              "rounded p-2 hover:bg-secondary/50",
                              selectionMode && "bg-primary/10 text-primary"
                            )}
                            type="button"
                            aria-label={t("library.multiselect")}
                            onClick={() => {
                              setSelectionMode(prev => !prev);
                              setSelectedGames([]);
                            }}
                          >
                            <CheckSquareIcon className="h-5 w-5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-secondary">
                          {t("library.multiselect")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <button
                      className={cn("rounded p-2 hover:bg-secondary/50")}
                      type="button"
                      aria-label={t("library.newFolder")}
                      onClick={() => setIsNewFolderOpen(true)}
                    >
                      <FolderPlus className="h-5 w-5" />
                    </button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className={cn(
                              "rounded p-2 hover:bg-secondary/50",
                              isSyncingLibrary && "cursor-not-allowed opacity-50"
                            )}
                            type="button"
                            aria-label={t("library.cloudSync") || "Cloud Sync"}
                            onClick={handleCloudSync}
                            disabled={isSyncingLibrary}
                          >
                            {isSyncingLibrary ? (
                              <Loader className="h-5 w-5 animate-spin" />
                            ) : (
                              <CloudUpload className="h-5 w-5" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-secondary">
                          {user
                            ? t("library.cloudSync") || "Cloud Sync"
                            : t("library.signInToSync") || "Sign in to sync"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <NewFolderDialog
                      open={isNewFolderOpen}
                      onOpenChange={setIsNewFolderOpen}
                      onCreate={handleCreateFolder}
                    />
                  </div>
                </div>

                {/* Bulk Remove Bar (only in selection mode) */}
                {selectionMode && (
                  <div className="mb-4 mt-2 flex items-center justify-between rounded-md bg-secondary/30 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-primary">
                        {t("library.tools.selected", { count: selectedGames.length })}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        disabled={selectedGames.length === 0}
                        onClick={handleBulkRemove}
                      >
                        {t("library.tools.bulkRemove")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectionMode(false);
                          setSelectedGames([]);
                        }}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right side: Storage Info and Settings */}
              <div className="flex items-start gap-4">
                <div className="min-w-[250px] rounded-lg bg-secondary/10 p-3">
                  <div className="space-y-3">
                    {/* Username section */}
                    <div className="flex items-center justify-between border-b border-secondary/20 pb-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{username || "Guest"}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => navigate("/profile")}
                      ></Button>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SquareLibrary className="h-4 w-4 text-primary" />
                        <span className="text-sm text-muted-foreground">
                          {t("library.gamesInLibrary")}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {games.filter(g => !g.isFolder).length +
                          getGamesInFolders().length}
                      </span>
                    </div>

                    {/* Storage section */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-primary" />
                          <span className="text-sm text-muted-foreground">
                            {t("library.availableSpace")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {storageInfo ? (
                              formatBytes(storageInfo.freeSpace)
                            ) : (
                              <Loader className="h-4 w-4 animate-spin" />
                            )}
                          </span>
                          {storageInfo &&
                            storageInfo.directories &&
                            storageInfo.directories.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => setShowStorageDetails(prev => !prev)}
                              >
                                {showStorageDetails ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                        </div>
                      </div>

                      {/* If we have multiple directories, show each one */}
                      {storageInfo &&
                        storageInfo.directories &&
                        storageInfo.directories.length > 0 && (
                          <div className="space-y-2">
                            {/* Always show the main storage bar */}
                            <div className="relative mb-2 h-2">
                              {/* Ascendara Games Space */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="absolute left-0 top-0 h-2 cursor-help rounded-l-full bg-primary"
                                      style={{
                                        width: `${storageInfo ? (totalGamesSize / storageInfo.totalSpace) * 100 : 0}%`,
                                        zIndex: 2,
                                      }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent className="text-secondary">
                                    {t("library.spaceTooltip.games", {
                                      size: formatBytes(totalGamesSize),
                                    })}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {/* Other Used Space */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="absolute left-0 top-0 h-2 cursor-help rounded-r-full bg-muted"
                                      style={{
                                        width: `${storageInfo ? ((storageInfo.totalSpace - storageInfo.freeSpace) / storageInfo.totalSpace) * 100 : 0}%`,
                                        zIndex: 1,
                                      }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent className="text-secondary">
                                    {t("library.spaceTooltip.other", {
                                      size: formatBytes(
                                        storageInfo
                                          ? storageInfo.totalSpace -
                                              storageInfo.freeSpace -
                                              totalGamesSize
                                          : 0
                                      ),
                                    })}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {/* Background */}
                              <div className="h-2 w-full rounded-full bg-muted/30" />
                            </div>

                            {/* Show detailed directory information when expanded */}
                            {showStorageDetails && storageInfo.directories.length > 1 && (
                              <div className="space-y-2 border-t border-secondary/10 pt-1">
                                <div className="pt-1 text-xs text-muted-foreground">
                                  {t("library.storageDirectories")}:
                                </div>
                                {storageInfo.directories.map((dir, index) => (
                                  <div key={dir.path} className="space-y-1">
                                    {/* Directory path label */}
                                    <div className="flex items-center justify-between text-xs">
                                      <span
                                        className="truncate text-muted-foreground"
                                        style={{ maxWidth: "180px" }}
                                        title={dir.path}
                                      >
                                        {dir.path}
                                      </span>
                                      <span className="text-xs font-medium">
                                        {formatBytes(dir.freeSpace)}{" "}
                                        {t("library.freeSpace")}
                                      </span>
                                    </div>

                                    {/* Storage bar for this directory */}
                                    <div className="relative h-2">
                                      {/* Ascendara Games Space */}
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div
                                              className="absolute left-0 top-0 h-2 cursor-help rounded-l-full bg-primary"
                                              style={{
                                                width: `${dir.totalSpace ? ((dir.gamesSize || 0) / dir.totalSpace) * 100 : 0}%`,
                                                zIndex: 2,
                                              }}
                                            />
                                          </TooltipTrigger>
                                          <TooltipContent className="text-secondary">
                                            {t("library.spaceTooltip.games", {
                                              size: formatBytes(dir.gamesSize || 0),
                                              path: dir.path,
                                            })}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>

                                      {/* Other Used Space */}
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div
                                              className="absolute left-0 top-0 h-2 cursor-help rounded-r-full bg-muted"
                                              style={{
                                                width: `${dir.totalSpace ? ((dir.totalSpace - dir.freeSpace - (dir.gamesSize || 0)) / dir.totalSpace) * 100 : 0}%`,
                                                zIndex: 1,
                                              }}
                                            />
                                          </TooltipTrigger>
                                          <TooltipContent className="text-secondary">
                                            {t("library.spaceTooltip.other", {
                                              size: formatBytes(
                                                dir.totalSpace
                                                  ? dir.totalSpace -
                                                      dir.freeSpace -
                                                      (dir.gamesSize || 0)
                                                  : 0
                                              ),
                                              path: dir.path,
                                            })}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>

                                      {/* Background */}
                                      <div className="h-2 w-full rounded-full bg-muted/30" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Total space summary */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {t("library.gamesSpace")}:{" "}
                                {isCalculatingSize ? (
                                  t("library.calculatingSize")
                                ) : storageInfo ? (
                                  formatBytes(totalGamesSize)
                                ) : (
                                  <Loader className="h-4 w-4 animate-spin" />
                                )}
                              </span>
                              <span>
                                {t("library.totalSpace")}:{" "}
                                {formatBytes(storageInfo.totalSpace)}
                              </span>
                            </div>
                          </div>
                        )}

                      {/* Fallback to original single storage bar if no directories data */}
                      {(!storageInfo ||
                        !storageInfo.directories ||
                        storageInfo.directories.length === 0) && (
                        <div className="space-y-2">
                          <div className="relative mb-2">
                            {/* Ascendara Games Space */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className="absolute left-0 top-0 h-2 cursor-help rounded-l-full bg-primary"
                                    style={{
                                      width: `${storageInfo ? (totalGamesSize / storageInfo.totalSpace) * 100 : 0}%`,
                                      zIndex: 2,
                                    }}
                                  />
                                </TooltipTrigger>
                                <TooltipContent className="text-secondary">
                                  {t("library.spaceTooltip.games", {
                                    size: formatBytes(totalGamesSize),
                                  })}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {/* Other Used Space */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className="absolute left-0 top-0 h-2 cursor-help rounded-r-full bg-muted"
                                    style={{
                                      width: `${storageInfo ? ((storageInfo.totalSpace - storageInfo.freeSpace) / storageInfo.totalSpace) * 100 : 0}%`,
                                      zIndex: 1,
                                    }}
                                  />
                                </TooltipTrigger>
                                <TooltipContent className="text-secondary">
                                  {t("library.spaceTooltip.other", {
                                    size: formatBytes(
                                      storageInfo
                                        ? storageInfo.totalSpace -
                                            storageInfo.freeSpace -
                                            totalGamesSize
                                        : 0
                                    ),
                                  })}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {/* Background */}
                            <div className="h-2 w-full rounded-full bg-muted/30" />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {t("library.gamesSpace")}:{" "}
                              {isCalculatingSize ? (
                                t("library.calculatingSize")
                              ) : storageInfo ? (
                                formatBytes(totalGamesSize)
                              ) : (
                                <Loader className="h-4 w-4 animate-spin" />
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AlertDialog
              key="add-game-dialog"
              open={isAddGameOpen}
              onOpenChange={setIsAddGameOpen}
            >
              <AlertDialogTrigger asChild>
                <AddGameCard />
              </AlertDialogTrigger>
              <AlertDialogContent className="border-border bg-background sm:max-w-[425px]">
                <AlertDialogHeader className="space-y-2">
                  <AlertDialogTitle className="text-2xl font-bold text-foreground">
                    {t("library.addGame")}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs text-muted-foreground">
                    {t("library.addGameDescription2")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="max-h-[60vh] overflow-y-auto py-4">
                  <AddGameForm
                    onSuccess={() => {
                      setIsAddGameOpen(false);
                      setSelectedGameImage(null);
                      loadGames();
                    }}
                  />
                </div>
              </AlertDialogContent>
            </AlertDialog>

            <DndProvider backend={HTML5Backend}>
              {paginatedGames
                .sort((a, b) => (a.isFolder === b.isFolder ? 0 : a.isFolder ? -1 : 1))
                .map(game => (
                  <div key={game.game || game.name}>
                    {game.isFolder ? (
                      <DroppableFolderCard
                        folder={game}
                        onDropGame={droppedGame => {
                          // Add game to folder using the folderManager library
                          addGameToFolder(droppedGame, game.game);

                          // Get updated folder object from storage
                          const updatedFolders = loadFolders();
                          const updatedFolder = updatedFolders.find(
                            f => f.game === game.game
                          );

                          // Update folders state
                          setFolders(updatedFolders);

                          // Remove game from main list and update the folder in games array
                          setGames(prevGames =>
                            prevGames
                              .map(g => {
                                if (g.isFolder && g.game === game.game) {
                                  // Replace with updated folder object
                                  return { ...updatedFolder };
                                }
                                return g;
                              })
                              .filter(
                                g =>
                                  (g.game || g.name) !==
                                    (droppedGame.game || droppedGame.name) ||
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
                          onPlay={() =>
                            selectionMode ? handleSelectGame(game) : handlePlayGame(game)
                          }
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
                ))}
            </DndProvider>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              <Button
                variant="outline"
                className="px-3"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                {t("common.prev")}
              </Button>
              <span className="px-4 py-2 text-sm text-muted-foreground">
                {t("common.page")} {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                className="px-3"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                {t("common.next")}
              </Button>
            </div>
          )}

          {/* Cloud-Only Games Section */}
          {user && cloudOnlyGames.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
                  <Cloud className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h2 className="!mb-0 text-xl font-semibold">
                    {t("library.cloudOnly.title")}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t("library.cloudOnly.subtitle")}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cloudOnlyGames.map(game => (
                  <CloudOnlyGameCard
                    key={game.name}
                    game={game}
                    imageData={cloudGameImages[game.name]}
                    onRestore={() => handleRestoreFromCloud(game)}
                    isRestoring={restoringGame === game.name}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Play Later Games Section */}
          {playLaterGames.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="!mb-0 text-xl font-semibold">
                    {t("library.playLater.title")}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t("library.playLater.subtitle")}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {playLaterGames.map(game => (
                  <PlayLaterGameCard
                    key={game.game}
                    game={game}
                    onDownload={() => handleDownloadPlayLater(game)}
                    onRemove={() => handleRemoveFromPlayLater(game.game)}
                  />
                ))}
              </div>
            </div>
          )}
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
        <h3 className="mt-4 text-lg font-semibold">{t("library.addGame")}</h3>
        <p className="mt-2 text-center text-sm">{t("library.addGameDescription1")}</p>
      </CardContent>
    </Card>
  );
});

AddGameCard.displayName = "AddGameCard";

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
    const [isRunning, setIsRunning] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [imageData, setImageData] = useState(null);
    const [executableExists, setExecutableExists] = useState(null);
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

    // Load game image with localStorage cache
    useEffect(() => {
      let isMounted = true;
      const gameId = game.game || game.name;
      const localStorageKey = `game-cover-${gameId}`; // Use consistent key naming

      const loadGameImage = async () => {
        // Try localStorage first
        const cachedImage = localStorage.getItem(localStorageKey);
        if (cachedImage) {
          if (isMounted) setImageData(cachedImage);
          return;
        }
        // Otherwise, fetch from Electron
        try {
          const imageBase64 = await window.electron.getGameImage(gameId);
          if (imageBase64 && isMounted) {
            const dataUrl = `data:image/jpeg;base64,${imageBase64}`;
            setImageData(dataUrl);
            try {
              localStorage.setItem(localStorageKey, dataUrl);
            } catch (e) {
              // If storage quota exceeded, skip caching
              console.warn("Could not cache game image:", e);
            }
          }
        } catch (error) {
          console.error("Error loading game image:", error);
        }
      };

      // Listen for game cover update events
      const handleCoverUpdate = event => {
        const { gameName, dataUrl } = event.detail;
        if (gameName === gameId && dataUrl && isMounted) {
          console.log(`Received cover update for ${gameName}`);
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
        const covers = await gameService.searchGameCovers(query);
        setCoverSearch(prev => ({ ...prev, isLoading: false, results: covers || [] }));

        // Load local images if using local index
        if (settings.usingLocalIndex && settings.localIndex) {
          const imageUrls = {};
          for (const cover of covers || []) {
            if (cover.gameID) {
              try {
                const localImagePath = `${settings.localIndex}/imgs/${cover.gameID}.jpg`;
                const localImageUrl =
                  await window.electron.getLocalImageUrl(localImagePath);
                if (localImageUrl) {
                  imageUrls[cover.gameID] = localImageUrl;
                }
              } catch (error) {
                console.warn(`Could not load local image for ${cover.gameID}:`, error);
              }
            }
          }
          setCoverImageUrls(imageUrls);
        } else {
          setCoverImageUrls({});
        }
      } catch (err) {
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
                        src={
                          settings.usingLocalIndex &&
                          cover.gameID &&
                          coverImageUrls[cover.gameID]
                            ? coverImageUrls[cover.gameID]
                            : settings.usingLocalIndex && cover.gameID
                              ? gameService.getImageUrlByGameId(cover.gameID)
                              : gameService.getImageUrl(cover.imgID)
                        }
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
                  // Remove old image from localStorage
                  const localStorageKey = `game-cover-${game.game || game.name}`;
                  localStorage.removeItem(localStorageKey);
                  // Fetch new image and save to localStorage
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
                      // Fetch from API
                      const imageUrl = gameService.getImageUrl(
                        coverSearch.selectedCover.imgID
                      );
                      const response = await fetch(imageUrl);
                      const blob = await response.blob();
                      dataUrl = await new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                      });
                    }
                    localStorage.setItem(localStorageKey, dataUrl);
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

        <Card
          className={cn(
            "group relative overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-all duration-200",
            "hover:-translate-y-1 hover:shadow-xl",
            isSelected && "bg-primary/10 ring-2 ring-primary",
            selectionMode && game.isCustom && "selectable-card",
            "cursor-pointer"
          )}
          onClick={e => {
            if (selectionMode && game.isCustom) {
              e.stopPropagation();
              onSelectCheckbox();
            } else {
              onPlay();
            }
          }}
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
          <CardContent className="p-0">
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={imageData}
                alt={game.game}
                className="h-full w-full border-b border-border object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {typeof game.launchCount === "undefined" && !game.isCustom && (
                <span className="pointer-events-none absolute left-2 top-2 z-20 select-none rounded bg-secondary px-2 py-0.5 text-xs font-bold text-primary">
                  {t("library.newBadge")}
                </span>
              )}
              {updateInfo?.updateAvailable && (
                <span className="pointer-events-none absolute right-2 top-2 z-20 flex select-none items-center gap-1 rounded bg-primary px-2 py-0.5 text-xs font-bold text-secondary">
                  <Import className="h-3 w-3" />
                  {t("gameScreen.updateBadge")}
                </span>
              )}
              {/* Floating action bar for buttons */}
              <div className="absolute bottom-3 right-3 z-10 flex gap-2 rounded-lg bg-black/60 p-2 opacity-90 shadow-md transition-opacity hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                  title={
                    isFavorite ? t("library.removeFavorite") : t("library.addFavorite")
                  }
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation();
                    onToggleFavorite(game.game || game.name);
                  }}
                >
                  <Heart
                    className={cn(
                      "h-6 w-6",
                      isFavorite ? "fill-primary text-primary" : "fill-none text-white"
                    )}
                  />
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-2 p-4 pt-3">
            <div className="flex w-full items-center gap-2">
              <h3 className="flex-1 truncate text-lg font-semibold text-foreground">
                {game.game}
              </h3>
              {game.online && <Gamepad2 className="h-4 w-4 text-muted-foreground" />}
              {game.dlc && <Gift className="h-4 w-4 text-muted-foreground" />}
              {game.isVr && (
                <svg
                  className="p-0.5 text-foreground"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M2 10C2 8.89543 2.89543 8 4 8H20C21.1046 8 22 8.89543 22 10V17C22 18.1046 21.1046 19 20 19H16.1324C15.4299 19 14.7788 18.6314 14.4174 18.029L12.8575 15.4292C12.4691 14.7818 11.5309 14.7818 11.1425 15.4292L9.58261 18.029C9.22116 18.6314 8.57014 19 7.86762 19H4C2.89543 19 2 18.1046 2 17V10Z"
                    stroke="currentColor"
                    strokeWidth={1.3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3.81253 6.7812C4.5544 5.6684 5.80332 5 7.14074 5H16.8593C18.1967 5 19.4456 5.6684 20.1875 6.7812L21 8H3L3.81253 6.7812Z"
                    stroke="currentColor"
                    strokeWidth={1.3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {executableExists === true && (
                <AlertTriangle
                  className="h-4 w-4 text-yellow-500"
                  title={t("library.executableNotFound")}
                />
              )}
            </div>
            <p className="line-clamp-2 w-full text-sm text-muted-foreground">
              {game.playTime !== undefined ? (
                <span className="font-medium md:text-xs">
                  {game.playTime < 60
                    ? t("library.lessThanMinute")
                    : game.playTime < 120
                      ? `1 ${t("library.minute")} ${t("library.ofPlaytime")}`
                      : game.playTime < 3600
                        ? `${Math.floor(game.playTime / 60)} ${t("library.minutes")} ${t("library.ofPlaytime")}`
                        : game.playTime < 7200
                          ? `1 ${t("library.hour")} ${t("library.ofPlaytime")}`
                          : `${Math.floor(game.playTime / 3600)} ${t("library.hours")} ${t("library.ofPlaytime")}`}
                </span>
              ) : (
                <span className="font-medium md:text-xs">{t("library.neverPlayed")}</span>
              )}
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
    if (hours === 0)
      return `${minutes} ${t("library.minutes")} ${t("library.ofPlaytime")}`;
    if (hours === 1) return `1 ${t("library.hour")} ${t("library.ofPlaytime")}`;
    return `${hours} ${t("library.hours")} ${t("library.ofPlaytime")}`;
  };

  const isCustomGame = game.isCustom;

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-xl"
      )}
    >
      <CardContent className="p-0">
        <div className="relative aspect-[4/3] overflow-hidden">
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
      <CardFooter className="flex flex-col items-start gap-3 p-4 pt-3">
        <div className="flex w-full items-center gap-2">
          <h3 className="flex-1 truncate text-lg font-semibold text-foreground">
            {game.name}
          </h3>
          {game.online && <Gamepad2 className="h-4 w-4 text-muted-foreground" />}
          {game.dlc && <Gift className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex w-full items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{formatPlaytime(game.playTime)}</span>
        </div>
        <Button
          onClick={onRestore}
          disabled={isRestoring}
          className={cn(
            "w-full gap-2 text-white",
            isCustomGame
              ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              : "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
          )}
        >
          {isRestoring ? (
            <>
              <Loader className="h-4 w-4 animate-spin" />
              {t("library.cloudOnly.restoring")}
            </>
          ) : isCustomGame ? (
            <>
              <Plus className="h-4 w-4" />
              {t("library.cloudOnly.restoreCustom")}
            </>
          ) : (
            <>
              <CloudDownload className="h-4 w-4" />
              {t("library.cloudOnly.restore")}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
});

CloudOnlyGameCard.displayName = "CloudOnlyGameCard";

// Play Later game card
const PlayLaterGameCard = memo(({ game, onDownload, onRemove }) => {
  const { t } = useLanguage();
  const [imageData, setImageData] = useState(null);

  // Load game image from cache first, then fallback to API
  useEffect(() => {
    let isMounted = true;
    const loadImage = async () => {
      // Try cached image first
      const cachedImage = localStorage.getItem(`play-later-image-${game.game}`);
      if (cachedImage) {
        if (isMounted) setImageData(cachedImage);
        return;
      }

      // Fallback to API if no cached image
      if (game.imgID) {
        try {
          const response = await fetch(
            `https://api.ascendara.app/v2/image/${game.imgID}`
          );
          if (response.ok && isMounted) {
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
              if (isMounted) {
                setImageData(reader.result);
                // Cache for future use
                try {
                  localStorage.setItem(`play-later-image-${game.game}`, reader.result);
                } catch (e) {
                  console.warn("Could not cache play later image:", e);
                }
              }
            };
            reader.readAsDataURL(blob);
          }
        } catch (error) {
          console.error("Error loading play later game image:", error);
        }
      }
    };
    loadImage();
    return () => {
      isMounted = false;
    };
  }, [game.game, game.imgID]);

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
        <div className="relative aspect-[4/3] overflow-hidden">
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
      <CardFooter className="flex flex-col items-start gap-3 p-4 pt-3">
        <div className="flex w-full items-center gap-2">
          <h3 className="flex-1 truncate text-lg font-semibold text-foreground">
            {game.game}
          </h3>
          {game.online && <Gamepad2 className="h-4 w-4 text-muted-foreground" />}
          {game.dlc && <Gift className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
          {game.size && <span>{game.size}</span>}
          {game.addedAt && (
            <span className="text-xs">
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

const AddGameForm = ({ onSuccess }) => {
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
        // Try Steam API first for better metadata
        let steamData = null;
        try {
          steamData = await igdbService.getGameDetails(query);
          if (steamData && steamData.cover) {
            // If Steam API returns data, use it
            const steamResult = {
              game: steamData.name,
              gameID: steamData.id?.toString(),
              imgID: steamData.id?.toString(),
              img: steamData.cover.url || steamData.cover.formatted_url,
              steamAppId: steamData.id,
            };
            setCoverSearch(prev => ({
              ...prev,
              results: [steamResult],
              selectedCover: steamResult, // Auto-select Steam result
              isLoading: false,
            }));

            // Set the image URL directly from Steam
            if (steamResult.img) {
              setCoverImageUrls({ [steamResult.gameID]: steamResult.img });
            }
            return;
          }
        } catch (steamError) {
          console.log(
            "Steam API search failed, falling back to game service:",
            steamError
          );
        }

        // Fallback to original game service search
        const results = await gameService.searchGameCovers(query);
        const firstResult = results.length > 0 ? results[0] : null;
        setCoverSearch(prev => ({
          ...prev,
          results: results.slice(0, 9),
          selectedCover: firstResult, // Auto-select first result
          isLoading: false,
        }));

        // Load local images if using local index
        if (settings.usingLocalIndex && settings.localIndex) {
          const imageUrls = {};
          for (const cover of results.slice(0, 9)) {
            if (cover.gameID) {
              try {
                const localImagePath = `${settings.localIndex}/imgs/${cover.gameID}.jpg`;
                const localImageUrl =
                  await window.electron.getLocalImageUrl(localImagePath);
                if (localImageUrl) {
                  imageUrls[cover.gameID] = localImageUrl;
                }
              } catch (error) {
                console.warn(`Could not load local image for ${cover.gameID}:`, error);
              }
            }
          }
          setCoverImageUrls(imageUrls);
        } else {
          setCoverImageUrls({});
        }
      } catch (error) {
        console.error("Error searching covers:", error);
        setCoverSearch(prev => ({ ...prev, isLoading: false }));
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
    e.preventDefault();
    // imgID is used for image file lookups in both local index and API
    const coverImageId = coverSearch.selectedCover?.imgID;
    await window.electron.addGame(
      formData.name,
      formData.isOnline,
      formData.hasDLC,
      formData.version,
      formData.executable,
      coverImageId
    );
    onSuccess();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start truncate bg-background text-left font-normal text-primary hover:bg-accent"
              onClick={() => setShowImportDialog(true)}
            >
              <Import className="mr-2 h-4 w-4 flex-shrink-0" />
              <span>{t("library.importSteamGames")}</span>
            </Button>
          </div>

          <Separator className="my-2" />

          <Button
            type="button"
            variant="outline"
            className="w-full justify-start truncate bg-background text-left font-normal text-primary hover:bg-accent"
            onClick={handleChooseExecutable}
          >
            <FolderOpen className="mr-2 h-4 w-4 flex-shrink-0" />
            <span className="truncate">
              {formData.executable || t("library.chooseExecutableFile")}
            </span>
          </Button>

          {/* Import Steam Games Dialog */}
          <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-2xl font-bold text-foreground">
                  {t("library.importSteamGames")}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-foreground">
                  <span>
                    {t("library.importSteamGamesDescription")}{" "}
                    <a
                      className="cursor-pointer text-primary hover:underline"
                      onClick={() =>
                        window.electron.openURL(
                          "https://ascendara.app/docs/features/overview#importing-from-steam"
                        )
                      }
                    >
                      {t("common.learnMore")}{" "}
                      <ExternalLink className="mb-1 inline-block h-3 w-3" />
                    </a>
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="steamapps-directory" className="text-foreground">
                  {t("library.steamappsDirectory")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="steamapps-directory"
                    value={steamappsDirectory}
                    readOnly
                    className="flex-1 border-input bg-background text-foreground"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleChooseSteamappsDirectory}
                    className="bg-primary text-secondary"
                  >
                    {t("library.chooseDirectory")}
                  </Button>
                </div>
                {isSteamappsDirectoryInvalid && (
                  <div className="mt-1 text-sm font-semibold text-red-500">
                    {t("library.steamappsDirectoryMissingCommon")}
                  </div>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => setSteamappsDirectory("")}
                  className="text-primary"
                >
                  {t("common.cancel")}
                </AlertDialogCancel>
                <Button
                  type="button"
                  onClick={handleImportSteamGames}
                  disabled={!steamappsDirectory}
                  className="bg-primary text-secondary"
                >
                  {t("library.import")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Importing Dialog */}
        <AlertDialog open={showImportingDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-bold text-foreground">
                {importSuccess === null && (
                  <>
                    <Loader className="text-foreground-muted mr-2 inline h-5 w-5 animate-spin" />
                    {t("library.importingGames")}
                  </>
                )}
                {importSuccess === true && t("library.importSuccessTitle")}
                {importSuccess === false && t("library.importFailedTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-foreground">
                {importSuccess === null && (
                  <div className="flex items-center gap-2">
                    {t("library.importingGamesDesc")}
                  </div>
                )}
                {importSuccess === true && (
                  <div className="text-foreground-muted">
                    {t("library.importSuccessDesc")}
                  </div>
                )}
                {importSuccess === false && (
                  <div className="text-foreground-muted">
                    {t("library.importFailedDesc")}
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {importSuccess !== null && (
                <Button
                  className="bg-primary text-secondary"
                  onClick={handleCloseImportingDialog}
                >
                  {t("common.ok")}
                </Button>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="space-y-2">
          <Label htmlFor="name" className="text-foreground">
            {t("library.gameName")}
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="border-input bg-background text-foreground"
          />
        </div>

        <Separator className="bg-border" />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="hasVersion" className="flex-1 text-foreground">
              {t("library.version")}
            </Label>
            <Switch
              id="hasVersion"
              checked={formData.hasVersion}
              onCheckedChange={checked =>
                setFormData(prev => ({
                  ...prev,
                  hasVersion: checked,
                  version: !checked ? "" : prev.version,
                }))
              }
            />
          </div>

          {formData.hasVersion && (
            <Input
              id="version"
              value={formData.version}
              onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))}
              placeholder={t("library.versionPlaceholder")}
              className="border-input bg-background text-foreground"
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="isOnline" className="flex-1 text-foreground">
            {t("library.hasOnlineFix")}
          </Label>
          <Switch
            id="isOnline"
            checked={formData.isOnline}
            onCheckedChange={checked =>
              setFormData(prev => ({ ...prev, isOnline: checked }))
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="hasDLC" className="flex-1 text-foreground">
            {t("library.includesAllDLCs")}
          </Label>
          <Switch
            id="hasDLC"
            checked={formData.hasDLC}
            onCheckedChange={checked =>
              setFormData(prev => ({ ...prev, hasDLC: checked }))
            }
          />
        </div>

        {/* Game Cover Search Section */}
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
                    src={
                      settings.usingLocalIndex &&
                      cover.gameID &&
                      coverImageUrls[cover.gameID]
                        ? coverImageUrls[cover.gameID]
                        : settings.usingLocalIndex && cover.gameID
                          ? gameService.getImageUrlByGameId(cover.gameID)
                          : gameService.getImageUrl(cover.imgID)
                    }
                    alt={cover.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity hover:opacity-100">
                    <p className="px-2 text-center text-sm text-white">{cover.title}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 text-center text-sm text-muted-foreground">
              {t("library.noResultsFound")}
            </div>
          )}

          {/* Selected Cover Preview */}
          {coverSearch.selectedCover && (
            <div className="mt-4 flex justify-center">
              <div className="relative aspect-video w-64 overflow-hidden rounded-lg border-2 border-primary">
                <img
                  src={
                    settings.usingLocalIndex &&
                    coverSearch.selectedCover.gameID &&
                    coverImageUrls[coverSearch.selectedCover.gameID]
                      ? coverImageUrls[coverSearch.selectedCover.gameID]
                      : settings.usingLocalIndex && coverSearch.selectedCover.gameID
                        ? gameService.getImageUrlByGameId(
                            coverSearch.selectedCover.gameID
                          )
                        : gameService.getImageUrl(coverSearch.selectedCover.imgID)
                  }
                  alt={coverSearch.selectedCover.title}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <AlertDialogFooter className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onSuccess()} className="text-primary">
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!formData.executable || !formData.name}
          className="bg-primary text-secondary"
        >
          {t("library.addGame")}
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
      // Prevent dropping a game that's already in this folder
      return !folder.items?.some(g => (g.game || g.name) === (item.game || item.name));
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
