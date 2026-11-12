import { FolderOpen, Trash2, Play, Pause, Loader, RefreshCcw, Download } from "lucide-react";
import { useHomeArtwork } from "./useHomeArtwork";
import { canRetryExtraction } from "@/services/downloads/extractionRetryService";

// --- BIG PICTURE DOWNLOAD CARD ---
const BigPictureDownloadCard = ({
  game,
  torboxState,
  onPause,
  onResume,
  onKill,
  onOpenFolder,
  onRetryExtraction,
  isStopping,
  isResuming,
  t,
  focus,
}) => {
  const data = game.downloadingData || {};
  const artwork = useHomeArtwork(game);
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
    if (data.awaitingRecoveryAction)
      return {
        text: t("downloads.extractionRecovery.archiveTitle"),
        color: "text-amber-500",
      };
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
    if (canRetryExtraction(game)) {
      return [
        {
          label: t("downloads.retryExtraction"),
          icon: RefreshCcw,
          action: onRetryExtraction,
        },
        { label: t("downloads.openFolder"), icon: FolderOpen, action: onOpenFolder },
        { label: t("downloads.kill"), icon: Trash2, action: onKill, danger: true },
      ];
    }
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

  const tone = data.awaitingRecoveryAction
    ? "warning"
    : hasError
      ? "error"
      : isExtracting || isResuming || isStopping
        ? "warning"
        : isVerifying
          ? "success"
          : isPaused
            ? "muted"
            : "active";
  const extraction = data.extractionProgress;
  const extractionPercent = parseFloat(extraction?.percentComplete || 0);
  const shownPercent = isExtracting ? extractionPercent : progress;

  return (
    <article className="bp-dl-card" data-tone={tone}>
      <div className="bp-dl-art">
        {artwork ? <img src={artwork} alt="" /> : <Download aria-hidden="true" />}
      </div>
      <div className="bp-dl-body">
        <header className="bp-dl-head">
          <div className="bp-dl-title">
            <span className="bp-dl-status">
              {(isExtracting || isResuming || isStopping) && !hasError && (
                <Loader className="bp-dl-spin" aria-hidden="true" />
              )}
              {status.text}
            </span>
            <h3>{game.game}</h3>
          </div>
          {!hasError && (isExtracting ? extraction?.totalFiles > 0 : true) && (
            <strong className="bp-dl-percent">
              {shownPercent.toFixed(shownPercent >= 100 ? 0 : 1)}
              <small>%</small>
            </strong>
          )}
        </header>

        {!hasError && (
          <div
            className="bp-dl-bar"
            data-indeterminate={isExtracting && !(extraction?.totalFiles > 0)}
            role="progressbar"
            aria-label={status.text}
            aria-valuenow={Math.round(shownPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.min(100, Math.max(0, shownPercent))}%` }} />
          </div>
        )}

        {!hasError && (
          <div className="bp-dl-stats">
            {isExtracting ? (
              <>
                {extraction?.totalFiles > 0 && (
                  <span>
                    {extraction.filesExtracted} / {extraction.totalFiles} files
                  </span>
                )}
                {extraction?.extractionSpeed && <span>{extraction.extractionSpeed}</span>}
                <span className="bp-dl-file" title={extraction?.currentFile}>
                  {extraction?.currentFile ||
                    t("downloads.preparingExtraction") ||
                    t("downloads.extractingDescription")}
                </span>
              </>
            ) : (
              <>
                <span>
                  {downloaded} / {total}
                </span>
                {isDownloading && !isPaused && <span>{speed}</span>}
                {isDownloading && !isPaused && data.timeUntilComplete && (
                  <span>{data.timeUntilComplete} left</span>
                )}
              </>
            )}
          </div>
        )}

        {data.awaitingRecoveryAction && (
          <p className="bp-dl-note" data-tone="warning">
            {data.recoverableError?.message || t("downloads.extractionRecovery.description")}
          </p>
        )}
        {hasError && (
          <p className="bp-dl-note" data-tone="error">
            {data.message ||
              data.recoverableError?.message ||
              (data.verifyError?.length && JSON.stringify(data.verifyError[0])) ||
              t("downloads.unknownError")}
          </p>
        )}

        <div className="bp-dl-actions">
          {actions.map((action, idx) => (
            <button
              type="button"
              {...focus?.(`download-${game.game}-${idx}`)}
              key={idx}
              onClick={action.action}
              disabled={isStopping || isResuming}
              className={`bp-action${action.danger ? " bp-action--danger" : idx === 0 ? " bp-dl-primary" : ""}`}
            >
              <action.icon aria-hidden="true" />
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
};

export { BigPictureDownloadCard };
