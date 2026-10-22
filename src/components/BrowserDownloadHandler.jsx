import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { parseBrowserDownload, parseBrowserDownloadTitle } from "@/lib/browserDownload";
import { sanitizeText } from "@/lib/utils";
import {
  addToQueue,
  processNextInQueue,
} from "@/services/downloads/downloadQueueService";
import BrowserDownloadArtwork from "@/components/BrowserDownloadArtwork";
import { SelectPathDialog } from "@/components/download/DownloadDialogs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

export default function BrowserDownloadHandler() {
  const location = useLocation();
  const { t } = useTranslation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const [requests, setRequests] = useState([]);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [artwork, setArtwork] = useState(null);
  const [logoId, setLogoId] = useState(null);
  const [online, setOnline] = useState(false);
  const [dlc, setDlc] = useState(false);
  const [downloadSettings, setDownloadSettings] = useState({
    downloadDirectory: "",
    additionalDirectories: [],
  });
  const [showPathDialog, setShowPathDialog] = useState(false);
  const request = requests[0];
  const isNewGame =
    !request?.game || sanitizeText(name) !== sanitizeText(request.game.game);
  const suggestedName =
    parseBrowserDownloadTitle(request?.title).name ||
    request?.filename?.replace(/\.(zip|rar|7z|exe)$/i, "") ||
    "";
  useEffect(() => {
    let active = true;
    window.electron
      .getSettings()
      .then(settings => {
        if (!active) return;
        setDownloadSettings({
          downloadDirectory: settings?.downloadDirectory || "",
          additionalDirectories: Array.isArray(settings?.additionalDirectories)
            ? settings.additionalDirectories
            : [],
        });
      })
      .catch(error => console.warn("Could not load download locations:", error));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    const receive = (_event, raw) => {
      if (disposed) return;
      try {
        const download = parseBrowserDownload(raw);
        const current = locationRef.current;
        const game = ["/download", "/gamescreen"].includes(current.pathname)
          ? current.state?.gameData
          : null;
        setRequests(items =>
          items.some(item => item.raw === raw)
            ? items
            : [...items, { ...download, raw, game }]
        );
      } catch {
        toast.error(t("browserDownload.invalid"));
        window.electron.acknowledgeBrowserDownload(raw);
      }
    };
    const unsubscribe = window.electron.onProtocolDownloadUrl(receive);
    window.electron
      .getPendingBrowserDownloads()
      .then(urls => urls.forEach(url => receive(null, url)))
      .catch(() => toast.error(t("browserDownload.invalid")));
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [t]);
  useEffect(() => {
    const title = parseBrowserDownloadTitle(request?.title);
    setVersion(request?.game ? "" : title.version);
    setArtwork(null);
    setLogoId(null);
    setOnline(!request?.game && title.online);
    setDlc(false);
    setName(
      request?.game?.game ||
        title.name ||
        request?.filename?.replace(/\.(zip|rar|7z|exe)$/i, "") ||
        ""
    );
  }, [request]);
  const dismiss = () => {
    window.electron.acknowledgeBrowserDownload(request.raw);
    setRequests(items => items.slice(1));
  };
  const startDownload = async additionalDirIndex => {
    const gameName = sanitizeText(name.trim());
    if (!gameName || /^\.+$/.test(gameName)) return;
    const existingGame =
      request.game && gameName === sanitizeText(request.game.game) ? request.game : null;
    const gameData = existingGame || {
      game: gameName,
      download_links: {},
      size: "",
      version: version.trim(),
      online,
      dlc,
      browserAssetGameId: artwork?.id ?? null,
    };
    try {
      addToQueue({
        url: request.url,
        gameName,
        online: gameData.online || false,
        dlc: gameData.dlc || false,
        isVr: gameData.category?.includes("Virtual Reality") || false,
        updateFlow: gameData.isUpdating || false,
        version: gameData.version || version.trim(),
        imgID: gameData.imgID || null,
        size: gameData.size || "",
        additionalDirIndex,
        gameID: gameData.gameID || "",
        browserDirect: true,
        browserAssetGameId: artwork?.id ?? gameData.browserAssetGameId ?? null,
        browserAssetLogoId: artwork ? logoId : null,
      });
      const started = await processNextInQueue();
      toast.success(
        t(started ? "download.toast.downloadStarted" : "download.toast.downloadQueued")
      );
      dismiss();
    } catch (error) {
      console.error("Failed to queue browser download:", error);
      toast.error(t("download.toast.downloadFailed"));
    }
  };

  const start = async () => {
    let latestSettings = downloadSettings;
    try {
      const settings = await window.electron.getSettings();
      latestSettings = {
        downloadDirectory: settings?.downloadDirectory || "",
        additionalDirectories: Array.isArray(settings?.additionalDirectories)
          ? settings.additionalDirectories
          : [],
      };
      setDownloadSettings(latestSettings);
    } catch (error) {
      console.warn("Could not refresh download locations:", error);
    }
    if (latestSettings.additionalDirectories.length > 0) {
      setShowPathDialog(true);
      return;
    }
    void startDownload(0);
  };
  if (!request) return null;

  return (
    <>
      <AlertDialog open={!showPathDialog}>
        <AlertDialogContent className="grid-cols-[minmax(0,1fr)] text-foreground sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(isNewGame ? "browserDownload.newGameTitle" : "browserDownload.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                isNewGame
                  ? "browserDownload.newGameDescription"
                  : "browserDownload.description"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Label htmlFor="browser-game-name" className="text-foreground">
            {t("browserDownload.gameName")}
          </Label>
          <Input
            id="browser-game-name"
            value={name}
            onChange={event => setName(event.target.value)}
            maxLength={200}
          />
          {isNewGame && request && (
            <>
              <div className="space-y-2">
                <Label htmlFor="browser-game-version" className="text-foreground">
                  {t("browserDownload.version")}
                </Label>
                <Input
                  id="browser-game-version"
                  value={version}
                  onChange={event => setVersion(event.target.value)}
                  maxLength={100}
                  placeholder={t("browserDownload.versionPlaceholder")}
                />
              </div>
              <div className="flex flex-wrap gap-6">
                <label
                  htmlFor="browser-game-online"
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Switch
                    id="browser-game-online"
                    checked={online}
                    onCheckedChange={setOnline}
                  />
                  {t("browserDownload.online")}
                </label>
                <label
                  htmlFor="browser-game-dlc"
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Switch id="browser-game-dlc" checked={dlc} onCheckedChange={setDlc} />
                  {t("browserDownload.dlc")}
                </label>
              </div>
              <BrowserDownloadArtwork
                key={request.raw}
                initialQuery={suggestedName}
                value={artwork}
                onChange={game => {
                  setArtwork(game);
                  setLogoId(null);
                }}
                selectedLogoId={logoId}
                onLogoChange={setLogoId}
              />
            </>
          )}
          <p className="break-all text-sm text-muted-foreground">
            {request && new URL(request.url).hostname}
            {request?.filename ? ` · ${request.filename}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("browserDownload.limitations")}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={dismiss}>
              {t("browserDownload.cancel")}
            </AlertDialogCancel>
            <Button
              className="text-secondary"
              onClick={start}
              disabled={
                !sanitizeText(name.trim()) || /^\.+$/.test(sanitizeText(name.trim()))
              }
            >
              {t("browserDownload.start")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SelectPathDialog
        open={showPathDialog}
        onOpenChange={setShowPathDialog}
        defaultDirectory={downloadSettings.downloadDirectory}
        additionalDirectories={downloadSettings.additionalDirectories}
        onSelect={dirIndex => {
          setShowPathDialog(false);
          void startDownload(dirIndex);
        }}
      />
    </>
  );
}
