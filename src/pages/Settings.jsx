import { canUseTorrentOnlySource } from "@/services/downloads/torrentCapability";
import DebridSettings from "@/components/DebridSettings";
import { useState, useCallback, useEffect, useRef } from "react";
import { useTheme, clearCustomTheme } from "@/context/ThemeContext";
import {
  MenuBarSidePicker,
  WindowControlsStylePicker,
} from "@/components/WindowControls";
import { useLanguage } from "@/context/LanguageContext";
import { useLocation } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { resetPageTours } from "@/components/PageTours";
import { Input } from "@/components/ui/input";
import DownloadLimitSelector from "@/components/DownloadLimitSelector";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import SafeHtml from "@/components/SafeHtml";
import "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldAlert,
  Languages,
  Loader,
  Hand,
  RefreshCw,
  CircleAlert,
  Plus,
  FolderOpen,
  X,
  ExternalLink,
  ArrowRight,
  Download,
  Scale,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Zap,
  Battery,
  BatteryMedium,
  BatteryLow,
  BatteryFull,
  SquareTerminal,
  AlertTriangle,
  FolderSync,
  FileCheck2,
  Database,
  Palette,
  Info,
  Gamepad2,
  SlidersHorizontal,
  HardDriveDownload,
  Joystick,
  ArchiveRestore,
  Layers,
  Wrench,
  Microscope,
  MonitorPlay,
  CircleHelp,
  Heart,
  Gift,
  Check,
  History,
  CloudDownload,
} from "lucide-react";
import gameService from "@/services/games/gameService";
import { useNavigate } from "react-router-dom";
import {
  getAvailableLanguages,
  handleLanguageChange,
} from "@/services/app/languageService";
import GameInfoLanguageBadge from "@/components/GameInfoLanguageBadge";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettings } from "@/context/SettingsContext";
import { verifyAscendAccess } from "@/services/firebase/firebaseService";
import ProtonOptionsDialog from "@/components/ProtonOptionsDialog";
import TimemachineIntroDialog from "@/components/TimemachineIntroDialog";
import HighballSettings from "@/components/HighballSettings";
import GameIndexManager from "@/components/GameIndexManager";
import AchievementFolderSearch from "@/components/AchievementFolderSearch";
import NotificationSoundSettings from "@/components/NotificationSoundSettings";
import LibraryTransferSettings from "@/components/LibraryTransferSettings";
import AppBranchPicker, { getAppBranch } from "@/components/AppBranchPicker";
import { API_URL } from "@/config/api";
import { persistThemeSelection } from "@/lib/themePersistence";

const themes = [
  // Light themes
  { id: "coral", name: "Coral", group: "light", isNew: true },
  { id: "blue", name: "Ocean Blue", group: "light" },
  { id: "purple", name: "Ascendara Purple", group: "light" },
  { id: "emerald", name: "Emerald", group: "light" },
  { id: "rose", name: "Rose", group: "light" },
  { id: "lagoon", name: "Lagoon", group: "light", isNew: true },
  { id: "royal-pearl", name: "Royal Pearl", group: "light", isNew: true },

  // Dark themes
  { id: "aurora", name: "Aurora", group: "dark", isNew: true },
  { id: "midnight", name: "Midnight", group: "dark" },
  { id: "cyberpunk", name: "Cyberpunk", group: "dark" },
  { id: "sunset", name: "Sunset", group: "dark" },
  { id: "forest", name: "Forest", group: "dark" },
  { id: "crimson", name: "Crimson", group: "dark", isNew: true },
  { id: "royal-night", name: "Royal Night", group: "dark", isNew: true },

  // Classics: earlier themes, kept for anyone who still uses them
  { id: "light", name: "Arctic Sky", group: "classic" },
  { id: "dark", name: "Dark Blue", group: "classic" },
  { id: "ocean", name: "Deep Ocean", group: "classic" },
  { id: "amber", name: "Amber Sand", group: "classic" },
];

const getThemeColors = themeId => {
  const themeMap = {
    light: {
      bg: "bg-white",
      primary: "bg-blue-500",
      secondary: "bg-slate-100",
      text: "text-slate-900",
    },
    dark: {
      bg: "bg-slate-900",
      primary: "bg-blue-500",
      secondary: "bg-slate-800",
      text: "text-slate-100",
    },
    blue: {
      bg: "bg-blue-50",
      primary: "bg-blue-600",
      secondary: "bg-blue-100",
      text: "text-blue-900",
    },
    purple: {
      bg: "bg-purple-50",
      primary: "bg-purple-500",
      secondary: "bg-purple-100",
      text: "text-purple-900",
    },
    emerald: {
      bg: "bg-emerald-50",
      primary: "bg-emerald-500",
      secondary: "bg-emerald-100",
      text: "text-emerald-900",
    },
    rose: {
      bg: "bg-rose-50",
      primary: "bg-rose-500",
      secondary: "bg-rose-100",
      text: "text-rose-900",
    },
    cyberpunk: {
      bg: "bg-gray-900",
      primary: "bg-pink-500",
      secondary: "bg-gray-800",
      text: "text-pink-500",
    },
    sunset: {
      bg: "bg-slate-800",
      primary: "bg-orange-500",
      secondary: "bg-slate-700",
      text: "text-orange-400",
    },
    forest: {
      bg: "bg-[#141E1B]",
      primary: "bg-green-500",
      secondary: "bg-[#1C2623]",
      text: "text-green-300",
    },
    midnight: {
      bg: "bg-[#020617]",
      primary: "bg-indigo-400",
      secondary: "bg-slate-800",
      text: "text-indigo-200",
    },
    lagoon: {
      bg: "bg-[#ECFAFA]",
      primary: "bg-[#0D7480]",
      secondary: "bg-[#CFF2F3]",
      text: "text-[#0E3E46]",
    },
    coral: {
      bg: "bg-[#FFF1EC]",
      primary: "bg-[#CC402C]",
      secondary: "bg-[#FDE2D8]",
      text: "text-[#5C1C14]",
    },
    "royal-pearl": {
      bg: "bg-[#F7F6FB]",
      primary: "bg-[#37228C]",
      secondary: "bg-[#ECE9F6]",
      text: "text-[#1E1646]",
    },
    "royal-night": {
      bg: "bg-[#120E26]",
      primary: "bg-[#E8BA52]",
      secondary: "bg-[#1C1638]",
      text: "text-[#F5ECD4]",
    },
    amber: {
      bg: "bg-amber-50",
      primary: "bg-amber-600",
      secondary: "bg-amber-100",
      text: "text-amber-900",
    },
    aurora: {
      bg: "bg-[#081218]",
      primary: "bg-[#2DD4BF]",
      secondary: "bg-[#0E1C24]",
      text: "text-[#DCFCF6]",
    },
    ocean: {
      bg: "bg-slate-900",
      primary: "bg-cyan-400",
      secondary: "bg-slate-800",
      text: "text-cyan-100",
    },
    crimson: {
      bg: "bg-[#160A0E]",
      primary: "bg-[#F85252]",
      secondary: "bg-[#241016]",
      text: "text-[#FEE2E2]",
    },
  };

  return themeMap[themeId] || themeMap.light;
};

function Settings() {
  const [currentBranch, setCurrentBranch] = useState("main");
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [branchSwitchProgress, setBranchSwitchProgress] = useState(0);
  const [hasAscendSubscription, setHasAscendSubscription] = useState(false);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [pendingBranch, setPendingBranch] = useState("");
  const [branchVersions, setBranchVersions] = useState(null);
  const [showAscendPromoDialog, setShowAscendPromoDialog] = useState(false);
  const { theme, setTheme } = useTheme();
  const { language, changeLanguage, t } = useLanguage();
  const { settings, setSettings, setSettingsLocal } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [isInitialized, setIsInitialized] = useState(false);
  const initialSettingsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState("none");
  const [isTriggering, setIsTriggering] = useState(false);
  const [apiMetadata, setApiMetadata] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnWindows, setIsOnWindows] = useState(null);
  const [isOnLinux, setIsOnLinux] = useState(false);
  const [isOnMac, setIsOnMac] = useState(false);
  const [downloadPath, setDownloadPath] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const [canCreateFiles, setCanCreateFiles] = useState(true);
  const [isDownloaderRunning, setIsDownloaderRunning] = useState(false);
  const [showTorrentWarning, setShowTorrentWarning] = useState(false);
  const [showNoLudusaviDialog, setShowNoLudusaviDialog] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [isExperiment, setIsExperiment] = useState(false);
  const [isPublicTesting, setIsPublicTesting] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [testingVersion, setTestingVersion] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [exclusionLoading, setExclusionLoading] = useState(false);
  const [controllerConnected, setControllerConnected] = useState(false);
  const [runners, setRunners] = useState([]);
  const [selectedRunner, setSelectedRunner] = useState("auto");
  const [isDownloadingProtonCachy, setIsDownloadingProtonCachy] = useState(false);
  const [protonCachyInfo, setProtonCachyInfo] = useState(null);
  const [showProtonCachyConfirm, setShowProtonCachyConfirm] = useState(false);
  const [protonCachyUpdateStatus, setProtonCachyUpdateStatus] = useState(null); // null | "checking" | "up-to-date" | "update-available"

  const [isDownloadingProtonGE, setIsDownloadingProtonGE] = useState(false);
  const [protonGEInfo, setProtonGEInfo] = useState(null);
  const [showProtonGEConfirm, setShowProtonGEConfirm] = useState(false);
  const [protonGEUpdateStatus, setProtonGEUpdateStatus] = useState(null);
  const [umuInstalled, setUmuInstalled] = useState(false);
  const [umuProtonInfo, setUmuProtonInfo] = useState(null);
  const [isDownloadingUmuLauncher, setIsDownloadingUmuLauncher] = useState(false);
  const [isDownloadingUmuProton, setIsDownloadingUmuProton] = useState(false);
  const [umuProtonUpdateStatus, setUmuProtonUpdateStatus] = useState(null);
  const [latestDevCommit, setLatestDevCommit] = useState(null);
  const [protonOptionsOpen, setProtonOptionsOpen] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [showTimemachineIntro, setShowTimemachineIntro] = useState(false);
  const [showSupportConfirmDialog, setShowSupportConfirmDialog] = useState(false);
  const [supportCode, setSupportCode] = useState(["", "", "", "", "", ""]);
  const [supportLoading, setSupportLoading] = useState(false);
  const supportInputRefs = useRef([]);

  // Use a ref to track if this is the first mount
  const isFirstMount = useRef(true);

  const handleExclusionToggle = async () => {
    const newValue = !settings.excludeFolders;
    setExclusionLoading(true);
    try {
      const result = await window.electron.folderExclusion(newValue);
      if (result && result.success) {
        handleSettingChange("excludeFolders", newValue);
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      toast.error("Error updating exclusions.");
    }
    setExclusionLoading(false);
  };

  useEffect(() => {
    const checkBranch = async () => {
      const branch = (await window.electron.getBranch?.()) ?? "live";
      setCurrentBranch(branch);
      const isExp = branch === "experimental";
      const isPubTest = branch === "public-testing";
      setIsExperiment(isExp);
      setIsPublicTesting(isPubTest);

      if (isExp || isPubTest) {
        const version = await window.electron.getTestingVersion();
        setTestingVersion(version);
      } else {
        setTestingVersion("");
      }
    };
    checkBranch();

    // Re-check branch when window becomes visible (after branch switch)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkBranch();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const result = await verifyAscendAccess();
        setHasAscendSubscription(
          result.isSubscribed === true ||
            result.isVerified === true ||
            result.hasAccess === true
        );
      } catch (e) {
        setHasAscendSubscription(false);
      }
    };
    checkSubscription();
  }, []);

  useEffect(() => {
    if (!isSwitchingBranch) return;
    const handler = progress => setBranchSwitchProgress(progress);
    window.electron.onBranchSwitchProgress?.(handler);
    return () => {
      window.electron.removeBranchSwitchProgressListener?.(handler);
    };
  }, [isSwitchingBranch]);

  // Fetch branch versions from API
  useEffect(() => {
    const fetchBranchVersions = async () => {
      try {
        const response = await fetch(`${API_URL}/branch-versions`);
        const data = await response.json();
        setBranchVersions(data);
      } catch (error) {
        console.error("Failed to fetch branch versions:", error);
      }
    };
    fetchBranchVersions();
  }, []);

  // Check if we're on Windows
  useEffect(() => {
    const checkPlatform = async () => {
      const isWindows = await window.electron.isOnWindows();
      console.log("Is on Windows:", isWindows);
      setIsOnWindows(isWindows);
      const linux = !isWindows && navigator.userAgent.toLowerCase().includes("linux");
      setIsOnLinux(linux);
      setIsOnMac(window.electron.getPlatform() === "darwin");

      // Load Linux runners if on Linux
      if (linux) {
        try {
          const detectedRunners = await window.electron.getRunners();
          setRunners(detectedRunners);
          const currentSettings = await window.electron.getSettings();
          setSelectedRunner(currentSettings.linuxRunner || "auto");
          // Check UMU status
          const installed = await window.electron.isUmuInstalled();
          setUmuInstalled(installed);
          const umuInfo = await window.electron.getUmuProtonInfo();
          if (umuInfo?.success) setUmuProtonInfo(umuInfo);
        } catch (e) {
          console.error("Failed to load runners:", e);
        }
      }
    };
    checkPlatform();
  }, []);

  // Check for controller connection
  useEffect(() => {
    const checkController = () => {
      const gamepads = navigator.getGamepads();
      const hasController = Array.from(gamepads).some(
        g => g && g.connected && (g.axes.length >= 2 || g.buttons.length >= 10)
      );
      setControllerConnected(hasController);
    };

    checkController();

    window.addEventListener("gamepadconnected", checkController);
    window.addEventListener("gamepaddisconnected", checkController);

    return () => {
      window.removeEventListener("gamepadconnected", checkController);
      window.removeEventListener("gamepaddisconnected", checkController);
    };
  }, []);

  useEffect(() => {
    const checkDownloaderStatus = async () => {
      try {
        const games = await window.electron.getGames();
        if (!games || !Array.isArray(games)) {
          setIsDownloaderRunning(false);
          return;
        }
        const hasDownloadingGames = games.some(game => {
          const { downloadingData } = game;
          return (
            downloadingData &&
            (downloadingData.downloading ||
              downloadingData.extracting ||
              downloadingData.updating ||
              downloadingData.error)
          );
        });
        setIsDownloaderRunning(hasDownloadingGames);
      } catch (error) {
        console.error("Error checking downloading games:", error);
      }
    };

    // Check immediately
    checkDownloaderStatus();

    // Then check every second
    const interval = setTimeout(() => {
      checkDownloaderStatus();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-save is handled by handleSettingChange, no need for this effect

  // Load initial settings - only run once when settings are loaded
  useEffect(() => {
    // Only initialize once
    if (!isFirstMount.current) return;

    // Wait for settings to be loaded from context
    if (!settings) {
      return;
    }

    setIsLoading(true);

    try {
      // Settings are already loaded by SettingsContext, just sync local state
      if (settings.downloadDirectory) {
        setDownloadPath(settings.downloadDirectory);
      }
      if (settings.backupDirectory) {
        setBackupPath(settings.backupDirectory);
      }
      initialSettingsRef.current = settings;

      isFirstMount.current = false;
      setIsInitialized(true);
    } catch (error) {
      console.error("Error initializing settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [settings]); // Simmplify dependencies

  const handleSettingChange = useCallback(
    async (key, value, ludusavi = false) => {
      if (key === "sideScrollBar") {
        setSettingsLocal(prev => ({
          ...prev,
          [key]: value,
        }));
        // Update scrollbar styles directly
        if (value) {
          document.documentElement.classList.add("custom-scrollbar");
        } else {
          document.documentElement.classList.remove("custom-scrollbar");
        }
        return;
      }

      // Handle Ludusavi settings
      if (ludusavi) {
        // Only update the nested ludusavi object
        window.electron
          .updateSetting("ludusavi", {
            ...(settings.ludusavi || {}),
            [key]: value,
          })
          .then(success => {
            if (success) {
              setSettingsLocal(prev => ({
                ...prev,
                ludusavi: {
                  ...(prev.ludusavi || {}),
                  [key]: value,
                },
              }));
            }
          });
        return;
      }

      // Handle Wine settings
      if (key === "wine" || key === "_wine_field") {
        const [field, val] = key === "_wine_field" ? value : [null, null];
        const updatedWine = field ? { ...(settings.wine || {}), [field]: val } : value;
        window.electron.updateSetting("wine", updatedWine).then(success => {
          if (success) {
            setSettingsLocal(prev => ({ ...prev, wine: updatedWine }));
          }
        });
        return;
      }

      // Handle Proton settings
      if (key === "proton" || key === "_proton_field") {
        const [field, val] = key === "_proton_field" ? value : [null, null];
        const updatedProton = field
          ? { ...(settings.proton || {}), [field]: val }
          : value;
        window.electron.updateSetting("proton", updatedProton).then(success => {
          if (success) {
            setSettingsLocal(prev => ({ ...prev, proton: updatedProton }));
          }
        });
        return;
      }

      console.log(`Trying to update: ${key} -> ${value}`);
      window.electron.updateSetting(key, value).then(success => {
        console.log(`Update result ${key}:`, success);
        if (success) {
          setSettingsLocal(prev => ({
            ...prev,
            [key]: value,
          }));
        }
      });
    },
    [settings.ludusavi, setSettingsLocal]
  );

  // Make sure Ascendara can write to a picked folder before saving it. Each
  // online download checks its folder for security software on its own.
  const handleDirectorySelect = useCallback(async () => {
    try {
      const directory = await window.electron.openDirectoryDialog();
      if (!directory) return;
      if (!(await window.electron.canCreateFiles(directory))) {
        toast.error(t("settings.locationCheck.noPermission"));
        return;
      }
      setDownloadPath(directory);
      handleSettingChange("downloadDirectory", directory);
    } catch (error) {
      console.error("Error selecting directory:", error);
      toast.error(t("settings.errors.directorySelect"));
    }
  }, [handleSettingChange, t]);

  const handleAddLocationSelect = useCallback(async () => {
    try {
      const directory = await window.electron.openDirectoryDialog();
      if (!directory) return;
      const normalize = value =>
        value
          .replace(/[\\/]+$/, "")
          .replace(/\//g, "\\")
          .toLowerCase();
      const existing = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ].filter(Boolean);
      if (existing.some(path => normalize(path) === normalize(directory))) {
        toast.error(t("settings.locationCheck.duplicate"));
        return;
      }
      if (!(await window.electron.canCreateFiles(directory))) {
        toast.error(t("settings.locationCheck.noPermission"));
        return;
      }
      const newPaths = [...(settings.additionalDirectories || []), directory];
      if (!(await window.electron.updateSetting("additionalDirectories", newPaths))) {
        toast.error(t("settings.locationCheck.saveFailed"));
        return;
      }
      setSettingsLocal({ additionalDirectories: newPaths });
    } catch (error) {
      console.error("Error selecting directory:", error);
      toast.error(t("settings.errors.directorySelect"));
    }
  }, [settings.downloadDirectory, settings.additionalDirectories, setSettingsLocal, t]);

  const handleDirectoryChangeBackups = useCallback(async () => {
    try {
      const directory = await window.electron.openDirectoryDialog();
      if (directory) {
        const canCreate = await window.electron.canCreateFiles(directory);
        if (!canCreate) {
          toast.error(t("settings.errors.noPermission"));
          return;
        }
        setBackupPath(directory);
        handleSettingChange("backupLocation", directory, true);
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
      toast.error(t("settings.errors.directorySelect"));
    }
  }, [handleSettingChange, t]);

  // Theme handling
  const handleThemeChange = useCallback(
    async newTheme => {
      try {
        console.log("Saving theme:", newTheme);
        const success = await persistThemeSelection(newTheme, {
          persist: value => window.electron.updateSetting("theme", value),
          clearCustomTheme,
          applyTheme: setTheme,
          syncSettings: value =>
            setSettingsLocal(prev => ({ ...prev, theme: value })),
        });
        console.log("Save successful ?", success);

        if (!success) {
          toast.error("Failed to save theme preference");
        }
      } catch (e) {
        console.error("Error saving theme:", e);
        toast.error("Failed to save theme preference");
      }
    },
    [setSettingsLocal, setTheme]
  );

  const groupedThemes = {
    light: themes.filter(t => t.group === "light"),
    dark: themes.filter(t => t.group === "dark"),
    classic: themes.filter(t => t.group === "classic"),
  };
  // Opens on the group holding the current theme
  const [themeGroup, setThemeGroup] = useState(
    () => themes.find(item => item.id === theme)?.group || "dark"
  );

  // Check if in development mode and fetch latest dev commit
  useEffect(() => {
    const checkDevMode = async () => {
      const isDevMode = await window.electron.isDev();
      setIsDev(isDevMode);

      // Fetch latest development commit if in dev mode
      if (isDevMode) {
        try {
          const response = await fetch(
            "https://api.github.com/repos/Ascendara/ascendara/commits/development"
          );
          if (response.ok) {
            const data = await response.json();
            setLatestDevCommit({
              sha: data.sha,
              message: data.commit.message.split("\n")[0], // First line only
              url: data.html_url,
            });
          }
        } catch (error) {
          console.error("Failed to fetch latest dev commit:", error);
        }
      }
    };
    checkDevMode();
  }, []);

  // Function to trigger selected screen
  const triggerScreen = async () => {
    setIsTriggering(true);
    try {
      switch (currentScreen) {
        case "updating":
          // Same toast a real update shows; its button previews the overlay
          window.dispatchEvent(new CustomEvent("ascendara:preview-update-toast"));
          break;

        case "loading":
          // Set loading state and reload
          localStorage.setItem("forceLoading", "true");
          window.location.reload();
          break;

        case "crashscreen":
          // Simulate a crash by throwing an error
          throw new Error("Intentional crash for testing");

        case "finishingup":
          // Set the updating timestamp to show finishing up screen
          await window.electron.setTimestampValue("isUpdating", true);
          window.location.reload();
          break;

        case "welcome":
          // App swaps to the welcome flow as if this were a new install
          window.dispatchEvent(new CustomEvent("ascendara:show-welcome"));
          break;

        case "verification":
          // Ascend shows the email verification screen once, regardless of account state
          localStorage.setItem("forceVerificationScreen", "true");
          navigate("/ascend");
          break;
      }
    } catch (error) {
      console.error("Error triggering screen:", error);
      if (currentScreen === "crashscreen") {
        // For crash screen, we want to propagate the error
        throw error;
      }
    } finally {
      setIsTriggering(false);
    }
  };

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const data = await gameService.getAllGames();
        setApiMetadata(data.metadata);
      } catch (error) {
        console.error("Error fetching metadata:", error);
      }
    };
    fetchMetadata();
  }, []);

  const handleRefreshIndex = async () => {
    setIsRefreshing(true);
    try {
      const lastModified = await gameService.checkMetadataUpdate();
      if (lastModified) {
        const data = await gameService.getAllGames();
        setApiMetadata(data.metadata);
      }
    } catch (error) {
      console.error("Error checking for updates:", error);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  useEffect(() => {
    const loadLanguages = async () => {
      const languages = await getAvailableLanguages();
      setAvailableLanguages(languages);
    };
    loadLanguages();
  }, []);

  // Settings are grouped into categories; each category's icon is used only
  // in the side list so it never doubles up with an icon inside the page
  const settingsCategories = [
    { id: "general", icon: SlidersHorizontal },
    { id: "game-index", icon: Database },
    { id: "downloads", icon: HardDriveDownload },
    { id: "debrid", icon: CloudDownload },
    { id: "gaming", icon: Joystick },
    { id: "backups", icon: ArchiveRestore },
    {
      id: "compatibility",
      icon: Layers,
      hidden: !isOnLinux && !isOnMac,
      descriptionKey: isOnMac ? "descriptionMac" : "description",
    },
    { id: "tools", icon: Wrench },
    { id: "advanced", icon: Microscope },
  ].map(category => ({
    ...category,
    title: t(`settings.categories.${category.id}.title`),
    description: t(
      `settings.categories.${category.id}.${category.descriptionKey || "description"}`
    ),
  }));
  const visibleCategories = settingsCategories.filter(category => !category.hidden);
  // One category is shown at a time; the rest stay mounted but hidden so
  // search can still find any setting by its id
  const [activeCategory, setActiveCategory] = useState(() => {
    try {
      return sessionStorage.getItem("settings-category") || "general";
    } catch {
      return "general";
    }
  });

  const activeCategoryRef = useRef(activeCategory);
  activeCategoryRef.current = activeCategory;

  const openCategory = id => {
    setActiveCategory(id);
    try {
      sessionStorage.setItem("settings-category", id);
    } catch {
      // Remembering the category is only a convenience
    }
  };

  const selectCategory = id => {
    openCategory(id);
    window.scrollTo({ top: 0 });
  };

  // Fall back to General if the remembered category isn't available here
  useEffect(() => {
    if (!visibleCategories.some(category => category.id === activeCategory)) {
      setActiveCategory("general");
    }
  }, [isOnLinux, isOnMac]);

  const categoryProps = id => {
    const category = settingsCategories.find(c => c.id === id);
    return {
      id,
      title: category.title,
      description: category.description,
      active: activeCategory === id,
    };
  };

  // Links from elsewhere in the app (global search, index prompts, ...) land
  // here with a setting id in the navigation state. The state is cleared right
  // away so a re-render doesn't jump again, and the jump itself runs from its
  // own state so clearing the location doesn't cancel it.
  const [jumpTarget, setJumpTarget] = useState(null);
  const settingsRootRef = useRef(null);

  useEffect(() => {
    const targetId = location.state?.scrollTo;
    if (!targetId || isLoading) return;
    setJumpTarget({
      id: targetId,
      // Opened instead when the setting isn't available on this platform
      category: location.state?.category,
      requestedAt: Date.now(),
    });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, isLoading, navigate, location.pathname]);

  useEffect(() => {
    if (!jumpTarget) return;
    let cancelled = false;
    let frame = 0;
    let lastTop = null;
    let highlighted = null;
    const timers = [];
    const cleanups = [];
    const startedAt = performance.now();

    const highlight = element => {
      element.classList.remove("highlight-setting");
      // Restart the animation if the same setting is linked twice in a row
      void element.offsetWidth;
      element.classList.add("highlight-setting");
      highlighted = element;
      timers.push(setTimeout(() => element.classList.remove("highlight-setting"), 2800));
    };

    const scrollToElement = element => {
      const isCategory = element.hasAttribute("data-category");
      const behavior =
        document.documentElement.dataset.motion === "reduced" ? "auto" : "smooth";

      // A whole category only needs opening, from the top
      if (isCategory) {
        window.scrollTo({ top: 0, behavior });
        return;
      }

      // Keep clear of the menu bar on top and the dock at the bottom: center
      // the setting in what is left, or line up its top if it is taller
      const topInset = 72;
      const bottomInset = 120;
      const usable = window.innerHeight - topInset - bottomInset;
      const rect = element.getBoundingClientRect();
      const offset =
        rect.height < usable ? topInset + (usable - rect.height) / 2 : topInset + 16;
      const maxTop = document.documentElement.scrollHeight - window.innerHeight;
      const top = Math.max(0, Math.min(maxTop, window.scrollY + rect.top - offset));

      if (Math.abs(top - window.scrollY) < 2) {
        highlight(element);
        return;
      }

      // Highlight once the scroll lands so the pulse is actually seen
      let done = false;
      const onArrive = () => {
        if (done || cancelled) return;
        done = true;
        window.removeEventListener("scrollend", onArrive);
        highlight(element);
      };
      window.addEventListener("scrollend", onArrive);
      cleanups.push(() => window.removeEventListener("scrollend", onArrive));
      timers.push(setTimeout(onArrive, behavior === "smooth" ? 900 : 50));
      window.scrollTo({ top, behavior });
    };

    const step = () => {
      if (cancelled) return;
      const root = settingsRootRef.current;
      if (!root) {
        if (performance.now() - startedAt < 2000) frame = requestAnimationFrame(step);
        return;
      }
      // Look only inside Settings: the page being navigated away from can
      // still be fading out with ids of its own
      let element = root.querySelector(`#${CSS.escape(jumpTarget.id)}`);
      // Some settings only render once platform checks finish, so keep
      // looking for a moment before falling back to the setting's category
      if (!element) {
        const elapsed = performance.now() - startedAt;
        if (jumpTarget.category && elapsed > 800) {
          element = root.querySelector(
            `[data-category="${CSS.escape(jumpTarget.category)}"]`
          );
        }
        if (!element) {
          if (elapsed < 2000) frame = requestAnimationFrame(step);
          return;
        }
      }

      const category = element.closest("[data-category]")?.dataset.category;
      if (category && category !== activeCategoryRef.current) {
        openCategory(category);
        frame = requestAnimationFrame(step);
        return;
      }

      // Wait for the page's enter transition to settle so the measured
      // position is where the setting will actually end up
      const top = element.getBoundingClientRect().top + window.scrollY;
      const visible = element.getClientRects().length > 0;
      if (
        (!visible || lastTop === null || Math.abs(top - lastTop) > 0.5) &&
        performance.now() - startedAt < 1500
      ) {
        lastTop = top;
        frame = requestAnimationFrame(step);
        return;
      }

      scrollToElement(element);
    };

    frame = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      cleanups.forEach(cleanup => cleanup());
      highlighted?.classList.remove("highlight-setting");
    };
  }, [jumpTarget]);

  // On Unix, verify that ludusavi is installed
  useEffect(() => {
    if (isOnWindows !== false || !settings?.ludusavi?.enabled) return;
    (async () => {
      const tools = await window.electron.getInstalledTools();
      if (!tools.includes("ludusavi")) {
        // Fix if binary missing but toggle activated
        handleSettingChange("enabled", false, true);
        console.log("[Ludusavi] Binary not found on Unix, disabling in settings");
      }
    })();
  }, [isOnWindows, settings?.ludusavi?.enabled, handleSettingChange]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="container mx-auto">
        <div className="mx-auto flex min-h-[85vh] max-w-md flex-col items-center justify-center text-center">
          <div className="space-y-6">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold tracking-tight">
                {t("settings.loadingSettings")}
              </h3>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const localTorrentRequiredBySource = Boolean(
    settings.customSourcesMode &&
      settings.customSource?.torrentOnly &&
      settings.torrentEnabled &&
      !canUseTorrentOnlySource(settings.customSource, {
        ...settings,
        torrentEnabled: false,
      })
  );

  const handleTorrentToggle = () => {
    if (!settings.torrentEnabled) {
      setShowTorrentWarning(true);
    } else {
      handleSettingChange("torrentEnabled", false);
      window.dispatchEvent(new CustomEvent("torrentSettingChanged", { detail: false }));
    }
  };

  const handleEnableTorrent = () => {
    setShowTorrentWarning(false);
    handleSettingChange("torrentEnabled", true);
    window.dispatchEvent(new CustomEvent("torrentSettingChanged", { detail: true }));
  };
  const handleToggleLudusavi = async () => {
    if (settings.ludusavi.enabled) {
      handleSettingChange("enabled", false, true);
    } else {
      const tools = await window.electron.getInstalledTools();
      const ludusaviInstalled = tools.includes("ludusavi");
      if (!ludusaviInstalled) {
        setShowNoLudusaviDialog(true);
      } else {
        handleSettingChange("enabled", true, true);
      }
    }
  };

  return (
    <div ref={settingsRootRef} className="min-h-screen bg-background">
      <div className="container mx-auto max-w-7xl p-4 md:p-8">
        <div className="mb-6 flex items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>

          {isExperiment ? (
            <div className="group relative ml-auto flex items-center text-sm text-muted-foreground">
              <div className="px-2 font-medium">
                <span>Experiment Build {testingVersion}</span>
              </div>
            </div>
          ) : isPublicTesting ? (
            <div className="group relative ml-auto flex items-center text-sm text-muted-foreground">
              <div className="px-2 font-medium">
                <span>Public Testing Build {testingVersion}</span>
              </div>
            </div>
          ) : isDev ? (
            <div className="group relative ml-auto flex items-center text-sm text-muted-foreground">
              <div className="cursor-pointer px-2">
                <span>Latest Development Commit:</span>
              </div>
              {latestDevCommit ? (
                <div
                  onClick={() => window.electron.openURL(latestDevCommit.url)}
                  className="cursor-pointer hover:underline"
                  title={latestDevCommit.message}
                >
                  <span className="text-primary-foreground/60">
                    {latestDevCommit.sha.substring(0, 8)}
                  </span>
                </div>
              ) : (
                <div className="cursor-pointer">
                  <span className="text-primary-foreground/60">Loading...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="group relative ml-auto flex items-center text-sm text-muted-foreground">
              <div
                onClick={() =>
                  window.electron.openURL(
                    `https://github.com/ascendara/ascendara/commit/${__APP_REVISION__}`
                  )
                }
                className="mr-2 -translate-x-8 transform cursor-pointer opacity-0 transition-all duration-300 hover:underline group-hover:translate-x-0 group-hover:opacity-100"
              >
                <span className="text-primary-foreground/60">
                  (rev: {__APP_REVISION__?.substring(0, 7) || "dev"})
                </span>
              </div>
              <div
                onClick={() =>
                  window.electron.openURL("https://ascendara.app/changelog?individual")
                }
                className="cursor-pointer px-2 hover:underline"
              >
                <span>v{__APP_VERSION__}</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          <aside className="space-y-6 lg:sticky lg:top-[84px]">
            <SettingsNav
              categories={visibleCategories}
              activeId={activeCategory}
              onSelect={selectCategory}
            />
            <SupportDevelopersNote t={t} />
          </aside>

          <div className="min-w-0">
            <SettingsCategory {...categoryProps("general")}>
              <SettingsSection id="appearance-settings" title={t("settings.appearance")}>
                <div className="space-y-6">
                  <div id="theme">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Label>{t("settings.themes")}</Label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setThemeGroup("classic")}
                          aria-pressed={themeGroup === "classic"}
                          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                            themeGroup === "classic"
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <History className="h-3.5 w-3.5" />
                          {t("settings.classicThemes")}
                        </button>
                        <div className="flex rounded-lg bg-muted/50 p-0.5">
                          {["light", "dark"].map(group => (
                            <button
                              key={group}
                              type="button"
                              onClick={() => setThemeGroup(group)}
                              className={`relative rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                themeGroup === group
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {themeGroup === group && (
                                <motion.span
                                  layoutId="settings-theme-group"
                                  className="absolute inset-0 rounded-md bg-background shadow-sm"
                                  transition={{
                                    type: "spring",
                                    stiffness: 400,
                                    damping: 34,
                                  }}
                                />
                              )}
                              <span className="relative">
                                {group === "light"
                                  ? t("settings.lightThemes")
                                  : t("settings.darkThemes")}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {themeGroup === "classic" && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("settings.classicThemesDescription")}
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-4">
                      {groupedThemes[themeGroup].map(item => (
                        <ThemeButton
                          key={item.id}
                          theme={item}
                          currentTheme={theme}
                          onSelect={handleThemeChange}
                          t={t}
                        />
                      ))}
                      {/* Custom themes are made in their own page */}
                      {themeGroup !== "classic" && (
                        <button
                          id="custom-colors"
                          type="button"
                          onClick={() => navigate("/themes")}
                          className="group text-left outline-none"
                        >
                          <div
                            className={`flex aspect-[16/10] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-colors ${
                              theme === "custom"
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border text-muted-foreground group-hover:border-primary/50 group-hover:text-primary"
                            }`}
                          >
                            <Palette className="h-5 w-5" />
                            <span className="text-xs font-medium">
                              {t("settings.themeStudio.open")}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {t("settings.customColors") || "Custom Theme"}
                            </span>
                            {theme === "custom" && (
                              <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
                            )}
                          </div>
                        </button>
                      )}
                    </div>
                  </div>

                  <div id="side-scrollbar" className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("settings.sideScrollBar")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.sideScrollBarDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.sideScrollBar}
                      onCheckedChange={() =>
                        handleSettingChange("sideScrollBar", !settings.sideScrollBar)
                      }
                    />
                  </div>

                  <div
                    id="compact-dock-on-scroll"
                    className="flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <Label>{t("settings.compactDockOnScroll")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.compactDockOnScrollDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.compactDockOnScroll !== false}
                      onCheckedChange={value =>
                        handleSettingChange("compactDockOnScroll", value)
                      }
                    />
                  </div>

                  <div id="home-search" className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("settings.homeSearch")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.homeSearchDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.homeSearch}
                      onCheckedChange={() =>
                        handleSettingChange("homeSearch", !settings.homeSearch)
                      }
                    />
                  </div>

                  <div
                    id="window-controls"
                    className="flex items-center justify-between gap-4"
                  >
                    <div className="space-y-0.5">
                      <Label>{t("settings.windowControls")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.windowControlsDescription")}
                      </p>
                    </div>
                    <WindowControlsStylePicker
                      value={settings.windowControlsStyle}
                      onChange={style =>
                        handleSettingChange("windowControlsStyle", style)
                      }
                      t={t}
                      side={settings.menuBarSide}
                    />
                  </div>

                  <div
                    id="menu-bar-side"
                    className="flex items-center justify-between gap-4"
                  >
                    <div className="space-y-0.5">
                      <Label>{t("settings.menuBarSide")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.menuBarSideDescription")}
                      </p>
                    </div>
                    <MenuBarSidePicker
                      value={settings.menuBarSide}
                      onChange={side => handleSettingChange("menuBarSide", side)}
                      t={t}
                    />
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                id="motion-settings"
                title={t("settings.motionEffects")}
                description={t("settings.motionEffectsDescription")}
              >
                <div className="space-y-6">
                  <div id="reduce-effects" className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("settings.reduceEffects")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.reduceEffectsDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.reduceEffects === true}
                      onCheckedChange={() =>
                        handleSettingChange("reduceEffects", !settings.reduceEffects)
                      }
                    />
                  </div>

                  {/* Reduce Effects already turns page transitions off, so this
                      only applies while it is off. The saved value is kept */}
                  <div
                    id="smooth-transitions"
                    className={`flex items-center justify-between transition-opacity ${
                      settings.reduceEffects ? "opacity-60" : ""
                    }`}
                  >
                    <div className="space-y-0.5">
                      <Label>{t("settings.smoothTransitions")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {settings.reduceEffects
                          ? t("settings.smoothTransitionsOverridden")
                          : t("settings.smoothTransitionsDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={!settings.reduceEffects && settings.smoothTransitions}
                      disabled={settings.reduceEffects === true}
                      onCheckedChange={() =>
                        handleSettingChange(
                          "smoothTransitions",
                          !settings.smoothTransitions
                        )
                      }
                    />
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                id="application-settings"
                title={t("settings.application")}
              >
                <div className="space-y-6">
                  <div
                    id="default-landing-page"
                    className="flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <Label>{t("settings.defaultLandingPage")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.defaultLandingPageDescription")}
                      </p>
                    </div>
                    <Select
                      value={settings.defaultOpenPage || "home"}
                      onValueChange={value =>
                        handleSettingChange("defaultOpenPage", value)
                      }
                    >
                      <SelectTrigger className="w-[180px] bg-background">
                        <SelectValue placeholder="Home" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="home">{t("common.home")}</SelectItem>
                        <SelectItem value="search">{t("common.search")}</SelectItem>
                        <SelectItem value="library">{t("common.library")}</SelectItem>
                        <SelectItem value="downloads">{t("common.downloads")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Only Windows exposes the automatic update preference. */}
                  {window.electron.getPlatform() === "win32" && (
                    <div id="auto-update" className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t("settings.ascendaraUpdates")}</Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.ascendaraUpdatesDescription2")}
                        </p>
                      </div>
                      <Switch
                        checked={settings.autoUpdate}
                        onCheckedChange={() =>
                          handleSettingChange("autoUpdate", !settings.autoUpdate)
                        }
                      />
                    </div>
                  )}

                  <div id="notifications" className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("settings.notifications")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.notificationsDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifications}
                      onCheckedChange={() =>
                        handleSettingChange("notifications", !settings.notifications)
                      }
                    />
                  </div>

                  <NotificationSoundSettings
                    settings={settings}
                    onSettingChange={handleSettingChange}
                  />

                  <div id="open-on-startup" className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("settings.openOnStartup")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.openOnStartupDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.openOnStartup}
                      onCheckedChange={() => {
                        const newValue = !settings.openOnStartup;
                        handleSettingChange("openOnStartup", newValue);
                        if (!newValue && settings.startMinimized) {
                          handleSettingChange("startMinimized", false);
                        }
                      }}
                    />
                  </div>

                  <div
                    id="start-minimized"
                    className={`flex items-center justify-between ${
                      !settings.openOnStartup ? "opacity-50" : ""
                    }`}
                  >
                    <div className="space-y-0.5">
                      <Label>{t("settings.startMinimized")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.startMinimizedDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.startMinimized}
                      disabled={!settings.openOnStartup}
                      onCheckedChange={() =>
                        handleSettingChange("startMinimized", !settings.startMinimized)
                      }
                    />
                  </div>

                  <div id="quick-launch" className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("settings.quickLaunch")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.quickLaunchDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={!settings.endOnClose}
                      onCheckedChange={() =>
                        handleSettingChange("endOnClose", !settings.endOnClose)
                      }
                    />
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                id="language"
                title={t("settings.languageSettings")}
                description={t("settings.languageSettingsDescription")}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-primary"
                    onClick={() => navigate("/extralanguages")}
                  >
                    <Languages className="h-4 w-4" />
                    {t("settings.selectMoreLanguages")}
                  </Button>
                }
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                    {availableLanguages.map(lang => (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => {
                          handleLanguageChange(lang.id);
                          changeLanguage(lang.id);
                        }}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all hover:bg-accent/50 ${
                          language === lang.id
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        }`}
                      >
                        <span className="text-xl leading-none">{lang.icon}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {lang.name}
                        </span>
                        <GameInfoLanguageBadge code={lang.id} />
                      </button>
                    ))}
                  </div>

                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    {t("settings.languageSetNote")}
                  </p>
                </div>
              </SettingsSection>
            </SettingsCategory>

            <SettingsCategory {...categoryProps("game-index")}>
              <GameIndexManager embedded view="index" />
            </SettingsCategory>

            <SettingsCategory {...categoryProps("debrid")}>
              <DebridSettings />
            </SettingsCategory>

            <SettingsCategory {...categoryProps("downloads")}>
              <SettingsSection
                id="download-manager"
                title={t("settings.downloaderSettings")}
                className="space-y-5"
              >
                {isDownloaderRunning && (
                  <div className="mb-6 flex items-center gap-2 rounded-md border border-red-400 bg-red-50 p-2 text-red-600 dark:text-red-500">
                    <CircleAlert size={14} />
                    <p className="text-sm">{t("settings.downloaderRunningWarning")}</p>
                  </div>
                )}
                {isOnWindows ? (
                  <div
                    id="exclude-folders"
                    className="mb-6 flex items-center justify-between"
                  >
                    <div className="space-y-2">
                      <Label>
                        {t("settings.excludeFolders")}{" "}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <CircleHelp className="mb-0.5 inline h-4 w-4 cursor-help text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="text-secondary">
                              {t("settings.excludeFoldersTooltip")}.{" "}
                              <a
                                className="cursor-pointer text-secondary hover:underline"
                                onClick={() =>
                                  window.electron.openURL(
                                    "https://ascendara.app/docs/features/overview#protecting-directories-from-windows-defender"
                                  )
                                }
                              >
                                {t("common.learnMore")}
                                <ExternalLink className="mb-1 ml-1 inline-block h-3 w-3" />
                              </a>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <p className="pr-2 text-sm text-muted-foreground">
                        {t("settings.excludeFoldersDescription")}
                      </p>
                    </div>
                    {exclusionLoading ? (
                      <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={settings.excludeFolders}
                        onCheckedChange={handleExclusionToggle}
                      />
                    )}
                  </div>
                ) : null}

                {/* Single Stream Download Toggle */}
                <div id="single-stream" className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="singleStream">
                      {t("settings.singleStream", "Single Stream Download")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "settings.singleStreamDescription",
                        "Use a single connection for downloads. More stable for large files but may be slower."
                      )}
                    </p>
                  </div>
                  <Switch
                    id="singleStream"
                    checked={settings.singleStream}
                    onCheckedChange={checked =>
                      handleSettingChange("singleStream", checked)
                    }
                    disabled={isDownloaderRunning}
                  />
                </div>

                {/* Download Threads Config */}
                <div
                  id="download-threads"
                  className={`space-y-2 ${settings.singleStream ? "opacity-50" : ""}`}
                >
                  <Label
                    htmlFor="threadCount"
                    className={
                      isDownloaderRunning || settings.singleStream ? "opacity-50" : ""
                    }
                  >
                    {t("settings.downloadThreads")}
                  </Label>
                  <p className="mb-4 text-sm font-normal text-muted-foreground">
                    {t("settings.downloadThreadsDescription")}
                  </p>
                  {settings.threadCount > 32 && !settings.singleStream && (
                    <div className="mb-4 flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
                      <CircleAlert size={14} />
                      <p className="text-sm">{t("settings.highThreadWarning")}</p>
                    </div>
                  )}

                  <div className="flex w-full justify-center">
                    <motion.div
                      className="mt-4 flex items-center space-x-4"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={
                          isDownloaderRunning ||
                          settings.singleStream ||
                          settings.threadCount <= 2
                        }
                        onClick={() => {
                          // For decrement, use the value we're going to
                          const currentValue = settings.threadCount;
                          let newValue;

                          if (currentValue > 48) newValue = 48;
                          else if (currentValue > 32) newValue = 32;
                          else if (currentValue > 24) newValue = 24;
                          else if (currentValue > 16) newValue = 16;
                          else if (currentValue > 12) newValue = 12;
                          else if (currentValue > 8) newValue = 8;
                          else if (currentValue > 6) newValue = 6;
                          else if (currentValue > 4) newValue = 4;
                          else newValue = 2;

                          handleSettingChange("threadCount", newValue);
                        }}
                        className="transition-transform hover:scale-105"
                      >
                        <ChevronLeft
                          className={`h-4 w-4 ${isDownloaderRunning ? "opacity-50" : ""}`}
                        />
                      </Button>
                      <motion.div
                        className={`relative flex min-w-[200px] flex-col items-center rounded-md border px-6 py-3 ${isDownloaderRunning ? "opacity-50" : ""}`}
                        layout
                      >
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={settings.threadCount || 4}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-2"
                          >
                            <span className="text-xl font-semibold">
                              {settings.threadCount || 4}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {t("settings.threads")}
                            </span>
                          </motion.div>
                        </AnimatePresence>
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={settings.threadCount || 4}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{ duration: 0.2, delay: 0.1 }}
                            className="mt-2"
                          >
                            <div
                              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                              style={{
                                background:
                                  settings.threadCount < 8
                                    ? "rgba(148, 163, 184, 0.1)" // Low
                                    : settings.threadCount <= 24
                                      ? "rgba(34, 197, 94, 0.1)" // Normal
                                      : settings.threadCount <= 32
                                        ? "rgba(59, 130, 246, 0.1)" // High
                                        : settings.threadCount <= 48
                                          ? "rgba(249, 115, 22, 0.1)" // Very High
                                          : "rgba(239, 68, 68, 0.1)", // Extreme
                                color:
                                  settings.threadCount < 8
                                    ? "rgb(148, 163, 184)" // Low
                                    : settings.threadCount <= 24
                                      ? "rgb(34, 197, 94)" // Normal
                                      : settings.threadCount <= 32
                                        ? "rgb(59, 130, 246)" // High
                                        : settings.threadCount <= 48
                                          ? "rgb(249, 115, 22)" // Very High
                                          : "rgb(239, 68, 68)", // Extreme
                              }}
                            >
                              {settings.threadCount < 8 && (
                                <>
                                  <BatteryLow className="h-3.5 w-3.5" />
                                  {t("settings.downloadThreadsPresets.low")}
                                </>
                              )}
                              {settings.threadCount >= 8 &&
                                settings.threadCount <= 24 && (
                                  <>
                                    <Battery className="h-3.5 w-3.5" />
                                    {t("settings.downloadThreadsPresets.normal")}
                                  </>
                                )}
                              {settings.threadCount > 24 &&
                                settings.threadCount <= 32 && (
                                  <>
                                    <BatteryMedium className="h-3.5 w-3.5" />
                                    {t("settings.downloadThreadsPresets.high")}
                                  </>
                                )}
                              {settings.threadCount > 32 &&
                                settings.threadCount <= 48 && (
                                  <>
                                    <BatteryFull className="h-3.5 w-3.5" />
                                    {t("settings.downloadThreadsPresets.veryHigh")}
                                  </>
                                )}
                              {settings.threadCount > 48 && (
                                <>
                                  <Zap className="h-3.5 w-3.5" />
                                  {t("settings.downloadThreadsPresets.extreme")}
                                </>
                              )}
                            </div>
                          </motion.div>
                        </AnimatePresence>
                      </motion.div>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={
                          isDownloaderRunning ||
                          settings.singleStream ||
                          settings.threadCount >= 64
                        }
                        onClick={() => {
                          // For increment, use the value we're coming from
                          const currentValue = settings.threadCount;
                          let newValue;

                          if (currentValue >= 48) newValue = 64;
                          else if (currentValue >= 32) newValue = 48;
                          else if (currentValue >= 24) newValue = 32;
                          else if (currentValue >= 16) newValue = 24;
                          else if (currentValue >= 12) newValue = 16;
                          else if (currentValue >= 8) newValue = 12;
                          else if (currentValue >= 6) newValue = 8;
                          else if (currentValue >= 4) newValue = 6;
                          else newValue = 4;

                          handleSettingChange("threadCount", newValue);
                        }}
                        className="transition-transform hover:scale-105"
                      >
                        <ChevronRight
                          className={`h-4 w-4 ${isDownloaderRunning ? "opacity-50" : ""}`}
                        />
                      </Button>
                    </motion.div>
                  </div>
                  {/* Custom thread count input */}
                  {settings.threadCount === 0 && (
                    <div className="mt-4">
                      <Label>{t("settings.customThreadCount")}</Label>
                      <Input
                        type="number"
                        min="4"
                        max="64"
                        value={4}
                        onChange={e => {
                          const value = Math.max(
                            4,
                            Math.min(64, parseInt(e.target.value) || 4)
                          );
                          handleSettingChange("threadCount", value);
                        }}
                        className="mt-1"
                      />
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("settings.customThreadCountDesc")}
                      </p>
                    </div>
                  )}
                </div>

                <div id="post-download-behavior" className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Label>{t("settings.behaviorAfterDownload")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.behaviorAfterDownloadDescription")}
                      </p>
                    </div>
                    <Select
                      value={settings.behaviorAfterDownload || "none"}
                      onValueChange={value =>
                        handleSettingChange("behaviorAfterDownload", value)
                      }
                    >
                      <SelectTrigger className="w-[180px] bg-background">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t("settings.behaviors.none")}
                        </SelectItem>
                        <SelectItem value="lock">
                          {t("settings.behaviors.lock")}
                        </SelectItem>
                        <SelectItem value="sleep">
                          {t("settings.behaviors.sleep")}
                        </SelectItem>
                        <SelectItem value="shutdown">
                          {t("settings.behaviors.shutdown")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Download Speed Limit Section */}
                <div id="download-limit" className="space-y-2">
                  <Label
                    htmlFor="downloadLimit"
                    className={isDownloaderRunning ? "opacity-50" : ""}
                  >
                    {t("settings.downloadLimit")}
                  </Label>
                  <p className="mb-4 text-sm font-normal text-muted-foreground">
                    {t("settings.downloadLimitDescription")}
                  </p>
                  <DownloadLimitSelector
                    downloadLimit={settings.downloadLimit}
                    isDownloaderRunning={isDownloaderRunning}
                    onChange={value => handleSettingChange("downloadLimit", value)}
                    t={t}
                  />
                </div>
              </SettingsSection>

              <SettingsSection
                id="download-locations"
                title={t("settings.downloadLocationsTitle")}
                className="space-y-5"
              >
                <div id="download-directory">
                  <div className="mb-4">
                    <Label
                      htmlFor="defaultDownloadPath"
                      className={isDownloaderRunning ? "opacity-50" : ""}
                    >
                      {t("settings.defaultDownloadLocation")}
                    </Label>
                    {!canCreateFiles && (
                      <div className="mt-1 flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
                        <ShieldAlert size={16} />
                        <p className="text-sm font-medium">
                          {t("settings.downloadLocationWarning")}
                        </p>
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Input
                        id="defaultDownloadPath"
                        disabled={isDownloaderRunning}
                        value={downloadPath}
                        readOnly
                        className="flex-1"
                      />
                      <Button
                        disabled={isDownloaderRunning}
                        className="shrink-0 text-secondary"
                        onClick={handleDirectorySelect}
                      >
                        {t("settings.selectDirectory")}
                      </Button>
                    </div>
                  </div>

                  {/* Additional Download Paths Section */}
                  <div
                    id="additional-locations"
                    className="border-t border-border/50 pt-6"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <Label className={isDownloaderRunning ? "opacity-50" : ""}>
                        {t("settings.additionalLocations")}
                      </Label>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDownloaderRunning}
                        onClick={handleAddLocationSelect}
                        className="h-8"
                      >
                        <Plus size={16} className="mr-1" />
                        {t("settings.addLocation")}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {settings.additionalDirectories?.length === 0 ? (
                        <p
                          className={`text-sm italic text-muted-foreground ${isDownloaderRunning ? "opacity-50" : ""}`}
                        >
                          {t("settings.noAdditionalLocations")}
                        </p>
                      ) : (
                        settings.additionalDirectories?.map((path, index) => (
                          <div key={index} className="rounded-md bg-accent/30 p-2">
                            <div className="group flex items-center gap-2">
                              <FolderOpen
                                size={16}
                                className={`shrink-0 text-muted-foreground ${isDownloaderRunning ? "opacity-50" : ""}`}
                              />
                              <span
                                className={`flex-1 truncate text-sm ${isDownloaderRunning ? "opacity-50" : ""}`}
                                title={path}
                              >
                                {path}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isDownloaderRunning}
                                onClick={() => {
                                  const newPaths = [...settings.additionalDirectories];
                                  newPaths.splice(index, 1);
                                  handleSettingChange("additionalDirectories", newPaths);
                                }}
                                className={`h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 ${isDownloaderRunning ? "opacity-50" : ""}`}
                              >
                                <X size={16} />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection id="torrent-downloads">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="mb-0 text-lg font-semibold tracking-tight text-foreground">
                      {t("settings.torrenting")}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      {t("settings.torrentingDescription")}
                    </p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Switch
                            checked={settings.torrentEnabled}
                            onCheckedChange={handleTorrentToggle}
                            disabled={localTorrentRequiredBySource}
                          />
                        </div>
                      </TooltipTrigger>
                      {localTorrentRequiredBySource ? (
                        <TooltipContent>
                          <p className="text-secondary">
                            {t("settings.torrentRequiredBySource") ||
                              "Your selected external source requires torrenting."}
                          </p>
                        </TooltipContent>
                      ) : null}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {localTorrentRequiredBySource && (
                  <div className="mb-4 rounded-md border border-orange-500/30 bg-orange-500/5 p-3 text-xs text-orange-700 dark:text-orange-300">
                    {(
                      t("settings.torrentLockedBySourceNote") ||
                      "Torrenting can't be disabled while {{name}} is selected - some of its torrent links require Ascendara's local torrent client. Change the external source in Local Refresh first."
                    ).replace(
                      "{{name}}",
                      settings.customSource?.name || "this external source"
                    )}
                  </div>
                )}
              </SettingsSection>
            </SettingsCategory>

            <SettingsCategory {...categoryProps("gaming")}>
              <SettingsSection id="gaming-settings">
                <div className="space-y-6">
                  <div id="discord-rpc" className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("settings.discordRPC")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.discordRPCDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.rpcEnabled}
                      onCheckedChange={() =>
                        handleSettingChange("rpcEnabled", !settings.rpcEnabled)
                      }
                    />
                  </div>

                  <div
                    id="hide-on-game-launch"
                    className="flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <Label>{t("settings.hideOnGameLaunch")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.hideOnGameLaunchDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.hideOnGameLaunch}
                      onCheckedChange={() =>
                        handleSettingChange(
                          "hideOnGameLaunch",
                          !settings.hideOnGameLaunch
                        )
                      }
                    />
                  </div>

                  <div id="mature-content" className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("settings.matureContent")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.matureContentDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.seeInappropriateContent}
                      onCheckedChange={() =>
                        handleSettingChange(
                          "seeInappropriateContent",
                          !settings.seeInappropriateContent
                        )
                      }
                    />
                  </div>

                  {isOnWindows && (
                    <div
                      id="auto-create-shortcuts"
                      className="flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <Label>{t("settings.autoCreateShortcuts")}</Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.autoCreateShortcutsDescription")}
                        </p>
                      </div>
                      <Switch
                        checked={settings.autoCreateShortcuts}
                        onCheckedChange={() =>
                          handleSettingChange(
                            "autoCreateShortcuts",
                            !settings.autoCreateShortcuts
                          )
                        }
                      />
                    </div>
                  )}

                  <div
                    id="prompt-game-support"
                    className="flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <Label>{t("settings.promptGameSupport")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.promptGameSupportDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.promptPurchaseAfter3Hours}
                      onCheckedChange={() =>
                        handleSettingChange(
                          "promptPurchaseAfter3Hours",
                          !settings.promptPurchaseAfter3Hours
                        )
                      }
                    />
                  </div>

                  <div
                    id="extra-game-options"
                    className="flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <Label>{t("settings.extraGameOptions")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.extraGameOptionsDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.extraGameOptions}
                      onCheckedChange={() =>
                        handleSettingChange(
                          "extraGameOptions",
                          !settings.extraGameOptions
                        )
                      }
                    />
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                id="big-picture-settings"
                title={t("settings.bigPictureSettings")}
                className="space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className={`shrink-0 rounded-full p-2 ${controllerConnected ? "bg-green-500/15" : "bg-muted"}`}
                    >
                      <Gamepad2
                        className={`h-5 w-5 ${controllerConnected ? "text-green-500" : "text-muted-foreground"}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {controllerConnected
                          ? t("settings.controllerConnected")
                          : t("settings.noControllerDetected")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {controllerConnected
                          ? t("settings.controllerConnectedDescription")
                          : t("settings.noControllerDetectedDescription")}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => navigate("/bigpicture")}
                    className="gap-2 text-secondary"
                  >
                    <MonitorPlay className="h-4 w-4" />
                    {t("settings.enterBigPicture")}
                  </Button>
                </div>

                <div
                  id="controller-type"
                  className="flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-0.5">
                    <Label>{t("settings.controllerType")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.controllerTypeDescription")}
                    </p>
                  </div>
                  <Select
                    value={settings.controllerType || "xbox"}
                    onValueChange={value => handleSettingChange("controllerType", value)}
                  >
                    <SelectTrigger className="w-[150px] shrink-0 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="xbox">Xbox</SelectItem>
                      <SelectItem value="playstation">PlayStation</SelectItem>
                      <SelectItem value="generic">Generic</SelectItem>
                      <SelectItem value="keyboard">Keyboard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div
                  id="big-picture-sounds"
                  className="flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-0.5">
                    <Label>{t("settings.bigPictureSounds")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.bigPictureSoundsDescription")}
                    </p>
                  </div>
                  <Switch
                    checked={settings.bigPictureSounds !== false}
                    onCheckedChange={() =>
                      handleSettingChange(
                        "bigPictureSounds",
                        settings.bigPictureSounds === false
                      )
                    }
                  />
                </div>

                <div
                  id="keyboard-layout"
                  className="flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-0.5">
                    <Label>{t("settings.keyboardLayout")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.keyboardLayoutDescription")}
                    </p>
                  </div>
                  <Select
                    value={settings.bigPictureKeyboardLayout || "qwerty"}
                    onValueChange={value =>
                      handleSettingChange("bigPictureKeyboardLayout", value)
                    }
                  >
                    <SelectTrigger className="w-[150px] shrink-0 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qwerty">QWERTY</SelectItem>
                      <SelectItem value="azerty">AZERTY</SelectItem>
                      <SelectItem value="qwertz">QWERTZ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </SettingsSection>

              {/* Achievement Watcher Directories */}
              <SettingsSection
                id="achievement-watcher"
                title={
                  t("settings.achievementWatcher.title") ||
                  "Achievement Watcher Directories"
                }
                description={
                  t("settings.achievementWatcher.description") ||
                  "Configure which directories are monitored for achievement tracking. Add folders where your games are installed to enable achievement tracking for those games."
                }
              >
                {/* Default Directories Section */}
                {isOnWindows && (
                  <div className="mb-6">
                    <p className="mb-2 text-sm font-medium text-foreground">
                      {t("settings.achievementWatcher.defaultDirs") ||
                        "Default directories always tracked:"}
                    </p>
                    <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50 bg-muted/20">
                      {[
                        "Public/Documents/Steam/CODEX",
                        "Public/Documents/Steam/RUNE",
                        "Public/Documents/EMPRESS",
                        "Public/Documents/OnlineFix",
                        "AppData/Roaming/GSE Saves",
                        "AppData/Roaming/Steam/CODEX",
                        "AppData/Roaming/EMPRESS",
                        "AppData/Roaming/Goldberg SteamEmu Saves",
                        "AppData/Roaming/SmartSteamEmu",
                        "ProgramData/Steam",
                        "LocalAppData/SKIDROW",
                      ].map(dir => (
                        <li
                          key={dir}
                          className="flex min-w-0 items-center gap-2 px-3 py-1.5 font-mono text-xs text-muted-foreground"
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate" title={dir}>
                            {dir}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("settings.achievementWatcher.defaultDirsNote") ||
                        "These directories and files are always tracked by default and cannot be removed."}
                    </p>
                  </div>
                )}
                <div className="space-y-3">
                  {/* List user-added directories */}
                  {settings.watchingFolders && settings.watchingFolders.length > 0 ? (
                    <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50">
                      {settings.watchingFolders.map((dir, idx) => (
                        <li
                          key={dir}
                          className="flex min-w-0 items-center gap-2 py-1 pl-3 pr-1"
                        >
                          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate text-sm" title={dir}>
                            {dir}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground"
                            aria-label={
                              t("settings.achievementWatcher.removeDir") ||
                              "Remove directory"
                            }
                            onClick={() => {
                              setSettings(prev => ({
                                ...prev,
                                watchingFolders: prev.watchingFolders.filter(
                                  (d, i) => i !== idx
                                ),
                              }));
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {t("settings.achievementWatcher.noDirs") ||
                        "No directories added yet."}
                    </div>
                  )}
                  {/* Add new directory */}
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={async () => {
                      const directory = await window.electron.openDirectoryDialog();
                      if (directory) {
                        const currentFolders = settings.watchingFolders || [];
                        if (currentFolders.includes(directory)) {
                          toast.error(
                            t("settings.achievementWatcher.duplicateDir") ||
                              "This directory is already being watched."
                          );
                          return;
                        }
                        setSettings(prev => ({
                          ...prev,
                          watchingFolders: [...currentFolders, directory],
                        }));
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    {t("settings.achievementWatcher.addDir") || "Add Directory"}
                  </Button>
                </div>
                <AchievementFolderSearch />
              </SettingsSection>
            </SettingsCategory>

            <SettingsCategory {...categoryProps("backups")}>
              <SettingsSection id="ludusavi" title={t("settings.gameBackup.title")}>
                <div>
                  <div>
                    <div>
                      {/* Backup Location */}
                      <div id="backup-directory" className="mt-2 space-y-2">
                        <Label>{t("settings.gameBackup.backupLocation")}</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder={t("settings.gameBackup.selectDirectory")}
                            className="flex-1"
                            value={settings.ludusavi.backupLocation}
                            readOnly
                          />
                          <Button
                            className="text-secondary"
                            onClick={e => {
                              handleDirectoryChangeBackups(e);
                            }}
                          >
                            {t("settings.selectDirectory")}
                          </Button>
                        </div>
                      </div>
                      {!settings.ludusavi.backupLocation && (
                        <div className="mt-2 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-primary" />
                          <p className="text-sm text-primary">
                            {t("settings.gameBackup.selectLocationToEnable")}
                          </p>
                        </div>
                      )}
                      <div className="mt-4 flex items-center justify-between">
                        <div
                          className={`space-y-2 ${!settings.ludusavi.backupLocation ? "pointer-events-none opacity-50" : ""}`}
                        >
                          <Label>{t("settings.gameBackup.title")}</Label>
                          <p className="text-sm text-muted-foreground">
                            {t("settings.gameBackup.description")}&nbsp;
                            <a
                              onClick={() =>
                                window.electron.openURL(
                                  "https://ascendara.app/docs/features/game-backups"
                                )
                              }
                              className="cursor-pointer text-primary hover:underline"
                            >
                              {t("common.learnMore")}
                              <ExternalLink className="mb-1 ml-1 inline-block h-3 w-3" />
                            </a>
                          </p>
                        </div>
                        <Switch
                          checked={settings.ludusavi.enabled}
                          onCheckedChange={value => {
                            handleToggleLudusavi(value);
                          }}
                          disabled={!settings.ludusavi.backupLocation}
                        />
                      </div>
                    </div>
                  </div>
                  <div
                    className={`mt-6 space-y-6 ${!settings.ludusavi.enabled ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <Label>{t("settings.gameBackup.skipManifestCheck")}</Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.gameBackup.skipManifestCheckDesc")}&nbsp;
                        </p>
                      </div>
                      <Switch
                        checked={settings.ludusavi.backupOptions.skipManifestCheck}
                        onCheckedChange={value => {
                          setSettings(prev => ({
                            ...prev,
                            ludusavi: {
                              ...prev.ludusavi,
                              backupOptions: {
                                ...prev.ludusavi.backupOptions,
                                skipManifestCheck: value,
                              },
                            },
                          }));
                        }}
                      />
                    </div>
                    <div className="space-y-4">
                      {/* Backup Format */}
                      <div className="space-y-2">
                        <Label>{t("settings.gameBackup.backupFormat")}</Label>
                        <Select
                          value={settings.ludusavi.backupFormat}
                          onValueChange={value => {
                            setSettings(prev => ({
                              ...prev,
                              ludusavi: {
                                ...prev.ludusavi,
                                backupFormat: value,
                              },
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="zip">
                              {t("settings.gameBackup.formatZip")}
                            </SelectItem>
                            <SelectItem value="simple">
                              {t("settings.gameBackup.formatSimple")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Backup Options */}
                    <div className="space-y-4">
                      {/* Number of Backups */}
                      <div className="space-y-2">
                        <Label>{t("settings.gameBackup.backupsToKeep")}</Label>
                        <Select
                          value={settings.ludusavi.backupOptions.backupsToKeep.toString()}
                          onValueChange={value => {
                            setSettings(prev => ({
                              ...prev,
                              ludusavi: {
                                ...prev.ludusavi,
                                backupOptions: {
                                  ...prev.ludusavi.backupOptions,
                                  backupsToKeep: parseInt(value),
                                },
                              },
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">
                              {t("settings.gameBackup.backupsCount.three")}
                            </SelectItem>
                            <SelectItem value="5">
                              {t("settings.gameBackup.backupsCount.five")}
                            </SelectItem>
                            <SelectItem value="10">
                              {t("settings.gameBackup.backupsCount.ten")}
                            </SelectItem>
                            <SelectItem value="custom">
                              {t("settings.gameBackup.backupsCount.custom")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Compression Settings */}
                      <div className="space-y-2">
                        <Label>{t("settings.gameBackup.compressionLevel")}</Label>
                        <Select
                          value={settings.ludusavi.backupOptions.compressionLevel}
                          onValueChange={value => {
                            setSettings(prev => ({
                              ...prev,
                              ludusavi: {
                                ...prev.ludusavi,
                                backupOptions: {
                                  ...prev.ludusavi.backupOptions,
                                  compressionLevel: value,
                                },
                              },
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">
                              {t("settings.gameBackup.compressionNone")}
                            </SelectItem>
                            <SelectItem value="deflate">
                              {t("settings.gameBackup.compressionDeflate")}
                            </SelectItem>
                            <SelectItem value="bzip2">
                              {t("settings.gameBackup.compressionBzip2")}
                            </SelectItem>
                            <SelectItem value="zstd">
                              {t("settings.gameBackup.compressionZstd")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                id="library-transfer"
                title={t("settings.libraryTransfer.title")}
                description={t("settings.libraryTransfer.description")}
              >
                <LibraryTransferSettings />
              </SettingsSection>
            </SettingsCategory>

            {isOnMac && (
              <SettingsCategory {...categoryProps("compatibility")}>
                <SettingsSection id="compatibility-layer">
                  <HighballSettings />
                </SettingsSection>
              </SettingsCategory>
            )}

            {isOnLinux && (
              <SettingsCategory {...categoryProps("compatibility")}>
                {/* ── Linux Compatibility Layer ── */}
                {isOnLinux && (
                  <>
                    <SettingsSection
                      id="compatibility-layer"
                      title={t("welcome.compatibilityLayer")}
                      description={t("settings.linuxCompat.description")}
                    >
                      <div className="space-y-6">
                        {/* Runner Selection */}
                        <div className="space-y-3">
                          <label className="text-sm font-medium">
                            {t("settings.linuxCompat.defaultRunner")}
                          </label>
                          <Select
                            value={selectedRunner}
                            onValueChange={async value => {
                              setSelectedRunner(value);
                              await window.electron.updateSetting("linuxRunner", value);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">
                                {t("settings.linuxCompat.autoDetect")}
                              </SelectItem>
                              {runners.map(r => (
                                <SelectItem key={r.path} value={r.path}>
                                  {r.name} (
                                  {r.source === "steam"
                                    ? t("settings.linuxCompat.sourceSteam")
                                    : r.source === "custom"
                                      ? t("settings.linuxCompat.sourceCustom")
                                      : t("settings.linuxCompat.sourceSystem")}
                                  ){r.version ? ` — v${r.version}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {(() => {
                            let activeRunnerName = "";
                            if (selectedRunner === "auto") {
                              activeRunnerName = runners[0]?.name?.toLowerCase() || "";
                            } else {
                              activeRunnerName = (
                                selectedRunner.split("/").pop() || ""
                              ).toLowerCase();
                            }
                            const runnerType = activeRunnerName.includes("cachyos")
                              ? "cachyos"
                              : activeRunnerName.includes("ge-proton") ||
                                  activeRunnerName.includes("proton-ge")
                                ? "ge"
                                : null;

                            if (!runnerType) return null;

                            return (
                              <Button
                                size="sm"
                                className="gap-2 text-secondary"
                                onClick={() => setProtonOptionsOpen(true)}
                              >
                                <SquareTerminal className="h-4 w-4" />
                                {t("settings.linuxCompat.viewProtonOptions")}
                              </Button>
                            );
                          })()}
                        </div>

                        {/* Detected Runners List */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">
                            {t("settings.linuxCompat.detectedRunners")}
                          </h4>
                          {runners.length === 0 ? (
                            <p className="text-sm text-yellow-500">
                              {t("settings.linuxCompat.noRunnersWarning")}
                            </p>
                          ) : (
                            <ul className="space-y-1">
                              {runners.map(r => (
                                <li
                                  key={r.path}
                                  className="flex items-center gap-2 text-sm text-muted-foreground"
                                >
                                  <span
                                    className={`h-2 w-2 rounded-full ${
                                      r.source === "steam"
                                        ? "bg-blue-500"
                                        : r.source === "custom"
                                          ? "bg-purple-500"
                                          : "bg-green-500"
                                    }`}
                                  />
                                  <span className="text-foreground">{r.name}</span>
                                  <span>({r.source})</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-3">
                          {/* Download / Update Proton-CachyOS */}
                          <Button
                            onClick={async () => {
                              try {
                                const info = await window.electron.getProtonCachyOSInfo();
                                if (!info.success) {
                                  console.error(
                                    "Failed to get Proton-CachyOS info:",
                                    info.error
                                  );
                                  return;
                                }
                                if (info.alreadyInstalled) {
                                  const updated = await window.electron.getRunners();
                                  setRunners(updated);
                                  return;
                                }
                                setProtonCachyInfo(info);
                                setShowProtonCachyConfirm(true);
                              } catch (e) {
                                console.error("Failed to get Proton-CachyOS info:", e);
                              }
                            }}
                            disabled={isDownloadingProtonCachy}
                            className="gap-2 text-secondary"
                          >
                            {isDownloadingProtonCachy ? (
                              <>
                                <Loader className="h-4 w-4 animate-spin" />
                                {t("settings.linuxCompat.downloading")}
                              </>
                            ) : (
                              <>
                                <Download className="h-4 w-4" />
                                {runners.some(r =>
                                  r.name.toLowerCase().includes("cachyos")
                                )
                                  ? t("settings.linuxCompat.updateProtonCachy")
                                  : t("settings.linuxCompat.downloadProtonCachy")}
                              </>
                            )}
                          </Button>

                          {/* Check for Updates (CachyOS) */}
                          <Button
                            variant="outline"
                            onClick={async () => {
                              setProtonCachyUpdateStatus("checking");
                              try {
                                const info =
                                  await window.electron.checkProtonCachyOSUpdate();
                                if (!info.success) {
                                  setProtonCachyUpdateStatus(null);
                                  return;
                                }
                                if (info.alreadyInstalled) {
                                  setProtonCachyUpdateStatus("up-to-date");
                                } else if (info.updateAvailable) {
                                  setProtonCachyUpdateStatus("update-available");
                                  setProtonCachyInfo(info);
                                } else {
                                  setProtonCachyUpdateStatus(null);
                                }
                              } catch (e) {
                                console.error("Failed to check for updates:", e);
                                setProtonCachyUpdateStatus(null);
                              }
                            }}
                            disabled={protonCachyUpdateStatus === "checking"}
                            className="gap-2"
                          >
                            {protonCachyUpdateStatus === "checking" ? (
                              <>
                                <Loader className="h-4 w-4 animate-spin" />
                                {t("settings.linuxCompat.checking")}
                              </>
                            ) : (
                              <>
                                <FolderSync className="h-4 w-4" />
                                {t("settings.linuxCompat.checkForUpdates")}
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Update Status Message */}
                        {protonCachyUpdateStatus === "up-to-date" && (
                          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                            <FileCheck2 className="h-4 w-4 text-green-500" />
                            <p className="text-sm text-green-500">
                              {t("settings.linuxCompat.upToDate")}
                            </p>
                          </div>
                        )}

                        {protonCachyUpdateStatus === "update-available" &&
                          protonCachyInfo && (
                            <div className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                <p className="text-sm text-yellow-500">
                                  <SafeHtml
                                    html={t("settings.linuxCompat.updateAvailable", {
                                      version: protonCachyInfo.latestVersion,
                                    })}
                                    style={{ display: "inline" }}
                                  />
                                  {protonCachyInfo.installedVersions.length > 0 && (
                                    <span className="text-yellow-500/70">
                                      {" "}
                                      {t("settings.linuxCompat.updateAvailableCurrent", {
                                        version: protonCachyInfo.installedVersions[0],
                                      })}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => setShowProtonCachyConfirm(true)}
                                className="gap-1"
                              >
                                <Download className="h-3 w-3" />
                                {t("settings.linuxCompat.update")}
                              </Button>
                            </div>
                          )}

                        {/* Advanced options: Proton-GE alternative */}
                        <details className="group rounded-lg border border-border bg-muted/30">
                          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
                            {t("settings.linuxCompat.advancedOptions")}
                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                          </summary>
                          <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
                            <p className="w-full text-xs text-muted-foreground">
                              {t("settings.linuxCompat.protonGEAltDescription")}
                            </p>

                            {/* Download / Update Proton-GE */}
                            <Button
                              onClick={async () => {
                                try {
                                  const info = await window.electron.getProtonGEInfo();
                                  if (!info.success) {
                                    console.error(
                                      "Failed to get Proton-GE info:",
                                      info.error
                                    );
                                    return;
                                  }
                                  if (info.alreadyInstalled) {
                                    const updated = await window.electron.getRunners();
                                    setRunners(updated);
                                    return;
                                  }
                                  setProtonGEInfo(info);
                                  setShowProtonGEConfirm(true);
                                } catch (e) {
                                  console.error("Failed to get Proton-GE info:", e);
                                }
                              }}
                              disabled={isDownloadingProtonGE}
                              className="gap-2 text-secondary"
                            >
                              {isDownloadingProtonGE ? (
                                <>
                                  <Loader className="h-4 w-4 animate-spin" />
                                  {t("settings.linuxCompat.downloading")}
                                </>
                              ) : (
                                <>
                                  <Download className="h-4 w-4" />
                                  {runners.some(r =>
                                    r.name.toLowerCase().includes("ge-proton")
                                  )
                                    ? t("settings.linuxCompat.updateProtonGE")
                                    : t("settings.linuxCompat.downloadProtonGE")}
                                </>
                              )}
                            </Button>

                            {/* Check for Updates (GE) */}
                            <Button
                              variant="outline"
                              onClick={async () => {
                                setProtonGEUpdateStatus("checking");
                                try {
                                  const info =
                                    await window.electron.checkProtonGEUpdate();
                                  if (!info.success) {
                                    setProtonGEUpdateStatus(null);
                                    return;
                                  }
                                  if (info.alreadyInstalled) {
                                    setProtonGEUpdateStatus("up-to-date");
                                  } else if (info.updateAvailable) {
                                    setProtonGEUpdateStatus("update-available");
                                    setProtonGEInfo(info);
                                  } else {
                                    setProtonGEUpdateStatus(null);
                                  }
                                } catch (e) {
                                  console.error("Failed to check for GE updates:", e);
                                  setProtonGEUpdateStatus(null);
                                }
                              }}
                              disabled={protonGEUpdateStatus === "checking"}
                              className="gap-2"
                            >
                              {protonGEUpdateStatus === "checking" ? (
                                <>
                                  <Loader className="h-4 w-4 animate-spin" />
                                  {t("settings.linuxCompat.checking")}
                                </>
                              ) : (
                                <>
                                  <FolderSync className="h-4 w-4" />
                                  {t("settings.linuxCompat.checkForUpdates")}
                                </>
                              )}
                            </Button>

                            {protonGEUpdateStatus === "up-to-date" && (
                              <div className="flex w-full items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                                <FileCheck2 className="h-4 w-4 text-green-500" />
                                <p className="text-sm text-green-500">
                                  {t("settings.linuxCompat.upToDate")}
                                </p>
                              </div>
                            )}

                            {protonGEUpdateStatus === "update-available" &&
                              protonGEInfo && (
                                <div className="flex w-full items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                    <p className="text-sm text-yellow-500">
                                      <SafeHtml
                                        html={t("settings.linuxCompat.updateAvailable", {
                                          version: protonGEInfo.latestVersion,
                                        })}
                                        style={{ display: "inline" }}
                                      />
                                      {protonGEInfo.installedVersions.length > 0 && (
                                        <span className="text-yellow-500/70">
                                          {" "}
                                          {t(
                                            "settings.linuxCompat.updateAvailableCurrent",
                                            {
                                              version: protonGEInfo.installedVersions[0],
                                            }
                                          )}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => setShowProtonGEConfirm(true)}
                                    className="gap-1"
                                  >
                                    <Download className="h-3 w-3" />
                                    {t("settings.linuxCompat.update")}
                                  </Button>
                                </div>
                              )}
                          </div>
                        </details>

                        {/* Info Box */}
                        <div className="rounded-lg border border-border bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">
                            <strong>Proton</strong>{" "}
                            {t("settings.linuxCompat.infoBoxProton")}{" "}
                            <strong>Wine</strong> {t("settings.linuxCompat.infoBoxWine")}
                          </p>
                        </div>
                      </div>
                      {/* ── UMU Section ── */}
                      <div className="space-y-4 border-t border-border pt-6">
                        <h4 className="text-sm font-medium text-foreground">
                          UMU Launcher & UMU-Proton
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.linuxCompat.infoBoxUmuLauncher")}
                        </p>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {/* UMU Launcher */}
                          <div className="space-y-3 border-l-2 border-border pl-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">UMU Launcher</span>
                              {umuInstalled ? (
                                <span className="flex items-center gap-1 rounded bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-600">
                                  <FileCheck2 className="h-3 w-3" />{" "}
                                  {t("common.installed")}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-500">
                                  <AlertTriangle className="h-3 w-3" />{" "}
                                  {t("common.missing")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("settings.linuxCompat.umuRequired")}
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                disabled={isDownloadingUmuLauncher}
                                className="gap-1 text-secondary"
                                onClick={async () => {
                                  setIsDownloadingUmuLauncher(true);
                                  try {
                                    const result =
                                      await window.electron.downloadUmuLauncher();
                                    if (result.success) {
                                      setUmuInstalled(true);
                                      toast.success(
                                        t(
                                          "settings.linuxCompat.umu.launcher.installSuccess"
                                        )
                                      );
                                    } else {
                                      toast.error(
                                        t(
                                          "settings.linuxCompat.umu.launcher.installFailed"
                                        ) +
                                          ": " +
                                          (result.error || result.message)
                                      );
                                    }
                                  } catch (e) {
                                    toast.error(
                                      t("settings.linuxCompat.umu.launcher.installError")
                                    );
                                  }
                                  setIsDownloadingUmuLauncher(false);
                                }}
                              >
                                {isDownloadingUmuLauncher ? (
                                  <>
                                    <Loader className="h-3 w-3 animate-spin" />{" "}
                                    {t("common.installing")}
                                  </>
                                ) : umuInstalled ? (
                                  <>
                                    <RefreshCw className="h-3 w-3" />{" "}
                                    {t("settings.linuxCompat.reinstallUpdate")}
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-3 w-3" /> {t("common.install")}
                                  </>
                                )}
                              </Button>
                              <button
                                onClick={() =>
                                  window.electron.openURL(
                                    "https://github.com/Open-Wine-Components/umu-launcher"
                                  )
                                }
                                className="text-xs text-muted-foreground underline hover:text-primary"
                              >
                                GitHub
                              </button>
                            </div>
                          </div>

                          {/* UMU Proton */}
                          <div className="space-y-3 border-l-2 border-border pl-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">UMU-Proton</span>
                              {umuProtonInfo?.alreadyInstalled ? (
                                <span className="flex items-center gap-1 rounded bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-600">
                                  <FileCheck2 className="h-3 w-3" /> {umuProtonInfo.name}
                                </span>
                              ) : umuProtonInfo?.updateAvailable ? (
                                <span className="flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-500">
                                  <FolderSync className="h-3 w-3" />{" "}
                                  {t("settings.linuxCompat.updateAvailableUmu")}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                  {t("settings.linuxCompat.notInstalled")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("settings.linuxCompat.infoBoxUmuProton")}
                              {umuProtonInfo?.sizeFormatted &&
                                ` Latest: ${umuProtonInfo.name} (${umuProtonInfo.sizeFormatted})`}
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                disabled={isDownloadingUmuProton}
                                className="gap-1 text-secondary"
                                onClick={async () => {
                                  setIsDownloadingUmuProton(true);
                                  setUmuProtonUpdateStatus(null);
                                  try {
                                    const result =
                                      await window.electron.downloadUmuProton();
                                    if (result.success) {
                                      toast.success(
                                        t(
                                          "settings.linuxCompat.umu.proton.installSuccess",
                                          {
                                            name: result.name,
                                          }
                                        )
                                      );
                                      const updated = await window.electron.getRunners();
                                      setRunners(updated);
                                      const info =
                                        await window.electron.getUmuProtonInfo();
                                      if (info?.success) setUmuProtonInfo(info);
                                    } else {
                                      toast.error(
                                        t(
                                          "settings.linuxCompat.umu.proton.installFailed",
                                          {
                                            message: result.message || "Unknown error",
                                          }
                                        )
                                      );
                                    }
                                  } catch (e) {
                                    toast.error(
                                      t("settings.linuxCompat.umu.proton.installError")
                                    );
                                  }
                                  setIsDownloadingUmuProton(false);
                                }}
                              >
                                {isDownloadingUmuProton ? (
                                  <>
                                    <Loader className="h-3 w-3 animate-spin" />{" "}
                                    {t("common.installing")}
                                  </>
                                ) : umuProtonInfo?.alreadyInstalled ? (
                                  <>
                                    <FolderSync className="h-3 w-3" />{" "}
                                    {t("settings.linuxCompat.reinstall")}
                                  </>
                                ) : umuProtonInfo?.updateAvailable ? (
                                  <>
                                    <Download className="h-3 w-3" />{" "}
                                    {t("settings.linuxCompat.update")}
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-3 w-3" /> {t("common.install")}
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                disabled={umuProtonUpdateStatus === "checking"}
                                onClick={async () => {
                                  setUmuProtonUpdateStatus("checking");
                                  const info =
                                    await window.electron.checkUmuProtonUpdate();
                                  if (info?.success) {
                                    setUmuProtonInfo(info);
                                    setUmuProtonUpdateStatus(
                                      info.alreadyInstalled
                                        ? "up-to-date"
                                        : info.updateAvailable
                                          ? "update-available"
                                          : null
                                    );
                                  } else {
                                    setUmuProtonUpdateStatus(null);
                                  }
                                }}
                              >
                                {umuProtonUpdateStatus === "checking" ? (
                                  <Loader className="h-3 w-3 animate-spin" />
                                ) : (
                                  <FolderSync className="h-3 w-3" />
                                )}
                                {t("settings.linuxCompat.checkForUpdates")}
                              </Button>
                            </div>

                            {umuProtonUpdateStatus === "up-to-date" && (
                              <p className="flex items-center gap-1 text-xs text-green-500">
                                <FileCheck2 className="h-3 w-3" />{" "}
                                {t("settings.linuxCompat.upToDate")}
                              </p>
                            )}
                            {umuProtonUpdateStatus === "update-available" && (
                              <p className="flex items-center gap-1 text-xs text-blue-500">
                                <AlertTriangle className="h-3 w-3" />{" "}
                                {t("settings.linuxCompat.updateAvailableUmu")}:{" "}
                                {umuProtonInfo?.latestVersion}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Warning if UMU not installed */}
                        {!umuInstalled && (
                          <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                            <p className="text-xs text-yellow-600 dark:text-yellow-400">
                              {t("gameScreen.umuLauncherNotInstalled")}
                            </p>
                          </div>
                        )}
                      </div>
                    </SettingsSection>

                    <ProtonOptionsDialog
                      open={protonOptionsOpen}
                      onOpenChange={setProtonOptionsOpen}
                      runnerType={(() => {
                        let name =
                          selectedRunner === "auto"
                            ? runners[0]?.name?.toLowerCase() || ""
                            : (selectedRunner.split("/").pop() || "").toLowerCase();
                        if (name.includes("cachyos")) return "cachyos";
                        if (name.includes("ge-proton") || name.includes("proton-ge"))
                          return "ge";
                        return null;
                      })()}
                    />

                    {/* Proton-GE Download Confirmation Dialog */}
                    <AlertDialog
                      open={showProtonGEConfirm && !!protonGEInfo}
                      onOpenChange={open => {
                        if (!open) {
                          setShowProtonGEConfirm(false);
                          setProtonGEInfo(null);
                        }
                      }}
                    >
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {protonGEInfo?.updateAvailable
                              ? t("settings.linuxCompat.protonConfirm.titleUpdate")
                              : t("settings.linuxCompat.protonConfirm.titleDownload")}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-3">
                            <p>
                              {protonGEInfo?.updateAvailable ? (
                                <>
                                  {t(
                                    "settings.linuxCompat.protonConfirm.updateAvailablePrefix"
                                  )}{" "}
                                  <strong className="text-foreground">
                                    {protonGEInfo.name}
                                  </strong>
                                  {protonGEInfo.installedVersions?.length > 0 && (
                                    <span>
                                      {" "}
                                      {t("settings.linuxCompat.protonConfirm.replacing", {
                                        versions:
                                          protonGEInfo.installedVersions.join(", "),
                                      })}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  {t(
                                    "settings.linuxCompat.protonConfirm.aboutToDownloadPrefix"
                                  )}{" "}
                                  <strong className="text-foreground">
                                    {protonGEInfo?.name}
                                  </strong>
                                  .
                                </>
                              )}
                            </p>
                            <p>
                              {t("settings.linuxCompat.protonConfirm.file")}{" "}
                              <code className="rounded bg-muted px-1 text-xs">
                                {protonGEInfo?.fileName}
                              </code>
                            </p>
                            <p>
                              {t("settings.linuxCompat.protonConfirm.size")}{" "}
                              <strong className="text-foreground">
                                {protonGEInfo?.sizeFormatted}
                              </strong>{" "}
                              {protonGEInfo &&
                                t("settings.linuxCompat.protonConfirm.sizeApprox", {
                                  gb: (protonGEInfo.size / (1024 * 1024 * 1024)).toFixed(
                                    1
                                  ),
                                })}
                            </p>
                            <p>
                              {t("settings.linuxCompat.protonConfirm.description")}{" "}
                              <code className="rounded bg-muted px-1 text-xs">
                                ~/.ascendara/runners/
                              </code>
                            </p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            onClick={() => {
                              setShowProtonGEConfirm(false);
                              setProtonGEInfo(null);
                            }}
                          >
                            {t("settings.linuxCompat.protonConfirm.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              setShowProtonGEConfirm(false);
                              setProtonGEUpdateStatus(null);
                              setIsDownloadingProtonGE(true);
                              try {
                                const result = await window.electron.downloadProtonGE();
                                if (result.success) {
                                  const updated = await window.electron.getRunners();
                                  setRunners(updated);
                                  if (result.path) {
                                    setSelectedRunner(result.path);
                                  }
                                }
                              } catch (e) {
                                console.error("Failed to download Proton-GE:", e);
                              }
                              setIsDownloadingProtonGE(false);
                              setProtonGEInfo(null);
                            }}
                            className="gap-2"
                          >
                            <Download className="h-4 w-4" />
                            {protonGEInfo?.updateAvailable
                              ? t("settings.linuxCompat.protonConfirm.updateBtn", {
                                  size: protonGEInfo?.sizeFormatted,
                                })
                              : t("settings.linuxCompat.protonConfirm.downloadBtn", {
                                  size: protonGEInfo?.sizeFormatted,
                                })}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    {/* Proton-CachyOS Download Confirmation Dialog */}
                    <AlertDialog
                      open={showProtonCachyConfirm && !!protonCachyInfo}
                      onOpenChange={open => {
                        if (!open) {
                          setShowProtonCachyConfirm(false);
                          setProtonCachyInfo(null);
                        }
                      }}
                    >
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {protonCachyInfo?.updateAvailable
                              ? t("settings.linuxCompat.protonConfirm.titleUpdateCachy")
                              : t(
                                  "settings.linuxCompat.protonConfirm.titleDownloadCachy"
                                )}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-3">
                            <p>
                              {protonCachyInfo?.updateAvailable ? (
                                <>
                                  {t(
                                    "settings.linuxCompat.protonConfirm.updateAvailablePrefixCachy"
                                  )}{" "}
                                  <strong className="text-foreground">
                                    {protonCachyInfo.name}
                                  </strong>
                                  {protonCachyInfo.installedVersions?.length > 0 && (
                                    <span>
                                      {" "}
                                      {t("settings.linuxCompat.protonConfirm.replacing", {
                                        versions:
                                          protonCachyInfo.installedVersions.join(", "),
                                      })}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  {t(
                                    "settings.linuxCompat.protonConfirm.aboutToDownloadPrefix"
                                  )}{" "}
                                  <strong className="text-foreground">
                                    {protonCachyInfo?.name}
                                  </strong>
                                  .
                                </>
                              )}
                            </p>
                            <p>
                              {t("settings.linuxCompat.protonConfirm.file")}{" "}
                              <code className="rounded bg-muted px-1 text-xs">
                                {protonCachyInfo?.fileName}
                              </code>
                            </p>
                            <p>
                              {t("settings.linuxCompat.protonConfirm.size")}{" "}
                              <strong className="text-foreground">
                                {protonCachyInfo?.sizeFormatted}
                              </strong>{" "}
                              {protonCachyInfo &&
                                t("settings.linuxCompat.protonConfirm.sizeApprox", {
                                  gb: (
                                    protonCachyInfo.size /
                                    (1024 * 1024 * 1024)
                                  ).toFixed(1),
                                })}
                            </p>
                            <p>
                              {t("settings.linuxCompat.protonConfirm.descriptionCachy")}{" "}
                              <code className="rounded bg-muted px-1 text-xs">
                                ~/.ascendara/runners/
                              </code>
                            </p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            onClick={() => {
                              setShowProtonCachyConfirm(false);
                              setProtonCachyInfo(null);
                            }}
                          >
                            {t("settings.linuxCompat.protonConfirm.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              setShowProtonCachyConfirm(false);
                              setProtonCachyUpdateStatus(null);
                              setIsDownloadingProtonCachy(true);
                              try {
                                const result =
                                  await window.electron.downloadProtonCachyOS();
                                if (result.success) {
                                  const updated = await window.electron.getRunners();
                                  setRunners(updated);
                                  if (result.path) {
                                    setSelectedRunner(result.path);
                                  }
                                }
                              } catch (e) {
                                console.error("Failed to download Proton-CachyOS:", e);
                              }
                              setIsDownloadingProtonCachy(false);
                              setProtonCachyInfo(null);
                            }}
                            className="gap-2"
                          >
                            <Download className="h-4 w-4" />
                            {protonCachyInfo?.updateAvailable
                              ? t("settings.linuxCompat.protonConfirm.updateBtn", {
                                  size: protonCachyInfo?.sizeFormatted,
                                })
                              : t("settings.linuxCompat.protonConfirm.downloadBtn", {
                                  size: protonCachyInfo?.sizeFormatted,
                                })}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </SettingsCategory>
            )}

            <SettingsCategory {...categoryProps("tools")}>
              {/* Timemachine */}
              <SettingsSection id="timemachine" title={t("settings.ascendaraTimechine")}>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t("settings.showOldDownloadLinksDescription")}&nbsp;
                      <a
                        onClick={() =>
                          window.electron.openURL(
                            "https://ascendara.app/docs/features/overview#ascendara-timemachine"
                          )
                        }
                        className="inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                      >
                        {t("common.learnMore")}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </p>
                    <div className="flex items-center justify-between space-x-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          {t("settings.enableAscendaraTimechine")}
                        </Label>
                      </div>
                      <Switch
                        checked={settings.showOldDownloadLinks}
                        onCheckedChange={value => {
                          handleSettingChange("showOldDownloadLinks", value);
                          if (value) setShowTimemachineIntro(true);
                        }}
                      />
                      <TimemachineIntroDialog
                        open={showTimemachineIntro}
                        onOpenChange={setShowTimemachineIntro}
                      />
                    </div>
                  </div>
                </div>
              </SettingsSection>

              {/* Workshop Downloader */}
              <SettingsSection
                id="workshop-downloader"
                title={t("settings.ascendaraWorkshopDownloader")}
              >
                <div className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t("settings.ascendaraWorkshopDownloaderDescription")}&nbsp;
                      <a
                        className="inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                        onClick={() =>
                          window.electron.openURL(
                            "https://ascendara.app/docs/features/overview#ascendara-workshop-downloader"
                          )
                        }
                      >
                        {t("common.learnMore")}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </p>
                    <div className="flex items-center justify-between space-x-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          {t("settings.ascendaraWorkshopDownloaderEnable")}
                        </Label>
                      </div>
                      <Switch
                        checked={settings.viewWorkshopPage}
                        onCheckedChange={value => {
                          handleSettingChange("viewWorkshopPage", value);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </SettingsSection>

              {/* Components */}
              {isOnWindows && (
                <SettingsSection
                  id="components"
                  title={t("settings.components")}
                  description={t("settings.componentsDescription")}
                  action={
                    <Button
                      variant="outline"
                      onClick={() => navigate("/sidecaranddependencies")}
                      className="gap-2"
                    >
                      {t("settings.viewComponentsPage")}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  }
                />
              )}
            </SettingsCategory>

            <SettingsCategory {...categoryProps("advanced")}>
              <SettingsSection
                id="app-branch"
                title={t("settings.appBranch.title")}
                description={t("settings.appBranch.description")}
              >
                <AppBranchPicker
                  t={t}
                  currentBranch={currentBranch}
                  currentVersion={
                    currentBranch === "live"
                      ? __APP_VERSION__
                      : testingVersion || branchVersions?.[currentBranch]
                  }
                  branchVersions={branchVersions}
                  hasAscendSubscription={hasAscendSubscription}
                  onLocked={() => setShowAscendPromoDialog(true)}
                  onSwitch={branch => {
                    setPendingBranch({ ...branch, label: t(branch.labelKey) });
                    setShowBranchDialog(true);
                  }}
                />
              </SettingsSection>

              {/* Developer Settings - Only shown in development mode */}
              {isDev && (
                <SettingsSection title="Developer Tools">
                  <div className="space-y-6">
                    <div>
                      <div className="space-y-4">
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => window.electron.openDevTools()}
                        >
                          Open DevTools
                        </Button>
                        {isDev && (
                          <>
                            <Button
                              className="w-full"
                              variant="outline"
                              onClick={() => window.electron.clearCache()}
                            >
                              Clear Cache
                            </Button>
                            <Button
                              className="w-full"
                              variant="outline"
                              onClick={() => window.electron.openGameDirectory("local")}
                            >
                              Open Local Directory
                            </Button>
                            <Button
                              className="w-full"
                              variant="outline"
                              onClick={() => window.electron.showTestNotification()}
                            >
                              Show Test Notification
                            </Button>
                            <Button
                              className="w-full"
                              variant="outline"
                              onClick={() =>
                                window.dispatchEvent(
                                  new CustomEvent("ascendara:dev-emulate-checkout")
                                )
                              }
                            >
                              Emulate Checkout Success
                            </Button>
                          </>
                        )}
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => {
                            // Welcome flow ends with the main tour and turns page tours back on
                            resetPageTours();
                            window.dispatchEvent(
                              new CustomEvent("ascendara:show-welcome")
                            );
                          }}
                        >
                          Replay Onboarding & Tours
                        </Button>
                      </div>
                      <div className="flex flex-col space-y-2">
                        <Label>Screen Trigger</Label>
                        <div className="flex gap-2">
                          <Select
                            value={currentScreen}
                            onValueChange={value => setCurrentScreen(value)}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select Screen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="updating">Updating</SelectItem>
                              <SelectItem value="loading">Loading</SelectItem>
                              <SelectItem value="crashscreen">Crash Screen</SelectItem>
                              <SelectItem value="finishingup">Finishing Up</SelectItem>
                              <SelectItem value="welcome">Welcome Flow</SelectItem>
                              <SelectItem value="verification">
                                Email Verification
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={triggerScreen}
                            disabled={currentScreen === "none" || isTriggering}
                            variant="secondary"
                          >
                            {isTriggering ? (
                              <div className="flex items-center gap-2">
                                <Loader className="h-4 w-4 animate-spin" />
                                Triggering...
                              </div>
                            ) : (
                              "Trigger Screen"
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsSection>
              )}

              <SettingsSection
                id="quick-support"
                title={t("settings.quickSupport")}
                description={t("settings.supportDesc")}
                action={
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setSupportCode(["", "", "", "", "", ""]);
                      setShowSupportDialog(true);
                    }}
                  >
                    {t("settings.getHelp")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                }
              />
            </SettingsCategory>
          </div>
        </div>
      </div>

      {/* Branch Switch Dialog */}
      <AlertDialog
        open={showBranchDialog}
        onOpenChange={v => {
          if (!isSwitchingBranch) setShowBranchDialog(v);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("settings.appBranch.switchDialog.title", {
                branch: pendingBranch?.label,
              })}
            </AlertDialogTitle>
            <div className="space-y-4 text-muted-foreground">
              <p>
                {t("settings.appBranch.switchDialog.description")}{" "}
                <strong>{pendingBranch?.label}</strong>{" "}
                {t("settings.appBranch.switchDialog.installer")}
              </p>
              {pendingBranch?.id && (
                <div className="flex items-center gap-3 border-y border-border/60 py-4">
                  {[
                    {
                      branch: getAppBranch(currentBranch),
                      version: branchVersions?.[currentBranch] || testingVersion,
                      caption: t("settings.appBranch.switchDialog.from"),
                    },
                    {
                      branch: getAppBranch(pendingBranch.id),
                      version: branchVersions?.[pendingBranch.id],
                      caption: t("settings.appBranch.switchDialog.to"),
                    },
                  ].map(({ branch, version, caption }, index) => (
                    <div key={caption} className="contents">
                      {index === 1 && (
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium uppercase tracking-wider">
                          {caption}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${branch.dot}`}
                          />
                          {t(branch.labelKey)}
                        </p>
                        {version && (
                          <p className="mt-0.5 font-mono text-xs">v{version}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pendingBranch?.id === "experimental" && (
                <div className="flex items-start gap-2 border-l-2 border-red-400 pl-3 text-sm text-red-400">
                  <FlaskConical className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{t("settings.appBranch.switchDialog.experimentalWarning")}</span>
                </div>
              )}
              {isSwitchingBranch && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>
                      {t("settings.appBranch.switchDialog.downloadingInstaller")}
                    </span>
                    <span>{branchSwitchProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${branchSwitchProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary" disabled={isSwitchingBranch}>
              {t("settings.appBranch.switchDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isSwitchingBranch}
              onClick={async e => {
                e.preventDefault();
                if (!pendingBranch) return;
                setIsSwitchingBranch(true);
                setBranchSwitchProgress(0);
                try {
                  const result = await window.electron.switchBranch(pendingBranch.id);
                  if (!result?.success) {
                    // Handle translated error messages
                    let errorMessage;
                    if (result.errorType === "notAvailable") {
                      errorMessage = t(
                        "settings.appBranch.switchDialog.errors.notAvailable",
                        {
                          branch: result.errorData.branch,
                          platform: result.errorData.platform,
                        }
                      );
                    } else if (result.errorType === "connectionFailed") {
                      errorMessage = t(
                        "settings.appBranch.switchDialog.errors.connectionFailed"
                      );
                    } else if (result.errorType === "timeout") {
                      errorMessage = t("settings.appBranch.switchDialog.errors.timeout");
                    } else {
                      errorMessage = result?.error || "Failed to switch branch";
                    }

                    toast.error(errorMessage);
                    setIsSwitchingBranch(false);
                    setShowBranchDialog(false);
                  }
                } catch (err) {
                  toast.error("Failed to switch branch");
                  setIsSwitchingBranch(false);
                  setShowBranchDialog(false);
                }
              }}
            >
              {isSwitchingBranch ? (
                <div className="flex items-center gap-2">
                  <Loader className="h-4 w-4 animate-spin" />
                  {t("settings.appBranch.switchDialog.downloading")}
                </div>
              ) : (
                t("settings.appBranch.switchDialog.switchAndReinstall")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ascend Promo Dialog */}
      <AlertDialog open={showAscendPromoDialog} onOpenChange={setShowAscendPromoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
              {t("settings.ascendPromoDialog.title")}
            </AlertDialogTitle>
            <div className="space-y-4 text-muted-foreground">
              <p>
                {t("settings.ascendPromoDialog.experimentalBranchExclusivePrefix")}{" "}
                <strong className="text-red-400">
                  {t("settings.ascendPromoDialog.experimentalBranch")}
                </strong>{" "}
                {t("settings.ascendPromoDialog.experimentalBranchExclusiveSuffix")}
              </p>
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                <h3 className="mb-2 font-semibold text-foreground">
                  {t("settings.ascendPromoDialog.whySubscribe")}
                </h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <FlaskConical className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{t("settings.ascendPromoDialog.benefit1")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Heart className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{t("settings.ascendPromoDialog.benefit2")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Gift className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{t("settings.ascendPromoDialog.benefit3")}</span>
                  </li>
                </ul>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("settings.ascendPromoDialog.maybeLater")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.electron?.openURL("https://ascendara.app/ascend?ref=app");
                setShowAscendPromoDialog(false);
              }}
            >
              {t("settings.ascendPromoDialog.learnMore")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Torrent Warning Dialog */}
      <AlertDialog open={showTorrentWarning} onOpenChange={setShowTorrentWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("settings.torrentWarningDialog.title")}
            </AlertDialogTitle>
            <div className="space-y-4 text-muted-foreground">
              <p>{t("settings.torrentWarningDialog.description")}</p>
              <div className="mt-4 space-y-3 rounded-lg bg-muted p-4">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-5 w-5 text-red-500" />
                  <p>{t("settings.torrentWarningDialog.vpnWarning")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Scale className="mt-0.5 h-5 w-5 text-yellow-500" />
                  <p>{t("settings.torrentWarningDialog.legalWarning")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Download className="mt-0.5 h-5 w-5 text-blue-500" />
                  <p>{t("settings.torrentWarningDialog.qbitWarning")}</p>
                </div>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("settings.torrentWarningDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEnableTorrent}
              className="bg-red-500 hover:bg-red-600"
            >
              {t("settings.torrentWarningDialog.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No Ludusavi Tool Dialog */}
      <AlertDialog open={showNoLudusaviDialog} onOpenChange={setShowNoLudusaviDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("settings.noLudusaviTool")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("settings.noLudusaviToolDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={async () => {
                try {
                  setIsDownloading(true);
                  const result = await window.electron.installTool("ludusavi");
                  if (!result.success) {
                    toast.error(result.message);
                    return;
                  }
                  setShowNoLudusaviDialog(false);
                  handleSettingChange("enabled", true, true);
                } catch (error) {
                  console.error("Failed to install Ludusavi:", error);
                  toast.error(t("settings.noLudusaviTool"));
                } finally {
                  setIsDownloading(false);
                }
              }}
              disabled={isDownloading}
            >
              {isDownloading ? t("common.downloading") : t("welcome.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Support Code Dialog */}
      <AlertDialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
              {t("settings.quickSupport")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("settings.supportCodeDesc")}&nbsp;
              <a
                className="cursor-pointer text-primary hover:underline"
                onClick={() => window.electron.openURL("https://ascendara.app/discord")}
              >
                {t("settings.joinDiscord")}
                <ExternalLink className="mb-1 ml-1 inline-block h-3 w-3" />
              </a>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-6">
            <div className="flex justify-center gap-3">
              {supportCode.map((digit, index) => (
                <input
                  key={index}
                  ref={el => (supportInputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => {
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    if (value.length <= 1) {
                      const newCode = [...supportCode];
                      newCode[index] = value;
                      setSupportCode(newCode);
                      // Auto-focus next input
                      if (value && index < 5) {
                        supportInputRefs.current[index + 1]?.focus();
                      }
                    }
                  }}
                  onKeyDown={e => {
                    // Handle backspace to go to previous input
                    if (e.key === "Backspace" && !digit && index > 0) {
                      supportInputRefs.current[index - 1]?.focus();
                    }
                  }}
                  onPaste={e => {
                    e.preventDefault();
                    const pastedData = e.clipboardData
                      .getData("text")
                      .replace(/[^0-9]/g, "")
                      .slice(0, 6);
                    if (pastedData) {
                      const newCode = [...supportCode];
                      for (let i = 0; i < pastedData.length && i < 6; i++) {
                        newCode[i] = pastedData[i];
                      }
                      setSupportCode(newCode);
                      // Focus the next empty input or the last one
                      const nextEmptyIndex = newCode.findIndex(d => !d);
                      supportInputRefs.current[
                        nextEmptyIndex !== -1 ? nextEmptyIndex : 5
                      ]?.focus();
                    }
                  }}
                  className="h-14 w-12 rounded-lg border-2 border-border bg-background text-center text-2xl font-bold text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              ))}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={supportLoading}
              onClick={() => setSupportCode(["", "", "", "", "", ""])}
            >
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={supportCode.some(d => !d) || supportLoading}
              onClick={e => {
                e.preventDefault();
                setShowSupportDialog(false);
                setShowSupportConfirmDialog(true);
              }}
            >
              {t("common.submit") || "Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Support Log Upload Confirmation Dialog */}
      <AlertDialog
        open={showSupportConfirmDialog}
        onOpenChange={setShowSupportConfirmDialog}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {t("settings.logUploadWarningTitle") || "Log Upload Notice"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-muted-foreground">
              <p>
                {t("settings.logUploadWarningDesc") ||
                  "The logs you're about to upload may contain:"}
              </p>
              <ul className="ml-4 list-disc space-y-1 text-sm">
                <li>{t("settings.logWarningUsername") || "Your Windows username"}</li>
                <li>
                  {t("settings.logWarningDirectories") ||
                    "Download directories and file paths"}
                </li>
                <li>
                  {t("settings.logWarningActivity") ||
                    "Ascendara, Downloader, and Game Handler activity"}
                </li>
              </ul>
              <p className="text-sm">
                {t("settings.logUploadPurpose") ||
                  "This information helps us assist you with your issue. Your data will be deleted after support is complete."}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={supportLoading}
              onClick={() => {
                setShowSupportConfirmDialog(false);
                setShowSupportDialog(true);
              }}
            >
              {t("common.back") || "Back"}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={supportLoading}
              onClick={async e => {
                e.preventDefault();
                const code = supportCode.join("");
                setSupportLoading(true);

                try {
                  // Step 1: Validate the support code
                  const validateResponse = await fetch(`${API_URL}/support/validate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code }),
                  });

                  const validateData = await validateResponse.json();

                  if (!validateData.valid) {
                    toast.error(
                      t("settings.invalidSupportCode") ||
                        "Invalid or expired support code"
                    );
                    setSupportLoading(false);
                    setShowSupportConfirmDialog(false);
                    setShowSupportDialog(true);
                    return;
                  }

                  const sessionToken = validateData.session_token;

                  // Step 2: Get app token
                  const authHeaders = await window.electron.getAuthHeaders();
                  const tokenResponse = await fetch(`${API_URL}/auth/token`, {
                    headers: authHeaders,
                  });

                  if (!tokenResponse.ok) {
                    throw new Error("Failed to obtain token");
                  }

                  const tokenData = await tokenResponse.json();
                  const appToken = tokenData.token;

                  // Step 3: Upload logs
                  const uploadResult = await window.electron.uploadSupportLogs(
                    sessionToken,
                    appToken
                  );

                  if (uploadResult.success) {
                    toast.success(
                      t("settings.logsUploaded") || "Logs uploaded successfully!"
                    );
                    setShowSupportConfirmDialog(false);
                    setShowSupportDialog(false);
                    setSupportCode(["", "", "", "", "", ""]);
                  } else {
                    throw new Error(uploadResult.error || "Upload failed");
                  }
                } catch (error) {
                  console.error("Support code error:", error);
                  toast.error(
                    t("settings.supportError") ||
                      "Failed to upload logs. Please try again."
                  );
                } finally {
                  setSupportLoading(false);
                }
              }}
            >
              {supportLoading ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                t("settings.uploadLogs") || "Upload Logs"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsNav({ categories, activeId, onSelect }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-l lg:border-border/60 lg:px-0 lg:pb-0">
      {categories.map(category => {
        const isActive = activeId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            aria-current={isActive ? "true" : undefined}
            className={`relative flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary lg:-ml-px lg:rounded-none lg:rounded-r-md lg:pl-4 ${
              isActive
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="settings-category-active"
                className="absolute inset-0 rounded-md bg-primary/10 lg:inset-y-0 lg:left-0 lg:right-auto lg:w-0.5 lg:rounded-full lg:bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
            <category.icon
              className={`relative h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`}
            />
            <span className="relative whitespace-nowrap">{category.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SupportDevelopersNote({ t }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-l-2 border-yellow-500/50 pl-4">
      <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
        <Hand className="h-4 w-4 shrink-0 scale-x-[-1]" />
        <h2 className="mb-0 text-sm font-semibold leading-tight">
          {t("settings.warningTitle")}
        </h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {t("settings.warningSupportDevelopersCallToAction")}
      </p>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-2 text-xs leading-relaxed text-muted-foreground">
              <p>{t("settings.warningDescription")}</p>
              <p>{t("settings.warningSupportDevelopers")}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setExpanded(open => !open)}
        aria-expanded={expanded}
        className="mt-2 text-xs font-medium text-yellow-700 hover:underline dark:text-yellow-500"
      >
        {expanded ? t("settings.warningShowLess") : t("settings.warningReadMore")}
      </button>
    </div>
  );
}

function SettingsCategory({ id, title, description, active, children }) {
  return (
    <section id={id} data-category={id} hidden={!active} className="max-w-4xl">
      <header className="border-b border-border/60 pb-5">
        <h2 className="mb-0 text-2xl font-bold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </header>
      {/* Sections sit straight on the page, split by hairlines instead of cards */}
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  );
}

// A flat group of settings within a category: a heading, an optional
// description and action, then the controls
function SettingsSection({ id, title, description, action, className = "", children }) {
  const hasHeader = title || description || action;
  return (
    <section id={id} className="py-8">
      {hasHeader && (
        <div
          className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-3 ${children ? "mb-6" : ""}`}
        >
          <div className="min-w-0 flex-1 space-y-1">
            {title && (
              <h3 className="mb-0 text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h3>
            )}
            {description && (
              <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children && <div className={className}>{children}</div>}
    </section>
  );
}

function ThemeButton({ theme, currentTheme, onSelect, t }) {
  const colors = getThemeColors(theme.id);
  const isActive = currentTheme === theme.id;

  return (
    <button
      type="button"
      onClick={() => onSelect(theme.id)}
      className="group text-left outline-none"
    >
      <div
        className={`aspect-[16/10] rounded-xl p-2.5 transition-all ${colors.bg} ${
          isActive
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
            : "ring-1 ring-border group-hover:ring-primary/50 group-focus-visible:ring-primary"
        }`}
      >
        <div className={`h-full rounded-lg p-2 shadow-sm ${colors.secondary}`}>
          <div className={`h-2 w-3/5 rounded-full opacity-80 ${colors.primary}`} />
          <div
            className={`mt-1.5 h-1.5 w-2/5 rounded-full opacity-40 ${colors.primary}`}
          />
          <div className={`mt-3 h-4 rounded-md opacity-60 ${colors.bg}`} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${colors.primary}`} />
        <span className="truncate text-sm font-medium text-foreground">{theme.name}</span>
        {theme.isNew && !isActive && (
          <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
            {t("settings.newTheme")}
          </span>
        )}
        {isActive && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
      </div>
    </button>
  );
}

export default Settings;
