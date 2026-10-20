import { dialogTitleClassName } from "@/components/ui/dialog-styles";
import {
  createContext,
  forwardRef,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Rocket,
  Shield,
  ShieldCheck,
  Download,
  PuzzleIcon,
  PackageOpen,
  Palette,
  Zap,
  Layout,
  CircleCheck,
  Loader,
  XCircle,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  PlusCircle,
  SquareArrowRight,
  FolderDownIcon,
  FolderCheck,
  HardDrive,
  Wine,
  AlertTriangle,
  Sparkles,
  BellRing,
  Crown,
  Info,
  Gamepad2,
  Users,
  RefreshCw,
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
import ImportGamesDialog from "@/components/ImportGamesDialog";
import ImportFromLaunchersDialog from "@/components/ImportFromLaunchersDialog";
import StoreAccountsDialog from "@/components/StoreAccountsDialog";
import { useStoreLibrary } from "@/hooks/useStoreLibrary";
import { useDownloadFolderCheck } from "@/hooks/useDownloadFolderCheck";
import {
  DownloadFolderCheckProgress,
  DownloadFolderCheckResult,
} from "@/components/DownloadFolderCheck";

const DEPENDENCIES = [
  {
    name: ".NET Framework",
    file: "dotNetFx40_Full_x86_x64.exe",
    descKey: "welcome.requiredForModernGames",
  },
  { name: "DirectX", file: "dxwebsetup.exe", descKey: "welcome.graphicsAndMultimedia" },
  { name: "OpenAL", file: "oalinst.exe", descKey: "welcome.audioProcessing" },
  { name: "Visual C++", file: "VC_redist.x64.exe", descKey: "welcome.runtimeComponents" },
  {
    name: "XNA Framework",
    file: "xnafx40_redist.msi",
    descKey: "welcome.gameDevelopmentFramework",
  },
];
const dependencyByFile = Object.fromEntries(DEPENDENCIES.map(dep => [dep.file, dep]));
const idleDependencyStatus = () =>
  Object.fromEntries(DEPENDENCIES.map(dep => [dep.name, "idle"]));

const REFERRAL_SOURCES = [
  "friend",
  "tiktok",
  "reddit",
  "instagram",
  "google",
  "discord",
  "fmhy",
  "other",
  "notsay",
];
const REFERRAL_LINK_SOURCES = REFERRAL_SOURCES.filter(
  source => !["friend", "notsay"].includes(source)
);

const LOW_SPACE_BYTES = 40 * 1024 * 1024 * 1024;
const formatGigabytes = bytes => `${Math.floor(bytes / (1024 * 1024 * 1024))} GB`;

const cardClass = "rounded-xl border border-border/60 bg-card/40 p-4";
const primaryButtonClass =
  "h-11 bg-primary px-8 text-base font-semibold text-secondary hover:bg-primary/90";
const secondaryButtonClass =
  "h-11 px-8 text-base font-semibold text-primary hover:bg-primary/10";

// Steps slide in the direction of travel (1 = next, -1 = back) while the previous
// step slides out the other way, so moving through setup feels continuous.
const STEP_OFFSET = 64;
const stepVariants = {
  hidden: direction => ({ opacity: 0, x: direction * STEP_OFFSET, scale: 0.98 }),
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      x: { type: "spring", stiffness: 260, damping: 30 },
      opacity: { duration: 0.3, ease: "easeOut" },
      scale: { duration: 0.35, ease: "easeOut" },
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
  exit: direction => ({
    opacity: 0,
    x: direction * -STEP_OFFSET,
    scale: 0.98,
    transition: { duration: 0.25, ease: "easeIn" },
  }),
};

// Direction of the current step change, read by entering steps (AnimatePresence
// only hands `custom` to exiting ones).
const StepDirectionContext = createContext(1);

const stepItemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
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
  const selected = currentTheme === theme.id;

  return (
    <button
      type="button"
      onClick={() => onSelect(theme.id)}
      className={`group overflow-hidden rounded-xl border text-left transition-all ${
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "border-border/60 hover:border-primary/50"
      }`}
    >
      <div className={`${colors.bg} p-2.5`}>
        <div className={`rounded-md ${colors.secondary} space-y-1.5 p-2 shadow-sm`}>
          <div className={`h-2 w-3/4 rounded-full ${colors.primary} opacity-80`} />
          <div className={`h-1.5 w-1/2 rounded-full ${colors.primary} opacity-40`} />
          <div className={`h-4 rounded ${colors.bg} bg-opacity-50`} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 bg-card/60 px-2.5 py-1.5">
        <span className="truncate text-xs font-medium">{theme.name}</span>
        {selected ? (
          <CircleCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.primary}`} />
        )}
      </div>
    </button>
  );
}

function WelcomeStepIcon({ icon: Icon }) {
  return (
    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-lg shadow-primary/10">
      <Icon className="h-8 w-8 text-primary" />
    </div>
  );
}

// Shared layout for every setup step after the terms screen. Steps are sized to
// fit the window without scrolling; short windows drop the icon and tighten spacing.
// forwardRef lets AnimatePresence's popLayout mode measure the exiting step.
const SetupStep = forwardRef(function SetupStep(
  { icon: Icon, title, subtitle, children, footer, wide = false },
  ref
) {
  const direction = useContext(StepDirectionContext);
  return (
    <motion.div
      ref={ref}
      custom={direction}
      className="relative z-10 flex h-screen flex-col items-center justify-center overflow-hidden px-6 pb-16 pt-14 text-center"
      variants={stepVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="mb-6 max-w-2xl [@media(max-height:760px)]:mb-4"
        variants={stepItemVariants}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 [@media(max-height:760px)]:hidden">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-3xl font-bold text-primary [@media(max-height:760px)]:text-2xl">
          {title}
        </h2>
        {subtitle && (
          <p className="text-base leading-relaxed text-muted-foreground [@media(max-height:760px)]:text-sm">
            {subtitle}
          </p>
        )}
      </motion.div>
      <motion.div
        className={`w-full ${wide ? "max-w-4xl" : "max-w-2xl"}`}
        variants={stepItemVariants}
      >
        {children}
      </motion.div>
      {footer && (
        <motion.div
          className="mt-6 flex flex-col items-center gap-2 [@media(max-height:760px)]:mt-4"
          variants={stepItemVariants}
        >
          {footer}
        </motion.div>
      )}
    </motion.div>
  );
});

function SetupProgress({ current, total, onBack, backDisabled, t }) {
  const label = t("welcome.setup.stepOf", { current: current + 1, total });
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-center justify-center px-6 pb-5">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        disabled={backDisabled}
        className="pointer-events-auto absolute left-6 text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        {t("common.back")}
      </Button>
      <div
        className="flex items-center gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current + 1}
        aria-label={label}
        title={label}
      >
        {Array.from({ length: total }, (_, index) => (
          <div
            key={index}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === current
                ? "w-6 bg-primary"
                : index < current
                  ? "w-1.5 bg-primary/50"
                  : "w-1.5 bg-muted-foreground/25"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

const Welcome = ({ welcomeData, onComplete }) => {
  const [protonCachyInfo, setProtonCachyInfo] = useState(null);
  const [isDownloadingProtonCachy, setIsDownloadingProtonCachy] = useState(false);
  const [showProtonCachyConfirm, setShowProtonCachyConfirm] = useState(false);

  const [protonGEInfo, setProtonGEInfo] = useState(null);
  const [isDownloadingProtonGE, setIsDownloadingProtonGE] = useState(false);
  const [showProtonGEConfirm, setShowProtonGEConfirm] = useState(false);
  const [runnersList, setRunnersList] = useState([]);
  const cachyOsInstalled = runnersList.some(r =>
    r.name.toLowerCase().includes("cachyos")
  );
  const [isOnLinux, setIsOnLinux] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [installingWine, setInstallingWine] = useState(false);
  const installWine = async () => {
    setInstallingWine(true);
    setSetupError("");
    try {
      const result = await window.electron.installWine();
      if (!result.success) throw new Error(result.message || result.error);
      setRunnersList(await window.electron.getRunners());
    } catch (error) {
      setSetupError(error.message);
    } finally {
      setInstallingWine(false);
    }
  };
  const [protonDetected, setProtonDetected] = useState(false);
  const [protonInstalled, setProtonInstalled] = useState(false);
  const [umuInstalled, setUmuInstalled] = useState(false);
  const [umuProtonInfo, setUmuProtonInfo] = useState(null);
  const [isDownloadingUmuLauncher, setIsDownloadingUmuLauncher] = useState(false);
  const [isDownloadingUmuProton, setIsDownloadingUmuProton] = useState(false);
  const { t } = useTranslation();
  const { language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { setTheme } = useTheme();
  const [isV7Welcome, setIsV7Welcome] = useState(welcomeData?.isV7Welcome);
  // Restore step from navigation state if coming back from another page
  const [step, setStep] = useState(location.state?.welcomeStep || "language");
  const [stepDirection, setStepDirection] = useState(1);
  const [selectedTheme, setSelectedTheme] = useState("purple");
  const [showingLightThemes, setShowingLightThemes] = useState(true);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [isOnWindows, setIsOnWindows] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showDepsAlert, setShowDepsAlert] = useState(false);
  const [showManualUpdateConfirm, setShowManualUpdateConfirm] = useState(false);
  const [downloadDirectory, setDownloadDirectory] = useState("");
  const [freeSpace, setFreeSpace] = useState(null);
  const [protectLoading, setProtectLoading] = useState(false);
  // Result of the last Defender exclusion attempt: { success, reason, error }
  const [protectResult, setProtectResult] = useState(null);
  const [showNoDefenderWarning, setShowNoDefenderWarning] = useState(false);
  // Reset whenever the folder or its protection changes so the check runs again
  const folderCheck = useDownloadFolderCheck();
  const [dependencyStatus, setDependencyStatus] = useState(idleDependencyStatus);
  // null until the user installs or skips: "installed" | "partial" | "skipped"
  const [depsOutcome, setDepsOutcome] = useState(null);
  const [failedDependencies, setFailedDependencies] = useState([]);
  const [warningMessage, setWarningMessage] = useState("");
  // Linux/macOS: whether the Python step is done and the runner step is showing
  const [dependenciesInstalled, setDependenciesInstalled] = useState(false);
  const [progress, setProgress] = useState(0);
  // Set once the game index exists; pendingExit holds an exit waiting on the offline warning
  const indexReadyRef = useRef(false);
  const [pendingExit, setPendingExit] = useState(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isImportGamesOpen, setIsImportGamesOpen] = useState(false);
  const [isImportChooserOpen, setIsImportChooserOpen] = useState(false);
  const [isStoreAccountsOpen, setIsStoreAccountsOpen] = useState(false);
  const storeLibrary = useStoreLibrary();
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [referralSource, setReferralSource] = useState("");
  const [customReferral, setCustomReferral] = useState("");
  const [referralSent, setReferralSent] = useState(false);
  const [referralSending, setReferralSending] = useState(false);
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
  const languagePromptRef = useRef(null);

  // Setup steps after the terms screen; drives navigation and the progress bar.
  const setupSteps = useMemo(
    () => [
      "about",
      "referral",
      "directory",
      ...(isOnWindows
        ? ["protectDirectories", "verifyDirectory", "dependencies"]
        : ["linuxDeps"]),
      "personalize",
      "extras",
      "finish",
    ],
    [isOnWindows]
  );
  const setupIndex = setupSteps.indexOf(step);

  const protectReasonKey = ["cancelled", "defenderUnavailable", "blocked"].includes(
    protectResult?.reason
  )
    ? protectResult.reason
    : "failed";

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
    const prompt = languagePromptRef.current;
    if (step !== "language" || !prompt) return;

    let cancelled = false;
    let timeout;
    let animation;
    let index = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const showPhrase = () => {
      prompt.textContent = langPreferenceMessages[index].text;
      prompt.lang = langPreferenceMessages[index].lang;
    };
    const animatePhrase = async keyframes => {
      const previous = animation;
      animation = prompt.animate(keyframes, {
        duration: reducedMotion ? 0 : 500,
        easing: "ease-in-out",
        fill: "forwards",
      });
      previous?.cancel();
      await animation.finished;
    };
    const rotate = async () => {
      try {
        await animatePhrase([
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(-20px)" },
        ]);
        if (cancelled) return;
        index = (index + 1) % langPreferenceMessages.length;
        showPhrase();
        await animatePhrase([
          { opacity: 0, transform: "translateY(20px)" },
          { opacity: 1, transform: "translateY(0)" },
        ]);
        if (!cancelled) timeout = setTimeout(rotate, 3000);
      } catch (error) {
        // Cancelling the animation when leaving this step rejects finished.
        if (!cancelled) console.error("Language prompt animation failed:", error);
      }
    };

    showPhrase();
    timeout = setTimeout(rotate, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      animation?.cancel();
    };
  }, [step, langPreferenceMessages]);

  useEffect(() => {
    if (welcomeData?.isV7Welcome !== undefined) {
      setIsV7Welcome(welcomeData.isV7Welcome);
    }
  }, [welcomeData?.isV7Welcome]);

  useEffect(() => {
    const handleDependencyStatus = (event, { name, status }) => {
      const dep = dependencyByFile[name];
      if (!dep) return;

      if (status === "starting") {
        setDependencyStatus(prev => ({ ...prev, [dep.name]: "installing" }));
      } else if (status === "finished" || status === "failed") {
        setProgress(prev => Math.min(prev + 1, DEPENDENCIES.length));
        setDependencyStatus(prev => ({
          ...prev,
          [dep.name]: status === "finished" ? "done" : "failed",
        }));
      }
    };

    const unsubscribe =
      window.electron.onDependencyInstallationStatus(handleDependencyStatus);

    return () => {
      unsubscribe();
    };
  }, []);

  const goToStep = (nextStep, direction) => {
    setStepDirection(direction);
    setStep(nextStep);
  };

  const handleNext = () => {
    if (step === "language") {
      goToStep("welcome", 1);
    } else if (step === "welcome") {
      goToStep(setupSteps[0], 1);
    } else if (setupIndex >= 0 && setupIndex < setupSteps.length - 1) {
      goToStep(setupSteps[setupIndex + 1], 1);
    }
  };

  const handleBack = () => {
    goToStep(setupIndex > 0 ? setupSteps[setupIndex - 1] : "welcome", -1);
  };

  const handleInstallDependencies = async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    setProgress(0);
    setFailedDependencies([]);
    setDependencyStatus(idleDependencyStatus());

    try {
      const result = await window.electron.installDependencies();
      const failed = (result?.failed || [])
        .map(file => dependencyByFile[file]?.name)
        .filter(Boolean);
      setFailedDependencies(failed);
      setDepsOutcome(result?.success ? "installed" : "partial");
      if (!result?.success) {
        console.error("Some dependencies failed to install:", result?.message);
      }
    } catch (error) {
      console.error("Failed to install dependencies:", error);
      setDepsOutcome("partial");
    } finally {
      setIsInstalling(false);
      // Anything still marked installing never reported back (e.g. the download failed).
      setDependencyStatus(prev =>
        Object.fromEntries(
          Object.entries(prev).map(([name, status]) => [
            name,
            status === "installing" ? "idle" : status,
          ])
        )
      );
    }
  };

  const checkDirectorySpace = async directory => {
    try {
      const { freeSpace: bytes } = await window.electron.getDriveSpace(directory);
      setFreeSpace(bytes);
      setWarningMessage(
        bytes < LOW_SPACE_BYTES
          ? t("welcome.setup.directory.lowSpace", { size: formatGigabytes(bytes) })
          : ""
      );
    } catch (error) {
      console.error("Failed to check drive space:", error);
      setFreeSpace(null);
    }
  };

  const handleSelectDirectory = async () => {
    const directory = await window.electron.openDirectoryDialog();
    if (!directory) {
      return;
    }
    const canCreateFiles = await window.electron.canCreateFiles(directory);
    if (!canCreateFiles) {
      setFreeSpace(null);
      setWarningMessage(t("welcome.cannotWriteWarning"));
      return;
    }

    setDownloadDirectory(directory);
    // A new folder needs its own Defender exclusion and folder check
    setProtectResult(null);
    folderCheck.reset();
    await checkDirectorySpace(directory);

    try {
      // Update only the download directory while preserving other settings
      const currentSettings = await window.electron.getSettings();
      const result = await window.electron.saveSettings(
        { ...currentSettings, downloadDirectory: directory },
        directory
      );
      if (!result) {
        console.error("Failed to save settings");
        setWarningMessage(t("welcome.setup.directory.saveFailed"));
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      setWarningMessage(t("welcome.setup.directory.saveFailed"));
    }
  };

  // Start the check when its step opens, unless it already ran for this folder
  useEffect(() => {
    if (step === "verifyDirectory" && folderCheck.state === "idle" && downloadDirectory) {
      folderCheck.run(downloadDirectory);
    }
  }, [step, folderCheck.state, downloadDirectory]);

  const handleEnableProtection = async () => {
    setProtectLoading(true);
    try {
      const result = await window.electron.folderExclusion(true);
      setProtectResult(result || { success: false, reason: "failed" });
      if (result?.success) folderCheck.reset();
    } catch (error) {
      console.error("Failed to enable directory protection:", error);
      setProtectResult({ success: false, reason: "failed", error: error.message });
    } finally {
      setProtectLoading(false);
    }
  };

  const handleReferralContinue = async () => {
    // Only report once, even if the user comes back to this step
    if (referralSending) return;
    const sourceToSend =
      referralSource === "other" ? customReferral || "other" : referralSource;
    if (sourceToSend && !referralSent) {
      setReferralSending(true);
      try {
        const authHeaders = await window.electron.getAuthHeaders();
        const tokenResponse = await fetch("https://api.ascendara.app/auth/token", {
          headers: authHeaders,
        });

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
      setReferralSent(true);
      setReferralSending(false);
    }
    handleNext();
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

  const handleExit = async (showTour, skipIndexCheck = false) => {
    // Warn before leaving setup if the game index couldn't be fetched (e.g. offline)
    if (!skipIndexCheck && !indexReadyRef.current) {
      setPendingExit({ showTour });
      return;
    }
    setPendingExit(null);
    setIsExiting(true);
    // Wait for animation to complete before calling onComplete
    await new Promise(resolve => setTimeout(resolve, 800));
    await window.electron.createTimestamp();
    onComplete(showTour);
  };

  const saveAutoUpdate = async enableAutoUpdate => {
    setAutoUpdate(enableAutoUpdate);
    try {
      const currentSettings = await window.electron.getSettings();
      await window.electron.saveSettings(
        { ...currentSettings, autoUpdate: enableAutoUpdate },
        currentSettings.downloadDirectory || ""
      );
    } catch (error) {
      console.error("Error saving auto-update preference:", error);
    }
  };

  // Turning updates off asks for confirmation first
  const handleAutoUpdateToggle = enableAutoUpdate => {
    if (enableAutoUpdate) saveAutoUpdate(true);
    else setShowManualUpdateConfirm(true);
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

      const isLinux = window.electron.getPlatform() === "linux";
      setIsOnLinux(isLinux);

      if (!isWindows) {
        setRunnersList(await window.electron.getRunners());
      }

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
          if (!info.success) throw new Error(info.error || info.message);
          if (info.success) {
            setProtonGEInfo(info);
          }
        } catch (e) {
          console.error("Failed to get Proton-GE info:", e);
        }

        // Fetch UMU info
        try {
          const installed = await window.electron.isUmuInstalled();
          setUmuInstalled(installed);
          const umuInfo = await window.electron.getUmuProtonInfo();
          if (umuInfo?.success) setUmuProtonInfo(umuInfo);
        } catch (e) {
          console.error("Failed to get UMU info:", e);
        }
      }
    };
    checkPlatform().catch(error => setSetupError(error.message));
  }, []);

  // Pick up a download folder chosen before an interrupted setup
  useEffect(() => {
    window.electron
      .getSettings()
      .then(current => {
        if (current?.downloadDirectory) {
          setDownloadDirectory(current.downloadDirectory);
          checkDirectorySpace(current.downloadDirectory);
        }
      })
      .catch(error => console.error("Failed to load saved download folder:", error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signal to other parts of the app (e.g. AutomaticIndexRefresher in app.jsx)
  // that the welcome/onboarding flow is active, so they can suppress the
  // global "index refreshed, reload?" dialog while the user is still in setup.
  useEffect(() => {
    window.__welcomeActive = true;
    return () => {
      window.__welcomeActive = false;
    };
  }, []);

  // Set up the community game index in the background on first open, so it's
  // ready by the time setup is finished. Nothing is shown; a failed attempt
  // retries quietly, and the app keeps the index in sync after setup.
  useEffect(() => {
    const MAX_ATTEMPTS = 10;
    const RETRY_MS = 20000;
    let cancelled = false;
    let retryTimer = null;
    let attempts = 0;

    const handleError = err => {
      console.error("[Welcome] Index setup failed:", err);
      if (cancelled || attempts >= MAX_ATTEMPTS) return;
      retryTimer = setTimeout(startIndexSetup, RETRY_MS);
    };

    const startIndexSetup = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const currentSettings = await window.electron.getSettings();
        const outputPath =
          currentSettings?.localIndex ||
          (await window.electron.getDefaultLocalIndexPath());

        if (!currentSettings?.localIndex) {
          await window.electron.updateSetting("localIndex", outputPath);
        }

        await window.electron.downloadSharedIndex(outputPath);
      } catch (e) {
        handleError(e);
      }
    };

    const handleComplete = async () => {
      indexReadyRef.current = true;
      if (cancelled) return;
      try {
        await window.electron.setTimestampValue("hasIndexBefore", true);
        await window.electron.updateSetting("usingLocalIndex", true);
      } catch (e) {
        console.error("[Welcome] Failed to persist index flags:", e);
      }
      try {
        const imageCacheService = (await import("@/services/imageCacheService")).default;
        const gameService = (await import("@/services/gameService")).default;
        imageCacheService.invalidateSettingsCache?.();
        await imageCacheService.clearCache?.(true);
        gameService.clearMemoryCache?.();
      } catch (e) {
        console.warn("[Welcome] Cache clear after index download failed:", e);
      }
      localStorage.removeItem("ascendara_games_cache");
      localStorage.removeItem("local_ascendara_games_timestamp");
      localStorage.removeItem("local_ascendara_metadata_cache");
      localStorage.removeItem("local_ascendara_last_updated");
      window.dispatchEvent(
        new CustomEvent("index-refreshed", { detail: { timestamp: Date.now() } })
      );
    };

    (async () => {
      try {
        // Skip if the user already has an index from a previous session
        const hasIndexed = await window.electron.getTimestampValue("hasIndexBefore");
        if (hasIndexed === true) indexReadyRef.current = true;
        if (hasIndexed === true || cancelled) return;

        window.electron.onPublicIndexDownloadComplete?.(handleComplete);
        window.electron.onPublicIndexDownloadError?.(handleError);

        // Don't start a second download if one is already running
        const status = await window.electron.getPublicIndexDownloadStatus();
        if (status?.isDownloading) return;

        await startIndexSetup();
      } catch (e) {
        handleError(e);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      window.electron?.offPublicIndexDownloadComplete?.();
      window.electron?.offPublicIndexDownloadError?.();
    };
  }, []);

  if (welcomeData?.isV7Welcome) {
    return (
      <div
        className={`relative flex h-screen items-center justify-center overflow-hidden bg-background text-foreground transition-opacity duration-500 ${isExiting ? "opacity-0" : "opacity-100"}`}
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
            className="flex flex-col items-center space-y-4"
            variants={itemVariants}
          >
            <Button
              size="lg"
              onClick={() => handleExit(true)}
              className="bg-primary px-8 py-6 text-lg font-semibold text-secondary hover:bg-primary/90"
            >
              {t("welcome.seeWhatsNew")}
            </Button>
            <button
              onClick={() => handleExit(false)}
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
      className={`text-foreground transition-opacity duration-500 ${isExiting ? "opacity-0" : "opacity-100"}`}
    >
      <AlertDialog
        open={!!pendingExit}
        onOpenChange={open => {
          if (!open) setPendingExit(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("welcome.localIndex.stillRefreshing")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("welcome.localIndex.offlineWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("welcome.goBack")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={() => handleExit(pendingExit?.showTour, true)}
            >
              {t("welcome.localIndex.continueAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <AlertDialog open={showNoDefenderWarning} onOpenChange={setShowNoDefenderWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("welcome.setup.protect.skipDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t("welcome.setup.protect.skipDialog.desc")}</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t("welcome.noDefenderWarningCorrupted")}</li>
                  <li>{t("welcome.noDefenderWarningDeleted")}</li>
                  <li>{t("welcome.noDefenderWarningFailed")}</li>
                </ul>
                <p>{t("welcome.setup.protect.skipDialog.advice")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("welcome.goBack")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={() => {
                setShowNoDefenderWarning(false);
                handleNext();
              }}
            >
              {t("welcome.setup.protect.skipDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showManualUpdateConfirm}
        onOpenChange={setShowManualUpdateConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-2 flex items-center gap-3">
              <AlertDialogTitle className="mt-2 text-2xl font-bold text-foreground">
                {t("welcome.manualUpdateConfirm.title")}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p className="text-foreground">
                  {t("welcome.manualUpdateConfirm.intro")}
                </p>
                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm text-foreground">
                      {t("welcome.manualUpdateConfirm.securityPoint")}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm text-foreground">
                      {t("welcome.manualUpdateConfirm.featuresPoint")}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm text-foreground">
                      {t("welcome.manualUpdateConfirm.ascendPoint")}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm text-foreground">
                      {t("welcome.manualUpdateConfirm.notifyPoint")}
                    </span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-primary text-secondary hover:bg-primary/90"
              onClick={() => {
                setShowManualUpdateConfirm(false);
                saveAutoUpdate(true);
              }}
            >
              {t("welcome.manualUpdateConfirm.keepAuto")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-transparent text-muted-foreground hover:bg-muted"
              onClick={() => {
                setShowManualUpdateConfirm(false);
                saveAutoUpdate(false);
              }}
            >
              {t("welcome.manualUpdateConfirm.disableAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="relative min-h-screen overflow-hidden bg-background">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-background" />
        <div className="absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-primary/10 to-transparent" />

        {setupIndex >= 0 && (
          <SetupProgress
            current={setupIndex}
            total={setupSteps.length}
            onBack={handleBack}
            backDisabled={isInstalling || protectLoading || isExiting}
            t={t}
          />
        )}

        <MotionConfig reducedMotion="user">
          <StepDirectionContext.Provider value={stepDirection}>
            <AnimatePresence mode="popLayout" custom={stepDirection}>
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
                            Ascendara
                          </span>
                        </span>
                      </div>
                    </h1>
                  </motion.div>
                  <motion.p
                    className="mb-12 max-w-4xl text-xl text-foreground/80"
                    variants={itemVariants}
                  >
                    {t("welcome.welcomeToAscendaraDescription2")}
                  </motion.p>

                  <motion.div
                    className="mb-12 max-w-xl space-y-6"
                    variants={itemVariants}
                  >
                    <div>
                      <div
                        className="flex cursor-pointer items-center space-x-3 rounded-lg p-4 transition-colors hover:bg-card/50"
                        onClick={() => setTermsChecked(checked => !checked)}
                      >
                        <Checkbox
                          id="terms"
                          checked={termsChecked}
                          onClick={event => event.stopPropagation()}
                          onCheckedChange={setTermsChecked}
                          className="data-[state=checked]:text-primary-foreground data-[state=checked]:bg-primary"
                        />
                        <div className="text-base">
                          <span className="inline">
                            {t("welcome.iHaveReadAndAgreeTo")}{" "}
                          </span>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
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
                        onClick={() => setPrivacyChecked(checked => !checked)}
                      >
                        <Checkbox
                          id="privacy"
                          checked={privacyChecked}
                          onClick={event => event.stopPropagation()}
                          onCheckedChange={setPrivacyChecked}
                          className="data-[state=checked]:text-primary-foreground data-[state=checked]:bg-primary"
                        />
                        <div className="text-base">
                          <span className="inline">
                            {t("welcome.iHaveReadAndAgreeTo")}{" "}
                          </span>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
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
                    <h1 className="mb-4 grid min-h-[1.5em] items-center text-4xl font-bold text-foreground/80">
                      <span
                        ref={languagePromptRef}
                        className="col-start-1 row-start-1 block leading-normal"
                        lang={langPreferenceMessages[0].lang}
                        dir="auto"
                      >
                        {langPreferenceMessages[0].text}
                      </span>
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

              {step === "about" && (
                <SetupStep
                  key="about"
                  icon={Sparkles}
                  title={t("welcome.setup.about.title")}
                  subtitle={t("welcome.setup.about.subtitle")}
                  wide
                  footer={
                    <Button size="lg" onClick={handleNext} className={primaryButtonClass}>
                      {t("welcome.continue")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  }
                >
                  <div className="grid gap-3 text-left sm:grid-cols-3">
                    {[
                      {
                        icon: Download,
                        title: t("welcome.setup.about.gamesTitle"),
                        desc: t("welcome.setup.about.gamesDesc"),
                      },
                      {
                        icon: Users,
                        title: t("welcome.setup.about.onlineTitle"),
                        desc: t("welcome.setup.about.onlineDesc"),
                      },
                      {
                        icon: Shield,
                        title: t("welcome.setup.about.privacyTitle"),
                        desc: t("welcome.setup.about.privacyDesc"),
                      },
                    ].map(({ icon: Icon, title, desc }) => (
                      <div key={title} className={cardClass}>
                        <div className="mb-2 flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
                            {t("welcome.setup.about.freeBadge")}
                          </span>
                        </div>
                        <h3 className="mb-1 font-semibold">{title}</h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {desc}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-start gap-3 rounded-xl border border-border/60 bg-card/20 p-4 text-left">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Crown className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="mb-1 font-semibold">
                        {t("welcome.setup.about.ascendTitle")}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t("welcome.setup.about.ascendDesc")}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          window.electron.openURL("https://ascendara.app/ascend")
                        }
                        className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        {t("welcome.setup.about.ascendLearnMore")}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </SetupStep>
              )}

              {step === "referral" && (
                <SetupStep
                  key="referral"
                  icon={Users}
                  title={t("welcome.referral.title")}
                  subtitle={t("welcome.referral.subtitle")}
                  footer={
                    <Button
                      size="lg"
                      onClick={handleReferralContinue}
                      variant={referralSource ? "default" : "outline"}
                      className={
                        referralSource ? primaryButtonClass : secondaryButtonClass
                      }
                      disabled={
                        referralSending ||
                        (referralSource === "other" && !customReferral) ||
                        !!customReferralError ||
                        !!referralLinkError
                      }
                    >
                      {referralSource ? t("welcome.continue") : t("welcome.skip")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  }
                >
                  {referralSource === "friend" && (
                    <motion.div
                      className="mb-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-center"
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
                    {REFERRAL_SOURCES.map(source => (
                      <motion.button
                        key={source}
                        type="button"
                        onClick={() =>
                          setReferralSource(current => (current === source ? "" : source))
                        }
                        className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${
                          referralSource === source
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card/30 hover:border-primary/50 hover:bg-card/60"
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {t(`welcome.referral.sources.${source}`)}
                      </motion.button>
                    ))}
                  </div>

                  {referralSource === "other" && (
                    <motion.div
                      className="mt-3 space-y-2"
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
                          setCustomReferralError(
                            value ? (await validateInput(value)).error || "" : ""
                          );
                        }}
                      />
                      {customReferralError && (
                        <p className="text-left text-sm text-red-500">
                          {customReferralError}
                        </p>
                      )}
                    </motion.div>
                  )}

                  {REFERRAL_LINK_SOURCES.includes(referralSource) && (
                    <motion.div
                      className="mt-3 space-y-2"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Input
                        type="text"
                        placeholder={t("welcome.referral.linkPlaceholder")}
                        className={`w-full ${referralLinkError ? "border-red-500" : ""}`}
                        value={referralLink}
                        onChange={async e => {
                          const value = e.target.value;
                          setReferralLink(value);
                          setReferralLinkError(
                            value ? (await validateInput(value)).error || "" : ""
                          );
                        }}
                      />
                      {referralLinkError && (
                        <p className="text-left text-sm text-red-500">
                          {referralLinkError}
                        </p>
                      )}
                    </motion.div>
                  )}
                </SetupStep>
              )}

              {step === "directory" && (
                <SetupStep
                  key="directory"
                  icon={FolderDownIcon}
                  title={t("welcome.setup.directory.title")}
                  subtitle={t("welcome.setup.directory.subtitle")}
                  footer={
                    <Button
                      size="lg"
                      onClick={handleNext}
                      disabled={!downloadDirectory}
                      className={primaryButtonClass}
                    >
                      {t("welcome.continue")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  }
                >
                  <div className={`${cardClass} space-y-3`}>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSelectDirectory}
                        className="min-w-0 flex-1 truncate rounded-lg border border-primary/15 bg-background/60 px-4 py-2.5 text-left font-mono text-sm transition-colors hover:border-primary/40"
                        title={downloadDirectory}
                      >
                        {downloadDirectory || (
                          <span className="font-sans text-muted-foreground">
                            {t("welcome.selectADirectory")}
                          </span>
                        )}
                      </button>
                      <Button
                        className="shrink-0 text-secondary"
                        onClick={handleSelectDirectory}
                      >
                        {t("welcome.browse")}
                      </Button>
                    </div>

                    {warningMessage ? (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{warningMessage}</p>
                      </div>
                    ) : (
                      freeSpace !== null && (
                        <div className="flex items-center gap-2 text-left text-sm text-green-600 dark:text-green-400">
                          <HardDrive className="h-4 w-4 shrink-0" />
                          <p>
                            {t("welcome.setup.directory.freeSpace", {
                              size: formatGigabytes(freeSpace),
                            })}
                          </p>
                        </div>
                      )
                    )}

                    <div className="space-y-1.5 border-t border-border/60 pt-3 text-left text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <PackageOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p>{t("welcome.setup.directory.ownFolder")}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <PlusCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p>{t("welcome.setup.directory.addMore")}</p>
                      </div>
                    </div>
                  </div>
                </SetupStep>
              )}

              {step === "protectDirectories" && (
                <SetupStep
                  key="protectDirectories"
                  icon={ShieldCheck}
                  title={t("welcome.setup.protect.title")}
                  subtitle={t("welcome.setup.protect.subtitle")}
                  footer={
                    protectResult?.success ||
                    protectResult?.reason === "defenderUnavailable" ? (
                      <Button
                        size="lg"
                        onClick={handleNext}
                        className={primaryButtonClass}
                      >
                        {t("welcome.continue")}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="lg"
                          onClick={handleEnableProtection}
                          disabled={protectLoading}
                          className={primaryButtonClass}
                        >
                          {protectLoading ? (
                            <>
                              <Loader className="mr-2 h-5 w-5 animate-spin" />
                              {t("welcome.setup.protect.working")}
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="mr-2 h-5 w-5" />
                              {protectResult
                                ? t("welcome.setup.protect.retry")
                                : t("welcome.setup.protect.enable")}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setShowNoDefenderWarning(true)}
                          disabled={protectLoading}
                          className="text-muted-foreground hover:text-primary"
                        >
                          {t("welcome.setup.protect.skip")}
                        </Button>
                      </>
                    )
                  }
                >
                  <div className={`${cardClass} space-y-3 text-left`}>
                    <div>
                      <p className="mb-2 text-sm text-muted-foreground">
                        {t("welcome.setup.protect.whatItDoes")}
                      </p>
                      <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-background/60 px-3 py-2">
                        <FolderDownIcon className="h-4 w-4 shrink-0 text-primary" />
                        <span
                          className="truncate font-mono text-sm"
                          title={downloadDirectory}
                        >
                          {downloadDirectory}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-start gap-2">
                        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p>{t("welcome.setup.protect.scope")}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p>{t("welcome.setup.protect.adminPrompt")}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p>
                          {t("welcome.setup.protect.otherAntivirus")}{" "}
                          <button
                            type="button"
                            className="inline-flex items-center text-primary hover:underline"
                            onClick={() =>
                              window.electron.openURL(
                                "https://ascendara.app/docs/features/overview#protecting-directories-from-windows-defender"
                              )
                            }
                          >
                            {t("common.learnMore")}
                            <ExternalLink className="ml-1 h-3 w-3" />
                          </button>
                        </p>
                      </div>
                    </div>
                  </div>

                  {protectResult && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mt-3 flex items-start gap-3 rounded-xl border p-3 text-left ${
                        protectResult.success
                          ? "border-green-500/40 bg-green-500/10"
                          : protectResult.reason === "defenderUnavailable"
                            ? "border-blue-500/30 bg-blue-500/10"
                            : "border-amber-500/30 bg-amber-500/10"
                      }`}
                    >
                      {protectResult.success ? (
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                      ) : protectResult.reason === "defenderUnavailable" ? (
                        <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                      )}
                      <div className="space-y-1 text-sm">
                        {protectResult.success ? (
                          <p className="font-semibold">
                            {t("welcome.setup.protect.done")}
                          </p>
                        ) : (
                          <>
                            <p className="font-semibold">
                              {t(`welcome.setup.protect.errors.${protectReasonKey}Title`)}
                            </p>
                            <p className="text-muted-foreground">
                              {t(`welcome.setup.protect.errors.${protectReasonKey}`)}
                            </p>
                            {protectReasonKey === "failed" && protectResult.error && (
                              <details className="text-xs text-muted-foreground">
                                <summary className="cursor-pointer select-none">
                                  {t("welcome.setup.protect.errors.details")}
                                </summary>
                                <p className="mt-1 break-words font-mono">
                                  {protectResult.error}
                                </p>
                              </details>
                            )}
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </SetupStep>
              )}

              {step === "verifyDirectory" && (
                <SetupStep
                  key="verifyDirectory"
                  icon={FolderCheck}
                  title={t("welcome.setup.verify.title")}
                  subtitle={t("welcome.setup.verify.subtitle")}
                  footer={
                    folderCheck.state !== "done" ? (
                      <>
                        <Button size="lg" disabled className={primaryButtonClass}>
                          <Loader className="mr-2 h-5 w-5 animate-spin" />
                          {t("welcome.setup.verify.checking")}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={handleNext}
                          className="text-muted-foreground hover:text-primary"
                        >
                          {t("welcome.setup.verify.skip")}
                        </Button>
                      </>
                    ) : folderCheck.passed ? (
                      <Button
                        size="lg"
                        onClick={handleNext}
                        className={primaryButtonClass}
                      >
                        {t("welcome.continue")}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="lg"
                          onClick={() => folderCheck.run(downloadDirectory)}
                          className={primaryButtonClass}
                        >
                          <RefreshCw className="mr-2 h-5 w-5" />
                          {t("welcome.setup.verify.retry")}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={handleNext}
                          className="text-muted-foreground hover:text-primary"
                        >
                          {t("welcome.setup.verify.continueAnyway")}
                        </Button>
                      </>
                    )
                  }
                >
                  <div className={`${cardClass} space-y-3 text-left`}>
                    <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-background/60 px-3 py-2">
                      <FolderDownIcon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate font-mono text-sm" title={downloadDirectory}>
                        {downloadDirectory}
                      </span>
                    </div>
                    <DownloadFolderCheckProgress check={folderCheck} />
                  </div>

                  <div className="mt-3">
                    <DownloadFolderCheckResult check={folderCheck}>
                      {folderCheck.antivirusIssue && !protectResult?.success && (
                        <button
                          type="button"
                          className="inline-flex items-center text-primary hover:underline"
                          onClick={() => goToStep("protectDirectories", -1)}
                        >
                          <ShieldCheck className="mr-1 h-4 w-4" />
                          {t("welcome.setup.verify.goProtect")}
                        </button>
                      )}
                    </DownloadFolderCheckResult>
                  </div>
                </SetupStep>
              )}

              {step === "personalize" && (
                <SetupStep
                  key="personalize"
                  icon={Palette}
                  title={t("welcome.setup.personalize.title")}
                  subtitle={t("welcome.setup.personalize.subtitle")}
                  wide
                  footer={
                    <Button size="lg" onClick={handleNext} className={primaryButtonClass}>
                      {t("welcome.continue")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  }
                >
                  <div className="mb-4 flex justify-center">
                    <div className="inline-flex rounded-lg bg-card/40 p-1">
                      {[true, false].map(light => (
                        <button
                          key={String(light)}
                          type="button"
                          onClick={() => setShowingLightThemes(light)}
                          className={`rounded-md px-4 py-1.5 text-sm transition-all ${
                            showingLightThemes === light
                              ? "bg-primary text-secondary"
                              : "hover:bg-primary/10"
                          }`}
                        >
                          {light ? t("welcome.lightThemes") : t("welcome.darkThemes")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
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
                  </div>

                  <div
                    className={`${cardClass} mt-4 flex cursor-pointer items-center gap-4 text-left`}
                    onClick={() => handleAutoUpdateToggle(!autoUpdate)}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <RefreshCw className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {t("welcome.setup.personalize.autoUpdateTitle")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("welcome.setup.personalize.autoUpdateDesc")}
                      </p>
                    </div>
                    <Switch
                      checked={autoUpdate}
                      aria-label={t("welcome.setup.personalize.autoUpdateTitle")}
                      onClick={event => event.stopPropagation()}
                      onCheckedChange={handleAutoUpdateToggle}
                    />
                  </div>
                </SetupStep>
              )}

              {step === "extras" && (
                <SetupStep
                  key="extras"
                  icon={PlusCircle}
                  title={t("welcome.setup.extras.title")}
                  subtitle={t("welcome.setup.extras.subtitle")}
                  wide
                  footer={
                    <Button size="lg" onClick={handleNext} className={primaryButtonClass}>
                      {t("welcome.continue")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  }
                >
                  <div className="grid gap-4 text-left md:grid-cols-2">
                    <div className={`${cardClass} flex flex-col`}>
                      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Gamepad2 className="h-5 w-5" />
                      </div>
                      <h3 className="mb-1 font-semibold">
                        {t("welcome.setup.extras.importTitle")}
                      </h3>
                      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                        {t("welcome.setup.extras.importDesc")}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          storeLibrary.refresh();
                          setIsImportChooserOpen(true);
                        }}
                        className="mt-auto w-full text-primary hover:bg-primary/10"
                      >
                        {t("welcome.setup.extras.importButton")}
                      </Button>
                    </div>

                    <div className={`${cardClass} flex flex-col`}>
                      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <PuzzleIcon className="h-5 w-5" />
                      </div>
                      <h3 className="mb-1 font-semibold">
                        {t("welcome.setup.extras.extensionTitle")}
                      </h3>
                      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                        {t("welcome.setup.extras.extensionDesc")}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() =>
                          window.electron.openURL("https://ascendara.app/extension")
                        }
                        className="mt-auto w-full text-primary hover:bg-primary/10"
                      >
                        {t("welcome.setup.extras.extensionButton")}
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <ImportFromLaunchersDialog
                    open={isImportChooserOpen}
                    onOpenChange={setIsImportChooserOpen}
                    connectedStores={storeLibrary.accounts
                      .filter(account => account.connected)
                      .map(account => account.store)}
                    onScanThisPC={() => {
                      setIsImportChooserOpen(false);
                      setIsImportGamesOpen(true);
                    }}
                    onConnectStores={() => {
                      setIsImportChooserOpen(false);
                      setIsStoreAccountsOpen(true);
                    }}
                  />
                  <ImportGamesDialog
                    open={isImportGamesOpen}
                    onOpenChange={setIsImportGamesOpen}
                    allowCatalogSwap={false}
                  />
                  <StoreAccountsDialog
                    open={isStoreAccountsOpen}
                    onOpenChange={setIsStoreAccountsOpen}
                    preferences={storeLibrary.preferences}
                    onPreferencesChange={storeLibrary.updatePreferences}
                  />
                </SetupStep>
              )}

              {step === "linuxDeps" && (
                <motion.div
                  key="non-windows-dependencies"
                  className="relative z-10 flex min-h-screen flex-col items-center justify-center px-8 pb-8 pt-32 text-center"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {!dependenciesInstalled && setupError && (
                    <p role="alert" className="text-destructive mb-4">
                      {setupError}
                    </p>
                  )}
                  {!dependenciesInstalled ? (
                    <>
                      <motion.div className="mb-8 text-center" variants={itemVariants}>
                        <WelcomeStepIcon icon={Download} />
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
                            disabled={isInstalling}
                            onClick={async () => {
                              setIsInstalling(true);
                              setSetupError("");
                              try {
                                const result = await window.electron.installPython();
                                if (!result.success) throw new Error(result.message);
                                setDependenciesInstalled(true);
                              } catch (error) {
                                setSetupError(error.message);
                              } finally {
                                setIsInstalling(false);
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
                    /* PROTON & WINE */
                    <>
                      <motion.div className="mb-8 text-center" variants={itemVariants}>
                        <WelcomeStepIcon icon={Wine} />
                        <h2 className="text-4xl font-bold text-primary">
                          {t("welcome.compatibilityLayer")}
                        </h2>
                      </motion.div>

                      <motion.div
                        className="mb-12 w-full max-w-4xl space-y-6"
                        variants={itemVariants}
                      >
                        {setupError && (
                          <p
                            role="alert"
                            className="border-destructive text-destructive rounded-lg border p-3"
                          >
                            {setupError}
                          </p>
                        )}
                        {!isOnLinux ? (
                          <div className="space-y-4 rounded-xl border bg-card p-6">
                            <h3 className="text-xl font-semibold">
                              {t("welcome.macWineTitle")}
                            </h3>
                            <p>{t("welcome.macWineDescription")}</p>
                            <p>{t("welcome.macWineHomebrewSetup")}</p>
                            {runnersList.map(runner => (
                              <p key={runner.path}>
                                {runner.name}: {runner.version}
                              </p>
                            ))}
                            <div className="flex flex-wrap justify-center gap-3">
                              <Button
                                className="text-secondary"
                                disabled={installingWine}
                                onClick={installWine}
                              >
                                {installingWine
                                  ? t("common.installing")
                                  : t("welcome.installWine")}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => window.electron.openURL("https://brew.sh")}
                              >
                                {t("welcome.homebrewInstructions")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Status Banner */}
                            {(() => {
                              const hasProton = runnersList.some(
                                r =>
                                  r.type === "proton" ||
                                  r.name.toLowerCase().includes("proton")
                              );
                              const hasOptimizedProton = runnersList.some(r => {
                                const n = r.name.toLowerCase();
                                return (
                                  n.includes("cachyos") ||
                                  n.includes("ge-proton") ||
                                  n.includes("proton-ge")
                                );
                              });
                              const onlySteamProton = hasProton && !hasOptimizedProton;
                              const bothInstalled = hasOptimizedProton && umuInstalled;
                              const partialOptimal = onlySteamProton && umuInstalled;
                              const noneInstalled = !hasProton && !umuInstalled;

                              return (
                                <div
                                  className={`flex gap-4 rounded-xl border p-5 text-left ${
                                    bothInstalled
                                      ? "border-green-500/40 bg-green-500/10"
                                      : noneInstalled
                                        ? "border-red-500/30 bg-red-500/10"
                                        : partialOptimal
                                          ? "border-blue-500/30 bg-blue-500/10"
                                          : "border-yellow-500/30 bg-yellow-500/10"
                                  }`}
                                >
                                  {bothInstalled ? (
                                    <CircleCheck className="mt-1 h-7 w-7 shrink-0 text-green-500" />
                                  ) : noneInstalled ? (
                                    <XCircle className="mt-1 h-7 w-7 shrink-0 text-red-500" />
                                  ) : partialOptimal ? (
                                    <Info className="mt-1 h-7 w-7 shrink-0 text-blue-500" />
                                  ) : (
                                    <AlertTriangle className="mt-1 h-7 w-7 shrink-0 text-yellow-500" />
                                  )}

                                  <div className="space-y-1">
                                    <h3
                                      className={`text-lg font-bold ${
                                        bothInstalled
                                          ? "text-green-500"
                                          : noneInstalled
                                            ? "text-red-500"
                                            : partialOptimal
                                              ? "text-blue-500"
                                              : "text-yellow-500"
                                      }`}
                                    >
                                      {bothInstalled
                                        ? t("welcome.bothInstalled")
                                        : noneInstalled
                                          ? t("welcome.noRunnersTitle")
                                          : partialOptimal
                                            ? t("welcome.steamProtonDetected")
                                            : hasProton
                                              ? t("welcome.partialSetupProton")
                                              : t("welcome.partialSetupUmu")}
                                    </h3>

                                    {runnersList.length > 0 && (
                                      <div className="rounded-lg border border-border/50 bg-background/40 p-2 font-mono text-sm">
                                        {runnersList.map(r => (
                                          <div
                                            key={r.path}
                                            className="flex items-center justify-between opacity-90"
                                          >
                                            <span className="font-semibold">
                                              {r.name}
                                            </span>
                                            <span className="ml-4 truncate text-xs opacity-60">
                                              {r.path}
                                            </span>
                                          </div>
                                        ))}
                                        {umuInstalled && (
                                          <div className="mt-1 flex items-center gap-2 opacity-90">
                                            <span className="font-semibold text-green-600">
                                              UMU Launcher
                                            </span>
                                            <span className="text-xs text-green-600 opacity-80">
                                              {t("welcome.installed")}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* ── Recommended ── */}
                            <div className="space-y-4 rounded-xl border-2 border-green-500/50 bg-green-500/5 p-5">
                              <div className="mb-1 flex items-center gap-2">
                                <CircleCheck className="h-5 w-5 text-green-500" />
                                <span className="text-lg font-bold text-green-600 dark:text-green-400">
                                  {t("welcome.recommendedSetup")}
                                </span>
                                <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-600">
                                  {t("welcome.bestCompatibility")}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {t("welcome.recommendedSetupInfo")}
                              </p>

                              <div className="grid gap-3 sm:grid-cols-2">
                                {/* UMU Launcher */}
                                <div
                                  className={`flex flex-col justify-between rounded-xl border-2 p-4 ${umuInstalled ? "border-green-500 bg-green-500/10" : "border-green-500/50 bg-card"}`}
                                >
                                  <div>
                                    <div className="mb-1 flex items-center gap-2">
                                      {umuInstalled ? (
                                        <CircleCheck className="h-5 w-5 text-green-500" />
                                      ) : (
                                        <Download className="h-5 w-5 text-green-500" />
                                      )}
                                      <span className="font-bold text-foreground">
                                        UMU Launcher
                                      </span>
                                      {umuInstalled && (
                                        <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-xs font-semibold text-green-600">
                                          Installed
                                        </span>
                                      )}
                                    </div>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                      {t("welcome.umuLauncherDesc")}
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    disabled={umuInstalled || isDownloadingUmuLauncher}
                                    className="w-full text-secondary"
                                    onClick={async () => {
                                      setIsDownloadingUmuLauncher(true);
                                      try {
                                        const result =
                                          await window.electron.downloadUmuLauncher();
                                        if (!result.success)
                                          throw new Error(result.message || result.error);
                                        setUmuInstalled(
                                          await window.electron.isUmuInstalled()
                                        );
                                      } catch (e) {
                                        setSetupError(e.message);
                                      }
                                      setIsDownloadingUmuLauncher(false);
                                    }}
                                  >
                                    {isDownloadingUmuLauncher ? (
                                      <>
                                        <Loader className="mr-2 h-4 w-4 animate-spin" />{" "}
                                        {t("common.installing")}
                                      </>
                                    ) : umuInstalled ? (
                                      <>
                                        <CircleCheck className="mr-2 h-4 w-4" />{" "}
                                        {t("common.installed")}
                                      </>
                                    ) : (
                                      <>
                                        <Download className="mr-2 h-4 w-4" />{" "}
                                        {t("welcome.installRecommended")}
                                      </>
                                    )}
                                  </Button>
                                </div>

                                {/* Proton CachyOS */}
                                <div className="flex flex-col justify-between rounded-xl border-2 border-primary bg-primary/5 p-4 shadow-md">
                                  <div>
                                    <div className="mb-1 flex items-center gap-2">
                                      <Rocket className="h-5 w-5 text-primary" />
                                      <span className="font-bold text-primary">
                                        Proton CachyOS
                                      </span>
                                    </div>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                      {t("welcome.protonDesc")}
                                      {protonCachyInfo?.sizeFormatted && (
                                        <span className="mt-1 block font-mono text-xs opacity-75">
                                          {t("welcome.protonSize")}{" "}
                                          {protonCachyInfo.sizeFormatted}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    disabled={
                                      cachyOsInstalled || isDownloadingProtonCachy
                                    }
                                    className="w-full text-secondary"
                                    onClick={async () => {
                                      if (!protonCachyInfo) {
                                        setIsDownloadingProtonCachy(true);
                                        try {
                                          const info =
                                            await window.electron.getProtonCachyOSInfo();
                                          if (!info.success)
                                            throw new Error(info.error || info.message);
                                          if (info.success) {
                                            setProtonCachyInfo(info);
                                            setShowProtonCachyConfirm(true);
                                          }
                                        } catch (e) {
                                          setSetupError(e.message);
                                        }
                                        setIsDownloadingProtonCachy(false);
                                      } else {
                                        setShowProtonCachyConfirm(true);
                                      }
                                    }}
                                  >
                                    {isDownloadingProtonCachy ? (
                                      <>
                                        <Loader className="mr-2 h-4 w-4 animate-spin" />{" "}
                                        {t("welcome.protonChecking")}
                                      </>
                                    ) : cachyOsInstalled ? (
                                      <>
                                        <CircleCheck className="mr-2 h-4 w-4" />{" "}
                                        {t("common.installed")}
                                      </>
                                    ) : (
                                      <>
                                        <Download className="mr-2 h-4 w-4" />{" "}
                                        {t("welcome.protonInstallCachy")}
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Alternative (Wine / UMU-Proton) */}
                            <details className="rounded-xl border border-border bg-card/30 p-4">
                              <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground">
                                {t("welcome.alternatives")}
                              </summary>
                              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                {/* Proton-GE */}
                                <div className="flex flex-col justify-between rounded-xl border border-border bg-card/50 p-4">
                                  <div>
                                    <div className="mb-1 flex items-center gap-2">
                                      <Rocket className="h-5 w-5 text-muted-foreground" />
                                      <span className="font-bold text-muted-foreground">
                                        Proton-GE
                                      </span>
                                    </div>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                      {t("welcome.protonGEAltDesc")}
                                      {protonGEInfo?.sizeFormatted && (
                                        <span className="mt-1 block font-mono text-xs opacity-75">
                                          {t("welcome.protonSize")}{" "}
                                          {protonGEInfo.sizeFormatted}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isDownloadingProtonGE}
                                    className="w-full text-muted-foreground"
                                    onClick={async () => {
                                      if (!protonGEInfo) {
                                        setIsDownloadingProtonGE(true);
                                        try {
                                          const info =
                                            await window.electron.getProtonGEInfo();
                                          if (!info.success)
                                            throw new Error(info.error || info.message);
                                          if (info.success) {
                                            if (info.alreadyInstalled) {
                                              const updated =
                                                await window.electron.getRunners();
                                              setRunnersList(updated);
                                            } else {
                                              setProtonGEInfo(info);
                                              setShowProtonGEConfirm(true);
                                            }
                                          }
                                        } catch (e) {
                                          setSetupError(e.message);
                                        }
                                        setIsDownloadingProtonGE(false);
                                      } else {
                                        setShowProtonGEConfirm(true);
                                      }
                                    }}
                                  >
                                    {isDownloadingProtonGE ? (
                                      <>
                                        <Loader className="mr-2 h-4 w-4 animate-spin" />{" "}
                                        {t("welcome.protonChecking")}
                                      </>
                                    ) : (
                                      <>
                                        <Download className="mr-2 h-4 w-4" />{" "}
                                        {t("common.install")}
                                      </>
                                    )}
                                  </Button>
                                </div>

                                {/* Wine */}
                                <div className="flex flex-col justify-between rounded-xl border border-border bg-card/50 p-4">
                                  <div>
                                    <div className="mb-1 flex items-center gap-2">
                                      <Wine className="h-5 w-5 text-muted-foreground" />
                                      <span className="font-bold text-muted-foreground">
                                        {t("welcome.systemWine")}
                                      </span>
                                    </div>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                      {t("welcome.systemWineDesc")}
                                    </p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-muted-foreground"
                                    disabled={installingWine}
                                    onClick={installWine}
                                  >
                                    <FolderDownIcon className="mr-2 h-4 w-4" />{" "}
                                    {t("welcome.installWine")}
                                  </Button>
                                </div>

                                {/* UMU Proton */}
                                <div className="flex flex-col justify-between rounded-xl border border-border bg-card/50 p-4 opacity-80">
                                  <div>
                                    <div className="mb-1 flex items-center gap-2">
                                      <Rocket className="h-5 w-5 text-muted-foreground" />
                                      <span className="font-bold text-muted-foreground">
                                        UMU-Proton
                                      </span>
                                    </div>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                      {t("welcome.umuProtonDesc")}
                                      {umuProtonInfo?.sizeFormatted && (
                                        <span className="mt-1 block font-mono text-xs opacity-75">
                                          {t("welcome.latest")}: {umuProtonInfo.name} ·{" "}
                                          {umuProtonInfo.sizeFormatted}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isDownloadingUmuProton}
                                    className="w-full text-muted-foreground"
                                    onClick={async () => {
                                      setIsDownloadingUmuProton(true);
                                      try {
                                        const result =
                                          await window.electron.downloadUmuProton();
                                        if (!result.success)
                                          throw new Error(result.message || result.error);
                                        if (result.success) {
                                          const updated =
                                            await window.electron.getRunners();
                                          setRunnersList(updated);
                                          await window.electron.updateSetting(
                                            "linuxRunner",
                                            result.path
                                          );
                                          const info =
                                            await window.electron.getUmuProtonInfo();
                                          if (info?.success) setUmuProtonInfo(info);
                                        }
                                      } catch (e) {
                                        setSetupError(e.message);
                                      }
                                      setIsDownloadingUmuProton(false);
                                    }}
                                  >
                                    {isDownloadingUmuProton ? (
                                      <>
                                        <Loader className="mr-2 h-4 w-4 animate-spin" />{" "}
                                        {t("common.installing")}
                                      </>
                                    ) : umuProtonInfo?.alreadyInstalled ? (
                                      <>
                                        <CircleCheck className="mr-2 h-4 w-4" />{" "}
                                        {t("common.installed")}
                                      </>
                                    ) : (
                                      <>
                                        <Download className="mr-2 h-4 w-4" />{" "}
                                        {t("common.install")}
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </details>

                            {!umuInstalled && runnersList.length > 0 && (
                              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-left">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                                <p className="text-xs text-yellow-600">
                                  {t("welcome.umuLauncherNotInstalled")}
                                </p>
                              </div>
                            )}
                          </>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex justify-center gap-3 pt-4">
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={async () => {
                              try {
                                const runners = await window.electron.getRunners();
                                setRunnersList(runners);
                                const hasUmu =
                                  isOnLinux && (await window.electron.isUmuInstalled());
                                setUmuInstalled(hasUmu);
                                setSetupError(
                                  runners.length || hasUmu
                                    ? ""
                                    : t("welcome.noCompatibilityToolsFound")
                                );
                              } catch (error) {
                                setSetupError(error.message);
                              }
                            }}
                          >
                            {t("welcome.checkAgain")}
                          </Button>
                          <Button
                            onClick={() => handleNext()}
                            size="lg"
                            className={`px-12 py-6 text-lg ${runnersList.length > 0 || umuInstalled ? "text-secondary" : "text-foreground"}`}
                            variant={
                              runnersList.length > 0 || umuInstalled ? "default" : "ghost"
                            }
                          >
                            {runnersList.length > 0 || umuInstalled
                              ? t("welcome.continue")
                              : t("welcome.skip")}
                            <ArrowRight className="ml-2 h-5 w-5" />
                          </Button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </motion.div>
              )}

              {step === "dependencies" && (
                <SetupStep
                  key="dependencies"
                  icon={PackageOpen}
                  title={t("welcome.setup.deps.title")}
                  subtitle={t("welcome.setup.deps.subtitle")}
                  wide
                  footer={
                    isInstalling ? null : depsOutcome && depsOutcome !== "skipped" ? (
                      <>
                        <Button
                          size="lg"
                          onClick={handleNext}
                          className={primaryButtonClass}
                        >
                          {t("welcome.continue")}
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                        {depsOutcome !== "installed" && (
                          <Button
                            variant="ghost"
                            onClick={() => setShowDepsAlert(true)}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            {t("welcome.setup.deps.retry")}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          size="lg"
                          onClick={() => setShowDepsAlert(true)}
                          className={primaryButtonClass}
                        >
                          <Download className="mr-2 h-5 w-5" />
                          {t("welcome.setup.deps.install")}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setDepsOutcome("skipped");
                            handleNext();
                          }}
                          className="text-muted-foreground hover:text-primary"
                        >
                          {t("welcome.setup.deps.skip")}
                        </Button>
                      </>
                    )
                  }
                >
                  <div className="grid gap-2.5 text-left sm:grid-cols-2 lg:grid-cols-3">
                    {DEPENDENCIES.map(dep => {
                      const status = dependencyStatus[dep.name];
                      return (
                        <div
                          key={dep.name}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                            status === "failed"
                              ? "border-amber-500/40 bg-amber-500/5"
                              : status === "done"
                                ? "border-green-500/30 bg-green-500/5"
                                : "border-border/60 bg-card/30"
                          }`}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            {status === "installing" ? (
                              <Loader className="h-5 w-5 animate-spin" />
                            ) : status === "done" ? (
                              <CircleCheck className="h-5 w-5 text-green-500" />
                            ) : status === "failed" ? (
                              <AlertTriangle className="h-5 w-5 text-amber-500" />
                            ) : (
                              <PackageOpen className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium">{dep.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {status === "installing"
                                ? t("welcome.setup.deps.statusInstalling")
                                : status === "done"
                                  ? t("welcome.setup.deps.statusInstalled")
                                  : status === "failed"
                                    ? t("welcome.setup.deps.statusFailed")
                                    : t(dep.descKey)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {isInstalling && (
                    <motion.div
                      className="mx-auto mt-4 max-w-xl space-y-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <Progress
                        value={(progress / DEPENDENCIES.length) * 100}
                        className="h-2"
                      />
                      <p className="text-sm font-medium">
                        {t("welcome.setup.deps.installing", {
                          done: Math.min(progress + 1, DEPENDENCIES.length),
                          total: DEPENDENCIES.length,
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("welcome.setup.deps.adminHint")}
                      </p>
                    </motion.div>
                  )}

                  {!isInstalling && depsOutcome && depsOutcome !== "skipped" && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mx-auto mt-3 flex max-w-2xl items-start gap-3 rounded-xl border p-3 text-left ${
                        depsOutcome === "installed"
                          ? "border-green-500/40 bg-green-500/10"
                          : "border-amber-500/30 bg-amber-500/10"
                      }`}
                    >
                      {depsOutcome === "installed" ? (
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                      )}
                      <div className="space-y-1 text-sm">
                        {depsOutcome === "installed" ? (
                          <p className="font-semibold">
                            {t("welcome.setup.deps.allDone")}
                          </p>
                        ) : (
                          <>
                            <p className="font-semibold">
                              {failedDependencies.length
                                ? t("welcome.setup.deps.someFailed", {
                                    names: failedDependencies.join(", "),
                                  })
                                : t("welcome.setup.deps.downloadFailed")}
                            </p>
                            <p className="text-muted-foreground">
                              {t("welcome.setup.deps.someFailedDesc")}
                            </p>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </SetupStep>
              )}

              {step === "finish" && (
                <SetupStep
                  key="finish"
                  icon={Rocket}
                  title={t("welcome.setup.finish.title")}
                  subtitle={t("welcome.setup.finish.subtitle")}
                  footer={
                    <>
                      <Button
                        size="lg"
                        onClick={() => handleExit(true)}
                        className={primaryButtonClass}
                      >
                        {t("welcome.takeTour")}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleExit(false)}
                        className="text-sm text-muted-foreground transition-colors hover:text-primary"
                      >
                        {t("welcome.skipTour")}
                      </button>
                    </>
                  }
                >
                  <div className={`${cardClass} divide-y divide-border/60 p-0 text-left`}>
                    {[
                      {
                        icon: FolderDownIcon,
                        label: t("welcome.setup.finish.folder"),
                        value: downloadDirectory,
                        mono: true,
                        ok: !!downloadDirectory,
                      },
                      isOnWindows && {
                        icon: ShieldCheck,
                        label: t("welcome.setup.finish.protection"),
                        value: protectResult?.success
                          ? t("welcome.setup.finish.on")
                          : t("welcome.setup.finish.off"),
                        ok: !!protectResult?.success,
                      },
                      isOnWindows && {
                        icon: FolderCheck,
                        label: t("welcome.setup.finish.folderCheck"),
                        value: folderCheck.passed
                          ? t("welcome.setup.finish.folderCheckPassed")
                          : folderCheck.state === "done"
                            ? t("welcome.setup.finish.folderCheckIssues")
                            : t("welcome.setup.finish.folderCheckSkipped"),
                        ok: folderCheck.passed,
                      },
                      isOnWindows && {
                        icon: PackageOpen,
                        label: t("welcome.setup.finish.components"),
                        value:
                          depsOutcome === "installed"
                            ? t("welcome.setup.finish.componentsInstalled")
                            : depsOutcome === "partial"
                              ? t("welcome.setup.finish.componentsPartial")
                              : t("welcome.setup.finish.componentsSkipped"),
                        ok: depsOutcome === "installed",
                      },
                      {
                        icon: RefreshCw,
                        label: t("welcome.setup.finish.updates"),
                        value: autoUpdate
                          ? t("welcome.setup.finish.automatic")
                          : t("welcome.setup.finish.manual"),
                        ok: autoUpdate,
                      },
                    ]
                      .filter(Boolean)
                      .map(({ icon: Icon, label, value, mono, ok }) => (
                        <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                          <Icon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="shrink-0 text-sm font-medium">{label}</span>
                          <span
                            className={`ml-auto min-w-0 truncate text-right text-sm text-muted-foreground ${mono ? "font-mono" : ""}`}
                            title={value}
                          >
                            {value}
                          </span>
                          {ok ? (
                            <CircleCheck className="h-4 w-4 shrink-0 text-green-500" />
                          ) : (
                            <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />
                          )}
                        </div>
                      ))}
                  </div>

                  <div className="mt-3 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-left">
                    <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <p className="text-sm leading-relaxed">
                      {t("welcome.setup.finish.onlineTip")}
                    </p>
                  </div>
                </SetupStep>
              )}
            </AnimatePresence>
          </StepDirectionContext.Provider>
        </MotionConfig>
      </div>
      {/* Proton CachyOS Download Confirmation Dialog */}
      {showProtonCachyConfirm && protonCachyInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
            <h3 className={dialogTitleClassName}>
              {protonCachyInfo.updateAvailable
                ? t("welcome.protonGEDialog.updateTitleCachy")
                : t("welcome.protonGEDialog.downloadTitleCachy")}
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {protonCachyInfo.updateAvailable ? (
                  <>
                    {t("welcome.protonGEDialog.updateAvailableCachy")}{" "}
                    <strong className="text-foreground">{protonCachyInfo.name}</strong>
                    {protonCachyInfo.installedVersions.length > 0 && (
                      <span>
                        {" "}
                        ({t("welcome.protonGEDialog.replacing")}{" "}
                        {protonCachyInfo.installedVersions.join(", ")})
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {t("welcome.protonGEDialog.aboutToDownload")}{" "}
                    <strong className="text-foreground">{protonCachyInfo.name}</strong>.
                  </>
                )}
              </p>
              <p>
                {t("welcome.protonGEDialog.file")}{" "}
                <code className="rounded bg-muted px-1">{protonCachyInfo.fileName}</code>
              </p>
              <p>
                {t("welcome.protonGEDialog.size")}{" "}
                <strong className="text-foreground">
                  {protonCachyInfo.sizeFormatted}
                </strong>{" "}
                (
                {t("welcome.protonGEDialog.sizeAfterExtraction", {
                  size: (protonCachyInfo.size / (1024 * 1024 * 1024)).toFixed(1),
                })}
                )
              </p>
              <p className="text-muted-foreground">
                {t("welcome.protonGEDialog.descriptionCachy")}{" "}
                <code className="rounded bg-muted px-1">~/.ascendara/runners/</code>
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowProtonCachyConfirm(false);
                  setProtonCachyInfo(null);
                }}
              >
                {t("welcome.protonGEDialog.cancel")}
              </Button>
              <Button
                onClick={async () => {
                  setShowProtonCachyConfirm(false);
                  setIsDownloadingProtonCachy(true);
                  try {
                    const result = await window.electron.downloadProtonCachyOS();
                    if (!result.success) throw new Error(result.message || result.error);
                    if (result.success) {
                      const updated = await window.electron.getRunners();
                      setRunnersList(updated);
                      setProtonInstalled(true);
                      await window.electron.updateSetting("linuxRunner", result.path);
                    }
                  } catch (e) {
                    setSetupError(e.message);
                  }
                  setIsDownloadingProtonCachy(false);
                }}
                className="gap-2 text-secondary"
              >
                <Download className="h-4 w-4" />
                {t("welcome.protonGEDialog.download")} ({protonCachyInfo.sizeFormatted})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Proton-GE Download Confirmation Dialog */}
      {showProtonGEConfirm && protonGEInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
            <h3 className={dialogTitleClassName}>
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
                  setShowProtonGEConfirm(false);
                  setProtonGEInfo(null);
                }}
              >
                {t("welcome.protonGEDialog.cancel")}
              </Button>
              <Button
                onClick={async () => {
                  setShowProtonGEConfirm(false);
                  setIsDownloadingProtonGE(true);
                  try {
                    const result = await window.electron.downloadProtonGE();
                    if (!result.success) throw new Error(result.message || result.error);
                    if (result.success) {
                      const updated = await window.electron.getRunners();
                      setRunnersList(updated);
                      setProtonInstalled(true);
                      await window.electron.updateSetting("linuxRunner", result.path);
                    }
                  } catch (e) {
                    setSetupError(e.message);
                  }
                  setIsDownloadingProtonGE(false);
                }}
                className="gap-2 text-secondary"
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
