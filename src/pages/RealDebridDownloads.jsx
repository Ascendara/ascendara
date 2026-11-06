import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import * as realDebrid from "@/services/downloads/realDebridService";
import realDebridProvider from "@/services/downloads/debrid/realDebridProvider";
import {
  DebridAccountBar,
  DebridAction,
  DebridEmpty,
  DebridItem,
  DebridList,
  DebridLoading,
  DebridTabs,
  formatBytes,
} from "@/components/debrid/DebridDownloadParts";
import { toast } from "sonner";

const itemKey = item => `${item.type}:${item.id}`;
const ACTIVE = new Set(["magnet_conversion", "downloading", "compressing", "uploading"]);
const FAILED = new Set(["magnet_error", "error", "virus", "dead"]);

export default function RealDebridDownloads() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [user, setUser] = useState(null);
  const [userError, setUserError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [files, setFiles] = useState({});
  const [metadata, setMetadata] = useState({});
  const [tab, setTab] = useState("ready");
  const fetching = useRef(false);
  const apiKey = settings.realDebridApiKey;
  const activeKey = useRef(apiKey);

  const refresh = useCallback(async () => {
    if (!apiKey || fetching.current === apiKey) return;
    fetching.current = apiKey;
    try {
      const downloads = await realDebrid.getAllDownloads(apiKey);
      if (activeKey.current !== apiKey) return;
      setItems(downloads);
      setMetadata(JSON.parse(localStorage.getItem("realDebridGameData") || "{}"));
      setError("");
    } catch (err) {
      if (activeKey.current === apiKey) {
        setError(err.message);
        setItems(current => current || []);
      }
    } finally {
      if (fetching.current === apiKey) fetching.current = false;
    }
  }, [apiKey]);

  useEffect(() => {
    activeKey.current = apiKey;
    setItems(null);
    setFiles({});
    setUser(null);
    setUserError("");
    if (!apiKey) return;
    let active = true;
    realDebrid
      .getUserInfo(apiKey)
      .then(info => {
        if (active) setUser(info);
      })
      .catch(err => {
        if (active) setUserError(err.message);
      });
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      activeKey.current = null;
      clearInterval(timer);
    };
  }, [apiKey, refresh]);

  const run = async action => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (item, link, filename) => {
    const result = await realDebrid.unrestrictLink(link, apiKey);
    const stored = JSON.parse(localStorage.getItem("realDebridGameData") || "{}");
    const game = stored[itemKey(item)] || {
      game: filename || item.filename,
      size: "",
      download_links: {},
    };
    // Use the usual download page for space, existing-install and queue checks.
    navigate("/download", {
      state: {
        gameData: game,
        browserDownload: { id: crypto.randomUUID(), url: result.download },
      },
    });
  };

  const sendToPc = (item, link, filename, id) =>
    run(async () => {
      setWorking(id);
      try {
        await download(item, link, filename);
      } finally {
        setWorking(null);
      }
    });

  const toggleFiles = item =>
    run(async () => {
      const key = itemKey(item);
      if (files[key]) {
        setFiles(current => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        return;
      }
      const info = await realDebrid.getTorrentInfo(apiKey, item.id);
      const selected = info.files.filter(file => file.selected);
      setFiles(current => ({
        ...current,
        [key]: info.links.map((link, index) => ({
          link,
          name:
            (selected.length === info.links.length && selected[index]?.path) ||
            `${item.filename} (${index + 1})`,
        })),
      }));
    });

  const remove = item =>
    run(async () => {
      await realDebrid.deleteDownload(apiKey, item);
      setFiles(current => {
        const next = { ...current };
        delete next[itemKey(item)];
        return next;
      });
      await refresh();
    });

  const describe = item => {
    const sent = Boolean(metadata[itemKey(item)]?.localDownloadStarted);
    if (item.type === "download")
      return { group: "ready", tone: "ready", status: t("debrid.statusReady") };
    if (sent) return { group: "sent", tone: "done", status: t("debrid.statusSent") };
    if (item.status === "downloaded")
      return { group: "ready", tone: "ready", status: t("debrid.statusReady") };
    if (FAILED.has(item.status))
      return { group: "cloud", tone: "error", status: t("debrid.statusFailed") };
    if (item.status === "waiting_files_selection")
      return { group: "cloud", tone: "waiting", status: t("debrid.statusWaitingFiles") };
    if (ACTIVE.has(item.status))
      return { group: "cloud", tone: "active", status: t("debrid.statusDownloading") };
    return { group: "cloud", tone: "waiting", status: t("debrid.statusQueued") };
  };

  const described = (items || []).map(item => ({ item, ...describe(item) }));
  const counts = { ready: 0, cloud: 0, sent: 0 };
  for (const entry of described) counts[entry.group]++;
  const visible = described.filter(entry => entry.group === tab);
  const premiumDays = user?.premium ? Math.floor(user.premium / 86400) : null;
  const empty = {
    ready: ["debrid.emptyReady", "debrid.emptyReadyDesc"],
    cloud: ["debrid.emptyCloud", "debrid.emptyCloudDesc"],
    sent: ["debrid.emptySent", "debrid.emptySentDesc"],
  }[tab];

  if (!apiKey) return <DebridEmpty title={t("realDebrid.missingKey")} />;

  return (
    <div className="space-y-6">
      <DebridAccountBar
        provider={realDebridProvider}
        account={user?.username}
        badge={user?.type}
        detail={
          user?.expiration
            ? t("debrid.expires", {
                date: new Date(user.expiration).toLocaleDateString(),
              })
            : user?.email
        }
        stats={
          user
            ? [
                [t("debrid.points"), (user.points ?? 0).toLocaleString()],
                ...(premiumDays != null
                  ? [[t("debrid.premiumLeft"), t("debrid.days", { count: premiumDays })]]
                  : []),
              ]
            : []
        }
        loading={!user && !userError}
        error={userError}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await refresh();
          setRefreshing(false);
        }}
      />

      <DebridTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "ready", label: t("debrid.tabReady"), count: counts.ready },
          { id: "cloud", label: t("debrid.tabCloud"), count: counts.cloud },
          { id: "sent", label: t("debrid.tabSent"), count: counts.sent },
        ]}
      />

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {items === null ? (
        <DebridLoading label={t("debrid.loadingDownloads")} />
      ) : visible.length === 0 ? (
        <DebridEmpty title={t(empty[0])} description={t(empty[1])} />
      ) : (
        <DebridList key={tab}>
          {visible.map(({ item, tone, status }) => {
            const key = itemKey(item);
            const isTorrent = item.type === "torrent";
            const size = formatBytes(isTorrent ? item.bytes : item.filesize);
            const speed =
              tone === "active" && item.speed ? formatBytes(item.speed) : null;
            const meta = [size, speed && `${speed}/s`, isTorrent ? null : item.host]
              .filter(Boolean)
              .join(" · ");
            let action = null;
            if (!isTorrent) {
              action = (
                <DebridAction
                  state={working === key ? "working" : "idle"}
                  icon={Download}
                  label={t("debrid.downloadToPc")}
                  workingLabel={t("debrid.preparing")}
                  disabled={busy}
                  onClick={() => sendToPc(item, item.link, item.filename, key)}
                />
              );
            } else if (tone === "done") {
              action = (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/downloads")}
                >
                  {t("debrid.viewDownload")}
                </Button>
              );
            } else if (item.status === "waiting_files_selection") {
              action = (
                <Button
                  size="sm"
                  className="text-secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await realDebrid.selectFiles(apiKey, item.id);
                      await refresh();
                    })
                  }
                >
                  {t("debrid.startCloud")}
                </Button>
              );
            } else if (tone === "ready") {
              action = (
                <Button
                  size="sm"
                  variant={files[key] ? "outline" : "default"}
                  className={files[key] ? undefined : "text-secondary"}
                  disabled={busy}
                  onClick={() => toggleFiles(item)}
                >
                  {t(files[key] ? "debrid.hideFiles" : "debrid.chooseFiles")}
                </Button>
              );
            }
            return (
              <DebridItem
                key={key}
                name={item.filename}
                kind={t(isTorrent ? "debrid.kindTorrent" : "debrid.kindLink")}
                status={status}
                tone={tone}
                progress={isTorrent && tone !== "ready" ? item.progress || 0 : undefined}
                meta={meta}
                action={action}
                menu={[
                  ...(!isTorrent && item.download
                    ? [
                        {
                          label: t("debrid.openLink"),
                          icon: ExternalLink,
                          onClick: () => window.electron.openURL(item.download),
                        },
                      ]
                    : []),
                  {
                    label: t("debrid.delete"),
                    icon: Trash2,
                    destructive: true,
                    disabled: busy,
                    onClick: () => remove(item),
                  },
                ]}
              >
                {files[key] && (
                  <ul className="ml-14 mt-3 space-y-1 rounded-lg border border-border/50 bg-background/40 p-2">
                    {files[key].map(file => (
                      <li
                        key={file.link}
                        className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <span className="min-w-0 truncate text-muted-foreground">
                          {file.name}
                        </span>
                        <DebridAction
                          variant="ghost"
                          className="h-7 shrink-0"
                          state={working === file.link ? "working" : "idle"}
                          icon={Download}
                          label={t("debrid.downloadToPc")}
                          workingLabel={t("debrid.preparing")}
                          disabled={busy}
                          onClick={() =>
                            sendToPc(
                              item,
                              file.link,
                              file.name.split("/").pop(),
                              file.link
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </DebridItem>
            );
          })}
        </DebridList>
      )}
    </div>
  );
}
