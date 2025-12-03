import React, { useState, useEffect, memo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import RecentGameCard from "@/components/RecentGameCard";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import {
  Flame,
  Globe,
  ChevronLeft,
  ChevronRight,
  Zap,
  Play,
  Sparkles,
  TrendingUp,
  Gamepad2,
  RefreshCw,
  ArrowRight,
  Gift,
  Heart,
  ExternalLink,
  HandCoins,
  BanknoteIcon,
} from "lucide-react";
import gameService from "@/services/gameService";
import Tour from "@/components/Tour";
import imageCacheService from "@/services/imageCacheService";
import recentGamesService from "@/services/recentGamesService";
import { cn } from "@/lib/utils";
import { sanitizeText } from "@/lib/utils";

// Module-level caches that persist during runtime
let gamesCache = null;
let carouselGamesCache = null;

// Compact Game Card for horizontal scrolling sections
const CompactGameCard = memo(({ game, onClick }) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const loadImage = async () => {
      if (game?.imgID) {
        const url = await imageCacheService.getImage(game.imgID);
        setImageUrl(url);
      }
    };
    loadImage();
  }, [game?.imgID]);

  return (
    <div
      className="group relative flex-shrink-0 cursor-pointer"
      style={{ width: "280px" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/30 bg-card transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5">
        <AspectRatio ratio={16 / 9}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={game.game}
              className={cn(
                "h-full w-full object-cover transition-transform duration-500",
                isHovered && "scale-110"
              )}
            />
          ) : (
            <Skeleton className="h-full w-full" />
          )}
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300",
              isHovered ? "opacity-100" : "opacity-70"
            )}
          />
        </AspectRatio>

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            {game.online && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/80">
                <Globe className="h-3 w-3 text-white" />
              </span>
            )}
            {game.dlc && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/80">
                <Gift className="h-3 w-3 text-white" />
              </span>
            )}
          </div>
          <h3 className="line-clamp-1 text-sm font-semibold text-white">
            {sanitizeText(game.game)}
          </h3>
        </div>

        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300",
            isHovered && "opacity-100"
          )}
        ></div>
      </div>
    </div>
  );
});

// Mini Game Card for category grids
const MiniGameCard = memo(({ game, onClick }) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const loadImage = async () => {
      if (game?.imgID) {
        const url = await imageCacheService.getImage(game.imgID);
        setImageUrl(url);
      }
    };
    loadImage();
  }, [game?.imgID]);

  return (
    <div
      className="group/mini relative cursor-pointer overflow-hidden rounded-lg"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <AspectRatio ratio={16 / 9}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={game.game}
            className={cn(
              "h-full w-full object-cover transition-transform duration-300",
              isHovered && "scale-110"
            )}
          />
        ) : (
          <Skeleton className="h-full w-full" />
        )}
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/70 to-transparent transition-opacity",
            isHovered ? "opacity-100" : "opacity-60"
          )}
        />
      </AspectRatio>
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="line-clamp-1 text-xs font-medium text-white">
          {sanitizeText(game.game)}
        </p>
      </div>
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-primary/20 opacity-0 transition-opacity",
          isHovered && "opacity-100"
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
          <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
});

// Mini Recent Card for hero sidebar - compact version
const MiniRecentCard = memo(({ game, onPlay }) => {
  const [imageData, setImageData] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [, setTick] = useState(0);
  const sanitizedGameName = sanitizeText(game.game || game.name);

  useEffect(() => {
    const loadImage = async () => {
      const gameId = game.game || game.name;
      const localStorageKey = `game-cover-${gameId}`;
      const cachedImage = localStorage.getItem(localStorageKey);
      if (cachedImage) {
        setImageData(cachedImage);
        return;
      }
      try {
        const imageBase64 = await window.electron.getGameImage(gameId);
        if (imageBase64) {
          const dataUrl = `data:image/jpeg;base64,${imageBase64}`;
          setImageData(dataUrl);
          try {
            localStorage.setItem(localStorageKey, dataUrl);
          } catch (e) {}
        }
      } catch (error) {}
    };
    loadImage();
  }, [game]);

  // Update time display every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const getTimeSinceLastPlayed = () => {
    const lastPlayed = new Date(game.lastPlayed);
    const now = new Date();
    const diffInMinutes = Math.floor((now - lastPlayed) / (1000 * 60));
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return diffInDays === 1 ? "Yesterday" : `${diffInDays}d ago`;
  };

  return (
    <div
      className="group relative min-h-0 flex-1 cursor-pointer overflow-hidden rounded-lg"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onPlay(game)}
    >
      {imageData ? (
        <img
          src={imageData}
          alt={sanitizedGameName}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-transform duration-300",
            isHovered && "scale-110"
          )}
        />
      ) : (
        <Skeleton className="absolute inset-0 h-full w-full" />
      )}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent transition-opacity",
          isHovered ? "opacity-100" : "opacity-70"
        )}
      />
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-md line-clamp-1 font-semibold text-white">
              {sanitizedGameName}
            </h3>
            <p className="text-[12px] text-white/70">{getTimeSinceLastPlayed()}</p>
          </div>
          <div
            className={cn(
              "ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-all",
              isHovered ? "scale-110 bg-primary" : "opacity-0"
            )}
          >
            <Play className="h-2.5 w-2.5" />
          </div>
        </div>
      </div>
    </div>
  );
});

// Horizontal Scroll Section Component
const HorizontalSection = ({
  title,
  icon: Icon,
  games,
  onGameClick,
  accentColor = "primary",
}) => {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = direction => {
    if (scrollRef.current) {
      const scrollAmount = 600;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    checkScroll();
    const ref = scrollRef.current;
    if (ref) {
      ref.addEventListener("scroll", checkScroll);
      return () => ref.removeEventListener("scroll", checkScroll);
    }
  }, [games]);

  if (!games?.length) return null;

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "mb-2 flex h-9 w-9 items-center justify-center rounded-lg",
              `bg-${accentColor}/10`
            )}
            style={{ backgroundColor: `rgb(var(--color-${accentColor}) / 0.1)` }}
          >
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {games.length}
          </span>
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-full",
              !canScrollLeft && "cursor-not-allowed opacity-30"
            )}
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-full",
              !canScrollRight && "cursor-not-allowed opacity-30"
            )}
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div
        ref={scrollRef}
        className="scrollbar-hide flex gap-4 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {games.map(game => (
          <CompactGameCard
            key={game.game}
            game={game}
            onClick={() => onGameClick(game)}
          />
        ))}
      </div>
    </div>
  );
};

const Home = memo(() => {
  const navigate = useNavigate();
  const [apiGames, setApiGames] = useState([]);
  const [installedGames, setInstalledGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [carouselGames, setCarouselGames] = useState([]);
  const [topGames, setTopGames] = useState([]);
  const [onlineGames, setOnlineGames] = useState([]);
  const [actionGames, setActionGames] = useState([]);
  const [popularCategories, setPopularCategories] = useState({});
  const { t } = useLanguage();
  const { settings } = useSettings();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTour, setShowTour] = useState(false);
  const [carouselImages, setCarouselImages] = useState({});
  const [recentGames, setRecentGames] = useState([]);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [featuredGame, setFeaturedGame] = useState(null);

  useEffect(() => {
    const loadGames = async () => {
      try {
        setLoading(true);

        // Use cache if available
        if (gamesCache && carouselGamesCache) {
          setApiGames(gamesCache);
          setCarouselGames(carouselGamesCache);

          // Still need to get installed games as they might have changed
          const installedGames = await window.electron.getGames();
          const customGames = await window.electron.getCustomGames();

          const actuallyInstalledGames = [
            ...(installedGames || []).map(game => ({
              ...game,
              isCustom: false,
            })),
            ...(customGames || []).map(game => ({
              ...game,
              isCustom: true,
            })),
          ];

          setInstalledGames(actuallyInstalledGames);
          setLoading(false);
          return;
        }

        // Fetch fresh data if no cache
        const [gamesData, carouselGames] = await Promise.all([
          gameService.getAllGames(),
          gameService.getRandomTopGames(),
        ]);
        const games = gamesData.games || [];

        // Update caches
        gamesCache = games;
        carouselGamesCache = carouselGames;

        // Get actually installed games from electron
        const installedGames = await window.electron.getGames();
        const customGames = await window.electron.getCustomGames();

        // Combine installed and custom games
        const actuallyInstalledGames = [
          ...(installedGames || []).map(game => ({
            ...game,
            isCustom: false,
          })),
          ...(customGames || []).map(game => ({
            ...game,
            isCustom: true,
          })),
        ];

        setApiGames(games);
        setInstalledGames(actuallyInstalledGames);
        setCarouselGames(carouselGames);
      } catch (error) {
        console.error("Error loading games:", error);
      } finally {
        setLoading(false);
      }
    };

    loadGames();
  }, []);

  useEffect(() => {
    if (searchParams.get("tour") === "true") {
      setShowTour(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!autoPlay || !carouselGames.length) return;
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev === carouselGames.length - 1 ? 0 : prev + 1));
    }, 5000);
    return () => clearInterval(timer);
  }, [autoPlay, carouselGames.length]);

  // Load carousel images - current, next two (for side cards), and one ahead
  useEffect(() => {
    if (!carouselGames.length) return;

    const loadCarouselImages = async () => {
      const totalSlides = carouselGames.length;
      // Load current slide + next 3 slides (for the "Up Next" sidebar and preloading)
      const slidesToLoad = [
        currentSlide,
        (currentSlide + 1) % totalSlides,
        (currentSlide + 2) % totalSlides,
        (currentSlide + 3) % totalSlides,
      ];

      for (const slideIndex of slidesToLoad) {
        const game = carouselGames[slideIndex];
        if (!game?.imgID || carouselImages[game.imgID]) continue;

        try {
          const imageUrl = await imageCacheService.getImage(game.imgID);
          if (imageUrl) {
            setCarouselImages(prev => ({
              ...prev,
              [game.imgID]: imageUrl,
            }));
          }
        } catch (error) {
          console.error(`Error loading carousel image for ${game.game}:`, error);
        }
      }
    };

    loadCarouselImages();
  }, [carouselGames, currentSlide]);

  // Initial load - preload all carousel images for smooth transitions
  useEffect(() => {
    if (!carouselGames.length) return;

    const preloadAllCarouselImages = async () => {
      for (const game of carouselGames) {
        if (!game?.imgID || carouselImages[game.imgID]) continue;

        try {
          const imageUrl = await imageCacheService.getImage(game.imgID);
          if (imageUrl) {
            setCarouselImages(prev => ({
              ...prev,
              [game.imgID]: imageUrl,
            }));
          }
        } catch (error) {
          console.error(`Error preloading carousel image for ${game.game}:`, error);
        }
      }
    };

    // Delay preloading to not block initial render
    const timer = setTimeout(preloadAllCarouselImages, 1000);
    return () => clearTimeout(timer);
  }, [carouselGames]);

  useEffect(() => {
    const updateRecentGames = async () => {
      const recent = await getRecentGames([...installedGames, ...apiGames]);
      setRecentGames(recent);
    };
    updateRecentGames();
  }, [installedGames, apiGames]);

  useEffect(() => {
    // Get game sections first
    const {
      topGames: topSection,
      onlineGames: onlineSection,
      actionGames: actionSection,
      usedGames,
    } = getGameSections(apiGames);

    // Then get popular categories, passing the used games set
    const popularCats = getPopularCategories(apiGames, usedGames);

    // Update state based on source
    const source = settings?.gameSource || "steamrip";
    if (source === "fitgirl") {
      // For fitgirl, track used games to avoid duplicates
      const usedGames = new Set([...recentGames.map(g => g.game)]);

      // Get online games first
      const onlineGamesSection = apiGames
        .filter(game => game.online && !usedGames.has(game.game))
        .sort(() => Math.random() - 0.5)
        .slice(0, 6);

      // Add online games to used set
      onlineGamesSection.forEach(game => usedGames.add(game.game));

      // Then get random non-online games, excluding used ones
      const randomGamesSection = apiGames
        .filter(game => !game.online && !usedGames.has(game.game))
        .sort(() => Math.random() - 0.5)
        .slice(0, 6);

      setTopGames(randomGamesSection);
      setOnlineGames(onlineGamesSection);
      setActionGames([]);
      setPopularCategories({});
    } else {
      // For steamrip, show all sections
      setTopGames(topSection);
      setOnlineGames(onlineSection);
      setActionGames(actionSection);
      setPopularCategories(popularCats);
    }
  }, [apiGames, settings?.gameSource, recentGames]);

  const getGameSections = games => {
    if (!Array.isArray(games)) return { topGames: [], onlineGames: [], actionGames: [] };

    // Create a shared Set to track used games across all sections
    const usedGames = new Set();

    // Get top games first (they get priority)
    const topGamesSection = games
      .filter(game => parseInt(game.weight || 0) > 30)
      .sort((a, b) => parseInt(b.weight || 0) - parseInt(a.weight || 0))
      .slice(0, 6);

    // Add top games to used set
    topGamesSection.forEach(game => usedGames.add(game.game));

    // Get online games, excluding used ones
    const onlineGamesSection = games
      .filter(game => game.online && !usedGames.has(game.game))
      .sort((a, b) => parseInt(b.weight || 0) - parseInt(a.weight || 0))
      .slice(0, 6);

    // Add online games to used set
    onlineGamesSection.forEach(game => usedGames.add(game.game));

    // Get action games, excluding used ones
    const actionGamesSection = games
      .filter(
        game =>
          Array.isArray(game.category) &&
          game.category.some(cat =>
            ["Action", "Adventure", "Fighting", "Shooter"].includes(cat)
          ) &&
          !usedGames.has(game.game)
      )
      .sort((a, b) => parseInt(b.weight || 0) - parseInt(a.weight || 0))
      .slice(0, 6);

    // Add action games to used set
    actionGamesSection.forEach(game => usedGames.add(game.game));

    return {
      topGames: topGamesSection,
      onlineGames: onlineGamesSection,
      actionGames: actionGamesSection,
      usedGames, // Return the set of used games for use in getPopularCategories
    };
  };

  const getPopularCategories = (games, usedGames = new Set()) => {
    if (!Array.isArray(games)) return {};

    const categories = {};

    // Helper function to get unique games for a category
    const getUniqueGamesForCategory = (category, count = 4) => {
      return games
        .filter(
          game =>
            game.category?.includes(category) &&
            !usedGames.has(game.game) &&
            parseInt(game.weight || 0) > 20
        )
        .sort((a, b) => parseInt(b.weight || 0) - parseInt(a.weight || 0))
        .slice(0, count)
        .map(game => {
          usedGames.add(game.game);
          return game;
        });
    };

    // Get games for each category
    const popularCategories = [
      "Action",
      "Adventure",
      "Survival",
      "Simulation",
      "Strategy",
      "Sports",
    ];

    popularCategories.forEach(category => {
      const categoryGames = getUniqueGamesForCategory(category);
      if (categoryGames.length >= 2) {
        categories[category] = categoryGames;
      }
    });

    return categories;
  };

  const getRecentGames = async games => {
    const recentlyPlayed = recentGamesService.getRecentGames();

    try {
      // Get actually installed games from electron
      const installedGames = await window.electron.getGames();
      const customGames = await window.electron.getCustomGames();

      // Combine installed and custom games
      const actuallyInstalledGames = [
        ...(installedGames || []).map(game => ({
          ...game,
          isCustom: false,
        })),
        ...(customGames || []).map(game => ({
          name: game.game,
          game: game.game,
          version: game.version,
          online: game.online,
          dlc: game.dlc,
          executable: game.executable,
          isCustom: true,
        })),
      ];

      // Filter out games that are no longer installed and merge with full game details
      return recentlyPlayed
        .filter(recentGame =>
          actuallyInstalledGames.some(g => g.game === recentGame.game)
        )
        .map(recentGame => {
          const gameDetails =
            games.find(g => g.game === recentGame.game) ||
            actuallyInstalledGames.find(g => g.game === recentGame.game);
          return {
            ...gameDetails,
            lastPlayed: recentGame.lastPlayed,
          };
        });
    } catch (error) {
      console.error("Error getting installed games:", error);
      return [];
    }
  };

  const handlePlayGame = async game => {
    try {
      await window.electron.playGame(game.game || game.name, game.isCustom);

      // Get and cache the game image
      const imageBase64 = await window.electron.getGameImage(game.game || game.name);
      if (imageBase64) {
        await imageCacheService.getImage(game.imgID);
      }

      // Update recently played
      recentGamesService.addRecentGame({
        game: game.game || game.name,
        name: game.name,
        imgID: game.imgID,
        version: game.version,
        isCustom: game.isCustom,
        online: game.online,
        dlc: game.dlc,
      });
    } catch (error) {
      console.error("Error playing game:", error);
    }
  };

  const handlePrevSlide = useCallback(() => {
    setCurrentSlide(prev => (prev === 0 ? carouselGames.length - 1 : prev - 1));
    setAutoPlay(false);
  }, [carouselGames]);

  const handleNextSlide = useCallback(() => {
    setCurrentSlide(prev => (prev === carouselGames.length - 1 ? 0 : prev + 1));
    setAutoPlay(false);
  }, [carouselGames]);

  const handleCloseTour = useCallback(() => {
    setShowTour(false);
    setSearchParams({});
  }, [setSearchParams]);

  const handleCarouselGameClick = useCallback(
    game => {
      const container = document.querySelector(".page-container");
      if (container) {
        container.classList.add("fade-out");
      }

      setTimeout(() => {
        navigate("/download", {
          state: {
            gameData: game,
          },
        });
      }, 300);
    },
    [navigate]
  );

  const handleTouchStart = useCallback(e => {
    setTouchStart(e.touches[0].clientX);
    setTouchEnd(e.touches[0].clientX);
    setIsDragging(true);
    setDragStart(e.touches[0].clientX);
    setAutoPlay(false);
  }, []);

  const handleTouchMove = useCallback(
    e => {
      if (!isDragging) return;
      setTouchEnd(e.touches[0].clientX);
      const offset = e.touches[0].clientX - dragStart;
      setDragOffset(offset);
    },
    [isDragging, dragStart]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    const diff = touchStart - touchEnd;
    const threshold = window.innerWidth * 0.2; // 20% of screen width

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        handleNextSlide();
      } else {
        handlePrevSlide();
      }
    }
    setDragOffset(0);
  }, [touchStart, touchEnd]);

  const handleMouseDown = useCallback(e => {
    setIsDragging(true);
    setDragStart(e.clientX);
    setAutoPlay(false);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback(
    e => {
      if (!isDragging) return;
      const offset = e.clientX - dragStart;
      setDragOffset(offset);
      e.preventDefault();
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(
    e => {
      if (!isDragging) return;
      setIsDragging(false);
      const diff = dragStart - e.clientX;
      const threshold = window.innerWidth * 0.2;

      if (Math.abs(diff) > threshold) {
        if (diff > 0) {
          handleNextSlide();
        } else {
          handlePrevSlide();
        }
      }
      setDragOffset(0);
      e.preventDefault();
    },
    [isDragging, dragStart]
  );

  const handleMouseLeave = useCallback(
    e => {
      if (isDragging) {
        handleMouseUp(e);
      }
    },
    [isDragging, handleMouseUp]
  );

  // Get recently updated games
  const recentlyUpdatedGames = apiGames
    .filter(game => !!game.latest_update)
    .sort((a, b) => new Date(b.latest_update) - new Date(a.latest_update))
    .slice(0, 10);

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="px-6 py-6">
          {/* Hero Skeleton */}
          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
            </div>
            <div className="hidden space-y-4 lg:block">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <Skeleton className="aspect-video w-full rounded-xl" />
            </div>
          </div>

          {/* Horizontal Section Skeletons */}
          {[1, 2, 3].map(i => (
            <div key={i} className="mb-8">
              <div className="mb-4 flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-5 w-32" />
              </div>
              <div className="flex gap-4">
                {Array(5)
                  .fill(0)
                  .map((_, j) => (
                    <Skeleton key={j} className="h-40 w-72 flex-shrink-0 rounded-xl" />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Safely get current game
  const currentGame = carouselGames.length > 0 ? carouselGames[currentSlide] : null;

  // If no carousel games, show a simpler layout
  const hasCarousel = carouselGames.length > 0 && currentGame;

  return (
    <div className="min-h-screen bg-background">
      {showTour && <Tour onClose={handleCloseTour} />}

      <div className="px-6 py-6">
        {/* Hero Section - Split Layout */}
        {hasCarousel && (
          <section className="mb-10">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Main Featured Game */}
              <div
                className="group relative lg:col-span-2"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div
                  className="relative cursor-pointer overflow-hidden rounded-2xl"
                  onClick={() =>
                    !isDragging && currentGame && handleCarouselGameClick(currentGame)
                  }
                >
                  <AspectRatio ratio={16 / 9}>
                    {carouselImages[currentGame?.imgID] ? (
                      <img
                        src={carouselImages[currentGame?.imgID]}
                        alt={currentGame?.game}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        draggable="false"
                      />
                    ) : (
                      <Skeleton className="h-full w-full" />
                    )}
                  </AspectRatio>

                  {/* Overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

                  {/* Content */}
                  <div className="absolute inset-0 flex flex-col justify-end p-6 lg:p-8">
                    <div className="max-w-xl space-y-4">
                      {/* Tags */}
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-primary/90 text-white">
                          <Sparkles className="mr-1 h-3 w-3" />
                          Featured
                        </Badge>
                        {currentGame?.online && (
                          <Badge
                            variant="outline"
                            className="border-white/30 bg-white/10 text-white backdrop-blur-sm"
                          >
                            <Globe className="mr-1 h-3 w-3" />
                            Online
                          </Badge>
                        )}
                        {currentGame?.dlc && (
                          <Badge
                            variant="outline"
                            className="border-white/30 bg-white/10 text-white backdrop-blur-sm"
                          >
                            <Gift className="mr-1 h-3 w-3" />
                            All DLC
                          </Badge>
                        )}
                      </div>

                      {/* Title */}
                      <h1 className="text-3xl font-bold text-white lg:text-4xl xl:text-5xl">
                        {sanitizeText(currentGame?.game || "")}
                      </h1>

                      {/* Categories */}
                      <div className="flex flex-wrap gap-2">
                        {currentGame?.category?.slice(0, 4).map((cat, idx) => (
                          <span
                            key={cat + idx}
                            className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80 backdrop-blur-sm"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>

                      {/* CTA */}
                      <Button
                        size="lg"
                        className="mt-2 gap-2 bg-primary text-white shadow-xl hover:bg-primary/60"
                        onClick={e => {
                          e.stopPropagation();
                          handleCarouselGameClick(currentGame);
                        }}
                      >
                        {t("home.viewGame") || "View Game"}
                      </Button>
                    </div>
                  </div>

                  {/* Slide Navigation */}
                  <div className="absolute bottom-6 right-6 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                      onClick={e => {
                        e.stopPropagation();
                        handlePrevSlide();
                      }}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex gap-1.5 px-2">
                      {carouselGames.map((_, index) => (
                        <button
                          key={index}
                          className={cn(
                            "h-1.5 rounded-full transition-all",
                            index === currentSlide
                              ? "w-6 bg-primary"
                              : "w-1.5 bg-white/40 hover:bg-white/60"
                          )}
                          onClick={e => {
                            e.stopPropagation();
                            setCurrentSlide(index);
                            setAutoPlay(false);
                          }}
                        />
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                      onClick={e => {
                        e.stopPropagation();
                        handleNextSlide();
                      }}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Side Cards - Recently Played */}
              <div
                className="hidden flex-col lg:flex"
                style={{ height: "calc(100% - 0px)" }}
              >
                <div className="mb-1 flex items-center gap-2 text-lg font-medium text-muted-foreground">
                  <Play className="h-3 w-3 text-primary" />
                  {t("home.recentGames")}
                </div>
                {recentGames.length > 0 ? (
                  <div className="flex flex-1 flex-col gap-1.5">
                    {recentGames.slice(0, 3).map((game, index) => (
                      <MiniRecentCard
                        key={`recent-hero-${game.game}-${index}`}
                        game={game}
                        onPlay={handlePlayGame}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card/50 p-3 text-center">
                    <Play className="mb-2 h-6 w-6 text-muted-foreground/40" />
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("home.noRecentGames")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground/70">
                      {t("home.noRecentGamesHint")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Recently Played - Mobile/Tablet (shows when sidebar is hidden) */}
        {recentGames.length > 0 && (
          <section className="mb-10 lg:hidden">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Play className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">
                {t("home.recentGames")}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {recentGames.slice(0, 4).map((game, index) => (
                <RecentGameCard
                  key={`recent-mobile-${game.game}-${index}`}
                  game={game}
                  onPlay={handlePlayGame}
                />
              ))}
            </div>
          </section>
        )}

        {/* Top Games - Horizontal Scroll */}
        {topGames.length > 0 && (
          <HorizontalSection
            title={
              settings?.gameSource === "fitgirl"
                ? t("home.randomGames")
                : t("home.topGames")
            }
            icon={TrendingUp}
            games={topGames}
            onGameClick={handleCarouselGameClick}
          />
        )}

        {/* Recently Updated - Horizontal Scroll */}
        {recentlyUpdatedGames.length > 0 && (
          <div className="mt-8">
            <HorizontalSection
              title={t("home.mostRecentlyUpdated")}
              icon={RefreshCw}
              games={recentlyUpdatedGames}
              onGameClick={handleCarouselGameClick}
            />
          </div>
        )}

        {/* Online Games - Horizontal Scroll */}
        {onlineGames.length > 0 && (
          <div className="mt-8">
            <HorizontalSection
              title={t("home.onlineGames")}
              icon={Globe}
              games={onlineGames}
              onGameClick={handleCarouselGameClick}
            />
          </div>
        )}

        {/* Action Games - Horizontal Scroll */}
        {settings?.gameSource !== "fitgirl" && actionGames.length > 0 && (
          <div className="mt-8">
            <HorizontalSection
              title={t("home.actionGames")}
              icon={Zap}
              games={actionGames}
              onGameClick={handleCarouselGameClick}
            />
          </div>
        )}

        {/* Popular Categories - Grid of Cards */}
        {settings?.gameSource !== "fitgirl" &&
          Object.keys(popularCategories).length > 0 && (
            <section className="mt-10">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Flame className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {t("home.popularCategories")}
                </h2>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(popularCategories).map(([category, games]) => (
                  <Card
                    key={category}
                    className="group overflow-hidden border-border/50 bg-gradient-to-br from-card to-card/50 transition-all hover:border-primary/30 hover:shadow-xl"
                  >
                    <CardContent className="p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                            <Gamepad2 className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-bold text-foreground">{category}</h3>
                            <p className="text-xs text-muted-foreground">
                              {games.length} games
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {games.slice(0, 4).map(game => (
                          <MiniGameCard
                            key={game.game}
                            game={game}
                            onClick={() => handleCarouselGameClick(game)}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

        {/* Footer - Support Section */}
        <footer className="mt-16 border-t border-border/30 pb-8 pt-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
                <BanknoteIcon className="h-7 w-7 text-primary" />
              </div>
            </div>

            <h3 className="mb-3 text-xl font-bold text-foreground">
              {t("home.footer.title")}
            </h3>

            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              {t("home.footer.description")}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => window.electron.openURL("https://ascendara.app/support")}
              >
                <HandCoins className="h-4 w-4" />
                {t("home.footer.donate")}
              </Button>
              <Button
                variant="ghost"
                className="gap-2 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  window.electron.openURL("https://github.com/ascendara/ascendara")
                }
              >
                <ExternalLink className="h-4 w-4" />
                {t("home.footer.github")}
              </Button>
            </div>

            <p className="mt-8 text-xs text-muted-foreground/60">
              {t("home.footer.madeWith")}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
});

export default Home;
