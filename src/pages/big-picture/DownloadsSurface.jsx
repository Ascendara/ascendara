import {
  BigPictureShell,
  BigPictureToolbar,
  BigPictureEmptyState,
  BigPictureHero,
  BigPictureSpotlight,
  BigPicturePanel,
} from "./BigPictureShell";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Compass,
  Download,
  Gauge,
  ListOrdered,
  Play,
  X,
} from "lucide-react";
import { useHomeArtwork } from "./useHomeArtwork";
import { canRetryExtraction } from "@/services/downloads/extractionRetryService";
import { toast } from "sonner";
import {
  getQueueBlockReason,
  removeFromQueue,
  reorderQueue,
  processNextInQueue,
} from "@/services/downloads/downloadQueueService";
import { TORRENT_DISABLED_CODE } from "@/services/downloads/torrentLink";
import { BigPictureDownloadCard } from "./BigPictureDownloadCard";
import { SurfaceButton, useSurface } from "./Surface";

export function DownloadsSurface({
  navigation,
  active,
  downloads,
  queue,
  settings,
  torboxStates,
  stopping,
  resuming,
  pause,
  resume,
  retryExtraction,
  cancel,
  openFolder,
  onBack,
  browse,
  t,
  buttons,
}) {
  const [remove, setRemove] = useState(null);
  const [starting, setStarting] = useState(false);
  const [extracting, setExtracting] = useState(new Set());
  const retry = async game => {
    if (extracting.has(game.game)) return;
    setExtracting(current => new Set(current).add(game.game));
    try {
      await retryExtraction(game);
      toast.success(t("downloads.extractionRecovery.retryingArchive"));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setExtracting(current => {
        const next = new Set(current);
        next.delete(game.game);
        return next;
      });
    }
  };
  const rows = remove
    ? [["keep", "remove"]]
    : [
        ["browse", "start"],
        ...downloads.map(game => {
          const data = game.downloadingData || {};
          const count =
            canRetryExtraction(game) ||
            (!data.error &&
              !data.verifyError?.length &&
              (data.stopped || data.downloading))
              ? 3
              : 2;
          return Array.from({ length: count }, (_, i) => `download-${game.game}-${i}`);
        }),
        ...queue.map(item => [`up-${item.id}`, `down-${item.id}`, `remove-${item.id}`]),
      ];
  const lead = downloads[0];
  const artwork = useHomeArtwork(lead);
  const running = downloads.filter(
    game => game.downloadingData?.downloading && !game.downloadingData?.stopped
  );
  const { root, focus } = useSurface(
    navigation,
    rows,
    () => (remove ? setRemove(null) : onBack()),
    active
  );
  const start = async () => {
    if (starting) return;
    if (getQueueBlockReason(queue[0], settings) === TORRENT_DISABLED_CODE) {
      toast.info(t("download.toast.torrentDisabled"));
      return;
    }
    setStarting(true);
    try {
      const item = await processNextInQueue();
      toast.info(
        item
          ? `Starting ${item.gameName}`
          : "Queue is empty, waiting for an active download, or could not start. Check Downloads for details."
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setStarting(false);
    }
  };
  return (
    <BigPictureShell ref={root} className="bp-downloads" title="Downloads" focus={focus}>
      {remove ? (
        <BigPicturePanel className="bp-confirm">
          <X className="bp-confirm-symbol" aria-hidden="true" />
          <h2>Remove {remove.gameName} from the queue?</h2>
          <p className="bp-muted">This removes only the queued request.</p>
          <div className="bp-actions">
            <SurfaceButton {...focus("keep")} onClick={() => setRemove(null)}>
              Keep queued
            </SurfaceButton>
            <SurfaceButton
              {...focus("remove")}
              variant="danger"
              onClick={() => {
                removeFromQueue(remove.id);
                setRemove(null);
              }}
            >
              Remove
            </SurfaceButton>
          </div>
        </BigPicturePanel>
      ) : (
        <>
          <BigPictureHero
            backdrop={artwork}
            eyebrow="Downloads"
            title={
              lead
                ? lead.game
                : queue.length
                  ? "Ready when you are"
                  : "Nothing downloading"
            }
            meta={
              downloads.length || queue.length
                ? [
                    downloads.length &&
                      `${downloads.length} in progress`,
                    queue.length && `${queue.length} queued`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Find a game in Browse to get started."
            }
            aside={
              (running.length > 0 || queue.length > 0) && (
                <BigPictureSpotlight
                  chips={[
                    running.length > 0 && {
                      icon: Gauge,
                      label: running[0].downloadingData.progressDownloadSpeeds || "Starting",
                    },
                    running.length > 0 && {
                      icon: Download,
                      label: `${running.length} active`,
                    },
                    queue.length > 0 && { icon: ListOrdered, label: `${queue.length} up next` },
                  ]}
                />
              )
            }
          />
          <BigPictureToolbar label="Download controls">
            <SurfaceButton {...focus("browse")} onClick={browse}>
              <Compass />
              Browse games
            </SurfaceButton>
            <SurfaceButton {...focus("start")} onClick={start}>
              <Play />
              {starting ? "Starting…" : "Start next queued download"}
            </SurfaceButton>
          </BigPictureToolbar>
          {!downloads.length && !queue.length && (
            <BigPictureEmptyState title="Your download shelf is empty">
              <p>Games you download or queue will show up here with live progress.</p>
            </BigPictureEmptyState>
          )}
          {downloads.length > 0 && (
            <section>
              <p className="bp-section-label">In progress</p>
              <div className="bp-dl-list">
                {downloads.map(game => (
                  <BigPictureDownloadCard
                    key={game.game}
                    game={game}
                    focus={focus}
                    isSelected={false}
                    torboxState={torboxStates[game.torboxWebdownloadId]}
                    onPause={() => pause(game)}
                    onResume={() => resume(game)}
                    onRetryExtraction={() => retry(game)}
                    onKill={() => cancel(game)}
                    onOpenFolder={() => openFolder(game)}
                    isStopping={stopping.has(game.game)}
                    isResuming={resuming.has(game.game) || extracting.has(game.game)}
                    t={t}
                    buttons={buttons}
                  />
                ))}
              </div>
            </section>
          )}
          {queue.length > 0 && (
            <section>
              <p className="bp-section-label">Up next</p>
              <ol className="bp-queue-list">
                {queue.map((item, index) => (
                  <li className="bp-queue-item" key={item.id}>
                    <span className="bp-queue-position">{index + 1}</span>
                    <div className="bp-queue-info">
                      <strong>{item.gameName}</strong>
                      <span>
                        {item.size}
                        {getQueueBlockReason(item, settings) === TORRENT_DISABLED_CODE &&
                          ` · ${t("download.toast.torrentDisabled")}`}
                      </span>
                    </div>
                    <div className="bp-queue-actions">
                      <SurfaceButton
                        variant="icon"
                        aria-label={`Move ${item.gameName} up`}
                        aria-disabled={index === 0}
                        {...focus(`up-${item.id}`)}
                        onClick={() => reorderQueue(index, index - 1)}
                      >
                        <ArrowUp />
                      </SurfaceButton>
                      <SurfaceButton
                        variant="icon"
                        aria-label={`Move ${item.gameName} down`}
                        aria-disabled={index === queue.length - 1}
                        {...focus(`down-${item.id}`)}
                        onClick={() => reorderQueue(index, index + 1)}
                      >
                        <ArrowDown />
                      </SurfaceButton>
                      <SurfaceButton
                        variant="icon"
                        aria-label={`Remove ${item.gameName} from the queue`}
                        {...focus(`remove-${item.id}`)}
                        onClick={() => setRemove(item)}
                      >
                        <X />
                      </SurfaceButton>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </BigPictureShell>
  );
}
