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
import DebridIcon from "@/components/DebridIcon";
import { useLanguage } from "@/context/LanguageContext";
import { VERIFIED_PROVIDERS } from "@/config/providers";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpFromLine,
  CheckIcon,
  ChevronDown,
  CopyIcon,
  Download,
  ExternalLink,
  FileX,
  Link2,
  Loader,
  Magnet,
  Puzzle,
  TriangleAlert,
  WandSparkles,
  X,
} from "lucide-react";
import AdDodgerGame from "@/components/download/AdDodgerGame";
import DownloadButton from "@/components/download/DownloadButton";
import { AnimatePresence, motion } from "framer-motion";
import MagicLinkDialog from "@/components/download/MagicLinkDialog";

const getProviderLabel = provider => {
  switch (provider.toLowerCase()) {
    case "gofile":
      return "GoFile";
    case "pixeldrain":
      return "PixelDrain";
    case "buzzheavier":
      return "BuzzHeavier";
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

const isMagicProvider = provider => VERIFIED_PROVIDERS.includes(provider.toLowerCase());

/**
 * Seconds left until `endsAt` and how far along the wait is (0-1), ticking a
 * few times a second; both null without a countdown.
 */
function useCountdown(endsAt) {
  const startedAt = useRef(null);
  const read = () => {
    if (!endsAt) return { seconds: null, progress: null };
    const total = Math.max(1, endsAt - (startedAt.current ?? Date.now()));
    const left = Math.max(0, endsAt - Date.now());
    return { seconds: Math.ceil(left / 1000), progress: 1 - left / total };
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    startedAt.current = endsAt ? Date.now() : null;
    setState(read());
    if (!endsAt) return;
    const timer = setInterval(() => setState(read()), 200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);
  return state;
}

function Notice({ tone = "warning", icon: Icon = AlertTriangle, children }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs leading-relaxed",
        tone === "warning" && "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
        tone === "info" && "bg-primary/5 text-primary"
      )}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function SectionLabel({ children, htmlFor }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </Label>
  );
}

/** The Magic chip on a source. Clicking it explains Magic Links, not picking the source. */
function MagicChip({ onInfo }) {
  const { t } = useLanguage();
  return (
    <span
      role="button"
      tabIndex={0}
      title={t("download.magicLink.whatIsThis")}
      aria-label={t("download.magicLink.whatIsThis")}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
      onClick={event => {
        event.stopPropagation();
        onInfo();
      }}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onInfo();
        }
      }}
    >
      <WandSparkles className="h-3 w-3" />
      {t("download.downloadOptions.magicBadge")}
    </span>
  );
}

function SourceList({
  providers,
  selectedProvider,
  onProviderChange,
  debridAvailable,
  debridProvider,
  onMagicInfo,
}) {
  const { t } = useLanguage();
  return (
    <div
      role="radiogroup"
      aria-label={t("download.downloadOptions.downloadSource")}
      className="space-y-1.5"
    >
      {providers.map(provider => {
        const selected = provider === selectedProvider;
        return (
          <div
            key={provider}
            role="radio"
            aria-checked={selected}
            tabIndex={0}
            onClick={() => onProviderChange(provider)}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onProviderChange(provider);
              }
            }}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary/60 bg-primary/5"
                : "border-border/50 hover:border-border hover:bg-muted/40"
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                selected ? "border-primary" : "border-muted-foreground/40"
              )}
            >
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                selected ? "font-semibold text-foreground" : "text-foreground/90"
              )}
            >
              {getProviderLabel(provider)}
            </span>
            {selected && debridAvailable && debridProvider && (
              <DebridIcon provider={debridProvider} className="h-4 w-4 shrink-0" />
            )}
            {provider.toLowerCase() === "torrent" ? (
              <Magnet className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              isMagicProvider(provider) && <MagicChip onInfo={onMagicInfo} />
            )}
          </div>
        );
      })}
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
    <section className="overflow-hidden rounded-xl bg-card shadow">
      <div className="h-1 bg-yellow-500/60" />
      <div className="p-5">
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
      </div>
    </section>
  );
}

/**
 * The download card on the game page. `mode` decides which flow is shown:
 * "fitgirl" | "torrent" | "seamless" (Magic Link or debrid) | "manual".
 */
export default function DownloadPanel({
  mode,
  gameData,
  settings,
  providers,
  selectedProvider,
  onProviderChange,
  debridProvider,
  debridAvailable,
  cloudTorrent,
  debridPick,
  debridPickOptions,
  onDebridPickChange,
  debridPickUnsupported,
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
  countdownEndsAt,
}) {
  const { t } = useLanguage();
  const countdown = useCountdown(linkStage === "countdown" ? countdownEndsAt : null);
  const [showMagicInfo, setShowMagicInfo] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  if (filesUnavailable) return <FilesUnavailable />;

  const usingDebrid = debridAvailable && debridPick !== "none";
  const opensInBrowser =
    !usingDebrid && (selectedProvider === "buzzheavier" || selectedProvider === "megadb");
  const isTorrentMode = mode === "fitgirl" || mode === "torrent";
  const isMagic = mode === "seamless" && !usingDebrid;
  const openMagicInfo = () => setShowMagicInfo(true);

  const header = {
    fitgirl: {
      icon: <ArrowDownCircle className="h-5 w-5" />,
      title: "FitGirl Repacks",
      description: t("download.downloadOptions.torrentInstructions.description"),
    },
    torrent: {
      icon: <Magnet className="h-5 w-5" />,
      title:
        t("download.downloadOptions.torrentInstructions.title") || "Torrent Download",
      description: t("download.downloadOptions.torrentInstructions.description"),
    },
    seamless: usingDebrid
      ? {
          icon: <DebridIcon provider={debridProvider} className="h-5 w-5" />,
          title: debridProvider.name,
          description: t("debrid.hostInstructions", { provider: debridProvider.name }),
        }
      : {
          icon: <WandSparkles className="h-5 w-5" />,
          title: t("download.downloadOptions.magicInstructions.title"),
          description: t("download.downloadOptions.magicInstructions.description"),
          onIconClick: openMagicInfo,
        },
    manual: {
      icon: <Link2 className="h-5 w-5" />,
      title: t("download.downloadOptions.downloadOptions"),
      description: t("download.downloadOptions.manualDescription"),
    },
  }[mode];

  const downloadDisabled =
    debridPickUnsupported ||
    (isTorrentMode && cloudTorrent
      ? isStartingDownload
      : mode === "fitgirl"
        ? isStartingDownload || !torrentRunning
        : mode === "torrent"
          ? isStartingDownload || !settings.torrentEnabled || !torrentRunning
          : mode === "seamless"
            ? isStartingDownload || !!linkStage
            : isStartingDownload || !selectedProvider || !inputLink || !isValidLink);

  const stepLabels = {
    opening: t("download.downloadOptions.openingDownloadPage"),
    countdown: t("download.downloadOptions.waitingForCountdown"),
    resolving: t("download.downloadOptions.gettingDownloadLink"),
    starting: t("download.downloadOptions.startingDownload"),
  };
  const linkStageLabel = stepLabels[linkStage];

  const busy = !!linkStageLabel || isStartingDownload;
  // Something to do during MegaDB's countdown and the other waits
  const showGame = isMagic && !!linkStageLabel;
  const buttonStage = linkStageLabel ? linkStage : isStartingDownload ? "busy" : "idle";
  const downloadLabel = isStartingDownload
    ? isTorrentMode
      ? t("download.sendingTorrent")
      : t("download.downloadOptions.downloading")
    : isTorrentMode
      ? t("download.downloadOptions.downloadTorrent")
      : gameData.isUpdating
        ? t("gameCard.update")
        : t("download.downloadOptions.downloadNow");

  const downloadButton = (
    <DownloadButton
      stage={buttonStage}
      label={downloadLabel}
      stepLabels={stepLabels}
      icon={gameData.isUpdating ? ArrowUpFromLine : isTorrentMode ? Magnet : Download}
      onClick={mode === "seamless" && opensInBrowser ? onOpenInBrowser : onDownload}
      disabled={downloadDisabled}
      countdown={countdown}
      showSteps={isMagic}
      hasCountdownStep={selectedProvider === "megadb"}
    />
  );

  const showSources = mode !== "fitgirl" && providers.length > 0;

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl bg-card shadow">
        {/* Accent: Magic Links get the brand gradient */}
        <div
          className={cn(
            "h-1",
            isMagic
              ? "bg-gradient-to-r from-primary via-primary/60 to-primary"
              : "bg-primary/30"
          )}
        />

        {/* Header */}
        <div
          className={cn(
            "flex items-start gap-3 px-5 pb-4 pt-4",
            isMagic && "bg-gradient-to-b from-primary/[0.06] to-transparent"
          )}
        >
          {header.onIconClick ? (
            <button
              type="button"
              onClick={header.onIconClick}
              title={t("download.magicLink.whatIsThis")}
              aria-label={t("download.magicLink.whatIsThis")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors hover:bg-primary/25"
            >
              {header.icon}
            </button>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {header.icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight text-foreground">
              {header.title}
            </h2>
            {header.description && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {header.description}
              </p>
            )}
            {isMagic && (
              <button
                type="button"
                onClick={openMagicInfo}
                className="mt-1.5 text-xs font-medium text-primary hover:underline"
              >
                {t("download.magicLink.whatIsThis")}
              </button>
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

        <div className="space-y-4 border-t border-border/40 px-5 py-4">
          {/* Sources, swapped for a mini game while a Magic Link is prepared */}
          <AnimatePresence mode="wait" initial={false}>
            {showGame ? (
              <motion.div
                key="game"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <AdDodgerGame />
              </motion.div>
            ) : (
              mode !== "fitgirl" && (
                <motion.div
                  key="sources"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-2 overflow-hidden"
                >
                  <SectionLabel>
                    {t("download.downloadOptions.downloadSource")}
                  </SectionLabel>
                  {showSources ? (
                    <SourceList
                      providers={providers}
                      selectedProvider={selectedProvider}
                      onProviderChange={onProviderChange}
                      debridAvailable={debridAvailable}
                      debridProvider={debridProvider}
                      onMagicInfo={openMagicInfo}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("download.downloadOptions.noProviders")}
                    </p>
                  )}
                </motion.div>
              )
            )}
          </AnimatePresence>

          {/* Debrid service for this download only; never changes the saved order */}
          {!showGame && debridPickOptions?.length > 2 && (
            <div className="space-y-2">
              <SectionLabel>{t("debrid.pickLabel")}</SectionLabel>
              <Select value={debridPick} onValueChange={onDebridPickChange}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {debridPickOptions.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.id === "default"
                        ? t("debrid.pickDefault")
                        : option.id === "none"
                          ? t("debrid.pickNone")
                          : option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {debridPickUnsupported && (
                <Notice>
                  {t("debrid.pickUnsupported", {
                    provider: debridPickOptions.find(option => option.id === debridPick)
                      ?.name,
                  })}
                </Notice>
              )}
            </div>
          )}

          {/* Torrent flows */}
          {mode === "torrent" && !cloudTorrent && !settings.torrentEnabled && (
            <Notice>
              {t("download.toast.torrentDisabled") ||
                "Enable torrenting in Settings to download this game."}
            </Notice>
          )}
          {isTorrentMode &&
            !cloudTorrent &&
            (mode === "fitgirl" || settings.torrentEnabled) &&
            !torrentRunning && (
              <Notice>
                {t("download.downloadOptions.torrentInstructions.noTorrent")}
              </Notice>
            )}
          {isTorrentMode && cloudTorrent && (
            <Notice tone="info" icon={Magnet}>
              {t("debrid.torrentVia", { provider: debridProvider?.name })}
            </Notice>
          )}

          {/* Manual flow */}
          {mode === "manual" && selectedProvider && (
            <>
              <div className="space-y-2">
                <SectionLabel>{t("download.downloadOptions.downloadLink")}</SectionLabel>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="group flex h-9 min-w-0 flex-1 items-center justify-between rounded-md bg-muted/50 px-3 text-left text-sm transition-colors hover:bg-muted"
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
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenInBrowser}
                    className="h-9 shrink-0 px-3"
                    aria-label={t("download.downloadOptions.openInBrowser")}
                    title={t("download.downloadOptions.openInBrowser")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="ascendara-handler" className="text-sm font-medium">
                    {t("download.downloadOptions.ascendaraHandler")}
                  </Label>
                  {!useAscendara && (
                    <button
                      type="button"
                      className="block text-xs text-primary hover:underline"
                      onClick={() =>
                        window.electron.openURL("https://ascendara.app/extension")
                      }
                    >
                      {t("download.downloadOptions.getExtension")}
                    </button>
                  )}
                </div>
                <Switch
                  id="ascendara-handler"
                  checked={useAscendara}
                  onCheckedChange={onUseAscendaraChange}
                />
              </div>

              {useAscendara ? (
                <div className="flex items-center justify-center gap-2.5 rounded-lg border border-dashed border-border/60 px-4 py-4 text-muted-foreground">
                  <Loader className="h-4 w-4 shrink-0 animate-spin" />
                  <span className="text-sm">
                    {isStartingDownload
                      ? t("download.downloadOptions.startingDownload")
                      : t("download.downloadOptions.waitingForBrowser")}
                  </span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Input
                    placeholder={t("download.downloadOptions.pasteLink")}
                    value={inputLink}
                    onChange={onInputChange}
                    className={cn("h-9", !isValidLink && "border-red-500")}
                  />
                  {!isValidLink && (
                    <p className="text-xs text-red-500">
                      {t("download.downloadOptions.invalidLink")} {selectedProvider}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {mode === "manual" && !selectedProvider && providers.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              {t("download.downloadOptions.selectProviderPrompt")}
            </p>
          )}

          {/* Action */}
          {(isTorrentMode ||
            mode === "seamless" ||
            (mode === "manual" && selectedProvider && !useAscendara)) &&
            downloadButton}

          {isMagic && !busy && (
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <WandSparkles className="h-3 w-3 text-primary" />
              {t("download.downloadOptions.magicFooter")}
            </p>
          )}
        </div>

        {/* Manual: how-to and safety, folded away until wanted */}
        {mode === "manual" && selectedProvider && (
          <div className="border-t border-border/40">
            <button
              type="button"
              onClick={() => setShowSteps(open => !open)}
              aria-expanded={showSteps}
              className="flex w-full items-center justify-between px-5 py-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("download.downloadOptions.howToDownload")}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", showSteps && "rotate-180")}
              />
            </button>
            {showSteps && (
              <div className="px-5 pb-4">
                <StepList
                  steps={(useAscendara ? [1, 2, 3] : [1, 2, 3, 4, 5, 6]).map(step =>
                    t(
                      `download.downloadOptions.${useAscendara ? "handlerInstructions" : "manualInstructions"}.step${step}`
                    )
                  )}
                />
              </div>
            )}

            {selectedProvider !== "gofile" && (
              <div className="flex items-start gap-3 border-t border-border/40 bg-yellow-500/[0.04] px-5 py-3.5">
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
          </div>
        )}
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
        <aside className="flex items-start gap-3 rounded-xl bg-card p-4 shadow">
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

      <MagicLinkDialog open={showMagicInfo} onOpenChange={setShowMagicInfo} />
    </div>
  );
}
