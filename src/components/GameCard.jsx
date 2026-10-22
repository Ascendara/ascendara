import { useState, memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  compatLabel,
  HighballCompatBadge,
  useHighballCompat,
} from "@/components/HighballCompatibility";
import { Button } from "@/components/ui/button";
import {
  Gift,
  Gamepad2,
  BookOpen,
  Zap,
  Loader,
  ArrowUpFromLine,
  Calendar,
  Clock,
  Check,
  Info,
  Trophy,
  Star,
  ShieldCheck,
  Heart,
  Eye,
  HardDrive,
  Tag,
  Sparkles,
} from "lucide-react";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import TorboxIcon from "./TorboxIcon";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import torboxService from "@/services/downloads/torboxService";
import { sanitizeText, formatLatestUpdate, formatCompactNumber } from "@/lib/utils";
import ratingQueueService from "@/services/games/ratingQueueService";
import installedGamesService from "@/services/library/installedGamesService";
import { useImageLoader } from "@/hooks/useImageLoader";
import usePrivateArtwork from "@/hooks/usePrivateArtwork";
import verifiedGamesService from "@/services/games/verifiedGamesService";
import gamePagePreparer from "@/services/games/gamePagePreparer";
import {
  SEAMLESS_PROVIDERS,
  TORBOX_PROVIDERS,
  TORBOX_ELIGIBLE_SEAMLESS,
} from "@/config/providers";

const MAX_VISIBLE_TAGS = 3;
const RECENT_UPDATE_DAYS = 14;

// Short, card-friendly update label plus whether it counts as a recent update
function getUpdateInfo(latest_update) {
  if (!latest_update) return null;
  const date = new Date(latest_update);
  if (Number.isNaN(date.getTime())) return null;
  const diffDays = Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  const isRecent = diffDays < RECENT_UPDATE_DAYS;
  return {
    isRecent,
    label: isRecent
      ? formatLatestUpdate(latest_update)
      : date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
    full: date.toLocaleDateString(undefined, { dateStyle: "long" }),
  };
}

const GameCard = memo(function GameCard(props) {
  return props.game ? <GameCardContent {...props} /> : null;
});

function GameCardContent({ game, compact, viewCount }) {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [isPlayLater, setIsPlayLater] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const cardRef = useRef(null);
  const privateImage = usePrivateArtwork(isVisible ? game?.privateSource : null);
  // Apple Silicon: how this game runs through Highball, looked up once visible
  const macCompat = useHighballCompat({ title: game?.game, enabled: isVisible });
  const {
    cachedImage: publicImage,
    loading,
    error,
  } = useImageLoader(game?.imgID, {
    quality: isVisible ? "high" : "low",
    priority: isVisible ? "high" : "low",
    enabled: !game?.privateSource && (!!game?.imgID || (!game?.imgID && !!game?.game)),
    fallbackGameName: !game?.privateSource && !game?.imgID ? game?.game : null,
    fallbackSlot: "card",
  });
  const cachedImage = game?.privateSource ? privateImage : publicImage;
  const [isInstalled, setIsInstalled] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { key: locationKey } = useLocation();

  // The Search page stays mounted while hidden, so the loading state set by the
  // details button must be cleared once navigation has completed.
  useEffect(() => {
    setIsLoading(false);
  }, [locationKey]);

  const [gameRating, setGameRating] = useState(game?.rating || 0);
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifiedDialog, setShowVerifiedDialog] = useState(false);
  const isMounted = useRef(true);
  const prefetchTimer = useRef(null);
  const dialogJustClosed = useRef(false);
  const { t } = useLanguage();
  const { settings } = useSettings();

  // Check if game is in Play Later list
  useEffect(() => {
    if (!game?.game) return;
    const playLaterGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");
    const isInList = playLaterGames.some(g => g.game === game.game);
    setIsPlayLater(isInList);
    const favorites = JSON.parse(localStorage.getItem("game-favorites") || "[]");
    setIsFavorite(favorites.includes(game.game));

    const syncFavorite = () => {
      const favs = JSON.parse(localStorage.getItem("game-favorites") || "[]");
      setIsFavorite(favs.includes(game.game));
    };
    window.addEventListener("favorites-updated", syncFavorite);
    return () => window.removeEventListener("favorites-updated", syncFavorite);
  }, [game?.game]);

  // Setup intersection observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        rootMargin: "200px", // Increased for earlier preloading
        threshold: 0.1,
      }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const gameCategories = Array.isArray(game.category) ? game.category : [];
  const categories = gameCategories.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCategories = gameCategories.slice(MAX_VISIBLE_TAGS);

  const updateInfo = useMemo(
    () => getUpdateInfo(game.latest_update),
    [game.latest_update]
  );

  useEffect(() => {
    let active = true;
    isMounted.current = true;
    // Use cached installed games service to prevent IPC flooding
    installedGamesService
      .checkGameStatus(game.game, game.version)
      .then(({ isInstalled: installed, needsUpdate: update }) => {
        if (active) {
          setIsInstalled(installed);
          setNeedsUpdate(update);
        }
      })
      .catch(error => {
        console.error("Error checking game installation:", error);
      });

    return () => {
      active = false;
      isMounted.current = false;
      clearTimeout(prefetchTimer.current);
    };
  }, [game.game, game.version]);

  // Fetch rating from queue service
  // This ensures ratings are fetched one at a time to prevent API flooding
  // and cached persistently in localStorage
  useEffect(() => {
    if (!game.gameID || game.privateSource) return;

    // If game already has a rating from the API response, use it
    if (game.rating && game.rating > 0) {
      setGameRating(game.rating);
      return;
    }

    // Check for cached rating first (loads immediately from localStorage)
    const cachedRating = ratingQueueService.getCachedRating(game.gameID);
    if (cachedRating !== null && cachedRating > 0) {
      setGameRating(cachedRating);
      // Don't return - still subscribe to get fresh rating in background
    }

    // Subscribe to rating updates - will be processed in queue
    const unsubscribe = ratingQueueService.subscribe(game.gameID, rating => {
      if (isMounted.current && rating > 0) {
        setGameRating(rating);
      }
    });

    return () => unsubscribe();
  }, [game.gameID, game.rating]);

  // Check if game is verified
  useEffect(() => {
    if (!game?.gameID || game.privateSource) return;

    verifiedGamesService.loadVerifiedGames().then(() => {
      if (isMounted.current) {
        setIsVerified(verifiedGamesService.isVerified(game.gameID));
      }
    });
  }, [game?.gameID]);

  // Opens the download page once its artwork and details are ready, so
  // nothing loads or swaps in after it appears
  const openDownloadPage = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    await gamePagePreparer.prepare(game);
    if (!isMounted.current) return;
    setIsLoading(false);
    navigate("/download", {
      state: {
        gameData: {
          ...game,
          download_links: game.download_links || {},
          isUpdating: needsUpdate,
        },
      },
    });
  }, [navigate, game, needsUpdate, isLoading]);

  // Handle Card Click (Navigation)
  const handleCardClick = useCallback(() => {
    // Prevent navigation if dialog was just closed
    if (dialogJustClosed.current) {
      dialogJustClosed.current = false;
      return;
    }
    openDownloadPage();
  }, [openDownloadPage]);

  // Handle Download Button Click
  const handleDownload = useCallback(
    e => {
      // Important: Prevent the click from going to the card
      e?.stopPropagation();

      if (isInstalled && !needsUpdate) return;
      openDownloadPage();
    },
    [openDownloadPage, isInstalled, needsUpdate]
  );

  // Handle Favorite Click
  const handleFavorite = useCallback(
    e => {
      e.stopPropagation();
      const favorites = JSON.parse(localStorage.getItem("game-favorites") || "[]");
      const meta = JSON.parse(localStorage.getItem("game-favorites-meta") || "{}");
      let updated;
      if (isFavorite) {
        updated = favorites.filter(name => name !== game.game);
        delete meta[game.game];
      } else {
        updated = [...favorites, game.game];
        meta[game.game] = {
          privateSource: game.privateSource,
          imgID: game.imgID || null,
          gameID: game.gameID || null,
          version: game.version || null,
          size: game.size || null,
          category: game.category || null,
          dlc: game.dlc || false,
          online: game.online || false,
          storyOnly: game.storyOnly || false,
          download_links: game.download_links || null,
          desc: game.desc || null,
        };
      }
      localStorage.setItem("game-favorites", JSON.stringify(updated));
      localStorage.setItem("game-favorites-meta", JSON.stringify(meta));
      setIsFavorite(!isFavorite);
      window.dispatchEvent(new CustomEvent("favorites-updated"));
    },
    [game, isFavorite]
  );

  // Handle Play Later Click
  const handlePlayLater = useCallback(
    e => {
      e.stopPropagation();
      const playLaterGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");

      if (isPlayLater) {
        // Remove from list and cached image
        const updatedList = playLaterGames.filter(g => g.game !== game.game);
        localStorage.setItem("play-later-games", JSON.stringify(updatedList));
        localStorage.removeItem(`play-later-image-${game.game}`);
        setIsPlayLater(false);
      } else {
        // Add to list with essential game data
        const gameToSave = {
          privateSource: game.privateSource,
          privateMetadata: game.privateMetadata,
          packageType: game.packageType,
          game: game.game,
          gameID: game.gameID,
          imgID: game.imgID,
          version: game.version,
          size: game.size,
          category: game.category,
          dlc: game.dlc,
          online: game.online,
          storyOnly: game.storyOnly,
          download_links: game.download_links,
          desc: game.desc,
          addedAt: Date.now(),
        };
        playLaterGames.push(gameToSave);
        localStorage.setItem("play-later-games", JSON.stringify(playLaterGames));
        // play-later card images are no longer cached in localStorage (quota
        // issues); fetched on demand via IPC / SteamGridDB instead.
        setIsPlayLater(true);
      }
      // Dispatch event so Library can update
      window.dispatchEvent(new CustomEvent("play-later-updated"));
    },
    [game, isPlayLater, cachedImage]
  );

  // --- RENDER COMPACT MODE ---
  if (compact) {
    return (
      <div
        className="press flex cursor-pointer gap-4 rounded-lg p-2 transition-all hover:bg-secondary/50"
        onClick={handleCardClick}
      >
        <img
          src={cachedImage || game.banner || game.image}
          alt={game.title || game.game}
          className="h-[68px] w-[120px] rounded-lg object-cover"
        />
        <div>
          <h3 className="font-medium text-foreground">{sanitizeText(game.game)}</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {categories.map(cat => (
              <span key={cat} className="text-xs text-muted-foreground">
                {cat}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER CARD MODE ---
  // Pick the host the download page will use so the button can hint at the provider
  const seamlessHosts = SEAMLESS_PROVIDERS;
  const torboxHosts = TORBOX_PROVIDERS;
  const prioritizedTorbox = settings.prioritizeTorboxOverSeamless;
  const allHosts = Object.keys(game.download_links || {});

  let host;
  if (allHosts.includes("buzzheavier")) {
    host = "buzzheavier";
  } else {
    host =
      allHosts.find(h =>
        prioritizedTorbox
          ? ["gofile", "datanodes", ...torboxHosts].includes(h)
          : seamlessHosts.concat(torboxHosts).includes(h)
      ) || allHosts[0];
  }

  let provider = "default";
  if (prioritizedTorbox && TORBOX_ELIGIBLE_SEAMLESS.includes(host)) {
    provider = "torbox";
  } else if (seamlessHosts.includes(host)) {
    provider = "seamless";
  } else if (torboxHosts.includes(host)) {
    provider = "torbox";
  }

  // Only show provider badge for download state
  const showProviderBadge = !isLoading && !isInstalled && provider !== "default";
  const torboxEnabled = provider === "torbox" && torboxService.isEnabled(settings);

  const specs = [
    game.size && {
      key: "size",
      icon: HardDrive,
      label: t("gameCard.specs.size"),
      value: game.size,
    },
    game.version && {
      key: "version",
      icon: Tag,
      label: t("gameCard.specs.version"),
      value: game.version,
    },
    updateInfo && {
      key: "updated",
      icon: Calendar,
      label: t("gameCard.specs.updated"),
      value: updateInfo.label,
      title: updateInfo.full,
      highlight: updateInfo.isRecent,
    },
  ].filter(Boolean);

  const hasStats =
    gameRating > 0 || viewCount > 0 || game.dlc || game.online || game.storyOnly;

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Card
          ref={cardRef}
          onClick={() => {
            // Double-check dialog wasn't just closed
            if (!dialogJustClosed.current) {
              handleCardClick();
            }
          }}
          onPointerEnter={() => {
            // Only once the pointer rests here, so sweeping across a grid
            // doesn't queue lookups ahead of the game actually opened
            clearTimeout(prefetchTimer.current);
            prefetchTimer.current = setTimeout(
              () => gamePagePreparer.prefetch(game),
              200
            );
          }}
          onPointerLeave={() => clearTimeout(prefetchTimer.current)}
          aria-busy={isLoading}
          className="press group relative flex h-[420px] cursor-pointer flex-col overflow-hidden border-none bg-card transition-all duration-300 animate-in fade-in-50 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10"
        >
          {/* Image Section */}
          <div className="relative shrink-0 overflow-hidden rounded-t-lg">
            <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-t-lg">
              {loading && !cachedImage && (
                <Skeleton className="absolute inset-0 h-full w-full bg-muted" />
              )}
              {cachedImage && (
                <>
                  <img
                    src={cachedImage}
                    alt={game.game}
                    className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${
                      loading ? "opacity-0" : "opacity-100"
                    } group-hover:scale-110`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
                </>
              )}
            </AspectRatio>

            {/* Top: verified + install status */}
            <div className="absolute left-0 right-0 top-0 flex items-start justify-between gap-2 p-2.5">
              {isVerified ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setShowVerifiedDialog(true);
                      }}
                      className="flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-secondary shadow-[0_0_12px_rgba(59,130,246,0.55)] transition-transform animate-in fade-in-50 slide-in-from-left-3 hover:scale-105"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {t("gameCard.verified.short")}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-secondary">
                      {t("gameCard.verified.badge")} ·{" "}
                      {t("gameCard.verified.clickForInfo")}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span />
              )}

              {(isInstalled || needsUpdate) && (
                <div
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm animate-in fade-in-50 slide-in-from-right-3 ${
                    needsUpdate ? "bg-amber-500/90" : "bg-green-500/90"
                  }`}
                >
                  {needsUpdate ? (
                    <ArrowUpFromLine className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  {needsUpdate ? t("gameCard.updateAvailable") : t("gameCard.installed")}
                </div>
              )}
            </div>

            {isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55 text-white backdrop-blur-[2px] animate-in fade-in-0">
                <Loader className="h-6 w-6 animate-spin" />
                <span className="text-xs font-medium">{t("gameCard.loading")}</span>
              </div>
            )}

            {/* Bottom-right: Mac compatibility from highball-db */}
            {macCompat && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/65 backdrop-blur-sm">
                    <HighballCompatBadge
                      compat={macCompat}
                      short
                      className="px-2 py-0.5 text-[11px]"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-secondary">{compatLabel(macCompat, t)}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Bottom-left: fresh update ribbon */}
            {updateInfo?.isRecent && !needsUpdate && (
              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-emerald-300 backdrop-blur-sm">
                <Sparkles className="h-3 w-3" />
                {t("gameCard.recentlyUpdated")}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pb-3 pt-3">
            <h3
              className="line-clamp-2 text-base font-bold leading-snug text-foreground"
              title={sanitizeText(game.game)}
            >
              {sanitizeText(game.game)}
            </h3>

            {/* Stats: rating, views, features */}
            {hasStats && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {gameRating > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-help items-center gap-1 font-semibold text-foreground">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <span className="tabular-nums">{Math.round(gameRating)}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-secondary">{t("gameCard.ratingTooltip")}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {viewCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-help items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        <span className="tabular-nums">
                          {t("gameCard.views", { views: formatCompactNumber(viewCount) })}
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-secondary">{t("gameCard.viewsTooltip")}</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {(game.dlc || game.online || game.storyOnly) && (
                  <div className="ml-auto flex items-center gap-1">
                    {game.dlc && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex cursor-default items-center gap-1 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-400">
                            <Gift className="h-3 w-3" />
                            {t("gameCard.dlc")}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-secondary">{t("gameCard.dlcTooltip")}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {game.online && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex cursor-default items-center gap-1 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-400">
                            <Gamepad2 className="h-3 w-3" />
                            {t("gameCard.online")}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-secondary">{t("gameCard.onlineTooltip")}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {game.storyOnly && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex cursor-default items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-400">
                            <BookOpen className="h-3 w-3" />
                            {t("gameCard.storyOnly")}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-secondary">
                            {t("download.storyOnlyTooltip")}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tags: single row, overflow collapses into +N */}
            {gameCategories.length > 0 && (
              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                {categories.map((cat, index) => (
                  <Badge
                    key={`${cat}-${index}`}
                    variant="secondary"
                    className="text-secondary-foreground min-w-0 shrink truncate border-0 bg-secondary/50 px-2 py-0.5 text-[11px] font-medium"
                  >
                    <span className="truncate">{cat}</span>
                  </Badge>
                ))}
                {hiddenCategories.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="shrink-0 cursor-help border-muted-foreground/30 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        +{hiddenCategories.length}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-secondary">{hiddenCategories.join(", ")}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}

            {/* Spec strip: size / version / updated */}
            {specs.length > 0 && (
              <div
                className="mt-auto grid divide-x divide-border/60 rounded-lg bg-muted/40"
                style={{ gridTemplateColumns: `repeat(${specs.length}, minmax(0, 1fr))` }}
              >
                {specs.map(({ key, icon: Icon, label, value, title, highlight }) => (
                  <div key={key} className="min-w-0 px-2.5 py-1.5" title={title || value}>
                    <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="truncate">{label}</span>
                    </div>
                    <div
                      className={`truncate text-xs font-semibold tabular-nums ${
                        highlight ? "text-emerald-500" : "text-foreground"
                      }`}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2 border-t p-3">
            <Button
              variant={needsUpdate ? "default" : isInstalled ? "secondary" : "default"}
              className={`min-w-0 flex-1 gap-2 font-semibold transition-all duration-200 ${
                needsUpdate
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : isInstalled
                    ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                    : "bg-primary text-secondary hover:bg-primary/90"
              } ${isLoading ? "opacity-70" : ""}`}
              onClick={handleDownload}
              disabled={isLoading || (isInstalled && !needsUpdate)}
            >
              {isLoading && <Loader className="h-4 w-4 animate-spin" />}
              {!isLoading && needsUpdate && <ArrowUpFromLine className="h-4 w-4" />}
              {!isLoading && isInstalled && !needsUpdate && <Check className="h-4 w-4" />}
              {!isLoading && !isInstalled && !needsUpdate && <Info className="h-4 w-4" />}

              <span className="truncate">
                {isLoading
                  ? t("gameCard.loading")
                  : needsUpdate
                    ? t("gameCard.update")
                    : isInstalled
                      ? t("gameCard.installed")
                      : t("gameCard.viewDetails")}
              </span>

              {showProviderBadge && (torboxEnabled || provider === "seamless") && (
                <div className="ml-auto flex items-center gap-1">
                  {torboxEnabled && <TorboxIcon className="h-4 w-4" />}
                  {provider === "seamless" && (
                    <Zap fill="currentColor" className="h-3 w-3" />
                  )}
                </div>
              )}
            </Button>

            {!isInstalled && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        isPlayLater
                          ? t("gameCard.removeFromPlayLater")
                          : t("gameCard.addToPlayLater")
                      }
                      className={`h-10 w-10 shrink-0 transition-all duration-200 ${
                        isPlayLater
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={handlePlayLater}
                    >
                      {isPlayLater ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-secondary">
                      {isPlayLater
                        ? t("gameCard.removeFromPlayLater")
                        : t("gameCard.addToPlayLater")}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        isFavorite ? t("gameCard.unfavorite") : t("gameCard.favorite")
                      }
                      className={`h-10 w-10 shrink-0 transition-all duration-200 ${
                        isFavorite
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={handleFavorite}
                    >
                      <Heart className={`h-4 w-4 ${isFavorite ? "fill-primary" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-secondary">
                      {isFavorite ? t("gameCard.unfavorite") : t("gameCard.favorite")}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </Card>
      </TooltipProvider>

      {/* Verified Game Info Dialog - Rendered outside Card to prevent click-through */}
      <AlertDialog
        open={showVerifiedDialog}
        onOpenChange={open => {
          if (!open) {
            dialogJustClosed.current = true;
            setTimeout(() => {
              dialogJustClosed.current = false;
            }, 500);
          }
          setShowVerifiedDialog(open);
        }}
      >
        <AlertDialogContent
          className="max-w-md border-primary/20"
          onClick={e => e.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold">
              {t("gameCard.verified.dialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 pt-4 text-left">
              <p className="text-base leading-relaxed">
                {
                  t("gameCard.verified.dialogDescription").split(
                    "verified by the Ascendara community"
                  )[0]
                }
                <span className="font-semibold text-primary">
                  {
                    t("gameCard.verified.dialogDescription").match(
                      /verified by the Ascendara community/
                    )?.[0]
                  }
                </span>
                {
                  t("gameCard.verified.dialogDescription").split(
                    "verified by the Ascendara community"
                  )[1]
                }
              </p>

              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <Trophy className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {t("gameCard.verified.highlyRated")}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t("gameCard.verified.highlyRatedDesc")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {t("gameCard.verified.mostPopular")}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t("gameCard.verified.mostPopularDesc")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {t("gameCard.verified.alwaysWorking")}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t("gameCard.verified.alwaysWorkingDesc")}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {t("gameCard.verified.selectionCriteria")}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end pt-2">
            <AlertDialogCancel
              className="border-primary/20 hover:bg-primary/10"
              onClick={e => {
                e.stopPropagation();
                dialogJustClosed.current = true;
                setShowVerifiedDialog(false);
                setTimeout(() => {
                  dialogJustClosed.current = false;
                }, 500);
              }}
            >
              {t("gameCard.verified.gotIt")}
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default GameCard;
