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
import { useImageLoader } from "@/hooks/useImageLoader";
import { analytics } from "@/services/analyticsService";
import ratingQueueService from "@/services/ratingQueueService";
import installedGamesService from "@/services/installedGamesService";

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

  // Fetch rating from queue service when using local index
  // This ensures ratings are fetched one at a time to prevent API flooding
  useEffect(() => {
    if (!settings.usingLocalIndex || !game.gameID) return;

    // Check for cached rating first
    const cachedRating = ratingQueueService.getCachedRating(game.gameID);
    if (cachedRating !== null && cachedRating > 0) {
      setGameRating(cachedRating);
      return;
    }

    // Subscribe to rating updates - will be processed in queue
    const unsubscribe = ratingQueueService.subscribe(game.gameID, rating => {
      if (isMounted.current && rating > 0) {
        setGameRating(rating);
      }
    });

    return () => unsubscribe();
  }, [game.gameID, settings.usingLocalIndex]);

  const handleDownload = useCallback(() => {
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
  }, [navigate, game, isInstalled, needsUpdate, t]);

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

  if (compact) {
    return (
      <div className="flex cursor-pointer gap-4 rounded-lg p-2 transition-colors hover:bg-secondary/50">
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

  return (
    <Card
      ref={cardRef}
      className="group flex min-h-[400px] flex-col overflow-hidden border-none bg-card text-card-foreground transition-all duration-300 animate-in fade-in-50 hover:shadow-lg"
    >
      <CardContent className="flex-1 p-0">
        <div className="relative">
          <AspectRatio ratio={16 / 9}>
            {loading && !cachedImage && (
              <Skeleton className="absolute inset-0 h-full w-full bg-muted" />
            )}
            {cachedImage && (
              <img
                src={cachedImage}
                alt={game.game}
                className={`h-full w-full object-cover transition-opacity duration-300 ${
                  loading ? "opacity-0" : "opacity-100"
                }`}
              />
            )}
          </AspectRatio>
          <div className="absolute right-2 top-2 flex gap-2">
            {game.dlc && (
              <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
                <Gift className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">{t("gameCard.dlc")}</span>
              </div>
            )}
            {game.online && (
              <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
                <Gamepad2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">{t("gameCard.online")}</span>
              </div>
            )}
          </div>
        </div>
        <div className="h-full p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="line-clamp-1 text-lg font-semibold text-foreground">
              {sanitizeText(game.game)}
            </h3>
            {gameRating > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-help items-center">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                          fill="#FFD700"
                          stroke="#FFD700"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <text
                          x="50%"
                          y="55%"
                          dominantBaseline="middle"
                          textAnchor="middle"
                          fill="#000"
                          fontSize="10"
                          fontWeight="bold"
                        >
                          {Math.round(gameRating)}
                        </text>
                      </svg>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[250px] font-semibold text-secondary">
                    <p>{t("gameCard.ratingTooltip")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {categories.map((cat, index) => (
              <Badge
                key={`${cat}-${index}`}
                variant="secondary"
                className="text-secondary-foreground bg-secondary text-xs animate-in fade-in-50 slide-in-from-left-3"
              >
                {cat}
              </Badge>
            ))}
            {!showAllTags && gameCategories.length > 3 && (
              <Badge
                variant="outline"
                className="cursor-pointer border-muted-foreground text-xs text-muted-foreground transition-colors hover:bg-accent"
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
                className="cursor-pointer border-muted-foreground text-xs text-muted-foreground transition-colors animate-in fade-in-50 hover:bg-accent"
                onClick={e => {
                  e.stopPropagation();
                  setShowAllTags(false);
                }}
              >
                {t("gameCard.showLess")}
              </Badge>
            )}
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            {game.size && (
              <p>
                {t("gameCard.size")}:{" "}
                <span className="font-medium md:text-xs">{game.size}</span>
              </p>
            )}
            {game.version && (
              <p>
                {t("gameCard.version")}:{" "}
                <span className="font-medium md:text-xs">{game.version}</span>
              </p>
            )}
          </div>
          {game.latest_update && (
            <div className="mt-1 flex items-center gap-2 text-sm text-primary/80">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-muted-foreground md:text-xs">
                {formatLatestUpdate(game.latest_update)}
              </span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 p-4">
        {/* Play Later Button */}
        {!isInstalled && (
          <Button
            variant="ghost"
            size="sm"
            className={`w-full gap-2 ${isPlayLater ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            onClick={handlePlayLater}
          >
            {isPlayLater ? (
              <>
                <Check className="h-4 w-4" />
                {t("gameCard.addedToPlayLater")}
              </>
            ) : (
              <>
                <Clock className="h-4 w-4" />
                {t("gameCard.playLater")}
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
                variant="secondary"
                size="sm"
                className={`w-full bg-accent font-medium text-accent-foreground hover:bg-accent/90 ${showProviderBadge ? "rounded-b-none" : ""}`}
                onClick={handleDownload}
                disabled={isLoading}
              >
                {isLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                {!isLoading && needsUpdate && (
                  <ArrowUpFromLine className="mr-2 h-4 w-4 stroke-[3]" />
                )}
                {!isLoading && isInstalled && !needsUpdate && (
                  <Gamepad2 className="mr-2 h-3 w-3" />
                )}
                {!isLoading && !isInstalled && (
                  <ArrowDown className="mr-2 h-3.5 w-3.5 stroke-[4]" />
                )}

                {isLoading
                  ? t("gameCard.loading")
                  : needsUpdate
                    ? t("gameCard.update")
                    : isInstalled
                      ? t("gameCard.installed")
                      : t("gameCard.download")}
              </Button>

              {showProviderBadge && (
                <div
                  className={`flex items-center justify-center rounded-b-md py-1 text-xs font-medium ${torboxEnabled ? "bg-primary/10 text-primary" : "text-secondary-foreground bg-secondary/20"}`}
                >
                  {torboxEnabled && (
                    <>
                      <TorboxIcon className="mr-1 h-6 w-6" />
                      Seamless with Torbox
                    </>
                  )}
                  {provider === "seamless" && (
                    <>
                      <Zap fill="currentColor" className="mr-1 h-3 w-3" />
                      Seamless
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </CardFooter>
    </Card>
  );
});

export default GameCard;
