import React from "react";
import { FolderOpen, Trash2, Play, Pause, Loader } from "lucide-react";


// --- BIG PICTURE DOWNLOAD CARD ---
const BigPictureDownloadCard = ({
  game,
  isSelected,
  torboxState,
  onPause,
  onResume,
  onKill,
  onOpenFolder,
  isStopping,
  isResuming,
  t,
  buttons,
  focus,
}) => {

  const data = game.downloadingData || {};
  const progress = parseFloat(data.progressCompleted || 0);
  const speed = data.progressDownloadSpeeds || "0 KB/s";

  // Calculate downloaded from progress and total size
  const total = game.size || "0 MB";
  const calculateDownloaded = () => {
    if (!game.size || progress === 0) return "0 MB";
    const sizeMatch = game.size.match(/([\d.]+)\s*(GB|MB|KB)/);
    if (!sizeMatch) return "0 MB";
    const sizeValue = parseFloat(sizeMatch[1]);
    const sizeUnit = sizeMatch[2];
    const downloadedValue = ((sizeValue * progress) / 100).toFixed(2);
    return `${downloadedValue} ${sizeUnit}`;
  };
  const downloaded = calculateDownloaded();

  const isDownloading = data.downloading;
  const isExtracting = data.extracting;
  const isVerifying = data.verifying;
  const isPaused = data.stopped;
  const hasError = data.error || (data.verifyError && data.verifyError.length > 0);

  const getStatus = () => {
    if (hasError) return { text: t("downloads.error"), color: "text-red-500" };
    if (isResuming) return { text: t("downloads.resuming"), color: "text-amber-500" };
    if (isStopping) return { text: t("downloads.pausing"), color: "text-amber-500" };
    if (isPaused) return { text: t("downloads.paused"), color: "text-slate-400" };
    if (isExtracting) return { text: t("downloads.extracting"), color: "text-amber-500" };
    if (isVerifying) return { text: t("downloads.verifying"), color: "text-green-500" };
    if (isDownloading) return { text: t("downloads.downloading"), color: "text-primary" };
    return { text: t("downloads.pending"), color: "text-slate-400" };
  };

  const status = getStatus();

  const getActions = () => {
    if (hasError) {
      return [
        { label: t("downloads.openFolder"), icon: FolderOpen, action: onOpenFolder },
        { label: t("downloads.kill"), icon: Trash2, action: onKill, danger: true },
      ];
    }
    if (isPaused) {
      return [
        { label: t("downloads.resume"), icon: Play, action: onResume },
        { label: t("downloads.openFolder"), icon: FolderOpen, action: onOpenFolder },
        { label: t("downloads.kill"), icon: Trash2, action: onKill, danger: true },
      ];
    }
    if (isDownloading) {
      return [
        { label: t("downloads.pause"), icon: Pause, action: onPause },
        { label: t("downloads.openFolder"), icon: FolderOpen, action: onOpenFolder },
        { label: t("downloads.kill"), icon: Trash2, action: onKill, danger: true },
      ];
    }
    return [
      { label: t("downloads.openFolder"), icon: FolderOpen, action: onOpenFolder },
      { label: t("downloads.kill"), icon: Trash2, action: onKill, danger: true },
    ];
  };

  const actions = getActions();

  return (
    <div
      className={`relative rounded-xl border-2 p-6 transition-all duration-200 ${
        isSelected
          ? "scale-[1.02] border-primary bg-primary/10 shadow-lg shadow-primary/20"
          : "border-border/50 bg-card/50"
      }`}
    >
      {/* Game Name and Status */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="mb-1 text-xl font-bold text-primary">{game.game}</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{game.size}</span>
            {!hasError && !isPaused && !hasError && (
              <span className={`text-sm font-semibold ${status.color}`}>
                • {status.text}
              </span>
            )}
            {isDownloading && !hasError && (
              <span className="text-xs text-muted-foreground">• {speed}</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar - Only show for downloading, not extracting */}
      {!hasError && !isExtracting && (
        <div className="mb-4">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${
                isVerifying ? "bg-green-500" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {downloaded} / {total}
            </span>
            <span className="font-bold">{progress.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Extraction Progress */}
      {isExtracting && !hasError && (
        <div className="mb-4 space-y-3">
          {data.extractionProgress?.totalFiles > 0 ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">
                    {parseFloat(data.extractionProgress.percentComplete || 0).toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">
                    {data.extractionProgress.filesExtracted} /{" "}
                    {data.extractionProgress.totalFiles} files
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                    style={{
                      width: `${parseFloat(data.extractionProgress.percentComplete || 0)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <Loader className="h-4 w-4 animate-spin text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {t("downloads.extracting")}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {data.extractionProgress.extractionSpeed}
                    </span>
                  </div>
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={data.extractionProgress.currentFile}
                  >
                    {data.extractionProgress.currentFile ||
                      t("downloads.extractingDescription")}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="relative h-3 overflow-hidden rounded-full bg-muted/50">
                <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-amber-500/20 via-amber-500 to-amber-500/20" />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <Loader className="h-4 w-4 animate-spin text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("downloads.extracting")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("downloads.preparingExtraction") || "Preparing extraction..."}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Error Message */}
      {hasError && (
        <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <p className="text-sm text-red-500">
            {data.error ||
              (data.verifyError && data.verifyError[0]) ||
              t("downloads.unknownError")}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {actions.map((action, idx) => (
          <button
            {...focus?.(`download-${game.game}-${idx}`)}
            key={idx}
            onClick={action.action}
            disabled={isStopping || isResuming}
            className={`bp-action flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              action.danger
                  ? "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                  : "bg-primary/20 text-primary hover:bg-primary/30"
            } ${isStopping || isResuming ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </button>
        ))}
      </div>

      {/* Controller Hint */}
      {isSelected && (
        <div className="mt-4 flex items-center justify-center gap-4 border-t border-border/50 pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="rounded bg-primary/20 px-2 py-1 font-bold text-primary">
              ← →
            </span>
            {t("bigPicture.navigate")}
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded bg-primary/20 px-2 py-1 font-bold text-primary">
              {buttons.confirm}
            </span>
            {t("bigPicture.select")}
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded bg-primary/20 px-2 py-1 font-bold text-primary">
              {buttons.cancel}
            </span>
            {t("bigPicture.back")}
          </span>
        </div>
      )}
    </div>
  );
};

export { BigPictureDownloadCard };
