import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import RealDebridIcon from "@/components/RealDebridIcon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import * as realDebrid from "@/services/downloads/realDebridService";
import { toast } from "sonner";

const itemKey = item => `${item.type}:${item.id}`;

export default function RealDebridDownloads() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState({});
  const [metadata, setMetadata] = useState({});
  const fetching = useRef(false);
  const apiKey = settings.realDebridApiKey;
  const activeKey = useRef(apiKey);

  const refresh = useCallback(async () => {
    if (!apiKey || fetching.current === apiKey) return;
    fetching.current = apiKey;
    try {
      const downloads = await realDebrid.getAllDownloads(apiKey);
      if (activeKey.current !== apiKey) return;
      if (activeKey.current === apiKey) {
        setItems(downloads);
        setMetadata(JSON.parse(localStorage.getItem("realDebridGameData") || "{}"));
        setError("");
      }
    } catch (err) {
      if (activeKey.current === apiKey) setError(err.message);
    } finally {
      if (fetching.current === apiKey) fetching.current = false;
    }
  }, [apiKey]);

  useEffect(() => {
    activeKey.current = apiKey;
    setItems([]);
    setFiles({});
    setUser(null);
    if (!apiKey) return;
    let active = true;
    realDebrid
      .getUserInfo(apiKey)
      .then(info => {
        if (active) setUser(info);
      })
      .catch(err => {
        if (active) setError(err.message);
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

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <RealDebridIcon className="h-8 w-8" />
            {t("realDebrid.title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("realDebrid.description")}</p>
        </div>
        <Button variant="outline" onClick={refresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("realDebrid.refresh")}
        </Button>
      </div>
      {!apiKey ? (
        <p>{t("realDebrid.missingKey")}</p>
      ) : (
        <>
          {user && (
            <Card className="space-y-2 p-5">
              <h2 className="font-semibold">{user.username}</h2>
              <p>
                {user.type} ·{" "}
                {t("realDebrid.expires", {
                  date: new Date(user.expiration).toLocaleDateString(),
                })}
              </p>
            </Card>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {!items.length && !error && (
            <p className="text-muted-foreground">{t("realDebrid.empty")}</p>
          )}
          {items.map(item => (
            <Card key={itemKey(item)} className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{item.filename}</h2>
                  <p className="text-sm text-muted-foreground">
                    {item.type === "torrent"
                      ? item.status?.replaceAll("_", " ")
                      : item.host}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  aria-label={t("realDebrid.delete")}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await realDebrid.deleteDownload(apiKey, item);
                      setFiles(current => {
                        const next = { ...current };
                        delete next[itemKey(item)];
                        return next;
                      });
                      await refresh();
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {item.type === "torrent" && <Progress value={item.progress || 0} />}
              {item.type === "torrent" && item.status === "waiting_files_selection" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await realDebrid.selectFiles(apiKey, item.id);
                      await refresh();
                    })
                  }
                >
                  {t("realDebrid.selectAll")}
                </Button>
              )}
              {item.type === "download" && (
                <Button
                  disabled={busy}
                  onClick={() => run(() => download(item, item.link, item.filename))}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t("realDebrid.download")}
                </Button>
              )}
              {item.type === "torrent" &&
                metadata[itemKey(item)]?.localDownloadStarted && (
                  <Button onClick={() => navigate("/downloads")}>
                    {t("realDebrid.viewLocalDownload")}
                  </Button>
                )}
              {item.type === "torrent" &&
                item.status === "downloaded" &&
                !metadata[itemKey(item)]?.localDownloadStarted && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const info = await realDebrid.getTorrentInfo(apiKey, item.id);
                          const selected = info.files.filter(file => file.selected);
                          setFiles(current => ({
                            ...current,
                            [itemKey(item)]: info.links.map((link, index) => ({
                              link,
                              name:
                                (selected.length === info.links.length &&
                                  selected[index]?.path) ||
                                `${item.filename} (${index + 1})`,
                            })),
                          }));
                        })
                      }
                    >
                      {t("realDebrid.showFiles")}
                    </Button>
                    {files[itemKey(item)]?.map(file => (
                      <div
                        key={file.link}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="truncate">{file.name}</span>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              download(item, file.link, file.name.split("/").pop())
                            )
                          }
                        >
                          {t("realDebrid.download")}
                        </Button>
                      </div>
                    ))}
                  </>
                )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
