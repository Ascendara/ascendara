import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import TorboxIcon from "@/components/TorboxIcon";
import { useLanguage } from "@/context/LanguageContext";
import { VERIFIED_PROVIDERS } from "@/config/providers";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpFromLine,
  BadgeCheckIcon,
  CheckIcon,
  CopyIcon,
  Download,
  ExternalLink,
  FileX,
  Loader,
  Puzzle,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";

const getProviderLabel = (provider, prioritizeTorbox) => {
  switch (provider.toLowerCase()) {
    case "gofile":
      return prioritizeTorbox ? "GoFile" : "Seamless (GoFile)";
    case "pixeldrain":
      return prioritizeTorbox ? "PixelDrain" : "Seamless (PixelDrain)";
    case "buzzheavier":
      return "Seamless (BuzzHeavier)";
    case "megadb":
      return "MegaDB";
    case "qiwi":
      return "QIWI";
    case "datanodes":
      return "DataNodes";
    case "fileditch":
    case "fileditchfiles":
      return "FileDitch";
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
};

function Warning({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-500">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function StepList({ steps }) {
  return (
    <ol className="space-y-2.5 text-xs text-muted-foreground">
      {steps.map((step, index) => (
        <li key={index} className="flex items-start gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {index + 1}
          </span>
          <span className="pt-0.5 leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  );
}

const FILES_UNAVAILABLE_DOCS_URL =
  "https://ascendara.app/docs/troubleshooting/common-issues#game-files-are-not-available";

/**
 * Shown instead of the download card when a game has no download links at all,
 * which means its files were taken down because they no longer work.
 */
function FilesUnavailable() {
  const { t } = useLanguage();
  return (
    <section className="rounded-xl bg-card p-5 shadow">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10">
          <FileX className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight text-foreground">
            {t("download.filesUnavailable.title")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("download.filesUnavailable.description")}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
        {["onlineFix", "notWorking", "removed"].map(reason => (
          <li key={reason} className="flex items-start gap-2.5">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500/70" />
            <span className="leading-relaxed">
              {t(`download.filesUnavailable.reasons.${reason}`)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {t("download.filesUnavailable.checkBack")}
      </div>

      <button
        onClick={() => window.electron.openURL(FILES_UNAVAILABLE_DOCS_URL)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        {t("download.filesUnavailable.learnMore")}
        <ExternalLink className="h-3 w-3 shrink-0" />
      </button>
    </section>
  );
}

/**
 * The download card on the game page. `mode` decides which flow is shown:
 * "fitgirl" | "torrent" | "seamless" | "manual".
 */
export default function DownloadPanel({
  mode,
  gameData,
  settings,
  providers,
  selectedProvider,
  onProviderChange,
  torboxAvailable,
  torboxDisabledForSession,
  onTorboxDisabledChange,
  torboxEnabled,
  torrentRunning,
  isStartingDownload,
  isDev,
  providerLink,
  showCopySuccess,
  onCopyLink,
  onOpenInBrowser,
  useAscendara,
  onUseAscendaraChange,
  inputLink,
  onInputChange,
  isValidLink,
  onDownload,
  canRetryBrowserLink,
  onRetryBrowserLink,
  showBrowserDownloadTip,
  onBrowserDownloadTipChange,
  filesUnavailable,
  linkStage,
}) {
  const { t } = useLanguage();
  if (filesUnavailable) return <FilesUnavailable />;

  const usingTorbox = torboxAvailable && !torboxDisabledForSession;
  const opensInBrowser =
    selectedProvider === "buzzheavier" || selectedProvider === "megadb";
  // Buzzheavier downloads in a hidden window, so only MegaDB needs the click tip
  const showsBrowserTip = selectedProvider === "megadb";
  const isTorrentMode = mode === "fitgirl" || mode === "torrent";

  const header = {
    fitgirl: {
      icon: <ArrowDownCircle className="h-5 w-5 text-primary" />,
      title: "FitGirl Repacks",
      description: t("download.downloadOptions.torrentInstructions.description"),
    },
    torrent: {
      icon: <ArrowDownCircle className="h-5 w-5 text-primary" />,
      title:
        t("download.downloadOptions.torrentInstructions.title") || "Torrent Download",
      description: t("download.downloadOptions.torrentInstructions.description"),
    },
    seamless: usingTorbox
      ? {
          icon: <TorboxIcon className="h-5 w-5 text-primary" />,
          title: t("download.downloadOptions.torboxInstructions.title"),
          description: t("download.downloadOptions.torboxInstructions.description"),
        }
      : {
          icon: <Zap fill="currentColor" className="h-5 w-5 text-primary" />,
          title: t("download.downloadOptions.seamlessInstructions.title"),
          description: t("download.downloadOptions.seamlessInstructions.description"),
        },
    manual: {
      icon: <Download className="h-5 w-5 text-primary" />,
      title: t("download.downloadOptions.downloadOptions"),
      description: null,
    },
  }[mode];

  const downloadDisabled =
    mode === "fitgirl"
      ? isStartingDownload || !torrentRunning
      : mode === "torrent"
        ? isStartingDownload || !settings.torrentEnabled || !torrentRunning
        : mode === "seamless"
          ? isStartingDownload || !!linkStage
          : isStartingDownload || !selectedProvider || !inputLink || !isValidLink;

  const linkStageLabel = {
    opening: t("download.downloadOptions.openingDownloadPage"),
    resolving: t("download.downloadOptions.gettingDownloadLink"),
    starting: t("download.downloadOptions.startingDownload"),
  }[linkStage];

  const downloadLabel = linkStageLabel ? (
    <>
      {linkStageLabel}
      <Loader className="ml-2 h-4 w-4 animate-spin" />
    </>
  ) : isStartingDownload ? (
    <>
      {isTorrentMode
        ? t("download.sendingTorrent")
        : t("download.downloadOptions.downloading")}
      <Loader className="ml-2 h-4 w-4 animate-spin" />
    </>
  ) : isTorrentMode ? (
    t("download.downloadOptions.downloadTorrent")
  ) : gameData.isUpdating ? (
    <>
      {t("gameCard.update")}
      <ArrowUpFromLine className="ml-2 h-4 w-4 stroke-[3]" />
    </>
  ) : (
    t("download.downloadOptions.downloadNow")
  );

  const downloadButton = (
    <Button
      onClick={mode === "seamless" && opensInBrowser ? onOpenInBrowser : onDownload}
      disabled={downloadDisabled}
      className="h-12 w-full text-base font-semibold text-secondary"
    >
      {downloadLabel}
    </Button>
  );

  return (
    <div className="space-y-3">
      <section className="rounded-xl bg-card p-5 shadow">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            {header.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight text-foreground">
              {header.title}
            </h2>
            {header.description && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {header.description}
              </p>
            )}
          </div>
          {isDev && mode === "manual" && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => window.electron.openURL(gameData.dirlink)}
            >
              (DEV) Direct Link
            </Button>
          )}
        </div>

        <div className="mt-5 space-y-4">
          {/* Provider selection */}
          {mode !== "fitgirl" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("download.downloadOptions.downloadSource")}
              </Label>
              {providers.length > 0 ? (
                <Select value={selectedProvider} onValueChange={onProviderChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={t("download.downloadOptions.selectProvider")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map(provider => (
                      <SelectItem key={provider} value={provider}>
                        <div className="flex items-center gap-2">
                          {getProviderLabel(
                            provider,
                            settings.prioritizeTorboxOverSeamless
                          )}
                          {VERIFIED_PROVIDERS.includes(provider.toLowerCase()) && (
                            <BadgeCheckIcon className="h-4 w-4" />
                          )}
                          {provider === "1fichier" && torboxEnabled && (
                            <TorboxIcon className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("download.downloadOptions.noProviders")}
                </p>
              )}
            </div>
          )}

          {/* Torrent flows */}
          {mode === "torrent" && !settings.torrentEnabled && (
            <Warning>
              {t("download.toast.torrentDisabled") ||
                "Enable torrenting in Settings to download this game."}
            </Warning>
          )}
          {isTorrentMode &&
            (mode === "fitgirl" || settings.torrentEnabled) &&
            !torrentRunning && (
              <Warning>
                {t("download.downloadOptions.torrentInstructions.noTorrent")}
              </Warning>
            )}
          {isTorrentMode && downloadButton}

          {/* Seamless / TorBox flow */}
          {mode === "seamless" && (
            <>
              {showsBrowserTip && (
                <div className="rounded-lg bg-primary/5 p-3 text-sm text-primary">
                  {t("download.downloadOptions.buzzheavierReminder")}
                </div>
              )}
              {downloadButton}
              {torboxAvailable && (
                <button
                  onClick={() => onTorboxDisabledChange(!torboxDisabledForSession)}
                  className="block w-full text-center text-xs text-muted-foreground underline transition-colors hover:text-foreground"
                >
                  {torboxDisabledForSession
                    ? t("download.downloadOptions.torboxInstructions.enableForDownload")
                    : t("download.downloadOptions.torboxInstructions.disableForDownload")}
                </button>
              )}
            </>
          )}

          {/* Manual flow */}
          {mode === "manual" && !selectedProvider && providers.length > 0 && (
            <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {t("download.downloadOptions.selectProviderPrompt")}
              </p>
            </div>
          )}
          {mode === "manual" && selectedProvider && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t("download.downloadOptions.downloadLink")}
                </Label>
                <div className="flex items-center gap-2">
                  <div
                    className="group flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-between rounded-md border border-border/50 bg-muted/50 px-3 text-sm transition-colors hover:bg-muted"
                    onClick={onCopyLink}
                  >
                    <span className="truncate text-muted-foreground">
                      {providerLink || t("download.downloadOptions.noDownloadLink")}
                    </span>
                    {showCopySuccess ? (
                      <CheckIcon className="ml-2 h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <CopyIcon className="ml-2 h-4 w-4 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={onOpenInBrowser}
                    className="shrink-0 px-3"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
                <div className="space-y-0.5">
                  <Label htmlFor="ascendara-handler" className="text-sm font-medium">
                    {t("download.downloadOptions.ascendaraHandler")}
                  </Label>
                  {!useAscendara && (
                    <p
                      className="cursor-pointer text-xs text-primary hover:underline"
                      onClick={() =>
                        window.electron.openURL("https://ascendara.app/extension")
                      }
                    >
                      {t("download.downloadOptions.getExtension")}
                    </p>
                  )}
                </div>
                <Switch
                  id="ascendara-handler"
                  checked={useAscendara}
                  onCheckedChange={onUseAscendaraChange}
                />
              </div>

              {useAscendara ? (
                <div className="flex items-center justify-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-4 text-muted-foreground">
                  <Loader className="h-4 w-4 shrink-0 animate-spin" />
                  <span className="text-sm">
                    {isStartingDownload
                      ? t("download.downloadOptions.startingDownload")
                      : t("download.downloadOptions.waitingForBrowser")}
                  </span>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Input
                      placeholder={t("download.downloadOptions.pasteLink")}
                      value={inputLink}
                      onChange={onInputChange}
                      className={!isValidLink ? "border-red-500" : ""}
                    />
                    {!isValidLink && (
                      <p className="text-xs text-red-500">
                        {t("download.downloadOptions.invalidLink")} {selectedProvider}
                      </p>
                    )}
                  </div>
                  {downloadButton}
                </>
              )}

              <div className="border-t border-border/40 pt-4">
                <StepList
                  steps={(useAscendara ? [1, 2, 3] : [1, 2, 3, 4, 5, 6]).map(step =>
                    t(
                      `download.downloadOptions.${useAscendara ? "handlerInstructions" : "manualInstructions"}.step${step}`
                    )
                  )}
                />
              </div>

              {selectedProvider !== "gofile" && (
                <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold leading-tight text-foreground">
                      {t("download.protectYourself.warningTitle")}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t("download.protectYourself.warning")}
                    </p>
                    <button
                      onClick={() =>
                        window.electron.openURL("https://ascendara.app/protect-yourself")
                      }
                      className="mt-2 inline-flex items-center gap-1.5 text-left text-xs text-primary hover:underline"
                    >
                      {t("download.protectYourself.learnHow")}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {canRetryBrowserLink && (
        <Button
          variant="outline"
          className="w-full gap-2"
          disabled={isStartingDownload}
          onClick={onRetryBrowserLink}
        >
          <ArrowDownCircle className="h-4 w-4" />
          {t("browserDownload.retry")}
        </Button>
      )}

      {showBrowserDownloadTip ? (
        <aside className="flex items-start gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Puzzle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("browserDownload.featureTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("browserDownload.featureDescription")}
            </p>
            <Button
              variant="link"
              className="mt-2 h-auto gap-1.5 p-0 text-xs"
              onClick={() => window.electron.openURL("https://ascendara.app/extension")}
            >
              {t("browserDownload.getExtension")}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={t("browserDownload.dismissTip")}
            onClick={() => onBrowserDownloadTipChange(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </aside>
      ) : (
        <Button
          variant="link"
          className="h-auto gap-1.5 px-0 text-xs text-muted-foreground"
          onClick={() => onBrowserDownloadTipChange(true)}
        >
          <Puzzle className="h-3.5 w-3.5" aria-hidden="true" />
          {t("browserDownload.showTip")}
        </Button>
      )}
    </div>
  );
}
