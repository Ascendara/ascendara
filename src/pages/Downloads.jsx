import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCachedDownloadData,
  clearCachedDownloadData,
} from "@/services/retryGameDownloadService";

// Background Speed Animation Component
const BackgroundSpeedAnimation = () => {
  const containerStyle = {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "0",
  };

  const speedLinesStyle = {
    position: "relative",
    width: "100px",
    height: "30px",
  };

  const baseSpeedLineStyle = {
    position: "absolute",
    height: "2px",
    background:
      "linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.4) 50%, transparent 100%)",
    borderRadius: "1px",
    animation: "speedTrail 1.2s ease-in-out infinite",
  };

  const speedLineStyles = [
    {
      ...baseSpeedLineStyle,
      top: "6px",
      width: "35px",
      left: "10px",
      animationDelay: "0s",
    },
    {
      ...baseSpeedLineStyle,
      top: "10px",
      width: "28px",
      left: "15px",
      animationDelay: "0.15s",
    },
    {
      ...baseSpeedLineStyle,
      top: "14px",
      width: "40px",
      left: "8px",
      animationDelay: "0.3s",
    },
    {
      ...baseSpeedLineStyle,
      top: "18px",
      width: "25px",
      left: "18px",
      animationDelay: "0.45s",
    },
    {
      ...baseSpeedLineStyle,
      top: "22px",
      width: "32px",
      left: "12px",
      animationDelay: "0.6s",
    },
  ];

  return (
    <>
      <style>{`
        @keyframes speedTrail {
          0% {
            transform: translateX(-150%);
            opacity: 0;
          }
          25% {
            opacity: 0.6;
          }
          75% {
            opacity: 0.6;
          }
          100% {
            transform: translateX(200%);
            opacity: 0;
          }
        }
      `}</style>
      <div style={containerStyle}>
        <div style={speedLinesStyle}>
          {speedLineStyles.map((style, index) => (
            <div key={index} style={style}></div>
          ))}
        </div>
      </div>
    </>
  );
};
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/context/LanguageContext";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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
  ExternalLink,
  CircleCheck,
  Coffee,
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
import { useSettings } from "@/context/SettingsContext";
import * as torboxService from "../services/torboxService";

// Helper function to check if download speed is above 50 MB/s
const isHighSpeed = speedString => {
  if (!speedString) return false;

  // Extract the numeric value and unit from the speed string
  const match = speedString.match(/(\d+(?:\.\d+)?)\s*(MB|KB|GB)\/s/);
  if (!match) return false;

  const value = parseFloat(match[1]);
  const unit = match[2];

  // Convert to MB/s for comparison
  let speedInMB = value;
  if (unit === "KB") {
    speedInMB = value / 1024;
  } else if (unit === "GB") {
    speedInMB = value * 1024;
  }

  return speedInMB >= 50;
};

const Downloads = () => {
  const navigate = useNavigate();

  useEffect(() => {
    window.electron.switchRPC("downloading");
    return () => {
      window.electron.switchRPC("default");
    };
  }, []);
  const [downloadingGames, setDownloadingGames] = useState([]);
  const [torboxStates, setTorboxStates] = useState({}); // webdownloadId -> state
  // Ref to always access the latest downloadingGames inside polling
  const downloadingGamesRef = React.useRef(downloadingGames);
  useEffect(() => {
    downloadingGamesRef.current = downloadingGames;
  }, [downloadingGames]);
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
  const { t } = useLanguage();

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

        // Shallow compare by IDs and length to minimize unnecessary updates
        const prevIds = downloadingGames.map(g => g.id).join(",");
        const newIds = downloading.map(g => g.id).join(",");
        if (prevIds !== newIds || downloadingGames.length !== downloading.length) {
          setDownloadingGames(downloading);
        } else {
          // If list is same, still update to reflect internal stage/progress changes
          setDownloadingGames(downloading);
        }

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
    setStoppingDownloads(prev => new Set([...prev, game.id]));
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
        newSet.delete(game.id);
        return newSet;
      });
      // Optimistically remove the game from the downloads list if deleteContents is true
      if (deleteContents) {
        // Clear the cached download data since the download is being deleted
        clearCachedDownloadData(game.game);
        setDownloadingGames(prev => prev.filter(g => g.id !== game.id));
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

      setDownloadingGames(prev => prev.filter(g => g.id !== game.id));

      navigate("/download", {
        state: {
          gameData: cachedData,
        },
      });
    } else {
      toast.error(t("downloads.retryDataNotAvailable"));
      await window.electron.deleteGameDirectory(game.game);
      setDownloadingGames(prev => prev.filter(g => g.id !== game.id));
    }
  };

  const handleOpenFolder = async game => {
    await window.electron.openGameDirectory(game.game);
  };

  return (
    <div className="container mx-auto">
      {downloadingGames.length === 0 ? (
        <div className="mx-auto flex min-h-[85vh] max-w-md flex-col items-center justify-center text-center">
          <div className="space-y-6">
            <div className="mx-auto w-fit rounded-full bg-primary/5 p-6">
              <Coffee className="h-12 w-12 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold tracking-tight">
                {t("downloads.noDownloads")}
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground">
                {t("downloads.noDownloadsMessage")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Main Content Grid */
        <div className="mt-24 grid grid-cols-1 gap-6 sm:mt-8 lg:grid-cols-3">
          {/* Downloads Section - Takes up 2 columns on large screens */}
          <div className="space-y-4 lg:col-span-2">
            <h1 className="text-3xl font-bold text-primary">
              {t("downloads.activeDownloads")}
            </h1>
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
                isStopping={stoppingDownloads.has(game.id)}
                onDelete={deletedGame => {
                  // Optimistically remove from UI
                  setDownloadingGames(prev => prev.filter(g => g.id !== deletedGame.id));
                }}
                onClearCache={clearCachedDownloadData}
              />
            ))}
          </div>

          {/* Charts Section - Takes up 1 column on large screens */}
          <div className="space-y-4">
            {/* Speed History Chart */}
            <Card className="border border-border">
              <CardHeader>
                <h3 className="text-lg font-semibold">{t("downloads.speedHistory")}</h3>
              </CardHeader>
              <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={speedHistory}
                    margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                  >
                    <CartesianGrid
                      className="text-muted-foreground/20"
                      strokeDasharray="3 3"
                    />
                    <XAxis dataKey="index" hide />
                    <YAxis
                      className="text-secondary"
                      domain={[0, "auto"]}
                      tickFormatter={value => `${value.toFixed(1)}`}
                    />
                    <Tooltip
                      formatter={value => [`${value.toFixed(2)} MB/s`, "Speed"]}
                      labelFormatter={() => ""}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid rgb(229, 231, 235)",
                        borderRadius: "0.375rem",
                        padding: "8px",
                        fontSize: "0.875rem",
                      }}
                      labelStyle={{
                        color: "rgb(107, 114, 128)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="speed"
                      className="text-primary"
                      stroke="currentColor"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Download Statistics */}
            <Card className="border border-border">
              <CardHeader>
                <h3 className="text-lg font-semibold">{t("downloads.statistics")}</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>{t("downloads.activeDownloads")}</span>
                    <span className="font-medium">{activeDownloads}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t("downloads.currentTotalSpeed")}</span>
                    <span className="font-medium">{totalSpeed}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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

const DownloadCard = ({
  game,
  onStop,
  onRetry,
  onOpenFolder,
  isStopping,
  onDelete,
  onClearCache,
}) => {
  const [isReporting, setIsReporting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const { t } = useLanguage();
  const { settings } = useSettings();

  useEffect(() => {
    // Check if the animations already exist to avoid duplicates
    if (!document.getElementById("download-animations")) {
      const styleEl = document.createElement("style");
      styleEl.id = "download-animations";
      styleEl.textContent = `
        @keyframes pulse {
          0% { opacity: 0.3; }
          50% { opacity: 0.5; }
          100% { opacity: 0.3; }
        }
        
        @keyframes progress-loading {
          0% { width: 0%; left: 0; }
          50% { width: 40%; left: 30%; }
          100% { width: 0%; left: 100%; }
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  const handleVerifyGame = async () => {
    setIsVerifying(true);
    try {
      const result = await window.electron.verifyGame(game.game);
      if (!result.success) {
        throw new Error(result.error);
      }
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

  const [isDeleting, setIsDeleting] = useState(false);

  const handleRemoveDownload = async game => {
    setIsDeleting(true);
    // Clear the cached download data since the download is being deleted
    if (onClearCache) onClearCache(game.game);
    await window.electron.deleteGameDirectory(game.game);
    setIsDeleting(false);
    // Immediately notify parent to refresh downloads list
    if (onDelete) onDelete(game);
  };

  const { downloadingData } = game;
  const isDownloading = downloadingData?.downloading;
  const isExtracting = downloadingData?.extracting;
  const isWaiting = downloadingData?.waiting;
  const isStopped = downloadingData?.stopped;
  const isUpdating = downloadingData?.updating;
  const hasError = downloadingData?.error;

  // Check if this error was already reported
  const [wasReported, setWasReported] = useState(() => {
    try {
      const reportedErrors = JSON.parse(localStorage.getItem("reportedErrors") || "{}");
      const errorKey = `${game.game}-${downloadingData?.message || "unknown"}`;
      return reportedErrors[errorKey] || false;
    } catch (error) {
      console.error("Failed to load reported errors from cache:", error);
      return false;
    }
  });

  const handleReport = async () => {
    if (wasReported) return;

    setIsReporting(true);
    try {
      // Get auth token
      const AUTHORIZATION = await window.electron.getAPIKey();
      const response = await fetch("https://api.ascendara.app/auth/token", {
        headers: {
          Authorization: AUTHORIZATION,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to obtain token");
      }

      const { token } = await response.json();

      // Send the report
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
          • Current File: ${downloadingData.progressCurrentFile || "N/A"}
          • Total Files: ${downloadingData.progressTotalFiles || "N/A"}

          System Info:
          • Timestamp: ${new Date().toISOString()}
          • Platform: ${window.electron.getPlatform() || "Unknown"}
          • App Version: ${__APP_VERSION__ || "Unknown"}

          Technical Details:
          \`\`\`json
          ${JSON.stringify(
            {
              downloadState: downloadingData,
              gameMetadata: {
                id: game.id,
                version: game.version,
                size: game.size,
                downloadUrl: game.downloadUrl,
              },
            },
            null,
            2
          )}
          \`\`\``,
          gameName: game.game,
        }),
      });

      if (!reportResponse.ok) {
        throw new Error("Failed to submit report");
      }

      // Save to cache that this error was reported
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

  const predefinedErrorPatterns = [
    "content_type_error",
    "no_files_error",
    "provider_blocked_error",
    "[Errno 28] No space left on device",
    "[WinError 225]",
  ];

  function isPredefinedError(message) {
    if (!message) return false;
    return predefinedErrorPatterns.some(pattern => message.includes(pattern));
  }

  useEffect(() => {
    if (hasError && !wasReported && !isPredefinedError(downloadingData.message)) {
      handleReport();
    }
  }, [hasError, wasReported, downloadingData.message]);

  return (
    <Card className="mb-4 w-full border border-border transition-all duration-200 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold leading-none tracking-tight">{game.game}</h3>
            {downloadingData.updating && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" />
                {t("downloads.updating")}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-muted-foreground">{game.size}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0 transition-colors duration-200 hover:bg-muted/80"
            >
              {isStopping || isDeleting ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <MoreVertical className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {hasError || isStopped ? (
              <>
                <DropdownMenuItem onClick={() => onRetry(game)} className="gap-2">
                  <RefreshCcw className="h-4 w-4" />
                  {t("downloads.actions.retryDownload")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleRemoveDownload(game)}
                  className="text-destructive focus:text-destructive gap-2"
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
      </CardHeader>

      <CardContent>
        {downloadingData.verifying ? (
          <div className="flex flex-col items-center justify-center rounded-lg bg-muted/40 py-2">
            <span className="flex items-center gap-2 text-lg font-semibold">
              <Loader className="h-4 w-4 animate-spin" />
              {t("downloads.verifying")}
            </span>
            <span className="mt-1 text-sm text-muted-foreground">
              {t("downloads.verifyingDescription")}
            </span>
          </div>
        ) : downloadingData.verifyError && downloadingData.verifyError.length > 0 ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
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
              {t("downloads.verificationFailedDesc")}&nbsp;
              <a
                className="inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                onClick={() => {
                  window.electron.openURL(
                    "https://ascendara.app/docs/troubleshooting/common-issues#verification-issues"
                  );
                }}
              >
                {t("common.learnMore")} <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </p>
            <div className="max-h-32 overflow-y-auto rounded-md bg-muted/50 p-2">
              {downloadingData.verifyError.map((error, index) => (
                <div key={index} className="text-xs text-muted-foreground">
                  <span className="font-medium">{error.file}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleVerifyGame}
                disabled={isVerifying}
              >
                {isVerifying ? t("downloads.verifying") : t("downloads.verifyAgain")}
              </Button>
            </div>
          </div>
        ) : isStopped ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-col items-center justify-center rounded-lg bg-muted/40 py-2">
              <span className="flex items-center gap-2 text-lg font-semibold">
                <StopCircle className="h-4 w-4" />
                {t("downloads.stopped")}
              </span>
              <span className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {t("downloads.stoppedDescription")}&nbsp;
                <a
                  onClick={() =>
                    window.electron.openURL(
                      "https://ascendara.app/docs/troubleshooting/common-issues#download-resumability"
                    )
                  }
                  className="cursor-pointer text-primary hover:underline"
                >
                  {t("common.learnMore")}{" "}
                  <ExternalLink className="mb-1 inline-block h-3 w-3" />
                </a>
              </span>
            </div>
          </div>
        ) : hasError ? (
          <div className="bg-destructive/5 border-destructive/20 space-y-4 rounded-lg border p-4 duration-200 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-start space-x-3">
              <AlertCircle className="text-destructive mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="text-destructive font-medium">
                  {t("downloads.downloadError")}
                </div>
                {isPredefinedError(downloadingData.message) ? (
                  downloadingData.message.includes("content_type_error") ? (
                    <p className="text-sm text-muted-foreground">
                      {t("downloads.contentTypeError")}
                      <br />
                      <a
                        onClick={() =>
                          window.electron.openURL(
                            "https://ascendara.app/docs/troubleshooting/common-issues#download-issues"
                          )
                        }
                        className="cursor-pointer text-primary hover:underline"
                      >
                        {t("common.learnMore")}{" "}
                        <ExternalLink className="mb-1 inline-block h-3 w-3" />
                      </a>
                    </p>
                  ) : downloadingData.message.includes("no_files_error") ? (
                    <p className="text-sm text-muted-foreground">
                      {t("downloads.noFilesError")}
                      <br />
                      <a
                        onClick={() =>
                          window.electron.openURL(
                            "https://ascendara.app/docs/troubleshooting/common-issues#download-issues"
                          )
                        }
                        className="cursor-pointer text-primary hover:underline"
                      >
                        {t("common.learnMore")}{" "}
                        <ExternalLink className="mb-1 inline-block h-3 w-3" />
                      </a>
                    </p>
                  ) : downloadingData.message.includes("provider_blocked_error") ? (
                    <p className="text-sm text-muted-foreground">
                      {t("downloads.connectionResetError")}
                      <br />
                      <a
                        onClick={() =>
                          window.electron.openURL(
                            "https://ascendara.app/docs/troubleshooting/common-issues#download-issues"
                          )
                        }
                        className="cursor-pointer text-primary hover:underline"
                      >
                        {t("common.learnMore")}{" "}
                        <ExternalLink className="mb-1 inline-block h-3 w-3" />
                      </a>
                    </p>
                  ) : downloadingData.message.includes(
                      "[Errno 28] No space left on device"
                    ) ? (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "downloads.noSpaceLeftError",
                        "No space left on device. Please free up disk space to continue the download."
                      )}
                    </p>
                  ) : downloadingData.message.includes("[WinError 225]") ? (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "downloads.windowsDefenderError",
                        "Windows detected a false positive and blocked the download. You may need to add an exclusion in Windows Security."
                      )}
                      <br />
                      <a
                        onClick={() =>
                          window.electron.openURL(
                            "https://ascendara.app/docs/features/overview#protecting-directories-from-windows-defender"
                          )
                        }
                        className="cursor-pointer text-primary hover:underline"
                      >
                        {t("downloads.learnHowToFix", "Learn how to fix this")}{" "}
                        <ExternalLink className="mb-1 inline-block h-3 w-3" />
                      </a>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {downloadingData.message}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {downloadingData.message}
                  </p>
                )}
                <div className="flex items-center space-x-2 pt-1">
                  {downloadingData.message !== "content_type_error" &&
                    downloadingData.message !== "no_files_error" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/30 hover:bg-destructive/10 transition-colors duration-200"
                        onClick={handleReport}
                        disabled={isReporting || wasReported}
                      >
                        {isReporting ? (
                          <>
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                            {t("common.reporting")}
                          </>
                        ) : wasReported ? (
                          <>
                            <CircleCheck className="mr-2 h-4 w-4" />
                            {t("downloads.alreadyReported")}
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            {t("common.reportToAscendara")}
                          </>
                        )}
                      </Button>
                    )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="border-destructive/30 hover:bg-destructive/10 transition-colors duration-200"
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {t("common.retry")}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground/80">
                  {t("downloads.errorHelp")}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {isDownloading && !isWaiting && !isExtracting && (
              <div className="space-y-3 duration-200 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center space-x-3">
                  <span className="min-w-[45px] text-sm font-medium text-muted-foreground">
                    {downloadingData.progressCompleted}%
                  </span>
                  <div className="flex-1">
                    <Progress
                      value={parseFloat(downloadingData.progressCompleted)}
                      className="h-2 transition-all duration-300"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <div className="relative flex items-center space-x-2 rounded-md bg-muted/40 px-3 py-1">
                    {isHighSpeed(downloadingData.progressDownloadSpeeds) && (
                      <BackgroundSpeedAnimation />
                    )}
                    <Download className="relative z-10 h-4 w-4" />
                    <span className="relative z-10 font-medium">
                      {downloadingData.progressDownloadSpeeds}
                      {settings.downloadLimit > 0 &&
                        ` (${t("downloads.limitedTo")} ${settings.downloadLimit >= 1024 ? `${Math.round(settings.downloadLimit / 1024)} MB` : `${settings.downloadLimit} KB`}/s)`}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 rounded-md bg-muted/40 px-3 py-1">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">
                      ETA: {downloadingData.timeUntilComplete}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {isExtracting && (
              <div className="mt-2 space-y-2">
                <div className="relative overflow-hidden rounded-full bg-muted">
                  <Progress value={undefined} />
                  <div
                    className="absolute top-0 h-full rounded-full bg-primary"
                    style={{
                      animation: "progress-loading 2.5s ease-in-out infinite",
                      opacity: 0.5,
                    }}
                  />
                  <div
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/10 via-primary/30 to-primary/10"
                    style={{
                      animation: "pulse 3s ease-in-out infinite",
                      opacity: 0.4,
                    }}
                  />
                </div>
                <div className="flex flex-col items-center justify-center rounded-lg bg-muted/40 py-2">
                  <span className="flex items-center gap-2 text-lg font-semibold">
                    <Loader className="h-4 w-4 animate-spin" />
                    {t("downloads.extracting")}
                  </span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    {t("downloads.extractingDescription")}
                  </span>
                </div>
              </div>
            )}
            {isWaiting && (
              <div className="mt-2 space-y-3 duration-200 animate-in fade-in slide-in-from-top-1">
                <div className="relative overflow-hidden rounded-full">
                  <Progress value={undefined} className="h-2 bg-muted/30" />
                </div>
                <div className="flex flex-col items-center justify-center rounded-lg bg-muted/40 py-2">
                  <span className="flex items-center gap-2 text-lg font-semibold">
                    <Loader className="h-4 w-4 animate-spin" />
                    {t("downloads.waiting")}
                  </span>
                  <span className="mt-1 max-w-[70%] text-center text-sm text-muted-foreground">
                    {t("downloads.waitingDescription")}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default Downloads;
