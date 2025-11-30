import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
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
  ClockAlert,
  Clock,
  FlaskConical,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Zap,
  Battery,
  BatteryMedium,
  BatteryLow,
  BatteryFull,
  SquareTerminal,
  ChevronDown,
  Package,
  AlertTriangle,
  Car,
  MonitorDot,
  CircleCheck,
  MinusCircle,
  Code,
  SquareCode,
  CpuIcon,
  CornerDownRight,
  Database,
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

// Move debounce helper function up
function createDebouncedFunction(func, wait) {
  let timeoutId;

  const debouncedFn = (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };

  debouncedFn.cancel = () => {
    clearTimeout(timeoutId);
  };

  return debouncedFn;
}

function Settings() {
  const { theme, setTheme } = useTheme();
  const { language, changeLanguage, t } = useLanguage();
  const { settings, setSettings } = useSettings();
  const navigate = useNavigate();
  const [isInitialized, setIsInitialized] = useState(false);
  const initialSettingsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState("none");
  const [isTriggering, setIsTriggering] = useState(false);
  const [apiMetadata, setApiMetadata] = useState(null);
  const [fitgirlMetadata, setFitgirlMetadata] = useState(null);
  const [torboxApiKey, setTorboxApiKey] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnWindows, setIsOnWindows] = useState(null);
  const [downloadPath, setDownloadPath] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const [canCreateFiles, setCanCreateFiles] = useState(true);
  const [isDownloaderRunning, setIsDownloaderRunning] = useState(false);
  const [showTorrentWarning, setShowTorrentWarning] = useState(false);
  const [showNoTorrentDialog, setShowNoTorrentDialog] = useState(false);
  const [showNoLudusaviDialog, setShowNoLudusaviDialog] = useState(false);
  const [twitchSecret, setTwitchSecret] = useState("");
  const [twitchClientId, setTwitchClientId] = useState("");
  const [showReloadDialog, setShowReloadDialog] = useState(false);
  const [reloadMessage, setReloadMessage] = useState("");
  const [pendingSourceChange, setPendingSourceChange] = useState(null);
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [isExperiment, setIsExperiment] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [exclusionLoading, setExclusionLoading] = useState(false);

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
    if (settings.twitchSecret) {
      setTwitchSecret(settings.twitchSecret);
    }
    if (settings.twitchClientId) {
      setTwitchClientId(settings.twitchClientId);
    }
  }, [settings]);

  useEffect(() => {
    const checkExperiment = async () => {
      const isExperiment = await window.electron.isExperiment();
      setIsExperiment(isExperiment);
    };
    checkExperiment();
  }, []);

  // Check if we're on Windows
  useEffect(() => {
    const checkPlatform = async () => {
      const isWindows = await window.electron.isOnWindows();
      console.log("Is on Windows:", isWindows);
      setIsOnWindows(isWindows);
    };
    checkPlatform();
  }, []);

  // Create a debounced save function to prevent too frequent saves
  const debouncedSave = useMemo(
    () =>
      createDebouncedFunction(newSettings => {
        window.electron.saveSettings(newSettings);
      }, 300),
    []
  );

  useEffect(() => {
    const checkDownloaderStatus = async () => {
      try {
        const games = await window.electron.getGames();
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

  // Auto-save settings whenever they change
  useEffect(() => {
    if (isInitialized && !isFirstMount.current) {
      debouncedSave(settings);
    }
  }, [settings, isInitialized]);

  // Load initial settings
  useEffect(() => {
    const initializeSettings = async () => {
      if (!isFirstMount.current) return;

      setIsLoading(true);

      try {
        // Load settings first
        const savedSettings = await window.electron.getSettings();

        if (savedSettings) {
          setSettings(savedSettings);
          // Set the download directory from saved settings
          if (savedSettings.downloadDirectory) {
            setDownloadPath(savedSettings.downloadDirectory);
          }
          if (savedSettings.backupDirectory) {
            setBackupPath(savedSettings.backupDirectory);
          }
          initialSettingsRef.current = savedSettings;
        }

        isFirstMount.current = false;
      } catch (error) {
        console.error("Error initializing settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeSettings();
  }, []); // Run only once on mount

  const handleSettingChange = async (key, value, ludusavi = false) => {
    if (key === "gameSource") {
      setPendingSourceChange(value);
      setShowReloadDialog(true);
      return;
    }

    if (key === "sideScrollBar") {
      setSettings(prev => ({
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
            setSettings(prev => ({
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

    window.electron.updateSetting(key, value).then(success => {
      if (success) {
        setSettings(prev => ({
          ...prev,
          [key]: value,
        }));
      }
    });
  };

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

  // Theme handling
  const handleThemeChange = useCallback(
    newTheme => {
      setTheme(newTheme);
      localStorage.setItem("ascendara-theme", newTheme);
      handleSettingChange("theme", newTheme);
    },
    [handleSettingChange, setTheme]
  );

  useEffect(() => {
    const savedTheme = localStorage.getItem("ascendara-theme");
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, [setTheme]);

  useEffect(() => {
    if (theme && isInitialized) {
      handleSettingChange("theme", theme);
    }
  }, [theme, isInitialized, handleSettingChange]);

  const groupedThemes = {
    light: themes.filter(t => t.group === "light"),
    dark: themes.filter(t => t.group === "dark"),
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

  useEffect(() => {
    const loadFitgirlMetadata = async () => {
      if (!settings.torrentEnabled) return;
      try {
        const data = await gameService.getAllGames();
        setApiMetadata(data.metadata);
      } catch (error) {
        console.error("Failed to load Fitgirl metadata:", error);
      }
    };
    loadFitgirlMetadata();
  }, [settings.torrentEnabled]);

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

  // Auto-show advanced section when torrent is enabled
  useEffect(() => {
    if (settings.torrentEnabled) {
      setShowAdvanced(true);
    }
  }, [settings.torrentEnabled]);

  // Switch back to SteamRip if torrent is disabled while using Fitgirl
  useEffect(() => {
    if (!settings.torrentEnabled && settings.gameSource === "fitgirl") {
      handleSettingChange("gameSource", "steamrip");
    }
  }, [settings.torrentEnabled]);

  // Disable Time Machine when using Fitgirl source
  useEffect(() => {
    if (settings.gameSource === "fitgirl" && settings.showOldDownloadLinks) {
      handleSettingChange("showOldDownloadLinks", false);
    }
  }, [settings.gameSource]);

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
                <span>Experiment Build {__APP_VERSION__}</span>
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
                    <Database className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-primary">
                      {t("settings.localIndex") || "Local Game Index"}
                    </h2>
                    <p className="max-w-[500px] text-sm text-muted-foreground">
                      {t("settings.localIndexDescription")}
                    </p>
                    <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>
                        {t("settings.lastIndexRefresh") || "Last refresh"}:{" "}
                        {settings?.lastGameListRefresh
                          ? new Date(settings.lastGameListRefresh).toLocaleDateString()
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
                  <RefreshCw className="h-4 w-4" />
                  {t("settings.manageIndex") || "Manage Index"}
                </Button>
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
                <div>
                  <Label>{t("settings.themes")}</Label>
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

                <div className="flex items-center justify-between">
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

                <div className="flex items-center justify-between">
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
              </div>

              {/* Application Section */}
              <div className="mt-8 space-y-4">
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {t("settings.application")}
                </h3>

                <div className="flex items-center justify-between">
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

                <div className="flex items-center justify-between">
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

                <div className="flex items-center justify-between">
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

                <div className="flex items-center justify-between">
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

                <div className="flex items-center justify-between">
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

                <div className="flex items-center justify-between">
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

                <div className="flex items-center justify-between">
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
                  <div className="flex items-center justify-between">
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
                  <div className="mb-6 flex items-center justify-between">
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
                <div className="space-y-2">
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

                <div className="flex items-center justify-between">
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
                <div className="flex items-center justify-between">
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
                <div className={`space-y-2 ${settings.singleStream ? "opacity-50" : ""}`}>
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

                <div className="space-y-2 pt-8">
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
                <div className="space-y-2 pt-8">
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
                <div className="pt-8">
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

            <Card className="border-border">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-primary">
                      {t("settings.gameBackup.title")}
                    </h3>

                    {/* Backup Location */}
                    <div className="mt-2 space-y-2">
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
              <div className="mb-6">
                <div className="mb-1 flex items-center gap-2">
                  <FolderOpen className="text-primary-foreground h-4 w-4" />
                  <span className="text-primary-foreground font-medium">
                    {t("settings.achievementWatcher.defaultDirs") ||
                      "Default directories always tracked:"}
                  </span>
                </div>
                <ul className="ml-6 space-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Public/Documents/Steam/CODEX</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>AppData/Roaming/Steam/CODEX</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>AppData/Roaming/Goldberg SteamEmu Saves</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>AppData/Roaming/EMPRESS</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Public/Documents/EMPRESS</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Public/Documents/OnlineFix</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>ProgramData/Steam</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>LocalAppData/SKIDROW</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>AppData/Roaming/SmartSteamEmu</span>
                  </li>
                </ul>
                <div className="mt-2 text-xs italic text-muted-foreground">
                  {t("settings.achievementWatcher.defaultDirsNote") ||
                    "These directories and files are always tracked by default and cannot be removed."}
                </div>
              </div>
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

            {/* Additional Game Info Card */}
            <Card className="border-border p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-primary">
                  {t("settings.additionalGameInfo") || "Additional Game Info"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("settings.additionalGameInfoDescription") ||
                    "Configure API keys for enhanced game metadata, artwork, and information."}
                </p>
              </div>

              {/* API Tabs */}
              <Tabs
                defaultValue={
                  settings.giantBombKey
                    ? "giantbomb"
                    : settings.twitchClientId && settings.twitchSecret
                      ? "igdb"
                      : "giantbomb"
                }
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="giantbomb">GiantBomb</TabsTrigger>
                  <TabsTrigger value="igdb">IGDB</TabsTrigger>
                </TabsList>

                {/* IGDB Tab Content */}
                <TabsContent value="igdb" className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">IGDB API</h3>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.igdbApiKeyDescription") ||
                        "IGDB provides comprehensive game data including release dates, ratings, and screenshots."}
                    </p>
                    <a
                      onClick={() =>
                        window.electron.openURL(
                          "https://ascendara.app/docs/features/ascendara-xtra#setting-up-igdb"
                        )
                      }
                      className="cursor inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                    >
                      {t("settings.igdbLearnHowtoGet") || "Learn how to get API keys"}
                      <ExternalLink className="ml-1 inline-block h-3 w-3" />
                    </a>
                  </div>
                  <div className="space-y-3 pt-2">
                    <div className="space-y-1">
                      <Label htmlFor="twitch-client-id">
                        {t("settings.twitchClientId") || "Twitch Client ID"}
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="twitch-client-id"
                          type="password"
                          value={twitchClientId}
                          onChange={e => setTwitchClientId(e.target.value)}
                          placeholder={
                            t("settings.enterTwitchClientId") || "Enter Twitch Client ID"
                          }
                          className="flex-grow"
                        />
                        <Button
                          variant="outline"
                          className="text-primary"
                          onClick={() => {
                            handleSettingChange("twitchClientId", twitchClientId);
                          }}
                        >
                          {t("settings.setKey") || "Set"}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="twitch-secret">
                        {t("settings.twitchSecret") || "Twitch Secret"}
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="twitch-secret"
                          type="password"
                          value={twitchSecret}
                          onChange={e => setTwitchSecret(e.target.value)}
                          placeholder={
                            t("settings.enterIgdbApiKey") || "Enter Twitch Secret"
                          }
                          className="flex-grow"
                        />
                        <Button
                          variant="outline"
                          className="text-primary"
                          onClick={() => {
                            handleSettingChange("twitchSecret", twitchSecret);
                          }}
                        >
                          {t("settings.setKey")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* GiantBomb Tab Content */}
                <TabsContent value="giantbomb" className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">GiantBomb API</h3>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.giantBombDescription") ||
                        "GiantBomb provides detailed game information, reviews, and media content."}
                    </p>
                    <a
                      onClick={() =>
                        window.electron.openURL(
                          "https://ascendara.app/docs/features/ascendara-xtra#setting-up-giantbomb"
                        )
                      }
                      className="cursor inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                    >
                      {t("settings.giantBombLearnHowtoGet") || "Learn how to get API key"}
                      <ExternalLink className="ml-1 inline-block h-3 w-3" />
                    </a>
                  </div>
                  <div className="space-y-3 pt-2">
                    <div className="space-y-1">
                      <Label htmlFor="giantbomb-key">
                        {t("settings.giantBombApiKey") || "GiantBomb API Key"}
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="giantbomb-key"
                          type="password"
                          value={settings.giantBombKey || ""}
                          onChange={e =>
                            handleSettingChange("giantBombKey", e.target.value)
                          }
                          placeholder={
                            t("settings.enterGiantBombApiKey") ||
                            "Enter GiantBomb API Key"
                          }
                          className="flex-grow"
                        />
                        <Button
                          variant="outline"
                          className="text-primary"
                          onClick={() => {
                            handleSettingChange(
                              "giantBombKey",
                              settings.giantBombKey || ""
                            );
                          }}
                        >
                          {t("settings.setKey") || "Set"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>

            {/* Game Sources Card */}
            <Card className="border-border p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-primary">
                    {t("settings.gameSources")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("settings.gameSourcesDescription")}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Main Source Info */}
                <div className="rounded-lg border bg-card">
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">SteamRIP</h3>
                          <Badge
                            variant={
                              settings.gameSource === "steamrip" ? "success" : "secondary"
                            }
                            className="text-xs"
                          >
                            {settings.gameSource === "steamrip"
                              ? t("settings.currentSource")
                              : t("settings.sourceInactive")}
                          </Badge>
                        </div>
                        <p className="max-w-[600px] text-sm text-muted-foreground">
                          {t("settings.steamripDescription")}
                        </p>
                      </div>
                      {settings.gameSource !== "steamrip" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => handleSettingChange("gameSource", "steamrip")}
                        >
                          {t("settings.switchSource")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() =>
                            window.electron.openURL(
                              "https://ascendara.app/sources/steamrip"
                            )
                          }
                        >
                          {t("common.learnMore")}{" "}
                          <ExternalLink className="ml-1 inline-block h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    {settings.gameSource === "steamrip" && (
                      <div className="mt-6 grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            {t("settings.lastUpdated")}
                          </Label>
                          <p className="text-sm font-medium">
                            {apiMetadata?.getDate || "-"}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            {t("settings.totalGames")}
                          </Label>
                          <p className="text-sm font-medium">
                            {apiMetadata?.games?.toLocaleString() || "-"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {settings.torrentEnabled && (
                  <div className="mt-6 rounded-lg border bg-card duration-300 animate-in fade-in slide-in-from-top-4">
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">FitGirl Repacks</h3>
                            <Badge
                              variant={
                                settings.gameSource === "fitgirl"
                                  ? "success"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {settings.gameSource === "fitgirl"
                                ? t("settings.currentSource")
                                : t("settings.sourceInactive")}
                            </Badge>
                          </div>
                          <p className="max-w-[600px] text-sm text-muted-foreground">
                            {t("settings.fitgirlRepacksDescription")}
                          </p>
                        </div>
                        {settings.gameSource !== "fitgirl" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => handleSettingChange("gameSource", "fitgirl")}
                          >
                            {t("settings.switchSource")}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() =>
                              window.electron.openURL(
                                "https://ascendara.app/sources/fitgirl"
                              )
                            }
                          >
                            {t("common.learnMore")}{" "}
                            <ExternalLink className="ml-1 inline-block h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {settings.gameSource === "fitgirl" && (
                        <div className="mt-6 grid grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {t("settings.lastUpdated")}
                            </Label>
                            <p className="text-sm font-medium">
                              {apiMetadata?.getDate || "-"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {t("settings.totalGames")}
                            </Label>
                            <p className="text-sm font-medium">
                              {apiMetadata?.games?.toLocaleString() || "-"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Advanced Section Toggle */}
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center px-2">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-background"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      disabled={settings.torrentEnabled}
                    >
                      {t("settings.advanced")}{" "}
                      {showAdvanced ? (
                        <ChevronUp className="ml-2 h-4 w-4" />
                      ) : (
                        <ChevronDown className="ml-2 h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Advanced Settings */}
                {showAdvanced && (
                  <div className="space-y-6 duration-300 animate-in fade-in slide-in-from-top-4">
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
                                    disabled={
                                      settings.gameSource === "fitgirl" || !isOnWindows
                                    }
                                  />
                                </div>
                              </TooltipTrigger>
                              {settings.gameSource === "fitgirl" && (
                                <TooltipContent>
                                  <p className="text-secondary">
                                    {t("settings.cannotDisableTorrent")}
                                  </p>
                                </TooltipContent>
                              )}
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

                    {/* Additional Features */}
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <ClockAlert className="h-4 w-4 text-muted-foreground" />
                        <h4 className="font-medium">{t("settings.customSources")}</h4>
                      </div>
                      <p className="mb-3 text-sm text-muted-foreground">
                        {t("settings.customSourcesDescription")}
                      </p>
                      <Badge variant="secondary" className="text-xs">
                        {t("settings.comingSoon")}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Column - Additional Settings */}
          <div className="space-y-6 lg:col-span-4">
            {/* Analytics Card */}
            <Card className="border-border p-6">
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
            <Card className="border-border p-6">
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
                      disabled={settings.gameSource === "fitgirl"}
                    />
                  </div>
                  {settings.gameSource === "fitgirl" && (
                    <div className="mt-2 flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
                      <p className="text-sm">
                        {t("settings.timeMachineDisabledFitgirl")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Workshop Downloader Card */}
            <Card className="border-border p-6">
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
              <Card className="border-border p-6">
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
            <Card className="border-border p-6">
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

            {/* Developer Settings Card - Only shown in development mode */}
            {isDev && (
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

      {/* Torrent Warning Dialog */}
      <AlertDialog open={showTorrentWarning} onOpenChange={setShowTorrentWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("settings.torrentWarningDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-muted-foreground">
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
            </AlertDialogDescription>
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

      {/* Reload Required Dialog */}
      <AlertDialog open={showReloadDialog} onOpenChange={setShowReloadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("settings.reloadRequired")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {reloadMessage || t("settings.sourceChangeReload")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="text-primary"
              onClick={() => {
                setShowReloadDialog(false);
                setPendingSourceChange(null);
              }}
            >
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="text-secondary"
              onClick={() => {
                setSettings(prev => ({ ...prev, gameSource: pendingSourceChange }));
                const newSettings = { ...settings, gameSource: pendingSourceChange };
                window.electron.saveSettings(newSettings);
                window.electron.clearCache();
                window.electron.reload();
              }}
            >
              {t("settings.reload")}
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
