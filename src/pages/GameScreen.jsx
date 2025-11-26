import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  Heart,
  Play,
  FolderOpen,
  Gamepad2,
  Gift,
  Tag,
  PackageOpen,
  Trash2,
  Pencil,
  Monitor,
  StopCircle,
  Loader,
  FileCheck2,
  FolderSync,
  AlertTriangle,
  Info,
  Star,
  Clock,
  ExternalLink,
  Settings2,
  Download,
  FileSearch,
  ThumbsUp,
  Copy,
  Music2,
  HeadphoneOff,
  Trophy,
  Award,
  LetterText,
  BookX,
  LockIcon,
  ImageUp,
  Bolt,
  Plus,
  GripVertical,
  X,
} from "lucide-react";
import gameUpdateService from "@/services/gameUpdateService";
import { loadFolders, saveFolders } from "@/lib/folderManager";
import { cn } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import { useIgdbConfig } from "@/services/gameInfoConfig";
import { useAudioPlayer, killAudioAndMiniplayer } from "@/services/audioPlayerService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analytics } from "@/services/analyticsService";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getGameSoundtrack } from "@/services/khinsiderService";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import VerifyingGameDialog from "@/components/VerifyingGameDialog";
import recentGamesService from "@/services/recentGamesService";
import GamesBackupDialog from "@/components/GamesBackupDialog";
import imageCacheService from "@/services/imageCacheService";
import GameMetadata from "@/components/GameMetadata";
import igdbService from "@/services/gameInfoService";
import GameRate from "@/components/GameRate";
import EditCoverDialog from "@/components/EditCoverDialog";

const ExecutableManagerDialog = ({ open, onClose, gameName, isCustom, t }) => {
  const [executables, setExecutables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && gameName) {
      setLoading(true);
      gameUpdateService.getGameExecutables(gameName, isCustom).then(exes => {
        setExecutables(exes.length > 0 ? exes : [""]);
        setLoading(false);
      });
    }
  }, [open, gameName, isCustom]);

  const handleAddExecutable = async () => {
    // Open dialog in the same directory as the first executable
    const startPath = executables.length > 0 && executables[0] ? executables[0] : null;
    const exePath = await window.electron.openFileDialog(startPath);
    if (exePath) {
      setExecutables(prev => [...prev, exePath]);
    }
  };

  const handleChangeExecutable = async index => {
    // Pass current executable path to open dialog in that directory
    const currentExe = executables[index];
    const exePath = await window.electron.openFileDialog(currentExe || null);
    if (exePath) {
      setExecutables(prev => {
        const updated = [...prev];
        updated[index] = exePath;
        return updated;
      });
    }
  };

  const handleRemoveExecutable = index => {
    if (executables.length <= 1) return;
    setExecutables(prev => prev.filter((_, i) => i !== index));
  };

  const handleMakePrimary = index => {
    if (index === 0) return;
    setExecutables(prev => {
      const updated = [...prev];
      const [item] = updated.splice(index, 1);
      updated.unshift(item);
      return updated;
    });
  };

  const handleSave = async () => {
    const validExecutables = executables.filter(exe => exe && exe.trim() !== "");
    if (validExecutables.length === 0) {
      toast.error(t("library.executableManager.atLeastOne"));
      return;
    }
    setSaving(true);
    const success = await gameUpdateService.updateGameExecutables(
      gameName,
      validExecutables,
      isCustom
    );
    setSaving(false);
    if (success) {
      toast.success(t("library.executableManager.saved"));
      onClose();
    } else {
      toast.error(t("library.executableManager.saveFailed"));
    }
  };

  const getFileName = path => {
    if (!path) return "";
    return path.split(/[/\\]/).pop();
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("library.executableManager.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("library.executableManager.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-4 max-h-64 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            executables.map((exe, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
              >
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex items-center gap-2">
                    {index === 0 && (
                      <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary">
                        {t("library.executableManager.primary")}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium text-foreground">
                      {getFileName(exe) || t("library.executableManager.noFile")}
                    </span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{exe}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {index !== 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleMakePrimary(index)}
                      title={t("library.executableManager.makePrimary")}
                    >
                      <GripVertical className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleChangeExecutable(index)}
                    title={t("library.executableManager.change")}
                  >
                    <Pencil className="h-4 w-4 text-primary" />
                  </Button>
                  {executables.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive h-8 w-8"
                      onClick={() => handleRemoveExecutable(index)}
                      title={t("library.executableManager.remove")}
                    >
                      <X className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <Button
          variant="outline"
          className="w-full text-primary"
          onClick={handleAddExecutable}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("library.executableManager.addExecutable")}
        </Button>

        <AlertDialogFooter className="mt-4 flex gap-2">
          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="bg-primary text-secondary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const ExecutableSelectDialog = ({ open, onClose, executables, onSelect, t }) => {
  const getFileName = path => {
    if (!path) return "";
    return path.split(/[/\\]/).pop();
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("library.executableSelect.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("library.executableSelect.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-4 max-h-64 space-y-2 overflow-y-auto">
          {executables.map((exe, index) => (
            <button
              key={index}
              onClick={() => onSelect(exe)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
            >
              <Play className="h-5 w-5 shrink-0 text-primary" />
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center gap-2">
                  {index === 0 && (
                    <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary">
                      {t("library.executableManager.primary")}
                    </span>
                  )}
                  <span className="truncate text-sm font-medium text-foreground">
                    {getFileName(exe)}
                  </span>
                </div>
                <span className="truncate text-xs text-muted-foreground">{exe}</span>
              </div>
            </button>
          ))}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const ErrorDialog = ({
  open,
  onClose,
  errorGame,
  errorMessage,
  t,
  onManageExecutables,
}) => (
  <AlertDialog open={open} onOpenChange={onClose}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="text-2xl font-bold text-foreground">
          {t("library.launchError")}
        </AlertDialogTitle>
        <AlertDialogDescription className="space-y-4 text-muted-foreground">
          {t("library.launchErrorMessage", { game: errorGame })}&nbsp;
          <span
            onClick={() => {
              window.electron.openURL(
                "https://ascendara.app/docs/troubleshooting/common-issues#executable-not-found-launch-error"
              );
            }}
            className="cursor-pointer hover:underline"
          >
            {t("common.learnMore")} <ExternalLink className="mb-1 inline-block h-3 w-3" />
          </span>
          <br />
          <br />
          {errorMessage}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex gap-2">
        <Button variant="outline" className="text-primary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          className="bg-primary text-secondary"
          onClick={() => {
            onClose();
            onManageExecutables();
          }}
        >
          {t("library.changeExecutable")}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const UninstallConfirmationDialog = ({
  open,
  onClose,
  onConfirm,
  gameName,
  isUninstalling,
  t,
}) => (
  <AlertDialog open={open} onOpenChange={onClose}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="text-2xl font-bold text-foreground">
          {t("library.confirmDelete")}
        </AlertDialogTitle>
        <AlertDialogDescription className="space-y-4 text-muted-foreground">
          {t("library.deleteConfirmMessage", { game: gameName })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex gap-2">
        <Button variant="outline" className="text-primary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button className="text-secondary" onClick={onConfirm} disabled={isUninstalling}>
          {isUninstalling ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              {t("library.deleting")}
            </>
          ) : (
            t("library.delete", { game: gameName })
          )}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const SteamNotRunningDialog = ({ open, onClose, t }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleStartSteam = async () => {
    setIsLoading(true);
    await window.electron.startSteam();

    // Wait for 2 seconds then close
    setTimeout(() => {
      setIsLoading(false);
      onClose();
    }, 2000);
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("library.steamNotRunning")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-muted-foreground">
            {t("library.steamNotRunningMessage")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <Button
            className="text-secondary"
            onClick={handleStartSteam}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("gameScreen.startingSteam")}
              </>
            ) : (
              t("gameScreen.startSteam")
            )}
          </Button>

          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("common.ok")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default function GameScreen() {
  const showError = (game, error) => {
    setErrorGame(game);
    setErrorMessage(error);
    setShowErrorDialog(true);
  };

  const handleGameLaunchError = (_, { game, error }) => {
    showError(game, error);
  };

  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { gameData } = location.state || {};
  const { settings } = useSettings();
  const igdbConfig = useIgdbConfig();
  const [game, setGame] = useState(gameData || null);
  const [loading, setLoading] = useState(!gameData);
  const [imageData, setImageData] = useState("");
  const [executableExists, setExecutableExists] = useState(true);
  const [favorites, setFavorites] = useState(() => {
    const savedFavorites = localStorage.getItem("game-favorites");
    return savedFavorites ? JSON.parse(savedFavorites) : [];
  });
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isShiftKeyPressed, setIsShiftKeyPressed] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [isVerifyingOpen, setIsVerifyingOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [showVrWarning, setShowVrWarning] = useState(false);
  const [showOnlineFixWarning, setShowOnlineFixWarning] = useState(false);
  const [showSteamNotRunningWarning, setShowSteamNotRunningWarning] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [soundtrack, setSoundtrack] = useState([]);
  const [loadingSoundtrack, setLoadingSoundtrack] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasRated, setHasRated] = useState(true);
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorGame, setErrorGame] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showExecutableManager, setShowExecutableManager] = useState(false);
  const [showExecutableSelect, setShowExecutableSelect] = useState(false);
  const [availableExecutables, setAvailableExecutables] = useState([]);
  const [pendingLaunchOptions, setPendingLaunchOptions] = useState(null);
  const [igdbData, setIgdbData] = useState(null);
  const [igdbLoading, setIgdbLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showEditCoverDialog, setShowEditCoverDialog] = useState(false);
  const [launchOptionsDialogOpen, setLaunchOptionsDialogOpen] = useState(false);
  const [launchCommand, setLaunchCommand] = useState("");
  const { setTrack, play } = useAudioPlayer();

  // Achievements state
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(true);

  // Achievements pagination state
  const [achievementsPage, setAchievementsPage] = useState(0);
  const perPage = 12; // 3 rows x 4 columns
  const totalPages =
    achievements && achievements.achievements
      ? Math.ceil(achievements.achievements.length / perPage)
      : 1;
  const paginatedAchievements =
    achievements && achievements.achievements
      ? achievements.achievements.slice(
          achievementsPage * perPage,
          (achievementsPage + 1) * perPage
        )
      : [];
  useEffect(() => {
    setAchievementsPage(0);
  }, [achievements]);

  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === "Shift") {
        setIsShiftKeyPressed(true);
      }
    };

    const handleKeyUp = e => {
      if (e.key === "Shift") {
        setIsShiftKeyPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const fetchAchievements = async () => {
      if (!game) {
        setAchievements(null);
        setAchievementsLoading(false);
        return;
      }
      setAchievementsLoading(true);
      try {
        const result = await window.electron.readGameAchievements(
          game.game || game.name,
          game.isCustom
        );
        setAchievements(result);
      } catch (e) {
        setAchievements(null);
      }
      setAchievementsLoading(false);
    };
    fetchAchievements();
  }, [game]);

  useEffect(() => {
    const init = async () => {
      setIsInitialized(true);
    };
    init();
  }, []);

  // Load game data
  useEffect(() => {
    const loadGame = async () => {
      try {
        // If we don't have game data from location state, navigate back to library
        if (!game) {
          navigate("/library");
          return;
        }

        setLoading(true);

        // Check if executable exists
        if (game.executable) {
          const exists = await window.electron.checkFileExists(game.executable);
          setExecutableExists(exists);
        }

        // Check if game is running
        const running = await window.electron.isGameRunning(game.game || game.name);
        setIsRunning(running);

        setLoading(false);

        // Fetch IGDB data
        fetchIgdbData(game.game || game.name);
      } catch (error) {
        console.error("Error loading game:", error);
        setLoading(false);
      }
    };

    loadGame();

    // Set up game running status listener
    const gameStatusInterval = setInterval(async () => {
      if (game) {
        const running = await window.electron.isGameRunning(game.game || game.name);
        setIsRunning(running);
      }
    }, 5000);

    return () => {
      clearInterval(gameStatusInterval);
    };
  }, [game, navigate]);

  // Set up event listeners
  useEffect(() => {
    if (!isInitialized) return; // Don't set up listeners until initialized

    const handleGameClosed = async () => {
      if (gameData) {
        // Get fresh game data
        const freshGames = await window.electron.getGames();
        const gameData = freshGames.find(
          g => (g.game || g.name) === (game.game || game.name)
        );

        if (gameData && gameData.launchCount === 1) {
          setShowRateDialog(true);
        }
      }
    };

    // Handle cover image updates from the main process
    const handleCoverImageUpdated = (_, data) => {
      if (data && data.game === (game.game || game.name) && data.success) {
        console.log(
          `[GameScreen] Received cover-image-updated IPC event for ${data.game}`
        );
        // Reload the game image with cache busting
        const gameId = game.game || game.name;
        window.electron.getGameImage(gameId).then(imageBase64 => {
          if (imageBase64) {
            const timestamp = new Date().getTime();
            setImageData(`data:image/jpeg;base64,${imageBase64}?t=${timestamp}`);
          }
        });
      }
    };

    window.electron.ipcRenderer.on("game-launch-error", handleGameLaunchError);
    window.electron.ipcRenderer.on("game-closed", handleGameClosed);
    window.electron.ipcRenderer.on("cover-image-updated", handleCoverImageUpdated);

    return () => {
      window.electron.ipcRenderer.removeListener(
        "game-launch-error",
        handleGameLaunchError
      );
      window.electron.ipcRenderer.removeListener("game-closed", handleGameClosed);
      window.electron.ipcRenderer.removeListener(
        "cover-image-updated",
        handleCoverImageUpdated
      );
    };
  }, [isInitialized, setShowRateDialog, game]); // Add required dependencies

  // Update favorite status when game or favorites change
  useEffect(() => {
    if (game && favorites) {
      const gameName = game.game || game.name;
      setIsFavorite(favorites.includes(gameName));
    }
  }, [game, favorites]);

  // Save favorites when they change
  useEffect(() => {
    localStorage.setItem("game-favorites", JSON.stringify(favorites));
  }, [favorites]);

  // Fetch Khinsider soundtrack on mount
  useEffect(() => {
    if (!game) return;
    const gameName = game.game || game.name;
    const storageKey = `khinsider-soundtrack-${gameName}`;
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      setSoundtrack(JSON.parse(cached));
      setLoadingSoundtrack(false);
    } else {
      setLoadingSoundtrack(true);
      getGameSoundtrack(gameName)
        .then(tracks => {
          setSoundtrack(tracks);
          localStorage.setItem(storageKey, JSON.stringify(tracks));
        })
        .finally(() => setLoadingSoundtrack(false));
    }
  }, [game]);

  // Load game image with localStorage cache (similar to Library.jsx)
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

      // If IGDB cover is available, use it
      if (igdbData?.cover?.url) {
        const coverUrl = igdbService.formatImageUrl(igdbData.cover.url, "cover_big");
        if (coverUrl && isMounted) {
          setImageData(coverUrl);
          // Cache the IGDB cover URL
          try {
            localStorage.setItem(localStorageKey, coverUrl);
          } catch (e) {
            console.warn("Could not cache game image:", e);
          }
          return;
        }
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
        console.log(`[GameScreen] Received cover update for ${gameName}`);
        setImageData(dataUrl);
        // Update localStorage cache
        try {
          localStorage.setItem(localStorageKey, dataUrl);
        } catch (e) {
          console.warn("Could not cache updated game image:", e);
        }
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
  }, [game.game, game.name, igdbData?.cover?.url]); // Add igdbData.cover.url as dependency

  // Log hasRated state changes
  useEffect(() => {
    console.log("gamedata:", game);
    if (game && !game.hasRated && game.launchCount > 1 && hasRated) {
      setHasRated(false);
    }
  }, [game]);

  // Toggle favorite status
  const toggleFavorite = async () => {
    try {
      const gameName = game.game || game.name;

      if (isFavorite) {
        // Remove from favorites
        setFavorites(favorites.filter(fav => fav !== gameName));
      } else {
        // Add to favorites
        setFavorites([...favorites, gameName]);
      }

      // Update isFavorite state (this will be handled by the useEffect)
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  // Format playtime
  const formatPlaytime = playTime => {
    if (playTime === undefined) return t("library.neverPlayed2");

    if (playTime < 60) return t("library.lessThanMinute2");
    if (playTime < 120) return `1 ${t("library.minute")}`;
    if (playTime < 3600) return `${Math.floor(playTime / 60)} ${t("library.minutes")}`;
    if (playTime < 7200) return `1 ${t("library.hour")}`;
    return `${Math.floor(playTime / 3600)} ${t("library.hours")}`;
  };

  // Handle play game
  const handlePlayGame = async (forcePlay = false, specificExecutable = null) => {
    const gameName = game.game || game.name;
    setIsLaunching(true);

    // Check if window.electron.isDev is true. Cannot run in developer mode
    if (await window.electron.isDev()) {
      toast.error(t("library.cannotRunDev"));
      setIsLaunching(false);
      return;
    }

    try {
      // First check if game is already running
      const isRunning = await window.electron.isGameRunning(gameName);
      if (isRunning) {
        toast.error(t("library.alreadyRunning", { game: gameName }));
        setIsLaunching(false);
        return;
      }

      // Check if Steam is running for onlinefix
      if (game.online) {
        if (!(await window.electron.isSteamRunning())) {
          toast.error(t("library.steamNotRunning"));
          setIsLaunching(false);
          setShowSteamNotRunningWarning(true);
          return;
        }
      }

      // Check if game is VR and show warning
      if (game.isVr && !forcePlay) {
        setShowVrWarning(true);
        setIsLaunching(false);
        return;
      }

      if (game.online && (game.launchCount < 1 || !game.launchCount)) {
        // Check if warning has been shown before
        const onlineFixWarningShown = localStorage.getItem("onlineFixWarningShown");
        if (!onlineFixWarningShown) {
          setShowOnlineFixWarning(true);
          // Save that warning has been shown
          localStorage.setItem("onlineFixWarningShown", "true");
          setIsLaunching(false);
          return;
        }
      }

      // Check for multiple executables if no specific one was provided
      if (!specificExecutable) {
        const executables = await gameUpdateService.getGameExecutables(
          gameName,
          game.isCustom
        );
        if (executables.length > 1) {
          // Store launch options and show selection dialog
          setPendingLaunchOptions({
            forcePlay,
            adminLaunch: isShiftKeyPressed,
          });
          setAvailableExecutables(executables);
          setShowExecutableSelect(true);
          setIsLaunching(false);
          return;
        }
      }

      console.log("Launching game: ", gameName);
      // Launch the game
      killAudioAndMiniplayer();
      // Use the tracked shift key state for admin privileges
      if (isShiftKeyPressed) {
        console.log("Launching game with admin privileges");
      }
      await window.electron.playGame(
        gameName,
        game.isCustom,
        game.backups ?? false,
        isShiftKeyPressed,
        specificExecutable
      );

      // Get and cache the game image before saving to recently played
      const imageBase64 = await window.electron.getGameImage(gameName);
      if (imageBase64) {
        await imageCacheService.getImage(game.imgID);
      }

      // Save to recently played games
      recentGamesService.addRecentGame({
        game: gameName,
        name: game.name,
        imgID: game.imgID,
        version: game.version,
        isCustom: game.isCustom,
        online: game.online,
        dlc: game.dlc,
      });

      analytics.trackGameButtonClick(game.game, "play", {
        isLaunching,
        isRunning,
      });
      setIsLaunching(false);
    } catch (error) {
      console.error("Error launching game:", error);
      setIsLaunching(false);
    }
  };

  // Handle executable selection from dialog
  const handleExecutableSelect = async selectedExecutable => {
    setShowExecutableSelect(false);
    if (selectedExecutable && pendingLaunchOptions) {
      await handlePlayGame(pendingLaunchOptions.forcePlay, selectedExecutable);
    }
    setPendingLaunchOptions(null);
    setAvailableExecutables([]);
  };

  // Handle open directory
  const handleOpenDirectory = async () => {
    if (!game) return;
    await window.electron.openGameDirectory(game.game || game.name, game.isCustom);
  };

  // Handle delete game
  const handleDeleteGame = async () => {
    try {
      setIsUninstalling(true);
      const gameId = game.game || game.name;

      // Remove the game from all folders
      const folders = loadFolders();
      const updatedFolders = folders.map(folder => ({
        ...folder,
        items: (folder.items || []).filter(item => (item.game || item.name) !== gameId),
      }));
      saveFolders(updatedFolders);

      // Clean up folder-specific favorites
      try {
        const favoritesObj = JSON.parse(localStorage.getItem("folder-favorites") || "{}");
        let favoritesUpdated = false;

        Object.keys(favoritesObj).forEach(folderKey => {
          if (favoritesObj[folderKey].includes(gameId)) {
            favoritesObj[folderKey] = favoritesObj[folderKey].filter(id => id !== gameId);
            favoritesUpdated = true;
          }
        });

        if (favoritesUpdated) {
          localStorage.setItem("folder-favorites", JSON.stringify(favoritesObj));
        }
      } catch (error) {
        console.error("Error updating folder favorites:", error);
      }

      // Delete the game from the main library
      if (game.isCustom) {
        await window.electron.removeCustomGame(gameId);
      } else {
        await window.electron.deleteGame(gameId);
      }

      setIsUninstalling(false);
      setIsDeleteDialogOpen(false);
      navigate("/library");
    } catch (error) {
      console.error("Error deleting game:", error);
      setIsUninstalling(false);
    }
  };

  // Handle close error dialog
  const handleCloseErrorDialog = () => {
    setShowErrorDialog(false);
    setErrorGame("");
    setErrorMessage("");
  };

  // Fetch IGDB data
  const fetchIgdbData = async gameName => {
    try {
      setIgdbLoading(true);

      // Create a config object that includes both IGDB and GiantBomb credentials
      const apiConfig = {
        ...igdbConfig,
        giantBombKey: settings.giantBombKey || "",
      };

      console.log("Fetching game data with config:", {
        igdbEnabled: igdbConfig.enabled,
        giantBombKeySet: Boolean(settings.giantBombKey),
      });

      const data = await igdbService.getGameDetails(gameName, apiConfig);

      if (data) {
        if (data.screenshots && data.screenshots.length > 0) {
          data.formatted_screenshots = data.screenshots.map(screenshot => ({
            ...screenshot,
            formatted_url: igdbService.formatImageUrl(screenshot.url, "screenshot_huge"),
          }));
        }
        setIgdbData(data);
      } else {
        console.log("No game data found for:", gameName);
      }

      setIgdbLoading(false);
    } catch (error) {
      console.error("Error fetching game data:", error);
      setIgdbLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  // Game not found
  if (!game) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold">{t("gameScreen.gameNotFound")}</h1>
          <Button onClick={() => navigate("/library")}>
            {t("gameScreen.backToLibrary")}
          </Button>
        </div>
      </div>
    );
  }

  // Prepare screenshots data from IGDB if available
  const screenshots = igdbData?.formatted_screenshots || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero section with game banner/header */}
      <div className="relative w-full">
        <div className="container relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-between p-4 md:p-8">
          {/* Back button */}
          <Button
            variant="ghost"
            className="flex w-fit items-center gap-2 text-primary hover:bg-primary/10"
            onClick={() => navigate("/library")}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("common.back")}
          </Button>

          {/* Game title and basic info */}
          <div className="mt-4">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold text-primary drop-shadow-md">
                {game.game}
              </h1>
              {game.online && (
                <Gamepad2
                  className="mb-2 h-5 w-5 text-primary"
                  title={t("library.iconLegend.onlineFix")}
                />
              )}
              {game.dlc && (
                <Gift
                  className="mb-2 h-5 w-5 text-primary"
                  title={t("library.iconLegend.allDlcs")}
                />
              )}
              {game.isVr && (
                <svg
                  className="mb-2 p-0.5 text-primary"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  title={t("library.iconLegend.vrGame")}
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
              {executableExists ? (
                <Button
                  variant="icon"
                  size="sm"
                  className="mb-2 text-primary transition-all hover:scale-110"
                  onClick={() => handlePlayGame()}
                  disabled={isLaunching || isRunning}
                >
                  {isLaunching ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                    </>
                  ) : isRunning ? (
                    <>
                      <StopCircle className="h-5 w-5" />
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 fill-current" />
                    </>
                  )}
                </Button>
              ) : (
                <AlertTriangle
                  className="mb-2 h-6 w-6 text-yellow-500"
                  title={t("library.executableNotFound")}
                />
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-4">
              {game.version && game.version !== "-1" && (
                <div className="flex items-center gap-1 text-sm text-primary/80">
                  <Tag className="h-4 w-4" />
                  <span>{game.version}</span>
                </div>
              )}
              {game.size && (
                <div className="flex items-center gap-1 text-sm text-primary/80">
                  <PackageOpen className="h-4 w-4" />
                  <span>{game.size}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-sm text-primary/80">
                <Clock className="h-4 w-4" />
                <span className="font-medium">{formatPlaytime(game.playTime)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left column - Game actions */}
          <div className="lg:col-span-1">
            <Card className="overflow-hidden">
              <CardContent className="space-y-6 p-6">
                {/* Main image */}
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg">
                  <img
                    src={imageData}
                    alt={game.game}
                    className="h-full w-full object-cover"
                  />
                  {/* Edit cover button */}
                  <div className="absolute left-2 top-2 z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                      style={{ pointerEvents: "auto" }}
                      title={t("library.editCoverImage")}
                      tabIndex={0}
                      onClick={e => {
                        e.stopPropagation();
                        setShowEditCoverDialog(true);
                      }}
                    >
                      <ImageUp className="h-5 w-5 fill-none text-white" />
                    </Button>
                  </div>
                  {isUninstalling && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="w-full max-w-[200px] space-y-2 px-4">
                        <div className="relative overflow-hidden">
                          <Progress value={undefined} className="bg-muted/30" />
                          <div
                            className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-primary/20 to-transparent"
                            style={{
                              animation: "shimmer 3s infinite ease-in-out",
                              backgroundSize: "200% 100%",
                              WebkitAnimation: "shimmer 3s infinite ease-in-out",
                              WebkitBackgroundSize: "200% 100%",
                            }}
                          />
                        </div>
                        <div className="text-center text-sm font-medium text-primary">
                          <span className="flex items-center justify-center gap-2">
                            <Loader className="h-4 w-4 animate-spin" />
                            {t("library.deleting")}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Favorite button */}
                <Button
                  variant="outline"
                  className="w-full gap-2 text-muted-foreground hover:text-primary"
                  onClick={toggleFavorite}
                >
                  <Heart
                    className={cn(
                      "h-5 w-5",
                      isFavorite ? "fill-primary text-primary" : "fill-none"
                    )}
                  />
                  {isFavorite
                    ? t("library.removeFromFavorites")
                    : t("library.addToFavorites")}
                </Button>

                {/* Main actions */}
                <div className="space-y-3">
                  {executableExists ? (
                    <Button
                      className="w-full gap-2 py-6 text-lg text-secondary"
                      size="lg"
                      onClick={handlePlayGame}
                      disabled={isLaunching || isRunning}
                    >
                      {isLaunching ? (
                        <>
                          <Loader className="h-5 w-5 animate-spin" />
                          {t("library.launching")}
                        </>
                      ) : isRunning ? (
                        <>
                          <StopCircle className="h-5 w-5" />
                          {t("library.running")}
                        </>
                      ) : (
                        <>
                          <Play className="h-5 w-5" />
                          {t("library.play")}
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      className="w-full gap-2 py-6 text-lg text-secondary"
                      size="lg"
                      onClick={async () => {
                        const exePath = await window.electron.openFileDialog(
                          game.executable
                        );
                        if (exePath) {
                          await gameUpdateService.updateGameExecutable(
                            game.game || game.name,
                            exePath
                          );
                          const exists = await window.electron.checkFileExists(exePath);
                          setExecutableExists(exists);
                        }
                      }}
                    >
                      <FileSearch className="h-5 w-5" />
                      {t("library.setExecutable")}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleOpenDirectory}
                  >
                    <FolderOpen className="h-5 w-5" />
                    {t("library.openGameDirectory")}
                  </Button>
                </div>

                <Separator />

                {/* Secondary actions */}
                <div className="text-secondary-foreground space-y-3">
                  {settings.ludusavi.enabled && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => setBackupDialogOpen(true)}
                    >
                      <FolderSync className="h-4 w-4" />
                      {t("gameScreen.backupSaves")}
                    </Button>
                  )}

                  {!game.isCustom && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => setIsVerifyingOpen(true)}
                    >
                      <FileCheck2 className="h-4 w-4" />
                      {t("library.verifyGameFiles")}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={async () => {
                      const commands = await window.electron.getLaunchCommands(
                        game.game || game.name,
                        game.isCustom
                      );
                      setLaunchCommand(commands || "");
                      setLaunchOptionsDialogOpen(true);
                    }}
                  >
                    <Bolt className="h-4 w-4" />
                    {t("gameScreen.launchOptions")}
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={async () => {
                      const success = await window.electron.createGameShortcut(game);
                      if (success) {
                        toast.success(t("library.shortcutCreated"));
                      } else {
                        toast.error(t("library.shortcutError"));
                      }
                    }}
                  >
                    <Monitor className="h-4 w-4" />
                    {t("library.createShortcut")}
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => setShowExecutableManager(true)}
                  >
                    <Pencil className="h-4 w-4" />
                    {t("library.changeExecutable")}
                    {!executableExists && (
                      <AlertTriangle
                        className="h-4 w-4 text-yellow-500"
                        title={t("library.executableNotFound")}
                      />
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() =>
                      game.isCustom ? handleDeleteGame() : setIsDeleteDialogOpen(true)
                    }
                    disabled={isUninstalling}
                  >
                    <Trash2 className="h-4 w-4" />
                    {game.isCustom
                      ? t("library.removeGameFromLibrary")
                      : t("library.deleteGame")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column - Game details */}
          <div className="space-y-8 lg:col-span-2">
            {/* Tabs for different sections */}
            <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="overview">
                  <Info className="mr-2 h-4 w-4" />
                  {t("gameScreen.overview")}
                </TabsTrigger>
                <TabsTrigger value="soundtrack">
                  <Music2 className="mr-2 h-4 w-4" />
                  {t("gameScreen.soundtrack")}
                </TabsTrigger>
                <TabsTrigger value="achievements">
                  <Trophy className="mr-2 h-4 w-4" />
                  {t("gameScreen.achievements")}
                </TabsTrigger>
                {igdbData && (
                  <TabsTrigger value="details">
                    <LetterText className="mr-2 h-4 w-4" />
                    {t("gameScreen.details")}
                  </TabsTrigger>
                )}
              </TabsList>

              {!hasRated && (
                <Card className="mb-4 overflow-hidden bg-gradient-to-br from-primary/80 via-primary to-primary/90 shadow-lg transition-all hover:shadow-xl">
                  <CardContent className="flex items-center justify-between p-6">
                    <div className="flex items-center space-x-4 text-secondary">
                      <div className="bg-primary-foreground/20 rounded-full p-3 shadow-inner">
                        <Star className="text-primary-foreground h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-primary-foreground text-xl font-bold">
                          {t("gameScreen.rateThisGame")}
                        </span>
                        <p className="text-primary-foreground/80 text-sm">
                          {t("gameScreen.helpOthers")}
                        </p>
                      </div>
                    </div>
                    <div className="grid">
                      <Button
                        variant="secondary"
                        className="bg-primary-foreground/10 hover:bg-primary-foreground/20 transform text-secondary transition-all duration-300 ease-in-out hover:scale-105"
                        onClick={() => setShowRateDialog(true)}
                      >
                        <ThumbsUp className="mr-2 h-5 w-5" />
                        {t("gameScreen.rateNow")}
                      </Button>
                      <Button
                        variant="none"
                        className="bg-primary-foreground/10 transform text-xs text-secondary transition-all duration-300 ease-in-out hover:scale-105"
                        onClick={() => {
                          window.electron.gameRated(
                            game.game || game.name,
                            game.isCustom
                          );
                          setHasRated(true);
                        }}
                      >
                        {t("gameScreen.dismiss")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Soundtrack tab */}
              <TabsContent value="soundtrack" className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <div>
                          <h2 className="text-2xl font-bold">
                            {game.game} {t("gameScreen.soundtrack")}
                          </h2>
                          {soundtrack.length > 0 && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {soundtrack.length} {t("gameScreen.aboutSoundtracks")}{" "}
                              <a
                                onClick={() =>
                                  window.electron.openURL(
                                    "https://downloads.khinsider.com/"
                                  )
                                }
                                className="inline cursor-pointer text-sm text-primary hover:underline"
                              >
                                Khinsider
                              </a>
                              .
                            </p>
                          )}
                        </div>
                      </div>
                      {soundtrack.length > 0 && (
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={async () => {
                            toast.success(t("gameScreen.downloadingAllTracks"));
                            const results = await Promise.all(
                              soundtrack.map(track =>
                                window.electron.downloadSoundtrack(track.url, game.game)
                              )
                            );
                            if (results.every(res => res?.success)) {
                              toast.success(t("gameScreen.allDownloadsComplete"));
                            } else {
                              toast.error(t("gameScreen.someDownloadsFailed"));
                            }
                          }}
                        >
                          <Download className="h-4 w-4" />
                          {t("gameScreen.downloadAll")}
                        </Button>
                      )}
                    </div>

                    {loadingSoundtrack ? (
                      <div className="flex flex-col items-center justify-center space-y-6 py-12">
                        <div className="relative flex flex-col items-center">
                          <Music2 className="h-8 w-8 animate-pulse text-primary/60 drop-shadow-lg" />
                        </div>
                        <p className="animate-pulse text-base font-semibold text-primary/70">
                          {t("gameScreen.loadingSoundtrack")}
                        </p>
                      </div>
                    ) : soundtrack.length > 0 ? (
                      <div className="relative overflow-hidden rounded-lg border bg-card">
                        <div className="sticky top-0 z-10 border-b bg-background/95 px-6 py-3 shadow-sm backdrop-blur-md transition-shadow duration-200">
                          <div className="grid grid-cols-[auto,1fr,auto] gap-6 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                            <div className="w-14 text-center">#</div>
                            <div>{t("gameScreen.trackTitle")}</div>
                          </div>
                        </div>

                        <div className="divide-y divide-border/50">
                          {soundtrack
                            .slice(currentPage * 12, (currentPage + 1) * 12)
                            .map((track, index) => (
                              <div
                                key={index}
                                className="group relative grid grid-cols-[auto,1fr,auto] items-center gap-6 overflow-hidden px-6 py-3 transition-colors hover:bg-accent/50"
                              >
                                {/* Track number */}
                                <div className="w-14 select-none text-center text-sm font-medium tabular-nums text-muted-foreground/70">
                                  <span className="transition-opacity duration-200 group-hover:opacity-0">
                                    {String(currentPage * 12 + index + 1).padStart(
                                      2,
                                      "0"
                                    )}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute left-6 top-1/2 h-8 w-14 -translate-y-1/2 opacity-0 transition-all duration-200 group-hover:opacity-100"
                                    onClick={() => {
                                      console.log(
                                        "[Soundtrack Play] Track object:",
                                        track
                                      );
                                      console.log(
                                        "[Soundtrack Play] Track URL:",
                                        track.url
                                      );
                                      // Use the direct URL for audio playback
                                      const playableTrack = {
                                        ...track,
                                        url: track.url.replace(
                                          "/api/khinsider",
                                          "https://downloads.khinsider.com"
                                        ),
                                      };
                                      console.log(
                                        "[Soundtrack Play] PlayableTrack object:",
                                        playableTrack
                                      );
                                      setTrack(playableTrack);
                                      play();
                                    }}
                                    title={t("gameScreen.playTrack")}
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                </div>

                                {/* Track title */}
                                <div className="flex min-w-0 items-center">
                                  <div className="truncate py-1">
                                    <p className="truncate text-sm font-medium">
                                      {track.title}
                                    </p>
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 transition-all duration-200 sm:opacity-0 sm:group-hover:opacity-100"
                                    onClick={() => {
                                      toast.success(t("gameScreen.downloadStarted"));
                                      window.electron
                                        .downloadSoundtrack(track.url, game.game)
                                        .then(res => {
                                          if (res?.success) {
                                            toast.success(
                                              t("gameScreen.downloadComplete")
                                            );
                                          } else {
                                            toast.error(t("gameScreen.downloadFailed"));
                                          }
                                        });
                                    }}
                                    title={t("gameScreen.downloadTrack")}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 transition-all duration-200 sm:opacity-0 sm:group-hover:opacity-100"
                                    onClick={() => {
                                      navigator.clipboard.writeText(track.title);
                                      toast.success(t("gameScreen.trackNameCopied"));
                                    }}
                                    title={t("gameScreen.copyTrackName")}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between border-t px-6 py-4">
                          <div className="text-sm text-muted-foreground">
                            {t("gameScreen.showingTracks", {
                              from: currentPage * 12 + 1,
                              to: Math.min((currentPage + 1) * 12, soundtrack.length),
                              total: soundtrack.length,
                            })}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                              disabled={currentPage === 0}
                            >
                              {t("common.prev")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setCurrentPage(p =>
                                  Math.min(Math.ceil(soundtrack.length / 12) - 1, p + 1)
                                )
                              }
                              disabled={
                                currentPage >= Math.ceil(soundtrack.length / 12) - 1
                              }
                            >
                              {t("common.next")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                        <div className="rounded-full bg-muted p-4">
                          <HeadphoneOff className="h-12 w-12 text-muted-foreground" />
                        </div>
                        <div className="space-y-2">
                          <p className="font-medium">
                            {t("gameScreen.noSoundtrackFound")}
                          </p>
                          <p className="max-w-sm text-sm text-muted-foreground">
                            {t("gameScreen.noSoundtrackDescription")}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Overview tab */}
              <TabsContent value="overview" className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    {/* Game summary */}
                    {igdbData?.summary ? (
                      <div className="space-y-4">
                        <h2 className="text-xl font-bold">{t("gameScreen.summary")}</h2>
                        <p className="leading-relaxed text-muted-foreground">
                          {igdbData.summary}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="mb-4 rounded-full bg-muted p-3">
                          <Info className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-medium">
                          {t("gameScreen.noSummaryAvailable")}
                        </h3>
                        <p className="mt-2 max-w-md text-sm text-muted-foreground">
                          {t("gameScreen.noSummaryDescription")}
                        </p>

                        {!igdbData && !igdbLoading && (
                          <Button
                            variant="outline"
                            className="mt-4 gap-2"
                            onClick={() => navigate("/settings")}
                          >
                            <Settings2 className="h-4 w-4" />
                            {t("gameScreen.configureIgdb")}
                          </Button>
                        )}

                        {igdbLoading && (
                          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader className="h-4 w-4 animate-spin" />
                            {t("gameScreen.loadingGameInfo")}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Featured screenshots */}
                {screenshots.length > 0 && (
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-xl font-bold">
                            {t("gameScreen.screenshots")}
                          </h2>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() => setActiveTab("media")}
                          >
                            {t("gameScreen.viewAll")}
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {screenshots.slice(0, 4).map((screenshot, index) => (
                            <div
                              key={index}
                              className="aspect-video overflow-hidden rounded-lg bg-muted"
                            >
                              <img
                                src={screenshot.formatted_url}
                                alt={`Screenshot ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Basic game info */}
                <Card>
                  <CardContent className="p-6">
                    <h2 className="mb-4 text-xl font-bold">{t("gameScreen.gameInfo")}</h2>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {game.version && game.version !== "-1" && (
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="text-sm text-muted-foreground">
                              {t("library.version")}
                            </span>
                            <p className="text-sm font-medium">{game.version}</p>
                          </div>
                        </div>
                      )}

                      {game.size && (
                        <div className="flex items-center gap-2">
                          <PackageOpen className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="text-sm text-muted-foreground">
                              {t("library.size")}
                            </span>
                            <p className="text-sm font-medium">{game.size}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="text-sm text-muted-foreground">
                            {t("library.playTime")}
                          </span>
                          <p className="text-sm font-medium">
                            {formatPlaytime(game.playTime)}
                          </p>
                        </div>
                      </div>

                      {game.executable && (
                        <div className="flex items-center gap-3">
                          <Monitor className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <span className="text-sm text-muted-foreground">
                              {t("library.executable").toUpperCase()}
                            </span>
                            <div className="flex items-center gap-2">
                              <p className="max-w-[220px] truncate text-sm font-medium text-foreground">
                                {game.executable.split("\\").pop()}
                              </p>
                              {!executableExists && (
                                <AlertTriangle
                                  className="h-5 w-5 animate-pulse text-red-500"
                                  title={t("library.executableNotFound")}
                                />
                              )}
                            </div>
                            {!executableExists && (
                              <p className="text-sm text-muted-foreground">
                                {t("library.executableNotFound")}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Details tab */}
              <TabsContent value="details" className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    {igdbData ? (
                      <GameMetadata gameInfo={igdbData} />
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2 text-center">
                          <div className="rounded-full bg-muted p-4">
                            <BookX className="h-12 w-12 text-muted-foreground" />
                          </div>
                          <div className="space-y-2">
                            <p className="font-medium">
                              {t("gameScreen.noDetailsAvailable")}
                            </p>
                            <p className="max-w-sm text-sm text-muted-foreground">
                              {t("gameScreen.noDetailsDescription")}
                            </p>
                          </div>
                        </div>
                        {!igdbData && !igdbLoading && (
                          <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => navigate("/settings")}
                          >
                            <Settings2 className="h-4 w-4" />
                            {t("gameScreen.configureIgdb")}
                          </Button>
                        )}

                        {igdbLoading && (
                          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader className="h-4 w-4 animate-spin" />
                            {t("gameScreen.loadingGameInfo")}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Achievements tab */}
              <TabsContent value="achievements" className="space-y-6">
                <Card className="overflow-visible">
                  <CardContent className="p-6">
                    {achievementsLoading ? (
                      <div className="flex flex-col items-center justify-center space-y-6 py-12">
                        <div className="relative flex flex-col items-center">
                          <Award className="h-10 w-10 animate-pulse text-primary/70 drop-shadow-lg" />
                        </div>
                        <p className="animate-pulse text-lg font-semibold text-primary/80">
                          {t("gameScreen.loadingAchievements")}
                        </p>
                      </div>
                    ) : achievements &&
                      achievements.achievements &&
                      achievements.achievements.length > 0 ? (
                      <>
                        {/* Achievements summary header */}
                        <div className="mb-8 flex flex-col items-center gap-2 sm:flex-row sm:justify-between sm:gap-4">
                          <div className="flex items-center gap-3">
                            <span className="text-primary-foreground text-2xl font-bold">
                              {t("gameScreen.achievements")}
                            </span>
                          </div>
                          <div>
                            <span className="mr-1 text-xl font-semibold text-primary">
                              {achievements.achievements.filter(a => a.achieved).length}
                            </span>
                            <span className="font-medium text-muted-foreground">
                              /{achievements.achievements.length}{" "}
                              {t("gameScreen.achievementsUnlocked")}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                          {paginatedAchievements.map((ach, idx) => {
                            const unlocked = ach.achieved;
                            return (
                              <div
                                key={ach.achID || idx + achievementsPage * perPage}
                                className={`relative flex flex-col items-center rounded-xl border bg-gradient-to-br shadow-lg transition-all duration-200 ${unlocked ? "from-yellow-50/80 via-green-50/90 to-green-100/80 dark:from-yellow-900/40 dark:via-green-900/30 dark:to-green-800/40" : "from-gray-100/80 via-muted/90 to-muted/80 dark:from-gray-900/40 dark:via-muted/30 dark:to-muted/60"} group min-h-[220px] p-5 hover:scale-[1.03] hover:shadow-2xl`}
                                tabIndex={0}
                                aria-label={ach.message}
                              >
                                <div className="relative mb-3">
                                  <img
                                    src={ach.icon}
                                    alt={ach.message}
                                    className={`h-16 w-16 rounded-lg border-2 ${unlocked ? "border-yellow-400 dark:border-yellow-300" : "border-muted"} bg-card shadow-lg`}
                                    style={{
                                      filter: unlocked
                                        ? "none"
                                        : "grayscale(0.85) brightness(0.85)",
                                    }}
                                  />
                                  {!unlocked && (
                                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                                      <LockIcon className="h-8 w-8 text-white/80" />
                                    </div>
                                  )}
                                </div>
                                <div
                                  className={`mb-1 text-center text-lg font-semibold ${unlocked ? "text-primary" : "text-muted-foreground"}`}
                                >
                                  {ach.message}
                                </div>
                                <div className="mb-2 min-h-[32px] text-center text-xs text-muted-foreground">
                                  {ach.description}
                                </div>
                                <div className="text-center text-xs">
                                  {unlocked ? (
                                    <span
                                      className="font-medium text-primary"
                                      title={
                                        ach.unlockTime
                                          ? new Date(
                                              Number(ach.unlockTime) * 1000
                                            ).toLocaleString()
                                          : undefined
                                      }
                                    >
                                      {t("gameScreen.achievementUnlocked")}
                                      {ach.unlockTime
                                        ? ` ${new Date(Number(ach.unlockTime) * 1000).toLocaleString()}`
                                        : ""}
                                    </span>
                                  ) : (
                                    <span className="font-medium text-gray-400 dark:text-gray-500">
                                      {t("gameScreen.achievementLocked")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Pagination controls */}
                        {totalPages > 1 && (
                          <div className="mt-8 flex items-center justify-center gap-4">
                            <button
                              className="rounded-full border px-4 py-2 text-primary disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => setAchievementsPage(p => Math.max(0, p - 1))}
                              disabled={achievementsPage === 0}
                              aria-label="Previous page"
                            >
                              {t("common.prev")}
                            </button>
                            <span className="text-sm text-muted-foreground">
                              {t("common.page")} {achievementsPage + 1} / {totalPages}
                            </span>
                            <button
                              className="rounded-full border px-4 py-2 text-primary disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() =>
                                setAchievementsPage(p => Math.min(totalPages - 1, p + 1))
                              }
                              disabled={achievementsPage === totalPages - 1}
                              aria-label="Next page"
                            >
                              {t("common.next")}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                        <div className="rounded-full bg-muted p-4">
                          <Award className="h-12 w-12 text-muted-foreground" />
                        </div>
                        <div className="space-y-2">
                          <p className="font-medium">
                            {t("gameScreen.noAchievementsFound")}
                          </p>
                          <p className="max-w-sm text-sm text-muted-foreground">
                            {t("gameScreen.noAchievementsDescription")}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <VerifyingGameDialog
        game={game}
        open={isVerifyingOpen}
        onOpenChange={setIsVerifyingOpen}
      />

      <GamesBackupDialog
        game={game}
        open={backupDialogOpen}
        onOpenChange={setBackupDialogOpen}
      />

      {/* Rate game dialog */}
      <GameRate
        game={game}
        isOpen={showRateDialog}
        onClose={() => {
          setShowRateDialog(false);
        }}
      />

      {/* VR Warning Dialog */}
      <AlertDialog
        open={showVrWarning}
        onOpenChange={open => {
          setShowVrWarning(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("library.vrWarning.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("library.vrWarning.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              className="text-xs text-primary"
              onClick={() => {
                setShowVrWarning(false);
                window.electron.openURL(
                  "https://ascendara.app/docs/troubleshooting/vr-games"
                );
              }}
            >
              {t("library.vrWarning.learnMore")}
            </Button>
            <Button
              className="text-secondary"
              onClick={() => {
                setShowVrWarning(false);
                handlePlayGame(true);
              }}
            >
              {t("library.vrWarning.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Online Fix Warning Dialog */}
      <AlertDialog open={showOnlineFixWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("download.onlineFixWarningTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("download.onlineFixWarningDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowOnlineFixWarning(false);
                handlePlayGame(true);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.ok")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GamesBackupDialog
        open={backupDialogOpen}
        onOpenChange={setBackupDialogOpen}
        game={game}
      />

      <ErrorDialog
        open={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        errorGame={errorGame}
        errorMessage={errorMessage}
        t={t}
        onManageExecutables={() => setShowExecutableManager(true)}
      />

      <ExecutableManagerDialog
        open={showExecutableManager}
        onClose={() => setShowExecutableManager(false)}
        gameName={game?.game || game?.name}
        isCustom={game?.isCustom}
        t={t}
      />

      <ExecutableSelectDialog
        open={showExecutableSelect}
        onClose={() => {
          setShowExecutableSelect(false);
          setPendingLaunchOptions(null);
          setAvailableExecutables([]);
        }}
        executables={availableExecutables}
        onSelect={handleExecutableSelect}
        t={t}
      />

      {/* Edit Cover Dialog */}
      <EditCoverDialog
        open={showEditCoverDialog}
        onOpenChange={setShowEditCoverDialog}
        gameName={game?.game || game?.name}
        onImageUpdate={(dataUrl, imgId) => {
          setImageData(dataUrl);
          // Update the game's imgID if needed
          if (game) {
            // Pass both imgId and dataUrl to the updateGameCover function
            // The IPC handler will decide which one to use based on what's provided
            window.electron
              .updateGameCover(game.game || game.name, imgId, dataUrl)
              .then(() => {
                console.log("Game image updated successfully");
              })
              .catch(error => {
                console.error("Failed to update game image:", error);
              });
          }
        }}
      />

      {/* Uninstall Confirmation Dialog */}
      <UninstallConfirmationDialog
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteGame}
        gameName={game.game}
        open={isDeleteDialogOpen}
        isUninstalling={isUninstalling}
        t={t}
      />

      {/* Steam Not Running Dialog */}
      <SteamNotRunningDialog
        open={showSteamNotRunningWarning}
        onClose={() => setShowSteamNotRunningWarning(false)}
        t={t}
      />

      {/* Launch Options Dialog */}
      <AlertDialog
        open={launchOptionsDialogOpen}
        onOpenChange={setLaunchOptionsDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gameScreen.launchOptions")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("gameScreen.launchOptionsDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={launchCommand}
            className="text-foreground"
            onChange={e => setLaunchCommand(e.target.value)}
            placeholder={t("gameScreen.launchCommandPlaceholder")}
          />
          <AlertDialogFooter>
            <Button
              variant="outline"
              className="text-primary"
              onClick={() => setLaunchOptionsDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="text-secondary"
              onClick={async () => {
                const success = await window.electron.saveLaunchCommands(
                  game.game || game.name,
                  launchCommand,
                  game.isCustom
                );
                if (success) {
                  setGame({ ...game, launchCommands: launchCommand });
                  toast.success(t("gameScreen.launchOptionsSaved"));
                } else {
                  toast.error(t("common.error"));
                }
                setLaunchOptionsDialogOpen(false);
              }}
            >
              {t("common.save")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
