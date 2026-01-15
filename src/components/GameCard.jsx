import React, { useState, memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Gift,
  Gamepad2,
  Zap,
  Loader,
  ArrowUpFromLine,
  ArrowDown,
  Calendar,
  Clock,
  Check,
  Info,
  Download,
  Wrench,
  Puzzle,
  Cloud,
  Trophy,
  Star,
} from "lucide-react";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import TorboxIcon from "./TorboxIcon";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import torboxService from "@/services/torboxService";
import { sanitizeText, formatLatestUpdate } from "@/lib/utils";
import ratingQueueService from "@/services/ratingQueueService";
import installedGamesService from "@/services/installedGamesService";
import { analytics } from "@/services/analyticsService";
import { useImageLoader } from "@/hooks/useImageLoader";

const GameCard = memo(function GameCard({ game, compact }) {
  const navigate = useNavigate();
  const [showAllTags, setShowAllTags] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isPlayLater, setIsPlayLater] = useState(false);
  const cardRef = useRef(null);
  const { cachedImage, loading, error } = useImageLoader(game?.imgID, {
    quality: isVisible ? "high" : "low",
    priority: isVisible ? "high" : "low",
    enabled: !!game?.imgID,
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gameRating, setGameRating] = useState(game?.rating || 0);
  const isMounted = useRef(true);
  const { t } = useLanguage();
  const { settings } = useSettings();

  // Check if game is in Play Later list
  useEffect(() => {
    if (!game?.game) return;
    const playLaterGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");
    const isInList = playLaterGames.some(g => g.game === game.game);
    setIsPlayLater(isInList);
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

    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current);
      }
    };
  }, []);

  if (!game) {
    return null;
  }

  const gameCategories = Array.isArray(game.category) ? game.category : [];

  const categories = useMemo(() => {
    return showAllTags ? gameCategories : gameCategories.slice(0, 3);
  }, [gameCategories, showAllTags]);

  useEffect(() => {
    // Use cached installed games service to prevent IPC flooding
    installedGamesService
      .checkGameStatus(game.game, game.version)
      .then(({ isInstalled: installed, needsUpdate: update }) => {
        if (isMounted.current) {
          setIsInstalled(installed);
          setNeedsUpdate(update);
        }
      })
      .catch(error => {
        console.error("Error checking game installation:", error);
      });

    return () => {
      isMounted.current = false;
    };
  }, [game.game, game.version]);

  // Fetch rating from queue service
  // This ensures ratings are fetched one at a time to prevent API flooding
  // and cached persistently in localStorage
  useEffect(() => {
    if (!game.gameID) return;

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

  // Handle Card Click (Navigation)
  const handleCardClick = useCallback(() => {
    const downloadLinks = game.download_links || {};
    navigate("/download", {
      state: {
        gameData: {
          ...game,
          download_links: downloadLinks,
          isUpdating: needsUpdate,
        },
      },
    });
  }, [navigate, game, needsUpdate]);

  // Handle Download Button Click
  const handleDownload = useCallback(
    e => {
      // Important: Prevent the click from going to the card
      e?.stopPropagation();

      if (isInstalled && !needsUpdate) return;
      setIsLoading(true);
      let buttonType = "download";
      if (needsUpdate) buttonType = "update";
      else if (isInstalled) buttonType = "install";
      analytics.trackGameButtonClick(game.game, buttonType, {
        isInstalled,
        needsUpdate,
      });

      const downloadLinks = game.download_links || {};
      setTimeout(() => {
        navigate("/download", {
          state: {
            gameData: {
              ...game,
              download_links: downloadLinks,
              isUpdating: needsUpdate,
            },
          },
        });
      });
    },
    [navigate, game, isInstalled, needsUpdate, t]
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
          game: game.game,
          gameID: game.gameID,
          imgID: game.imgID,
          version: game.version,
          size: game.size,
          category: game.category,
          dlc: game.dlc,
          online: game.online,
          download_links: game.download_links,
          desc: game.desc,
          addedAt: Date.now(),
        };
        playLaterGames.push(gameToSave);
        localStorage.setItem("play-later-games", JSON.stringify(playLaterGames));

        // Cache the image if available
        if (cachedImage) {
          try {
            localStorage.setItem(`play-later-image-${game.game}`, cachedImage);
          } catch (e) {
            console.warn("Could not cache play later image:", e);
          }
        }

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
        className="flex cursor-pointer gap-4 rounded-lg p-2 transition-colors hover:bg-secondary/50"
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
  return (
    <Card
      ref={cardRef}
      onClick={handleCardClick}
      className="group relative flex min-h-[380px] cursor-pointer flex-col overflow-hidden bg-card transition-all duration-300 animate-in fade-in-50 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10"
    >
      <CardContent className="flex-1 p-0">
        {/* Image Section */}
        <div className="relative overflow-hidden rounded-t-lg">
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
                {/* Subtle vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              </>
            )}
          </AspectRatio>

          {/* Top Status Bar */}
          <div className="absolute left-0 right-0 top-0 flex items-start justify-between p-3">
            {/* Rating */}
            {gameRating > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-help items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 backdrop-blur-sm animate-in fade-in-50 slide-in-from-left-3">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-bold text-white">
                        {Math.round(gameRating)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("gameCard.ratingTooltip")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Status Badge */}
            {(isInstalled || needsUpdate) && (
              <div
                className={`rounded-full px-2.5 py-1 backdrop-blur-sm animate-in fade-in-50 slide-in-from-right-3 ${
                  needsUpdate
                    ? "bg-amber-500/90 text-white"
                    : "bg-green-500/90 text-white"
                }`}
              >
                <span className="text-xs font-semibold">
                  {needsUpdate ? t("gameCard.updateAvailable") : t("gameCard.installed")}
                </span>
              </div>
            )}
          </div>

          {/* Bottom Info Bar on Image */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-8">
            <h3 className="mb-2 line-clamp-2 text-lg font-bold leading-tight text-white">
              {sanitizeText(game.game)}
            </h3>

            {/* Compact Feature Icons */}
            {(game.dlc || game.online) && (
              <div className="flex items-center gap-2">
                {game.dlc && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 backdrop-blur-sm transition-all hover:bg-white/20">
                          <Gift className="h-3.5 w-3.5 text-white" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("gameCard.dlcTooltip")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {game.online && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 backdrop-blur-sm transition-all hover:bg-white/20">
                          <Gamepad2 className="h-3.5 w-3.5 text-white" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("gameCard.onlineTooltip")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content Section */}
        <div className="space-y-3 p-4">
          {/* Categories - Compact */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat, index) => (
              <Badge
                key={`${cat}-${index}`}
                variant="secondary"
                className="text-secondary-foreground border-0 bg-secondary/50 px-2 py-0.5 text-xs"
              >
                {cat}
              </Badge>
            ))}
            {!showAllTags && gameCategories.length > 3 && (
              <Badge
                variant="outline"
                className="cursor-pointer border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                onClick={e => {
                  e.stopPropagation();
                  setShowAllTags(true);
                }}
              >
                +{gameCategories.length - 3}
              </Badge>
            )}
            {showAllTags && (
              <Badge
                variant="outline"
                className="cursor-pointer border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground transition-colors animate-in fade-in-50 hover:bg-accent"
                onClick={e => {
                  e.stopPropagation();
                  setShowAllTags(false);
                }}
              >
                {t("gameCard.showLess")}
              </Badge>
            )}
          </div>

          {/* Game Info - Inline */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {game.size && (
              <div className="flex items-center gap-1">
                <Download className="h-3 w-3" />
                <span className="font-medium">{game.size}</span>
              </div>
            )}
            {game.version && (
              <div className="flex items-center">
                <span className="font-medium">v{game.version}</span>
              </div>
            )}
            {game.latest_update && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatLatestUpdate(game.latest_update)}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 border-t p-4">
        {/* Play Later Button */}
        {!isInstalled && (
          <Button
            variant="ghost"
            size="sm"
            className={`w-full gap-2 transition-all duration-200 ${isPlayLater ? "text-primary hover:bg-primary/5" : "text-muted-foreground hover:text-foreground"}`}
            onClick={handlePlayLater}
          >
            {isPlayLater ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">
                  {t("gameCard.addedToPlayLater")}
                </span>
              </>
            ) : (
              <>
                <Clock className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">{t("gameCard.playLater")}</span>
              </>
            )}
          </Button>
        )}
        {(() => {
          // Determine button state and provider
          const buttonState = isLoading
            ? "loading"
            : needsUpdate
              ? "update"
              : isInstalled
                ? "installed"
                : "download";

          const seamlessHosts = ["gofile", "buzzheavier", "pixeldrain"];
          const torboxHosts = ["1fichier", "datanodes", "qiwi", "megadb"];
          const prioritizedTorbox = settings.prioritizeTorboxOverSeamless;
          const downloadLinks = game.download_links || {};
          const allHosts = Object.keys(downloadLinks);

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
          if (
            prioritizedTorbox &&
            ["gofile", "buzzheavier", "datanodes", "pixeldrain"].includes(host)
          ) {
            provider = "torbox";
          } else if (seamlessHosts.includes(host)) {
            provider = "seamless";
          } else if (torboxHosts.includes(host)) {
            provider = "torbox";
          }

          // Only show provider badge for download state
          const showProviderBadge = !isLoading && !isInstalled && provider !== "default";
          const torboxEnabled =
            provider === "torbox" && torboxService.isEnabled(settings);

          return (
            <div className="w-full">
              <Button
                variant={needsUpdate ? "default" : isInstalled ? "secondary" : "default"}
                className={`w-full gap-2 font-semibold transition-all duration-200 ${
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
                {!isLoading && isInstalled && !needsUpdate && (
                  <Check className="h-4 w-4" />
                )}
                {!isLoading && !isInstalled && !needsUpdate && (
                  <Info className="h-4 w-4" />
                )}

                <span>
                  {isLoading
                    ? t("gameCard.loading")
                    : needsUpdate
                      ? t("gameCard.update")
                      : isInstalled
                        ? t("gameCard.installed")
                        : t("gameCard.viewDetails")}
                </span>

                {showProviderBadge && (
                  <div className="ml-auto flex items-center gap-1">
                    {torboxEnabled && <TorboxIcon className="h-4 w-4" />}
                    {provider === "seamless" && (
                      <Zap fill="currentColor" className="h-3 w-3" />
                    )}
                  </div>
                )}
              </Button>
            </div>
          );
        })()}
      </CardFooter>
    </Card>
  );
});

export default GameCard;
