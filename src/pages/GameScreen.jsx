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
  Puzzle,
  ChevronDown,
  ChevronUp,
  Gem,
  Cloud,
  CloudOff,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import gameUpdateService from "@/services/gameUpdateService";
import { loadFolders, saveFolders } from "@/lib/folderManager";
import { cn } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import { useAudioPlayer, killAudioAndMiniplayer } from "@/services/audioPlayerService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analytics } from "@/services/analyticsService";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGameSoundtrack, trackDownload } from "@/services/khinsiderService";
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
import steamService from "@/services/gameInfoService";
import GameRate from "@/components/GameRate";
import EditCoverDialog from "@/components/EditCoverDialog";
import nexusModsService from "@/services/nexusModsService";
import flingTrainerService from "@/services/flingTrainerService";
import { useAuth } from "@/context/AuthContext";
import { getCloudLibrary, verifyAscendAccess } from "@/services/firebaseService";
import gameService from "@/services/gameService";

const ExecutableManagerDialog = ({ open, onClose, gameName, isCustom, t, onSave }) => {
  const [executables, setExecutables] = useState([]);
  const [exeExists, setExeExists] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && gameName) {
      setLoading(true);
      gameUpdateService.getGameExecutables(gameName, isCustom).then(async exes => {
        const exeList = exes.length > 0 ? exes : [""];
        setExecutables(exeList);
        // Check which executables exist
        const existsMap = {};
        for (const exe of exeList) {
          if (exe) {
            existsMap[exe] = await window.electron.checkFileExists(exe);
          }
        }
        setExeExists(existsMap);
        setLoading(false);
      });
    }
  }, [open, gameName, isCustom]);

  // Update existence check when executables change
  useEffect(() => {
    const checkExists = async () => {
      const newExistsMap = { ...exeExists };
      let hasChanges = false;
      for (const exe of executables) {
        if (exe && !(exe in newExistsMap)) {
          newExistsMap[exe] = await window.electron.checkFileExists(exe);
          hasChanges = true;
        }
      }
      if (hasChanges) {
        setExeExists(newExistsMap);
      }
    };
    if (!loading && executables.length > 0) {
      checkExists();
    }
  }, [executables, loading]);

  const handleAddExecutable = async () => {
    // Open dialog in the same directory as the first executable
    const startPath = executables.length > 0 && executables[0] ? executables[0] : null;
    const exePath = await window.electron.openFileDialog(startPath);
    if (exePath) {
      setExecutables(prev => [...prev, exePath]);
      // Immediately check if the new exe exists
      const exists = await window.electron.checkFileExists(exePath);
      setExeExists(prev => ({ ...prev, [exePath]: exists }));
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
      // Immediately check if the new exe exists
      const exists = await window.electron.checkFileExists(exePath);
      setExeExists(prev => ({ ...prev, [exePath]: exists }));
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
      if (onSave) {
        onSave(validExecutables);
      }
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

            {executables.some(exe => exe && exeExists[exe] === false) && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    {t("library.executableManager.exeLocationHint")}
                  </span>
                  <button
                    onClick={() =>
                      window.electron.openURL(
                        "https://ascendara.app/docs/troubleshooting/common-issues#executable-not-found-launch-error"
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {t("library.executableManager.learnMore")}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-2 max-h-64 space-y-2 overflow-y-auto">
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
                    {exe && exeExists[exe] === false && (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
                    )}
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

  const handleDontShowAgain = () => {
    localStorage.setItem("hideSteamWarning", "true");
    onClose();
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
            variant="ghost"
            size="sm"
            className="mr-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={handleDontShowAgain}
          >
            {t("gameScreen.dontShowSteamWarning")}
          </Button>

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

const AudioDownloadConfirmDialog = ({ open, onClose, onConfirm, onCancel, trackCount, t }) => (
  <AlertDialog open={open} onOpenChange={onClose}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="text-2xl font-bold text-foreground">
          {t("gameScreen.audioFetchConfirmTitle")}
        </AlertDialogTitle>
        <AlertDialogDescription className="space-y-4 text-muted-foreground">
          {t("gameScreen.audioFetchConfirmMessage", { count: trackCount })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex gap-2">
        <Button variant="outline" className="text-primary" onClick={() => {
          onCancel();
          onClose();
        }}>
          {t("common.cancel")}
        </Button>
        <Button
          className="text-secondary"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {t("gameScreen.continueFetch")}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

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
  const { gameData, libraryPage } = location.state || {};
  const { settings } = useSettings();
  const { isAuthenticated, user } = useAuth();
  const [game, setGame] = useState(gameData || null);
  const [ascendAccess, setAscendAccess] = useState({
    hasAccess: false,
    isSubscribed: false,
    isVerified: false,
    verified: false,
  });
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
  const [steamData, setSteamData] = useState(null);
  const [steamLoading, setSteamLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showEditCoverDialog, setShowEditCoverDialog] = useState(false);
  const [launchOptionsDialogOpen, setLaunchOptionsDialogOpen] = useState(false);
  const [launchCommand, setLaunchCommand] = useState("");
  const { setTrack, play } = useAudioPlayer();
  const [isOnLinux, setIsOnLinux] = useState(false);
  const [prefixSize, setPrefixSize] = useState(null);
  const [showResetPrefixDialog, setShowResetPrefixDialog] = useState(false);
  const [isResettingPrefix, setIsResettingPrefix] = useState(false);
  // Detect Linux platform and load prefix info
  useEffect(() => {
    const platform = window.electron.getPlatform();
    if (platform === "linux") {
      setIsOnLinux(true);
      const gameName = game?.game || game?.name;
      if (gameName) {
        window.electron
          .getPrefixSize(gameName)
          .then(size => {
            setPrefixSize(size);
          })
          .catch(() => {});
      }
    }
  }, [game]);

  // Nexus Mods state
  const [supportsModManaging, setSupportsModManaging] = useState(false);
  const [nexusGameData, setNexusGameData] = useState(null);
  const [popularMods, setPopularMods] = useState([]);
  const [modsLoading, setModsLoading] = useState(false);
  const [allMods, setAllMods] = useState([]);
  const [modsTotalCount, setModsTotalCount] = useState(0);
  const [modsPage, setModsPage] = useState(0);
  const [modsSearchQuery, setModsSearchQuery] = useState("");
  const [modsSortBy, setModsSortBy] = useState("endorsements");
  const [selectedMod, setSelectedMod] = useState(null);
  const [modFiles, setModFiles] = useState([]);
  const [modFilesLoading, setModFilesLoading] = useState(false);
  const [showModDetails, setShowModDetails] = useState(false);
  const [showOldVersions, setShowOldVersions] = useState(false);
  const modsPerPage = 12;

  // FLiNG Trainer state
  const [supportsFlingTrainer, setSupportsFlingTrainer] = useState(false);
  const [flingTrainerData, setFlingTrainerData] = useState(null);
  const [isDownloadingTrainer, setIsDownloadingTrainer] = useState(false);
  const [trainerExists, setTrainerExists] = useState(false);
  const [launchWithTrainerEnabled, setLaunchWithTrainerEnabled] = useState(() => {
    const saved = localStorage.getItem(`launch-with-trainer-${game?.game || game?.name}`);
    return saved === "true";
  });

  // Cloud library state
  const [isInCloudLibrary, setIsInCloudLibrary] = useState(false);
  const [cloudLibraryLoading, setCloudLibraryLoading] = useState(true);

  // Achievements state
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(true);

  // Game update state
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateCheckLoading, setUpdateCheckLoading] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isStartingUpdate, setIsStartingUpdate] = useState(false);

  // Logo state
  const [logoData, setLogoData] = useState(null);
  const [showLogo, setShowLogo] = useState(() => {
    const saved = localStorage.getItem(`game-show-logo-${game?.game || game?.name}`);
    return saved !== "false";
  });

  // Audio download confirmation state
  const [showAudioDownloadDialog, setShowAudioDownloadDialog] = useState(false);
  const [pendingAudioDownloads, setPendingAudioDownloads] = useState(null);

  // Hero image state for header background
  const [heroImageData, setHeroImageData] = useState(null);
  const [hasGridImage, setHasGridImage] = useState(true);

  // GO BACK!

  const BackLibrary = () => {
    const page = Number(libraryPage);

    if (Number.isInteger(page) && page >= 1) {
      navigate("/library", { replace: true, state: { libraryPage: page } });
      return;
    }

    navigate("/library");
  };

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

  // Load game data when component mounts
  useEffect(() => {
    const initializeGameScreen = async () => {
      try {
        // If we don't have game data from location state, navigate back to library
        if (!game) {
          navigate("/library");
          return;
        }
        // Trigger the download of missing assets
        const gameName = game.game || game.name;
        if (gameName) {
          window.electron.ipcRenderer.invoke("ensure-game-assets", gameName);
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

        // Fetch Steam API data
        fetchSteamData(game.game || game.name);
      } catch (error) {
        console.error("Error loading game:", error);
        setLoading(false);
      }
    };

    initializeGameScreen();

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

  // Check for game updates
  useEffect(() => {
    const checkForUpdates = async () => {
      console.log(
        "[GameScreen] checkForUpdates called, game:",
        game?.game,
        "gameID:",
        game?.gameID,
        "version:",
        game?.version,
        "isCustom:",
        game?.isCustom
      );

      if (!game || game.isCustom || !game.gameID) {
        console.log(
          "[GameScreen] Skipping update check - no game, custom game, or no gameID"
        );
        setUpdateInfo(null);
        return;
      }

      setUpdateCheckLoading(true);
      try {
        console.log(
          `[GameScreen] Checking update for ${game.game} (${game.gameID}), version: ${game.version}`
        );
        const result = await gameService.checkGameUpdate(game.gameID, game.version);
        console.log("[GameScreen] Update check result:", result);
        setUpdateInfo(result);
        if (result?.updateAvailable) {
          console.log(
            "[GameScreen] UPDATE AVAILABLE! Latest:",
            result.latestVersion,
            "Local:",
            result.localVersion
          );
        }
      } catch (error) {
        console.error("[GameScreen] Error checking for game update:", error);
        setUpdateInfo(null);
      }
      setUpdateCheckLoading(false);
    };

    checkForUpdates();
  }, [game]);

  // Re-fetch Steam data when game changes
  // Steam API is always available (hardcoded), so we always fetch
  useEffect(() => {
    if (game) {
      fetchSteamData(game.game || game.name);
    }
  }, [game]);

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

        if (
          gameData &&
          gameData.launchCount === 1 &&
          settings.usingLocalIndex &&
          game.gameID
        ) {
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
        window.electron.ipcRenderer.invoke("get-game-image", gameId, "grid").then(imageBase64 => {
          if (imageBase64) {
            const timestamp = new Date().getTime();
            setImageData(`data:image/jpeg;base64,${imageBase64}?t=${timestamp}`);
          }
        });
      }
    };

    // Handle game assets updates (grid, hero, logo) from SteamGrid
    const handleGameAssetsUpdated = async (_, data) => {
      if (data && data.game === (game.game || game.name) && data.success) {
        console.log(
          `[GameScreen] Received game-assets-updated IPC event for ${data.game}`
        );
        // Clear localStorage cache and reload the grid image
        const gameId = game.game || game.name;
        const localStorageKey = `game-grid-${gameId}`;
        localStorage.removeItem(localStorageKey);

        // Fetch the new grid image
        try {
          const gridBase64 = await window.electron.ipcRenderer.invoke(
            "get-game-image",
            gameId,
            "grid"
          );
          if (gridBase64) {
            const dataUrl = `data:image/jpeg;base64,${gridBase64}`;
            setImageData(dataUrl);
            localStorage.setItem(localStorageKey, dataUrl);
          }
        } catch (e) {
          console.error("[GameScreen] Error loading new grid image:", e);
        }

        // Also reload the logo image
        try {
          const logoBase64 = await window.electron.ipcRenderer.invoke(
            "get-game-image",
            gameId,
            "logo"
          );
          if (logoBase64) {
            setLogoData(`data:image/png;base64,${logoBase64}`);
          }
        } catch (e) {
          console.error("[GameScreen] Error loading logo:", e);
        }
      }
    };

    window.electron.ipcRenderer.on("game-launch-error", handleGameLaunchError);
    window.electron.ipcRenderer.on("game-closed", handleGameClosed);
    window.electron.ipcRenderer.on("cover-image-updated", handleCoverImageUpdated);
    window.electron.ipcRenderer.on("game-assets-updated", handleGameAssetsUpdated);

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
      window.electron.ipcRenderer.removeListener(
        "game-assets-updated",
        handleGameAssetsUpdated
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

  // Load logo image
  useEffect(() => {
    if (!game) return;
    const gameId = game.game || game.name;

    const loadLogo = async () => {
      try {
        const logoBase64 = await window.electron.ipcRenderer.invoke(
          "get-game-image",
          gameId,
          "logo"
        );
        if (logoBase64) {
          setLogoData(`data:image/png;base64,${logoBase64}`);
        } else {
          setLogoData(null);
        }
      } catch (e) {
        setLogoData(null);
      }
    };

    loadLogo();
  }, [game]);

  // Save logo preference
  useEffect(() => {
    if (game) {
      const gameId = game.game || game.name;
      localStorage.setItem(`game-show-logo-${gameId}`, showLogo.toString());
    }
  }, [showLogo, game]);

  // Toggle logo/text display
  const toggleLogoDisplay = () => {
    setShowLogo(prev => !prev);
  };

  // Fetch Khinsider soundtrack when user clicks on soundtrack tab
  const fetchSoundtrack = () => {
    if (!game || soundtrack.length > 0) return;
    const gameName = game.game || game.name;
    const storageKey = `khinsider-soundtrack-${gameName}`;
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      setSoundtrack(JSON.parse(cached));
      setLoadingSoundtrack(false);
    } else {
      setLoadingSoundtrack(true);
      
      // Create confirmation callback for when >10 tracks need to be fetched
      const confirmFetch = (trackCount) => {
        return new Promise((resolve) => {
          setPendingAudioDownloads({ count: trackCount, resolve });
          setShowAudioDownloadDialog(true);
        });
      };
      
      getGameSoundtrack(gameName, confirmFetch)
        .then(tracks => {
          setSoundtrack(tracks);
          if (tracks.length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(tracks));
          }
        })
        .finally(() => setLoadingSoundtrack(false));
    }
  };

  // Load game image with localStorage cache (similar to Library.jsx)
  useEffect(() => {
    let isMounted = true;
    const gameId = game.game || game.name;

    // Change the cache key to not load the old header
    const localStorageKey = `game-grid-${gameId}`;

    const loadGameImage = async () => {
      // 1. Try fetching Grid image from backend first (Priority)
      try {
        const gridBase64 = await window.electron.ipcRenderer.invoke(
          "get-game-image",
          gameId,
          "grid"
        );

        if (gridBase64 && isMounted) {
          const dataUrl = `data:image/jpeg;base64,${gridBase64}`;
          setImageData(dataUrl);
          setHasGridImage(true);
          try {
            localStorage.setItem(localStorageKey, dataUrl);
          } catch (e) {}
          return;
        }
      } catch (e) {}

      // Grid image failed, mark as not available
      setHasGridImage(false);

      // 2. Try localStorage cache as fallback
      const cachedImage = localStorage.getItem(localStorageKey);
      if (cachedImage) {
        if (isMounted) {
          setImageData(cachedImage);
          setHasGridImage(true);
        }
        return;
      }

      // 3. Fallback (Header)
      if (steamData?.cover?.url) {
        const coverUrl = steamService.formatImageUrl(steamData.cover.url, "cover_big");
        if (coverUrl && isMounted) {
          setImageData(coverUrl);
          setHasGridImage(true);
          // Cache the Steam cover URL
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
          setHasGridImage(true);
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
  }, [game.game, game.name, steamData?.cover?.url]); // Add steamData.cover.url as dependency

  // Load hero image when grid image fails
  useEffect(() => {
    if (!hasGridImage && game) {
      const gameId = game.game || game.name;
      const loadHeroImage = async () => {
        try {
          const heroBase64 = await window.electron.ipcRenderer.invoke(
            "get-game-image",
            gameId,
            "hero"
          );
          if (heroBase64) {
            setHeroImageData(`data:image/jpeg;base64,${heroBase64}`);
          }
        } catch (e) {
          console.error("Error loading hero image:", e);
        }
      };
      loadHeroImage();
    }
  }, [hasGridImage, game]);

  // Log hasRated state changes
  useEffect(() => {
    console.log("gamedata:", game);
    if (game && !game.hasRated && game.launchCount > 1 && hasRated) {
      setHasRated(false);
    }
  }, [game]);

  // Check Nexus Mods support for the game
  useEffect(() => {
    const checkNexusModSupport = async () => {
      if (game?.game || game?.name) {
        const gameName = game.game || game.name;
        try {
          const result = await nexusModsService.checkModSupport(gameName);
          setSupportsModManaging(result.supported);
          setNexusGameData(result.gameData);

          // If supported and user has Ascend access, fetch mods with pagination
          if (
            result.supported &&
            result.gameData?.domainName &&
            isAuthenticated &&
            ascendAccess.hasAccess
          ) {
            setModsLoading(true);
            const modsResult = await nexusModsService.getMods(
              result.gameData.domainName,
              {
                count: modsPerPage,
                offset: 0,
                sortBy: "endorsements",
              }
            );
            setAllMods(modsResult.mods);
            setModsTotalCount(modsResult.totalCount);
            setModsLoading(false);
          }
        } catch (error) {
          console.error("Error checking Nexus Mods support:", error);
          setSupportsModManaging(false);
        }
      }
    };

    checkNexusModSupport();
  }, [game?.game, game?.name, isAuthenticated, ascendAccess.hasAccess]);

  // Check FLiNG Trainer support for the game
  useEffect(() => {
    const checkFlingTrainerSupport = async () => {
      if (game?.game || game?.name) {
        const gameName = game.game || game.name;
        try {
          const result = await flingTrainerService.checkTrainerSupport(gameName);
          setSupportsFlingTrainer(result.supported);
          setFlingTrainerData(result.trainerData);

          // Check if trainer file exists in game directory
          const exists = await window.electron.checkTrainerExists(
            gameName,
            game?.isCustom || false
          );
          setTrainerExists(exists);
        } catch (error) {
          console.error("Error checking FLiNG Trainer support:", error);
          setSupportsFlingTrainer(false);
        }
      }
    };

    checkFlingTrainerSupport();
  }, [game?.game, game?.name, game?.isCustom]);

  // Verify Ascend access
  useEffect(() => {
    const checkAscendAccess = async () => {
      if (!isAuthenticated || !user) {
        setAscendAccess({
          hasAccess: false,
          isSubscribed: false,
          isVerified: false,
          verified: false,
        });
        return;
      }

      try {
        const result = await verifyAscendAccess();
        setAscendAccess({
          hasAccess: result.hasAccess,
          isSubscribed: result.isSubscribed,
          isVerified: result.isVerified,
          verified: result.verified || result.isVerified,
        });
      } catch (error) {
        console.error("Error verifying Ascend access:", error);
        setAscendAccess({
          hasAccess: false,
          isSubscribed: false,
          isVerified: false,
          verified: false,
        });
      }
    };

    checkAscendAccess();
  }, [isAuthenticated, user]);

  // Check if game is in cloud library
  useEffect(() => {
    const checkCloudLibrary = async () => {
      if (!isAuthenticated) {
        setCloudLibraryLoading(false);
        setIsInCloudLibrary(false);
        return;
      }

      const gameName = game?.game || game?.name;
      if (!gameName) {
        setCloudLibraryLoading(false);
        return;
      }

      try {
        const result = await getCloudLibrary();
        if (result.data?.games) {
          const isInCloud = result.data.games.some(
            g => g.name?.toLowerCase() === gameName.toLowerCase()
          );
          setIsInCloudLibrary(isInCloud);
        }
      } catch (error) {
        console.error("Error checking cloud library:", error);
      }
      setCloudLibraryLoading(false);
    };

    checkCloudLibrary();
  }, [game?.game, game?.name, isAuthenticated]);

  // Fetch mods with pagination and search
  const fetchMods = async (page = 0, search = "", sort = "endorsements") => {
    if (!nexusGameData?.domainName) return;

    setModsLoading(true);
    try {
      const result = await nexusModsService.getMods(nexusGameData.domainName, {
        count: modsPerPage,
        offset: page * modsPerPage,
        sortBy: sort,
        searchQuery: search || null,
      });
      setAllMods(result.mods);
      setModsTotalCount(result.totalCount);
    } catch (error) {
      console.error("Error fetching mods:", error);
    }
    setModsLoading(false);
  };

  // Fetch mod files when a mod is selected
  const fetchModFiles = async mod => {
    if (!nexusGameData?.id || !mod?.modId) return;

    setModFilesLoading(true);
    setSelectedMod(mod);
    setShowModDetails(true);
    try {
      const files = await nexusModsService.getModFiles(nexusGameData.id, mod.modId);
      setModFiles(files);
    } catch (error) {
      console.error("Error fetching mod files:", error);
      setModFiles([]);
    }
    setModFilesLoading(false);
  };

  // Handle mod search
  const handleModSearch = e => {
    e.preventDefault();
    setModsPage(0);
    fetchMods(0, modsSearchQuery, modsSortBy);
  };

  // Handle sort change
  const handleSortChange = newSort => {
    setModsSortBy(newSort);
    setModsPage(0);
    fetchMods(0, modsSearchQuery, newSort);
  };

  // Handle page change
  const handleModsPageChange = newPage => {
    setModsPage(newPage);
    fetchMods(newPage, modsSearchQuery, modsSortBy);
  };

  // Download mod file - opens in browser since Nexus requires auth
  const handleDownloadMod = (mod, fileId = null) => {
    const url = nexusModsService.getModDownloadUrl(
      nexusGameData?.domainName,
      mod.modId,
      fileId
    );
    window.electron.openURL(url);
  };

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
        const hideSteamWarning = localStorage.getItem("hideSteamWarning");
        if (!hideSteamWarning) {
          if (!(await window.electron.isSteamRunning())) {
            toast.error(t("library.steamNotRunning"));
            setIsLaunching(false);
            setShowSteamNotRunningWarning(true);
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
        specificExecutable,
        trainerExists && launchWithTrainerEnabled
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

  const handleResetPrefix = async () => {
    const gameName = game?.game || game?.name;
    if (!gameName) return;
    setIsResettingPrefix(true);
    try {
      const result = await window.electron.deleteGamePrefix(gameName);
      if (result.success) {
        setPrefixSize(0);
      }
    } catch (e) {
      console.error("Failed to reset prefix:", e);
    }
    setIsResettingPrefix(false);
    setShowResetPrefixDialog(false);
  };

  // Handle close error dialog
  const handleCloseErrorDialog = () => {
    setShowErrorDialog(false);
    setErrorGame("");
    setErrorMessage("");
  };

  // Fetch Steam API data
  const fetchSteamData = async gameName => {
    try {
      setSteamLoading(true);

      // Steam API is always available (hardcoded)
      console.log("Fetching game data from Steam API");

      const data = await steamService.getGameDetails(gameName);

      if (data) {
        if (data.screenshots && data.screenshots.length > 0) {
          data.formatted_screenshots = data.screenshots.map(screenshot => ({
            ...screenshot,
            formatted_url: steamService.formatImageUrl(screenshot.url, "screenshot_huge"),
          }));
        }
        setSteamData(data);
      } else {
        console.log("No game data found for:", gameName);
      }

      setSteamLoading(false);
    } catch (error) {
      console.error("Error fetching game data:", error);
      setSteamLoading(false);
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

  // Prepare screenshots data from Steam API if available
  const screenshots = steamData?.formatted_screenshots || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero section with game banner/header */}
      <div className="relative w-full overflow-hidden">
        {/* Hero background image with zoom effect when grid image fails */}
        {!hasGridImage && heroImageData && (
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${heroImageData})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              transform: "scale(1.15)",
              filter: "blur(8px) brightness(0.4)",
            }}
          />
        )}
        <div className="container relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-between p-4 md:p-8">
          {/* Back button */}
          <Button
            variant="ghost"
            className="flex w-fit items-center gap-2 text-primary hover:bg-primary/10"
            onClick={BackLibrary}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("common.back")}
          </Button>

          {/* Game title and basic info */}
          <div className="mt-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {showLogo && logoData ? (
                  <button
                    onClick={toggleLogoDisplay}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                    title={t("gameScreen.clickToToggleLogo")}
                  >
                    <img
                      src={logoData}
                      alt={game.game}
                      className="max-h-20 max-w-md object-contain drop-shadow-md"
                    />
                  </button>
                ) : (
                  <button
                    onClick={logoData ? toggleLogoDisplay : undefined}
                    className={cn(
                      "text-4xl font-bold text-primary drop-shadow-md",
                      logoData && "cursor-pointer transition-opacity hover:opacity-80"
                    )}
                    title={logoData ? t("gameScreen.clickToToggleLogo") : undefined}
                    disabled={!logoData}
                  >
                    <h1>{game.game}</h1>
                  </button>
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

            {/* Version + Tags Row */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {game.version && game.version !== "-1" && (
                <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                  {game.version}
                  {updateInfo?.updateAvailable && (
                    <button
                      onClick={() => setShowUpdateDialog(true)}
                      className="ml-1 flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/30"
                    >
                      <Download className="h-3 w-3" />
                      {t("gameScreen.updateBadge")}
                    </button>
                  )}
                </span>
              )}
              {!game.version && updateInfo?.updateAvailable && (
                <button
                  onClick={() => setShowUpdateDialog(true)}
                  className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/30"
                >
                  <Download className="h-3 w-3" />
                  {t("gameScreen.updateBadge")}
                </button>
              )}
              {game.online && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-help items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-medium text-green-500">
                        {t("download.online")}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-secondary">
                        {t("download.onlineTooltip")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {game.dlc && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-help items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-500">
                        {t("download.allDlc")}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-secondary">
                        {t("download.allDlcTooltip")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {game.isVr && (
                <span className="flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-1 text-xs font-medium text-purple-400">
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2 10C2 8.89543 2.89543 8 4 8H20C21.1046 8 22 8.89543 22 10V17C22 18.1046 21.1046 19 20 19H16.1324C15.4299 19 14.7788 18.6314 14.4174 18.029L12.8575 15.4292C12.4691 14.7818 11.5309 14.7818 11.1425 15.4292L9.58261 18.029C9.22116 18.6314 8.57014 19 7.86762 19H4C2.89543 19 2 18.1046 2 17V10Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {t("download.gameNeedsVR")}
                </span>
              )}
            </div>

            {/* Game Details Row */}
            <div className="mt-4 flex flex-wrap items-center gap-4">
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
      </div>

      <div className="container mx-auto">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left column - Game actions */}
          <div className="lg:col-span-1">
            <Card className="overflow-hidden">
              <CardContent className="space-y-6 p-6">
                {/* Cloud Library Status */}
                <div className="flex items-center justify-between rounded-lg border bg-card/50 p-3">
                  <div className="flex items-center gap-3">
                    {isAuthenticated ? (
                      cloudLibraryLoading ? (
                        <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : isInCloudLibrary ? (
                        <Cloud className="h-5 w-5 text-primary" />
                      ) : (
                        <CloudOff className="h-5 w-5 text-muted-foreground" />
                      )
                    ) : (
                      <CloudOff className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {isAuthenticated
                          ? isInCloudLibrary
                            ? t("gameScreen.inCloudLibrary")
                            : t("gameScreen.notInCloudLibrary")
                          : t("gameScreen.cloudLibraryPromo")}
                      </p>
                      {!isAuthenticated && (
                        <p className="text-xs text-muted-foreground">
                          {t("gameScreen.cloudLibraryPromoDesc")}
                        </p>
                      )}
                    </div>
                  </div>
                  {!isAuthenticated && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 whitespace-nowrap"
                      onClick={() => navigate("/ascend")}
                    >
                      {t("gameScreen.getAscend")}
                    </Button>
                  )}
                </div>
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted/30">
                  {!hasGridImage && heroImageData ? (
                    <div
                      className="h-full w-full"
                      style={{
                        backgroundImage: `url(${heroImageData})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        transform: "scale(1.15)",
                      }}
                    />
                  ) : (
                    <img
                      src={imageData}
                      alt={game.game}
                      className="h-full w-full object-contain"
                    />
                  )}
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
                    <>
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
                      {trainerExists && (
                        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                          <div className="flex items-center gap-3">
                            <Bolt className="h-5 w-5 text-primary" />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {t("gameScreen.launchWithTrainer")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t("gameScreen.launchWithTrainerDescription")}
                              </span>
                            </div>
                          </div>
                          <Switch
                            checked={launchWithTrainerEnabled}
                            onCheckedChange={enabled => {
                              setLaunchWithTrainerEnabled(enabled);
                              localStorage.setItem(
                                `launch-with-trainer-${game?.game || game?.name}`,
                                enabled.toString()
                              );
                              toast.success(
                                enabled
                                  ? t("gameScreen.trainerEnabledToast")
                                  : t("gameScreen.trainerDisabledToast")
                              );
                            }}
                          />
                        </div>
                      )}
                    </>
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

                  {/* Reset Prefix Button - Linux only */}
                  {isOnLinux && (
                    <Button
                      variant="outline"
                      onClick={() => setShowResetPrefixDialog(true)}
                      className="hover:text-destructive gap-2 text-muted-foreground"
                    >
                      <FolderSync className="h-4 w-4" />
                      Reset Prefix
                      {prefixSize > 0 && (
                        <span className="text-xs opacity-60">
                          (
                          {prefixSize < 1024 * 1024
                            ? `${(prefixSize / 1024).toFixed(0)} KB`
                            : prefixSize < 1024 * 1024 * 1024
                              ? `${(prefixSize / (1024 * 1024)).toFixed(1)} MB`
                              : `${(prefixSize / (1024 * 1024 * 1024)).toFixed(2)} GB`}
                          )
                        </span>
                      )}
                    </Button>
                  )}
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
          <div className="space-y-6 lg:col-span-2">
            {/* Quick Navigation - Compact Pills */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab("overview")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === "overview"
                    ? "bg-primary text-secondary"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                <Info className="h-3.5 w-3.5" />
                {t("gameScreen.overview")}
              </button>
              <button
                onClick={() => {
                  setActiveTab("soundtrack");
                  fetchSoundtrack();
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === "soundtrack"
                    ? "bg-primary text-secondary"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                <Music2 className="h-3.5 w-3.5" />
                {t("gameScreen.soundtrack")}
              </button>
              <button
                onClick={() => setActiveTab("achievements")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === "achievements"
                    ? "bg-primary text-secondary"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                <Trophy className="h-3.5 w-3.5" />
                {t("gameScreen.achievements")}
              </button>
              {screenshots.length > 0 && (
                <button
                  onClick={() => setActiveTab("media")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    activeTab === "media"
                      ? "bg-primary text-secondary"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <ImageUp className="h-3.5 w-3.5" />
                  {t("gameScreen.media")}
                </button>
              )}
              {supportsModManaging && (
                <button
                  onClick={() => setActiveTab("mods")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    activeTab === "mods"
                      ? "bg-primary text-secondary"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <Puzzle className="h-3.5 w-3.5" />
                  {t("gameScreen.mods")}
                </button>
              )}
              {supportsFlingTrainer && (
                <button
                  onClick={() => setActiveTab("trainers")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    activeTab === "trainers"
                      ? "bg-primary text-secondary"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <Bolt className="h-3.5 w-3.5" />
                  {t("gameScreen.trainers")}
                </button>
              )}
            </div>

            <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="hidden">
                <TabsTrigger value="overview">{t("gameScreen.overview")}</TabsTrigger>
              </TabsList>

              {!hasRated && settings.usingLocalIndex && game.gameID && (
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
                                trackDownload(
                                  window.electron.downloadSoundtrack(track.url, game.game)
                                )
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
                                      trackDownload(
                                        window.electron.downloadSoundtrack(track.url, game.game)
                                      ).then(res => {
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
                {/* Game Info Stats Cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {game.version && game.version !== "-1" && (
                    <Card
                      className={updateInfo?.updateAvailable ? "border-blue-500/50" : ""}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                          <div className="relative mb-2">
                            <Tag className="h-5 w-5 text-primary" />
                            {updateInfo?.updateAvailable && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="absolute -right-2 -top-2 h-4 w-4 text-blue-500" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right">
                                    <p className="text-xs">
                                      Update available: {updateInfo.latestVersion}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {t("library.version")}
                          </span>
                          <p className="mt-1 text-sm font-semibold">{game.version}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {game.size && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                          <PackageOpen className="mb-2 h-5 w-5 text-primary" />
                          <span className="text-xs text-muted-foreground">
                            {t("library.size")}
                          </span>
                          <p className="mt-1 text-sm font-semibold">{game.size}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-col items-center text-center">
                        <Clock className="mb-2 h-5 w-5 text-primary" />
                        <span className="text-xs text-muted-foreground">
                          {t("library.playTime")}
                        </span>
                        <p className="mt-1 text-sm font-semibold">
                          {formatPlaytime(game.playTime)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {game.executable && (
                    <Card className={!executableExists ? "border-red-500/50" : ""}>
                      <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                          <Monitor className="mb-2 h-5 w-5 text-primary" />
                          <span className="text-xs text-muted-foreground">
                            {t("library.executable")}
                          </span>
                          <div className="mt-1 flex items-center gap-1">
                            <p className="max-w-[100px] truncate text-sm font-semibold">
                              {game.executable.split("\\").pop()}
                            </p>
                            {!executableExists && (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Game Summary */}
                {(steamData?.about_the_game || steamData?.summary) && (
                  <Card className="border-l-4 border-l-primary">
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="rounded-full mb-2 bg-primary/10 p-2">
                            <Info className="h-5 w-5 text-primary" />
                          </div>
                          <h2 className="text-xl font-bold">{t("gameScreen.aboutGame")}</h2>
                        </div>
                        {steamData.about_the_game ? (
                          <div 
                            className="steam-description text-base leading-relaxed text-foreground/80"
                            dangerouslySetInnerHTML={{ __html: steamData.about_the_game }}
                          />
                        ) : (
                          <p className="text-base leading-relaxed text-foreground/80">
                            {steamData.summary}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Featured screenshots */}
                {screenshots.length > 0 && (
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ImageUp className="h-5 w-5 text-primary" />
                            <h2 className="text-xl font-bold">
                              {t("gameScreen.screenshots")}
                            </h2>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-muted-foreground hover:text-primary"
                            onClick={() => setActiveTab("media")}
                          >
                            {t("gameScreen.viewAll")}
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                          {screenshots.slice(0, 6).map((screenshot, index) => (
                            <div
                              key={index}
                              className="group relative aspect-video cursor-pointer overflow-hidden rounded-lg bg-muted transition-all hover:ring-2 hover:ring-primary"
                              onClick={() =>
                                window.electron.openURL(screenshot.formatted_url)
                              }
                            >
                              <img
                                src={screenshot.formatted_url}
                                alt={`Screenshot ${index + 1}`}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Media tab */}
              <TabsContent value="media" className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <h2 className="text-2xl font-bold">
                        {t("gameScreen.screenshots")}
                      </h2>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {screenshots.map((screenshot, index) => (
                          <div
                            key={index}
                            className="aspect-video overflow-hidden rounded-lg bg-muted transition-transform hover:scale-105"
                          >
                            <img
                              src={screenshot.formatted_url}
                              alt={`Screenshot ${index + 1}`}
                              className="h-full w-full cursor-pointer object-cover"
                              onClick={() =>
                                window.electron.openURL(screenshot.formatted_url)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
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

              {/* Mods tab - Show for all users with supported games, but require Ascend for full access */}
              {supportsModManaging && (
                <TabsContent value="mods" className="space-y-6">
                  <Card>
                    <CardContent className="p-6">
                      {!isAuthenticated || !ascendAccess.hasAccess ? (
                        /* Ascend promotion for non-authenticated users or expired trial */
                        <div className="flex flex-col items-center justify-center space-y-6 py-12 text-center">
                          <div className="rounded-full bg-primary/10 p-6">
                            <Puzzle className="h-16 w-16 text-primary" />
                          </div>
                          <div className="space-y-3">
                            <h2 className="text-2xl font-bold">
                              {t("gameScreen.modsTitle")}
                            </h2>
                            {nexusGameData && (
                              <p className="text-lg text-muted-foreground">
                                {t("gameScreen.modsAvailable", {
                                  count: nexusGameData.modCount || 0,
                                })}
                              </p>
                            )}
                            <p className="max-w-md text-sm text-muted-foreground">
                              {!isAuthenticated
                                ? t("gameScreen.modsAscendPromo")
                                : t("gameScreen.modsAscendRequired") ||
                                  "Ascend subscription required to access mods"}
                            </p>
                          </div>
                          <Button
                            className="gap-2 text-secondary"
                            onClick={() => navigate("/ascend")}
                          >
                            <Gem className="h-4 w-4" />
                            {!isAuthenticated
                              ? t("gameScreen.getAscend")
                              : t("gameScreen.subscribeToAscend") ||
                                "Subscribe to Ascend"}
                          </Button>
                        </div>
                      ) : (
                        <>
                          {/* Header with search and sort */}
                          <div className="mb-6 space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-2xl font-bold">
                                  {t("gameScreen.modsTitle")}
                                </h2>
                                {nexusGameData && (
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {t("gameScreen.modsAvailable", {
                                      count: nexusGameData.modCount || 0,
                                    })}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Search and Sort Controls */}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                              <form
                                onSubmit={handleModSearch}
                                className="flex flex-1 gap-2"
                              >
                                <Input
                                  placeholder={t("gameScreen.searchMods")}
                                  value={modsSearchQuery}
                                  onChange={e => setModsSearchQuery(e.target.value)}
                                  className="flex-1"
                                />
                                <Button type="submit" variant="outline" size="icon">
                                  <FileSearch className="h-4 w-4" />
                                </Button>
                              </form>
                              <Select value={modsSortBy} onValueChange={handleSortChange}>
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue placeholder={t("gameScreen.sortBy")} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="endorsements">
                                    {t("gameScreen.sortPopular")}
                                  </SelectItem>
                                  <SelectItem value="downloads">
                                    {t("gameScreen.sortDownloads")}
                                  </SelectItem>
                                  <SelectItem value="updatedAt">
                                    {t("gameScreen.sortRecent")}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Mods Grid */}
                          {modsLoading ? (
                            <div className="flex flex-col items-center justify-center space-y-6 py-12">
                              <div className="relative flex flex-col items-center">
                                <Puzzle className="h-8 w-8 animate-pulse text-primary/60 drop-shadow-lg" />
                              </div>
                              <p className="animate-pulse text-base font-semibold text-primary/70">
                                {t("gameScreen.loadingMods")}
                              </p>
                            </div>
                          ) : allMods.length > 0 ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {allMods.map((mod, index) => (
                                  <div
                                    key={mod.modId || index}
                                    className="group relative cursor-pointer overflow-hidden rounded-lg border bg-card transition-all hover:shadow-lg"
                                    onClick={() => fetchModFiles(mod)}
                                  >
                                    {mod.pictureUrl && (
                                      <div className="aspect-video overflow-hidden bg-muted">
                                        <img
                                          src={mod.pictureUrl}
                                          alt={mod.name}
                                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                        />
                                      </div>
                                    )}
                                    <div className="p-4">
                                      <h4 className="line-clamp-1 font-semibold text-foreground">
                                        {mod.name}
                                      </h4>
                                      {mod.uploader?.name && (
                                        <p className="text-xs text-muted-foreground">
                                          {t("gameScreen.modBy")} {mod.uploader.name}
                                        </p>
                                      )}
                                      {mod.summary && (
                                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                          {mod.summary}
                                        </p>
                                      )}
                                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                                        {mod.version && (
                                          <span className="flex items-center gap-1">
                                            <Tag className="h-3 w-3" />v{mod.version}
                                          </span>
                                        )}
                                        {mod.modCategory?.name && (
                                          <span className="rounded bg-muted px-2 py-0.5">
                                            {mod.modCategory.name}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Pagination */}
                              {modsTotalCount > modsPerPage && (
                                <div className="flex items-center justify-between border-t px-6 py-4">
                                  <div className="text-sm text-muted-foreground">
                                    {t("gameScreen.showingMods", {
                                      from: modsPage * modsPerPage + 1,
                                      to: Math.min(
                                        (modsPage + 1) * modsPerPage,
                                        modsTotalCount
                                      ),
                                      total: modsTotalCount,
                                    })}
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-sm text-muted-foreground">
                                      {t("common.page")} {modsPage + 1} /{" "}
                                      {Math.ceil(modsTotalCount / modsPerPage)}
                                    </span>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleModsPageChange(modsPage - 1)}
                                        disabled={modsPage === 0}
                                      >
                                        {t("common.prev")}
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleModsPageChange(modsPage + 1)}
                                        disabled={
                                          (modsPage + 1) * modsPerPage >= modsTotalCount
                                        }
                                      >
                                        {t("common.next")}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : popularMods.length > 0 ? (
                            <div className="space-y-4">
                              <h3 className="text-lg font-semibold text-muted-foreground">
                                {t("gameScreen.popularMods")}
                              </h3>
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {popularMods.map((mod, index) => (
                                  <div
                                    key={mod.modId || index}
                                    className="group relative cursor-pointer overflow-hidden rounded-lg border bg-card transition-all hover:shadow-lg"
                                    onClick={() => fetchModFiles(mod)}
                                  >
                                    {mod.pictureUrl && (
                                      <div className="aspect-video overflow-hidden bg-muted">
                                        <img
                                          src={mod.pictureUrl}
                                          alt={mod.name}
                                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                        />
                                      </div>
                                    )}
                                    <div className="p-4">
                                      <h4 className="line-clamp-1 font-semibold text-foreground">
                                        {mod.name}
                                      </h4>
                                      {mod.summary && (
                                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                          {mod.summary}
                                        </p>
                                      )}
                                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                                        {mod.version && (
                                          <span className="flex items-center gap-1">
                                            <Tag className="h-3 w-3" />v{mod.version}
                                          </span>
                                        )}
                                        {mod.modCategory?.name && (
                                          <span className="rounded bg-muted px-2 py-0.5">
                                            {mod.modCategory.name}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                              <div className="rounded-full bg-muted p-4">
                                <Puzzle className="h-12 w-12 text-muted-foreground" />
                              </div>
                              <div className="space-y-2">
                                <p className="font-medium">
                                  {t("gameScreen.modsSupported")}
                                </p>
                                <p className="max-w-sm text-sm text-muted-foreground">
                                  {t("gameScreen.modsDescription")}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                className="mt-4 gap-2"
                                onClick={() => fetchMods(0, "", "endorsements")}
                              >
                                <Puzzle className="h-4 w-4" />
                                {t("gameScreen.browseMods")}
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              {/* Trainers tab - FLiNG Trainer */}
              {supportsFlingTrainer && (
                <TabsContent value="trainers" className="space-y-6">
                  <Card>
                    <CardContent className="p-6">
                      {!isAuthenticated || !ascendAccess.hasAccess ? (
                        /* Ascend promotion for non-authenticated users or expired trial */
                        <div className="flex flex-col items-center justify-center space-y-6 py-12 text-center">
                          <div className="rounded-full bg-primary/10 p-6">
                            <Bolt className="h-16 w-16 text-primary" />
                          </div>
                          <div className="space-y-3">
                            <h2 className="text-2xl font-bold">
                              {t("gameScreen.trainersTitle")}
                            </h2>
                            <p className="text-lg text-muted-foreground">
                              {t("gameScreen.trainerAvailable")}
                            </p>
                            <p className="max-w-md text-sm text-muted-foreground">
                              {!isAuthenticated
                                ? t("gameScreen.trainersAscendPromo")
                                : t("gameScreen.trainersAscendRequired") ||
                                  "Ascend subscription required to access trainers"}
                            </p>
                          </div>
                          <Button
                            className="gap-2 text-secondary"
                            onClick={() => navigate("/ascend")}
                          >
                            <Gem className="h-4 w-4" />
                            {!isAuthenticated
                              ? t("gameScreen.getAscend")
                              : t("gameScreen.subscribeToAscend") ||
                                "Subscribe to Ascend"}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center space-y-6 py-8 text-center">
                          {flingTrainerData?.imageUrl && (
                            <div className="overflow-hidden rounded-lg">
                              <img
                                src={flingTrainerData.imageUrl}
                                alt={flingTrainerData.title}
                                className="h-32 w-auto object-contain"
                              />
                            </div>
                          )}
                          {!flingTrainerData?.imageUrl && (
                            <div className="rounded-full bg-primary/10 p-6">
                              <Bolt className="h-16 w-16 text-primary" />
                            </div>
                          )}
                          <div className="space-y-2">
                            <h2 className="text-2xl font-bold">
                              {flingTrainerData?.title || t("gameScreen.trainersTitle")}
                            </h2>
                            {flingTrainerData?.options && (
                              <p className="text-lg text-primary">
                                {flingTrainerData.options} Options
                              </p>
                            )}
                            {flingTrainerData?.version && (
                              <p className="text-sm text-muted-foreground">
                                {flingTrainerData.version}
                              </p>
                            )}
                            {trainerExists && (
                              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-500/10 px-4 py-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                                <FileCheck2 className="h-4 w-4" />
                                {t("gameScreen.trainerInstalled")}
                              </div>
                            )}
                            <p className="max-w-md text-sm text-muted-foreground">
                              {t("gameScreen.trainersDescription")}
                            </p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row">
                            {flingTrainerData?.downloadUrl ? (
                              <>
                                <Button
                                  className="gap-2 text-secondary"
                                  onClick={async () => {
                                    setIsDownloadingTrainer(true);
                                    try {
                                      const result =
                                        await flingTrainerService.downloadTrainerToGame(
                                          flingTrainerData,
                                          game?.game || game?.name,
                                          game?.isCustom || false
                                        );
                                      if (result.success) {
                                        toast.success(
                                          t("gameScreen.trainerInstalledSuccess"),
                                          {
                                            description: t(
                                              "gameScreen.trainerInstalledDescription"
                                            ),
                                          }
                                        );
                                        // Check if trainer now exists
                                        const exists =
                                          await window.electron.checkTrainerExists(
                                            game?.game || game?.name,
                                            game?.isCustom || false
                                          );
                                        setTrainerExists(exists);
                                      } else {
                                        toast.error(
                                          t("gameScreen.trainerInstallFailed"),
                                          {
                                            description:
                                              result.error ||
                                              t(
                                                "gameScreen.trainerInstallFailedDescription"
                                              ),
                                          }
                                        );
                                      }
                                    } catch (error) {
                                      toast.error(t("gameScreen.trainerInstallFailed"), {
                                        description: t(
                                          "gameScreen.trainerInstallFailedDescription"
                                        ),
                                      });
                                    } finally {
                                      setIsDownloadingTrainer(false);
                                    }
                                  }}
                                  disabled={isDownloadingTrainer || trainerExists}
                                >
                                  {isDownloadingTrainer ? (
                                    <>
                                      <Loader className="h-4 w-4 animate-spin" />
                                      {t("gameScreen.installingTrainer")}
                                    </>
                                  ) : trainerExists ? (
                                    <>
                                      <FileCheck2 className="h-4 w-4" />
                                      {t("gameScreen.trainerInstalled")}
                                    </>
                                  ) : (
                                    <>
                                      <Download className="h-4 w-4" />
                                      {t("gameScreen.installTrainer")}
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  className="gap-2"
                                  onClick={async () => {
                                    const success =
                                      await flingTrainerService.downloadTrainer(
                                        flingTrainerData,
                                        game?.game || game?.name
                                      );
                                    if (success) {
                                      toast.success(
                                        t("gameScreen.trainerDownloadStarted"),
                                        {
                                          description: t(
                                            "gameScreen.trainerDownloadStartedDescription"
                                          ),
                                        }
                                      );
                                    } else {
                                      toast.error(t("gameScreen.trainerDownloadFailed"));
                                    }
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                  {t("gameScreen.downloadStandalone")}
                                </Button>
                              </>
                            ) : (
                              <Button
                                className="gap-2 text-secondary"
                                onClick={() =>
                                  flingTrainerService.openTrainerPage(flingTrainerData)
                                }
                              >
                                <ExternalLink className="h-4 w-4" />
                                {t("gameScreen.downloadTrainer")}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={() =>
                                flingTrainerService.openTrainerPage(flingTrainerData)
                              }
                            >
                              <ExternalLink className="h-4 w-4" />
                              {t("gameScreen.viewOnFling")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </div>

      {/* Mod Details Dialog */}
      <AlertDialog open={showModDetails} onOpenChange={setShowModDetails}>
        <AlertDialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              {selectedMod?.name}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {selectedMod?.uploader?.name
                ? `${t("gameScreen.modBy")} ${selectedMod.uploader.name}`
                : t("gameScreen.modDetails")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            {selectedMod?.pictureUrl && (
              <div className="aspect-video overflow-hidden rounded-lg bg-muted">
                <img
                  src={selectedMod.pictureUrl}
                  alt={selectedMod.name}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            {selectedMod?.summary && (
              <p className="text-sm text-muted-foreground">{selectedMod.summary}</p>
            )}

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {selectedMod?.version && (
                <span className="flex items-center gap-1">
                  <Tag className="h-4 w-4" />v{selectedMod.version}
                </span>
              )}
              {selectedMod?.modCategory?.name && (
                <span className="rounded bg-muted px-2 py-0.5">
                  {selectedMod.modCategory.name}
                </span>
              )}
            </div>

            <Separator />

            {/* Mod Files Section */}
            <div>
              <h3 className="mb-3 font-semibold text-primary">
                {t("gameScreen.modFiles")}
              </h3>
              {modFilesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : modFiles.length > 0 ? (
                <div className="space-y-2">
                  {/* Current/Main files */}
                  {[...modFiles]
                    .filter(
                      file =>
                        !["OLD_VERSION", "REMOVED", "ARCHIVED"].includes(file.category)
                    )
                    .sort((a, b) => (b.primary || 0) - (a.primary || 0))
                    .map((file, index) => (
                      <div
                        key={file.fileId || index}
                        className={`flex items-center justify-between rounded-lg border p-3 ${
                          file.primary === 1
                            ? "border-primary/50 bg-primary/10"
                            : "bg-card"
                        }`}
                      >
                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-foreground">
                              {file.name}
                            </p>
                            {file.primary === 1 && (
                              <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary">
                                {t("gameScreen.mainFile")}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            {file.version && <span>v{file.version}</span>}
                            {file.sizeInBytes && (
                              <span>
                                {nexusModsService.formatFileSize(file.sizeInBytes)}
                              </span>
                            )}
                            {file.category && <span>{file.category}</span>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="ml-3 gap-1 text-secondary"
                          onClick={() => handleDownloadMod(selectedMod, file.fileId)}
                        >
                          <Download className="h-4 w-4" />
                          {t("gameScreen.downloadFile")}
                        </Button>
                      </div>
                    ))}

                  {/* Hidden categories collapsible sections */}
                  {["OLD_VERSION", "ARCHIVED", "REMOVED"].map(category => {
                    const filesInCategory = modFiles.filter(
                      file => file.category === category
                    );
                    if (filesInCategory.length === 0) return null;

                    const isExpanded = showOldVersions;
                    const categoryLabels = {
                      OLD_VERSION: { key: "oldVersions", icon: Clock },
                      ARCHIVED: { key: "archivedFiles", icon: BookX },
                      REMOVED: { key: "removedFiles", icon: Trash2 },
                    };
                    const { key, icon: Icon } = categoryLabels[category];

                    return (
                      <div key={category} className="mt-4">
                        <button
                          onClick={() => setShowOldVersions(!showOldVersions)}
                          className="flex w-full items-center justify-between rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {t(`gameScreen.${key}`, { count: filesInCategory.length })}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-2">
                            {filesInCategory.map((file, index) => (
                              <div
                                key={file.fileId || index}
                                className="flex items-center justify-between rounded-lg border bg-card/50 p-3 opacity-75"
                              >
                                <div className="flex-1 overflow-hidden">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate font-medium text-foreground">
                                      {file.name}
                                    </p>
                                  </div>
                                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                    {file.version && <span>v{file.version}</span>}
                                    {file.sizeInBytes && (
                                      <span>
                                        {nexusModsService.formatFileSize(
                                          file.sizeInBytes
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="ml-3 gap-1 text-primary"
                                  onClick={() =>
                                    handleDownloadMod(selectedMod, file.fileId)
                                  }
                                >
                                  <Download className="h-4 w-4" />
                                  {t("gameScreen.downloadFile")}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("gameScreen.noFilesFound")}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3 gap-2"
                    onClick={() => handleDownloadMod(selectedMod)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("gameScreen.viewOnNexus")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <AlertDialogFooter className="mt-4">
            <Button
              className="text-primary"
              variant="outline"
              onClick={() => {
                setShowModDetails(false);
                setSelectedMod(null);
                setModFiles([]);
              }}
            >
              {t("common.close")}
            </Button>
            <Button
              className="gap-2 text-secondary"
              onClick={() => handleDownloadMod(selectedMod)}
            >
              <ExternalLink className="h-4 w-4" />
              {t("gameScreen.viewOnNexus")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        onSave={async newExecutables => {
          if (newExecutables.length > 0) {
            setGame(prev => ({
              ...prev,
              executable: newExecutables[0],
              executables: newExecutables,
            }));
            const exists = await window.electron.checkFileExists(newExecutables[0]);
            setExecutableExists(exists);
          }
        }}
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

      {/* Reset Prefix Confirmation Dialog - Linux only */}
      {showResetPrefixDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
            <h3 className="text-lg font-semibold">Reset Compatibility Prefix</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                You are about to delete the Windows compatibility prefix for
                <strong className="text-foreground"> {game?.game || game?.name}</strong>.
              </p>
              <p>
                This will remove all Windows configurations, DLLs, registry entries, and
                temporary files associated with this game.
              </p>
              <p className="font-medium text-yellow-500">
                ⚠️ Your save files may be lost if they are stored inside the prefix.
                Consider backing up your saves first.
              </p>
              {prefixSize > 0 && (
                <p>
                  This will free approximately{" "}
                  <strong>
                    {prefixSize < 1024 * 1024 * 1024
                      ? `${(prefixSize / (1024 * 1024)).toFixed(1)} MB`
                      : `${(prefixSize / (1024 * 1024 * 1024)).toFixed(2)} GB`}
                  </strong>{" "}
                  of disk space.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowResetPrefixDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleResetPrefix}
                disabled={isResettingPrefix}
              >
                {isResettingPrefix ? "Resetting..." : "Delete Prefix"}
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {/* Audio Fetch Confirmation Dialog */}
      <AudioDownloadConfirmDialog
        open={showAudioDownloadDialog}
        onClose={() => {
          if (pendingAudioDownloads?.resolve) {
            pendingAudioDownloads.resolve(false);
          }
          setShowAudioDownloadDialog(false);
          setPendingAudioDownloads(null);
        }}
        onConfirm={() => {
          if (pendingAudioDownloads?.resolve) {
            pendingAudioDownloads.resolve(true);
          }
          setShowAudioDownloadDialog(false);
          setPendingAudioDownloads(null);
        }}
        onCancel={() => {
          if (pendingAudioDownloads?.resolve) {
            pendingAudioDownloads.resolve(false);
          }
          setShowAudioDownloadDialog(false);
          setPendingAudioDownloads(null);
        }}
        trackCount={pendingAudioDownloads?.count || 0}
        t={t}
      />

      {/* Game Update Available Dialog */}
      <AlertDialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("gameScreen.updateAvailable")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  {isAuthenticated && ascendAccess.hasAccess
                    ? t("gameScreen.updateAvailableDescription")
                    : t("gameScreen.updateAvailableDescriptionNoAuth")}
                </p>
                <div className="rounded-lg border bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t("gameScreen.currentVersion")}</span>
                    <span className="font-mono text-sm font-medium text-foreground">
                      {updateInfo?.localVersion || game?.version || "-"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm">{t("gameScreen.latestVersion")}</span>
                    <span className="font-mono text-sm font-medium text-primary">
                      {updateInfo?.latestVersion || "-"}
                    </span>
                  </div>
                </div>
                {(!isAuthenticated || !ascendAccess.hasAccess) && (
                  <p className="text-xs text-muted-foreground/80">
                    {t("gameScreen.updateManualHint")}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <Button
              variant="outline"
              className="text-primary"
              onClick={() => setShowUpdateDialog(false)}
            >
              {t("common.later")}
            </Button>
            <Button
              className="text-secondary"
              disabled={isStartingUpdate}
              onClick={async () => {
                // Check if user has Ascend access - if not, promote Ascend
                if (!isAuthenticated || !ascendAccess.hasAccess) {
                  setShowUpdateDialog(false);
                  navigate("/ascend");
                  return;
                }

                if (!updateInfo?.autoUpdateSupported) {
                  // No seamless provider, navigate to download page
                  setShowUpdateDialog(false);
                  navigate("/download", {
                    state: {
                      gameData: {
                        game: updateInfo?.gameName || game?.game,
                        gameID: updateInfo?.gameID || game?.gameID,
                        version: updateInfo?.latestVersion,
                        download_links: updateInfo?.downloadLinks,
                        imgID: game?.imgID,
                        isUpdate: true,
                      },
                    },
                  });
                  return;
                }

                // Try seamless providers: gofile first, then buzzheavier, then pixeldrain
                const seamlessProviders = ["gofile", "buzzheavier", "pixeldrain"];
                const downloadLinks = updateInfo?.downloadLinks || {};

                let downloadUrl = null;
                for (const provider of seamlessProviders) {
                  const links = downloadLinks[provider];
                  if (Array.isArray(links) && links.length > 0) {
                    const validLink = links.find(
                      link => link && typeof link === "string"
                    );
                    if (validLink) {
                      downloadUrl = validLink.replace(/^(?:https?:)?\/\//, "https://");
                      console.log(
                        `[GameScreen] Found seamless link from ${provider}:`,
                        downloadUrl
                      );
                      break;
                    }
                  }
                }

                if (!downloadUrl) {
                  // Fallback to download page if no seamless link found
                  setShowUpdateDialog(false);
                  navigate("/download", {
                    state: {
                      gameData: {
                        game: updateInfo?.gameName || game?.game,
                        gameID: updateInfo?.gameID || game?.gameID,
                        version: updateInfo?.latestVersion,
                        download_links: updateInfo?.downloadLinks,
                        imgID: game?.imgID,
                        isUpdate: true,
                      },
                    },
                  });
                  return;
                }

                // Start the seamless download directly
                setIsStartingUpdate(true);
                try {
                  const gameName = game?.game || game?.name;
                  const dir = await window.electron.getDownloadDirectory();

                  console.log(`[GameScreen] Starting update download for ${gameName}`);
                  await window.electron.downloadFile(
                    downloadUrl,
                    gameName,
                    game?.online || false,
                    game?.dlc || false,
                    game?.isVr || false,
                    true, // isUpdating
                    updateInfo?.latestVersion || "",
                    game?.imgID,
                    game?.size || "",
                    dir,
                    game?.gameID || ""
                  );

                  toast.success(t("gameScreen.updateStarted"));
                  setShowUpdateDialog(false);
                  navigate("/downloads");
                } catch (error) {
                  console.error("[GameScreen] Error starting update:", error);
                  toast.error(t("gameScreen.updateFailed"));
                } finally {
                  setIsStartingUpdate(false);
                }
              }}
            >
              {isStartingUpdate ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isAuthenticated && ascendAccess.hasAccess
                ? isStartingUpdate
                  ? t("gameScreen.startingUpdate")
                  : t("gameScreen.downloadUpdate")
                : t("gameScreen.getAscendToUpdate")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
