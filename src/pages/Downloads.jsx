import React, { useState, useEffect, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCachedDownloadData,
  clearCachedDownloadData,
} from "@/services/retryGameDownloadService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader,
  StopCircle,
  FolderOpen,
  MoreVertical,
  RefreshCcw,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Download,
  Clock,
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
  RefreshCw,
  Zap,
  TrendingUp,
  Activity,
  HardDrive,
  Pause,
  Package,
  CheckCircle2,
  XCircle,
  ArrowDownToLine,
  Wifi,
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
import { useSettings } from "@/context/SettingsContext";
import {
  processNextInQueue,
  getDownloadQueue,
  removeFromQueue,
} from "@/services/downloadQueueService";
import { cn } from "@/lib/utils";

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

// Animated pulse ring for active downloads
const PulseRing = memo(({ color = "primary" }) => (
  <span className="relative flex h-3 w-3">
    <span
      className={cn(
        "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
        color === "primary"
          ? "bg-primary"
          : color === "success"
            ? "bg-green-500"
            : "bg-amber-500"
      )}
    />
    <span
      className={cn(
        "relative inline-flex h-3 w-3 rounded-full",
        color === "primary"
          ? "bg-primary"
          : color === "success"
            ? "bg-green-500"
            : "bg-amber-500"
      )}
    />
  </span>
));

// Speed lines animation for high-speed downloads
const SpeedLines = memo(() => (
  <div className="absolute inset-0 overflow-hidden rounded-full">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="absolute h-[2px] bg-gradient-to-r from-primary/60 to-transparent"
        style={{
          top: `${20 + i * 15}%`,
          left: "-20%",
          width: `${30 + i * 5}%`,
          animation: `speedLine 0.8s ease-out infinite`,
          animationDelay: `${i * 0.15}s`,
          opacity: 0.7 - i * 0.1,
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

// Speed indicator with animated gradient
const SpeedIndicator = memo(({ speed, isHigh }) => (
  <div
    className={cn(
      "relative flex items-center gap-2 rounded-full px-4 py-2 transition-all duration-300",
      isHigh
        ? "border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/20 to-primary/10 shadow-lg shadow-primary/25"
        : "bg-muted/50"
    )}
  >
    {isHigh && <SpeedLines />}
    <Wifi
      className={cn(
        "relative z-10 h-4 w-4 transition-all duration-300",
        isHigh ? "animate-pulse text-primary" : "text-muted-foreground"
      )}
    />
    <span
      className={cn(
        "relative z-10 font-semibold tabular-nums transition-colors duration-300",
        isHigh ? "text-primary" : "text-foreground"
      )}
    >
      {speed}
    </span>
  </div>
));

const Downloads = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

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
  // Refs to always access the latest values inside polling
  const downloadingGamesRef = React.useRef(downloadingGames);
  const completedGamesRef = React.useRef(new Set());
  const fadingGamesRef = React.useRef(new Set());
  const prevActiveCountRef = React.useRef(0);
  useEffect(() => {
    downloadingGamesRef.current = downloadingGames;
  }, [downloadingGames]);
  useEffect(() => {
    completedGamesRef.current = completedGames;
  }, [completedGames]);
  useEffect(() => {
    fadingGamesRef.current = fadingGames;
  }, [fadingGames]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [totalSpeed, setTotalSpeed] = useState("0.00 MB/s");
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [stoppingDownloads, setStoppingDownloads] = useState(new Set());
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [gameToStop, setGameToStop] = useState(null);
  const [showFirstTimeAlert, setShowFirstTimeAlert] = useState(false);
  const MAX_HISTORY_POINTS = 20;
  const [speedHistory, setSpeedHistory] = useState(() => {
    const savedHistory = localStorage.getItem("speedHistory");
    return savedHistory
      ? JSON.parse(savedHistory)
      : Array(MAX_HISTORY_POINTS)
          .fill({ index: 0, speed: 0 })
          .map((_, i) => ({
            index: i,
            speed: 0,
          }));
  });
  // Track the actual peak speed separately (persists until page refresh or no active downloads)
  const [peakSpeed, setPeakSpeed] = useState(() => {
    const savedPeak = localStorage.getItem("peakSpeed");
    return savedPeak ? parseFloat(savedPeak) : 0;
  });

  const normalizeSpeed = speed => {
    const [value, unit] = speed.split(" ");
    const num = parseFloat(value);
    if (isNaN(num)) return 0;

    // Convert everything to MB/s
    switch (unit) {
      case "KB/s":
        return num / 1024;
      case "MB/s":
        return num;
      case "GB/s":
        return num * 1024;
      default:
        return 0;
    }
  };

  // Polling interval for downloading games (every 1 second)
  useEffect(() => {
    const fetchDownloadingGames = async () => {
      try {
        const games = await window.electron.getGames();
        const downloading = games.filter(game => {
          const { downloadingData } = game;
          return (
            downloadingData &&
            (downloadingData.downloading ||
              downloadingData.extracting ||
              downloadingData.updating ||
              downloadingData.verifying ||
              downloadingData.stopped ||
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
          const isGone = !currentNames.has(gameName);
          const isAlreadyTracked =
            completedGamesRef.current.has(gameName) ||
            fadingGamesRef.current.has(gameName);

          if (wasVerifying && isGone && !isAlreadyTracked) {
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

              // Remove completely after fade
              setTimeout(() => {
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

          // Process next queued download when a game completes
          // This triggers immediately when the "Download Complete" card shows
          processNextInQueue().then(nextItem => {
            if (nextItem) {
              toast.success(
                t("downloads.queuedDownloadStarted", { name: nextItem.gameName })
              );
            }
          });
        }

        // Build the display list: current downloads + completed/fading games
        const allGames = [...downloading];

        // Add completed games that aren't in the current download list
        prevGames.forEach(pg => {
          const isCompleted = completedGamesRef.current.has(pg.game);
          const isFading = fadingGamesRef.current.has(pg.game);
          const alreadyInList = allGames.some(g => g.game === pg.game);

          if ((isCompleted || isFading) && !alreadyInList) {
            allGames.push({
              ...pg,
              isCompleted: isCompleted,
              downloadingData: { ...pg.downloadingData, verifying: false },
            });
          }
        });

        // Update the ref BEFORE setting state to prevent stale reads
        downloadingGamesRef.current = allGames;
        setDownloadingGames(allGames);

        let totalSpeedNum = 0;
        let activeCount = 0;
        downloading.forEach(game => {
          if (game.downloadingData?.downloading) {
            activeCount++;
            const speed = game.downloadingData.progressDownloadSpeeds;
            if (speed) {
              totalSpeedNum += normalizeSpeed(speed);
            }
          }
        });
        setActiveDownloads(activeCount);
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
                  t("downloads.queuedDownloadStarted", { name: nextItem.gameName })
                );
              }
            });
          }
        }
        prevActiveCountRef.current = activeCount;

        // Update speed history
        setSpeedHistory(prevHistory => {
          const newHistory = [
            ...prevHistory.slice(1),
            {
              index: prevHistory[prevHistory.length - 1].index + 1,
              speed: totalSpeedNum,
            },
          ];
          localStorage.setItem("speedHistory", JSON.stringify(newHistory));
          return newHistory;
        });
      } catch (error) {
        console.error("Error fetching downloading games:", error);
      }
    };

    fetchDownloadingGames();
    // Poll every 1 second for more responsive progress updates
    const intervalId = setInterval(fetchDownloadingGames, 1000);
    // Only run this effect on mount/unmount (not on downloadingGames change)
    return () => clearInterval(intervalId);
  }, []);

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

  const handleStopDownload = game => {
    setGameToStop(game);
    setStopModalOpen(true);
  };

  const executeStopDownload = async (game, deleteContents = false) => {
    console.log("Executing stop download for:", game, "deleteContents:", deleteContents);
    setStoppingDownloads(prev => new Set([...prev, game.game]));
    try {
      const result = await window.electron.stopDownload(game.game, deleteContents);
      console.log("Stop download result:", result);
      if (!result) {
        throw new Error("Failed to stop download");
      }
    } catch (error) {
      console.error("Error stopping download:", error);
      toast({
        title: t("downloads.errors.stopFailed"),
        description: deleteContents
          ? t("downloads.errors.stopAndDeleteFailed")
          : t("downloads.errors.stopOnlyFailed"),
        variant: "destructive",
      });
    } finally {
      setStoppingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(game.game);
        return newSet;
      });
      // Optimistically remove the game from the downloads list if deleteContents is true
      if (deleteContents) {
        // Clear the cached download data since the download is being deleted
        clearCachedDownloadData(game.game);
        setDownloadingGames(prev => prev.filter(g => g.game !== game.game));
      }
      setStopModalOpen(false);
      setGameToStop(null);
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

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm">
          <p className="text-sm font-semibold text-foreground">
            {payload[0].value.toFixed(2)} MB/s
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="container mx-auto px-4 pb-8">
      {downloadingGames.length === 0 && queuedDownloads.length === 0 ? (
        /* Empty State - Clean centered design */
        <div className="flex min-h-[85vh] flex-col items-center justify-center">
          <div className="space-y-8 text-center">
            {/* Icon container */}
            <div className="mx-auto flex items-center justify-center">
              <Coffee className="h-12 w-12 text-primary" />
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {t("downloads.noDownloads")}
              </h2>
              <p className="mx-auto max-w-sm text-lg text-muted-foreground">
                {t("downloads.noDownloadsMessage")}
              </p>
            </div>

            {/* Decorative dots */}
            <div className="flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
            </div>
          </div>
        </div>
      ) : (
        /* Main Content - Stunning layout */
        <div className="mt-6 space-y-6">
          {/* Header Section with Stats */}
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/30 p-6 shadow-xl">
            {/* Background decoration */}
            <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              {/* Title and status */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <ArrowDownToLine className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                      {t("downloads.activeDownloads")}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {t("downloads.downloadsInProgress", { count: activeDownloads })}
                      {queuedDownloads.length > 0 && (
                        <span>
                          {" "}
                          ·{" "}
                          {t("downloads.queuedCount", { count: queuedDownloads.length })}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="flex flex-wrap gap-3">
                {/* Current Speed */}
                <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      isHighSpeed(totalSpeed) ? "bg-primary/20" : "bg-muted"
                    )}
                  >
                    <Zap
                      className={cn(
                        "h-4 w-4",
                        isHighSpeed(totalSpeed) ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("downloads.currentTotalSpeed")}
                    </p>
                    <p
                      className={cn(
                        "text-lg font-bold tabular-nums",
                        isHighSpeed(totalSpeed) ? "text-primary" : "text-foreground"
                      )}
                    >
                      {totalSpeed}
                    </p>
                  </div>
                </div>

                {/* Peak Speed */}
                <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Peak Speed</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {peakSpeed.toFixed(2)} MB/s
                    </p>
                  </div>
                </div>

                {/* Active Downloads */}
                <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {activeDownloads}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Speed Chart */}
            <div className="relative mt-6">
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={speedHistory}
                    margin={{ top: 10, right: 10, bottom: 0, left: 10 }}
                  >
                    <defs>
                      <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="rgb(var(--color-primary))"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="rgb(var(--color-primary))"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="index" hide />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type={activeDownloads === 0 ? "linear" : "monotoneX"}
                      dataKey="speed"
                      stroke="rgb(var(--color-primary))"
                      strokeWidth={2.5}
                      fill="url(#speedGradient)"
                      isAnimationActive={true}
                      animationDuration={activeDownloads === 0 ? 1500 : 950}
                      animationEasing={activeDownloads === 0 ? "ease-out" : "linear"}
                      connectNulls
                      dot={false}
                      baseValue={0}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {t("downloads.speedHistory")}
              </p>
            </div>
          </div>

          {/* Downloads List */}
          <div className="space-y-4">
            {downloadingGames.map(game => (
              <DownloadCard
                key={`${game.game}-${game.executable}`}
                game={game}
                torboxState={
                  game.torboxWebdownloadId
                    ? torboxStates[game.torboxWebdownloadId]
                    : undefined
                }
                onStop={() => handleStopDownload(game)}
                onRetry={() => handleRetryDownload(game)}
                onOpenFolder={() => handleOpenFolder(game)}
                isStopping={stoppingDownloads.has(game.game)}
                isCompleted={completedGames.has(game.game)}
                isFading={fadingGames.has(game.game)}
                onDelete={deletedGame => {
                  setDownloadingGames(prev =>
                    prev.filter(g => g.game !== deletedGame.game)
                  );
                }}
                onClearCache={clearCachedDownloadData}
              />
            ))}
          </div>

          {/* Queued Downloads Section */}
          {queuedDownloads.length > 0 && (
            <div className={downloadingGames.length === 0 ? "" : "mt-8"}>
              <h2 className="mb-4 text-xl font-semibold text-foreground">
                {t("downloads.queuedDownloads", "Queued Downloads")} (
                {queuedDownloads.length})
              </h2>
              <div className="space-y-3">
                {queuedDownloads.map((item, index) => (
                  <Card
                    key={item.id}
                    className={cn(
                      "border-border/50",
                      index === 0 && downloadingGames.length === 0
                        ? "border-primary/50 bg-primary/5"
                        : "bg-card/50"
                    )}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        {index === 0 && downloadingGames.length === 0 ? (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                            <Loader className="h-4 w-4 animate-spin text-primary" />
                          </div>
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                            {index + 1}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground">{item.gameName}</p>
                          <p className="text-sm text-muted-foreground">
                            {index === 0 && downloadingGames.length === 0
                              ? t("downloads.startingSoon", "Starting soon...")
                              : t("downloads.waitingInQueue", "Waiting in queue")}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          removeFromQueue(item.id);
                          setQueuedDownloads(prev => prev.filter(q => q.id !== item.id));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alert Dialogs */}
      {showFirstTimeAlert && (
        <AlertDialog open={showFirstTimeAlert} onOpenChange={setShowFirstTimeAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-bold text-foreground">
                {t("downloads.firstTimeDownload.title")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                {t("downloads.firstTimeDownload.message")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                className="bg-primary text-secondary"
                onClick={() => setShowFirstTimeAlert(false)}
              >
                {t("downloads.firstTimeDownload.understand")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog open={stopModalOpen} onOpenChange={setStopModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("downloads.actions.stopDownloadTitle", { gameName: gameToStop?.game })}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription className="text-muted-foreground">
            {t("downloads.actions.stopDownloadDescription")}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => gameToStop && executeStopDownload(gameToStop, false)}
              className="bg-primary text-secondary hover:bg-primary/90"
            >
              {t("downloads.actions.stopDownload")}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => gameToStop && executeStopDownload(gameToStop, true)}
              className="bg-primary text-secondary hover:bg-primary/90"
            >
              <Trash2 className="h-4 w-4" />
              <span className="ml-2">{t("downloads.actions.stopAndDelete")}</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Status badge component for download cards
const StatusBadge = memo(({ status, t }) => {
  const configs = {
    downloading: {
      icon: ArrowDownToLine,
      label: t("downloads.downloading") || "Downloading",
      className: "bg-primary/10 text-primary border-primary/20",
      animate: true,
    },
    extracting: {
      icon: Package,
      label: t("downloads.extracting"),
      className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      animate: true,
    },
    verifying: {
      icon: CheckCircle2,
      label: t("downloads.verifying"),
      className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      animate: true,
    },
    waiting: {
      icon: Clock,
      label: t("downloads.waiting"),
      className: "bg-muted text-muted-foreground border-border",
      animate: true,
    },
    stopped: {
      icon: Pause,
      label: t("downloads.stopped"),
      className: "bg-muted text-muted-foreground border-border",
      animate: false,
    },
    error: {
      icon: XCircle,
      label: t("downloads.downloadError"),
      className: "bg-red-500/10 text-red-600 border-red-500/20",
      animate: false,
    },
    updating: {
      icon: RefreshCw,
      label: t("downloads.updating"),
      className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      animate: true,
    },
    completed: {
      icon: CheckCircle2,
      label: t("downloads.completed") || "Completed",
      className: "bg-green-500/10 text-green-600 border-green-500/20",
      animate: false,
    },
  };

  const config = configs[status] || configs.downloading;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 border px-2.5 py-1", config.className)}
    >
      <Icon className={cn("h-3 w-3", config.animate && "animate-pulse")} />
      <span className="text-xs font-medium">{config.label}</span>
    </Badge>
  );
});

const DownloadCard = ({
  game,
  onStop,
  onRetry,
  onOpenFolder,
  isStopping,
  isCompleted,
  isFading,
  onDelete,
  onClearCache,
}) => {
  const [isReporting, setIsReporting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLargeFileNotice, setShowLargeFileNotice] = useState(false);
  const fileStartTimeRef = useRef(null);
  const trackedFileRef = useRef(null);
  const noticeShownForFileRef = useRef(null);
  const [clockIndex, setClockIndex] = useState(0);
  const { t } = useLanguage();
  const { settings } = useSettings();

  const { downloadingData } = game;

  // Track extraction time per file to show notice for large files
  useEffect(() => {
    const currentFile = downloadingData?.extractionProgress?.currentFile;
    const isExtracting = downloadingData?.extracting;

    // Reset everything when extraction stops
    if (!isExtracting) {
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

  // Determine current status for badge
  const getStatus = () => {
    if (isCompleted) return "completed";
    if (hasError) return "error";
    if (isStopped) return "stopped";
    if (isVerifyingState) return "verifying";
    if (isExtracting) return "extracting";
    if (isWaiting) return "waiting";
    if (isUpdating) return "updating";
    return "downloading";
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

  const handleRemoveDownload = async game => {
    setIsDeleting(true);
    if (onClearCache) onClearCache(game.game);
    await window.electron.deleteGameDirectory(game.game);
    setIsDeleting(false);
    if (onDelete) onDelete(game);
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
    "no_files_error",
    "provider_blocked_error",
    "[Errno 28] No space left on device",
    "[WinError 225]",
    "Connection broken",
    "IncompleteRead",
  ];

  const isPredefinedError = message => {
    if (!message) return false;
    return predefinedErrorPatterns.some(pattern => message.includes(pattern));
  };

  const handleReport = async () => {
    if (wasReported) return;
    setIsReporting(true);
    try {
      const AUTHORIZATION = await window.electron.getAPIKey();
      const response = await fetch("https://api.ascendara.app/auth/token", {
        headers: { Authorization: AUTHORIZATION },
      });
      if (!response.ok) throw new Error("Failed to obtain token");
      const { token } = await response.json();

      const reportResponse = await fetch("https://api.ascendara.app/app/report/feature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reportType: "GameDownload",
          reason: `Download Error: ${game.game}`,
          details: `Error Details:
          • Game Name: ${game.game}
          • Game Version: ${game.version || "N/A"}
          • Game Size: ${game.size || "N/A"}
          • Error Message: ${downloadingData.message || "Unknown error"}

          Download State:
          • Progress: ${downloadingData.progressCompleted || "0"}%
          • Download Speed: ${downloadingData.progressDownloadSpeeds || "N/A"}

          System Info:
          • Timestamp: ${new Date().toISOString()}
          • Platform: ${window.electron.getPlatform() || "Unknown"}
          • App Version: ${__APP_VERSION__ || "Unknown"}`,
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

    if (msg.includes("content_type_error")) return t("downloads.contentTypeError");
    if (msg.includes("no_files_error")) return t("downloads.noFilesError");
    if (msg.includes("provider_blocked_error"))
      return t("downloads.connectionResetError");
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

  const progress = parseFloat(downloadingData?.progressCompleted || 0);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-all duration-500",
        isFading && "scale-95 opacity-0",
        isCompleted
          ? "border-green-500/30 bg-gradient-to-br from-green-500/5 via-card to-card"
          : hasError
            ? "border-red-500/30 bg-gradient-to-br from-red-500/5 via-card to-card"
            : isStopped
              ? "border-border/50 bg-card"
              : "border-border/50 bg-gradient-to-br from-card via-card to-muted/20 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
      )}
    >
      {/* Animated background for active downloads */}
      {isDownloading && !hasError && !isStopped && !isCompleted && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-y-0 left-0" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Completed background */}
      {isCompleted && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-green-500/10 to-green-500/5" />
        </div>
      )}

      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-3">
              {/* Game icon placeholder */}
              <div
                className={cn(
                  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors",
                  isCompleted
                    ? "bg-green-500/10"
                    : hasError
                      ? "bg-red-500/10"
                      : "bg-primary/10"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : hasError ? (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                ) : isExtracting ? (
                  <Loader className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Download className="h-5 w-5 text-primary" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-semibold text-foreground">
                  {game.game}
                </h3>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{game.size}</span>
                  {!hasError && !isStopped && !hasVerifyError && (
                    <StatusBadge status={getStatus()} t={t} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl hover:bg-muted/80"
              >
                {isStopping || isDeleting ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreVertical className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {hasError || isStopped ? (
                <>
                  <DropdownMenuItem onClick={() => onRetry(game)} className="gap-2">
                    <RefreshCcw className="h-4 w-4" />
                    {t("downloads.actions.retryDownload")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRemoveDownload(game)}
                    className="gap-2 text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("downloads.actions.cancelAndDelete")}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={() => onStop(game)} className="gap-2">
                  <StopCircle className="h-4 w-4" />
                  {t("downloads.actions.stopDownload")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onOpenFolder(game)} className="gap-2">
                <FolderOpen className="h-4 w-4" />
                {t("downloads.actions.openFolder")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content based on state */}
        <div className="mt-4">
          {/* Completed State */}
          {isCompleted && (
            <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-green-600">
                  {t("downloads.completed") || "Download Complete!"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("downloads.completedDescription") || "Your game is ready to play"}
                </p>
              </div>
            </div>
          )}

          {/* Verifying State */}
          {isVerifyingState && !isCompleted && (
            <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Loader className="h-5 w-5 animate-spin text-blue-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">{t("downloads.verifying")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("downloads.verifyingDescription")}
                </p>
              </div>
            </div>
          )}

          {/* Verify Error State */}
          {hasVerifyError && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {downloadingData.verifyError.length === 1
                    ? t("downloads.verificationFailed1", {
                        numFailed: downloadingData.verifyError.length,
                      })
                    : t("downloads.verificationFailed2", {
                        numFailed: downloadingData.verifyError.length,
                      })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
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
              <div className="max-h-24 overflow-y-auto rounded-lg bg-muted/50 p-2 text-xs">
                {downloadingData.verifyError.map((error, index) => (
                  <div key={index} className="py-0.5 text-muted-foreground">
                    <span className="font-medium">{error.file}</span>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerifyGame}
                disabled={isVerifying}
                className="w-full"
              >
                {isVerifying ? t("downloads.verifying") : t("downloads.verifyAgain")}
              </Button>
            </div>
          )}

          {/* Stopped State */}
          {isStopped && !hasVerifyError && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Pause className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{t("downloads.stopped")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("downloads.stoppedDescription")}{" "}
                  <a
                    onClick={() =>
                      window.electron.openURL(
                        "https://ascendara.app/docs/troubleshooting/common-issues#download-resumability"
                      )
                    }
                    className="cursor-pointer text-primary hover:underline"
                  >
                    {t("common.learnMore")}
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {hasError && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-red-600">
                    {t("downloads.downloadError")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {getErrorMessage()}
                  </p>
                  {isPredefinedError(downloadingData.message) && (
                    <a
                      onClick={() =>
                        window.electron.openURL(
                          "https://ascendara.app/docs/troubleshooting/common-issues#download-issues"
                        )
                      }
                      className="mt-2 inline-flex cursor-pointer items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {t("common.learnMore")} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
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
                <Button
                  variant="default"
                  size="sm"
                  onClick={onRetry}
                  className="gap-2 text-secondary"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {t("common.retry")}
                </Button>
              </div>
            </div>
          )}

          {/* Active Download State */}
          {isDownloading && !isWaiting && !isExtracting && !hasError && !isStopped && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">
                    {progress.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">
                    ETA: {downloadingData.timeUntilComplete || "--:--"}
                  </span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                  {/* Shimmer effect */}
                  <div
                    className="absolute inset-y-0 left-0 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Speed and info */}
              <div className="flex flex-wrap items-center gap-3">
                <SpeedIndicator
                  speed={downloadingData.progressDownloadSpeeds}
                  isHigh={isHighSpeed(downloadingData.progressDownloadSpeeds)}
                />

                {settings.downloadLimit > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {t("downloads.limitedTo")}{" "}
                    {settings.downloadLimit >= 1024
                      ? `${Math.round(settings.downloadLimit / 1024)} MB/s`
                      : `${settings.downloadLimit} KB/s`}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Extracting State */}
          {isExtracting && (
            <div className="space-y-3">
              {/* Large file notice */}
              {showLargeFileNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-600">
                  <AnimatedClockIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{t("downloads.largeFileNotice")}</span>
                </div>
              )}
              {/* Extraction progress bar */}
              {downloadingData?.extractionProgress?.totalFiles > 0 ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">
                        {parseFloat(
                          downloadingData.extractionProgress.percentComplete || 0
                        ).toFixed(1)}
                        %
                      </span>
                      <span className="text-muted-foreground">
                        {downloadingData.extractionProgress.filesExtracted} /{" "}
                        {downloadingData.extractionProgress.totalFiles} files
                      </span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/50">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                        style={{
                          width: `${parseFloat(downloadingData.extractionProgress.percentComplete || 0)}%`,
                        }}
                      />
                      {/* Shimmer effect */}
                      <div
                        className="absolute inset-y-0 left-0 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                        style={{
                          width: `${parseFloat(downloadingData.extractionProgress.percentComplete || 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                      <Loader className="h-5 w-5 animate-spin text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground">
                          {t("downloads.extracting")}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {downloadingData.extractionProgress.extractionSpeed}
                        </span>
                      </div>
                      <p
                        className="truncate text-sm text-muted-foreground"
                        title={downloadingData.extractionProgress.currentFile}
                      >
                        {downloadingData.extractionProgress.currentFile ||
                          t("downloads.extractingDescription")}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="relative h-2 overflow-hidden rounded-full bg-muted/50">
                    <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                      <Loader className="h-5 w-5 animate-spin text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {t("downloads.extracting")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("downloads.preparingExtraction") || "Preparing extraction..."}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Waiting State */}
          {isWaiting && (
            <div className="space-y-3">
              <div className="relative h-2 overflow-hidden rounded-full bg-muted/30">
                <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-muted-foreground/30 to-transparent" />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Clock className="h-5 w-5 animate-pulse text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("downloads.waiting")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("downloads.waitingDescription")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Downloads;
