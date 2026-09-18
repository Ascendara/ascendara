import { useState, useRef, useEffect, useCallback } from "react";
import { SEAMLESS_PROVIDERS } from "@/config/providers";
import { useGameImage } from "@/hooks/useGameImage";
import steamService from "@/services/gameInfoService";
import nexusModsService from "@/services/nexusModsService";
import flingTrainerService from "@/services/flingTrainerService";
import installedGamesService from "@/services/installedGamesService";
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
  Image as ImageIcon,
} from "lucide-react";
import { checkSeamlessAvailable } from "./utils";
import {
  getControllerButtons,
  getButtonWidthClass,
  getButtonBadgeClass,
} from "./controller";
import { getGamepadInput } from "./gamepad";

// --- GAME DETAILS & STORE COMPONENTS ---
const GameDetailsView = ({
  game,
  onBack,
  onDownload,
  onShowProviderDialog,
  t,
  controllerType,
  dialogOpen = false,
}) => {
  const isSeamless = checkSeamlessAvailable(game);
  const [showMedia, setShowMedia] = useState(false);
  const [steamData, setSteamData] = useState(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const buttons = getControllerButtons(controllerType);
  const [focusedSection, setFocusedSection] = useState("button"); // 'button', 'description', 'screenshots', 'provider'
  const [selectedButton, setSelectedButton] = useState(0); // 0 = Download, 1 = Play Later
  const [supportsModManaging, setSupportsModManaging] = useState(false);
  const [supportsFlingTrainer, setSupportsFlingTrainer] = useState(false);
  const [isPlayLater, setIsPlayLater] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const isMounted = useRef(true);

  // Provider selection for seamless downloads
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const seamlessProviders = SEAMLESS_PROVIDERS;
  const availableProviders = isSeamless
    ? seamlessProviders.filter(provider => game.download_links?.[provider])
    : [];

  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);
  const descriptionRef = useRef(null);
  const screenshotsRef = useRef(null);

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

  const bgImage = playLaterImage || cachedImage || game.cover || game.image;

  // Input delay on opening
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanInput(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Fetch Data
  useEffect(() => {
    let isMounted = true;
    const fetchGameData = async () => {
      const gameName = game.game || game.name;
      if (!gameName) return;
      console.log("[GameDetailsView] Fetching Steam data for:", gameName);
      setLoadingMedia(true);
      try {
        const data = await steamService.getGameDetails(gameName);
        console.log("[GameDetailsView] Steam data received:", data);
        if (data) {
          console.log("[GameDetailsView] - short_description:", data.short_description);
          console.log("[GameDetailsView] - about_the_game:", data.about_the_game);
          console.log("[GameDetailsView] - screenshots:", data.screenshots);
          console.log(
            "[GameDetailsView] - screenshots count:",
            data.screenshots?.length || 0
          );
        }
        if (isMounted && data) {
          setSteamData(data);
        } else if (!data) {
          console.log("[GameDetailsView] No Steam data found for game");
        }
      } catch (error) {
        console.error("[GameDetailsView] Error fetching steam data:", error);
      } finally {
        if (isMounted) {
          console.log("[GameDetailsView] Loading complete, loadingMedia set to false");
          setLoadingMedia(false);
        }
      }
    };
    fetchGameData();
    return () => {
      isMounted = false;
    };
  }, [game]);

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

  const handleInput = useCallback(
    action => {
      if (!canInput || dialogOpen) return;

      if (action === "DOWN") {
        if (focusedSection === "button") {
          // Move from button to description
          setFocusedSection("description");
        } else if (focusedSection === "description") {
          // Move from description to screenshots if available
          if (steamData?.screenshots && steamData.screenshots.length > 0) {
            setShowMedia(true);
            setFocusedSection("screenshots");
          }
        } else if (focusedSection === "screenshots") {
          // Scroll screenshots down
          if (screenshotsRef.current) {
            screenshotsRef.current.scrollBy({ top: 200, behavior: "smooth" });
          }
        }
      } else if (action === "UP") {
        if (focusedSection === "screenshots") {
          // Move back from screenshots to description
          setShowMedia(false);
          setFocusedSection("description");
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
        } else if (focusedSection === "screenshots" && screenshotsRef.current) {
          // Scroll left in screenshots
          screenshotsRef.current.scrollBy({ top: -200, behavior: "smooth" });
        }
      } else if (action === "RIGHT") {
        if (focusedSection === "button") {
          // Navigate between buttons (0 = View Details, 1 = Play Later)
          setSelectedButton(prev => Math.min(1, prev + 1));
        } else if (focusedSection === "description" && descriptionRef.current) {
          // Scroll right in description
          descriptionRef.current.scrollBy({ top: 100, behavior: "smooth" });
        } else if (focusedSection === "screenshots" && screenshotsRef.current) {
          // Scroll right in screenshots
          screenshotsRef.current.scrollBy({ top: 200, behavior: "smooth" });
        }
      } else if (action === "CONFIRM") {
        if (focusedSection === "button") {
          if (selectedButton === 0) {
            // Don't allow download if already installed and no update available
            if (isInstalled && !needsUpdate) return;

            // Start Download button
            console.log(
              "[DOWNLOAD] isSeamless:",
              isSeamless,
              "availableProviders:",
              availableProviders
            );
            if (isSeamless && availableProviders && availableProviders.length > 1) {
              console.log("[DOWNLOAD] Showing provider dialog");
              onShowProviderDialog(game, availableProviders);
            } else {
              console.log("[DOWNLOAD] Starting download directly");
              // Pass the game with isUpdating flag if update is needed
              onDownload(needsUpdate ? { ...game, isUpdating: true } : game);
            }
          } else if (selectedButton === 1) {
            // Play Later button
            handlePlayLater();
          }
        } else if (focusedSection === "description") {
          // Move to screenshots if available
          if (steamData?.screenshots && steamData.screenshots.length > 0) {
            setShowMedia(true);
            setFocusedSection("screenshots");
          }
        }
      } else if (action === "BACK") {
        if (showMedia) {
          setShowMedia(false);
          setFocusedSection("button");
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
      onDownload,
      onShowProviderDialog,
      game,
      canInput,
      dialogOpen,
      focusedSection,
      steamData,
      selectedButton,
      handlePlayLater,
      isSeamless,
      availableProviders,
      isInstalled,
      needsUpdate,
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
  useEffect(() => {
    let rAF;
    const loop = () => {
      // Block input when dialog is open
      if (dialogOpen) {
        rAF = requestAnimationFrame(loop);
        return;
      }

      const gp = getGamepadInput();
      if (gp && canInput) {
        const now = Date.now();
        if (now - lastInputTime.current > 150) {
          if (gp.down) {
            handleInput("DOWN");
            lastInputTime.current = now;
          } else if (gp.up) {
            handleInput("UP");
            lastInputTime.current = now;
          } else if (gp.left) {
            handleInput("LEFT");
            lastInputTime.current = now;
          } else if (gp.right) {
            handleInput("RIGHT");
            lastInputTime.current = now;
          } else if (gp.b) {
            handleInput("BACK");
            lastInputTime.current = now;
          } else if (gp.a) {
            handleInput("CONFIRM");
            lastInputTime.current = now;
          }
        }
      }
      rAF = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rAF);
  }, [handleInput, canInput, dialogOpen]);

  const hasScreenshots = steamData?.screenshots && steamData.screenshots.length > 0;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col overflow-hidden bg-background text-primary">
      <div
        className="absolute inset-0 z-0 opacity-30 transition-opacity duration-1000"
        style={{
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(60px) saturate(150%)",
        }}
      />

      <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#0e0e10] via-[#0e0e10]/70 to-transparent" />

      <div
        className={`absolute right-0 top-0 z-10 flex h-full w-[55%] items-center justify-center p-12 transition-all duration-500 ease-in-out ${
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
        className={`relative z-20 h-full w-full transition-transform duration-500 ease-smooth-out ${
          showMedia ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        {/* VIEW 1: DETAILS */}
        <div className="relative h-full w-full flex-shrink-0">
          <div className="flex h-full w-[45%] flex-col justify-center p-16 pl-24">
            <h1 className="mb-6 text-6xl font-black leading-tight tracking-tight text-white drop-shadow-lg">
              {game.name || game.game}
            </h1>
            <div className="mb-6 flex flex-wrap gap-3">
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

            <div className="mb-8 flex gap-6 text-white/80">
              {game.size && (
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  <span className="font-medium">{game.size}</span>
                </div>
              )}
              {game.version && (
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  <span className="font-medium">v{game.version}</span>
                </div>
              )}
            </div>

            {(game.dlc || game.online || isSeamless !== undefined) && (
              <div className="mb-6 flex flex-wrap gap-4">
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
                {isSeamless ? (
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

            <div className="mb-6 flex gap-4">
              <button
                onClick={() => {
                  // Don't allow download if already installed and no update available
                  if (isInstalled && !needsUpdate) return;

                  if (isSeamless && availableProviders.length > 1) {
                    onShowProviderDialog(game, availableProviders);
                  } else {
                    // Pass the game with isUpdating flag if update is needed
                    onDownload(needsUpdate ? { ...game, isUpdating: true } : game);
                  }
                }}
                disabled={isInstalled && !needsUpdate}
                className={`group flex w-fit items-center gap-4 rounded-2xl px-10 py-5 text-2xl font-black shadow-xl transition-all duration-200 ${
                  isInstalled && !needsUpdate
                    ? "cursor-not-allowed bg-muted text-muted-foreground opacity-50"
                    : focusedSection === "button" && selectedButton === 0
                      ? needsUpdate
                        ? "scale-110 bg-amber-500 text-secondary shadow-amber-500/50 ring-4 ring-amber-400/50"
                        : "scale-110 bg-primary text-secondary shadow-primary/50 ring-4 ring-primary/50"
                      : needsUpdate
                        ? "bg-amber-500 text-secondary shadow-amber-500/30 hover:scale-105 hover:bg-amber-500"
                        : "bg-primary text-secondary shadow-primary/30 hover:scale-105 hover:bg-primary"
                }`}
              >
                {isInstalled && !needsUpdate ? (
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
                className={`group flex w-fit items-center gap-3 rounded-2xl px-8 py-5 text-xl font-bold shadow-lg transition-all duration-200 ${
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
            </div>

            <div
              ref={descriptionRef}
              className={`mb-8 max-h-[400px] min-h-[200px] max-w-3xl overflow-y-auto rounded-xl p-6 transition-all duration-200 ${
                focusedSection === "description"
                  ? "bg-muted/50 ring-4 ring-primary"
                  : "bg-muted/20"
              }`}
            >
              <p className="text-lg leading-relaxed text-white/90">
                {(
                  steamData?.summary ||
                  steamData?.description ||
                  steamData?.short_description ||
                  steamData?.about_the_game ||
                  steamData?.detailed_description ||
                  game.desc ||
                  t("bigPicture.failedToFetchDescription")
                ).replace(/<[^>]*>/g, "")}
              </p>
            </div>

            <div className="mt-8 space-y-4">
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

          <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 animate-bounce flex-col items-center gap-2 opacity-60">
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
          </div>

          <div
            ref={screenshotsRef}
            className="no-scrollbar flex-1 overflow-y-auto p-12 px-24 pb-32"
          >
            {steamData?.screenshots && steamData.screenshots.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
                {steamData.screenshots.map((screen, idx) => {
                  const imageUrl =
                    typeof screen === "string"
                      ? screen
                      : screen.path_full || screen.path_thumbnail || screen.url;
                  return (
                    <div
                      key={screen.id || idx}
                      className="group relative aspect-video overflow-hidden rounded-xl border-2 border-transparent bg-muted transition-all hover:scale-[1.02] hover:border-primary"
                    >
                      <img
                        src={imageUrl}
                        alt={`Screenshot ${idx + 1}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={e => {
                          console.log("[Screenshot] Failed to load:", imageUrl);
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <p>{t("bigPicture.noScreenshotsAvailable")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="fixed bottom-12 right-16 z-50 flex gap-10 text-sm font-bold tracking-widest text-primary">
        {!showMedia && (
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 ${getButtonWidthClass(buttons.confirm, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} bg-primary text-sm font-black text-secondary shadow-lg`}
            >
              {buttons.confirm}
            </span>{" "}
            {t("bigPicture.download")}
          </div>
        )}
        <div
          className="flex cursor-pointer items-center gap-3 transition-colors hover:text-primary/80"
          onClick={() => handleInput("BACK")}
        >
          <span
            className={`flex h-10 ${getButtonWidthClass(buttons.cancel, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} border border-border bg-muted text-sm text-muted-foreground`}
          >
            {buttons.cancel}
          </span>{" "}
          {showMedia ? t("bigPicture.upBack") : t("bigPicture.back")}
        </div>
      </div>
    </div>
  );
};

export { GameDetailsView };
