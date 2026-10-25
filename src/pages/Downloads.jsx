import React, { useState, useEffect, useRef, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  canRetryExtraction,
  retryExtraction,
} from "@/services/downloads/extractionRetryService";
import {
  getCachedDownloadData,
  clearCachedDownloadData,
} from "@/services/downloads/retryGameDownloadService";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader,
  FolderOpen,
  RefreshCcw,
  AlertCircle,
  AlertTriangle,
  Clock1,
  Clock2,
  Clock3,
  Clock4,
  Clock5,
  Clock6,
  Clock7,
  Clock8,
  Clock9,
  Clock10,
  Clock11,
  Clock12,
  ExternalLink,
  CircleCheck,
  Coffee,
  Pause,
  CheckCircle2,
  X,
  Zap,
  Play,
  ScrollText,
  ShieldAlert,
  Copy,
  GripVertical,
  Info,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import {
  processNextInQueue,
  getDownloadQueue,
  removeFromQueue,
  reorderQueue,
} from "@/services/downloads/downloadQueueService";
import {
  checkDownloadCommands,
  acknowledgeCommand,
  forceSyncDownloads,
} from "@/services/ascend/downloadSyncService";
import { cn } from "@/lib/utils";
import { privateSourceMessage } from "@/lib/privateSourceMessages";
import SpeedGraph, { formatSpeed, markDownloadStart } from "@/components/SpeedGraph";
import { API_URL } from "@/config/api";
import { getReporterHeaders } from "@/services/firebase/firebaseService";
import { useDownloadStall } from "@/hooks/useDownloadStall";

// Helper function to check if download speed is above 50 MB/s
const isHighSpeed = speedString => {
  if (!speedString) return false;
  const match = speedString.match(/(\d+(?:\.\d+)?)\s*(MB|KB|GB)\/s/);
  if (!match) return false;
  const value = parseFloat(match[1]);
  const unit = match[2];
  let speedInMB = value;
  if (unit === "KB") speedInMB = value / 1024;
  else if (unit === "GB") speedInMB = value * 1024;
  return speedInMB >= 50;
};

// Speed lines animation for high-speed downloads
const SpeedLines = memo(() => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="absolute h-px bg-gradient-to-r from-primary/40 to-transparent"
        style={{
          top: `${20 + i * 15}%`,
          left: "-20%",
          width: `${30 + i * 5}%`,
          animation: `speedLine 0.8s ease-out infinite`,
          animationDelay: `${i * 0.15}s`,
          opacity: 0.5 - i * 0.08,
        }}
      />
    ))}
    <style>{`
      @keyframes speedLine {
        0% { transform: translateX(-100%); opacity: 0; }
        20% { opacity: 1; }
        100% { transform: translateX(400%); opacity: 0; }
      }
    `}</style>
  </div>
));

// Per-download speed, with the streak animation above 50 MB/s
const SpeedIndicator = memo(({ speed, isHigh }) => (
  <span
    className={cn(
      "relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums transition-all duration-300",
      isHigh
        ? "border border-primary/30 bg-primary/10 text-primary shadow-md shadow-primary/20"
        : "text-foreground"
    )}
  >
    {isHigh && <SpeedLines />}
    {isHigh && <Zap className="relative z-10 h-3.5 w-3.5 animate-pulse" />}
    <span className="relative z-10">{speed}</span>
  </span>
));

const TONES = {
  primary: "from-primary to-primary/70",
  amber: "from-amber-500 to-amber-400",
  blue: "from-blue-500 to-blue-400",
  green: "from-green-500 to-green-400",
  muted: "from-muted-foreground/40 to-muted-foreground/30",
};

// One bar for every state: a filled value, or a sweep while the total is unknown
const ProgressBar = memo(({ value, tone = "primary", indeterminate, active = true }) => (
  <div className="relative h-1.5 overflow-hidden rounded-full bg-muted/60">
    {indeterminate ? (
      <div
        className={cn(
          "absolute inset-0 animate-shimmer bg-gradient-to-r opacity-70",
          TONES[tone]
        )}
      />
    ) : (
      <div
        className={cn(
          "absolute inset-y-0 left-0 overflow-hidden rounded-full bg-gradient-to-r transition-all duration-500",
          TONES[tone]
        )}
        style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }}
      >
        {active && (
          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        )}
      </div>
    )}
  </div>
));

const IconAction = ({ label, icon: Icon, onClick, disabled, spinning, className }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={cn("h-8 w-8 rounded-lg text-muted-foreground", className)}
      >
        {spinning ? (
          <Loader className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </Button>
    </TooltipTrigger>
    <TooltipContent className="text-secondary">{label}</TooltipContent>
  </Tooltip>
);

// How often to check for webapp commands when nothing is actively downloading.
const IDLE_COMMAND_CHECK_INTERVAL = 15000;

// Games whose download start is already marked on the graph (pausing keeps them here).
const graphedDownloads = new Set();

const Downloads = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const { settings } = useSettings();

  // Track processed commands to prevent duplicates
  const processedCommandsRef = useRef(new Set());
  const commandTimestampsRef = useRef(new Map());
  const commandIntervalRef = useRef(null);
  const commandInFlightRef = useRef(false);
  const hasLiveDownloadRef = useRef(false);
  const lastCommandCheckRef = useRef(0);

  // Function to start command checking interval
  const startCommandChecking = useCallback(() => {
    if (commandIntervalRef.current || !isAuthenticated || !user) {
      return;
    }

    console.log("[Downloads] Starting command check interval");
    commandIntervalRef.current = setInterval(async () => {
      if (commandInFlightRef.current) return;
      commandInFlightRef.current = true;
      try {
        // Clean up old processed commands (older than 5 minutes) to prevent memory buildup
        const now = Date.now();
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        for (const [key, timestamp] of commandTimestampsRef.current.entries()) {
          if (timestamp < fiveMinutesAgo) {
            processedCommandsRef.current.delete(key);
            commandTimestampsRef.current.delete(key);
          }
        }

        // Stopped or failed downloads sit in the list indefinitely. They can still
        // be resumed from the webapp, but don't need checking at full speed.
        if (
          !hasLiveDownloadRef.current &&
          now - lastCommandCheckRef.current < IDLE_COMMAND_CHECK_INTERVAL
        ) {
          return;
        }
        lastCommandCheckRef.current = now;

        const commands = await checkDownloadCommands();

        if (commands.length > 0) {
          console.log("[Downloads] Processing", commands.length, "commands");
        }

        for (const cmd of commands) {
          const downloadId = cmd.downloadId;
          const command = cmd.command;
          const commandKey = `${downloadId}-${command}-${cmd.timestamp || Date.now()}`;

          // Skip if we've already processed this command
          if (processedCommandsRef.current.has(commandKey)) {
            console.log("[Downloads] Skipping already processed command:", commandKey);
            continue;
          }

          // Mark as processed immediately with timestamp
          processedCommandsRef.current.add(commandKey);
          commandTimestampsRef.current.set(commandKey, Date.now());

          console.log(
            "[Downloads] Executing command:",
            command,
            "for download:",
            downloadId
          );

          // Execute command
          try {
            let commandSuccess = false;
            let commandError = null;

            if (command === "pause") {
              // Pause is done by calling stopDownload with deleteContents = false
              const result = await window.electron.stopDownload(downloadId, false);
              console.log("[Downloads] Pause result:", result);
              if (result) {
                commandSuccess = true;
              } else {
                commandError = "Failed to pause download";
              }
            } else if (command === "resume") {
              const result = await window.electron.resumeDownload(downloadId);
              console.log("[Downloads] Resume result:", result);
              if (result?.success) {
                commandSuccess = true;
              } else {
                commandError = result?.error || "Failed to resume download";
              }
            } else if (command === "stop" || command === "cancel" || command === "kill") {
              // Stop/cancel/kill all mean delete the download
              const result = await window.electron.stopDownload(downloadId, true, true);
              console.log("[Downloads] Stop result:", result);
              if (result) {
                commandSuccess = true;
                // Remove from UI
                setDownloadingGames(prev => prev.filter(g => g.game !== downloadId));
              } else {
                commandError = "Failed to kill download";
              }
            }

            // Acknowledge command BEFORE showing toast to prevent race condition
            const status = commandSuccess ? "completed" : "failed";
            console.log(
              "[Downloads] Acknowledging command for:",
              downloadId,
              "Status:",
              status
            );
            await acknowledgeCommand(downloadId, status, commandError);

            // Now show toast after acknowledgment
            if (commandSuccess) {
              if (command === "pause") {
                toast.success(t("downloads.pauseSuccess"));
              } else if (command === "resume") {
                toast.success(t("downloads.resumeSuccess"));
              } else if (
                command === "stop" ||
                command === "cancel" ||
                command === "kill"
              ) {
                toast.success(t("downloads.killSuccess"));
                // Wait for the download to be fully removed from filesystem
                // before syncing, so the sync reflects the removal
                console.log("[Downloads] Waiting 1s for filesystem cleanup...");
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } else if (commandError) {
              toast.error(commandError);
            }

            // Force sync to update webapp immediately
            forceSyncDownloads();
          } catch (error) {
            console.error("[Downloads] Error executing command:", error);
            // Acknowledge as failed
            await acknowledgeCommand(downloadId, "failed", error.message);
            toast.error(
              t("downloads.errors.commandFailed") || "Failed to execute command"
            );
          }
        }
      } finally {
        commandInFlightRef.current = false;
      }
    }, 3000); // Check every 3 seconds
  }, [isAuthenticated, user, t]);

  // Function to stop command checking interval
  const stopCommandChecking = useCallback(() => {
    if (commandIntervalRef.current) {
      console.log("[Downloads] Stopping command check interval - no active downloads");
      clearInterval(commandIntervalRef.current);
      commandIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount or auth change
  useEffect(() => {
    return () => {
      stopCommandChecking();
      processedCommandsRef.current.clear();
      commandTimestampsRef.current.clear();
    };
  }, [stopCommandChecking]);

  useEffect(() => {
    window.electron.switchRPC("downloading");
    return () => {
      window.electron.switchRPC("default");
    };
  }, []);
  const [downloadingGames, setDownloadingGames] = useState([]);
  const [completedGames, setCompletedGames] = useState(new Set()); // Track games that just completed
  const [fadingGames, setFadingGames] = useState(new Set()); // Track games that are fading out
  const [torboxStates, setTorboxStates] = useState({}); // webdownloadId -> state
  const [queuedDownloads, setQueuedDownloads] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  // Refs to always access the latest values inside polling
  const [selectedGame, setSelectedGame] = useState(null);
  const [totalSpeed, setTotalSpeed] = useState("0.00 MB/s");
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [stoppingDownloads, setStoppingDownloads] = useState(new Set());
  const [resumingDownloads, setResumingDownloads] = useState(new Set());
  const downloadingGamesRef = React.useRef(downloadingGames);
  const completedGamesRef = React.useRef(new Set());
  const fadingGamesRef = React.useRef(new Set());
  const resumingDownloadsRef = React.useRef(new Set());
  const prevActiveCountRef = React.useRef(0);
  const settingsRef = React.useRef(settings);
  useEffect(() => {
    downloadingGamesRef.current = downloadingGames;
  }, [downloadingGames]);
  useEffect(() => {
    completedGamesRef.current = completedGames;
  }, [completedGames]);
  useEffect(() => {
    fadingGamesRef.current = fadingGames;
  }, [fadingGames]);
  useEffect(() => {
    resumingDownloadsRef.current = resumingDownloads;
  }, [resumingDownloads]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const [showFirstTimeAlert, setShowFirstTimeAlert] = useState(false);
  // Latest total speed in MB/s; the graph reads it on every frame.
  const targetSpeedRef = useRef(0);
  // What the extracting games are doing: speed (MB/s, or files/s when the archive
  // tool gives no sizes), and disk read/write when the downloader reports them.
  const diskRef = useRef({ extract: 0, read: 0, write: 0 });
  const [disk, setDisk] = useState({ extracting: 0 });
  // Track the actual peak speed separately (persists until page refresh or no active downloads)
  const [peakSpeed, setPeakSpeed] = useState(() => {
    const savedPeak = localStorage.getItem("peakSpeed");
    return savedPeak ? parseFloat(savedPeak) : 0;
  });

  const normalizeSpeed = speed => {
    const match = String(speed || "").match(/([\d.]+)\s*(B|KB|MB|GB|TB)\/s/i);
    if (!match) return 0;
    const value = Number(match[1]);
    const power = ["B", "KB", "MB", "GB", "TB"].indexOf(match[2].toUpperCase());
    return Number.isFinite(value) ? Math.max(0, value) * 1024 ** (power - 2) : 0;
  };

  // Polling interval for downloading games (every 1 second)
  useEffect(() => {
    let disposed = false;
    let fetching = false;
    const fetchDownloadingGames = async () => {
      if (disposed || fetching) return;
      fetching = true;
      try {
        const games = await window.electron.getGames();
        if (disposed) return;
        const downloading = games.filter(game => {
          const { downloadingData } = game;
          return (
            downloadingData &&
            (downloadingData.downloading ||
              downloadingData.extracting ||
              downloadingData.updating ||
              downloadingData.verifying ||
              downloadingData.stopped ||
              downloadingData.pendingManualInstall ||
              downloadingData.awaitingRecoveryAction ||
              (downloadingData.verifyError && downloadingData.verifyError.length > 0) ||
              downloadingData.error)
          );
        });

        if (downloading.length > 0 && !localStorage.getItem("hasDownloadedBefore")) {
          setShowFirstTimeAlert(true);
          localStorage.setItem("hasDownloadedBefore", "true");
        }

        // Detect games that were verifying and are now gone (completed)
        // Use game.game (name) as the unique identifier since games don't have an id property
        const currentNames = new Set(downloading.map(g => g.game));
        const prevGames = downloadingGamesRef.current;

        // Find games that were verifying in the previous poll
        const newlyCompleted = [];
        prevGames.forEach(game => {
          const gameName = game.game;
          const wasVerifying = game.downloadingData?.verifying;
          const wasPendingManualInstall = game.downloadingData?.pendingManualInstall;
          const isGone = !currentNames.has(gameName);
          const isAlreadyTracked =
            completedGamesRef.current.has(gameName) ||
            fadingGamesRef.current.has(gameName);

          if (
            (wasVerifying || wasPendingManualInstall) &&
            isGone &&
            games.some(g => g.game === gameName) &&
            !isAlreadyTracked
          ) {
            console.log("Game completed:", gameName);
            newlyCompleted.push(game);

            // Mark as completed immediately in ref
            completedGamesRef.current = new Set([...completedGamesRef.current, gameName]);

            // Schedule fade out
            setTimeout(() => {
              completedGamesRef.current = new Set(
                [...completedGamesRef.current].filter(n => n !== gameName)
              );
              fadingGamesRef.current = new Set([...fadingGamesRef.current, gameName]);
              setCompletedGames(prev => {
                const next = new Set(prev);
                next.delete(gameName);
                return next;
              });
              setFadingGames(prev => new Set([...prev, gameName]));

              // Remove completely after fade. Take the card out of the list in the
              // same step, or it would reappear until the next poll drops it.
              setTimeout(() => {
                downloadingGamesRef.current = downloadingGamesRef.current.filter(
                  g => g.game !== gameName
                );
                setDownloadingGames(prev => prev.filter(g => g.game !== gameName));
                fadingGamesRef.current = new Set(
                  [...fadingGamesRef.current].filter(n => n !== gameName)
                );
                setFadingGames(prev => {
                  const next = new Set(prev);
                  next.delete(gameName);
                  return next;
                });
              }, 500);
            }, 2000);
          }
        });

        // Update completed games state if we found new ones
        if (newlyCompleted.length > 0) {
          setCompletedGames(
            prev => new Set([...prev, ...newlyCompleted.map(g => g.game)])
          );

          // Automatically create a desktop shortcut as soon as the download/install
          // finishes, regardless of whether the game has ever been launched.
          if (settingsRef.current.autoCreateShortcuts) {
            newlyCompleted.forEach(async completedGame => {
              try {
                const executables = await window.electron.getGameExecutables(
                  completedGame.game,
                  false
                );
                const executable = executables?.[0];
                if (!executable) return;
                await window.electron.createGameShortcut({
                  game: completedGame.game,
                  name: completedGame.game,
                  executable,
                  custom: false,
                });
              } catch (error) {
                console.error(
                  `Failed to auto-create shortcut for ${completedGame.game}:`,
                  error
                );
              }
            });
          }

          // Process next queued download when a game completes
          // This triggers immediately when the "Download Complete" card shows
          processNextInQueue().then(nextItem => {
            if (nextItem) {
              toast.success(
                t("downloads.queuedDownloadStarted", {
                  name: nextItem.gameName,
                })
              );
            }
          });
        }

        // Build the display list: current downloads + completed/fading games + resuming games
        const allGames = [...downloading];

        // Add completed games that aren't in the current download list
        prevGames.forEach(pg => {
          const isCompleted = completedGamesRef.current.has(pg.game);
          const isFading = fadingGamesRef.current.has(pg.game);
          const isResuming = resumingDownloadsRef.current.has(pg.game);
          const alreadyInList = allGames.some(g => g.game === pg.game);

          if ((isCompleted || isFading || isResuming) && !alreadyInList) {
            allGames.push({
              ...pg,
              isCompleted: isCompleted,
              downloadingData: {
                ...pg.downloadingData,
                verifying: false,
                pendingManualInstall: false,
              },
            });
          }
        });

        // Update the ref BEFORE setting state to prevent stale reads
        downloadingGamesRef.current = allGames;
        setDownloadingGames(allGames);

        let totalSpeedNum = 0;
        let activeCount = 0;
        downloading.forEach(game => {
          if (
            game.downloadingData?.downloading &&
            !game.downloadingData.stopped &&
            !game.downloadingData.paused &&
            !game.downloadingData.error &&
            !game.downloadingData.waiting &&
            !game.downloadingData.extracting &&
            !game.downloadingData.verifying
          ) {
            activeCount++;
            const speed = game.downloadingData.progressDownloadSpeeds;
            if (speed) {
              totalSpeedNum += normalizeSpeed(speed);
            }
          }
        });
        setActiveDownloads(activeCount);

        // A game's first appearance as a download starts a new stretch of the graph.
        downloading.forEach(game => {
          if (game.downloadingData?.downloading && !graphedDownloads.has(game.game)) {
            graphedDownloads.add(game.game);
            markDownloadStart(game.game);
          }
        });
        graphedDownloads.forEach(name => {
          if (!downloading.some(game => game.game === name))
            graphedDownloads.delete(name);
        });

        const diskNow = {
          extracting: 0,
          reported: false,
          read: 0,
          write: 0,
          speed: 0,
          fileRate: 0,
          percent: 0,
          filesDone: 0,
          filesTotal: 0,
        };
        downloading.forEach(game => {
          const progress = game.downloadingData?.extractionProgress;
          if (!game.downloadingData?.extracting) return;
          diskNow.extracting++;
          diskNow.percent += parseFloat(progress?.percentComplete) || 0;
          diskNow.filesDone += progress?.filesExtracted || 0;
          diskNow.filesTotal += progress?.totalFiles || 0;
          const rate = String(progress?.extractionSpeed || "");
          if (rate.endsWith("files/s")) diskNow.fileRate += parseFloat(rate) || 0;
          else if (rate.endsWith(" B/s"))
            diskNow.speed += (parseFloat(rate) || 0) / 1048576;
          else diskNow.speed += normalizeSpeed(rate);
          if (progress?.readSpeed === undefined) return;
          diskNow.reported = true;
          diskNow.read += (progress.readSpeed || 0) / 1048576;
          diskNow.write += (progress.writeSpeed || 0) / 1048576;
        });
        if (diskNow.extracting) diskNow.percent /= diskNow.extracting;
        // Some archive tools only count files, so the curve follows that instead.
        diskNow.files = !diskNow.speed && diskNow.fileRate > 0;
        diskNow.extract = diskNow.reported
          ? 0
          : diskNow.files
            ? diskNow.fileRate
            : diskNow.speed;
        diskRef.current = diskNow;
        setDisk(diskNow);

        // Start/stop command checking based on download count
        hasLiveDownloadRef.current = downloading.some(
          ({ downloadingData }) =>
            downloadingData.downloading ||
            downloadingData.extracting ||
            downloadingData.updating ||
            downloadingData.verifying
        );
        if (downloading.length > 0) {
          startCommandChecking();
        } else if (downloading.length === 0) {
          stopCommandChecking();
        }
        const formattedSpeed = `${totalSpeedNum.toFixed(2)} MB/s`;
        setTotalSpeed(formattedSpeed);

        // Update peak speed if current speed is higher
        setPeakSpeed(prevPeak => {
          const newPeak = Math.max(prevPeak, totalSpeedNum);
          localStorage.setItem("peakSpeed", newPeak.toString());
          return newPeak;
        });

        // Reset peak when no active downloads
        if (activeCount === 0) {
          setPeakSpeed(0);
          localStorage.setItem("peakSpeed", "0");

          // Process next queued download when transitioning from active to no active downloads
          // This handles stopped downloads and other cases where games don't go through "completed" state
          if (prevActiveCountRef.current > 0) {
            processNextInQueue().then(nextItem => {
              if (nextItem) {
                toast.success(
                  t("downloads.queuedDownloadStarted", {
                    name: nextItem.gameName,
                  })
                );
              }
            });
          }
        }
        prevActiveCountRef.current = activeCount;

        targetSpeedRef.current = totalSpeedNum;
      } catch (error) {
        console.error("Error fetching downloading games:", error);
      } finally {
        fetching = false;
      }
    };

    fetchDownloadingGames();
    // Poll every 1 second for more responsive progress updates
    const intervalId = setInterval(fetchDownloadingGames, 1000);
    // Only run this effect on mount/unmount (not on downloadingGames change)
    return () => {
      disposed = true;
      clearInterval(intervalId);
      stopCommandChecking();
    };
  }, [startCommandChecking, stopCommandChecking]);

  // Poll queued downloads
  useEffect(() => {
    const fetchQueuedDownloads = () => {
      const queue = getDownloadQueue();
      setQueuedDownloads(queue);
    };
    fetchQueuedDownloads();
    const queueIntervalId = setInterval(fetchQueuedDownloads, 1000);
    return () => clearInterval(queueIntervalId);
  }, []);

  useEffect(() => {
    if (downloadingGames.length === 0) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [downloadingGames.length]);

  const handlePauseDownload = async game => {
    setStoppingDownloads(prev => new Set([...prev, game.game]));
    try {
      const result = await window.electron.stopDownload(game.game, false);
      if (!result) {
        throw new Error("Failed to pause download");
      }
      toast.success(t("downloads.pauseSuccess"));
      // Trigger immediate sync to update monitor endpoint
      forceSyncDownloads();
    } catch (error) {
      console.error("Error pausing download:", error);
      toast.error(t("downloads.errors.pauseFailed"), {
        variant: "destructive",
      });
    } finally {
      setStoppingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(game.game);
        return newSet;
      });
    }
  };

  const executeKillDownload = async (game, deleteFiles = true) => {
    console.log("Executing kill download for:", game, "deleteFiles:", deleteFiles);
    setStoppingDownloads(prev => new Set([...prev, game.game]));
    try {
      const result = await window.electron.stopDownload(game.game, deleteFiles, true);
      console.log("Kill download result:", result);
      if (!result) {
        throw new Error("Failed to kill download");
      }
      if (deleteFiles) {
        // Clear the cached download data since the download is being deleted
        clearCachedDownloadData(game.game);
      }
      setDownloadingGames(prev => prev.filter(g => g.game !== game.game));
      toast.success(
        deleteFiles ? t("downloads.killSuccess") : t("downloads.killSuccessKeepFiles")
      );

      // Wait for the download to be fully removed from filesystem
      // before syncing, so the sync reflects the removal
      console.log("[Downloads] Waiting 1s for filesystem cleanup before sync...");
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Trigger immediate sync to update monitor endpoint
      console.log("[Downloads] Syncing after manual kill...");
      forceSyncDownloads();
    } catch (error) {
      console.error("Error killing download:", error);
      toast.error(t("downloads.errors.killFailed"), {
        variant: "destructive",
      });
    } finally {
      setStoppingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(game.game);
        return newSet;
      });
    }
  };

  const handleResumeDownload = async game => {
    // Check if there's an active download OR another download is currently resuming
    const hasActive = downloadingGames.some(
      g => g.downloadingData?.downloading && g.game !== game.game
    );
    const hasResuming = resumingDownloads.size > 0 && !resumingDownloads.has(game.game);

    // If there's an active download or another resuming download and user doesn't have Ascend, show warning
    if ((hasActive || hasResuming) && !isAuthenticated) {
      toast(t("downloads.ascendRequired.title"), {
        description: t("downloads.ascendRequired.description"),
        action: {
          label: t("downloads.ascendRequired.learnMore"),
          onClick: () => navigate("/ascend"),
        },
      });
      return;
    }

    // Proceed with resume
    await executeResumeDownload(game);
  };

  const executeResumeDownload = async game => {
    setResumingDownloads(prev => new Set([...prev, game.game]));
    try {
      const result = await window.electron.resumeDownload(game.game);
      if (result.success) {
        toast.success(t("downloads.resumeSuccess"));
        // Trigger immediate sync to update monitor endpoint
        forceSyncDownloads();
        // Keep in resuming state until download actually starts (check every 500ms)
        const checkInterval = setInterval(() => {
          const currentGames = downloadingGamesRef.current;
          const gameRestarted = currentGames.some(
            g => g.game === game.game && g.downloadingData?.downloading
          );

          if (gameRestarted) {
            clearInterval(checkInterval);
            setResumingDownloads(prev => {
              const newSet = new Set(prev);
              newSet.delete(game.game);
              return newSet;
            });
            // Sync again when download actually restarts
            forceSyncDownloads();
          }
        }, 500);

        // Fallback: clear after 5 seconds even if download hasn't started
        setTimeout(() => {
          clearInterval(checkInterval);
          setResumingDownloads(prev => {
            const newSet = new Set(prev);
            newSet.delete(game.game);
            return newSet;
          });
        }, 5000);
      } else {
        setResumingDownloads(prev => {
          const newSet = new Set(prev);
          newSet.delete(game.game);
          return newSet;
        });
        toast.error(t("downloads.resumeError"), {
          description: result.error || t("downloads.resumeErrorDescription"),
        });
      }
    } catch (error) {
      console.error("Error resuming download:", error);
      setResumingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(game.game);
        return newSet;
      });
      toast.error(t("downloads.resumeError"), {
        description: error.message,
      });
    }
  };

  const handleRetryDownload = async game => {
    // Try to get cached download data for this game
    const cachedData = getCachedDownloadData(game.game);

    if (cachedData) {
      await window.electron.deleteGameDirectory(game.game);
      clearCachedDownloadData(game.game);

      setDownloadingGames(prev => prev.filter(g => g.game !== game.game));

      navigate("/download", {
        state: {
          gameData: cachedData,
        },
      });
    } else {
      toast.error(t("downloads.retryDataNotAvailable"));
      await window.electron.deleteGameDirectory(game.game);
      setDownloadingGames(prev => prev.filter(g => g.game !== game.game));
    }
  };

  const handleOpenFolder = async game => {
    await window.electron.openGameDirectory(game.game);
  };

  const currentSpeed = parseFloat(totalSpeed) || 0;
  const highSpeed = isHighSpeed(totalSpeed);
  const shownSpeed = formatSpeed(currentSpeed);
  const shownPeak = formatSpeed(peakSpeed);
  const queueStartsNext = downloadingGames.length === 0;

  // When the last download is gone the panel animates out before the idle screen.
  const nothingLeft = downloadingGames.length === 0 && queuedDownloads.length === 0;
  const [view, setView] = useState(nothingLeft ? "idle" : "active");
  useEffect(() => {
    if (!nothingLeft) {
      setView("active");
      return;
    }
    setView(current => (current === "idle" ? current : "leaving"));
    const timer = setTimeout(() => setView("idle"), 700);
    return () => clearTimeout(timer);
  }, [nothingLeft]);
  const leaving = view === "leaving";
  const riseIn = delay => ({
    animation: `fade-in 0.7s cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms both`,
  });
  // With nothing left to download, the panel follows the extraction instead.
  const extractMode = activeDownloads === 0 && disk.extracting > 0;
  const filesPerSecond = `${t("downloads.files", "files")}/s`;
  const graphLabels = {
    extract: t("downloads.extractionSpeed", "Extraction"),
    read: t("downloads.diskRead", "Read"),
    write: t("downloads.diskWrite", "Write"),
    filesUnit: filesPerSecond,
  };
  const extractReadouts = !extractMode
    ? []
    : disk.reported
      ? [
          ["write", "bg-amber-500", formatSpeed(disk.write)],
          ["read", "bg-sky-400", formatSpeed(disk.read)],
        ]
      : [
          [
            "extract",
            "bg-amber-500",
            disk.files
              ? {
                  value: disk.fileRate.toFixed(disk.fileRate < 10 ? 1 : 0),
                  unit: filesPerSecond,
                }
              : formatSpeed(disk.speed),
          ],
        ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="container mx-auto max-w-5xl px-4 pb-8">
        {view === "idle" && nothingLeft ? (
          <div className="flex min-h-[85vh] flex-col items-center justify-center">
            <div className="space-y-4 text-center">
              <Coffee className="mx-auto h-12 w-12 text-primary" style={riseIn(0)} />
              <h2
                className="text-3xl font-bold tracking-tight text-foreground"
                style={riseIn(120)}
              >
                {t("downloads.noDownloads")}
              </h2>
              <p
                className="mx-auto max-w-sm text-lg text-muted-foreground"
                style={riseIn(240)}
              >
                {t("downloads.noDownloadsMessage")}
              </p>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "mt-6 space-y-5 transition-all duration-700 ease-in-out",
              leaving && "pointer-events-none translate-y-10 scale-95 opacity-0 blur-sm"
            )}
          >
            {showFirstTimeAlert && (
              <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t("downloads.firstTimeDownload.title")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("downloads.firstTimeDownload.message")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-primary"
                  onClick={() => setShowFirstTimeAlert(false)}
                >
                  {t("downloads.firstTimeDownload.understand")}
                </Button>
              </div>
            )}

            {/* Speed overview */}
            <section
              className={cn(
                "relative overflow-hidden rounded-2xl border bg-card transition-colors duration-500",
                highSpeed
                  ? "border-primary/40 shadow-lg shadow-primary/10"
                  : "border-border/60"
              )}
            >
              <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 pt-5">
                {extractMode ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {disk.reported
                        ? t("downloads.diskActivity", "Disk Activity")
                        : t("downloads.extractionSpeed", "Extraction")}
                    </p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-8">
                      {extractReadouts.map(([key, dot, shown]) => {
                        return (
                          <div key={key} className="flex items-baseline gap-2">
                            <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">
                              {shown.value}
                            </span>
                            <span className="text-lg font-medium text-muted-foreground">
                              {shown.unit}
                            </span>
                            <span className="ml-1 inline-flex items-center gap-1.5 self-center text-sm text-muted-foreground">
                              <span className={cn("h-2 w-2 rounded-full", dot)} />
                              {graphLabels[key]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t("downloads.currentTotalSpeed")}
                    </p>
                    <div className="relative mt-1 inline-flex items-baseline gap-2 rounded-lg pr-3">
                      {highSpeed && <SpeedLines />}
                      <span
                        className={cn(
                          "relative z-10 text-5xl font-bold tabular-nums tracking-tight transition-colors duration-300",
                          highSpeed ? "text-primary" : "text-foreground"
                        )}
                      >
                        {shownSpeed.value}
                      </span>
                      <span className="relative z-10 text-lg font-medium text-muted-foreground">
                        {shownSpeed.unit}
                      </span>
                      {highSpeed && (
                        <Zap className="relative z-10 h-5 w-5 animate-pulse self-center text-primary" />
                      )}
                    </div>
                  </div>
                )}
                <dl className="flex gap-7 pb-1.5 text-right">
                  {[
                    ...(extractMode
                      ? [
                          [
                            t("downloads.extractedProgress", "Extracted"),
                            `${Math.floor(disk.percent)}%`,
                          ],
                          ...(disk.filesTotal
                            ? [
                                [
                                  t("downloads.filesLabel", "Files"),
                                  `${disk.filesDone.toLocaleString()} / ${disk.filesTotal.toLocaleString()}`,
                                ],
                              ]
                            : []),
                          ...(disk.extracting > 1
                            ? [
                                [
                                  t("downloads.extractingCount", "Extracting"),
                                  disk.extracting,
                                ],
                              ]
                            : []),
                        ]
                      : [
                          [
                            t("downloads.peak", "Peak"),
                            `${shownPeak.value} ${shownPeak.unit}`,
                          ],
                          [t("downloads.active", "Active"), activeDownloads],
                        ]),
                    [t("downloads.queued", "Queued"), queuedDownloads.length],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-base font-semibold tabular-nums text-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <SpeedGraph
                speedRef={targetSpeedRef}
                diskRef={diskRef}
                labels={graphLabels}
                peak={peakSpeed}
                high={highSpeed}
                className="mt-2 h-40"
              />
            </section>

            {/* Downloads */}
            {downloadingGames.length > 0 && (
              <div className="space-y-3">
                {downloadingGames.map(game => (
                  <DownloadCard
                    key={`${game.game}-${game.executable}`}
                    game={game}
                    torboxState={
                      game.torboxWebdownloadId
                        ? torboxStates[game.torboxWebdownloadId]
                        : undefined
                    }
                    onPause={() => handlePauseDownload(game)}
                    onKill={deleteFiles => executeKillDownload(game, deleteFiles)}
                    onResume={() => handleResumeDownload(game)}
                    onRetry={() => handleRetryDownload(game)}
                    onOpenFolder={() => handleOpenFolder(game)}
                    isStopping={stoppingDownloads.has(game.game)}
                    isResuming={resumingDownloads.has(game.game)}
                    isCompleted={
                      completedGames.has(game.game) || fadingGames.has(game.game)
                    }
                    isFading={fadingGames.has(game.game)}
                  />
                ))}
              </div>
            )}

            {/* Queue */}
            {queuedDownloads.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">
                  {t("downloads.queuedDownloads", "Queued Downloads")} ·{" "}
                  {queuedDownloads.length}
                </h2>
                <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
                  {queuedDownloads.map((item, index) => {
                    const startsNext = index === 0 && queueStartsNext;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={e => {
                          setDraggedIndex(index);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/html", e.currentTarget);
                        }}
                        onDragEnd={() => {
                          setDraggedIndex(null);
                          setDragOverIndex(null);
                        }}
                        onDragOver={e => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (draggedIndex !== null && draggedIndex !== index) {
                            setDragOverIndex(index);
                          }
                        }}
                        onDragLeave={() => {
                          setDragOverIndex(null);
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          if (draggedIndex !== null && draggedIndex !== index) {
                            const newQueue = reorderQueue(draggedIndex, index);
                            setQueuedDownloads(newQueue);
                          }
                          setDraggedIndex(null);
                          setDragOverIndex(null);
                        }}
                        className={cn(
                          "group flex cursor-grab items-center gap-3 px-3 py-2.5 transition-colors duration-150 active:cursor-grabbing",
                          startsNext && "bg-primary/5",
                          draggedIndex === index && "opacity-40",
                          dragOverIndex === index &&
                            "bg-primary/10 ring-1 ring-inset ring-primary"
                        )}
                      >
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center text-sm font-medium tabular-nums text-muted-foreground">
                          {startsNext ? (
                            <Loader className="h-4 w-4 animate-spin text-primary" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {item.gameName}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {startsNext
                            ? t("downloads.startingSoon", "Starting soon...")
                            : t("downloads.waitingInQueue", "Waiting in queue")}
                        </span>
                        <IconAction
                          label={t("downloads.removeFromQueue", "Remove from queue")}
                          icon={X}
                          className="hover:bg-red-500/10 hover:text-red-600"
                          onClick={() => {
                            removeFromQueue(item.id);
                            setQueuedDownloads(prev =>
                              prev.filter(q => q.id !== item.id)
                            );
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

const DownloadCard = ({
  game,
  onPause,
  onKill,
  onResume,
  onRetry,
  onOpenFolder,
  isStopping,
  isResuming,
  isCompleted,
  isFading,
}) => {
  const [isReporting, setIsReporting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLaunchingInstaller, setIsLaunchingInstaller] = useState(false);
  const [installerLaunched, setInstallerLaunched] = useState(false);
  const [isFinishingInstall, setIsFinishingInstall] = useState(false);
  const [isSubmittingRecovery, setIsSubmittingRecovery] = useState(false);
  const handleRetryExtraction = async () => {
    if (isSubmittingRecovery) return;
    setIsSubmittingRecovery(true);
    try {
      await retryExtraction(game);
      toast.success(t("downloads.extractionRecovery.retryingArchive"));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmittingRecovery(false);
    }
  };
  const [confirmingKill, setConfirmingKill] = useState(false);
  const [showLargeFileNotice, setShowLargeFileNotice] = useState(false);
  const [heroImage, setHeroImage] = useState(null);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logContent, setLogContent] = useState("");
  const [logLoading, setLogLoading] = useState(false);
  const logScrollRef = useRef(null);
  const logPollRef = useRef(null);

  useEffect(() => {
    if (!logLoading && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logContent, logLoading]);

  useEffect(() => {
    if (!logDialogOpen) {
      clearInterval(logPollRef.current);
      return;
    }
    const fetchLog = async () => {
      try {
        const content = await window.electron.getDownloadLog(200);
        setLogContent(content);
      } catch (err) {
        setLogContent(`Error reading log: ${err.message}`);
      } finally {
        setLogLoading(false);
      }
    };
    fetchLog();
    logPollRef.current = setInterval(fetchLog, 2000);
    return () => clearInterval(logPollRef.current);
  }, [logDialogOpen]);

  useEffect(() => {
    const gameName = game?.game;
    if (!gameName) return;
    window.electron
      .getGameImage(gameName, "hero")
      .then(b64 => {
        if (b64) setHeroImage(`data:image/jpeg;base64,${b64}`);
      })
      .catch(() => {});
  }, [game?.game]);

  // The log belongs to the extraction; close it when that ends.
  useEffect(() => {
    if (!game.downloadingData?.extracting) setLogDialogOpen(false);
  }, [game.downloadingData?.extracting]);

  const handleViewLog = () => {
    setLogLoading(!logDialogOpen);
    setLogDialogOpen(!logDialogOpen);
  };
  const fileStartTimeRef = useRef(null);
  const trackedFileRef = useRef(null);
  const noticeShownForFileRef = useRef(null);
  const [clockIndex, setClockIndex] = useState(0);
  const { t } = useLanguage();
  const { settings, updateSetting } = useSettings();

  const { downloadingData } = game;
  const stall = useDownloadStall(game.game);

  // Determine if download is in resuming state
  const isResumingState = isResuming || (downloadingData?.stopped && isResuming);

  // Track extraction time per file to show notice for large files
  useEffect(() => {
    const currentFile = downloadingData?.extractionProgress?.currentFile;
    const _isExtractingLocal = downloadingData?.extracting;

    // Reset everything when extraction stops
    if (!_isExtractingLocal) {
      setShowLargeFileNotice(false);
      fileStartTimeRef.current = null;
      trackedFileRef.current = null;
      noticeShownForFileRef.current = null;
      return;
    }

    // New file started - reset tracking for this file
    if (currentFile && currentFile !== trackedFileRef.current) {
      trackedFileRef.current = currentFile;
      fileStartTimeRef.current = Date.now();
      // Only hide notice if we haven't shown it for this specific file
      if (noticeShownForFileRef.current !== currentFile) {
        setShowLargeFileNotice(false);
      }
    }
  }, [downloadingData?.extractionProgress?.currentFile, downloadingData?.extracting]);

  // Separate interval to check if file is taking too long
  useEffect(() => {
    if (!downloadingData?.extracting) return;

    const checkInterval = setInterval(() => {
      const startTime = fileStartTimeRef.current;
      const currentFile = trackedFileRef.current;

      if (!startTime || !currentFile) return;

      // Skip if we already showed notice for this file
      if (noticeShownForFileRef.current === currentFile) return;

      const elapsed = Date.now() - startTime;
      if (elapsed > 4000) {
        noticeShownForFileRef.current = currentFile;
        setShowLargeFileNotice(true);
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [downloadingData?.extracting]);

  // Animated clock for large file notice
  useEffect(() => {
    if (!showLargeFileNotice) return;
    const interval = setInterval(() => {
      setClockIndex(prev => (prev + 1) % 12);
    }, 250);
    return () => clearInterval(interval);
  }, [showLargeFileNotice]);

  const ClockIcons = [
    Clock12,
    Clock1,
    Clock2,
    Clock3,
    Clock4,
    Clock5,
    Clock6,
    Clock7,
    Clock8,
    Clock9,
    Clock10,
    Clock11,
  ];
  const AnimatedClockIcon = ClockIcons[clockIndex];
  const isDownloading = downloadingData?.downloading;
  const isExtracting = downloadingData?.extracting;
  const isWaiting = downloadingData?.waiting;
  const isStopped = downloadingData?.stopped;
  const isUpdating = downloadingData?.updating;
  const hasError = downloadingData?.error;
  const isVerifyingState = downloadingData?.verifying;
  const hasVerifyError =
    downloadingData?.verifyError && downloadingData.verifyError.length > 0;
  const isPendingManualInstall = downloadingData?.pendingManualInstall;
  const isAwaitingRecovery = downloadingData?.awaitingRecoveryAction;
  const recoverableError = downloadingData?.recoverableError;
  const isArchiveRecovery = recoverableError?.type === "archiveExtractionFailed";

  // Determine current status for badge
  const getStatus = () => {
    if (isPendingManualInstall || isAwaitingRecovery) return "actionRequired";
    if (isCompleted) return "completed";
    if (hasError) return "error";
    if (isStopped) return "stopped";
    if (isVerifyingState) return "verifying";
    if (isExtracting) return "extracting";
    if (isWaiting) return "waiting";
    if (isUpdating) return "updating";
    return "downloading";
  };

  const handleExtractionRecovery = async (enableProtection = false, action = "retry") => {
    if (!recoverableError?.requestId) return;
    setIsSubmittingRecovery(true);
    try {
      if (enableProtection) {
        const protection = await window.electron.folderExclusion(true);
        if (!protection?.success) {
          throw new Error(
            protection?.error || t("downloads.extractionRecovery.protectionFailed")
          );
        }
        await updateSetting("excludeFolders", true);
      }
      const result = await window.electron.extractionRecoveryAction(
        game.game,
        recoverableError.requestId,
        action
      );
      if (!result?.success) {
        throw new Error(
          result?.error || t("downloads.extractionRecovery.continueFailed")
        );
      }
      if (action === "retry") {
        toast.success(
          enableProtection
            ? t("downloads.extractionRecovery.protectionEnabledRetrying")
            : isArchiveRecovery
              ? t("downloads.extractionRecovery.retryingArchive")
              : t("downloads.extractionRecovery.retrying")
        );
      }
    } catch (error) {
      toast.error(error.message || t("downloads.extractionRecovery.continueFailed"));
    } finally {
      setIsSubmittingRecovery(false);
    }
  };

  const handleVerifyGame = async () => {
    setIsVerifying(true);
    try {
      const result = await window.electron.verifyGame(game.game);
      if (!result.success) throw new Error(result.error);
      toast.success(t("downloads.verificationSuccess"), {
        description: t("downloads.verificationSuccessDesc"),
      });
    } catch (error) {
      console.error("Verification failed:", error);
      toast.error(t("downloads.verificationFailed"));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRunInstaller = async () => {
    const installerPath = downloadingData?.manualInstallerPath;
    if (!installerPath) return;
    setIsLaunchingInstaller(true);
    try {
      const result = await window.electron.runElevatedInstaller(installerPath);
      if (!result.success) throw new Error(result.error);
      toast.success(t("downloads.installerLaunched") || "Installer launched", {
        description:
          t("downloads.installerLaunchedDesc") ||
          "Follow the on-screen steps to finish installing the game.",
      });
      setInstallerLaunched(true);
    } catch (error) {
      console.error("Failed to launch installer:", error);
      toast.error(t("downloads.installerLaunchFailed") || "Could not launch installer");
    } finally {
      setIsLaunchingInstaller(false);
    }
  };

  const handleCopyInstallLocation = () => {
    const dir = downloadingData?.manualInstallDir;
    if (!dir) return;
    navigator.clipboard.writeText(dir);
    toast.success(t("common.copied") || "Copied to clipboard!");
  };

  const handleFinishInstall = async () => {
    setIsFinishingInstall(true);
    try {
      const result = await window.electron.completeManualInstall(game.game);
      if (!result.success) throw new Error(result.error);
      toast.success(t("downloads.installComplete") || "Installation Complete", {
        description: t("downloads.installCompleteDesc") || "Your game is ready to play",
      });
    } catch (error) {
      console.error("Failed to finalize installation:", error);
      toast.error(
        t("downloads.installCompleteFailed") || "Could not finalize installation"
      );
    } finally {
      setIsFinishingInstall(false);
    }
  };

  // Check if this error was already reported
  const [wasReported, setWasReported] = useState(() => {
    try {
      const reportedErrors = JSON.parse(localStorage.getItem("reportedErrors") || "{}");
      const errorKey = `${game.game}-${downloadingData?.message || "unknown"}`;
      return reportedErrors[errorKey] || false;
    } catch {
      return false;
    }
  });

  const predefinedErrorPatterns = [
    "content_type_error",
    "privateSources.",
    "no_files_error",
    "provider_blocked_error",
    "download_connection_error",
    "[Errno 28] No space left on device",
    "Insufficient disk space",
    "[WinError 225]",
    "Connection broken",
    "IncompleteRead",
    "HTTP 410",
  ];

  const isPredefinedError = message => {
    if (!message) return false;
    return predefinedErrorPatterns.some(pattern => message.includes(pattern));
  };

  const handleReport = async () => {
    if (wasReported) return;
    setIsReporting(true);
    try {
      const authHeaders = await window.electron.getAuthHeaders();
      const response = await fetch(`${API_URL}/auth/token`, {
        headers: authHeaders,
      });
      if (!response.ok) throw new Error("Failed to obtain token");
      const { token } = await response.json();

      const details = [
        "**Game Information**",
        `• Name: ${game.game}`,
        `• Version: ${game.version || "Unknown"}`,
        `• Size: ${game.size || "Unknown"}`,
        "",
        "**Error**",
        "```",
        getErrorMessage() || "Unknown error",
        "```",
        ...(downloadingData.message && downloadingData.message !== getErrorMessage()
          ? ["", "**Original Error**", "```", downloadingData.message, "```"]
          : []),
        "",
        "**Download State**",
        `• Progress: ${downloadingData.progressCompleted || "0"}%`,
        `• Speed: ${downloadingData.progressDownloadSpeeds || "N/A"}`,
        "",
        "**System Info**",
        `• Platform: ${window.electron.getPlatform() || "Unknown"}`,
        `• App Version: v${__APP_VERSION__ || "Unknown"}`,
        `• Timestamp: ${new Date().toISOString()}`,
      ].join("\n");

      const reportResponse = await fetch(`${API_URL}/app/report/feature`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(await getReporterHeaders()),
        },
        body: JSON.stringify({
          reportType: "GameDownload",
          reason: `Download Error: ${game.game}`,
          details,
          gameName: game.game,
        }),
      });

      if (!reportResponse.ok) throw new Error("Failed to submit report");

      const errorKey = `${game.game}-${downloadingData?.message || "unknown"}`;
      const reportedErrors = JSON.parse(localStorage.getItem("reportedErrors") || "{}");
      reportedErrors[errorKey] = true;
      localStorage.setItem("reportedErrors", JSON.stringify(reportedErrors));
      setWasReported(true);

      toast.success(t("downloads.errorReported"), {
        description: t("downloads.errorReportedDescription"),
      });
    } catch (error) {
      console.error("Failed to report error:", error);
      toast.error(t("common.reportDialog.couldNotReport"), {
        description: t("common.reportDialog.couldNotReportDesc"),
      });
    } finally {
      setIsReporting(false);
    }
  };

  useEffect(() => {
    if (hasError && !wasReported && !isPredefinedError(downloadingData.message)) {
      handleReport();
    }
  }, [hasError, wasReported, downloadingData.message]);

  // Get error message based on type
  const getErrorMessage = () => {
    const msg = downloadingData.message;
    if (!msg) return null;
    if (game.privateSource) return privateSourceMessage(t, msg);

    if (msg.trim().toLowerCase() === "conflict")
      return t(
        "downloads.downloadConflictError",
        "The download could not start (Conflict). Refresh the download link or choose another source. If this continues, check downloadmanager.log for the original error."
      );

    if (msg.includes("content_type_error")) return t("downloads.contentTypeError");
    if (msg.includes("no_files_error")) return t("downloads.noFilesError");
    if (msg.includes("provider_blocked_error"))
      return t("downloads.connectionResetError");
    if (msg.includes("download_connection_error"))
      return t("downloads.connectionResetError");
    if (msg.includes("HTTP 410")) return t("downloads.resourceGoneError");
    if (msg.includes("[Errno 28] No space left on device"))
      return t(
        "downloads.noSpaceLeftError",
        "No space left on device. Please free up disk space."
      );
    if (msg.includes("[WinError 225]"))
      return t(
        "downloads.windowsDefenderError",
        "Windows blocked the download. Add an exclusion in Windows Security."
      );
    if (msg.includes("Connection broken") || msg.includes("IncompleteRead"))
      return t(
        "downloads.connectionBrokenError",
        "Connection interrupted. Try Single Stream Download in Settings."
      );
    return msg;
  };

  const rawProgress = parseFloat(downloadingData?.progressCompleted);
  const progress = Number.isFinite(rawProgress)
    ? Math.max(0, Math.min(100, rawProgress))
    : 0;

  const status = isResumingState
    ? "resuming"
    : hasVerifyError && !hasError
      ? "verifyFailed"
      : getStatus();
  const STATUS = {
    downloading: [t("downloads.downloading", "Downloading"), "bg-primary", true],
    extracting: [t("downloads.extracting"), "bg-amber-500", true],
    verifying: [t("downloads.verifying"), "bg-blue-500", true],
    resuming: [t("downloads.resuming"), "bg-blue-500", true],
    updating: [t("downloads.updating"), "bg-blue-500", true],
    waiting: [t("downloads.waiting"), "bg-muted-foreground", true],
    stopped: [t("downloads.paused", "Paused"), "bg-muted-foreground", false],
    error: [t("downloads.downloadError"), "bg-red-500", false],
    verifyFailed: [t("downloads.verificationFailed"), "bg-amber-500", false],
    completed: [t("downloads.completed", "Download Complete"), "bg-green-500", false],
    actionRequired: [
      t("downloads.actionRequired", "Action Required"),
      "bg-amber-500",
      false,
    ],
  };
  const [statusLabel, statusColor, statusPulse] = STATUS[status] || STATUS.downloading;
  const needsAction = status === "actionRequired" || status === "verifyFailed";
  const extraction = downloadingData?.extractionProgress;
  // Unpacking and verifying run on their own; only cancelling is offered.
  const isInstalling = (isExtracting || isVerifyingState) && !isStopped && !hasError;
  const logToggle = (
    <button
      type="button"
      onClick={handleViewLog}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted hover:text-foreground",
        logDialogOpen ? "bg-muted text-foreground" : "text-muted-foreground"
      )}
    >
      <ScrollText className="h-3.5 w-3.5" />
      {logDialogOpen
        ? t("downloads.hideLog", "Hide log")
        : t("downloads.actions.viewLog")}
    </button>
  );
  const extractionPercent = parseFloat(extraction?.percentComplete || 0);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card transition-all duration-500",
        isFading && "scale-95 opacity-0",
        isCompleted
          ? "border-green-500/30"
          : hasError
            ? "border-red-500/30"
            : needsAction
              ? "border-amber-500/30"
              : "border-border/60 hover:border-primary/30"
      )}
    >
      {/* Game artwork, faded in from the right so text stays readable */}
      {heroImage && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-2/3"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.22,
            maskImage: "linear-gradient(to left, black, transparent)",
            WebkitMaskImage: "linear-gradient(to left, black, transparent)",
          }}
        />
      )}

      <div className="relative space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">
              {game.game}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                {statusPulse && (
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                      statusColor
                    )}
                  />
                )}
                <span
                  className={cn("relative inline-flex h-2 w-2 rounded-full", statusColor)}
                />
              </span>
              <span>{statusLabel}</span>
              {game.size && (
                <>
                  <span>·</span>
                  <span>{t("downloads.downloadSize", { size: game.size })}</span>
                </>
              )}
              {isDownloading && settings.downloadLimit > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {t("downloads.limitedTo")}{" "}
                    {settings.downloadLimit >= 1024
                      ? `${Math.round(settings.downloadLimit / 1024)} MB/s`
                      : `${settings.downloadLimit} KB/s`}
                  </span>
                </>
              )}
            </div>
          </div>

          {!isCompleted && (
            <div className="flex shrink-0 items-center gap-0.5">
              {canRetryExtraction(game) && !hasError && (
                <IconAction
                  label={t("downloads.retryExtraction")}
                  icon={RefreshCcw}
                  onClick={handleRetryExtraction}
                  disabled={isSubmittingRecovery}
                />
              )}
              {isStopped ? (
                <Button
                  size="sm"
                  onClick={onResume}
                  disabled={isResuming || isStopping}
                  className="mr-1 h-8 gap-1.5 text-secondary"
                >
                  {isResuming ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {t("downloads.resume", "Resume")}
                </Button>
              ) : (
                !hasError &&
                !isInstalling && (
                  <IconAction
                    label={t("downloads.actions.pauseDownload")}
                    icon={Pause}
                    onClick={onPause}
                    disabled={isStopping || isResuming}
                    spinning={isStopping}
                  />
                )
              )}
              {!isInstalling && (
                <IconAction
                  label={t("downloads.actions.openFolder")}
                  icon={FolderOpen}
                  onClick={onOpenFolder}
                />
              )}
              <IconAction
                label={t("downloads.actions.killDownload")}
                icon={X}
                onClick={() => setConfirmingKill(open => !open)}
                disabled={isStopping || isResuming}
                className={cn(
                  "hover:bg-red-500/10 hover:text-red-600",
                  confirmingKill && "bg-red-500/10 text-red-600"
                )}
              />
            </div>
          )}
        </div>

        {/* Cancel confirmation, in place of a dialog */}
        {confirmingKill && !isCompleted && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {t("downloads.actions.killDownloadTitle", {
                gameName: game.game,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isStopping}
                className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600"
                onClick={() => {
                  setConfirmingKill(false);
                  onKill(true);
                }}
              >
                {t("downloads.actions.deleteFilesOption")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isStopping}
                onClick={() => {
                  setConfirmingKill(false);
                  onKill(false);
                }}
              >
                {t("downloads.actions.keepFilesOption")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingKill(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}

        {/* Extraction recovery */}
        {isAwaitingRecovery &&
          (recoverableError?.type === "missingExtractedFiles" || isArchiveRecovery) && (
            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-600">
                    {t(
                      isArchiveRecovery
                        ? "downloads.extractionRecovery.archiveTitle"
                        : "downloads.extractionRecovery.title"
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      isArchiveRecovery
                        ? "downloads.extractionRecovery.archiveDescription"
                        : "downloads.extractionRecovery.description"
                    )}
                  </p>
                </div>
              </div>
              <div className="max-h-24 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs">
                {isArchiveRecovery && (
                  <div className="space-y-1 break-words text-muted-foreground">
                    <p className="font-medium">{recoverableError.archive}</p>
                    <p>{recoverableError.message}</p>
                    {recoverableError.extractionError !== recoverableError.message && (
                      <p>{recoverableError.extractionError}</p>
                    )}
                  </div>
                )}
                {(recoverableError.files || []).map((error, index) => (
                  <div
                    key={`${error.file}-${index}`}
                    className="py-0.5 text-muted-foreground"
                  >
                    <span className="font-medium">{error.file}</span>
                    <span className="ml-2">{error.error}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {!isArchiveRecovery &&
                  window.electron.getPlatform() === "win32" &&
                  !settings.excludeFolders && (
                    <Button
                      size="sm"
                      onClick={() => handleExtractionRecovery(true)}
                      disabled={isSubmittingRecovery}
                      className="gap-2 text-secondary"
                    >
                      {isSubmittingRecovery ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldAlert className="h-4 w-4" />
                      )}
                      {t("downloads.extractionRecovery.enableProtectionAndRetry")}
                    </Button>
                  )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExtractionRecovery(false)}
                  disabled={isSubmittingRecovery}
                  className="gap-2"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {t(
                    isArchiveRecovery
                      ? "downloads.retryExtraction"
                      : "downloads.extractionRecovery.retryMissingFiles"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleExtractionRecovery(false, "cancel")}
                  disabled={isSubmittingRecovery}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}

        {/* Manual installer */}
        {isPendingManualInstall && downloadingData?.privatePackage && (
          <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="font-medium">{t("privateSources.package.title")}</p>
            <p className="text-sm text-muted-foreground">
              {privateSourceMessage(t, downloadingData.message)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("privateSources.package.note")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  window.electron.privateSources
                    .openPackage(game.game)
                    .catch(e => toast.error(privateSourceMessage(t, e)))
                }
              >
                {t("privateSources.package.showInFolder")}
              </Button>
              {/\.(zip|7z|rar)$/i.test(game.privateSource?.package || "") &&
                !game.privateSource?.extracted && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      const result = await window.electron.retryExtract(game.game);
                      if (!result.success)
                        toast.error(privateSourceMessage(t, result.error));
                    }}
                  >
                    {t("privateSources.package.extract")}
                  </Button>
                )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  window.electron.privateSources
                    .importGame(game.game, {
                      pickTitle: t("privateSources.package.pickTitle"),
                      cancel: t("common.cancel"),
                      confirm: t("privateSources.package.importConfirm"),
                      message: t("privateSources.package.importMessage"),
                      detail: t("privateSources.package.importDetail"),
                    })
                    .catch(e => toast.error(privateSourceMessage(t, e)))
                }
              >
                {t("privateSources.package.selectExecutable")}
              </Button>
            </div>
          </div>
        )}
        {isPendingManualInstall && !downloadingData?.privatePackage && (
          <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2.5">
              {installerLaunched ? (
                <Loader className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-600" />
              ) : (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-600">
                  {installerLaunched
                    ? t("downloads.installingTitle") || "Installing..."
                    : t("downloads.manualInstallTitle") || "One Last Step"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {installerLaunched
                    ? t("downloads.setInstallLocationDescription") ||
                      "In the installer, set the destination folder to the path below. This must match the game's existing folder so Ascendara can detect it."
                    : t("downloads.manualInstallDescription") ||
                      "Download complete. Run the installer as Administrator to finish installing the game."}
                </p>
              </div>
            </div>
            {installerLaunched && downloadingData?.manualInstallDir && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 py-1 pl-3 pr-1">
                <code className="flex-1 break-all text-xs text-foreground">
                  {downloadingData.manualInstallDir}
                </code>
                <IconAction
                  label={t("common.copy", "Copy")}
                  icon={Copy}
                  onClick={handleCopyInstallLocation}
                />
              </div>
            )}
            {installerLaunched ? (
              <Button
                size="sm"
                onClick={handleFinishInstall}
                disabled={isFinishingInstall}
                className="gap-2 text-secondary"
              >
                {isFinishingInstall ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {t("downloads.finishedInstalling") || "I've Finished Installing"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleRunInstaller}
                disabled={isLaunchingInstaller}
                className="gap-2 text-secondary"
              >
                {isLaunchingInstaller ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldAlert className="h-4 w-4" />
                )}
                {t("downloads.runAsAdmin") || "Run Installer as Admin"}
              </Button>
            )}
          </div>
        )}

        {/* Completed */}
        {isCompleted && !isPendingManualInstall && (
          <p className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {t("downloads.completedDescription") || "Your game is ready to play"}
          </p>
        )}

        {/* Verifying */}
        {isVerifyingState && !isCompleted && (
          <div className="space-y-2">
            <ProgressBar indeterminate tone="blue" />
            <p className="text-sm text-muted-foreground">
              {t("downloads.verifyingDescription")}
            </p>
          </div>
        )}

        {/* Verification failed */}
        {hasVerifyError && (
          <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-600">
                  {downloadingData.verifyError.length === 1
                    ? t("downloads.verificationFailed1", {
                        numFailed: downloadingData.verifyError.length,
                      })
                    : t("downloads.verificationFailed2", {
                        numFailed: downloadingData.verifyError.length,
                      })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("downloads.verificationFailedDesc")}{" "}
                  <a
                    className="inline-flex cursor-pointer items-center text-primary hover:underline"
                    onClick={() =>
                      window.electron.openURL(
                        "https://ascendara.app/docs/troubleshooting/common-issues#verification-issues"
                      )
                    }
                  >
                    {t("common.learnMore")} <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </p>
              </div>
            </div>
            <div className="max-h-24 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs">
              {downloadingData.verifyError.map((error, index) => (
                <div key={index} className="py-0.5 font-medium text-muted-foreground">
                  {error.file}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleVerifyGame}
              disabled={isVerifying}
            >
              {isVerifying ? t("downloads.verifying") : t("downloads.verifyAgain")}
            </Button>
          </div>
        )}

        {/* Resuming */}
        {isResumingState && (
          <div className="space-y-2">
            <ProgressBar indeterminate tone="blue" />
            <p className="text-sm text-muted-foreground">
              {t("downloads.resumingDescription")}
            </p>
          </div>
        )}

        {/* Paused */}
        {isStopped && !isResumingState && (
          <div className="space-y-2">
            <span className="text-2xl font-bold tabular-nums leading-none text-muted-foreground">
              {progress.toFixed(1)}
              <span className="ml-0.5 text-sm font-medium">%</span>
            </span>
            <ProgressBar value={progress} tone="muted" active={false} />
          </div>
        )}

        {/* Error */}
        {hasError && (
          <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-foreground">{getErrorMessage()}</p>
                {isPredefinedError(downloadingData.message) && (
                  <a
                    onClick={() =>
                      window.electron.openURL(
                        "https://ascendara.app/docs/troubleshooting/common-issues#download-issues"
                      )
                    }
                    className="mt-1 inline-flex cursor-pointer items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {t("common.learnMore")} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={canRetryExtraction(game) ? handleRetryExtraction : onRetry}
                disabled={isSubmittingRecovery}
                className="gap-2 text-secondary"
              >
                <RefreshCcw className="h-4 w-4" />
                {t(
                  canRetryExtraction(game) ? "downloads.retryExtraction" : "common.retry"
                )}
              </Button>
              {!isPredefinedError(downloadingData.message) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReport}
                  disabled={isReporting || wasReported}
                  className="gap-2"
                >
                  {isReporting ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : wasReported ? (
                    <CircleCheck className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {isReporting
                    ? t("common.reporting")
                    : wasReported
                      ? t("downloads.alreadyReported")
                      : t("common.reportToAscendara")}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* No progress for a while */}
        {stall && !hasError && !isStopped && !isWaiting && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-600">
                {t("downloads.stalled.title", {
                  minutes: Math.max(1, Math.round((Date.now() - stall.since) / 60000)),
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {stall.phase === "extraction"
                  ? t("downloads.stalled.extraction")
                  : t("downloads.stalled.download")}
              </p>
            </div>
          </div>
        )}

        {/* Downloading */}
        {isDownloading && !isWaiting && !isExtracting && !hasError && !isStopped && (
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <span className="text-2xl font-bold tabular-nums leading-none text-foreground">
                {progress.toFixed(1)}
                <span className="ml-0.5 text-sm font-medium text-muted-foreground">
                  %
                </span>
              </span>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <SpeedIndicator
                  speed={downloadingData.progressDownloadSpeeds}
                  isHigh={isHighSpeed(downloadingData.progressDownloadSpeeds)}
                />
                <span className="tabular-nums">
                  ETA {downloadingData.timeUntilComplete || "--:--"}
                </span>
              </div>
            </div>
            <ProgressBar value={progress} />
          </div>
        )}

        {/* Extracting */}
        {isExtracting && (
          <div className="space-y-2">
            {extraction?.totalFiles > 0 ? (
              <>
                <div className="flex items-end justify-between gap-3">
                  <span className="text-2xl font-bold tabular-nums leading-none text-foreground">
                    {extractionPercent.toFixed(1)}
                    <span className="ml-0.5 text-sm font-medium text-muted-foreground">
                      %
                    </span>
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {extraction.filesExtracted} / {extraction.totalFiles}{" "}
                    {t("downloads.files", "files")}
                    {extraction.extractionSpeed && ` · ${extraction.extractionSpeed}`}
                  </span>
                </div>
                <ProgressBar value={extractionPercent} tone="amber" />
                <div className="flex items-center justify-between gap-3">
                  <p
                    className="min-w-0 truncate text-xs text-muted-foreground"
                    title={extraction.currentFile || undefined}
                  >
                    {extraction.currentFile || t("downloads.extractingDescription")}
                  </p>
                  {logToggle}
                </div>
              </>
            ) : (
              <>
                <ProgressBar indeterminate tone="amber" />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t("downloads.preparingExtraction") || "Preparing extraction..."}
                  </p>
                  {logToggle}
                </div>
              </>
            )}
            {showLargeFileNotice && (
              <p className="flex items-center gap-2 text-xs text-blue-600">
                <AnimatedClockIcon className="h-3.5 w-3.5 shrink-0" />
                {t("downloads.largeFileNotice")}
              </p>
            )}
          </div>
        )}

        {/* Waiting for peers */}
        {isWaiting && (
          <div className="space-y-2">
            <ProgressBar indeterminate tone="muted" />
            <p className="text-sm text-muted-foreground">
              {t("downloads.waitingDescription")}
            </p>
          </div>
        )}

        {/* Live log, inline */}
        {logDialogOpen && (
          <div
            ref={logScrollRef}
            className="h-56 overflow-y-auto rounded-lg border border-border/60 bg-muted/30 p-3"
          >
            {logLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                {logContent || t("downloads.noLogContent")}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Downloads;
