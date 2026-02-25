import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Rocket,
  Shield,
  Download,
  PuzzleIcon,
  PackageOpen,
  Palette,
  Zap,
  Layout,
  CircleCheck,
  Loader,
  XCircle,
  Globe2,
  ExternalLink,
  ArrowRight,
  PlusCircle,
  SquareArrowRight,
  FolderDownIcon,
  Unplug,
  Wine,
  Database,
  AlertTriangle,
} from "lucide-react";
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
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";
import { languages } from "@/i18n";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { validateInput } from "@/services/profanityFilterService";

const executableToLabelMap = {
  "dotNetFx40_Full_x86_x64.exe": t => ".NET Framework 4.0",
  "dxwebsetup.exe": t => "DirectX",
  "oalinst.exe": t => "OpenAL",
  "VC_redist.x64.exe": t => "Visual C++ Redistributable",
  "xnafx40_redist.msi": t => "XNA Framework",
};

const SUPPORTED_LANGUAGES = Object.entries(languages).map(
  ([id, { name, nativeName }]) => ({
    id,
    name: nativeName,
    icon: getLanguageFlag(id),
  })
);

function getLanguageFlag(langId) {
  const flagMap = {
    en: "🇺🇸",
    es: "🇪🇸",
    "zh-CN": "🇨🇳",
    ar: "🇸🇦",
    hi: "🇮🇳",
    bn: "🇧🇩",
    pt: "🇵🇹",
    ru: "🇷🇺",
    ja: "🇯🇵",
    it: "🇮🇹",
    de: "🇩🇪",
    fr: "🇫🇷",
  };
  return flagMap[langId] || "🌐";
}

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
    ocean: {
      bg: "bg-slate-900",
      primary: "bg-blue-400",
      secondary: "bg-slate-800",
      text: "text-blue-300",
    },
    midnight: {
      bg: "bg-[#0F172A]",
      primary: "bg-indigo-500",
      secondary: "bg-[#1E293B]",
      text: "text-indigo-300",
    },
    amber: {
      bg: "bg-amber-50",
      primary: "bg-amber-500",
      secondary: "bg-amber-100",
      text: "text-amber-900",
    },
  };
  return themeMap[themeId] || themeMap.light;
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

const Welcome = ({ welcomeData, onComplete }) => {
  const [showProtonConfirm, setShowProtonConfirm] = useState(false);
  const [runnersList, setRunnersList] = useState([]);
  const [isOnLinux, setIsOnLinux] = useState(false);
  const [protonGEInfo, setProtonGEInfo] = useState(null);
  const [protonDetected, setProtonDetected] = useState(false);
  const [protonInstalled, setProtonInstalled] = useState(false);
  const [isDownloadingProton, setIsDownloadingProton] = useState(false);
  const { t } = useTranslation();
  const { language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { setTheme } = useTheme();
  const [isV7Welcome, setIsV7Welcome] = useState(welcomeData.isV7Welcome);
  // Restore step and refresh state from navigation state if coming back from localrefresh
  const [step, setStep] = useState(location.state?.welcomeStep || "language");
  const restoredRefreshState = location.state?.indexRefreshStarted || false;
  const restoredIndexComplete = location.state?.indexComplete || false;
  const [selectedTheme, setSelectedTheme] = useState("purple");
  const [showingLightThemes, setShowingLightThemes] = useState(true);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [isOnWindows, setIsOnWindows] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showDepsAlert, setShowDepsAlert] = useState(false);
  const [showSkipAlert, setShowSkipAlert] = useState(false);
  const [showDepsErrorAlert, setShowDepsErrorAlert] = useState(false);
  const [downloadDirectory, setDownloadDirectory] = useState("");
  const [dependencyStatus, setDependencyStatus] = useState({
    ".NET Framework": { installed: false, icon: null },
    DirectX: { installed: false, icon: null },
    OpenAL: { installed: false, icon: null },
    "Visual C++": { installed: false, icon: null },
    "XNA Framework": { installed: false, icon: null },
  });
  const [warningMessage, setWarningMessage] = useState("");
  const [dependenciesInstalled, setDependenciesInstalled] = useState(false);
  const [progress, setProgress] = useState(0);
  const totalDependencies = 5; // Total number of dependencies
  const [errorMessage, setErrorMessage] = useState("");
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [showAnalyticsStep, setShowAnalyticsStep] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [referralSource, setReferralSource] = useState("");
  const [isIndexRefreshing, setIsIndexRefreshing] = useState(restoredRefreshState);
  const [indexRefreshStarted, setIndexRefreshStarted] = useState(restoredRefreshState);
  const [indexComplete, setIndexComplete] = useState(restoredIndexComplete);
  const [customReferral, setCustomReferral] = useState("");
  const [referralSent, setReferralSent] = useState(false);
  const [referralLink, setReferralLink] = useState("");
  const [customReferralError, setCustomReferralError] = useState("");
  const [referralLinkError, setReferralLinkError] = useState("");
  const [settings, setSettings] = useState({
    downloadDirectory: "",
    showOldDownloadLinks: false,
    seeInappropriateContent: false,
    autoCreateShortcuts: true,
    sendAnalytics: true,
    autoUpdate: true,
    language: "en",
    theme: "purple",
    threadCount: 4,
  });
  const [currentLangIndex, setCurrentLangIndex] = useState(0);
  const [privacyLinkVisited, setPrivacyLinkVisited] = useState(false);
  const [termsLinkVisited, setTermsLinkVisited] = useState(false);

  const features = useMemo(
    () => [
      {
        icon: <Download className="h-5 w-5" />,
        title: t("welcome.automaticUpdatesTitle"),
        description: t("welcome.automaticUpdatesDesc"),
      },
      {
        icon: <Shield className="h-5 w-5" />,
        title: t("welcome.securityPatchesTitle"),
        description: t("welcome.securityPatchesDesc"),
      },
      {
        icon: <Zap className="h-5 w-5" />,
        title: t("welcome.bugFixesTitle"),
        description: t("welcome.bugFixesDesc"),
      },
    ],
    [t]
  );

  const analyticsFeatures = useMemo(
    () => [
      {
        title: t("welcome.helpIdentifyAndFix"),
        description: t("welcome.helpIdentifyAndFixDesc"),
      },
      {
        title: t("welcome.influenceFutureFeatures"),
        description: t("welcome.influenceFutureFeaturesDesc"),
      },
      {
        title: t("welcome.bePartOfImproving"),
        description: t("welcome.bePartOfImprovingDesc"),
      },
    ],
    [t]
  );

  const v7Features = useMemo(
    () => [
      {
        icon: <Palette className="h-5 w-5" />,
        title: t("welcome.freshNewLookTitle"),
        description: t("welcome.freshNewLookDesc"),
      },
      {
        icon: <Zap className="h-5 w-5" />,
        title: t("welcome.lightningFastTitle"),
        description: t("welcome.lightningFastDesc"),
      },
      {
        icon: <Layout className="h-5 w-5" />,
        title: t("welcome.smartOrganizationTitle"),
        description: t("welcome.smartOrganizationDesc"),
      },
      {
        icon: <PuzzleIcon className="h-5 w-5" />,
        title: t("welcome.improvedUXTitle"),
        description: t("welcome.improvedUXDesc"),
      },
    ],
    [t]
  );

  const langPreferenceMessages = useMemo(
    () => [
      { text: "What's your preferred language?", lang: "en" },
      { text: "¿Cuál es tu idioma preferido?", lang: "es" },
      { text: "您喜欢使用哪种语言？", lang: "zh-CN" },
      { text: "ما هي لغتك المفضلة؟", lang: "ar" },
      { text: "आपकी पसंदीदा भाषा क्या है?", lang: "hi" },
      { text: "আপনার পছন্দের ভাষা কি?", lang: "bn" },
      { text: "Qual é a sua língua preferida?", lang: "pt" },
      { text: "Какой язык вы предпочитаете?", lang: "ru" },
      { text: "Quale è la tua lingua preferita?", lang: "it" },
      { text: "Welche Sprache bevorzugst du?", lang: "de" },
      { text: "Quelle est votre langue préférée?", lang: "fr" },
    ],
    []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLangIndex(prevIndex =>
        prevIndex === langPreferenceMessages.length - 1 ? 0 : prevIndex + 1
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [langPreferenceMessages.length]);

  useEffect(() => {
    if (welcomeData?.isV7Welcome !== undefined) {
      setIsV7Welcome(welcomeData.isV7Welcome);
    }
  }, [welcomeData?.isV7Welcome]);

  useEffect(() => {
    const handleDependencyStatus = (event, { name, status }) => {
      const label = executableToLabelMap[name](t);
      if (!label) return;

      console.log(`Received status for ${label}: ${status}`);

      if (status === "starting") {
        console.log(`Starting installation of: ${label}`);
        setDependencyStatus(prevStatus => ({
          ...prevStatus,
          [label]: {
            installed: false,
            icon: <Loader className="h-5 w-5 animate-spin" />,
          },
        }));
      } else if (status === "finished") {
        console.log(`Finished installing: ${label}`);
        setDependencyStatus(prevStatus => {
          const updatedStatus = {
            ...prevStatus,
            [label]: {
              installed: true,
              icon: <CircleCheck className="h-5 w-5 text-green-500" />,
            },
          };
          const allInstalled = Object.values(updatedStatus).every(dep => dep.installed);
          if (allInstalled) {
            setDependenciesInstalled(true);
          }
          console.log("Updated dependency status:", updatedStatus);
          return updatedStatus;
        });
      } else if (status === "failed") {
        console.error(`Failed to install: ${label}`);
        setDependencyStatus(prevStatus => ({
          ...prevStatus,
          [label]: {
            installed: false,
            icon: <XCircle className="h-5 w-5 text-red-500" />,
          },
        }));
      }
    };

    window.electron.ipcRenderer.on(
      "dependency-installation-status",
      handleDependencyStatus
    );

    return () => {
      window.electron.ipcRenderer.off(
        "dependency-installation-status",
        handleDependencyStatus
      );
    };
  }, [t]);

  const handleNext = () => {
    if (step === "language") {
      setStep("welcome");
    } else if (step === "welcome") {
      setStep("noticeAppIsFree");
    } else if (step === "noticeAppIsFree") {
      setStep("extension");
    } else if (step === "extension") {
      setStep("localIndex");
    } else if (step === "localIndex") {
      setStep("referral");
    } else if (step === "referral") {
      setStep("directory");
    } else if (step === "directory") {
      setStep("theme");
    } else if (step === "theme") {
      setStep("analytics");
    } else if (step === "analytics") {
      setStep("updates");
    } else if (step === "updates") {
      setStep(isOnWindows ? "dependencies" : "linuxDeps");
    } else if (step === "linuxDeps") {
      setStep("dependencies");
    } else if (step === "dependencies") {
      handleExit(true);
    }
  };

  const handleInstallDependencies = async () => {
    setIsInstalling(true);
    setProgress(0);

    // Set all dependencies to loading state
    setDependencyStatus(prevStatus => {
      const updatedStatus = { ...prevStatus };
      Object.keys(updatedStatus).forEach(dep => {
        updatedStatus[dep] = {
          installed: false,
          icon: <Loader className="h-5 w-5 animate-spin" />,
        };
      });
      return updatedStatus;
    });

    // Listen for dependency installation status
    const handleDependencyStatus = (event, { name, status }) => {
      const label = executableToLabelMap[name](t);
      if (!label) return;

      if (status === "finished") {
        // Increment progress and set checkmark when installation finishes
        setProgress(prev => prev + 1);
        setDependencyStatus(prevStatus => {
          const updatedStatus = {
            ...prevStatus,
            [label]: {
              installed: true,
              icon: <CircleCheck className="h-5 w-5 text-green-500" />,
            },
          };

          // Check if all dependencies are installed after updating the status
          const allInstalled = Object.values(updatedStatus).every(dep => dep.installed);
          if (allInstalled) {
            setIsInstalling(false); // Stop installation
            setStep("installationComplete"); // Move to the installation complete step
          }

          return updatedStatus;
        });
      } else if (status === "failed") {
        // Handle error
        setErrorMessage(`Failed to install ${label}. Please try again.`);
        setShowErrorDialog(true);
        setIsInstalling(false);
      }
    };

    window.electron.ipcRenderer.on(
      "dependency-installation-status",
      handleDependencyStatus
    );
    await window.electron.installDependencies();
    window.electron.ipcRenderer.off(
      "dependency-installation-status",
      handleDependencyStatus
    );

    setIsInstalling(false);
  };

  const handleRestart = () => {
    setShowErrorDialog(false);
    handleInstallDependencies();
  };

  const handleSkip = () => {
    setShowErrorDialog(false);
  };

  const handleSelectDirectory = async () => {
    const directory = await window.electron.openDirectoryDialog();
    const canCreateFiles = await window.electron.canCreateFiles(directory);
    if (!canCreateFiles) {
      setWarningMessage(t("welcome.cannotWriteWarning"));
      return;
    }
    if (directory) {
      setDownloadDirectory(directory);
      const { freeSpace } = await window.electron.getDriveSpace(directory);
      if (freeSpace < 40 * 1024 * 1024 * 1024) {
        setWarningMessage(t("welcome.notEnoughSpaceWarning"));
      } else {
        setWarningMessage("");
      }

      try {
        // Get current settings first
        const currentSettings = await window.electron.getSettings();

        // Update only the download directory while preserving others
        const updatedSettings = {
          ...currentSettings,
          downloadDirectory: directory,
        };

        const result = await window.electron.saveSettings(updatedSettings, directory);

        if (!result) {
          console.error("Failed to save settings");
          setWarningMessage("Failed to save download directory. Please try again.");
        }
      } catch (error) {
        console.error("Error saving settings:", error);
        setWarningMessage("An error occurred while saving the download directory.");
      }
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.3 },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: "easeOut" },
    },
  };

  const handleAnalyticsChoice = async enableAnalytics => {
    try {
      // Get current settings first
      const currentSettings = await window.electron.getSettings();

      // Update only the analytics setting while preserving others
      const updatedSettings = {
        ...currentSettings,
        sendAnalytics: enableAnalytics,
      };

      // Save the updated settings with the current download directory
      await window.electron.saveSettings(
        updatedSettings,
        currentSettings.downloadDirectory || ""
      );

      setAnalyticsConsent(enableAnalytics);
      handleNext();
    } catch (error) {
      console.error("Error saving analytics preference:", error);
    }
  };

  const handleExit = async showTour => {
    setIsExiting(true);
    // Wait for animation to complete before calling onComplete
    await new Promise(resolve => setTimeout(resolve, 800));
    await window.electron.createTimestamp();
    onComplete(showTour);
  };

  const handleUpdateChoice = async enableAutoUpdate => {
    try {
      const currentSettings = await window.electron.getSettings();

      const updatedSettings = {
        ...currentSettings,
        autoUpdate: enableAutoUpdate,
      };

      await window.electron.saveSettings(
        updatedSettings,
        currentSettings.downloadDirectory || ""
      );

      setAutoUpdate(enableAutoUpdate);
      handleNext();
    } catch (error) {
      console.error("Error saving auto-update preference:", error);
    }
  };

  const handleLanguageSelect = useCallback(
    async value => {
      try {
        changeLanguage(value);

        // Get current settings first
        const currentSettings = await window.electron.getSettings();
        const updatedSettings = {
          ...currentSettings,
          language: value,
        };

        await window.electron.saveSettings(updatedSettings);
        setSettings(updatedSettings);
      } catch (error) {
        console.error("Error saving language preference:", error);
      }
    },
    [changeLanguage]
  );

  const handleThemeSelect = async themeId => {
    try {
      setTheme(themeId);
      setSelectedTheme(themeId);

      // Get current settings first
      const currentSettings = await window.electron.getSettings();
      const updatedSettings = {
        ...currentSettings,
        theme: themeId,
      };

      await window.electron.saveSettings(updatedSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  useEffect(() => {
    const checkPlatform = async () => {
      const isWindows = await window.electron.isOnWindows();
      setIsOnWindows(isWindows);

      const isLinux = !isWindows && navigator.userAgent.toLowerCase().includes("linux");
      setIsOnLinux(isLinux);

      if (isLinux) {
        // 1. Get runners
        const runners = await window.electron.getRunners();
        setRunnersList(runners);

        if (runners.length > 0) {
          setProtonInstalled(true);
        }

        // 2. Fetch Proton-GE info (for size display)
        try {
          const info = await window.electron.getProtonGEInfo();
          if (info.success) {
            setProtonGEInfo(info);
          }
        } catch (e) {
          console.error("Failed to get Proton-GE info:", e);
        }
      }
    };
    checkPlatform();
  }, []);

  // Check if user has ever completed a local index refresh (e.g., from a previous session)
  useEffect(() => {
    const checkRefreshStatus = async () => {
      try {
        // First check if user has ever indexed before (persisted in timestamp file)
        if (window.electron?.getTimestampValue) {
          const hasIndexed = await window.electron.getTimestampValue("hasIndexBefore");
          if (hasIndexed === true) {
            // User has completed a local index before - show as complete
            setIndexRefreshStarted(true);
            setIsIndexRefreshing(false);
            setIndexComplete(true);
            return;
          }
        }

        // If no hasIndexBefore flag, check progress file for current session
        if (indexRefreshStarted && isIndexRefreshing) {
          const defaultPath = await window.electron.getDefaultLocalIndexPath();
          const progress = await window.electron.getLocalRefreshProgress(defaultPath);

          if (progress?.status === "completed") {
            setIsIndexRefreshing(false);
            setIndexComplete(true);
          } else if (progress?.status === "failed" || progress?.status === "error") {
            setIsIndexRefreshing(false);
          }
        }
      } catch (error) {
        console.error("Error checking refresh status:", error);
      }
    };

    checkRefreshStatus();
  }, []); // Run once on mount

  // Listen for local refresh progress updates to detect completion
  useEffect(() => {
    if (!indexRefreshStarted) return;

    const handleProgressUpdate = data => {
      // Check if refresh completed via progress status
      if (data.status === "completed") {
        setIsIndexRefreshing(false);
        setIndexComplete(true);
      } else if (data.status === "failed" || data.status === "error") {
        setIsIndexRefreshing(false);
      }
    };

    if (window.electron?.onLocalRefreshProgress) {
      window.electron.onLocalRefreshProgress(handleProgressUpdate);

      return () => {
        window.electron.offLocalRefreshProgress?.();
      };
    }
  }, [indexRefreshStarted]);

  if (welcomeData.isV7Welcome) {
    if (showAnalyticsStep) {
      return (
        <div
          className={`relative flex h-screen items-center justify-center overflow-hidden bg-background transition-opacity duration-500 ${isExiting ? "opacity-0" : "opacity-100"}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
          <div className="absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-primary/10 to-transparent" />

          <motion.div
            className="relative z-10 mx-auto w-full max-w-4xl px-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="mb-8 text-center" variants={itemVariants}>
              <h2 className="mb-4 text-3xl font-bold">{t("welcome.helpImprove")}</h2>
              <p className="mb-8 text-lg text-muted-foreground">
                {t("welcome.chooseHowToHelp")}
              </p>
            </motion.div>

            <motion.div
              className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2"
              variants={itemVariants}
            >
              {/* Share Analytics Option */}
              <button
                onClick={() => setAnalyticsConsent(true)}
                className={`rounded-xl p-6 transition-all duration-200 ${
                  analyticsConsent
                    ? "scale-105 border-2 border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
                    : "border border-primary/10 bg-card/30 hover:border-primary/30"
                }`}
              >
                <div className="mb-4 flex items-center space-x-3">
                  <div
                    className={`rounded-lg p-2 ${analyticsConsent ? "bg-primary/20" : "bg-muted"}`}
                  >
                    <Rocket
                      className={`h-6 w-6 ${analyticsConsent ? "text-primary" : "text-muted-foreground"}`}
                    />
                  </div>
                  <h3 className="text-xl font-semibold">
                    {t("welcome.shareAndImprove")}
                  </h3>
                </div>
                <ul className="mb-6 space-y-3 text-left">
                  <li className="flex items-start space-x-2">
                    <CircleCheck
                      className={`h-5 w-5 ${analyticsConsent ? "text-primary" : "text-muted-foreground"} mt-0.5 shrink-0`}
                    />
                    <span>{t("welcome.helpIdentifyAndFix")}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <CircleCheck
                      className={`h-5 w-5 ${analyticsConsent ? "text-primary" : "text-muted-foreground"} mt-0.5 shrink-0`}
                    />
                    <span>{t("welcome.influenceFutureFeatures")}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <CircleCheck
                      className={`h-5 w-5 ${analyticsConsent ? "text-primary" : "text-muted-foreground"} mt-0.5 shrink-0`}
                    />
                    <span>{t("welcome.bePartOfImproving")}</span>
                  </li>
                </ul>
              </button>

              {/* Privacy Option */}
              <button
                onClick={() => setAnalyticsConsent(false)}
                className={`rounded-xl p-6 transition-all duration-200 ${
                  !analyticsConsent
                    ? "scale-105 border-2 border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
                    : "border border-primary/10 bg-card/30 hover:border-primary/30"
                }`}
              >
                <div className="mb-4 flex items-center space-x-3">
                  <div
                    className={`rounded-lg p-2 ${!analyticsConsent ? "bg-primary/20" : "bg-muted"}`}
                  >
                    <Shield
                      className={`h-6 w-6 ${!analyticsConsent ? "text-primary" : "text-muted-foreground"}`}
                    />
                  </div>
                  <h3 className="text-xl font-semibold">{t("welcome.stayPrivate")}</h3>
                </div>
                <div className="mb-6 space-y-4 text-left">
                  <p>{t("welcome.optOutOfSharing")}</p>
                  <div className="rounded-lg bg-card/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      {t("welcome.ascendaraNeverCollects")}
                    </p>
                  </div>
                </div>
              </button>
            </motion.div>
            <motion.div
              className="flex flex-col items-center justify-center"
              variants={itemVariants}
            >
              <Button
                size="lg"
                onClick={() => {
                  handleAnalyticsChoice(analyticsConsent);
                  handleExit(true);
                }}
                className="mb-4 bg-primary/10 px-12 py-6 text-lg font-semibold text-primary hover:bg-primary/20"
              >
                {t("welcome.seeWhatsNew")}
              </Button>
              <button
                onClick={() => {
                  handleAnalyticsChoice(analyticsConsent);
                  handleExit(false);
                }}
                className="text-sm text-foreground/60 transition-colors hover:text-primary"
              >
                {t("welcome.exploreOnMyOwn")}
              </button>
            </motion.div>
          </motion.div>
        </div>
      );
    }

    return (
      <div
        className={`relative flex h-screen items-center justify-center overflow-hidden bg-background transition-opacity duration-500 ${isExiting ? "opacity-0" : "opacity-100"}`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
        <div className="absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-primary/10 to-transparent" />

        <motion.div
          className="relative z-10 mx-auto w-full max-w-5xl px-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div className="mb-8 text-center" variants={itemVariants}>
            <h1 className="text-6xl font-bold">
              <span className="mb-2 block text-4xl text-foreground/80">
                {t("welcome.sayHelloTo")}
              </span>
              <div className="relative inline-flex items-center">
                <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
                  Ascendara&nbsp;
                </span>
                <span className="relative">
                  <span className="inline-block animate-shine bg-[linear-gradient(110deg,var(--shine-from),45%,var(--shine-via),55%,var(--shine-to))] bg-[length:200%_100%] bg-clip-text text-transparent">
                    v7
                  </span>
                </span>
              </div>
            </h1>
          </motion.div>

          <motion.p
            className="mx-auto mb-10 max-w-2xl text-center text-xl text-foreground/80"
            variants={itemVariants}
          >
            {t("welcome.yourContinuedSupport")}
          </motion.p>

          <motion.div className="mb-10 grid grid-cols-2 gap-6" variants={itemVariants}>
            {v7Features.map(feature => (
              <div
                key={feature.title}
                className="rounded-xl border border-primary/10 bg-card/30 p-5 backdrop-blur-sm transition-colors hover:bg-card/40"
              >
                <div className="mb-3 flex items-center space-x-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                </div>
                <p className="text-foreground/70">{feature.description}</p>
              </div>
            ))}
          </motion.div>

          <motion.p
            className="mb-8 text-center text-sm text-foreground/70"
            variants={itemVariants}
          >
            {t("welcome.everyUpdateIsInspired")}
          </motion.p>

          <motion.div
            className="flex flex-col items-center space-y-4 text-secondary"
            variants={itemVariants}
          >
            <Button
              size="lg"
              onClick={() => setShowAnalyticsStep(true)}
              className="bg-primary px-8 py-6 text-lg font-semibold hover:bg-primary/90"
            >
              {t("welcome.continue")}
            </Button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={`transition-opacity duration-500 ${isExiting ? "opacity-0" : "opacity-100"}`}
    >
      <AlertDialog open={showDepsAlert} onOpenChange={setShowDepsAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("welcome.installDependencies")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("welcome.youWillReceiveAdminPrompts")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("welcome.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={handleInstallDependencies}
            >
              {t("welcome.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSkipAlert} onOpenChange={setShowSkipAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("welcome.skipDependencies")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("welcome.areYouSureYouWantToSkip")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("welcome.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={async () => {
                setShowSkipAlert(false);
                handleExit(true);
              }}
            >
              {t("welcome.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDepsErrorAlert} onOpenChange={setShowDepsErrorAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("welcome.installationFailed")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("welcome.failedToInstallDependencies")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={() => setShowDepsErrorAlert(false)}
            >
              {t("welcome.okay")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("welcome.errorInstallingDependencies")}
            </AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary" onClick={handleSkip}>
              {t("welcome.skip")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={handleRestart}
            >
              {t("welcome.restart")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="relative min-h-screen overflow-hidden bg-background">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
        <div className="absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-primary/10 to-transparent" />

        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <motion.div
              key="welcome"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div
                className="mb-8 flex items-center justify-center"
                variants={itemVariants}
              >
                <h1 className="text-6xl font-bold">
                  <div className="relative inline-flex items-center">
                    <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
                      {t("welcome.welcomeTo")}&nbsp;
                    </span>
                    <span className="relative">
                      <span className="inline-block animate-shine bg-[linear-gradient(110deg,var(--shine-from),45%,var(--shine-via),55%,var(--shine-to))] bg-[length:200%_100%] bg-clip-text text-transparent">
                        {t("welcome.ascendara")}
                      </span>
                    </span>
                  </div>
                </h1>
              </motion.div>
              <motion.p
                className="mb-12 max-w-4xl text-xl text-foreground/80"
                variants={itemVariants}
              >
                {t("welcome.welcomeToAscendaraDescription")}
              </motion.p>

              <motion.div className="mb-12 max-w-xl space-y-6" variants={itemVariants}>
                <div>
                  <div
                    className="flex cursor-pointer items-center space-x-3 rounded-lg p-4 transition-colors hover:bg-card/50"
                    onClick={e => {
                      if (e.target.closest("button")) return;
                      if (!termsLinkVisited) {
                        window.electron.openURL("https://ascendara.app/terms");
                        setTermsLinkVisited(true);
                        return;
                      }
                      setTermsChecked(!termsChecked);
                    }}
                  >
                    <Checkbox
                      id="terms"
                      checked={termsChecked}
                      disabled={!termsLinkVisited}
                      onCheckedChange={setTermsChecked}
                      className="data-[state=checked]:text-primary-foreground data-[state=checked]:bg-primary"
                    />
                    <div className="text-base">
                      <Label htmlFor="terms" className="inline cursor-pointer">
                        {t("welcome.iHaveReadAndAgreeTo")}{" "}
                      </Label>
                      <button
                        type="button"
                        onClick={e => {
                          e.preventDefault();
                          setTermsLinkVisited(true);
                          window.electron.openURL("https://ascendara.app/terms");
                        }}
                        className="inline text-primary hover:underline"
                      >
                        {t("welcome.termsOfService")}
                      </button>
                    </div>
                  </div>

                  <div
                    className="flex cursor-pointer items-center space-x-3 rounded-lg p-4 transition-colors hover:bg-card/50"
                    onClick={e => {
                      if (e.target.closest("button")) return;
                      if (!privacyLinkVisited) {
                        window.electron.openURL("https://ascendara.app/privacy");
                        setPrivacyLinkVisited(true);
                        return;
                      }
                      setPrivacyChecked(!privacyChecked);
                    }}
                  >
                    <Checkbox
                      id="privacy"
                      checked={privacyChecked}
                      disabled={!privacyLinkVisited}
                      onCheckedChange={setPrivacyChecked}
                      className="data-[state=checked]:text-primary-foreground data-[state=checked]:bg-primary"
                    />
                    <div className="text-base">
                      <Label htmlFor="privacy" className="inline cursor-pointer">
                        {t("welcome.iHaveReadAndAgreeTo")}{" "}
                      </Label>
                      <button
                        type="button"
                        onClick={e => {
                          e.preventDefault();
                          setPrivacyLinkVisited(true);
                          window.electron.openURL("https://ascendara.app/privacy");
                        }}
                        className="inline text-primary hover:underline"
                      >
                        {t("welcome.privacyPolicy")}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Button
                  size="lg"
                  onClick={handleNext}
                  disabled={!privacyChecked || !termsChecked}
                  className="px-8 py-6 text-lg font-semibold text-secondary"
                >
                  {t("welcome.getStarted")}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === "language" && (
            <motion.div
              key="language"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-background/80 p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="mb-12 text-center" variants={itemVariants}>
                <Globe2 className="mx-auto mb-6 h-16 w-16 animate-pulse text-primary" />
                <h1 className="mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-4xl font-bold text-transparent">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentLangIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.5 }}
                      className="mb-2 block text-4xl text-foreground/80"
                    >
                      {langPreferenceMessages[currentLangIndex].text}
                    </motion.span>
                  </AnimatePresence>
                </h1>
              </motion.div>

              <motion.div
                className="mb-12 grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
                variants={itemVariants}
              >
                {SUPPORTED_LANGUAGES.map(lang => (
                  <motion.button
                    key={lang.id}
                    onClick={() => handleLanguageSelect(lang.id)}
                    className={`flex items-center space-x-4 rounded-2xl p-6 transition-all duration-300 ${
                      language === lang.id
                        ? "scale-105 border-2 border-primary bg-gradient-to-br from-primary/15 via-primary/10 to-transparent shadow-lg shadow-primary/10"
                        : "hover:scale-102 border border-primary/10 bg-card/40 hover:border-primary/30 hover:bg-card/60"
                    }`}
                    whileHover={{ scale: language === lang.id ? 1.05 : 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="text-3xl">{lang.icon}</div>
                    <span className="text-xl font-medium">{lang.name}</span>
                  </motion.button>
                ))}
              </motion.div>

              <motion.div className="flex justify-center" variants={itemVariants}>
                <Button
                  size="lg"
                  className="w-full bg-primary text-secondary hover:bg-primary/90"
                  onClick={handleNext}
                  disabled={!language}
                >
                  {t("welcome.next")}
                </Button>
              </motion.div>

              <motion.p
                className="mt-6 text-sm text-muted-foreground"
                variants={itemVariants}
              >
                {t("welcome.youCanChangeThisLater")}&nbsp;
                <a
                  className="cursor-pointer hover:underline"
                  onClick={() => navigate("/extralanguages")}
                >
                  {t("welcome.seeEntireList")}
                  <ArrowRight className="ml-1 inline-block h-3 w-3" />
                </a>
              </motion.p>
            </motion.div>
          )}

          {step === "noticeAppIsFree" && (
            <motion.div
              key="noticeAppIsFree"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="mb-8 text-center" variants={itemVariants}>
                <h2 className="mb-2 text-3xl font-bold text-primary">
                  {t("welcome.noticeAppIsFree.title")}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {t("welcome.noticeAppIsFree.subtitle")}
                </p>
              </motion.div>

              <motion.div
                className="mb-12 max-w-2xl space-y-4 rounded-lg bg-card/30 p-6"
                variants={itemVariants}
              >
                <div className="flex items-start space-x-3 text-left">
                  <CircleCheck className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <p className="text-md">{t("welcome.noticeAppIsFree.point1")}</p>
                </div>
                <div className="flex items-start space-x-3 text-left">
                  <CircleCheck className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <p>{t("welcome.noticeAppIsFree.point2")}</p>
                </div>
                <div className="flex items-start space-x-3 text-left">
                  <CircleCheck className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <p>{t("welcome.noticeAppIsFree.point3")}</p>
                </div>
                <div className="flex items-start space-x-3 text-left">
                  <Shield className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <p className="text-md">{t("welcome.noticeAppIsFree.point4")}</p>
                </div>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Button
                  size="lg"
                  onClick={handleNext}
                  className="bg-primary px-8 py-6 text-lg font-semibold text-secondary hover:bg-primary/90"
                >
                  {t("welcome.okay")}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === "localIndex" && (
            <motion.div
              key="localIndex"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="mb-8 text-center" variants={itemVariants}>
                <Database className="mx-auto mb-4 h-16 w-16 text-primary" />
                <h2 className="mb-2 text-3xl font-bold text-primary">
                  {t("welcome.localIndex.title")}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {t("welcome.localIndex.subtitle")}
                </p>
              </motion.div>

              <motion.div
                className="mb-12 max-w-2xl space-y-4 rounded-lg bg-card/30 p-6"
                variants={itemVariants}
              >
                <div className="flex items-start space-x-3 text-left">
                  <CircleCheck className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <p>{t("welcome.localIndex.point1")}</p>
                </div>
                <div className="flex items-start space-x-3 text-left">
                  <CircleCheck className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <p>{t("welcome.localIndex.point2")}</p>
                </div>
                <div className="flex items-start space-x-3 text-left">
                  <CircleCheck className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <p>{t("welcome.localIndex.point3")}</p>
                </div>
              </motion.div>

              {indexRefreshStarted ? (
                <motion.div variants={itemVariants} className="space-y-4">
                  <div className="flex items-center justify-center gap-2 text-primary">
                    {isIndexRefreshing ? (
                      <>
                        <Loader className="h-5 w-5 animate-spin" />
                        <span>{t("welcome.localIndex.refreshing")}</span>
                      </>
                    ) : (
                      <>
                        <CircleCheck className="h-5 w-5" />
                        <span>{t("welcome.localIndex.refreshComplete")}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("welcome.localIndex.canContinue")}
                  </p>
                  <Button
                    size="lg"
                    onClick={handleNext}
                    className="bg-primary px-8 py-6 text-lg font-semibold text-secondary hover:bg-primary/90"
                  >
                    {t("welcome.continue")}
                  </Button>
                </motion.div>
              ) : (
                <motion.div variants={itemVariants}>
                  <Button
                    size="lg"
                    onClick={() =>
                      navigate("/localrefresh", {
                        state: {
                          fromWelcome: true,
                          welcomeStep: step,
                        },
                      })
                    }
                    className="bg-primary px-8 py-6 text-lg font-semibold text-secondary hover:bg-primary/90"
                  >
                    {t("welcome.localIndex.setupIndex")}
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}

          {step === "referral" && (
            <motion.div
              key="referral"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="mb-8 text-center" variants={itemVariants}>
                <h2 className="mb-2 text-3xl font-bold text-primary">
                  {t("welcome.referral.title")}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {t("welcome.referral.subtitle")}
                </p>
              </motion.div>

              <motion.div
                className="mb-8 w-full max-w-2xl space-y-4"
                variants={itemVariants}
              >
                {referralSource === "friend" && (
                  <motion.div
                    className="mb-4 rounded-lg border-2 border-primary bg-primary/5 p-4 text-center"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <p className="text-sm font-medium text-primary">
                      {t("welcome.referral.friendThankYou")}
                    </p>
                  </motion.div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    "friend",
                    "tiktok",
                    "reddit",
                    "instagram",
                    "google",
                    "discord",
                    "fmhy",
                    "other",
                    "notsay",
                  ].map(source => (
                    <motion.button
                      key={source}
                      onClick={() => setReferralSource(source)}
                      className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 transition-all ${
                        referralSource === source
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50 hover:bg-accent/50"
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      animate={
                        source === "friend" && referralSource === "friend"
                          ? {
                              boxShadow: [
                                "0 0 0 0 rgba(var(--primary), 0)",
                                "0 0 0 8px rgba(var(--primary), 0.2)",
                                "0 0 0 0 rgba(var(--primary), 0)",
                              ],
                            }
                          : {}
                      }
                      transition={
                        source === "friend" && referralSource === "friend"
                          ? {
                              boxShadow: {
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "easeInOut",
                              },
                            }
                          : {}
                      }
                    >
                      <span className="text-sm font-medium">
                        {t(`welcome.referral.sources.${source}`)}
                      </span>
                    </motion.button>
                  ))}
                </div>

                {referralSource === "other" && (
                  <motion.div
                    className="mt-4 space-y-2"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Input
                      type="text"
                      placeholder={t("welcome.referral.otherPlaceholder")}
                      className={`w-full ${customReferralError ? "border-red-500" : ""}`}
                      value={customReferral}
                      onChange={async e => {
                        const value = e.target.value;
                        setCustomReferral(value);
                        if (value) {
                          const validation = await validateInput(value);
                          if (!validation.valid) {
                            setCustomReferralError(validation.error);
                          } else {
                            setCustomReferralError("");
                          }
                        } else {
                          setCustomReferralError("");
                        }
                      }}
                    />
                    {customReferralError && (
                      <p className="text-sm text-red-500">{customReferralError}</p>
                    )}
                  </motion.div>
                )}

                {[
                  "tiktok",
                  "reddit",
                  "instagram",
                  "google",
                  "discord",
                  "fmhy",
                  "other",
                ].includes(referralSource) && (
                  <motion.div
                    className="mt-4 space-y-2"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Input
                      type="text"
                      placeholder={
                        t("welcome.referral.linkPlaceholder") ||
                        "Where did you find Ascendara? (optional)"
                      }
                      className={`w-full ${referralLinkError ? "border-red-500" : ""}`}
                      value={referralLink}
                      onChange={async e => {
                        const value = e.target.value;
                        setReferralLink(value);
                        if (value) {
                          const validation = await validateInput(value);
                          if (!validation.valid) {
                            setReferralLinkError(validation.error);
                          } else {
                            setReferralLinkError("");
                          }
                        } else {
                          setReferralLinkError("");
                        }
                      }}
                    />
                    {referralLinkError && (
                      <p className="text-sm text-red-500">{referralLinkError}</p>
                    )}
                  </motion.div>
                )}
              </motion.div>

              <motion.div
                className="flex w-full max-w-2xl justify-center"
                variants={itemVariants}
              >
                <Button
                  onClick={async () => {
                    // Prevent double submission
                    if (referralSent) {
                      handleNext();
                      return;
                    }
                    setReferralSent(true);

                    // Send referral source to API
                    const sourceToSend =
                      referralSource === "other"
                        ? customReferral || "other"
                        : referralSource;
                    if (sourceToSend) {
                      try {
                        const authHeaders = await window.electron.getAuthHeaders();
                        const tokenResponse = await fetch(
                          "https://api.ascendara.app/auth/token",
                          {
                            headers: authHeaders,
                          }
                        );

                        if (tokenResponse.ok) {
                          const { token } = await tokenResponse.json();
                          const payload = { source: sourceToSend };
                          if (referralLink) {
                            payload.link = referralLink;
                          }
                          await fetch("https://api.ascendara.app/app/downloadedfrom", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify(payload),
                          });
                        }
                      } catch (error) {
                        console.error("Failed to send referral source:", error);
                      }
                    }
                    handleNext();
                  }}
                  className="bg-primary px-8 py-6 text-base font-semibold text-secondary hover:bg-primary/90"
                  disabled={
                    referralSent ||
                    !referralSource ||
                    (referralSource === "other" && !customReferral) ||
                    customReferralError ||
                    referralLinkError
                  }
                >
                  {t("welcome.next")}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === "directory" && (
            <motion.div
              key="directory"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="mb-8 text-center" variants={itemVariants}>
                <h2 className="mb-2 text-3xl font-bold text-primary">
                  {t("welcome.chooseDownloadLocation")}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {t("welcome.selectWhereYouWantYourGamesToBeDownloaded")}
                </p>
              </motion.div>
              <motion.div
                className="mb-12 max-w-2xl space-y-6 rounded-lg bg-card/30 p-6"
                variants={itemVariants}
              >
                <div className="flex items-center space-x-4">
                  <input
                    type="text"
                    value={downloadDirectory}
                    readOnly
                    placeholder={t("welcome.selectADirectory")}
                    className="text-primary-foreground flex-1 rounded-lg border border-primary/10 bg-background/50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  />
                  <Button className="text-secondary" onClick={handleSelectDirectory}>
                    {t("welcome.browse")}
                  </Button>
                </div>

                {warningMessage && (
                  <p className="text-sm text-red-500">{warningMessage}</p>
                )}

                <div className="mt-6 space-y-4 text-left">
                  <div className="flex items-start space-x-3">
                    <PackageOpen className="mt-1 h-5 w-5 text-primary" />
                    <p>{t("welcome.thisIsWhereAllYourDownloadedGamesWillBeStored")}</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Shield className="mt-1 h-5 w-5 text-primary" />
                    <p>
                      {t("welcome.makeSureYouHaveEnoughDiskSpaceInTheSelectedLocation")}
                    </p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <PlusCircle className="mt-1 h-5 w-5 text-primary" />
                    <p>{t("welcome.youCanAddMoreLater")}</p>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Button
                  size="lg"
                  onClick={handleNext}
                  disabled={!downloadDirectory}
                  className="bg-primary px-8 py-6 text-lg font-semibold text-secondary hover:bg-primary/90"
                >
                  {t("welcome.continue")}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === "extension" && (
            <motion.div
              key="extension"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div
                className="mb-8 flex items-center justify-center"
                variants={itemVariants}
              >
                <h2 className="text-4xl font-bold text-primary">
                  {t("welcome.downloadGamesFaster")}
                </h2>
              </motion.div>
              <motion.p
                className="mb-8 max-w-2xl text-xl text-foreground/80"
                variants={itemVariants}
              >
                {t("welcome.getTheAscendaraDownloadHandlerExtension")}
              </motion.p>

              <motion.div
                className="mb-12 max-w-2xl space-y-6 rounded-lg bg-card/30 p-6"
                variants={itemVariants}
              >
                <h3 className="mb-4 text-lg font-semibold">{t("welcome.howItWorks")}</h3>
                <div className="space-y-4 text-left">
                  <div className="flex items-start space-x-3">
                    <span className="font-semibold text-primary">1.</span>
                    <p>{t("welcome.clickTheExtensionIcon")}</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="font-semibold text-primary">2.</span>
                    <p>{t("welcome.whenYouClickADownloadLink")}</p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="font-semibold text-primary">3.</span>
                    <p>{t("welcome.startTheDownload")}</p>
                  </div>
                </div>

                <div className="mt-8 rounded-md bg-primary/5 p-4">
                  <p className="text-sm text-foreground/70">
                    {t("welcome.theExtensionBlocksKnownProviders")}
                  </p>
                </div>
              </motion.div>

              <motion.div
                className="flex justify-center space-x-4"
                variants={itemVariants}
              >
                <Button
                  size="lg"
                  onClick={() =>
                    window.electron.openURL("https://ascendara.app/extension")
                  }
                  className="bg-primary px-8 py-6 text-lg font-semibold text-secondary hover:bg-primary/90"
                >
                  {t("welcome.getTheExtension")}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleNext}
                  size="lg"
                  className="px-8 py-6 text-lg font-semibold text-primary hover:bg-primary/10"
                >
                  {t("welcome.continue")}
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === "theme" && (
            <div className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-background py-8">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
              <div className="absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-primary/10 to-transparent" />

              <motion.div
                className="relative z-10 mx-auto w-full max-w-4xl px-6 py-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <motion.div className="mb-8 text-center" variants={itemVariants}>
                  <h2 className="mb-4 text-3xl font-bold text-primary">
                    {t("welcome.chooseYourTheme")}
                  </h2>
                  <p className="mb-8 text-lg text-muted-foreground">
                    {t("welcome.personalizeYourExperience")}
                  </p>
                </motion.div>

                <motion.div className="mb-6 flex justify-center" variants={itemVariants}>
                  <div className="inline-flex rounded-lg bg-card/30 p-1">
                    <button
                      onClick={() => setShowingLightThemes(true)}
                      className={`rounded-md px-4 py-2 transition-all ${
                        showingLightThemes
                          ? "bg-primary text-secondary"
                          : "hover:bg-primary/10"
                      }`}
                    >
                      {t("welcome.lightThemes")}
                    </button>
                    <button
                      onClick={() => setShowingLightThemes(false)}
                      className={`rounded-md px-4 py-2 transition-all ${
                        !showingLightThemes
                          ? "bg-primary text-secondary"
                          : "hover:bg-primary/10"
                      }`}
                    >
                      {t("welcome.darkThemes")}
                    </button>
                  </div>
                </motion.div>

                <motion.div
                  className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3"
                  variants={itemVariants}
                >
                  {themes
                    .filter(
                      theme => theme.group === (showingLightThemes ? "light" : "dark")
                    )
                    .map(theme => (
                      <ThemeButton
                        key={theme.id}
                        theme={theme}
                        currentTheme={selectedTheme}
                        onSelect={handleThemeSelect}
                      />
                    ))}
                </motion.div>

                <motion.div className="flex justify-center" variants={itemVariants}>
                  <Button
                    size="lg"
                    onClick={handleNext}
                    className="bg-primary px-8 py-6 text-lg text-secondary hover:bg-primary/90"
                  >
                    {t("welcome.continue")}
                  </Button>
                </motion.div>
              </motion.div>
            </div>
          )}

          {step === "analytics" && (
            <motion.div
              key="analytics"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div className="mb-8 text-center" variants={itemVariants}>
                <h2 className="mb-2 text-3xl font-bold text-primary">
                  {t("welcome.analytics")}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {t("welcome.analyticsDesc")}
                </p>
              </motion.div>

              <motion.div
                className="mb-12 grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2"
                variants={itemVariants}
              >
                {/* Share Analytics Option */}
                <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 transition-colors hover:border-primary/30">
                  <div className="mb-4 flex items-center space-x-3">
                    <div className="rounded-lg bg-primary/20 p-2">
                      <Rocket className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-primary">
                      {t("welcome.shareAndImprove")}
                    </h3>
                  </div>
                  <div className="mb-6 space-y-4">
                    {analyticsFeatures.map(feature => (
                      <div key={feature.title} className="flex items-start space-x-2">
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div className="text-left">
                          <p className="font-medium text-muted-foreground">
                            {feature.title}
                          </p>
                          <p className="text-sm text-foreground/70">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="lg"
                    className="w-full bg-primary text-secondary hover:bg-primary/90"
                    onClick={() => handleAnalyticsChoice(true)}
                  >
                    {t("welcome.shareAnonymousData")}
                  </Button>
                </div>

                {/* Privacy Option */}
                <div className="flex flex-col rounded-xl border border-border bg-card/30 p-6">
                  <div className="mb-4 flex items-center space-x-3">
                    <div className="rounded-lg bg-muted p-2">
                      <Shield className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold text-muted-foreground">
                      {t("welcome.stayPrivate")}
                    </h3>
                  </div>
                  <p className="mb-6 text-left text-muted-foreground">
                    {t("welcome.optOutOfSharingAnonymousUsageData")}
                  </p>
                  <Button
                    variant="outline"
                    size="lg"
                    className="mt-auto w-full text-muted-foreground"
                    onClick={() => handleAnalyticsChoice(false)}
                  >
                    {t("welcome.continueWithoutSharing")}
                  </Button>
                </div>
              </motion.div>

              <motion.p
                className="max-w-2xl text-sm text-muted-foreground"
                variants={itemVariants}
              >
                {t("welcome.ascendaraNeverCollectsPersonalInfo")}&nbsp;
                <span
                  className="cursor-pointer text-primary hover:underline"
                  onClick={() =>
                    window.electron.openURL("https://ascendara.app/analytics")
                  }
                >
                  {t("common.learnMore")}{" "}
                  <ExternalLink className="mb-1 inline-block h-3 w-3" />
                </span>
              </motion.p>
            </motion.div>
          )}

          {step === "updates" && (
            <motion.div
              key="updates"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div
                className="mb-8 flex items-center justify-center"
                variants={itemVariants}
              >
                <h2 className="text-4xl font-bold text-primary">
                  {t("welcome.stayUpToDate")}
                </h2>
              </motion.div>
              <motion.p
                className="mb-8 max-w-2xl text-xl text-foreground/80"
                variants={itemVariants}
              >
                {t("welcome.chooseHowYouWantToReceiveUpdates")}
              </motion.p>

              <motion.div
                className="mb-12 grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2"
                variants={itemVariants}
              >
                {/* Auto Update Option */}
                <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 transition-colors hover:border-primary/30">
                  <div className="mb-4 flex items-center space-x-3">
                    <div className="rounded-lg bg-primary/20 p-2">
                      <Download className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-primary">
                      {t("welcome.automaticUpdates")}
                    </h3>
                  </div>
                  <div className="mb-6 space-y-4">
                    {features.map(feature => (
                      <div key={feature.title} className="flex items-start space-x-2">
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div className="text-left">
                          <p className="font-medium text-primary">{feature.title}</p>
                          <p className="text-sm text-foreground/70">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="lg"
                    className="w-full bg-primary text-secondary hover:bg-primary/90"
                    onClick={() => handleUpdateChoice(true)}
                  >
                    {t("welcome.enableAutoUpdates")}
                  </Button>
                </div>

                {/* Manual Update Option */}
                <div className="flex flex-col rounded-xl border border-border bg-card/30 p-6">
                  <div className="mb-4 flex items-center space-x-3">
                    <div className="rounded-lg bg-muted p-2">
                      <Unplug className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold text-muted-foreground">
                      {t("welcome.manualUpdates")}
                    </h3>
                  </div>
                  <p className="mb-6 text-left text-muted-foreground">
                    {t("welcome.chooseWhenToUpdateAscendaraYourself")}
                  </p>
                  <Button
                    variant="outline"
                    size="lg"
                    className="mt-auto w-full text-muted-foreground"
                    onClick={() => handleUpdateChoice(false)}
                  >
                    {t("welcome.neverAutomaticallyUpdate")}
                  </Button>
                </div>
              </motion.div>

              <motion.p
                className="max-w-2xl text-sm text-muted-foreground"
                variants={itemVariants}
              >
                {t("welcome.youCanChangeThisSettingLater")}
              </motion.p>
            </motion.div>
          )}

          {step === "linuxDeps" && (
            <motion.div
              key="non-windows-dependencies"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {!dependenciesInstalled ? (
                <>
                  <motion.div
                    className="mb-8 flex items-center justify-center"
                    variants={itemVariants}
                  >
                    <h2 className="text-4xl font-bold text-primary">
                      {t("welcome.pythonIsRequired")}
                    </h2>
                  </motion.div>
                  <motion.div
                    className="mb-12 max-w-3xl space-y-6"
                    variants={itemVariants}
                  >
                    <p className="text-xl text-foreground/80">
                      {t("welcome.pythonMustBeInstalled")}
                    </p>
                    <div className="flex justify-center space-x-4">
                      <Button
                        onClick={async () => {
                          const result = await window.electron.installPython();
                          if (result.success) {
                            setDependenciesInstalled(true);
                          }
                        }}
                        size="lg"
                        className="px-8 py-6 text-secondary"
                      >
                        <FolderDownIcon className="mr-2 h-5 w-5" />
                        {t("welcome.installPython")}
                      </Button>

                      <Button
                        onClick={async () => {
                          setDependenciesInstalled(true);
                        }}
                        size="lg"
                        className="px-8 py-6 text-secondary"
                      >
                        <SquareArrowRight className="mr-2 h-5 w-5" />
                        {t("welcome.havePython")}
                      </Button>
                    </div>
                  </motion.div>
                </>
              ) : (
                /* ─── STEP 2: PROTON / WINE (NEW LOGIC) ─── */
                <>
                  <motion.div
                    className="mb-8 flex items-center justify-center"
                    variants={itemVariants}
                  >
                    <h2 className="flex items-center gap-3 text-4xl font-bold text-primary">
                      {t("welcome.compatibilityLayer")}
                      <Wine size={32} />
                    </h2>
                  </motion.div>

                  <motion.div
                    className="mb-12 w-full max-w-4xl space-y-6"
                    variants={itemVariants}
                  >
                    {/* Status Banner */}
                    {runnersList.length > 0 ? (
                      // FOUND
                      <div
                        className={`flex gap-4 rounded-xl border p-6 text-left ${
                          runnersList.some(
                            r =>
                              r.type === "proton" ||
                              r.name.toLowerCase().includes("proton")
                          )
                            ? "border-green-500/30 bg-green-500/10"
                            : "border-yellow-500/30 bg-yellow-500/10"
                        }`}
                      >
                        {runnersList.some(
                          r =>
                            r.type === "proton" || r.name.toLowerCase().includes("proton")
                        ) ? (
                          <CircleCheck className="mt-1 h-8 w-8 shrink-0 text-green-500" />
                        ) : (
                          <AlertTriangle className="mt-1 h-8 w-8 shrink-0 text-yellow-500" />
                        )}

                        <div className="w-full space-y-2">
                          <h3
                            className={`text-xl font-bold ${runnersList.some(r => r.type === "proton" || r.name.toLowerCase().includes("proton")) ? "text-green-500" : "text-yellow-500"}`}
                          >
                            {runnersList.some(
                              r =>
                                r.type === "proton" ||
                                r.name.toLowerCase().includes("proton")
                            )
                              ? t("welcome.protonDetected")
                              : t("welcome.wineDetected")}
                          </h3>

                          <div className="space-y-1 rounded-lg border border-border/50 bg-background/40 p-3 font-mono text-sm">
                            {runnersList.map(r => (
                              <div
                                key={r.path}
                                className="flex items-center justify-between opacity-90"
                              >
                                <span className="font-semibold">{r.name}</span>
                                <span className="ml-4 truncate text-xs opacity-60">
                                  {r.path}
                                </span>
                              </div>
                            ))}
                          </div>

                          {!runnersList.some(
                            r =>
                              r.type === "proton" ||
                              r.name.toLowerCase().includes("proton")
                          ) && (
                            <p className="mt-2 text-sm font-medium text-yellow-500/90">
                              {t("welcome.wineRecommendation")}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      // NOT FOUND
                      <div className="flex gap-4 rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-left">
                        <XCircle className="mt-1 h-8 w-8 shrink-0 text-red-500" />
                        <div>
                          <h3 className="text-xl font-bold text-red-500">
                            {t("welcome.noRunnersTitle")}
                          </h3>
                          <p className="mt-1 text-base text-red-400/90">
                            {t("welcome.noRunnersDesc")}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Install Options */}
                    <div className="grid gap-4 text-left md:grid-cols-2">
                      {/* Proton GE Card */}
                      <div className="flex flex-col justify-between rounded-xl border-2 border-primary bg-primary/5 p-5 shadow-lg shadow-primary/5 transition-all hover:border-primary/50">
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <Rocket className="h-5 w-5 text-primary" />
                            <span className="font-bold text-primary">
                              {t("welcome.protonGERecommended")}
                            </span>
                          </div>
                          <p className="mb-4 text-sm text-muted-foreground">
                            {t("welcome.protonGEDesc")}
                            {protonGEInfo && (
                              <span className="mt-1 block font-mono text-xs opacity-75">
                                {t("welcome.protonGESize")} {protonGEInfo.sizeFormatted}
                              </span>
                            )}
                          </p>
                        </div>
                        <Button
                          onClick={async () => {
                            // 1. If we don't have the information, we fetch it
                            if (!protonGEInfo) {
                              setIsDownloadingProton(true);
                              try {
                                const info = await window.electron.getProtonGEInfo();
                                if (info.success) {
                                  setProtonGEInfo(info);
                                  setShowProtonConfirm(true); // Open dialogue
                                }
                              } catch (e) {
                                console.error(e);
                                setErrorMessage(e.message);
                                setShowErrorDialog(true);
                              }
                              setIsDownloadingProton(false);
                            } else {
                              // 2. If we already have the information, we open it directly.
                              setShowProtonConfirm(true);
                            }
                          }}
                          disabled={isDownloadingProton}
                          className="w-full text-secondary"
                        >
                          {isDownloadingProton ? (
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          {isDownloadingProton
                            ? t("welcome.protonGEChecking")
                            : t("welcome.protonGEInstall")}
                        </Button>
                      </div>

                      {/* Wine Card */}
                      <div className="flex flex-col justify-between rounded-xl border border-border bg-card/50 p-5 transition-all hover:bg-card">
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <Wine className="h-5 w-5 text-foreground" />
                            <span className="font-bold text-foreground">
                              {t("welcome.systemWine")}
                            </span>
                          </div>
                          <p className="mb-4 text-sm text-muted-foreground">
                            {t("welcome.systemWineDesc")}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            const result = await window.electron.installWine();
                            if (result.success) {
                              const updated = await window.electron.getRunners();
                              setRunnersList(updated);
                              setProtonInstalled(true);
                            }
                          }}
                          className="w-full"
                        >
                          <FolderDownIcon className="mr-2 h-4 w-4" />
                          {t("welcome.installWine")}
                        </Button>
                      </div>
                    </div>

                    {/* Navigation Buttons */}
                    <div className="flex justify-center pt-4">
                      <Button
                        onClick={() => handleNext()}
                        size="lg"
                        className="px-12 py-6 text-lg text-secondary"
                        variant={runnersList.length > 0 ? "default" : "ghost"}
                      >
                        {runnersList.length > 0
                          ? t("welcome.continue") || "Continue"
                          : t("welcome.skip") || "Skip for now"}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </div>
                  </motion.div>
                </>
              )}
            </motion.div>
          )}

          {step === "dependencies" && (
            <motion.div
              key="dependencies"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div
                className="mb-8 flex items-center justify-center"
                variants={itemVariants}
              >
                <h2 className="text-4xl font-bold text-primary">
                  {t("welcome.essentialDependencies")}
                </h2>
              </motion.div>
              {isIndexRefreshing && (
                <motion.div
                  className="mb-6 flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3"
                  variants={itemVariants}
                >
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-yellow-600">
                      {t("welcome.localIndex.stillRefreshing")}
                    </p>
                    <p className="text-xs text-yellow-600/80">
                      {t("welcome.localIndex.waitForRefresh")}
                    </p>
                  </div>
                </motion.div>
              )}
              <motion.div className="mb-12 max-w-2xl space-y-6" variants={itemVariants}>
                <p className="text-xl text-foreground/80">
                  {t("welcome.dependenciesDesc")}
                </p>
                <div className="grid grid-cols-2 gap-4 text-left text-muted-foreground">
                  {[
                    {
                      name: ".NET Framework",
                      desc: t("welcome.requiredForModernGames"),
                    },
                    { name: "DirectX", desc: t("welcome.graphicsAndMultimedia") },
                    { name: "OpenAL", desc: t("welcome.audioProcessing") },
                    { name: "Visual C++", desc: t("welcome.runtimeComponents") },
                    {
                      name: "XNA Framework",
                      desc: t("welcome.gameDevelopmentFramework"),
                    },
                  ].map(dep => (
                    <div key={dep.name} className="flex items-start space-x-3 p-4">
                      {dependencyStatus[dep.name].icon}
                      <div>
                        <button
                          type="button"
                          onClick={() => window.electron.openURL(dep.url)}
                          className="font-medium transition-colors hover:text-primary"
                        >
                          {dep.name}
                        </button>
                        <p className="text-sm text-foreground/60">{dep.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {isInstalling ? (
                <motion.div className="w-full max-w-md space-y-4" variants={itemVariants}>
                  <p className="text-lg text-foreground/80">
                    {t("welcome.installingDependencies")} {progress}/{totalDependencies}
                  </p>
                  <p className="text-sm text-foreground/60">
                    {t("welcome.pleaseWaitAndRespondToAdminPrompts")}
                  </p>
                  <Progress
                    value={(progress / totalDependencies) * 100}
                    className="h-2"
                  />
                </motion.div>
              ) : indexComplete ? (
                <motion.div
                  className="flex flex-col items-center space-y-6"
                  variants={itemVariants}
                >
                  <div className="flex justify-center space-x-4">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setShowDepsAlert(true)}
                      className="px-8 py-6 text-muted-foreground transition-colors hover:text-primary"
                    >
                      {t("welcome.installDependencies")}
                    </Button>

                    <Button
                      onClick={() => handleExit(true)}
                      size="lg"
                      className="px-8 py-6"
                    >
                      <Rocket className="mr-2 h-5 w-5 text-secondary" />
                      <span className="text-secondary">
                        {t("welcome.iHaveTheseTakeMeToTheTour")}
                      </span>
                    </Button>
                  </div>

                  <button
                    onClick={() => handleExit(false)}
                    className="text-sm text-foreground/60 transition-colors hover:text-primary"
                  >
                    {t("welcome.skipTheTour")}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  className="flex flex-col items-center space-y-6"
                  variants={itemVariants}
                >
                  <div className="flex justify-center space-x-4">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setShowDepsAlert(true)}
                      className="px-8 py-6 text-muted-foreground transition-colors hover:text-primary"
                    >
                      {t("welcome.installDependencies")}
                    </Button>

                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() =>
                        navigate("/localrefresh", {
                          state: {
                            welcomeStep: step,
                            indexRefreshStarted,
                            indexComplete,
                          },
                        })
                      }
                      className="px-8 py-6 text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Database className="mr-2 h-5 w-5" />
                      {t("welcome.localIndex.title")}
                    </Button>
                  </div>

                  {isIndexRefreshing && (
                    <p className="text-sm text-muted-foreground">
                      {t("welcome.localIndex.stillRefreshing")}
                    </p>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {step === "installationComplete" && (
            <motion.div
              key="installationComplete"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div
                className="mb-8 flex items-center justify-center"
                variants={itemVariants}
              >
                <h2 className="text-4xl font-bold text-primary">
                  {t("welcome.allRequiredDependenciesHaveBeenInstalledTitle")}
                </h2>
              </motion.div>
              <motion.p
                className="mb-8 max-w-xl text-xl text-foreground/80"
                variants={itemVariants}
              >
                {t("welcome.allRequiredDependenciesHaveBeenInstalledDesc")}
              </motion.p>

              {indexComplete ? (
                <motion.div
                  className="flex flex-col items-center space-y-4"
                  variants={itemVariants}
                >
                  <Button
                    onClick={() => handleExit(true)}
                    size="lg"
                    className="px-8 py-6"
                  >
                    <Rocket className="mr-2 h-5 w-5" />
                    {t("welcome.takeTour")}
                  </Button>
                  <button
                    onClick={() => handleExit(false)}
                    className="text-sm text-foreground/60 transition-colors hover:text-primary"
                  >
                    {t("welcome.skipTour")}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  className="flex flex-col items-center space-y-6"
                  variants={itemVariants}
                >
                  <div className="flex justify-center space-x-4">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() =>
                        navigate("/localrefresh", {
                          state: {
                            welcomeStep: step,
                            indexRefreshStarted,
                            indexComplete,
                          },
                        })
                      }
                      className="px-8 py-6 text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Database className="mr-2 h-5 w-5" />
                      {t("welcome.localIndex.title")}
                    </Button>
                  </div>

                  {isIndexRefreshing && (
                    <p className="text-sm text-muted-foreground">
                      {t("welcome.localIndex.stillRefreshing")}
                    </p>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Proton-GE Download Confirmation Dialog */}
      {showProtonConfirm && protonGEInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
            <h3 className="text-lg font-semibold">
              {protonGEInfo.updateAvailable
                ? t("welcome.protonGEDialog.updateTitle")
                : t("welcome.protonGEDialog.downloadTitle")}
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {protonGEInfo.updateAvailable ? (
                  <>
                    {t("welcome.protonGEDialog.updateAvailable")}{" "}
                    <strong className="text-foreground">{protonGEInfo.name}</strong>
                    {protonGEInfo.installedVersions.length > 0 && (
                      <span>
                        {" "}
                        ({t("welcome.protonGEDialog.replacing")}{" "}
                        {protonGEInfo.installedVersions.join(", ")})
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {t("welcome.protonGEDialog.aboutToDownload")}{" "}
                    <strong className="text-foreground">{protonGEInfo.name}</strong>.
                  </>
                )}
              </p>
              <p>
                {t("welcome.protonGEDialog.file")}{" "}
                <code className="rounded bg-muted px-1">{protonGEInfo.fileName}</code>
              </p>
              <p>
                {t("welcome.protonGEDialog.size")}{" "}
                <strong className="text-foreground">{protonGEInfo.sizeFormatted}</strong>{" "}
                (
                {t("welcome.protonGEDialog.sizeAfterExtraction", {
                  size: (protonGEInfo.size / (1024 * 1024 * 1024)).toFixed(1),
                })}
                )
              </p>
              <p className="text-muted-foreground">
                {t("welcome.protonGEDialog.description")}{" "}
                <code className="rounded bg-muted px-1">~/.ascendara/runners/</code>
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowProtonConfirm(false);
                  setProtonGEInfo(null);
                }}
              >
                {t("welcome.protonGEDialog.cancel")}
              </Button>
              <Button
                onClick={async () => {
                  setShowProtonConfirm(false);
                  setIsDownloadingProton(true);
                  try {
                    const result = await window.electron.downloadProtonGE();
                    if (result.success) {
                      const updated = await window.electron.getRunners();
                      setRunnersList(updated);
                      setProtonInstalled(true);
                      // Auto-select this runner
                      await window.electron.updateSetting("linuxRunner", result.path);
                    }
                  } catch (e) {
                    console.error("Failed to download Proton-GE:", e);
                  }
                  setIsDownloadingProton(false);
                }}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {t("welcome.protonGEDialog.download")} ({protonGEInfo.sizeFormatted})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Welcome;
