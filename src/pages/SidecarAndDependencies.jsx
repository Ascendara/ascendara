import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  CircleCheck,
  AlertCircle,
  CircleAlert,
  Loader,
  XCircle,
  X,
  Car,
  MonitorDot,
  MinusCircle,
  BadgeCheck,
  Link2,
  MonitorCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
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

const ALL_SIDECARS = [
  {
    id: "watchdog",
    name: "Achievement Watcher",
    description: "Track and view game achievements",
    source:
      "https://github.com/Ascendara/ascendara/tree/main/binaries/AscendaraAchievementWatcher/src",
  },
  {
    id: "ludusavi",
    name: "Ludusavi Backup",
    description: "Backup and restore game saves",
    source: "https://github.com/mtkennerly/ludusavi",
  },
  {
    id: "steamcmd",
    name: "SteamCMD Tool",
    description: "Download Steam Workshop items",
    source: "https://developer.valvesoftware.com/wiki/SteamCMD#Downloading_SteamCMD",
  },
  {
    id: "torrent",
    name: "Torrent Handler",
    description: "Download and manage torrents",
    source:
      "https://github.com/Ascendara/ascendara/tree/main/binaries/AscendaraTorrentHandler/src",
  },
  {
    id: "translator",
    name: "Language Translator",
    description: "Automatically translate Ascendara UI text",
    source:
      "https://github.com/Ascendara/ascendara/tree/main/binaries/AscendaraLanguageTranslation/src",
  },
  {
    id: "downloader",
    name: "Download Manager",
    description:
      "Ascendara's download manager for downloading files from source providers",
    builtIn: true,
    source:
      "https://github.com/Ascendara/ascendara/tree/main/binaries/AscendaraDownloader/src",
  },
  {
    id: "localrefresh",
    name: "Index Refresh Tool",
    description: "Refresh Ascendara's index with the custom scraper",
    builtIn: true,
    source:
      "https://github.com/Ascendara/ascendara/tree/main/binaries/AscendaraLocalRefresh/src",
  },
  {
    id: "gofilehelper",
    name: "GoFile Helper",
    description: "Download and manage files from the GoFile provider",
    builtIn: true,
    source:
      "https://github.com/Ascendara/ascendara/tree/main/binaries/AscendaraDownloader/src",
  },
  {
    id: "crashreporter",
    name: "Crash Reporter",
    description: "Ascendara's crash reporter GUI for handling crashes",
    builtIn: true,
    source:
      "https://github.com/Ascendara/ascendara/tree/main/binaries/AscendaraCrashReporter/src",
  },
  {
    id: "notification",
    name: "Notification Helper",
    description: "Ascendara's notification helper for handling notifications",
    builtIn: true,
    source:
      "https://github.com/Ascendara/ascendara/tree/main/binaries/AscendaraNotificationHelper/src",
  },
  {
    id: "gamehandler",
    name: "Game Handler",
    description: "Ascendara's game handler for handling game downloads",
    builtIn: true,
    source:
      "https://github.com/Ascendara/ascendara/tree/main/binaries/AscendaraGameHandler/src",
  },
];

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, staggerChildren: 0.1 } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.4 } },
};

const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

const SidecarAndDependencies = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Dependencies logic
  const [dependencyStatus, setDependencyStatus] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedDeps, setCompletedDeps] = useState(new Set());
  const totalDependencies = 5;

  const executableToLabelMap = {
    "dotNetFx40_Full_x86_x64.exe": t => ".NET Framework 4.0",
    "dxwebsetup.exe": t => "DirectX",
    "oalinst.exe": t => "OpenAL",
    "VC_redist.x64.exe": t => "Visual C++ Redistributable",
    "xnafx40_redist.msi": t => "XNA Framework",
  };

  const checkDependencies = useCallback(async () => {
    try {
      const status = await window.electron.checkGameDependencies();
      const mappedStatus = {};
      status.forEach(dep => {
        const label = executableToLabelMap[dep.file](t);
        if (label) {
          mappedStatus[label] = getStatusInfo(dep.installed);
        }
      });
      setDependencyStatus(mappedStatus);
    } catch (error) {
      console.error("Failed to check dependencies:", error);
    }
  }, [t]);

  useEffect(() => {
    checkDependencies();
  }, [checkDependencies]);

  useEffect(() => {
    const handleDependencyStatus = (event, { name, status }) => {
      const label = executableToLabelMap[name](t);
      if (!label) return;
      if (status === "starting") {
        setDependencyStatus(prevStatus => ({
          ...prevStatus,
          [label]: {
            installed: false,
            icon: <Loader className="h-5 w-5 animate-spin" />,
          },
        }));
      } else if (status === "finished") {
        setCompletedDeps(prev => {
          if (!prev.has(label)) {
            setProgress(p => p + 1);
            return new Set([...prev, label]);
          }
          return prev;
        });
        setDependencyStatus(prevStatus => {
          const updatedStatus = {
            ...prevStatus,
            [label]: {
              installed: true,
              icon: <CircleCheck className="h-5 w-5 text-green-500" />,
            },
          };
          if (Object.values(updatedStatus).every(dep => dep.installed))
            setIsInstalling(false);
          return updatedStatus;
        });
      } else if (status === "failed") {
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

  const handleInstallDependencies = async () => {
    setIsInstalling(true);
    setProgress(0);
    setCompletedDeps(new Set());
    setShowConfirmDialog(false);
    setDependencyStatus(prevStatus => {
      const updatedStatus = { ...prevStatus };
      Object.keys(executableToLabelMap).forEach(dep => {
        const label = executableToLabelMap[dep](t);
        updatedStatus[label] = {
          installed: false,
          icon: <Loader className="h-5 w-5 animate-spin" />,
        };
      });
      return updatedStatus;
    });
    try {
      await window.electron.installDependencies();
      toast.success(t("settings.reinstallSuccess"));
      await checkDependencies();
    } catch (error) {
      toast.error(t("settings.reinstallError"));
      setIsInstalling(false);
    }
  };

  const getStatusInfo = installed => {
    if (installed === undefined || installed === null) {
      return {
        icon: <CircleAlert className="h-5 w-5 text-muted-foreground" />,
        status: "checking",
      };
    }
    return installed
      ? { icon: <CircleCheck className="h-5 w-5 text-green-500" />, status: "installed" }
      : { icon: <AlertCircle className="h-5 w-5 text-red-500" />, status: "missing" };
  };

  const dependencies = [
    {
      name: ".NET Framework 4.0",
      desc: t("welcome.requiredForModernGames"),
      url: "https://dotnet.microsoft.com/download/dotnet-framework/net40",
    },
    {
      name: "DirectX",
      desc: t("welcome.graphicsAndMultimedia"),
      url: "https://www.microsoft.com/en-us/download/details.aspx?id=35",
    },
    {
      name: "OpenAL",
      desc: t("welcome.audioProcessing"),
      url: "https://www.openal.org/downloads/",
    },
    {
      name: "Visual C++ Redistributable",
      desc: t("welcome.runtimeComponents"),
      url: "https://aka.ms/vs/17/release/vc_redist.x64.exe",
    },
    {
      name: "XNA Framework",
      desc: t("welcome.gameDevelopmentFramework"),
      url: "https://www.microsoft.com/en-us/download/details.aspx?id=20914",
    },
  ];

  const [sidecars, setSidecars] = useState([]);
  const [installedTools, setInstalledTools] = useState([]);
  const [steamcmdStatus, setSteamcmdStatus] = useState("not_installed");
  const [isOnWindows, setIsOnWindows] = useState(true);
  // Show/hide built-in sidecars
  const [showBuiltIn, setShowBuiltIn] = useState(false);

  useEffect(() => {
    async function fetchInstalledTools() {
      try {
        const tools = await window.electron.getInstalledTools();
        let installed = tools;
        let steamcmdStatus = "not_installed";
        try {
          const steamcmdResult = await window.electron.isSteamCMDInstalled();
          if (steamcmdResult === true) {
            if (!installed.includes("steamcmd")) {
              installed = [...installed, "steamcmd"];
            }
            steamcmdStatus = "installed";
          } else if (
            typeof steamcmdResult === "object" &&
            steamcmdResult.message === "not_on_windows"
          ) {
            steamcmdStatus = "not_on_windows";
          }
        } catch {}
        setInstalledTools(installed);
        setSteamcmdStatus(steamcmdStatus);

        // Determine OS
        let isOnWindows = true;
        if (window.electron.isOnWindows) {
          isOnWindows = await window.electron.isOnWindows();
          setIsOnWindows(isOnWindows);
        }

        // Check if achievement watcher is running
        const isWatcherRunning = await window.electron.isWatchdogRunning();

        // Build sidecar statuses
        const sidecarStatuses = ALL_SIDECARS.map(sc => {
          if (sc.id === "steamcmd") {
            return {
              ...sc,
              installed: steamcmdStatus === "installed",
              running: false,
              notOnWindows: steamcmdStatus === "not_on_windows",
            };
          }
          if (sc.id === "watchdog") {
            return {
              ...sc,
              running: isWatcherRunning,
              notOnWindows: !isOnWindows,
            };
          }
          return {
            ...sc,
            installed: installed.includes(sc.id),
            running: false,
            notOnWindows: !isOnWindows,
          };
        });
        setSidecars(sidecarStatuses);
      } catch (e) {
        setInstalledTools([]);
        setSteamcmdStatus("not_installed");
      }
    }
    fetchInstalledTools();
  }, []);

  return (
    <div style={{ transform: "scale(0.90)", transformOrigin: "top center" }}>
      <motion.div
        className="mx-auto my-10 max-w-6xl px-2 md:px-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div className="mb-8 flex w-full justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/settings")}
            className="rounded-full hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Sidecars Section */}
          <section className="flex flex-col rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-background p-6 shadow-lg">
            <div className="mb-6 flex items-center gap-3">
              <Car className="mb-3 h-7 w-7 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight text-primary">
                {t("settings.sidecar.title")}
              </h2>
            </div>
            <p className="mb-4 text-base text-muted-foreground">
              {t("settings.sidecar.description")}
            </p>
            {/* Toggle for built-in sidecars */}
            <div className="mb-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBuiltIn(prev => !prev)}
                className="flex items-center gap-2"
              >
                {showBuiltIn ? (
                  <BadgeCheck className="h-4 w-4 text-primary" />
                ) : (
                  <BadgeCheck className="h-4 w-4 text-muted-foreground" />
                )}
                {showBuiltIn
                  ? t("settings.sidecar.hideBuiltIn") || "Hide Built-in"
                  : t("settings.sidecar.showBuiltIn") || "Show Built-in"}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {sidecars
                .filter(sc => showBuiltIn || !sc.builtIn)
                .map(sidecar => {
                  let badge;
                  if (sidecar.notOnWindows) {
                    badge = (
                      <span className="flex items-center gap-1 rounded bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">
                        <MinusCircle className="mb-0.5 inline h-4 w-4 text-yellow-500" />
                        {t("settings.sidecar.notOnWindows")}
                      </span>
                    );
                  } else if (sidecar.builtIn) {
                    badge = null;
                  } else if (sidecar.running) {
                    badge = (
                      <span className="flex animate-pulse items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                        <MonitorCheck className="mb-0.5 inline h-4 w-4 text-green-600" />
                        {t("settings.sidecar.running")}
                      </span>
                    );
                  } else if (sidecar.installed) {
                    badge = (
                      <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        <CircleCheck className="mb-0.5 inline h-4 w-4 text-primary" />
                        {t("settings.sidecar.installed")}
                      </span>
                    );
                  } else if (
                    sidecar.id === "watchdog" &&
                    !sidecar.running &&
                    isOnWindows
                  ) {
                    badge = (
                      <span className="flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        <AlertCircle className="mb-0.5 inline h-4 w-4 text-red-600" />
                        {t("settings.sidecar.notRunning")}
                      </span>
                    );
                  } else {
                    badge = (
                      <span className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 opacity-30">
                        <MinusCircle className="mb-0.5 inline h-4 w-4 text-gray-400" />
                        {t("settings.sidecar.available")}
                      </span>
                    );
                  }
                  return (
                    <div
                      key={sidecar.id}
                      className="group relative flex min-h-[170px] flex-col rounded-xl border border-border bg-card/90 p-5 shadow-sm transition-all duration-300 hover:shadow-lg"
                    >
                      {/* Name at the top, large and bold */}
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-lg font-bold text-foreground">
                          {sidecar.name}
                        </span>
                      </div>
                      {(sidecar.builtIn ||
                        (sidecar.id === "watchdog" && isOnWindows)) && (
                        <span className="mb-2 rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          <BadgeCheck className="mb-0.5 inline h-4 w-4 text-gray-400" />{" "}
                          {t("settings.sidecar.builtIn")}
                        </span>
                      )}
                      {/* Description, normal readable font */}
                      <div className="mb-8 text-sm text-muted-foreground">
                        {sidecar.description}
                      </div>
                      {/* Bottom row: badge left, source button right */}
                      <div className="absolute bottom-4 left-5">{badge}</div>
                      {sidecar.source && (
                        <button
                          onClick={() => window.electron.openURL(sidecar.source)}
                          className="absolute bottom-2 right-2 inline-flex scale-95 items-center gap-1 text-xs text-muted-foreground hover:text-primary focus:outline-none"
                        >
                          <Link2 className="h-4 w-4" />
                          <span className="underline">
                            {t("settings.sidecar.viewSource")}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>

          {/* Dependencies Section */}
          <section className="flex flex-col rounded-2xl border border-primary/20 bg-gradient-to-br from-secondary/10 to-background p-6 shadow-lg">
            <div className="mb-6 flex items-center gap-3">
              <MonitorDot className="mb-3 h-7 w-7 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight text-primary">
                {t("settings.installGameDependencies")}
              </h2>
            </div>
            <p className="mb-6 text-base text-muted-foreground">
              {t("settings.reinstallDependenciesDesc")}
            </p>
            {isInstalling && (
              <div className="mb-4 h-2 w-full rounded-full bg-secondary">
                <div
                  className="h-2 rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${(progress / totalDependencies) * 100}%` }}
                />
              </div>
            )}
            <div className="grid grid-cols-1 gap-4">
              {dependencies.map(dep => (
                <div
                  key={dep.name}
                  className="flex items-center gap-4 rounded-lg border border-border bg-card/80 p-4 shadow-sm"
                >
                  {dependencyStatus?.[dep.name]?.icon}
                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={() => window.electron.openURL(dep.url)}
                      className="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-accent"
                    >
                      {dep.name}
                    </button>
                    <div className="mt-1 max-w-xs truncate text-xs text-muted-foreground">
                      {dep.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <Button
                onClick={() => setShowConfirmDialog(true)}
                className="rounded-lg px-8 py-3 text-lg font-semibold text-secondary shadow-md"
                disabled={isInstalling}
              >
                {isInstalling ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    {t("welcome.installingDependencies")}
                  </>
                ) : (
                  t("settings.reinstallDependencies")
                )}
              </Button>
            </div>
          </section>
        </div>

        {/* Confirm Dialog */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
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
      </motion.div>
    </div>
  );
};

export default SidecarAndDependencies;
