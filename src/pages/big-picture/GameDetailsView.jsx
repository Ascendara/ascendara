import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useGameImage } from "@/hooks/useGameImage";
import steamService from "@/services/games/gameInfoService";
import nexusModsService from "@/services/integrations/nexusModsService";
import flingTrainerService from "@/services/integrations/flingTrainerService";
import installedGamesService from "@/services/library/installedGamesService";
import gameService from "@/services/games/gameService";
import gamePagePreparer from "@/services/games/gamePagePreparer";
import artworkOverrideService from "@/services/images/artworkOverrideService";
import steamGridImageService from "@/services/images/steamGridImageService";
import { findGameDetails } from "@/lib/steamMatch";
import { catalogSizeText } from "@/lib/installSpace";
import {
  Download,
  Info,
  Wifi,
  Check,
  MousePointer,
  RefreshCw,
  Clock,
  Cloud,
  Smartphone,
  ListEnd,
  Puzzle,
  Zap,
  ChevronDown,
  History,
  TriangleAlert,
  Image as ImageIcon,
} from "lucide-react";
import { checkSeamlessAvailable, getInAppProviders } from "./utils";
import { getControllerButtons, getButtonBadgeClass } from "./controller";
import { useMediaSwipe } from "./useMediaSwipe";
import { useControllerInput } from "./useControllerInput";
import { DetailBackButton } from "./DetailBackButton";
import { TimemachineDialog } from "./TimemachineDialog";
import { ScreenshotGallery, getScreenshotColumns } from "./ScreenshotGallery";

const hasAnyLink = links =>
  Object.values(links || {}).some(candidates =>
    (Array.isArray(candidates) ? candidates : [candidates]).some(
      link => typeof link === "string" && link.trim()
    )
  );

// --- GAME DETAILS & STORE COMPONENTS ---
const GameDetailsView = ({
  game,
  onBack,
  onDownload,
  onShowProviderDialog,
  t,
  controllerType,
  dialogOpen = false,
  timemachineEnabled = false,
}) => {
  const [showMedia, setShowMedia] = useState(false);
  const [steamData, setSteamData] = useState(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  // Same preparation as the desktop game page: matched game info, approved
  // artwork overrides and the index/SteamGridDB art
  const [prepared, setPrepared] = useState(null);
  // loading | ready | missing (not on Steam) | failed (Steam not reached)
  const [infoState, setInfoState] = useState("loading");
  const [infoAttempt, setInfoAttempt] = useState(0);
  const buttons = getControllerButtons(controllerType);
  const [focusedSection, setFocusedSection] = useState("button"); // 'button', 'description', 'screenshots', 'provider'
  const [selectedButton, setSelectedButton] = useState(0); // 0 = Download, 1 = Play Later
  const [supportsModManaging, setSupportsModManaging] = useState(false);
  const [supportsFlingTrainer, setSupportsFlingTrainer] = useState(false);
  const [isPlayLater, setIsPlayLater] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const isMounted = useRef(true);

  // An older release picked in the Timemachine, like on the Download page
  const [release, setRelease] = useState(null);
  const [showTimemachine, setShowTimemachine] = useState(false);
  const [isExternalSource, setIsExternalSource] = useState(!!game.customSource);
  const shown = useMemo(
    () =>
      release
        ? {
            ...game,
            ...release.game,
            gameID: game.gameID,
            game: game.game,
            imgID: game.imgID,
            hasHistory: true,
          }
        : game,
    [game, release]
  );

  useEffect(() => {
    setRelease(null);
    setShowTimemachine(false);
    setScreenshotIndex(0);
    setLightboxOpen(false);
  }, [game]);

  // Same rule as the Download page: on Ascendara's index, a game with no links
  // of any kind had its files taken down
  useEffect(() => {
    let active = true;
    gameService
      .getCachedData()
      .then(({ metadata }) => {
        if (!active) return;
        setIsExternalSource(
          metadata?.customSource === true ||
            (metadata?.combined === true && !!game.customSource)
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [game.customSource]);

  const filesUnavailable = !isExternalSource && !hasAnyLink(shown.download_links);
  const timemachineAvailable =
    timemachineEnabled && (!!game.hasHistory || !gameService.indexTracksHistory());
  const actionButtons = useMemo(
    () =>
      timemachineAvailable
        ? ["download", "playLater", "timemachine"]
        : ["download", "playLater"],
    [timemachineAvailable]
  );

  // Provider selection for downloads Big Picture can run itself
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const availableProviders = getInAppProviders(shown);
  const isSeamless = checkSeamlessAvailable(shown);
  const downloadBlocked = filesUnavailable || (isInstalled && !needsUpdate && !release);

  // Land on Older Versions when the live release can't be downloaded
  useEffect(() => {
    setSelectedButton(filesUnavailable && timemachineAvailable ? 2 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, timemachineAvailable]);

  const startDownload = useCallback(() => {
    if (downloadBlocked) return;
    const target = needsUpdate ? { ...shown, isUpdating: true } : shown;
    if (isSeamless && availableProviders.length > 1) {
      onShowProviderDialog(target, availableProviders);
    } else {
      onDownload(target);
    }
  }, [
    downloadBlocked,
    needsUpdate,
    shown,
    isSeamless,
    availableProviders,
    onShowProviderDialog,
    onDownload,
  ]);

  const handleSelectRelease = useCallback(selected => {
    setRelease(selected.live ? null : selected);
    setShowTimemachine(false);
    setFocusedSection("button");
    setSelectedButton(0);
  }, []);

  const descriptionRef = useRef(null);
  const screenshotsRef = useRef(null);
  const [screenshotIndex, setScreenshotIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const screenshots = useMemo(() => {
    return (steamData?.screenshots || []).map((screen, idx) => {
      const raw =
        typeof screen === "string"
          ? screen
          : screen?.url || screen?.path_full || screen?.path_thumbnail;
      return {
        id: screen?.id ?? idx,
        url: steamService.formatImageUrl(raw, "screenshot_huge"),
        alt: `Screenshot ${idx + 1}`,
      };
    });
  }, [steamData]);

  // Use unified game image hook for consistency with Library
  const { imageData: cachedImage, loading: imageLoading } = useGameImage(game, {
    quality: "high",
    priority: "high",
    checkPlayLater: true,
  });

  // Background Image - check Play Later cache first, then use hook result
  const [playLaterImage, setPlayLaterImage] = useState(null);

  useEffect(() => {
    const gameName = game.game || game.name;
    const cached = localStorage.getItem(`play-later-image-${gameName}`);
    if (cached) {
      setPlayLaterImage(cached);
    }
  }, [game.game, game.name]);

  const bgImage =
    prepared?.override?.heroUrl ||
    playLaterImage ||
    cachedImage ||
    prepared?.cachedImage ||
    game.cover ||
    game.image;

  // Fetch game info the same way the desktop game page does
  useEffect(() => {
    let live = true;
    const apply = result => {
      if (!live) return;
      setPrepared(result);
      setSteamData(result?.steamData || null);
      setInfoState(
        result?.steamFailed ? "failed" : result?.steamData ? "ready" : "missing"
      );
      setLoadingMedia(false);
    };
    const cached = gamePagePreparer.peek(game);
    if (cached) {
      apply(cached);
      return () => {
        live = false;
      };
    }
    setPrepared(null);
    setSteamData(null);
    setInfoState("loading");
    setLoadingMedia(true);
    gamePagePreparer.prepare(game).then(async result => {
      if (!live) return;
      if (result && gamePagePreparer.matches(result, game)) {
        apply(result);
        return;
      }
      // The preparer gave up waiting (slow network): finish the same lookups here
      const name = game.game || game.name;
      const usesOverrides = !!(game.gameID && !game.privateSource);
      const [details, override] = await Promise.all([
        name
          ? findGameDetails(name, steamService.getGameDetails).catch(() => undefined)
          : null,
        usesOverrides
          ? artworkOverrideService.fetch(game.gameID).catch(() => null)
          : null,
      ]);
      const coverGridUrl =
        override?.gridUrl ||
        (name ? await steamGridImageService.getCover(name).catch(() => null) : null);
      apply({
        steamData: details || null,
        steamFailed: details === undefined,
        override: override || null,
        coverGridUrl: coverGridUrl || null,
        cachedImage: null,
      });
    });
    return () => {
      live = false;
    };
  }, [game, infoAttempt]);

  // Steam not reached: try once more on its own before showing the message
  const retriedInfo = useRef(false);
  useEffect(() => {
    retriedInfo.current = false;
  }, [game]);
  useEffect(() => {
    if (infoState !== "failed" || retriedInfo.current) return;
    retriedInfo.current = true;
    const timer = setTimeout(() => setInfoAttempt(value => value + 1), 3000);
    return () => clearTimeout(timer);
  }, [infoState]);

  // Check Nexus Mods support
  useEffect(() => {
    const checkModSupport = async () => {
      const gameName = game.game || game.name;
      if (gameName) {
        try {
          const result = await nexusModsService.checkModSupport(gameName);
          setSupportsModManaging(result.supported);
        } catch (error) {
          console.error("[GameDetailsView] Error checking Nexus Mods support:", error);
          setSupportsModManaging(false);
        }
      }
    };
    checkModSupport();
  }, [game]);

  // Check FLiNG Trainer support
  useEffect(() => {
    const checkTrainerSupport = async () => {
      const gameName = game.game || game.name;
      if (gameName) {
        try {
          const result = await flingTrainerService.checkTrainerSupport(gameName);
          setSupportsFlingTrainer(result.supported);
        } catch (error) {
          console.error("[GameDetailsView] Error checking FLiNG Trainer support:", error);
          setSupportsFlingTrainer(false);
        }
      }
    };
    checkTrainerSupport();
  }, [game]);

  // Check if game is installed and needs update
  useEffect(() => {
    const gameName = game.game || game.name;
    const gameVersion = game.version;

    if (!gameName) return;
    isMounted.current = true;

    installedGamesService
      .checkGameStatus(gameName, gameVersion)
      .then(({ isInstalled: installed, needsUpdate: update }) => {
        if (isMounted.current) {
          setIsInstalled(installed);
          setNeedsUpdate(update);
        }
      })
      .catch(error => {
        console.error("[GameDetailsView] Error checking game installation:", error);
      });

    return () => {
      isMounted.current = false;
    };
  }, [game.game, game.name, game.version]);

  // Check if game is in Play Later list
  useEffect(() => {
    const gameName = game.game || game.name;
    if (!gameName) return;
    const playLaterGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");
    const isInList = playLaterGames.some(g => g.game === gameName);
    setIsPlayLater(isInList);
  }, [game]);

  // Handle Play Later Click
  const handlePlayLater = useCallback(() => {
    const gameName = game.game || game.name;
    const playLaterGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");

    if (isPlayLater) {
      const updatedList = playLaterGames.filter(g => g.game !== gameName);
      localStorage.setItem("play-later-games", JSON.stringify(updatedList));
      localStorage.removeItem(`play-later-image-${gameName}`);
      setIsPlayLater(false);
    } else {
      const gameToSave = {
        game: gameName,
        name: game.name || gameName,
        imgID: game.imgID,
        cover: game.cover,
        image: game.image,
        size: game.size,
        category: game.category,
        desc: game.desc,
        addedAt: Date.now(),
      };
      playLaterGames.push(gameToSave);
      localStorage.setItem("play-later-games", JSON.stringify(playLaterGames));
      // play-later card images are no longer cached in localStorage (quota
      // issues); fetched on demand via IPC / SteamGridDB instead.
      setIsPlayLater(true);
    }
    window.dispatchEvent(new CustomEvent("play-later-updated"));
  }, [game, isPlayLater, cachedImage]);

  const moveScreenshotFocus = useCallback(
    action => {
      if (!screenshots.length) return;
      const columns = getScreenshotColumns();
      setScreenshotIndex(prev => {
        if (action === "LEFT") return Math.max(0, prev - 1);
        if (action === "RIGHT") return Math.min(screenshots.length - 1, prev + 1);
        if (action === "UP") return Math.max(0, prev - columns);
        if (action === "DOWN") return Math.min(screenshots.length - 1, prev + columns);
        return prev;
      });
    },
    [screenshots.length]
  );

  const stepLightbox = useCallback(
    delta => {
      if (!screenshots.length) return;
      setScreenshotIndex(
        prev => (prev + delta + screenshots.length) % screenshots.length
      );
    },
    [screenshots.length]
  );

  const handleInput = useCallback(
    action => {
      if (dialogOpen || showTimemachine) return;

      if (lightboxOpen) {
        if (action === "LEFT" || action === "UP") stepLightbox(-1);
        else if (action === "RIGHT" || action === "DOWN") stepLightbox(1);
        else if (action === "BACK" || action === "MENU") setLightboxOpen(false);
        return;
      }

      if (action === "DOWN") {
        if (focusedSection === "button") {
          // Move from button to description
          setFocusedSection("description");
        } else if (focusedSection === "description") {
          // Move from description to screenshots if available
          if (screenshots.length > 0) {
            setShowMedia(true);
            setFocusedSection("screenshots");
            setScreenshotIndex(0);
          }
        } else if (focusedSection === "screenshots") {
          moveScreenshotFocus("DOWN");
        }
      } else if (action === "UP") {
        if (focusedSection === "screenshots") {
          // Move up a row, or leave the media view from the first row
          if (screenshotIndex >= getScreenshotColumns()) {
            moveScreenshotFocus("UP");
          } else {
            setShowMedia(false);
            setFocusedSection("description");
          }
        } else if (focusedSection === "description") {
          // Move back from description to button
          setFocusedSection("button");
        }
      } else if (action === "LEFT") {
        if (focusedSection === "button") {
          // Navigate between buttons
          setSelectedButton(prev => Math.max(0, prev - 1));
        } else if (focusedSection === "description" && descriptionRef.current) {
          // Scroll left in description
          descriptionRef.current.scrollBy({ top: -100, behavior: "smooth" });
        } else if (focusedSection === "screenshots") {
          moveScreenshotFocus("LEFT");
        }
      } else if (action === "RIGHT") {
        if (focusedSection === "button") {
          // Navigate between buttons (0 = View Details, 1 = Play Later)
          setSelectedButton(prev => Math.min(actionButtons.length - 1, prev + 1));
        } else if (focusedSection === "description" && descriptionRef.current) {
          // Scroll right in description
          descriptionRef.current.scrollBy({ top: 100, behavior: "smooth" });
        } else if (focusedSection === "screenshots") {
          moveScreenshotFocus("RIGHT");
        }
      } else if (action === "CONFIRM") {
        if (focusedSection === "button") {
          const button = actionButtons[selectedButton];
          if (button === "download") startDownload();
          else if (button === "playLater") handlePlayLater();
          else if (button === "timemachine") setShowTimemachine(true);
        } else if (focusedSection === "description") {
          // Move to screenshots if available
          if (screenshots.length > 0) {
            setShowMedia(true);
            setFocusedSection("screenshots");
            setScreenshotIndex(0);
          }
        } else if (focusedSection === "screenshots" && screenshots.length > 0) {
          setLightboxOpen(true);
        }
      } else if (action === "BACK" || action === "MENU") {
        if (showMedia) {
          setShowMedia(false);
          setFocusedSection("description");
        } else if (focusedSection === "description") {
          setFocusedSection("button");
        } else {
          onBack();
        }
      }
    },
    [
      showMedia,
      onBack,
      dialogOpen,
      showTimemachine,
      lightboxOpen,
      focusedSection,
      screenshotIndex,
      screenshots.length,
      moveScreenshotFocus,
      stepLightbox,
      selectedButton,
      handlePlayLater,
      startDownload,
      actionButtons,
    ]
  );

  // Keyboard Listener
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.repeat) return;
      const map = {
        ArrowDown: "DOWN",
        ArrowUp: "UP",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        Escape: "BACK",
        Backspace: "BACK",
        Enter: "CONFIRM",
      };
      if (map[e.key]) {
        e.stopPropagation();
        handleInput(map[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleInput]);

  // Gamepad Polling
  useControllerInput(
    action => {
      if (action === "MENU" && !showMedia && !lightboxOpen) onBack();
      else handleInput(action);
    },
    { priority: 5, blocked: dialogOpen || showTimemachine }
  );

  const hasScreenshots = screenshots.length > 0;
  const mediaSwipe = useMediaSwipe({
    showMedia,
    enabled: hasScreenshots && !lightboxOpen && !dialogOpen && !showTimemachine,
    open: () => {
      setShowMedia(true);
      setFocusedSection("screenshots");
      setScreenshotIndex(0);
    },
    close: () => {
      setShowMedia(false);
      setFocusedSection("description");
    },
  });

  return (
    <div className="bp-detail fixed inset-0 z-[10000] flex flex-col overflow-hidden bg-background text-primary">
      <DetailBackButton
        onBack={() => handleInput("BACK")}
        controllerType={controllerType}
        t={t}
      />
      <div
        className="bp-detail-bg absolute inset-0 z-0 opacity-30 transition-opacity duration-1000"
        style={{
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(60px) saturate(150%)",
        }}
      />

      <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#0e0e10] via-[#0e0e10]/70 to-transparent" />

      <div
        className={`bp-detail-art bp-dv-art absolute right-0 top-0 z-10 flex h-full w-[55%] items-center justify-center p-12 transition-all duration-500 ease-in-out ${
          showMedia
            ? "pointer-events-none translate-y-[-10%] scale-95 opacity-0"
            : "translate-y-0 scale-100 opacity-100"
        }`}
      >
        <div className="group relative">
          <div className="absolute inset-0 -z-10 translate-y-10 scale-90 rounded-full bg-primary/20 blur-3xl transition-colors duration-500 group-hover:bg-primary/40"></div>
          <img
            src={bgImage}
            alt={game.name || game.game}
            className="max-h-[75vh] max-w-full rotate-2 rounded-2xl border-4 border-white/10 object-cover shadow-2xl transition-all duration-500 ease-out group-hover:rotate-0 group-hover:scale-105"
          />
        </div>
      </div>

      <div
        {...mediaSwipe}
        className={`relative z-20 h-full w-full transition-transform duration-500 ease-smooth-out ${
          showMedia ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        {/* VIEW 1: DETAILS */}
        <div className="relative h-full w-full flex-shrink-0">
          <div className="bp-detail-hero bp-dv-hero flex h-full w-[45%] flex-col justify-center overflow-hidden px-16 pb-16 pl-24 pt-28">
            <h1 className="bp-dv-title mb-6 line-clamp-2 shrink-0 text-6xl font-black leading-tight tracking-tight text-white drop-shadow-lg">
              {game.name || game.game}
            </h1>
            <div className="bp-dv-tags mb-6 flex shrink-0 flex-wrap gap-3">
              {game.category &&
                game.category.slice(0, 4).map((cat, idx) => (
                  <span
                    key={idx}
                    className="rounded-lg border border-white/10 bg-white/10 px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm"
                  >
                    {cat}
                  </span>
                ))}
            </div>

            <div className="bp-dv-meta mb-8 flex shrink-0 gap-6 text-white/80">
              {shown.size && (
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  <span className="font-medium">{catalogSizeText(shown, t)}</span>
                </div>
              )}
              {shown.version && (
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  <span className="font-medium">v{shown.version}</span>
                </div>
              )}
              {release && (
                <div className="flex items-center gap-2 text-amber-300">
                  <History className="h-5 w-5" />
                  <span className="font-medium">
                    {t("download.timemachine.viewingOlderTitle")}
                  </span>
                </div>
              )}
            </div>

            {(game.dlc || game.online || isSeamless !== undefined) && (
              <div className="bp-dv-badges mb-6 flex shrink-0 flex-wrap gap-4">
                {game.dlc && (
                  <div className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-300 backdrop-blur-sm">
                    <Download className="h-4 w-4" />
                    <span>{t("bigPicture.includesDlc")}</span>
                  </div>
                )}
                {game.online && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/20 px-4 py-2 text-sm font-medium text-green-300 backdrop-blur-sm">
                    <Wifi className="h-4 w-4" />
                    <span>{t("bigPicture.onlineFix")}</span>
                  </div>
                )}
                {filesUnavailable ? (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 backdrop-blur-sm">
                    <TriangleAlert className="h-4 w-4" />
                    <span>{t("download.filesUnavailable.title")}</span>
                  </div>
                ) : isSeamless ? (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/20 px-4 py-2 text-sm font-medium text-green-300 backdrop-blur-sm">
                    <Check className="h-4 w-4" />
                    <span>{t("bigPicture.readyToDownload")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/20 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm">
                    <MousePointer className="h-4 w-4" />
                    <span>{t("bigPicture.mouseRequired")}</span>
                  </div>
                )}
              </div>
            )}

            {filesUnavailable && (
              <p className="bp-dv-unavailable mb-6 max-w-2xl shrink-0 text-base leading-relaxed text-white/70">
                {t("download.filesUnavailable.description")}{" "}
                {timemachineAvailable
                  ? t("download.timemachine.oldLinksNotice")
                  : t("download.filesUnavailable.checkBack")}
              </p>
            )}

            {/* Provider Selection UI */}
            {focusedSection === "provider" &&
              isSeamless &&
              availableProviders.length > 1 && (
                <div className="mb-6 rounded-xl border-2 border-primary/50 bg-primary/10 p-6 backdrop-blur-sm">
                  <h3 className="mb-4 text-lg font-bold text-white">
                    {t("bigPicture.selectProvider")}
                  </h3>
                  <div className="flex gap-3">
                    {availableProviders.map((provider, idx) => (
                      <button
                        key={provider}
                        onClick={() => setSelectedProviderIndex(idx)}
                        className={`rounded-lg px-6 py-3 text-sm font-bold uppercase transition-all ${
                          idx === selectedProviderIndex
                            ? "scale-105 bg-white text-black shadow-lg"
                            : "bg-white/20 text-white hover:bg-white/30"
                        }`}
                      >
                        {provider}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-white/60">
                    {t("bigPicture.useArrowsToSelect")} • Press {buttons.confirm}{" "}
                    {t("bigPicture.toConfirm")}
                  </p>
                </div>
              )}

            <div className="bp-dv-actions mb-6 flex shrink-0 gap-4">
              <button
                onClick={startDownload}
                disabled={downloadBlocked}
                className={`group flex w-fit shrink-0 items-center gap-4 whitespace-nowrap rounded-2xl px-10 py-5 text-2xl font-black shadow-xl transition-all duration-200 ${
                  downloadBlocked
                    ? `cursor-not-allowed bg-muted text-muted-foreground opacity-50 ${
                        focusedSection === "button" && selectedButton === 0
                          ? "ring-4 ring-primary/50"
                          : ""
                      }`
                    : focusedSection === "button" && selectedButton === 0
                      ? needsUpdate
                        ? "scale-110 bg-amber-500 text-secondary shadow-amber-500/50 ring-4 ring-amber-400/50"
                        : "scale-110 bg-primary text-secondary shadow-primary/50 ring-4 ring-primary/50"
                      : needsUpdate
                        ? "bg-amber-500 text-secondary shadow-amber-500/30 hover:scale-105 hover:bg-amber-500"
                        : "bg-primary text-secondary shadow-primary/30 hover:scale-105 hover:bg-primary"
                }`}
              >
                {filesUnavailable ? (
                  <>
                    <TriangleAlert className="h-7 w-7" />
                    <span>{t("bigPicture.filesUnavailable")}</span>
                  </>
                ) : isInstalled && !needsUpdate && !release ? (
                  <>
                    <Check className="h-7 w-7" />
                    <span>{t("bigPicture.installed")}</span>
                  </>
                ) : needsUpdate ? (
                  <>
                    <RefreshCw className="h-7 w-7" />
                    <span>{t("bigPicture.update")}</span>
                  </>
                ) : (
                  <>
                    <Download className="h-7 w-7" />
                    <span>
                      {isSeamless
                        ? t("bigPicture.startDownload")
                        : t("bigPicture.viewDetails")}
                    </span>
                  </>
                )}
              </button>

              <button
                onClick={handlePlayLater}
                className={`group flex w-fit shrink-0 items-center gap-3 whitespace-nowrap rounded-2xl px-8 py-5 text-xl font-bold shadow-lg transition-all duration-200 ${
                  focusedSection === "button" && selectedButton === 1
                    ? isPlayLater
                      ? "scale-110 bg-green-500 text-secondary shadow-green-500/50 ring-4 ring-green-400/50"
                      : "scale-110 border-2 border-primary bg-muted text-foreground shadow-primary/30 ring-4 ring-primary/50"
                    : isPlayLater
                      ? "bg-green-500 text-secondary shadow-green-500/30"
                      : "border-2 border-border bg-muted text-foreground shadow-muted/30 hover:border-primary/40 hover:bg-muted/80"
                }`}
              >
                {isPlayLater ? (
                  <>
                    <Check className="h-6 w-6" />
                    <span>{t("bigPicture.addedToPlayLater")}</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-6 w-6" />
                    <span>{t("bigPicture.playLater")}</span>
                  </>
                )}
              </button>

              {timemachineAvailable && (
                <button
                  onClick={() => setShowTimemachine(true)}
                  className={`group flex w-fit shrink-0 items-center gap-3 whitespace-nowrap rounded-2xl px-8 py-5 text-xl font-bold shadow-lg transition-all duration-200 ${
                    focusedSection === "button" && selectedButton === 2
                      ? "scale-110 border-2 border-primary bg-muted text-foreground shadow-primary/30 ring-4 ring-primary/50"
                      : "border-2 border-border bg-muted text-foreground shadow-muted/30 hover:border-primary/40 hover:bg-muted/80"
                  }`}
                >
                  <History className="h-6 w-6" />
                  <span>{t("bigPicture.olderVersions")}</span>
                </button>
              )}
            </div>

            <div
              ref={descriptionRef}
              className={`bp-dv-desc mb-8 max-h-[400px] min-h-0 max-w-3xl shrink overflow-y-auto rounded-xl p-6 transition-all duration-200 ${
                focusedSection === "description"
                  ? "bg-muted/50 ring-4 ring-primary"
                  : "bg-muted/20"
              }`}
            >
              <p className="bp-dv-desc-text text-lg leading-relaxed text-white/90">
                {(
                  steamData?.summary ||
                  steamData?.description ||
                  steamData?.short_description ||
                  steamData?.about_the_game ||
                  steamData?.detailed_description ||
                  steamData?.full_description ||
                  game.description ||
                  game.desc ||
                  (infoState === "loading"
                    ? t("bigPicture.loadingDescription")
                    : infoState === "failed"
                      ? t("bigPicture.failedToFetchDescription")
                      : t("bigPicture.noDescriptionAvailable"))
                ).replace(/<[^>]*>/g, "")}
              </p>
            </div>

            <div className="bp-dv-features mt-8 shrink-0 space-y-4">
              {/* Ascend Features Banner */}
              <div className="group relative max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-muted/50 p-5 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-muted/70">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
                  {/* Cloud Saves - Always show */}
                  <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                      <Cloud className="h-4.5 w-4.5 text-white transition-transform duration-200 group-hover/item:scale-110" />
                      <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {t("bigPicture.cloudSaves")}
                    </span>
                  </div>

                  {/* Remote Downloads - Always show */}
                  <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                      <Smartphone className="h-4.5 w-4.5 text-white transition-transform duration-200 group-hover/item:scale-110" />
                      <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {t("bigPicture.remoteDownloads")}
                    </span>
                  </div>

                  <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                      <ListEnd className="h-4.5 w-4.5 text-white transition-transform duration-200 group-hover/item:scale-110" />
                      <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {t("bigPicture.queueDownloads")}
                    </span>
                  </div>

                  {/* Mod Manager - Only if game supports mods */}
                  {supportsModManaging && (
                    <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                        <Puzzle className="h-4.5 w-4.5 text-white transition-transform duration-200 group-hover/item:scale-110" />
                        <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                      </div>
                      <span className="text-sm font-semibold text-white">
                        {t("bigPicture.modManager")}
                      </span>
                    </div>
                  )}

                  {/* Trainer - Only if game has trainer support */}
                  {supportsFlingTrainer && (
                    <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                        <Zap className="h-4.5 w-4.5 text-white transition-transform duration-200 group-hover/item:scale-110" />
                        <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                      </div>
                      <span className="text-sm font-semibold text-white">
                        {t("bigPicture.trainer")}
                      </span>
                    </div>
                  )}

                  {/* Auto Updates - Only for seamless games */}
                  {isSeamless && (
                    <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                        <RefreshCw className="h-4.5 w-4.5 text-secondary transition-transform duration-200 group-hover/item:scale-110" />
                        <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                      </div>
                      <span className="text-sm font-semibold text-white">
                        {t("bigPicture.autoUpdates")}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    {t("bigPicture.ascendPremiumFeatures")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bp-dv-hint absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 animate-bounce flex-col items-center gap-2 opacity-60">
            <span className="text-xs font-bold uppercase tracking-widest text-secondary">
              {hasScreenshots ? t("bigPicture.screenshots") : t("bigPicture.mediaInfo")}
            </span>
            <ChevronDown className="h-6 w-6 text-secondary" />
          </div>
        </div>

        <div className="relative flex h-full w-full flex-shrink-0 flex-col">
          <div className="absolute inset-0 -z-10 bg-background/90 backdrop-blur-md" />
          <div className="z-20 flex items-center gap-4 border-b border-white/5 px-24 py-12">
            <ImageIcon className="h-8 w-8 text-primary" />
            <h2 className="text-4xl font-light tracking-wider text-primary">
              {t("bigPicture.media")}
            </h2>
            {hasScreenshots && (
              <div className="ml-auto flex items-center gap-8 text-xs font-bold uppercase tracking-widest text-white/60">
                <span>← / → {t("bigPicture.navigate")}</span>
                <span>
                  <span
                    className={`mr-2 ${getButtonBadgeClass(controllerType)} bg-primary px-2.5 py-1 text-secondary`}
                  >
                    {buttons.confirm}
                  </span>
                  {t("bigPicture.openSelect")}
                </span>
                <span>
                  <span
                    className={`mr-2 ${getButtonBadgeClass(controllerType)} border border-border bg-muted px-2.5 py-1 text-muted-foreground`}
                  >
                    {buttons.cancel}
                  </span>
                  {t("bigPicture.cancel")}
                </span>
              </div>
            )}
          </div>

          <div
            ref={screenshotsRef}
            className="no-scrollbar flex-1 overflow-y-auto p-12 px-24 pb-32"
          >
            <ScreenshotGallery
              screenshots={screenshots}
              index={screenshotIndex}
              lightboxOpen={lightboxOpen}
              focused={focusedSection === "screenshots"}
              onFocus={setScreenshotIndex}
              onOpen={() => setLightboxOpen(true)}
              onClose={() => setLightboxOpen(false)}
              onNavigate={setScreenshotIndex}
              loading={loadingMedia}
              emptyLabel={t("bigPicture.noScreenshotsAvailable")}
              t={t}
              controllerType={controllerType}
              buttons={buttons}
            />
          </div>
        </div>
      </div>

      <TimemachineDialog
        isOpen={showTimemachine}
        game={game}
        showingVersion={shown.version || ""}
        onSelect={handleSelectRelease}
        onClose={() => setShowTimemachine(false)}
        t={t}
        controllerType={controllerType}
      />
    </div>
  );
};

export { GameDetailsView };
