import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { useLocation } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DownloadLimitSelector from "@/components/DownloadLimitSelector";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import checkQbittorrentStatus from "@/services/qbittorrentCheckService";
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
  History,
  ChartNoAxesCombined,
  ArrowRight,
  Download,
  Scale,
  Clock,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Zap,
  Battery,
  BatteryMedium,
  BatteryLow,
  BatteryFull,
  SquareTerminal,
  Package,
  AlertTriangle,
  FolderSync,
  FileCheck2,
  CpuIcon,
  CornerDownRight,
  Database,
  LoaderIcon,
  Palette,
  Download as DownloadIcon,
  UploadIcon,
  Globe,
  MessageCircleQuestion,
  Star,
  Home,
  Bell,
  CheckCircle,
  Info,
  Search,
  Library,
  Settings2,
  Gamepad2,
  Terminal,
  Wine,
} from "lucide-react";
import gameService from "@/services/gameService";
import { Link, useNavigate } from "react-router-dom";
import { analytics } from "@/services/analyticsService";
import { getAvailableLanguages, handleLanguageChange } from "@/services/languageService";
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
import { verifyAscendAccess } from "@/services/firebaseService";

const themes = [
  // Light themes
  { id: "light", name: "Arctic Sky", group: "light" },
  { id: "blue", name: "Ocean Blue", group: "light" },
  { id: "purple", name: "Ascendara Purple", group: "light" },
  { id: "emerald", name: "Emerald", group: "light" },
  { id: "rose", name: "Rose", group: "light" },
  { id: "amber", name: "Amber Sand", group: "light" },

  // Dark themes
  { id: "dark", name: "Dark Blue", group: "dark" },
  { id: "midnight", name: "Midnight", group: "dark" },
  { id: "cyberpunk", name: "Cyberpunk", group: "dark" },
  { id: "sunset", name: "Sunset", group: "dark" },
  { id: "forest", name: "Forest", group: "dark" },
  { id: "ocean", name: "Deep Ocean", group: "dark" },
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
    amber: {
      bg: "bg-amber-50",
      primary: "bg-amber-600",
      secondary: "bg-amber-100",
      text: "text-amber-900",
    },
    ocean: {
      bg: "bg-slate-900",
      primary: "bg-cyan-400",
      secondary: "bg-slate-800",
      text: "text-cyan-100",
    },
  };

  return themeMap[themeId] || themeMap.light;
};

// Helper to convert RGB string to hex
const rgbToHex = rgbString => {
  if (!rgbString || typeof rgbString !== "string") return "#000000";
  const parts = rgbString.split(" ").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "#000000";
  return (
    "#" +
    parts
      .map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
};

// Helper to convert hex to RGB string
const hexToRgb = hex => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0 0";
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
};

// ColorPickerInput component - native color picker with local state for smooth dragging
const ColorPickerInput = ({ colorKey, label, value, onColorChange }) => {
  const safeValue = value || "128 128 128";
  const [localColor, setLocalColor] = useState(rgbToHex(safeValue));
  const [localRgb, setLocalRgb] = useState(safeValue);

  useEffect(() => {
    const syncValue = value || "128 128 128";
    setLocalColor(rgbToHex(syncValue));
    setLocalRgb(syncValue);
  }, [value]);

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={localColor}
        onChange={e => {
          setLocalColor(e.target.value);
          setLocalRgb(hexToRgb(e.target.value));
        }}
        onBlur={() => onColorChange(colorKey, localColor)}
        style={{
          width: "56px",
          height: "40px",
          padding: 0,
          border: "1px solid var(--border)",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      />
      <div className="min-w-0 flex-1">
        <Label className="block truncate text-xs text-foreground">{label}</Label>
        <p className="truncate text-xs text-foreground/60">{localRgb}</p>
      </div>
    </div>
  );
};

function Settings() {
  const [currentBranch, setCurrentBranch] = useState("main");
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [hasAscendSubscription, setHasAscendSubscription] = useState(false);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [pendingBranch, setPendingBranch] = useState("");
  const [branchVersions, setBranchVersions] = useState(null);
  const [showNoBranchDialog, setShowNoBranchDialog] = useState(false);
  const [noBranchMessage, setNoBranchMessage] = useState("");
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
  const [torboxApiKey, setTorboxApiKey] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnWindows, setIsOnWindows] = useState(null);
  const [isOnLinux, setIsOnLinux] = useState(false);
  const [downloadPath, setDownloadPath] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const [canCreateFiles, setCanCreateFiles] = useState(true);
  const [isDownloaderRunning, setIsDownloaderRunning] = useState(false);
  const [showTorrentWarning, setShowTorrentWarning] = useState(false);
  const [showNoTorrentDialog, setShowNoTorrentDialog] = useState(false);
  const [showNoLudusaviDialog, setShowNoLudusaviDialog] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [isExperiment, setIsExperiment] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [testingVersion, setTestingVersion] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [exclusionLoading, setExclusionLoading] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [isIndexRefreshing, setIsIndexRefreshing] = useState(false);
  const [showCustomColorsDialog, setShowCustomColorsDialog] = useState(false);
  const [controllerConnected, setControllerConnected] = useState(false);
  const [runners, setRunners] = useState([]);
  const [selectedRunner, setSelectedRunner] = useState("auto");
  const [isDownloadingProton, setIsDownloadingProton] = useState(false);
  const [protonGEInfo, setProtonGEInfo] = useState(null);
  const [showProtonConfirm, setShowProtonConfirm] = useState(false);
  const [protonUpdateStatus, setProtonUpdateStatus] = useState(null); // null | "checking" | "up-to-date" | "update-available"
  // Default custom colors for merging with saved themes (handles missing new properties)
  const defaultCustomColors = {
    background: "255 255 255",
    foreground: "15 23 42",
    primary: "124 58 237",
    secondary: "221 214 254",
    muted: "221 214 254",
    mutedForeground: "88 28 135",
    accent: "221 214 254",
    accentForeground: "88 28 135",
    border: "167 139 250",
    input: "167 139 250",
    ring: "88 28 135",
    card: "255 255 255",
    cardForeground: "15 23 42",
    popover: "255 255 255",
    popoverForeground: "15 23 42",
    // Navigation colors
    navBackground: "255 255 255",
    navActive: "124 58 237",
    navActiveText: "255 255 255",
    navHover: "221 214 254",
    // Status colors
    success: "34 197 94",
    warning: "234 179 8",
    error: "239 68 68",
    info: "59 130 246",
    // Star rating
    starFilled: "250 204 21",
    starEmpty: "148 163 184",
    // Startup/Welcome screen
    startupBackground: "255 255 255",
    startupAccent: "124 58 237",
  };
  const [customColors, setCustomColors] = useState(() => {
    // Try to load from localStorage
    try {
      const savedColors = localStorage.getItem("custom-theme-colors");
      if (savedColors) {
        const parsed = JSON.parse(savedColors);
        return { ...defaultCustomColors, ...parsed };
      }
    } catch (e) {
      console.warn("Failed to load theme from localstorage", e);
    }
    // Else use default
    return defaultCustomColors;
  });
  const [originalColorsOnOpen, setOriginalColorsOnOpen] = useState(null);
  const [showPublicThemesDialog, setShowPublicThemesDialog] = useState(false);
  const [publicThemes, setPublicThemes] = useState([]);
  const [loadingPublicThemes, setLoadingPublicThemes] = useState(false);
  const [selectedThemeVersion, setSelectedThemeVersion] = useState(null);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
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

  // Load last refresh time and check if refresh is running
  useEffect(() => {
    const loadRefreshStatus = async () => {
      try {
        const currentSettings = await window.electron.getSettings();
        const indexPath = currentSettings?.localIndex;
        if (indexPath) {
          // Check if refresh is currently running
          if (window.electron?.getLocalRefreshStatus) {
            const status = await window.electron.getLocalRefreshStatus(indexPath);
            setIsIndexRefreshing(status.isRunning);
            // Use lastSuccessfulTimestamp which persists across refresh attempts
            if (status.progress?.lastSuccessfulTimestamp) {
              setLastRefreshTime(
                new Date(status.progress.lastSuccessfulTimestamp * 1000)
              );
            }
          } else if (window.electron?.getLocalRefreshProgress) {
            const progress = await window.electron.getLocalRefreshProgress(indexPath);
            // Use lastSuccessfulTimestamp which persists across refresh attempts
            if (progress?.lastSuccessfulTimestamp) {
              setLastRefreshTime(new Date(progress.lastSuccessfulTimestamp * 1000));
            }
            // Check status from progress file
            setIsIndexRefreshing(progress?.status === "running");
          }
        }
      } catch (e) {
        console.log("No progress file found for last refresh time");
      }
    };
    loadRefreshStatus();

    // Listen for refresh progress updates
    if (window.electron?.onLocalRefreshProgress) {
      const handleProgress = data => {
        if (data.status === "running") {
          setIsIndexRefreshing(true);
        } else if (data.status === "completed" || data.status === "failed") {
          setIsIndexRefreshing(false);
          // Use lastSuccessfulTimestamp which only updates on successful completion
          if (data.lastSuccessfulTimestamp) {
            setLastRefreshTime(new Date(data.lastSuccessfulTimestamp * 1000));
          }
        }
      };
      window.electron.onLocalRefreshProgress(handleProgress);

      // Listen for public index download complete
      const handlePublicDownloadComplete = () => {
        setLastRefreshTime(new Date());
      };
      window.electron.onPublicIndexDownloadComplete?.(handlePublicDownloadComplete);

      return () => {
        window.electron.offLocalRefreshProgress?.();
        window.electron.offPublicIndexDownloadComplete?.();
      };
    }
  }, []);

  useEffect(() => {
    const checkExperiment = async () => {
      const branch = (await window.electron.getBranch?.()) ?? "live";
      setCurrentBranch(branch);
      const isExp = branch === "experimental";
      setIsExperiment(isExp);
      if (isExp) {
        const version = await window.electron.getTestingVersion();
        setTestingVersion(version);
      }
    };
    checkExperiment();
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
        const response = await fetch("https://api.ascendara.app/branch-versions");
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

      // Load Linux runners if on Linux
      if (linux) {
        try {
          const detectedRunners = await window.electron.getRunners();
          setRunners(detectedRunners);
          const currentSettings = await window.electron.getSettings();
          setSelectedRunner(currentSettings.linuxRunner || "auto");
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
    const interval = setInterval(checkController, 2000);

    window.addEventListener("gamepadconnected", checkController);
    window.addEventListener("gamepaddisconnected", checkController);

    return () => {
      clearInterval(interval);
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

  const handleDirectorySelect = useCallback(async () => {
    try {
      const directory = await window.electron.openDirectoryDialog();
      if (directory) {
        const canCreate = await window.electron.canCreateFiles(directory);
        if (!canCreate) {
          toast.error(t("settings.errors.noPermission"));
          return;
        }
        setDownloadPath(directory);
        handleSettingChange("downloadDirectory", directory);
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
      toast.error(t("settings.errors.directorySelect"));
    }
  }, [handleSettingChange, t]);

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

  // Helper to clear custom theme CSS variables
  const clearCustomThemeStyles = () => {
    const root = document.documentElement;
    root.style.removeProperty("--color-background");
    root.style.removeProperty("--color-foreground");
    root.style.removeProperty("--color-primary");
    root.style.removeProperty("--color-secondary");
    root.style.removeProperty("--color-muted");
    root.style.removeProperty("--color-muted-foreground");
    root.style.removeProperty("--color-accent");
    root.style.removeProperty("--color-accent-foreground");
    root.style.removeProperty("--color-border");
    root.style.removeProperty("--color-input");
    root.style.removeProperty("--color-ring");
    root.style.removeProperty("--color-card");
    root.style.removeProperty("--color-card-foreground");
    root.style.removeProperty("--color-popover");
    root.style.removeProperty("--color-popover-foreground");
    // Navigation colors
    root.style.removeProperty("--color-nav-background");
    root.style.removeProperty("--color-nav-active");
    root.style.removeProperty("--color-nav-active-text");
    root.style.removeProperty("--color-nav-hover");
    // Status colors
    root.style.removeProperty("--color-success");
    root.style.removeProperty("--color-warning");
    root.style.removeProperty("--color-error");
    root.style.removeProperty("--color-info");
    // Star rating
    root.style.removeProperty("--color-star-filled");
    root.style.removeProperty("--color-star-empty");
    // Startup screen
    root.style.removeProperty("--color-startup-background");
    root.style.removeProperty("--color-startup-accent");
  };

  // Theme handling
  const handleThemeChange = useCallback(
    async newTheme => {
      // Apply
      if (newTheme !== "custom") {
        clearCustomThemeStyles();
      }
      setTheme(newTheme);
      localStorage.setItem("ascendara-theme", newTheme);

      // Try to save
      try {
        console.log("Saving theme:", newTheme);
        const success = await window.electron.updateSetting("theme", newTheme);
        console.log("Save successful ?", success);

        if (success) {
          // Updating context locally
          setSettingsLocal(prev => ({ ...prev, theme: newTheme }));
        } else {
          toast.error("Failed to save theme preference");
        }
      } catch (e) {
        console.error("Error saving theme:", e);
      }
    },
    [setSettingsLocal, setTheme]
  );

  const groupedThemes = {
    light: themes.filter(t => t.group === "light"),
    dark: themes.filter(t => t.group === "dark"),
  };

  // Load custom colors from settings
  useEffect(() => {
    if (
      settings.customTheme &&
      Array.isArray(settings.customTheme) &&
      settings.customTheme.length > 0
    ) {
      const customThemeObj = settings.customTheme[0];
      if (customThemeObj) {
        // Merge with defaults to ensure all properties exist (handles old saved themes)
        setCustomColors(prev => ({ ...defaultCustomColors, ...customThemeObj }));
      }
    }
  }, [settings.customTheme]);

  // Apply custom theme CSS variables when custom theme is active
  useEffect(() => {
    if (theme !== "custom") return;
    if (theme === "custom" && customColors) {
      const root = document.documentElement;
      root.style.setProperty("--color-background", customColors.background);
      root.style.setProperty("--color-foreground", customColors.foreground);
      root.style.setProperty("--color-primary", customColors.primary);
      root.style.setProperty("--color-secondary", customColors.secondary);
      root.style.setProperty("--color-muted", customColors.muted);
      root.style.setProperty("--color-muted-foreground", customColors.mutedForeground);
      root.style.setProperty("--color-accent", customColors.accent);
      root.style.setProperty("--color-accent-foreground", customColors.accentForeground);
      root.style.setProperty("--color-border", customColors.border);
      root.style.setProperty("--color-input", customColors.input);
      root.style.setProperty("--color-ring", customColors.ring);
      root.style.setProperty("--color-card", customColors.card);
      root.style.setProperty("--color-card-foreground", customColors.cardForeground);
      root.style.setProperty("--color-popover", customColors.popover);
      root.style.setProperty(
        "--color-popover-foreground",
        customColors.popoverForeground
      );
      // Navigation colors
      root.style.setProperty(
        "--color-nav-background",
        customColors.navBackground || customColors.background
      );
      root.style.setProperty(
        "--color-nav-active",
        customColors.navActive || customColors.primary
      );
      root.style.setProperty(
        "--color-nav-active-text",
        customColors.navActiveText || customColors.secondary
      );
      root.style.setProperty(
        "--color-nav-hover",
        customColors.navHover || customColors.secondary
      );
      // Status colors
      root.style.setProperty("--color-success", customColors.success || "34 197 94");
      root.style.setProperty("--color-warning", customColors.warning || "234 179 8");
      root.style.setProperty("--color-error", customColors.error || "239 68 68");
      root.style.setProperty("--color-info", customColors.info || "59 130 246");
      // Star rating
      root.style.setProperty(
        "--color-star-filled",
        customColors.starFilled || "250 204 21"
      );
      root.style.setProperty(
        "--color-star-empty",
        customColors.starEmpty || "148 163 184"
      );
      // Startup screen
      root.style.setProperty(
        "--color-startup-background",
        customColors.startupBackground || customColors.background
      );
      root.style.setProperty(
        "--color-startup-accent",
        customColors.startupAccent || customColors.primary
      );
    }
  }, [theme, customColors]);

  // Handle custom color change - only called on blur/change complete
  const handleCustomColorChange = (colorKey, hexValue) => {
    const rgbValue = hexToRgb(hexValue);
    setCustomColors(prev => ({
      ...prev,
      [colorKey]: rgbValue,
    }));
  };

  // Save custom colors and apply theme
  const handleSaveCustomColors = async () => {
    // Create the theme array
    const themeArray = [{ ...customColors }];
    console.log("Saving custom theme:", themeArray);

    // Save custom theme array first using dedicated function
    const success = await window.electron.saveCustomThemeColors(themeArray);
    console.log("Save success:", success);

    if (success) {
      // Also save theme to "custom"
      await window.electron.updateSetting("theme", "custom");

      // Update React state without triggering full save
      setTheme("custom");
      localStorage.setItem("ascendara-theme", "custom");

      localStorage.setItem("custom-theme-colors", JSON.stringify(customColors));
      setSettingsLocal(prev => ({
        ...prev,
        theme: "custom",
        customTheme: [customColors], // Use customColors, not colors
      }));

      const root = document.documentElement;
      root.style.setProperty("--color-background", customColors.background);
      root.style.setProperty("--color-foreground", customColors.foreground);

      setShowCustomColorsDialog(false);
      toast.success(t("settings.customColorsSaved") || "Custom colors saved!");
    } else {
      toast.error("Failed to save custom theme");
    }
  };

  // Export custom theme to file
  const handleExportTheme = async () => {
    const result = await window.electron.exportCustomTheme([customColors]);
    if (result.success) {
      toast.success(t("settings.themeExported") || "Theme exported successfully!");
    } else if (!result.canceled) {
      toast.error(
        result.error || t("settings.themeExportFailed") || "Failed to export theme"
      );
    }
  };

  // Import custom theme from file
  const handleImportTheme = async () => {
    const result = await window.electron.importCustomTheme();
    if (result.success && result.customTheme) {
      setCustomColors(result.customTheme[0]);
      toast.success(t("settings.themeImported") || "Theme imported successfully!");
    } else if (!result.canceled) {
      toast.error(
        result.error || t("settings.themeImportFailed") || "Failed to import theme"
      );
    }
  };

  // Browse public themes
  const handleBrowsePublicThemes = async () => {
    setShowCustomColorsDialog(false);
    setShowPublicThemesDialog(true);
    setLoadingPublicThemes(true);
    try {
      const response = await fetch("https://api.ascendara.app/json/publicthemes");
      const data = await response.json();
      // Ensure we always have an array
      let themesArray = [];
      if (Array.isArray(data)) {
        themesArray = data;
      } else if (data && Array.isArray(data.themes)) {
        themesArray = data.themes;
      } else if (data && typeof data === "object") {
        // If it's an object with theme entries, convert to array
        themesArray = Object.values(data).filter(
          item => item && typeof item === "object"
        );
      }
      setPublicThemes(themesArray);
    } catch (error) {
      console.error("Error fetching public themes:", error);
      toast.error(t("settings.publicThemesFailed") || "Failed to load public themes");
      setPublicThemes([]);
    } finally {
      setLoadingPublicThemes(false);
    }
  };

  // Apply a public theme
  const handleApplyPublicTheme = (themeColors, themeVersion) => {
    setCustomColors(themeColors);
    setSelectedThemeVersion(themeVersion);
    setShowPublicThemesDialog(false);
    setShowCustomColorsDialog(true);
    toast.success(
      t("settings.publicThemeApplied") || "Theme applied! Click Apply Colors to save."
    );
  };

  // Check if in development mode
  useEffect(() => {
    const checkDevMode = async () => {
      const isDevMode = await window.electron.isDev();
      setIsDev(isDevMode);
    };
    checkDevMode();
  }, []);

  // Function to trigger selected screen
  const triggerScreen = async () => {
    setIsTriggering(true);
    try {
      switch (currentScreen) {
        case "updating":
          // Set installing flag to show UpdateOverlay
          localStorage.setItem("forceInstalling", "true");
          window.location.reload();
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

  // Handle scrollTo from navigation state (from global search)
  useEffect(() => {
    if (location.state?.scrollTo && !isLoading) {
      const scrollToId = location.state.scrollTo;

      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.getElementById(scrollToId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("highlight-setting");
          setTimeout(() => {
            element.classList.remove("highlight-setting");
          }, 4000);
        }
      }, 100);

      // Clear the state to prevent re-scrolling on re-renders
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, isLoading, navigate, location.pathname]);

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

  const handleTorrentToggle = () => {
    if (!settings.torrentEnabled) {
      setShowTorrentWarning(true);
    } else {
      handleSettingChange("torrentEnabled", false);
      window.dispatchEvent(new CustomEvent("torrentSettingChanged", { detail: false }));
      analytics.trackFeatureUsage("torrenting_EXPERIMENTAL", { enabled: false });
    }
  };

  const handleEnableTorrent = async () => {
    const tools = await window.electron.getInstalledTools();
    if (!tools.includes("torrent")) {
      setShowTorrentWarning(false);
      setShowNoTorrentDialog(true);
    } else {
      setShowTorrentWarning(false);
      handleSettingChange("torrentEnabled", true);
      window.dispatchEvent(new CustomEvent("torrentSettingChanged", { detail: true }));
      analytics.trackFeatureUsage("torrenting_EXPERIMENTAL", { enabled: true });
    }
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-7xl p-4 md:p-8">
        <div className="mb-6 flex items-center gap-4">
          <h1 className="text-3xl font-bold text-primary">{t("settings.title")}</h1>

          {isExperiment ? (
            <div className="group relative ml-auto flex items-center text-sm text-muted-foreground">
              <div className="px-2 font-medium">
                <span>Experiment Build {testingVersion}</span>
              </div>
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column - Core Settings */}
          <div className="space-y-6 lg:col-span-8">
            {/* Local Game Index Card */}
            <Card className="border-border p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-3">
                    {isIndexRefreshing ? (
                      <LoaderIcon className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <Database className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-primary">
                        {t("settings.localIndex") || "Local Game Index"}
                      </h2>
                      {isIndexRefreshing && (
                        <Badge variant="secondary" className="mb-2.5 text-xs">
                          {t("localRefresh.statusRunning") || "Refreshing..."}
                        </Badge>
                      )}
                    </div>
                    <p className="max-w-[500px] text-sm text-muted-foreground">
                      {t("settings.localIndexDescription")}
                    </p>
                    <div
                      className={`flex items-center gap-2 pt-2 text-sm ${lastRefreshTime ? "text-muted-foreground" : "font-bold text-yellow-500"}`}
                    >
                      {lastRefreshTime ? (
                        <Clock className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      <span>
                        {t("settings.lastIndexRefresh") || "Last refresh"}:{" "}
                        {lastRefreshTime
                          ? lastRefreshTime.toLocaleDateString()
                          : t("localRefresh.never") || "Never"}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  className="shrink-0 gap-2 text-secondary"
                  onClick={() => navigate("/localrefresh")}
                >
                  {isIndexRefreshing
                    ? t("localRefresh.viewProgress") || "View Progress"
                    : t("settings.manageIndex") || "Manage Index"}
                </Button>
              </div>

              {/* Index Reminder Setting */}
              <div
                id="index-reminder"
                className="mt-6 space-y-2 border-t border-border/50 pt-6"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Label>
                      {t("settings.indexReminder") || "Index Refresh Reminder"}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.indexReminderDescription") ||
                        "Get reminded to refresh your local index after this many days"}
                    </p>
                  </div>
                  <Select
                    value={settings.indexReminder || "7"}
                    onValueChange={value => handleSettingChange("indexReminder", value)}
                  >
                    <SelectTrigger className="w-[180px] bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">
                        {t("settings.indexReminderOptions.twoDays") || "2 Days"}
                      </SelectItem>
                      <SelectItem value="3">
                        {t("settings.indexReminderOptions.threeDays") || "3 Days"}
                      </SelectItem>
                      <SelectItem value="5">
                        {t("settings.indexReminderOptions.fiveDays") || "5 Days"}
                      </SelectItem>
                      <SelectItem value="7">
                        {t("settings.indexReminderOptions.oneWeek") || "1 Week"}
                      </SelectItem>
                      <SelectItem value="10">
                        {t("settings.indexReminderOptions.tenDays") || "10 Days"}
                      </SelectItem>
                      <SelectItem value="14">
                        {t("settings.indexReminderOptions.twoWeeks") || "2 Weeks"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            {/* General Settings Card */}
            <Card className="border-border p-6">
              <h2 className="mb-4 text-xl font-semibold text-primary">
                {t("settings.general")}
              </h2>

              {/* Appearance Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {t("settings.appearance")}
                </h3>
                <div id="theme">
                  <Label>{t("settings.themes")}</Label>

                  {/* Custom Colors Button */}
                  <div
                    id="custom-colors"
                    className={`mt-3 flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-all hover:bg-accent/50 ${theme === "custom" ? "border-primary bg-primary/5" : "border-border"}`}
                    onClick={() => {
                      setOriginalColorsOnOpen({ ...customColors });
                      setSelectedThemeVersion(null);
                      setShowCustomColorsDialog(true);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-accent/20">
                        <Palette className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {t("settings.customColors") || "Custom Colors"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.customColorsSubtitle") || "Create your own theme"}
                        </p>
                      </div>
                    </div>
                    {theme === "custom" ? (
                      <div className="flex items-center gap-2 rounded-full bg-primary/10 px-2 py-1">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        <span className="text-xs font-medium text-primary">
                          {t("settings.active") || "Active"}
                        </span>
                      </div>
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <Accordion
                    type="single"
                    collapsible
                    className="mt-2 w-full rounded-lg border-border bg-background text-card-foreground shadow-sm"
                  >
                    <AccordionItem value="light-themes" className="border-0 px-1">
                      <AccordionTrigger className="px-3 py-4 hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {t("settings.lightThemes")}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-4">
                        <div className="grid grid-cols-2 gap-4">
                          {groupedThemes.light.map(t => (
                            <ThemeButton
                              key={t.id}
                              theme={t}
                              currentTheme={theme}
                              onSelect={handleThemeChange}
                            />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem
                      value="dark-themes"
                      className="border-0 border-t border-t-border/20 px-1"
                    >
                      <AccordionTrigger className="px-3 py-4 hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {t("settings.darkThemes")}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-4">
                        <div className="grid grid-cols-2 gap-4">
                          {groupedThemes.dark.map(t => (
                            <ThemeButton
                              key={t.id}
                              theme={t}
                              currentTheme={theme}
                              onSelect={handleThemeChange}
                            />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                <div
                  id="smooth-transitions"
                  className="flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <Label>{t("settings.smoothTransitions")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.smoothTransitionsDescription")}
                    </p>
                  </div>
                  <Switch
                    checked={settings.smoothTransitions}
                    onCheckedChange={() =>
                      handleSettingChange(
                        "smoothTransitions",
                        !settings.smoothTransitions
                      )
                    }
                  />
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
              </div>

              {/* Application Section */}
              <div className="mt-8 space-y-4">
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {t("settings.application")}
                </h3>

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
                    onValueChange={value => handleSettingChange("defaultOpenPage", value)}
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

                <div id="auto-update" className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t("settings.ascendaraUpdates")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.ascendaraUpdatesDescription")}
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoUpdate}
                    onCheckedChange={() =>
                      handleSettingChange("autoUpdate", !settings.autoUpdate)
                    }
                  />
                </div>

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

              {/* Gaming Section */}
              <div className="mt-8 space-y-4">
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {t("settings.gaming")}
                </h3>

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
                      handleSettingChange("hideOnGameLaunch", !settings.hideOnGameLaunch)
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
              </div>
            </Card>

            <Card id="big-picture-settings" className="mb-6 border-border">
              <div className="space-y-4 p-6">
                <h3 className="mb-2 text-xl font-semibold text-primary">
                  {t("settings.bigPictureSettings")}
                </h3>

                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-full p-2 ${controllerConnected ? "bg-green-500/20" : "bg-muted"}`}
                    >
                      <Gamepad2
                        className={`h-5 w-5 ${controllerConnected ? "text-green-500" : "text-muted-foreground"}`}
                      />
                    </div>
                    <div>
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
                    {t("settings.enterBigPicture")}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>{t("settings.controllerType")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.controllerTypeDescription")}
                  </p>
                  <Select
                    value={settings.controllerType || "xbox"}
                    onValueChange={value => handleSettingChange("controllerType", value)}
                  >
                    <SelectTrigger className="w-full">
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

                <div className="space-y-2">
                  <Label>{t("settings.keyboardLayout")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.keyboardLayoutDescription")}
                  </p>
                  <Select
                    value={settings.bigPictureKeyboardLayout || "qwerty"}
                    onValueChange={value =>
                      handleSettingChange("bigPictureKeyboardLayout", value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qwerty">QWERTY</SelectItem>
                      <SelectItem value="azerty">AZERTY</SelectItem>
                      <SelectItem value="qwertz">QWERTZ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            <Card className="mb-6 border-border">
              <div className="space-y-3 p-6">
                <h3 className="mb-2 text-xl font-semibold text-primary">
                  {t("settings.downloaderSettings")}
                </h3>
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
                              <SquareTerminal className="mb-0.5 inline h-4 w-4 cursor-help text-muted-foreground" />
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

                {/* Torbox API Key Config */}
                <div id="torbox-api-key" className="space-y-2">
                  <Label>{t("settings.torboxApiKey")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.torboxApiKeyDescription")}&nbsp;
                    <a
                      onClick={() =>
                        window.electron.openURL(
                          "https://ascendara.app/docs/features/torbox-integration"
                        )
                      }
                      className="cursor inline-flex cursor-pointer items-center text-primary hover:underline"
                    >
                      {t("settings.torboxApiKeyLearnHowtoGet")}
                      <ExternalLink className="ml-1 inline-block h-3 w-3" />
                    </a>
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Input
                    id="torboxApiKey"
                    type="password"
                    placeholder={t("settings.torboxApiKeyPlaceholder")}
                    value={
                      torboxApiKey !== null ? torboxApiKey : settings.torboxApiKey || ""
                    }
                    onChange={e => setTorboxApiKey(e.target.value)}
                    autoComplete="off"
                  />
                  <Button
                    onClick={() => {
                      setSettings(s => ({ ...s, torboxApiKey: torboxApiKey }));
                      toast.success(t("settings.apiKeySaved"));
                      setTorboxApiKey(null);
                    }}
                    disabled={torboxApiKey === null}
                    variant="none"
                    className="text-primary"
                  >
                    {t("settings.setKey")}
                  </Button>
                </div>

                <div id="prioritize-torbox" className="flex items-center justify-between">
                  <div
                    className={`space-y-2${
                      !(
                        (torboxApiKey !== null && torboxApiKey.trim() !== "") ||
                        (settings.torboxApiKey && settings.torboxApiKey.trim() !== "")
                      )
                        ? "pointer-events-none select-none opacity-50"
                        : ""
                    }`}
                  >
                    <Label>{t("settings.prioritizeTorboxOverSeamless")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.prioritizeTorboxOverSeamlessDesc")}&nbsp;
                    </p>
                  </div>
                  <Switch
                    checked={settings.prioritizeTorboxOverSeamless}
                    onCheckedChange={value => {
                      setSettings(prev => ({
                        ...prev,
                        prioritizeTorboxOverSeamless: value,
                      }));
                    }}
                    disabled={
                      !(
                        (torboxApiKey !== null && torboxApiKey.trim() !== "") ||
                        (settings.torboxApiKey && settings.torboxApiKey.trim() !== "")
                      )
                    }
                  />
                </div>

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

                <div id="post-download-behavior" className="space-y-2 pt-8">
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
                <div id="download-limit" className="space-y-2 pt-8">
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
                <div id="download-directory" className="pt-8">
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
                  <div className="border-t border-border/50 pt-6">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className={isDownloaderRunning ? "opacity-50" : ""}>
                        {t("settings.additionalLocations")}
                      </Label>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDownloaderRunning}
                        onClick={async () => {
                          const path = await window.electron.ipcRenderer.invoke(
                            "open-directory-dialog"
                          );
                          if (path) {
                            const newPaths = [
                              ...(settings.additionalDirectories || []),
                              path,
                            ];
                            handleSettingChange("additionalDirectories", newPaths);
                          }
                        }}
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
                          <div
                            key={index}
                            className="group flex items-center gap-2 rounded-md bg-accent/30 p-2 hover:bg-accent/50"
                          >
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
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card id="ludusavi" className="border-border">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-primary">
                      {t("settings.gameBackup.title")}
                    </h3>

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
                    {isOnWindows && !settings.ludusavi.backupLocation && (
                      <div className="mt-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-primary" />
                        <p className="text-sm text-primary">
                          {t("settings.gameBackup.selectLocationToEnable")}
                        </p>
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <div
                        className={`space-y-2 ${!isOnWindows || !settings.ludusavi.backupLocation ? "pointer-events-none opacity-50" : ""}`}
                      >
                        <Label>{t("settings.gameBackup.title")}</Label>
                        <p className="max-w-[70%] text-sm text-muted-foreground">
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
                        {!isOnWindows && (
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                            <p className="whitespace-nowrap text-sm font-bold text-muted-foreground">
                              {t("settings.onlyWindowsSupported2")}
                            </p>
                          </div>
                        )}
                      </div>
                      <Switch
                        checked={settings.ludusavi.enabled}
                        onCheckedChange={value => {
                          handleToggleLudusavi(value);
                          analytics.trackFeatureUsage("gameBackups", { enabled: value });
                        }}
                        disabled={!isOnWindows || !settings.ludusavi.backupLocation}
                      />
                    </div>
                  </div>
                </div>
                <div
                  className={`mt-6 space-y-6 ${!isOnWindows || !settings.ludusavi.enabled ? "pointer-events-none opacity-50" : ""}`}
                >
                  <div className="mt-4 flex items-center justify-between">
                    <div className="space-y-2">
                      <Label>{t("settings.gameBackup.skipManifestCheck")}</Label>
                      <p className="max-w-[70%] text-sm text-muted-foreground">
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
                      disabled={!isOnWindows}
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
            </Card>

            {/* ── Linux Compatibility Layer ── */}
            {isOnLinux && (
              <>
                <Card className="border-border p-6">
                  <div className="space-y-6">
                    <h3 className="mb-2 text-xl font-semibold text-primary">
                      {t("welcome.compatibilityLayer")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.linuxCompat.description")}
                    </p>

                    {/* Runner Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium">
                        {t("settings.linuxCompat.defaultRunner")}
                      </label>
                      <select
                        value={selectedRunner}
                        onChange={async e => {
                          setSelectedRunner(e.target.value);
                          await window.electron.updateSetting(
                            "linuxRunner",
                            e.target.value
                          );
                        }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="auto">
                          {t("settings.linuxCompat.autoDetect")}
                        </option>
                        {runners.map(r => (
                          <option key={r.path} value={r.path}>
                            {r.name} (
                            {r.source === "steam"
                              ? t("settings.linuxCompat.sourceSteam")
                              : r.source === "custom"
                                ? t("settings.linuxCompat.sourceCustom")
                                : t("settings.linuxCompat.sourceSystem")}
                            ){r.version ? ` — v${r.version}` : ""}
                          </option>
                        ))}
                      </select>
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
                      {/* Download / Update Proton-GE */}
                      <Button
                        onClick={async () => {
                          try {
                            const info = await window.electron.getProtonGEInfo();
                            if (!info.success) {
                              console.error("Failed to get Proton-GE info:", info.error);
                              return;
                            }
                            if (info.alreadyInstalled) {
                              const updated = await window.electron.getRunners();
                              setRunners(updated);
                              return;
                            }
                            setProtonGEInfo(info);
                            setShowProtonConfirm(true);
                          } catch (e) {
                            console.error("Failed to get Proton-GE info:", e);
                          }
                        }}
                        disabled={isDownloadingProton}
                        className="gap-2 text-secondary"
                      >
                        {isDownloadingProton ? (
                          <>
                            <Loader className="h-4 w-4 animate-spin" />
                            {t("settings.linuxCompat.downloading")}
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            {runners.some(r => r.name.toLowerCase().includes("ge-proton"))
                              ? t("settings.linuxCompat.updateProtonGE")
                              : t("settings.linuxCompat.downloadProtonGE")}
                          </>
                        )}
                      </Button>

                      {/* Check for Updates */}
                      <Button
                        variant="outline"
                        onClick={async () => {
                          setProtonUpdateStatus("checking");
                          try {
                            const info = await window.electron.checkProtonGEUpdate();
                            if (!info.success) {
                              setProtonUpdateStatus(null);
                              return;
                            }
                            if (info.alreadyInstalled) {
                              setProtonUpdateStatus("up-to-date");
                            } else if (info.updateAvailable) {
                              setProtonUpdateStatus("update-available");
                              setProtonGEInfo(info);
                            } else {
                              setProtonUpdateStatus(null);
                            }
                          } catch (e) {
                            console.error("Failed to check for updates:", e);
                            setProtonUpdateStatus(null);
                          }
                        }}
                        disabled={protonUpdateStatus === "checking"}
                        className="gap-2"
                      >
                        {protonUpdateStatus === "checking" ? (
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

                      <Button
                        variant="outline"
                        onClick={async () => {
                          const result = await window.electron.selectCustomRunner();
                          if (result.success) {
                            setSelectedRunner(result.path);
                            await window.electron.updateSetting(
                              "linuxRunner",
                              result.path
                            );
                            const updated = await window.electron.getRunners();
                            setRunners(updated);
                          } else if (result.error) {
                            console.error("Custom runner error:", result.error);
                          }
                        }}
                        className="gap-2"
                      >
                        <FolderOpen className="h-4 w-4" />
                        {t("settings.linuxCompat.selectCustomRunner")}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={async () => {
                          const updated = await window.electron.getRunners();
                          setRunners(updated);
                        }}
                        className="gap-2"
                      >
                        <FolderSync className="h-4 w-4" />
                        {t("settings.linuxCompat.refresh")}
                      </Button>
                    </div>

                    {/* Update Status Message */}
                    {protonUpdateStatus === "up-to-date" && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                        <FileCheck2 className="h-4 w-4 text-green-500" />
                        <p className="text-sm text-green-500">
                          {t("settings.linuxCompat.upToDate")}
                        </p>
                      </div>
                    )}

                    {protonUpdateStatus === "update-available" && protonGEInfo && (
                      <div className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          <p className="text-sm text-yellow-500">
                            {t("settings.linuxCompat.updateAvailable", {
                              version: protonGEInfo.latestVersion,
                            })}
                            {protonGEInfo.installedVersions.length > 0 && (
                              <span className="text-yellow-500/70">
                                {" "}
                                {t("settings.linuxCompat.updateAvailableCurrent", {
                                  version: protonGEInfo.installedVersions[0],
                                })}
                              </span>
                            )}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setShowProtonConfirm(true)}
                          className="gap-1"
                        >
                          <Download className="h-3 w-3" />
                          {t("settings.linuxCompat.update")}
                        </Button>
                      </div>
                    )}

                    {/* Info Box */}
                    <div className="rounded-lg border border-border bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">
                        <strong>Proton</strong> {t("settings.linuxCompat.infoBoxProton")}{" "}
                        <strong>Wine</strong> {t("settings.linuxCompat.infoBoxWine")}
                      </p>
                    </div>
                  </div>
                </Card>
                {/* Proton-GE Download Confirmation Dialog */}
                <AlertDialog
                  open={showProtonConfirm && !!protonGEInfo}
                  onOpenChange={open => {
                    if (!open) {
                      setShowProtonConfirm(false);
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
                                    versions: protonGEInfo.installedVersions.join(", "),
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
                              gb: (protonGEInfo.size / (1024 * 1024 * 1024)).toFixed(1),
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
                          setShowProtonConfirm(false);
                          setProtonGEInfo(null);
                        }}
                      >
                        {t("settings.linuxCompat.protonConfirm.cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          setShowProtonConfirm(false);
                          setProtonUpdateStatus(null);
                          setIsDownloadingProton(true);
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
                          setIsDownloadingProton(false);
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
              </>
            )}

            {/* Achievement Watcher Directories Card */}
            <Card className="border-border p-6">
              <h3 className="mb-2 text-xl font-semibold text-primary">
                {t("settings.achievementWatcher.title") ||
                  "Achievement Watcher Directories"}
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {t("settings.achievementWatcher.description") ||
                  "Configure which directories are monitored for achievement tracking. Add folders where your games are installed to enable achievement tracking for those games."}
              </p>
              {/* Default Directories Section */}
              {isOnWindows && (
                <div className="mb-6">
                  <div className="mb-1 flex items-center gap-2">
                    <FolderOpen className="text-primary-foreground h-4 w-4" />
                    <span className="text-primary-foreground font-medium">
                      {t("settings.achievementWatcher.defaultDirs") ||
                        "Default directories always tracked:"}
                    </span>
                  </div>
                  <div className="ml-6 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>Public/Documents/Steam/CODEX</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>Public/Documents/Steam/RUNE</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>Public/Documents/EMPRESS</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>Public/Documents/OnlineFix</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>AppData/Roaming/GSE Saves</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>AppData/Roaming/Steam/CODEX</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>AppData/Roaming/EMPRESS</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>AppData/Roaming/Goldberg SteamEmu Saves</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>AppData/Roaming/SmartSteamEmu</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>ProgramData/Steam</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      <span>LocalAppData/SKIDROW</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs italic text-muted-foreground">
                    {t("settings.achievementWatcher.defaultDirsNote") ||
                      "These directories and files are always tracked by default and cannot be removed."}
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {/* List user-added directories */}
                {settings.watchingFolders && settings.watchingFolders.length > 0 ? (
                  <ul className="mb-3 space-y-2">
                    {settings.watchingFolders.map((dir, idx) => (
                      <li key={dir} className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate" title={dir}>
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
                  <div className="mb-3 text-sm text-muted-foreground">
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
            </Card>

            {/* Torrenting Card */}
            <Card id="torrent-downloads" className="border-border p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-primary">
                    {t("settings.torrenting")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("settings.torrentingDescription")}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Torrent Support */}
                <div className="rounded-lg border bg-card">
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">
                            {t("settings.torrentOnAscendara")}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            <FlaskConical className="mr-1 h-4 w-4" />
                            {t("settings.experimental")}
                          </Badge>
                        </div>
                        <p className="max-w-[600px] text-sm text-muted-foreground">
                          {t("settings.torrentDescription")}
                        </p>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Switch
                                checked={settings.torrentEnabled}
                                onCheckedChange={handleTorrentToggle}
                                disabled={!isOnWindows}
                              />
                            </div>
                          </TooltipTrigger>
                          {!isOnWindows && (
                            <TooltipContent>
                              <p className="text-secondary">
                                {t("settings.onlyWindowsSupported")}
                              </p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {settings.torrentEnabled && (
                      <div className="mt-6">
                        <div className="rounded-lg bg-muted/30 p-4">
                          <div className="flex items-center gap-2 text-sm">
                            <QbittorrentStatus />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column - Additional Settings */}
          <div className="space-y-6 lg:col-span-4">
            <Card className="border-border p-6">
              <div className="mb-2 flex items-center gap-2">
                <MessageCircleQuestion className="mb-2 h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-primary">
                  {t("settings.quickSupport")}
                </h2>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                {t("settings.supportDesc")}
              </p>
              <Button
                className="flex w-full items-center gap-2 text-secondary"
                onClick={() => {
                  setSupportCode(["", "", "", "", "", ""]);
                  setShowSupportDialog(true);
                }}
              >
                {t("settings.getHelp")}
              </Button>
            </Card>

            {/* Analytics Card */}
            <Card id="analytics" className="border-border p-6">
              <div className="mb-2 flex items-center gap-2">
                <ChartNoAxesCombined className="mb-2 h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-primary">
                  {t("settings.ascendaraAnalytics")}
                </h2>
              </div>
              <div className="space-y-6">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("settings.ascendaraAnalyticsDescription")}&nbsp;
                    <a
                      className="inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                      onClick={() =>
                        window.electron.openURL("https://ascendara.app/analytics")
                      }
                    >
                      {t("common.learnMore")}
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </p>
                  <div className="flex items-center justify-between space-x-4">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        {t("settings.ascendaraToggleAnalytics")}
                      </Label>
                    </div>
                    <Switch
                      checked={settings.sendAnalytics}
                      onCheckedChange={() =>
                        handleSettingChange("sendAnalytics", !settings.sendAnalytics)
                      }
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Timemachine Card */}
            <Card id="timemachine" className="border-border p-6">
              <div className="mb-2 flex items-center gap-2">
                <History className="mb-2 h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-primary">
                  {t("settings.ascendaraTimechine")}
                </h2>
              </div>
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
                        analytics.trackFeatureUsage("ascendaraTimechine", {
                          enabled: value,
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Workshop Downloader Card */}
            <Card id="workshop-downloader" className="border-border p-6">
              <div className="mb-2 flex items-center gap-2">
                <Package className="mb-2 h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-primary">
                  {t("settings.ascendaraWorkshopDownloader")}
                </h2>
              </div>
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
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Switch
                              checked={settings.viewWorkshopPage}
                              disabled={!isOnWindows}
                              onCheckedChange={value => {
                                handleSettingChange("viewWorkshopPage", value);
                                analytics.trackFeatureUsage(
                                  "ascendaraWorkshopDownloader",
                                  { enabled: value }
                                );
                              }}
                            />
                          </div>
                        </TooltipTrigger>
                        {!isOnWindows && (
                          <TooltipContent>
                            <p className="text-secondary">
                              {t("settings.onlyWindowsSupported2")}
                            </p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
            </Card>

            {/* Components Card */}
            {isOnWindows && (
              <Card id="components" className="border-border p-6">
                <div className="mb-2 flex items-center gap-2">
                  <CpuIcon className="mb-2 h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold text-primary">
                    {t("settings.components")}
                  </h2>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  {t("settings.componentsDescription")}
                </p>
                <Button
                  onClick={() => navigate("/sidecaranddependencies")}
                  className="flex w-full items-center gap-2 text-secondary"
                >
                  {t("settings.viewComponentsPage")}
                </Button>
              </Card>
            )}

            {/* Language Settings Card */}
            <Card id="language" className="border-border p-6">
              <div className="mb-2 flex items-center gap-2">
                <Languages className="mb-2 h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-primary">
                  {t("settings.languageSettings")}
                </h2>
              </div>
              <div className="space-y-6">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("settings.languageSettingsDescription")}
                  </p>
                  <Select
                    value={language}
                    onValueChange={value => {
                      handleLanguageChange(value);
                      changeLanguage(value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <span>
                            {availableLanguages.find(l => l.id === language)?.icon}
                          </span>
                          <span>
                            {availableLanguages.find(l => l.id === language)?.name}
                          </span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableLanguages.map(lang => (
                        <SelectItem key={lang.id} value={lang.id}>
                          <div className="flex items-center gap-2">
                            <span>{lang.icon}</span>
                            <span>{lang.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p
                    className="text-md inline-flex cursor-pointer items-center font-medium text-muted-foreground duration-200 hover:translate-x-1"
                    onClick={() => navigate("/extralanguages")}
                  >
                    {t("settings.selectMoreLanguages")}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.languageSetNote")}
                  </p>
                </div>
              </div>
            </Card>

            {/* Developer Settings Card - Only shown in development mode or on Linux */}
            {(isDev || isOnLinux) && (
              <Card className="border-border p-6">
                <div className="space-y-6">
                  <div>
                    <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-primary">
                      <CircleAlert size={20} />
                      Developer Tools
                    </h2>
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
                        </>
                      )}
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
              </Card>
            )}

            {/* App Branch Card */}
            <Card className="overflow-hidden border-border p-0">
              <div className="border-b border-border px-6 py-4">
                <div className="flex items-center gap-2">
                  <FlaskConical className="mb-2 h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-primary">
                    {t("settings.appBranch.title")}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("settings.appBranch.description")}
                </p>
              </div>
              <div className="divide-y divide-border">
                {[
                  {
                    id: "live",
                    label: t("settings.appBranch.live.label"),
                    description: t("settings.appBranch.live.description"),
                    color: "text-emerald-500",
                    dotColor: "bg-emerald-500",
                    ringColor: "ring-emerald-500/30",
                    activeBg: "bg-emerald-500/8",
                    activeBorder: "border-l-emerald-500",
                  },
                  {
                    id: "public-testing",
                    label: t("settings.appBranch.publicTesting.label"),
                    description: t("settings.appBranch.publicTesting.description"),
                    color: "text-yellow-500",
                    dotColor: "bg-yellow-500",
                    ringColor: "ring-yellow-500/30",
                    activeBg: "bg-yellow-500/8",
                    activeBorder: "border-l-yellow-500",
                  },
                  {
                    id: "experimental",
                    label: t("settings.appBranch.experimental.label"),
                    description: t("settings.appBranch.experimental.description"),
                    color: "text-red-400",
                    dotColor: "bg-red-400",
                    ringColor: "ring-red-400/30",
                    activeBg: "bg-red-400/8",
                    activeBorder: "border-l-red-400",
                    requiresSubscription: true,
                  },
                ].map(branch => {
                  const isActive = currentBranch === branch.id;
                  const isLocked = branch.requiresSubscription && !hasAscendSubscription;
                  return (
                    <button
                      key={branch.id}
                      disabled={isActive}
                      onClick={() => {
                        if (isActive) return;

                        // Show Ascend promo dialog if locked
                        if (isLocked) {
                          setShowAscendPromoDialog(true);
                          return;
                        }

                        // Check if branch versions are available
                        if (branchVersions) {
                          const liveVersion = branchVersions.live;
                          const targetVersion = branchVersions[branch.id];

                          // If switching to public-testing or experimental, check if version differs from live
                          if (branch.id !== "live" && liveVersion === targetVersion) {
                            setNoBranchMessage(
                              `There is no ${branch.label} version available at the moment. The ${branch.label} branch is currently on the same version as Live (v${liveVersion}).`
                            );
                            setShowNoBranchDialog(true);
                            return;
                          }
                        }

                        setPendingBranch(branch);
                        setShowBranchDialog(true);
                      }}
                      className={[
                        "group flex w-full items-center gap-4 border-l-4 px-6 py-4 text-left transition-all duration-150",
                        isActive
                          ? `${branch.activeBorder} ${branch.activeBg} cursor-default`
                          : "cursor-pointer border-l-transparent hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <div className="relative flex-shrink-0">
                        <span
                          className={[
                            "flex h-9 w-9 items-center justify-center rounded-full ring-2",
                            isActive
                              ? `${branch.dotColor} bg-opacity-20 ${branch.ringColor}`
                              : "bg-muted ring-border",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "h-3 w-3 rounded-full",
                              isActive ? "bg-white" : branch.dotColor,
                            ].join(" ")}
                          />
                        </span>
                        {isActive && (
                          <span
                            className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${branch.dotColor} animate-pulse`}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              "text-sm font-semibold",
                              isActive ? branch.color : "text-foreground",
                            ].join(" ")}
                          >
                            {branch.label}
                          </span>
                          {isActive && (
                            <Badge
                              variant="secondary"
                              className={`text-xs ${branch.color} border-current/20 bg-current/10`}
                            >
                              Active
                            </Badge>
                          )}
                          {isLocked && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-yellow-500/30 text-xs text-yellow-500"
                            >
                              <Star className="h-3 w-3" />
                              Ascend
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {branch.description}
                        </p>
                      </div>
                      {!isActive && !isLocked && (
                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Notice Card */}
            <Card className="border-border border-yellow-500/50 bg-yellow-500/5 p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-yellow-500">
                  <Hand className="h-5 w-5 scale-x-[-1]" />
                  <h2 className="mb-0 text-lg font-semibold">
                    {t("settings.warningTitle")}
                  </h2>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("settings.warningDescription")}
                </p>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("settings.warningSupportDevelopers")}
                </p>

                <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
                  <span>{t("settings.warningSupportDevelopersCallToAction")}</span>
                </div>
              </div>
            </Card>
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
            <div className="space-y-3 text-muted-foreground">
              <p>
                {t("settings.appBranch.switchDialog.description")}{" "}
                <strong>{pendingBranch?.label}</strong>{" "}
                {t("settings.appBranch.switchDialog.installer")}
              </p>
              {branchVersions && pendingBranch?.id && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Current Version (Live):</span>
                    <span className="font-semibold text-foreground">
                      v{branchVersions.live}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {pendingBranch.label} Version:
                    </span>
                    <span className="font-semibold text-primary">
                      v{branchVersions[pendingBranch.id]}
                    </span>
                  </div>
                </div>
              )}
              {pendingBranch?.id === "experimental" && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
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
                    toast.error(result?.error || "Failed to switch branch");
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

      {/* No Branch Available Dialog */}
      <AlertDialog open={showNoBranchDialog} onOpenChange={setShowNoBranchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("settings.noBranchDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-muted-foreground">
              {noBranchMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("settings.noBranchDialog.close")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ascend Promo Dialog */}
      <AlertDialog open={showAscendPromoDialog} onOpenChange={setShowAscendPromoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Star className="h-6 w-6 text-yellow-500" />
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
                    <Star className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{t("settings.ascendPromoDialog.benefit2")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Star className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
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
                window.electron?.openURL("https://ascendara.app/ascend");
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

      {/* No Torrent Tool Dialog */}
      <AlertDialog open={showNoTorrentDialog} onOpenChange={setShowNoTorrentDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("settings.noTorrentTool")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("settings.noTorrentToolDesc")}
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
                  await window.electron.installTool("torrent");
                } catch (error) {
                  console.error("Failed to install torrent tool:", error);
                } finally {
                  setIsDownloading(false);
                  if (!error) {
                    setShowNoTorrentDialog(false);
                  }
                }
              }}
              disabled={isDownloading}
            >
              {isDownloading ? t("common.downloading") : t("welcome.continue")}
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
                  await window.electron.installTool("ludusavi");
                  setShowNoLudusaviDialog(false);
                } catch (error) {
                  console.error("Failed to install Ludusavi:", error);
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

      {/* Custom Colors Dialog */}
      <AlertDialog open={showCustomColorsDialog}>
        <AlertDialogContent className="max-h-[95vh] max-w-6xl overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Palette />
              {t("settings.customColors") || "Customize Theme"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("settings.customColorsDescription") ||
                "Customize each color in your theme."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {(selectedThemeVersion === 1 || selectedThemeVersion === "1") && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-500">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                {t("settings.legacyThemeWarning") ||
                  "This theme uses an older format and may be missing some color options. Some colors will use default values."}
              </span>
            </div>
          )}

          <div className="space-y-4 py-4">
            {/* Core Colors */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                Core
              </h4>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                <ColorPickerInput
                  colorKey="background"
                  label="Background"
                  value={customColors.background}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="foreground"
                  label="Text"
                  value={customColors.foreground}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="primary"
                  label="Primary"
                  value={customColors.primary}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="secondary"
                  label="Secondary"
                  value={customColors.secondary}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="accent"
                  label="Accent"
                  value={customColors.accent}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="accentForeground"
                  label="Accent Text"
                  value={customColors.accentForeground}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="muted"
                  label="Muted"
                  value={customColors.muted}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="mutedForeground"
                  label="Muted Text"
                  value={customColors.mutedForeground}
                  onColorChange={handleCustomColorChange}
                />
              </div>
            </div>

            {/* Cards & Surfaces */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                Surfaces
              </h4>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                <ColorPickerInput
                  colorKey="card"
                  label="Card"
                  value={customColors.card}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="cardForeground"
                  label="Card Text"
                  value={customColors.cardForeground}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="popover"
                  label="Popover"
                  value={customColors.popover}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="popoverForeground"
                  label="Popover Text"
                  value={customColors.popoverForeground}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="border"
                  label="Border"
                  value={customColors.border}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="input"
                  label="Input"
                  value={customColors.input}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="ring"
                  label="Focus Ring"
                  value={customColors.ring}
                  onColorChange={handleCustomColorChange}
                />
              </div>
            </div>

            {/* Navigation */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                Navigation
              </h4>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                <ColorPickerInput
                  colorKey="navBackground"
                  label="Background"
                  value={customColors.navBackground}
                  onColorChange={handleCustomColorChange}
                />
              </div>
            </div>

            {/* Status & Feedback */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                Status
              </h4>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                <ColorPickerInput
                  colorKey="success"
                  label="Success"
                  value={customColors.success}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="warning"
                  label="Warning"
                  value={customColors.warning}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="error"
                  label="Error"
                  value={customColors.error}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="info"
                  label="Info"
                  value={customColors.info}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="starFilled"
                  label="Star Filled"
                  value={customColors.starFilled}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="starEmpty"
                  label="Star Empty"
                  value={customColors.starEmpty}
                  onColorChange={handleCustomColorChange}
                />
              </div>
            </div>

            {/* Startup Screen */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                Startup
              </h4>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                <ColorPickerInput
                  colorKey="startupBackground"
                  label="Background"
                  value={customColors.startupBackground}
                  onColorChange={handleCustomColorChange}
                />
                <ColorPickerInput
                  colorKey="startupAccent"
                  label="Accent"
                  value={customColors.startupAccent}
                  onColorChange={handleCustomColorChange}
                />
              </div>
            </div>

            {/* Live Preview */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">
                {t("settings.colorSection.preview") || "Live Preview"}
              </h4>
              <div
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: `rgb(${customColors.background})`,
                  borderColor: `rgb(${customColors.border})`,
                }}
              >
                {/* Card Preview */}
                <div
                  className="rounded-md border p-4"
                  style={{
                    backgroundColor: `rgb(${customColors.card})`,
                    borderColor: `rgb(${customColors.border})`,
                  }}
                >
                  <p
                    className="text-base font-semibold"
                    style={{ color: `rgb(${customColors.cardForeground})` }}
                  >
                    {t("settings.preview.cardTitle")}
                  </p>
                  <p
                    className="mt-1 text-sm"
                    style={{ color: `rgb(${customColors.mutedForeground})` }}
                  >
                    {t("settings.preview.cardDescription")}
                  </p>

                  {/* Buttons */}
                  <div className="mt-4 flex gap-2">
                    <button
                      className="rounded-md px-3 py-1.5 text-sm font-medium"
                      style={{
                        backgroundColor: `rgb(${customColors.primary})`,
                        color: `rgb(${customColors.secondary})`,
                      }}
                    >
                      {t("settings.preview.primaryButton")}
                    </button>
                    <button
                      className="rounded-md border px-3 py-1.5 text-sm font-medium"
                      style={{
                        backgroundColor: `rgb(${customColors.secondary})`,
                        borderColor: `rgb(${customColors.border})`,
                        color: `rgb(${customColors.foreground})`,
                      }}
                    >
                      {t("settings.preview.secondaryButton")}
                    </button>
                    <button
                      className="rounded-md px-3 py-1.5 text-sm font-medium"
                      style={{
                        backgroundColor: `rgb(${customColors.accent})`,
                        color: `rgb(${customColors.accentForeground})`,
                      }}
                    >
                      {t("settings.preview.accentButton")}
                    </button>
                  </div>

                  {/* Toggle Preview */}
                  <div className="mt-4 flex items-center gap-3">
                    <div
                      className="h-5 w-9 rounded-full p-0.5"
                      style={{ backgroundColor: `rgb(${customColors.primary})` }}
                    >
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{
                          backgroundColor: `rgb(${customColors.card})`,
                          marginLeft: "auto",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        color: `rgb(${customColors.foreground})`,
                        fontSize: "14px",
                      }}
                    >
                      {t("settings.preview.toggleEnabled")}
                    </span>
                  </div>

                  {/* Input Preview */}
                  <div className="mt-4">
                    <div
                      className="rounded-md border px-3 py-2 text-sm"
                      style={{
                        backgroundColor: `rgb(${customColors.background})`,
                        borderColor: `rgb(${customColors.input})`,
                        color: `rgb(${customColors.foreground})`,
                      }}
                    >
                      {t("settings.preview.inputPlaceholder")}
                    </div>
                  </div>

                  {/* Badge/Muted Preview */}
                  <div className="mt-4 flex gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor: `rgb(${customColors.muted})`,
                        color: `rgb(${customColors.mutedForeground})`,
                      }}
                    >
                      {t("settings.preview.badge")}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor: `rgb(${customColors.accent})`,
                        color: `rgb(${customColors.accentForeground})`,
                      }}
                    >
                      {t("settings.preview.accentBadge")}
                    </span>
                  </div>
                </div>

                {/* Popover Preview */}
                <div
                  className="mt-3 rounded-md border p-3 shadow-sm"
                  style={{
                    backgroundColor: `rgb(${customColors.popover})`,
                    borderColor: `rgb(${customColors.border})`,
                  }}
                >
                  <p
                    className="text-sm font-medium"
                    style={{ color: `rgb(${customColors.popoverForeground})` }}
                  >
                    {t("settings.preview.popoverTitle")}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: `rgb(${customColors.mutedForeground})` }}
                  >
                    {t("settings.preview.popoverDescription")}
                  </p>
                </div>

                {/* Navigation Bar Preview */}
                <div
                  className="mt-3 rounded-xl border p-2"
                  style={{
                    backgroundColor: `rgb(${customColors.navBackground} / 0.8)`,
                    borderColor: `rgb(${customColors.border})`,
                  }}
                >
                  <p
                    className="mb-2 text-xs font-medium"
                    style={{ color: `rgb(${customColors.mutedForeground})` }}
                  >
                    {t("settings.preview.navBar") || "Navigation Bar"}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 text-white">
                      <Home className="h-4 w-4" />
                    </div>
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{
                        color: `rgb(${customColors.mutedForeground})`,
                      }}
                    >
                      <Search className="h-4 w-4" />
                    </div>
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{
                        color: `rgb(${customColors.mutedForeground})`,
                      }}
                    >
                      <Library className="h-4 w-4" />
                    </div>
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{
                        color: `rgb(${customColors.mutedForeground})`,
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </div>
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{
                        color: `rgb(${customColors.mutedForeground})`,
                      }}
                    >
                      <Settings2 className="h-4 w-4" />
                    </div>
                  </div>
                </div>

                {/* Star Rating Preview */}
                <div className="mt-3">
                  <p
                    className="mb-2 text-xs font-medium"
                    style={{ color: `rgb(${customColors.mutedForeground})` }}
                  >
                    {t("settings.preview.starRating") || "Star Rating"}
                  </p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star
                        key={i}
                        className="h-5 w-5"
                        style={{
                          fill:
                            i <= 3 ? `rgb(${customColors.starFilled})` : "transparent",
                          color:
                            i <= 3
                              ? `rgb(${customColors.starFilled})`
                              : `rgb(${customColors.starEmpty})`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Toast/Notification Previews */}
                <div className="mt-3 space-y-2">
                  <p
                    className="text-xs font-medium"
                    style={{ color: `rgb(${customColors.mutedForeground})` }}
                  >
                    {t("settings.preview.notifications") || "Notifications"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <div
                      className="flex items-center gap-1.5 rounded-lg border px-2 py-1"
                      style={{
                        backgroundColor: `rgb(${customColors.background} / 0.85)`,
                        borderColor: `rgb(${customColors.success} / 0.5)`,
                      }}
                    >
                      <CheckCircle
                        className="h-3 w-3"
                        style={{ color: `rgb(${customColors.success})` }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: `rgb(${customColors.foreground})` }}
                      >
                        {t("settings.preview.success") || "Success"}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-1.5 rounded-lg border px-2 py-1"
                      style={{
                        backgroundColor: `rgb(${customColors.background} / 0.85)`,
                        borderColor: `rgb(${customColors.warning} / 0.5)`,
                      }}
                    >
                      <AlertTriangle
                        className="h-3 w-3"
                        style={{ color: `rgb(${customColors.warning})` }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: `rgb(${customColors.foreground})` }}
                      >
                        {t("settings.preview.warning") || "Warning"}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-1.5 rounded-lg border px-2 py-1"
                      style={{
                        backgroundColor: `rgb(${customColors.background} / 0.85)`,
                        borderColor: `rgb(${customColors.error} / 0.5)`,
                      }}
                    >
                      <X
                        className="h-3 w-3"
                        style={{ color: `rgb(${customColors.error})` }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: `rgb(${customColors.foreground})` }}
                      >
                        {t("settings.preview.error") || "Error"}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-1.5 rounded-lg border px-2 py-1"
                      style={{
                        backgroundColor: `rgb(${customColors.background} / 0.85)`,
                        borderColor: `rgb(${customColors.info} / 0.5)`,
                      }}
                    >
                      <Info
                        className="h-3 w-3"
                        style={{ color: `rgb(${customColors.info})` }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: `rgb(${customColors.foreground})` }}
                      >
                        {t("settings.preview.info") || "Info"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Startup Screen Preview */}
                <div
                  className="mt-3 rounded-lg border p-3"
                  style={{
                    backgroundColor: `rgb(${customColors.startupBackground})`,
                    borderColor: `rgb(${customColors.border})`,
                  }}
                >
                  <p
                    className="mb-2 text-xs font-medium"
                    style={{ color: `rgb(${customColors.mutedForeground})` }}
                  >
                    {t("settings.preview.startupScreen") || "Startup Screen"}
                  </p>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-6 w-6 rounded-full"
                      style={{ backgroundColor: `rgb(${customColors.startupAccent})` }}
                    />
                    <div className="flex-1">
                      <div
                        className="mb-1 h-2 w-16 rounded"
                        style={{ backgroundColor: `rgb(${customColors.startupAccent})` }}
                      />
                      <div
                        className="h-1.5 w-24 rounded opacity-50"
                        style={{ backgroundColor: `rgb(${customColors.foreground})` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Browse Public Themes Button */}
              <Button
                variant="outline"
                className="mt-3 w-full gap-2 text-primary"
                onClick={handleBrowsePublicThemes}
              >
                <Globe className="h-4 w-4" />
                {t("settings.browsePublicThemes") || "Browse Community Themes"}
              </Button>
            </div>
          </div>

          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportTheme}
                className="gap-1 text-primary"
              >
                <DownloadIcon className="h-4 w-4" />
                {t("settings.importTheme") || "Import"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportTheme}
                className="gap-1 text-primary"
              >
                <UploadIcon className="h-4 w-4" />
                {t("settings.exportTheme") || "Export"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="text-primary"
                onClick={() => {
                  if (originalColorsOnOpen) {
                    setCustomColors(originalColorsOnOpen);
                  }
                  setShowCustomColorsDialog(false);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button className="text-secondary" onClick={handleSaveCustomColors}>
                {t("settings.applyCustomColors") || "Apply Colors"}
              </Button>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Public Themes Dialog */}
      <AlertDialog open={showPublicThemesDialog} onOpenChange={setShowPublicThemesDialog}>
        <AlertDialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Palette />
              {t("settings.communityThemes") || "Community Themes"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("settings.communityThemesDescription")}&nbsp;
              <a
                className="cursor-pointer text-primary hover:underline"
                onClick={() => window.electron.openURL("https://ascendara.app/discord")}
              >
                {t("settings.joinDiscord")}
                <ExternalLink className="mb-1 ml-1 inline-block h-3 w-3" />
              </a>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            {loadingPublicThemes ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : publicThemes.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                {t("settings.noPublicThemes") || "No community themes available yet."}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {publicThemes.map((theme, index) => (
                  <div
                    key={index}
                    className="cursor-pointer rounded-lg border border-border p-3 transition-all hover:border-primary hover:shadow-md"
                    onClick={() =>
                      handleApplyPublicTheme(theme.colors || theme, theme.version)
                    }
                  >
                    {/* Theme Preview */}
                    <div
                      className="mb-2 rounded-md p-3"
                      style={{
                        backgroundColor: `rgb(${theme.colors?.background || theme.background})`,
                      }}
                    >
                      <div
                        className="rounded p-2"
                        style={{
                          backgroundColor: `rgb(${theme.colors?.card || theme.card})`,
                        }}
                      >
                        <div
                          className="mb-1 h-2 w-16 rounded"
                          style={{
                            backgroundColor: `rgb(${theme.colors?.primary || theme.primary})`,
                          }}
                        />
                        <div
                          className="h-1.5 w-10 rounded opacity-50"
                          style={{
                            backgroundColor: `rgb(${theme.colors?.foreground || theme.foreground})`,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex gap-1">
                        <div
                          className="h-4 w-4 rounded"
                          style={{
                            backgroundColor: `rgb(${theme.colors?.primary || theme.primary})`,
                          }}
                        />
                        <div
                          className="h-4 w-4 rounded"
                          style={{
                            backgroundColor: `rgb(${theme.colors?.accent || theme.accent})`,
                          }}
                        />
                        <div
                          className="h-4 w-4 rounded"
                          style={{
                            backgroundColor: `rgb(${theme.colors?.secondary || theme.secondary})`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {theme.name || `Theme ${index + 1}`}
                      </p>
                      {(theme.version === 1 || theme.version === "1") && (
                        <span className="flex items-center gap-1 rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-500">
                          <AlertTriangle className="h-3 w-3" />
                          OUTDATED
                        </span>
                      )}
                    </div>
                    {theme.author && (
                      <p className="text-xs text-muted-foreground">
                        {t("settings.themeBy") || "by"} {theme.author}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <Button
              variant="outline"
              className="text-primary"
              onClick={() => {
                setShowPublicThemesDialog(false);
                setShowCustomColorsDialog(true);
              }}
            >
              {t("common.back") || "Back"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Support Code Dialog */}
      <AlertDialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <MessageCircleQuestion className="h-6 w-6" />
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
            <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <ShieldAlert className="h-5 w-5 text-yellow-500" />
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
                  const validateResponse = await fetch(
                    "https://api.ascendara.app/support/validate",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ code }),
                    }
                  );

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
                  const AUTHORIZATION = await window.electron.getAPIKey();
                  const tokenResponse = await fetch(
                    "https://api.ascendara.app/auth/token",
                    {
                      headers: { Authorization: AUTHORIZATION },
                    }
                  );

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

const QbittorrentStatus = () => {
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState({ checking: true });
  const [showConfigAlert, setShowConfigAlert] = useState(false);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkQbittorrentStatus();
      setStatus(result);
    } catch (error) {
      console.error("Error checking qBittorrent status:", error);
      setStatus({ active: false, error: error.message });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-2">
        {checking ? (
          <>
            <Loader className="h-4 w-4 animate-spin" />
            <span>{t("app.qbittorrent.checking")}</span>
          </>
        ) : status.active ? (
          <>
            <Badge className="h-2 w-2 rounded-full bg-green-500" />
            <span>{t("app.qbittorrent.active", { version: status.version })}</span>
          </>
        ) : (
          <>
            <Badge className="h-2 w-2 rounded-full bg-red-500" />
            <span>
              {status.error ? (
                <>
                  {t("app.qbittorrent.inactiveWithError", { error: status.error })}
                  <button
                    onClick={() => setShowConfigAlert(true)}
                    className="ml-2 underline"
                  >
                    {t("settings.checkConfig")}
                  </button>
                </>
              ) : (
                t("app.qbittorrent.inactive")
              )}
            </span>
          </>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={checkStatus}
        disabled={checking}
        className="h-8 w-8"
      >
        <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
      </Button>
      <AlertDialog open={showConfigAlert} onOpenChange={setShowConfigAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("app.qbittorrent.configRequired")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-muted-foreground">
              {t("app.qbittorrent.configInstructions")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("common.ok")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function ThemeButton({ theme, currentTheme, onSelect }) {
  const colors = getThemeColors(theme.id);

  return (
    <button
      onClick={() => onSelect(theme.id)}
      className={`group relative overflow-hidden rounded-xl transition-all ${
        currentTheme === theme.id
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "hover:ring-1 hover:ring-primary/50"
      }`}
    >
      <div className={`aspect-[4/3] ${colors.bg} border border-border`}>
        <div className="h-full p-4">
          <div className={`h-full rounded-lg ${colors.secondary} p-3 shadow-sm`}>
            <div className="space-y-2">
              <div className={`h-3 w-24 rounded-full ${colors.primary} opacity-80`} />
              <div className={`h-2 w-16 rounded-full ${colors.primary} opacity-40`} />
            </div>
            <div className="mt-4 space-y-2">
              <div className={`h-8 rounded-md ${colors.bg} bg-opacity-50`} />
              <div className={`h-8 rounded-md ${colors.bg} bg-opacity-30`} />
            </div>
          </div>
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 p-3 ${colors.bg} bg-opacity-80 backdrop-blur-sm`}
      >
        <div className="flex items-center justify-between">
          <span className={`font-medium ${colors.text}`}>{theme.name}</span>
          <div className={`h-3 w-3 rounded-full ${colors.primary}`} />
        </div>
      </div>
    </button>
  );
}

export default Settings;
