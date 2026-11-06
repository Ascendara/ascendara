import { useCallback, useEffect, useState } from "react";
import { Cloud, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { getConfiguredProviders } from "@/services/downloads/debridService";
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

const readRecords = key => {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
};

const updateRecord = (provider, key, fields) => {
  const records = readRecords(provider.metadataStorageKey);
  if (!records[key]) return;
  records[key] = { ...records[key], ...fields };
  localStorage.setItem(provider.metadataStorageKey, JSON.stringify(records));
};

// Torrents sent to a service that has no page of its own, until they reach this PC.
export function useCloudTorrents(settings) {
  const providers = getConfiguredProviders(settings).filter(
    provider => provider.hasDownloadsPage === false && provider.getTorrentStatus
  );
  const apiKeyOf = provider => settings[provider.apiKeySetting]?.trim();
  const watch = providers
    .map(provider => `${provider.id}:${apiKeyOf(provider)}`)
    .join(",");
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    const pending = providers.flatMap(provider =>
      Object.entries(readRecords(provider.metadataStorageKey))
        .filter(
          ([key, entry]) =>
            key.startsWith("torrent:") &&
            entry?.autoHandoff === true &&
            !entry.localDownloadStarted &&
            !entry.cloudTorrentMissing &&
            !entry.cloudTorrentRemoved
        )
        .map(([key, entry]) => ({
          key: `${provider.id}:${key}`,
          recordKey: key,
          id: key.slice(8),
          name: entry.game || key.slice(8),
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
    await item.provider.removeTorrent(apiKeyOf(item.provider), item.id);
    updateRecord(item.provider, item.recordKey, { cloudTorrentRemoved: true });
    setItems(current => current.filter(entry => entry.key !== item.key));
  };

  return { items, remove };
}

export default function CloudTorrentList({ cloud }) {
  const { t } = useLanguage();
  const [removing, setRemoving] = useState(null);
  if (!cloud.items.length) return null;

  const remove = async item => {
    setRemoving(item.key);
    try {
      await cloud.remove(item);
      toast.success(t("debrid.cloud.removed", { provider: item.provider.name }));
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
                onClick={() => remove(item)}
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
    </section>
  );
}
