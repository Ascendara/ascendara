import {
  BigPictureShell,
  BigPictureToolbar,
  BigPictureEmptyState,
} from "./BigPictureShell";
import { useState } from "react";
import { toast } from "sonner";
import {
  removeFromQueue,
  reorderQueue,
  processNextInQueue,
} from "@/services/downloadQueueService";
import { BigPictureDownloadCard } from "./BigPictureDownloadCard";
import { SurfaceButton, useSurface } from "./Surface";

export function DownloadsSurface({
  navigation,
  active,
  downloads,
  queue,
  torboxStates,
  stopping,
  resuming,
  pause,
  resume,
  cancel,
  openFolder,
  onBack,
  browse,
  t,
  buttons,
}) {
  const [remove, setRemove] = useState(null);
  const [starting, setStarting] = useState(false);
  const rows = remove
    ? [["keep", "remove"]]
    : [
        ["browse", "start"],
        ...downloads.map((game) => {
          const data = game.downloadingData || {};
          const count =
            !data.error &&
            !data.verifyError?.length &&
            (data.stopped || data.downloading)
              ? 3
              : 2;
          return Array.from(
            { length: count },
            (_, i) => `download-${game.game}-${i}`,
          );
        }),
        ...queue.map((item) => [
          `up-${item.id}`,
          `down-${item.id}`,
          `remove-${item.id}`,
        ]),
      ];
  const { root, focus } = useSurface(
    navigation,
    rows,
    () => (remove ? setRemove(null) : onBack()),
    active,
  );
  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const item = await processNextInQueue();
      toast.info(
        item
          ? `Starting ${item.gameName}`
          : "Queue is empty, waiting for an active download, or could not start. Check Downloads for details.",
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setStarting(false);
    }
  };
  return (
    <BigPictureShell
      ref={root}
      className="bp-downloads"
      title="Downloads"
      focus={focus}
    >
      {remove ? (
        <>
          <h2>Remove {remove.gameName} from the queue?</h2>
          <p className="bp-muted">This removes only the queued request.</p>
          <div className="bp-actions">
            <SurfaceButton {...focus("keep")} onClick={() => setRemove(null)}>
              Keep queued
            </SurfaceButton>
            <SurfaceButton
              {...focus("remove")}
              onClick={() => {
                removeFromQueue(remove.id);
                setRemove(null);
              }}
            >
              Remove
            </SurfaceButton>
          </div>
        </>
      ) : (
        <>
          <BigPictureToolbar label="Download controls">
            <SurfaceButton {...focus("browse")} onClick={browse}>
              Browse games
            </SurfaceButton>
            <SurfaceButton {...focus("start")} onClick={start}>
              {starting ? "Starting…" : "Start next queued download"}
            </SurfaceButton>
          </BigPictureToolbar>
          {!downloads.length && !queue.length && (
            <BigPictureEmptyState title="No downloads">
              <p>Find a game in Browse to get started.</p>
            </BigPictureEmptyState>
          )}
          {downloads.length > 0 && (
            <section>
              <h2>Downloads · {downloads.length}</h2>
              <div className="space-y-6">
                {downloads.map((game) => (
                  <BigPictureDownloadCard
                    key={game.game}
                    game={game}
                    focus={focus}
                    isSelected={false}
                    torboxState={torboxStates[game.torboxWebdownloadId]}
                    onPause={() => pause(game)}
                    onResume={() => resume(game)}
                    onKill={() => cancel(game)}
                    onOpenFolder={() => openFolder(game)}
                    isStopping={stopping.has(game.game)}
                    isResuming={resuming.has(game.game)}
                    t={t}
                    buttons={buttons}
                  />
                ))}
              </div>
            </section>
          )}
          {queue.length > 0 && (
            <section>
              <h2>Queue · {queue.length}</h2>
              {queue.map((item, index) => (
                <section className="bp-queue-item" key={item.id}>
                  <h3>
                    {index + 1}. {item.gameName} · {item.size}
                  </h3>
                  <div className="bp-actions">
                    <SurfaceButton
                      {...focus(`up-${item.id}`)}
                      onClick={() => reorderQueue(index, index - 1)}
                    >
                      Move up
                    </SurfaceButton>
                    <SurfaceButton
                      {...focus(`down-${item.id}`)}
                      onClick={() => reorderQueue(index, index + 1)}
                    >
                      Move down
                    </SurfaceButton>
                    <SurfaceButton
                      {...focus(`remove-${item.id}`)}
                      onClick={() => setRemove(item)}
                    >
                      Remove from queue
                    </SurfaceButton>
                  </div>
                </section>
              ))}
            </section>
          )}
        </>
      )}
    </BigPictureShell>
  );
}
