import { useCallback, useEffect, useState } from "react";
import { Cloud, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { useLanguage } from "@/context/LanguageContext";
import { getConfiguredProviders } from "@/services/downloads/debridService";
import {
  pendingTorrents,
  removePendingTorrent,
  updateRecord,
} from "@/services/downloads/debridRecords";
import { DebridItem, DebridList } from "@/components/debrid/DebridDownloadParts";

const REFRESH_MS = 30 * 1000;
const TONES = {
  queued: "waiting",
  downloading: "active",
  ready: "done",
  failed: "error",
  stalled: "error",
  error: "error",
};

// Torrents sent to a service that has no page of its own, until they reach this PC.
export function useCloudTorrents(settings) {
  // The same services the handoff works for: in use, no page, torrents on.
  const providers = getConfiguredProviders(settings).filter(
    provider =>
      provider.hasDownloadsPage === false &&
      provider.getTorrentStatus &&
      settings[provider.torrentSetting] !== false
  );
  const apiKeyOf = provider => settings[provider.apiKeySetting]?.trim();
  const watch = providers
    .map(provider => `${provider.id}:${apiKeyOf(provider)}`)
    .join(",");
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    const pending = providers.flatMap(provider =>
      pendingTorrents(provider).map(({ recordKey, id, entry }) => ({
        key: `${provider.id}:${recordKey}`,
        recordKey,
        id,
        name: provider.getTorrentGame(entry)?.game || id,
        stalled: entry.cloudTorrentStalled === true,
        lastProgress: entry.lastProgress ?? -1,
        provider,
      }))
    );
    const checked = await Promise.all(
      pending.map(async item => {
        try {
          const state = await item.provider.getTorrentStatus(
            apiKeyOf(item.provider),
            item.id
          );
          // A stalled torrent that moves again goes back to the handoff.
          const moved =
            state.status === "ready" || (state.progress ?? -1) > item.lastProgress;
          if (item.stalled && moved)
            updateRecord(item.provider, item.recordKey, {
              cloudTorrentStalled: false,
              lastProgress: state.progress ?? -1,
              lastProgressAt: Date.now(),
            });
          const stalled = item.stalled && !moved;
          return { ...item, ...state, status: stalled ? "stalled" : state.status };
        } catch (error) {
          return { ...item, status: "error", message: error.message };
        }
      })
    );
    // A torrent removed on the service's own site is dropped by the handoff too.
    setItems(checked.filter(item => item.status !== "missing"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const remove = async item => {
    const removed = await removePendingTorrent(
      item.provider,
      apiKeyOf(item.provider),
      item.recordKey
    );
    setItems(current => current.filter(entry => entry.key !== item.key));
    return removed;
  };

  return { items, remove };
}

export default function CloudTorrentList({ cloud }) {
  const { t } = useLanguage();
  const [confirm, setConfirm] = useState(null);
  const [removing, setRemoving] = useState(null);
  if (!cloud.items.length) return null;

  const remove = async item => {
    setRemoving(item.key);
    try {
      const removed = await cloud.remove(item);
      if (removed)
        toast.success(t("debrid.cloud.removed", { provider: item.provider.name }));
      else toast.info(t("debrid.cloud.alreadyStarted", { name: item.name }));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="rounded-2xl bg-card px-5 py-4 shadow">
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          {t("debrid.cloud.title")}
        </h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("debrid.cloud.description")}
      </p>
      <DebridList>
        {cloud.items.map(item => (
          <DebridItem
            key={item.key}
            name={item.name}
            kind={item.provider.name}
            status={t(`debrid.cloud.${item.status}`)}
            tone={TONES[item.status] || "waiting"}
            progress={item.progress ?? undefined}
            meta={item.message}
            action={
              <Button
                variant="ghost"
                size="sm"
                className="hover:text-destructive shrink-0 gap-1.5 text-muted-foreground"
                disabled={removing === item.key}
                onClick={() => setConfirm(item)}
              >
                {removing === item.key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {t("debrid.cloud.remove")}
              </Button>
            }
          />
        ))}
      </DebridList>
      <AlertDialog open={!!confirm} onOpenChange={() => setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("debrid.cloud.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("debrid.cloud.confirm", {
                name: confirm?.name,
                provider: confirm?.provider.name,
              })}{" "}
              {t("common.action_cannot_be_undone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void remove(confirm);
                setConfirm(null);
              }}
            >
              {t("debrid.cloud.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
