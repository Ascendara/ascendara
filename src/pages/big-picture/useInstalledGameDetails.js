import { useNavigate } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { useState, useRef, useEffect, useCallback } from "react";
import steamService from "@/services/gameInfoService";
import { toast } from "sonner";
import gameUpdateService from "@/services/gameUpdateService";
import { pullCloudGameDataBeforeLaunch } from "@/services/gameLaunchCloudSync";
import recentGamesService from "@/services/recentGamesService";
import {
  loadFolders,
  saveFolders,
  addGameToFolder,
  removeGameFromFolder,
} from "@/lib/folderManager";
import { readStoredList } from "./surfaceNavigation";
import { getControllerButtons } from "./controller";
import { useControllerInput } from "./useControllerInput";
import {
  hasActiveSubscription,
  uploadBackupToCloud,
} from "@/services/cloudBackupService";
import { listBackups as listCloudBackups } from "@/services/firebaseService";
import { restoreCloudSave } from "@/services/restoreCloudSave";

function useInstalledGameDetails({
  game,
  onBack,
  t,
  controllerType,
  onChangeAssets,
  assetSearchOpen,
  autoLaunch = false,
}) {
  const autoLaunchHandled = useRef(false);
  const [launchChecksReady, setLaunchChecksReady] = useState(false);
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { user, userData } = useAuth();
  const [logoSrc, setLogoSrc] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [gridSrc, setGridSrc] = useState(null);
  const [hasHeroImage, setHasHeroImage] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [steamData, setSteamData] = useState(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [showManagementMenu, setShowManagementMenu] = useState(false);
  const [canInput, setCanInput] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [selectedButton, setSelectedButton] = useState("play"); // 'play' or 'folder' or 'manage'
  const [selectedMenuItem, setSelectedMenuItem] = useState(0);
  const [folders, setFolders] = useState(loadFolders);
  const [isFavorite, setIsFavorite] = useState(() =>
    readStoredList("game-favorites").includes(game.game || game.name)
  );
  const [trainerToggleFocused, setTrainerToggleFocused] = useState(false);
  const [achievementsToggleFocused, setAchievementsToggleFocused] = useState(false);
  const buttons = getControllerButtons(controllerType);
  const gameName = game.game || game.name;
  const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
  const [directoryBrowserPath, setDirectoryBrowserPath] = useState(null);

  // Executable management
  const [executableExists, setExecutableExists] = useState(true);
  const canLaunchGame = executableExists;
  const [showExecutableManager, setShowExecutableManager] = useState(false);
  const [showExecutableSelect, setShowExecutableSelect] = useState(false);
  const [availableExecutables, setAvailableExecutables] = useState([]);
  const [pendingLaunchOptions, setPendingLaunchOptions] = useState(null);

  // Trainer support
  const [trainerExists, setTrainerExists] = useState(false);
  const [launchWithTrainerEnabled, setLaunchWithTrainerEnabled] = useState(() => {
    const saved = localStorage.getItem(`launch-with-trainer-${game?.game || game?.name}`);
    return saved === "true";
  });

  // Dialogs and warnings
  const [showVrWarning, setShowVrWarning] = useState(false);
  const [showOnlineFixWarning, setShowOnlineFixWarning] = useState(false);
  const [showSteamNotRunningWarning, setShowSteamNotRunningWarning] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [backupScreen, setBackupScreen] = useState("options");
  const [cloudBackups, setCloudBackups] = useState([]);
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false);
  const [cloudBackupError, setCloudBackupError] = useState(null);
  const [selectedCloudBackup, setSelectedCloudBackup] = useState(null);
  const [cloudRestoreBusy, setCloudRestoreBusy] = useState(false);
  const [autoCloudBackupEnabled, setAutoCloudBackupEnabled] = useState(
    () => localStorage.getItem(`cloudBackup_${gameName}`) === "true"
  );
  const cloudAvailable = !!user && hasActiveSubscription(userData);
  const isSignedIn = !!user;
  useEffect(() => {
    if (backupDialogOpen) {
      setBackupScreen("options");
      setDialogButtonIndex(0);
      setAutoCloudBackupEnabled(
        localStorage.getItem(`cloudBackup_${gameName}`) === "true"
      );
    }
  }, [backupDialogOpen, gameName]);
  const [showBrowseExeWarning, setShowBrowseExeWarning] = useState(false);
  const [dialogButtonIndex, setDialogButtonIndex] = useState(0);

  // Achievements state
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(true);
  const [achievementsPage, setAchievementsPage] = useState(0);
  const [showAchievements, setShowAchievements] = useState(false);
  const achievementsPerPage = 12;
  const totalAchievementsPages =
    achievements && achievements.achievements
      ? Math.ceil(achievements.achievements.length / achievementsPerPage)
      : 1;
  const paginatedAchievements =
    achievements && achievements.achievements
      ? achievements.achievements.slice(
          achievementsPage * achievementsPerPage,
          (achievementsPage + 1) * achievementsPerPage
        )
      : [];

  useEffect(() => {
    console.log("[InstalledGameDetailsView] Mounted with game:", gameName);
    console.log("[InstalledGameDetailsView] Game object:", game);

    if (gameName) {
      window.electron.ensureGameAssets(gameName);
    }

    // Check if executable exists
    const checkExecutable = async () => {
      if (game.executable) {
        const exists = await window.electron.checkFileExists(game.executable);
        setExecutableExists(exists);
      } else {
        setExecutableExists(false);
      }
    };

    // Check if trainer exists
    const checkTrainer = async () => {
      try {
        const exists = await window.electron.checkTrainerExists(gameName);
        setTrainerExists(exists);
      } catch (e) {
        setTrainerExists(false);
      }
    };
    Promise.all([checkExecutable(), checkTrainer()])
      .catch(() => setExecutableExists(false))
      .finally(() => setLaunchChecksReady(true));

    // Fetch achievements
    const fetchAchievements = async () => {
      setAchievementsLoading(true);
      try {
        const result = await window.electron.readGameAchievements(
          gameName,
          game.isCustom
        );
        setAchievements(result);
      } catch (e) {
        setAchievements(null);
      }
      setAchievementsLoading(false);
    };
    fetchAchievements();
  }, [gameName, game.executable, game.isCustom]);

  // Load game hero image for background
  useEffect(() => {
    let isMounted = true;
    const loadHero = async () => {
      try {
        console.log("[InstalledGameDetailsView] Loading hero image for:", gameName);
        const base64 = await window.electron.getGameImage(gameName, "hero");
        if (isMounted && base64) {
          console.log("[InstalledGameDetailsView] Hero image loaded successfully");
          setImageSrc(`data:image/jpeg;base64,${base64}`);
          setHasHeroImage(true);
        } else {
          console.log(
            "[InstalledGameDetailsView] No hero image found, loading header/grid for card layout"
          );
          setHasHeroImage(false);
          // Load header/grid image for the old card-style layout
          const gridBase64 = await window.electron.getGameImage(gameName);
          if (isMounted && gridBase64) {
            setImageSrc(`data:image/jpeg;base64,${gridBase64}`);
          }
        }
      } catch (e) {
        console.error("[InstalledGameDetailsView] Error loading game image:", e);
        setHasHeroImage(false);
      }
    };
    loadHero();
    return () => {
      isMounted = false;
    };
  }, [gameName]);

  // Load game grid
  useEffect(() => {
    let isMounted = true;
    const loadGrid = async () => {
      try {
        console.log("[InstalledGameDetailsView] Loading grid image for:", gameName);
        const gridBase64 = await window.electron.getGameImage(gameName, "grid");
        if (isMounted && gridBase64) {
          setGridSrc(`data:image/jpeg;base64,${gridBase64}`);
        }
      } catch (e) {
        console.error("[InstalledGameDetailsView] Error loading grid image:", e);
      }
    };
    loadGrid();
    return () => {
      isMounted = false;
    };
  }, [gameName]);

  // Load game logo
  useEffect(() => {
    let isMounted = true;
    const loadLogo = async () => {
      try {
        const base64 = await window.electron.getGameImage(gameName, "logo");

        if (isMounted && base64) {
          setLogoSrc(`data:image/png;base64,${base64}`);
        }
      } catch (e) {
        // Silently fail if no logo found
      }
    };
    loadLogo();
    return () => {
      isMounted = false;
    };
  }, [gameName]);

  // Load play time from game object
  useEffect(() => {
    console.log("[InstalledGameDetailsView] Game playTime:", game.playTime);
    setPlayTime(game.playTime || 0);
  }, [game.playTime]);

  // Check if game is running
  useEffect(() => {
    const checkRunning = async () => {
      try {
        const running = await window.electron.isGameRunning(gameName);
        setIsRunning(running);
      } catch (e) {
        console.error("Error checking game status:", e);
      }
    };
    checkRunning();
    const interval = setInterval(checkRunning, 2000);
    return () => clearInterval(interval);
  }, [gameName]);

  // Fetch Steam data
  useEffect(() => {
    let isMounted = true;
    const fetchGameData = async () => {
      console.log("[InstalledGameDetailsView] Fetching Steam data for:", gameName);
      setSteamData(null);
      setLoadingMedia(true);
      try {
        const data = await steamService.getGameDetails(gameName);
        console.log("[InstalledGameDetailsView] Steam data received:", data);
        if (data) {
          console.log(
            "[InstalledGameDetailsView] - short_description:",
            data.short_description
          );
          console.log(
            "[InstalledGameDetailsView] - formatted_screenshots:",
            data.formatted_screenshots
          );
          console.log(
            "[InstalledGameDetailsView] - screenshots count:",
            data.formatted_screenshots?.length || 0
          );
        }
        if (isMounted && data) {
          setSteamData(data);
        } else if (!data) {
          console.log("[InstalledGameDetailsView] No Steam data found for game");
        }
      } catch (error) {
        console.error("[InstalledGameDetailsView] Error fetching steam data:", error);
      } finally {
        if (isMounted) {
          console.log(
            "[InstalledGameDetailsView] Loading complete, loadingMedia set to false"
          );
          setLoadingMedia(false);
        }
      }
    };
    fetchGameData();
    return () => {
      isMounted = false;
    };
  }, [gameName]);

  // Input delay on opening
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanInput(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Handle play game
  const handlePlayGame = async (forcePlay = false, specificExecutable = null) => {
    if (isLaunching || isRunning) return;

    setIsLaunching(true);

    try {
      // Check if in dev mode
      if (await window.electron.isDev()) {
        setTimeout(() => toast.error(t("library.cannotRunDev")), 0);
        setIsLaunching(false);
        return;
      }

      // Check if already running
      const running = await window.electron.isGameRunning(gameName);
      if (running) {
        setTimeout(() => toast.error(t("library.alreadyRunning", { game: gameName })), 0);
        setIsLaunching(false);
        return;
      }

      // Check Steam for online games
      if (game.online && (await window.electron.isOnWindows())) {
        const hideSteamWarning = localStorage.getItem("hideSteamWarning");
        if (!hideSteamWarning) {
          if (!(await window.electron.isSteamRunning())) {
            setShowSteamNotRunningWarning(true);
            setIsLaunching(false);
            return;
          }
        }
      }

      // Check if game is VR and show warning
      if (game.isVr && !forcePlay) {
        setShowVrWarning(true);
        setIsLaunching(false);
        return;
      }

      // Check for online fix warning on first launch
      if (game.online && (game.launchCount < 1 || !game.launchCount)) {
        const onlineFixWarningShown = localStorage.getItem("onlineFixWarningShown");
        if (!onlineFixWarningShown) {
          setShowOnlineFixWarning(true);
          localStorage.setItem("onlineFixWarningShown", "true");
          setIsLaunching(false);
          return;
        }
      }

      // Check for multiple executables if no specific one was provided
      if (!specificExecutable) {
        const executables = game._sourceDir
          ? game.executables || (game.executable ? [game.executable] : [])
          : await gameUpdateService.getGameExecutables(gameName, game.isCustom);
        if (executables.length > 1) {
          setPendingLaunchOptions({ forcePlay });
          setAvailableExecutables(executables);
          setShowExecutableSelect(true);
          setIsLaunching(false);
          return;
        }
      }

      // Cloud-first pre-launch merge (silent / best-effort — never blocks launch).
      await pullCloudGameDataBeforeLaunch(gameName);

      // Launch the game
      const result = await window.electron.playGame(
        gameName,
        game.isCustom,
        game.backups ?? false,
        false,
        specificExecutable,
        trainerExists && launchWithTrainerEnabled,
        game._sourceDir
          ? { _sourceDir: game._sourceDir, executable: game.executable }
          : null
      );

      if (result === false || result?.success === false) {
        toast.error(result?.error || t("library.launchFailed"));
        setIsLaunching(false);
        return;
      }

      // Save to recently played
      recentGamesService.addRecentGame({
        game: gameName,
        name: game.name,
        imgID: game.imgID,
        version: game.version,
        isCustom: game.isCustom,
        online: game.online,
        dlc: game.dlc,
      });

      // Considers that the game is running
      setIsRunning(true);

      // Keep the "Launching" status a little longer for the animation
      setTimeout(() => {
        setIsLaunching(false);
      }, 10000);
    } catch (error) {
      console.error("Error launching game:", error);
      setTimeout(() => toast.error(t("library.launchFailed")), 0);
      setIsLaunching(false);
    }
  };

  // Handle executable selection
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
    // Rebuild path from game's executable or from the download directory
    let gamePath = null;
    try {
      if (game.launcher) {
        gamePath = game.installPath || null;
      } else if (game.executable) {
        gamePath = game.executable.replace(/[\\/][^\\/]+$/, "");
      } else {
        const settings = await window.electron.getSettings();
        if (settings?.downloadDirectory) {
          gamePath = settings.downloadDirectory + "\\" + gameName;
        }
      }
    } catch {
      gamePath = null;
    }
    setDirectoryBrowserPath(gamePath);
    setShowDirectoryBrowser(true);
  };

  // Home Play uses the same launch flow, including warnings and executable selection.
  useEffect(() => {
    if (!autoLaunch || !launchChecksReady || !canInput || autoLaunchHandled.current)
      return;
    autoLaunchHandled.current = true;
    if (canLaunchGame) handlePlayGame();
    else setShowBrowseExeWarning(true);
  }, [autoLaunch, launchChecksReady, canInput, canLaunchGame, handlePlayGame]);

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
        await window.electron.removeCustomGame(gameId, game);
      } else {
        await window.electron.deleteGame(gameId, game);
      }

      setIsUninstalling(false);
      setIsDeleteDialogOpen(false);
      setTimeout(() => toast.success(t("library.gameDeleted", { game: gameName })), 0);
      onBack();
    } catch (error) {
      console.error("Error deleting game:", error);
      setTimeout(() => toast.error(t("library.deleteFailed")), 0);
      setIsUninstalling(false);
    }
  };

  const handleBackupAction = useCallback(
    async index => {
      if (backupScreen === "cloudList") {
        if (index === cloudBackups.length) {
          setBackupScreen("options");
          setDialogButtonIndex(2);
        } else {
          setSelectedCloudBackup(cloudBackups[index]);
          setBackupScreen("cloudConfirm");
          setDialogButtonIndex(1);
        }
        return;
      }
      if (backupScreen === "cloudConfirm") {
        if (index === 1) {
          setBackupScreen("cloudList");
          setDialogButtonIndex(0);
          return;
        }
        if (cloudRestoreBusy || !selectedCloudBackup) return;
        setCloudRestoreBusy(true);
        try {
          await restoreCloudSave(selectedCloudBackup, settings);
          toast.success(t("library.backups.restoreSuccess"));
          setBackupDialogOpen(false);
          setBackupScreen("options");
        } catch (error) {
          toast.error(error.message || t("library.backups.restoreFailed"));
        } finally {
          setCloudRestoreBusy(false);
        }
        return;
      }
      if (index === 2) {
        if (!cloudAvailable) {
          setBackupDialogOpen(false);
          navigate("/ascend");
          return;
        }
        setBackupScreen("cloudList");
        setDialogButtonIndex(0);
        setCloudBackupLoading(true);
        setCloudBackupError(null);
        try {
          const result = await listCloudBackups(gameName);
          if (result.error) throw new Error(result.error);
          setCloudBackups(
            (Array.isArray(result.backups) ? result.backups : [])
              .map(backup => ({ ...backup, gameName: backup.gameName || gameName }))
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          );
        } catch (error) {
          setCloudBackupError(error.message || t("library.backups.loadBackupsFailed"));
        } finally {
          setCloudBackupLoading(false);
        }
        return;
      }
      if (index === 3 && cloudAvailable) {
        const enabled = !autoCloudBackupEnabled;
        localStorage.setItem(`cloudBackup_${gameName}`, String(enabled));
        setAutoCloudBackupEnabled(enabled);
        toast.success(
          t(
            enabled
              ? "library.backups.cloudBackupsEnabledToast"
              : "library.backups.cloudBackupsDisabledToast"
          )
        );
        return;
      }
      if (index > 1) {
        setBackupDialogOpen(false);
        setDialogButtonIndex(0);
        return;
      }
      setBackupDialogOpen(false);
      setDialogButtonIndex(0);
      const operation = index === 0 ? "backup" : "restore";
      try {
        const result = await window.electron.ludusavi(operation, gameName);
        toast[result?.success ? "success" : "error"](
          t(`library.backups.${operation}${result?.success ? "Success" : "Failed"}`)
        );
        if (
          result?.success &&
          operation === "backup" &&
          autoCloudBackupEnabled &&
          cloudAvailable
        ) {
          const cloudResult = await uploadBackupToCloud(
            gameName,
            settings,
            user,
            userData
          );
          if (!cloudResult.success)
            toast.error(cloudResult.error || t("library.backups.backupFailed"));
        }
      } catch {
        toast.error(t(`library.backups.${operation}Failed`));
      }
    },
    [
      autoCloudBackupEnabled,
      backupScreen,
      cloudAvailable,
      cloudBackups,
      cloudRestoreBusy,
      gameName,
      navigate,
      selectedCloudBackup,
      settings,
      t,
      user,
      userData,
    ]
  );

  const handleManagementAction = index => {
    if (index === 0) {
      window.electron.createGameShortcut(game).then(success => {
        if (success) toast.success(t("library.shortcutCreated"));
        else toast.error(t("library.shortcutError"));
      });
    } else if (index === 1) {
      setShowExecutableManager(true);
    } else if (index === 2) {
      const favorites = readStoredList("game-favorites");
      const isSaved = favorites.includes(gameName);
      localStorage.setItem(
        "game-favorites",
        JSON.stringify(
          isSaved ? favorites.filter(name => name !== gameName) : [...favorites, gameName]
        )
      );
      setIsFavorite(!isSaved);
      window.dispatchEvent(new CustomEvent("favorites-updated"));
      return;
    } else if (index < folders.length + 3) {
      const folder = folders[index - 3];
      const contains = folder.items?.some(item => (item.game || item.name) === gameName);
      setFolders(
        contains
          ? removeGameFromFolder(gameName, folder.game)
          : addGameToFolder(game, folder.game)
      );
      window.dispatchEvent(new CustomEvent("ascendara:folders-updated"));
      return;
    } else if (game.isCustom) {
      handleDeleteGame();
    } else {
      setIsDeleteDialogOpen(true);
    }
    setShowManagementMenu(false);
    setDialogButtonIndex(0);
  };

  const handleInput = useCallback(
    action => {
      if (!canInput) return;

      // Handle achievements view navigation
      if (showAchievements) {
        if (action === "LEFT") {
          setAchievementsPage(prev => Math.max(0, prev - 1));
        } else if (action === "RIGHT") {
          setAchievementsPage(prev => Math.min(totalAchievementsPages - 1, prev + 1));
        } else if (action === "BACK") {
          setShowAchievements(false);
          setAchievementsPage(0);
        }
        return;
      }

      // Handle dialog navigation
      if (
        showVrWarning ||
        showOnlineFixWarning ||
        showSteamNotRunningWarning ||
        isDeleteDialogOpen ||
        showBrowseExeWarning ||
        showExecutableSelect ||
        showExecutableManager ||
        assetSearchOpen ||
        showDirectoryBrowser
      ) {
        // Block all input when directory browser is open
        if (showDirectoryBrowser) return;
        // If asset search is open, block all navigation
        if (assetSearchOpen) return;
        if (action === "LEFT") {
          setDialogButtonIndex(prev => Math.max(0, prev - 1));
        } else if (action === "RIGHT") {
          const maxIndex = showVrWarning
            ? 1
            : showOnlineFixWarning
              ? 0
              : showSteamNotRunningWarning
                ? 0
                : isDeleteDialogOpen
                  ? 1
                  : showBrowseExeWarning
                    ? 1
                    : showExecutableSelect
                      ? availableExecutables.length
                      : showExecutableManager
                        ? 1
                        : 0;
          setDialogButtonIndex(prev => Math.min(maxIndex, prev + 1));
        } else if (action === "UP") {
          if (showExecutableSelect) {
            setDialogButtonIndex(prev => Math.max(0, prev - 1));
          }
        } else if (action === "DOWN") {
          if (showExecutableSelect) {
            setDialogButtonIndex(prev => Math.min(availableExecutables.length, prev + 1));
          }
        } else if (action === "CONFIRM") {
          // Trigger the selected button
          if (showVrWarning) {
            if (dialogButtonIndex === 0) {
              setShowVrWarning(false);
            } else {
              setShowVrWarning(false);
              handlePlayGame(true);
            }
          } else if (showOnlineFixWarning) {
            setShowOnlineFixWarning(false);
            handlePlayGame(true);
          } else if (showSteamNotRunningWarning) {
            setShowSteamNotRunningWarning(false);
          } else if (isDeleteDialogOpen) {
            if (dialogButtonIndex === 0) {
              setIsDeleteDialogOpen(false);
            } else {
              handleDeleteGame();
            }
          } else if (showBrowseExeWarning) {
            // The file browser handles its own confirmation input.
          } else if (showExecutableSelect) {
            if (dialogButtonIndex < availableExecutables.length) {
              handleExecutableSelect(availableExecutables[dialogButtonIndex]);
            } else {
              setShowExecutableSelect(false);
              setPendingLaunchOptions(null);
              setAvailableExecutables([]);
            }
          } else if (showExecutableManager) {
            if (dialogButtonIndex === 0) {
              setShowExecutableManager(false);
            } else {
              window.electron.openFileDialog(game.executable).then(async exePath => {
                if (exePath) {
                  await gameUpdateService.updateGameExecutable(gameName, exePath);
                  const exists = await window.electron.checkFileExists(exePath);
                  setExecutableExists(exists);
                  toast.success(
                    t("library.executableUpdated") || "Executable updated successfully"
                  );
                }
                setShowExecutableManager(false);
              });
            }
          }
          setDialogButtonIndex(0);
        } else if (action === "BACK") {
          if (showVrWarning) setShowVrWarning(false);
          else if (showOnlineFixWarning) setShowOnlineFixWarning(false);
          else if (showSteamNotRunningWarning) setShowSteamNotRunningWarning(false);
          else if (isDeleteDialogOpen) setIsDeleteDialogOpen(false);
          else if (showBrowseExeWarning) {
            setShowBrowseExeWarning(false);
            window.__bReleasedAt = Date.now();
          } else if (showExecutableSelect) {
            setShowExecutableSelect(false);
            setPendingLaunchOptions(null);
            setAvailableExecutables([]);
          } else if (showExecutableManager) setShowExecutableManager(false);
          setDialogButtonIndex(0);
        }
        return;
      }

      // Backup dialog navigation
      if (backupDialogOpen) {
        if (cloudRestoreBusy) return;
        const lastIndex =
          backupScreen === "cloudConfirm"
            ? 1
            : backupScreen === "cloudList"
              ? cloudBackups.length
              : cloudAvailable
                ? 4
                : 3;
        if (action === "UP") {
          setDialogButtonIndex(prev => Math.max(0, prev - 1));
        } else if (action === "DOWN") {
          setDialogButtonIndex(prev => Math.min(lastIndex, prev + 1));
        } else if (action === "CONFIRM") {
          if (!cloudBackupLoading && !cloudRestoreBusy)
            handleBackupAction(dialogButtonIndex);
        } else if (action === "BACK") {
          if (backupScreen === "cloudConfirm") {
            setBackupScreen("cloudList");
          } else if (backupScreen === "cloudList") {
            setBackupScreen("options");
          } else {
            setBackupDialogOpen(false);
          }
          setDialogButtonIndex(0);
        }
        return;
      }

      // Management menu navigation
      if (showManagementMenu) {
        if (action === "DOWN") {
          const menuItemCount = folders.length + 4; // Shortcut, Executable, Favorite, Folders, Delete
          setSelectedMenuItem(prev => (prev + 1) % menuItemCount);
        } else if (action === "UP") {
          const menuItemCount = folders.length + 4;
          setSelectedMenuItem(prev => (prev - 1 + menuItemCount) % menuItemCount);
        } else if (action === "CONFIRM") {
          // Execute selected menu item
          handleManagementAction(selectedMenuItem);
        } else if (action === "BACK") {
          setShowManagementMenu(false);
          setSelectedMenuItem(0);
        }
        return;
      }

      // Normal navigation
      if (action === "DOWN") {
        const hasAchievements =
          achievements &&
          achievements.achievements &&
          achievements.achievements.length > 0;
        if (achievementsToggleFocused) {
          setAchievementsToggleFocused(false);
          if (trainerExists) {
            setTrainerToggleFocused(true);
          } else {
            setSelectedButton("play");
          }
        } else if (trainerToggleFocused) {
          setTrainerToggleFocused(false);
          setSelectedButton("play"); // Restore button selection
        } else if (!showMedia && selectedButton) {
          // Only go to media if we're on a button (not focused on toggles)
          setShowMedia(true);
        }
      } else if (action === "UP") {
        const hasAchievements =
          achievements &&
          achievements.achievements &&
          achievements.achievements.length > 0;
        if (showMedia) {
          setShowMedia(false);
        } else if (trainerToggleFocused && hasAchievements) {
          setTrainerToggleFocused(false);
          setAchievementsToggleFocused(true);
          setSelectedButton("");
        } else if (!trainerToggleFocused && !achievementsToggleFocused && trainerExists) {
          setTrainerToggleFocused(true);
          setSelectedButton(""); // Clear button selection when focusing trainer
        } else if (
          !trainerToggleFocused &&
          !achievementsToggleFocused &&
          !trainerExists &&
          hasAchievements
        ) {
          setAchievementsToggleFocused(true);
          setSelectedButton("");
        }
      } else if (action === "LEFT") {
        if (achievementsToggleFocused) {
          // Do nothing on achievements toggle
        } else if (trainerToggleFocused) {
          // Do nothing on trainer toggle
        } else if (!showMedia) {
          if (selectedButton === "folder") setSelectedButton("play");
          else if (selectedButton === "manage") setSelectedButton("folder");
          else if (selectedButton === "assets") setSelectedButton("manage");
          else if (selectedButton === "backups") setSelectedButton("assets");
        }
      } else if (action === "RIGHT") {
        if (achievementsToggleFocused) {
          // Do nothing on achievements toggle
        } else if (trainerToggleFocused) {
          // Do nothing on trainer toggle
        } else if (!showMedia) {
          if (selectedButton === "play") setSelectedButton("folder");
          else if (selectedButton === "folder") setSelectedButton("manage");
          else if (selectedButton === "manage") setSelectedButton("assets");
          else if (selectedButton === "assets") setSelectedButton("backups");
        }
      } else if (action === "BACK" || action === "MENU") {
        if (achievementsToggleFocused) {
          setAchievementsToggleFocused(false);
        } else if (trainerToggleFocused) {
          setTrainerToggleFocused(false);
        } else if (showMedia) {
          setShowMedia(false);
        } else {
          console.log("[GAME DETAILS] Back/Menu pressed, calling onBack");
          onBack();
        }
      } else if (action === "CONFIRM") {
        if (achievementsToggleFocused) {
          setShowAchievements(true);
        } else if (trainerToggleFocused) {
          const newValue = !launchWithTrainerEnabled;
          setLaunchWithTrainerEnabled(newValue);
          localStorage.setItem(`launch-with-trainer-${gameName}`, newValue.toString());
          toast.success(
            newValue
              ? t("gameScreen.trainerEnabledToast")
              : t("gameScreen.trainerDisabledToast")
          );
        } else if (!showMedia) {
          if (selectedButton === "play" && !isLaunching && !isRunning) {
            if (!canLaunchGame) {
              setShowBrowseExeWarning(true);
            } else {
              handlePlayGame();
            }
          } else if (selectedButton === "folder") {
            handleOpenDirectory();
          } else if (selectedButton === "manage") {
            setShowManagementMenu(true);
            setSelectedMenuItem(0);
          } else if (selectedButton === "assets") {
            onChangeAssets?.();
          } else if (selectedButton === "backups") {
            setDialogButtonIndex(0);
            setBackupDialogOpen(true);
          }
        }
      } else if (action === "X") {
        if (!showMedia && !trainerToggleFocused && !achievementsToggleFocused)
          handleOpenDirectory();
      } else if (action === "Y") {
        if (
          !showMedia &&
          !showManagementMenu &&
          !trainerToggleFocused &&
          !achievementsToggleFocused
        ) {
          setShowManagementMenu(true);
          setSelectedMenuItem(0);
        }
      }
    },
    [
      showMedia,
      showManagementMenu,
      backupDialogOpen,
      backupScreen,
      cloudBackups.length,
      cloudAvailable,
      cloudBackupLoading,
      cloudRestoreBusy,
      dialogButtonIndex,
      handleBackupAction,
      selectedMenuItem,
      folders.length,
      handleManagementAction,
      onBack,
      isLaunching,
      isRunning,
      canInput,
      handlePlayGame,
      handleOpenDirectory,
      handleDeleteGame,
      selectedButton,
      game,
      settings,
      t,
      showAchievements,
      achievementsPage,
      totalAchievementsPages,
      achievements,
      achievementsToggleFocused,
      trainerToggleFocused,
      trainerExists,
    ]
  );

  // Keyboard Listener
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.repeat) return;
      // Block keyboard input when game is running or launching
      if (isRunning || isLaunching) return;
      const map = {
        ArrowDown: "DOWN",
        ArrowUp: "UP",
        Escape: "BACK",
        Backspace: "BACK",
        Enter: "CONFIRM",
        x: "X",
        X: "X",
        m: "MENU",
        M: "MENU",
        ContextMenu: "MENU",
      };
      if (map[e.key]) {
        e.stopPropagation();
        handleInput(map[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleInput, isRunning, isLaunching]);

  // Gamepad Polling
  useControllerInput(
    action => {
      if (
        action === "BACK" &&
        window.__bReleasedAt &&
        Date.now() - window.__bReleasedAt < 800
      )
        return;
      handleInput(action);
    },
    {
      priority: 5,
      blocked:
        !canInput ||
        isRunning ||
        isLaunching ||
        showExecutableManager ||
        showDirectoryBrowser,
    }
  );

  const formatPlayTime = time => {
    if (!time || time < 60) return t("library.notPlayedYet");
    if (time < 3600) return `${Math.floor(time / 60)} ${t("library.minutes")}`;
    if (time < 7200) return `1 ${t("library.hour")}`;
    return `${Math.floor(time / 3600)} ${t("library.hours")}`;
  };

  const hasScreenshots =
    steamData?.formatted_screenshots && steamData.formatted_screenshots.length > 0;
  const bgImage = imageSrc;
  const gameDescription = (
    steamData?.summary ||
    steamData?.short_description ||
    steamData?.description ||
    steamData?.full_description ||
    game.description ||
    game.desc ||
    ""
  )?.replace(/<[^>]*>/g, "");

  useEffect(() => {
    console.log("[InstalledGameDetailsView] Render state:");
    console.log("  - imageSrc:", imageSrc ? "loaded" : "not loaded");
    console.log("  - steamData:", steamData ? "loaded" : "not loaded");
    console.log("  - hasScreenshots:", hasScreenshots);
    console.log("  - gameDescription:", gameDescription ? "available" : "not available");
    console.log("  - loadingMedia:", loadingMedia);
  }, [imageSrc, steamData, hasScreenshots, gameDescription, loadingMedia]);

  useEffect(() => {
    console.log("[DIALOG STATE] backupDialogOpen:", backupDialogOpen);
    console.log("[DIALOG STATE] showExecutableManager:", showExecutableManager);
    console.log("[DIALOG STATE] isDeleteDialogOpen:", isDeleteDialogOpen);
  }, [backupDialogOpen, showExecutableManager, isDeleteDialogOpen]);

  return {
    hasHeroImage,
    bgImage,
    showMedia,
    gameName,
    logoSrc,
    playTime,
    formatPlayTime,
    gameDescription,
    loadingMedia,
    achievements,
    setShowAchievements,
    achievementsToggleFocused,
    trainerExists,
    trainerToggleFocused,
    launchWithTrainerEnabled,
    setLaunchWithTrainerEnabled,
    canLaunchGame,
    handlePlayGame,
    isLaunching,
    isRunning,
    selectedButton,
    setShowBrowseExeWarning,
    handleOpenDirectory,
    setShowManagementMenu,
    setSelectedMenuItem,
    hasScreenshots,
    steamData,
    showManagementMenu,
    setBackupDialogOpen,
    selectedMenuItem,
    folders,
    isFavorite,
    handleManagementAction,
    setShowExecutableManager,
    executableExists,
    handleDeleteGame,
    setIsDeleteDialogOpen,
    showAchievements,
    achievementsLoading,
    paginatedAchievements,
    achievementsPage,
    achievementsPerPage,
    totalAchievementsPages,
    setAchievementsPage,
    showDirectoryBrowser,
    setShowDirectoryBrowser,
    directoryBrowserPath,
    buttons,
    handleInput,
    backupDialogOpen,
    backupScreen,
    cloudBackups,
    cloudBackupLoading,
    cloudBackupError,
    selectedCloudBackup,
    cloudRestoreBusy,
    autoCloudBackupEnabled,
    cloudAvailable,
    isSignedIn,
    setDialogButtonIndex,
    handleBackupAction,
    dialogButtonIndex,
    showVrWarning,
    setShowVrWarning,
    showOnlineFixWarning,
    setShowOnlineFixWarning,
    showSteamNotRunningWarning,
    setShowSteamNotRunningWarning,
    showBrowseExeWarning,
    setExecutableExists,
    isDeleteDialogOpen,
    isUninstalling,
    showExecutableSelect,
    setShowExecutableSelect,
    availableExecutables,
    showExecutableManager,
    gridSrc,
  };
}

export { useInstalledGameDetails };
