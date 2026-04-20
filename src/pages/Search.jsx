import React, { useState, useEffect, useMemo, memo, useCallback, useRef, useDeferredValue } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import GameContextMenu from "@/components/GameContextMenu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import GameCard from "@/components/GameCard";
import CategoryFilter from "@/components/CategoryFilter";
import {
  Search as SearchIcon,
  SlidersHorizontal,
  Gamepad2,
  Gift,
  InfoIcon,
  ExternalLink,
  RefreshCw,
  Clock,
  AlertTriangle,
  X,
  Calendar,
  Database,
  Sparkles,
  Users,
  TrendingUp,
  HardDrive,
} from "lucide-react";
import gameService from "@/services/gameService";
import {
  subscribeToStatus,
  getCurrentStatus,
  startStatusCheck,
} from "@/services/serverStatus";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogCancel,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useNavigate, useLocation } from "react-router-dom";
import imageCacheService from "@/services/imageCacheService";
import { formatLatestUpdate } from "@/lib/utils";
import verifiedGamesService from "@/services/verifiedGamesService";

// Module-level cache with timestamp
let gamesCache = {
  data: null,
  timestamp: null,
  expiryTime: 5 * 60 * 1000, // 5 minutes
};


// Debounce hook for search optimization
const useDebouncedValue = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

// Module-level fuzzy match cache (persists across renders)
const fuzzyMatchCache = new Map();
const createFuzzyMatch = () => {
  return (text, query) => {
    if (!text || !query) return false;

    const cacheKey = `${text.toLowerCase()}-${query.toLowerCase()}`;
    if (fuzzyMatchCache.has(cacheKey)) return fuzzyMatchCache.get(cacheKey);

    text = text.toLowerCase();
    query = query.toLowerCase();

    // Direct substring match for better performance
    if (text.includes(query)) {
      fuzzyMatchCache.set(cacheKey, true);
      return true;
    }

    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    if (queryWords.length === 0) {
      fuzzyMatchCache.set(cacheKey, false);
      return false;
    }

    const result = queryWords.every(queryWord => {
      if (/\d/.test(queryWord)) return text.includes(queryWord);

      const words = text.split(/\s+/);
      return words.some(word => {
        if (/\d/.test(word)) return word.includes(queryWord);
        if (word.includes(queryWord)) return true;

        // Optimize character matching
        let matches = 0;
        let lastIndex = -1;

        for (const char of queryWord) {
          const index = word.indexOf(char, lastIndex + 1);
          if (index > lastIndex) {
            matches++;
            lastIndex = index;
          }
        }

        return matches >= queryWord.length * 0.8;
      });
    });

    fuzzyMatchCache.set(cacheKey, result);
    if (fuzzyMatchCache.size > 1000) {
      // Clear oldest entries if cache gets too large
      const keys = Array.from(fuzzyMatchCache.keys());
      keys.slice(0, 100).forEach(key => fuzzyMatchCache.delete(key));
    }
    return result;
  };
};
const fuzzyMatch = createFuzzyMatch();

// Helper function to parse game size to GB
const parseSizeToGB = (sizeStr) => {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.]+)\s*(GB|MB|TB)/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  switch (unit) {
    case 'TB':
      return value * 1024;
    case 'GB':
      return value;
    case 'MB':
      return value / 1024;
    default:
      return 0;
  }
};

const Search = memo(() => {
  const { userData } = useAuth();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  // Use uncontrolled input to prevent re-renders on every keystroke
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState(() => {
    const saved = window.sessionStorage.getItem("searchQuery");
    return saved || "";
  });
  const searchTimerRef = useRef(null);
  
  // Debounce the actual search query that triggers filtering
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 400);
  
  // Handle input changes without triggering re-renders
  const handleSearchInput = useCallback((value) => {
    // Clear existing timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    
    // Update search query after user stops typing (500ms delay)
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 500);
  }, []);
  const [showStickySearch, setShowStickySearch] = useState(false);
  const showStickySearchRef = useRef(false);
  const mainSearchRef = useRef(null);
  const searchSectionRef = useRef(null);
  const location = useLocation();

  const [selectedCategories, setSelectedCategories] = useState(() => {
    const saved = window.sessionStorage.getItem("selectedCategories");
    return saved ? JSON.parse(saved) : [];
  });

  const [onlineFilter, setOnlineFilter] = useState(() => {
    const saved = window.sessionStorage.getItem("onlineFilter");
    return saved || "all";
  });

  const [selectedSort, setSelectedSort] = useState(() => {
    const saved = window.sessionStorage.getItem("selectedSort");
    return saved || "weight";
  });

  const [showDLC, setShowDLC] = useState(() => {
    const saved = window.sessionStorage.getItem("showDLC");
    return saved === "true";
  });

  const [showOnline, setShowOnline] = useState(() => {
    const saved = window.sessionStorage.getItem("showOnline");
    return saved === "true";
  });

  const [maxSize, setMaxSize] = useState(() => {
    const saved = window.sessionStorage.getItem("maxSize");
    return saved ? parseInt(saved) : 200;
  });

  const [recentSearches, setRecentSearches] = useState(() => {
    const saved = window.localStorage.getItem("recentSearches");
    return saved ? JSON.parse(saved) : [];
  });
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [quickSearchResults, setQuickSearchResults] = useState([]);

  const [filterSmallestSize, setFilterSmallestSize] = useState(() => {
    const saved = window.localStorage.getItem("filterSmallestSize");
    return saved === "true";
  });
  const [filterProvider, setFilterProvider] = useState(() => {
    const saved = window.localStorage.getItem("filterProvider");
    return saved || "";
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isIndexUpdating, setIsIndexUpdating] = useState(false);
  const [isIndexOutdated, setIsIndexOutdated] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const gamesPerPage = useWindowSize();
  const [size, setSize] = useState(() => {
    const savedSize = localStorage.getItem("navSize");
    return savedSize ? parseFloat(savedSize) : 100;
  });
  const [settings, setSettings] = useState({ seeInappropriateContent: false });
  const [displayedGames, setDisplayedGames] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef(null);
  const scrollThreshold = 200;
  const gamesPerLoad = useWindowSize();
  const [apiMetadata, setApiMetadata] = useState(null);
  const { t } = useLanguage();
  const isCustomSource =
    !!settings?.customSourcesMode || apiMetadata?.customSource === true;
  // Custom sources (Hydra Library) have no popularity/weight or categories, so
  // treat them the same as fitgirl for sort/filter UI degradation purposes.
  const isFitGirlSource = settings.gameSource === "fitgirl" || isCustomSource;
  const navigate = useNavigate();
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [contextMenuGame, setContextMenuGame] = useState(null);
  const [playLaterGames, setPlayLaterGames] = useState([]);

  // Load Play Later games
  useEffect(() => {
    const loadPlayLaterGames = () => {
      const savedGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");
      setPlayLaterGames(savedGames);
    };
    loadPlayLaterGames();
    window.addEventListener("play-later-updated", loadPlayLaterGames);
    return () => window.removeEventListener("play-later-updated", loadPlayLaterGames);
  }, []);

  // Save recent searches to localStorage
  const saveRecentSearch = useCallback(query => {
    if (!query || query.trim().length === 0) return;

    const trimmedQuery = query.trim();
    setRecentSearches(prev => {
      // Remove duplicate if exists and add to front
      const filtered = prev.filter(
        item => item.toLowerCase() !== trimmedQuery.toLowerCase()
      );
      const updated = [trimmedQuery, ...filtered].slice(0, 10); // Keep max 10 items
      window.localStorage.setItem("recentSearches", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear a specific recent search
  const clearRecentSearch = useCallback(query => {
    setRecentSearches(prev => {
      const updated = prev.filter(item => item !== query);
      window.localStorage.setItem("recentSearches", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Handle selecting a recent search
  const handleRecentSearchClick = useCallback(query => {
    if (mainSearchRef.current) {
      mainSearchRef.current.value = query;
    }
    setSearchQuery(query);
    setShowRecentSearches(false);
    mainSearchRef.current?.blur();
  }, []);

  const handleSearchFocus = useCallback(() => setShowRecentSearches(true), []);
  const handleSearchBlur = useCallback(() => {
    setTimeout(() => setShowRecentSearches(false), 200);
  }, []);

  // Quick search - search only game titles (uses debounced query)
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      setQuickSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    // Early exit optimization - stop after finding 5 results
    const results = [];
    for (let i = 0; i < games.length && results.length < 5; i++) {
      const title = games[i].game.toLowerCase();
      if (title.includes(query)) {
        results.push(games[i]);
      }
    }

    setQuickSearchResults(results);
  }, [searchQuery, games]);

  // Handle scroll to show/hide sticky search bar with throttling
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const shouldShow = scrollY > scrollThreshold;

          // Only update state if value actually changed
          if (shouldShow !== showStickySearchRef.current) {
            showStickySearchRef.current = shouldShow;
            setShowStickySearch(shouldShow);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [scrollThreshold]);

  // Handle sticky search click - scroll to top and focus input
  const handleStickySearchClick = useCallback(() => {
    const startPosition = window.scrollY;
    const duration = 600;
    const startTime = performance.now();

    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    const animateScroll = currentTime => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      window.scrollTo(0, startPosition * (1 - easedProgress));

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      } else {
        mainSearchRef.current?.focus();
      }
    };

    requestAnimationFrame(animateScroll);
  }, []);

  const isCacheValid = useCallback(() => {
    return (
      gamesCache.data &&
      gamesCache.timestamp &&
      Date.now() - gamesCache.timestamp < gamesCache.expiryTime
    );
  }, []);

  const refreshGames = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh && isCacheValid()) {
        setGames(gamesCache.data.games);
        setApiMetadata(gamesCache.data.metadata);
        return;
      }

      setIsRefreshing(true);
      try {
        const response = await gameService.getAllGames();
        const gameData = {
          games: response.games,
          metadata: response.metadata,
        };

        // Update cache with timestamp
        gamesCache = {
          data: gameData,
          timestamp: Date.now(),
          expiryTime: 5 * 60 * 1000,
        };

        setGames(gameData.games);
        setApiMetadata(gameData.metadata);
      } catch (error) {
        console.error("Error refreshing games:", error);
      } finally {
        setIsRefreshing(false);
      }
    },
    [isCacheValid]
  );

  // Load games on mount - single effect to avoid duplicate loading
  useEffect(() => {
    setLoading(true);
    refreshGames(true).finally(() => setLoading(false));

    // Preload verified games list
    verifiedGamesService.loadVerifiedGames().catch(error => {
      console.error("Failed to load verified games:", error);
    });

    // Listen for index refresh events
    const handleIndexRefresh = (event) => {
      console.log("[Search] Index refreshed, reloading games", event.detail);
      // Clear module-level cache to force fresh data fetch
      gamesCache = {
        data: null,
        timestamp: null,
        expiryTime: 5 * 60 * 1000,
      };
      // Clear gameService memory cache
      gameService.clearMemoryCache();
      // Force refresh to get new data
      setLoading(true);
      refreshGames(true).finally(() => setLoading(false));
    };

    window.addEventListener("index-refreshed", handleIndexRefresh);
    return () => window.removeEventListener("index-refreshed", handleIndexRefresh);
  }, [refreshGames]);

  useEffect(() => {
    const handleResize = () => {
      const newSize = localStorage.getItem("navSize");
      if (newSize) {
        setSize(parseFloat(newSize));
      }
    };

    window.addEventListener("navResize", handleResize);
    return () => window.removeEventListener("navResize", handleResize);
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      const savedSettings = await window.electron.getSettings();
      if (savedSettings) {
        setSettings(savedSettings);
      }
    };
    loadSettings();
  }, []);

  // Check if index is outdated based on indexReminder setting
  useEffect(() => {
    const checkIndexAge = async () => {
      try {
        const currentSettings = await window.electron.getSettings();
        const indexPath = currentSettings?.localIndex;
        if (!indexPath || !apiMetadata?.local) {
          setIsIndexOutdated(false);
          return;
        }

        // Get last refresh time
        if (window.electron?.getLocalRefreshProgress) {
          const progress = await window.electron.getLocalRefreshProgress(indexPath);
          if (progress?.lastSuccessfulTimestamp) {
            const lastRefresh = new Date(progress.lastSuccessfulTimestamp * 1000);
            setLastRefreshTime(lastRefresh);

            // Calculate if outdated based on indexReminder setting
            const reminderDays = parseInt(currentSettings.indexReminder || "7", 10);
            const daysSinceRefresh =
              (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60 * 24);

            setIsIndexOutdated(daysSinceRefresh > reminderDays);
          }
        }
      } catch (error) {
        console.error("Error checking index age:", error);
        setIsIndexOutdated(false);
      }
    };

    if (apiMetadata) {
      checkIndexAge();
    }
  }, [apiMetadata]);

  useEffect(() => {
    const checkIndexStatus = async () => {
      try {
        const status = getCurrentStatus();
        if (status?.api?.data?.status === "updatingIndex") {
          setIsIndexUpdating(true);
        } else {
          setIsIndexUpdating(false);
        }
      } catch (error) {
        console.error("Error checking index status:", error);
        setIsIndexUpdating(false);
      }
    };

    // Subscribe to status updates
    const unsubscribe = subscribeToStatus(status => {
      if (status?.api?.data?.status === "updatingIndex") {
        setIsIndexUpdating(true);
      } else {
        setIsIndexUpdating(false);
      }
    });

    // Initial check
    checkIndexStatus();

    return () => unsubscribe();
  }, []);

  // Server status checks removed - games are only loaded from local index now

  // Persist all state - single combined effect with debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      window.sessionStorage.setItem("searchQuery", searchQuery);
      window.sessionStorage.setItem("selectedCategories", JSON.stringify(selectedCategories));
      window.sessionStorage.setItem("selectedSort", selectedSort);
      window.sessionStorage.setItem("onlineFilter", onlineFilter);
      window.sessionStorage.setItem("showDLC", showDLC.toString());
      window.sessionStorage.setItem("showOnline", showOnline.toString());
      window.sessionStorage.setItem("maxSize", maxSize.toString());
      window.localStorage.setItem("filterSmallestSize", filterSmallestSize.toString());
      window.localStorage.setItem("filterProvider", filterProvider);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategories, selectedSort, onlineFilter, showDLC, showOnline, maxSize, filterSmallestSize, filterProvider]);

  const filteredGames = useMemo(() => {
    if (!games?.length) return [];

    // Early return if no filters applied
    const hasSearch = debouncedSearchQuery?.trim().length > 0;
    const hasCategories = selectedCategories.length > 0;
    const hasContentFilters = showDLC || showOnline;
    const hasOnlineFilter = onlineFilter !== "all";
    const hasSizeFilter = maxSize < 200;
    const source = settings?.gameSource || "steamrip";
    const isFitGirl = source === "fitgirl";

    // If no filters, just sort and return
    if (!hasSearch && !hasCategories && !hasContentFilters && !hasOnlineFilter && !hasSizeFilter) {
      if (isFitGirl) return games;

      const sortFn = getSortFunction(selectedSort);
      return sortFn ? [...games].sort(sortFn) : games;
    }

    // Create a fast lookup for categories
    const categorySet = hasCategories ? new Set(selectedCategories) : null;
    const lowerQuery = hasSearch ? debouncedSearchQuery.toLowerCase().trim() : "";

    // Apply all filters in a single pass
    const filtered = [];
    for (let i = 0; i < games.length; i++) {
      const game = games[i];

      // Category filter (fast check first)
      if (hasCategories && !game.category?.some(cat => categorySet.has(cat))) {
        continue;
      }

      // Content filters (DLC/Online)
      if (hasContentFilters) {
        if (showDLC && showOnline) {
          if (!game.dlc && !game.online) continue;
        } else if (showDLC && !game.dlc) {
          continue;
        } else if (showOnline && !game.online) {
          continue;
        }
      }

      // Online filter
      if (hasOnlineFilter) {
        if (onlineFilter === "online" && !game.online) continue;
        if (onlineFilter === "offline" && game.online) continue;
      }

      // Size filter
      if (hasSizeFilter && game.size) {
        const sizeInGB = parseSizeToGB(game.size);
        if (sizeInGB > maxSize) continue;
      }

      // Search filter last (most expensive)
      if (hasSearch) {
        const gameTitle = game.game.toLowerCase();
        const gameDesc = (game.desc || "").toLowerCase();

        // Fast path: direct substring match
        if (gameTitle.includes(lowerQuery) || gameDesc.includes(lowerQuery)) {
          filtered.push(game);
          continue;
        }

        // Slow path: fuzzy match
        const searchText = `${game.game} ${game.desc || ""}`;
        if (fuzzyMatch(searchText, debouncedSearchQuery)) {
          filtered.push(game);
        }
      } else {
        filtered.push(game);
      }
    }

    // Skip sorting for FitGirl source
    if (isFitGirl) return filtered;

    const sortFn = getSortFunction(selectedSort);
    return sortFn ? filtered.sort(sortFn) : filtered;
  }, [
    games,
    debouncedSearchQuery,
    selectedCategories,
    onlineFilter,
    selectedSort,
    settings?.gameSource,
    showDLC,
    showOnline,
    maxSize,
  ]);

  // Extract sort function to avoid recreating it
  function getSortFunction(sortType) {
    switch (sortType) {
      case "weight":
        return (a, b) => (b.weight || 0) - (a.weight || 0);
      case "weight-asc":
        return (a, b) => (a.weight || 0) - (b.weight || 0);
      case "name":
        return (a, b) => a.game.localeCompare(b.game);
      case "name-desc":
        return (a, b) => b.game.localeCompare(a.game);
      case "latest_update-desc":
        return (a, b) => {
          if (!a.latest_update && !b.latest_update) return 0;
          if (!a.latest_update) return 1;
          if (!b.latest_update) return -1;
          return new Date(b.latest_update) - new Date(a.latest_update);
        };
      default:
        return null;
    }
  }

  useEffect(() => {
    // Initialize with first batch of games
    setDisplayedGames(filteredGames.slice(0, gamesPerLoad));
    setHasMore(filteredGames.length > gamesPerLoad);
  }, [filteredGames, gamesPerLoad]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const currentLength = displayedGames.length;
    const nextBatch = filteredGames.slice(currentLength, currentLength + gamesPerLoad);

    requestAnimationFrame(() => {
      setDisplayedGames(prev => [...prev, ...nextBatch]);
      setHasMore(currentLength + gamesPerLoad < filteredGames.length);
      setIsLoadingMore(false);
    });
  }, [displayedGames.length, filteredGames, gamesPerLoad, hasMore, isLoadingMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !isLoadingMore && hasMore) {
          loadMore();
        }
      },
      {
        threshold: 0.1,
        rootMargin: "100px",
      }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [loadMore, isLoadingMore, hasMore]);

  const handleDownload = useCallback(async game => {
    // Save the current search query when downloading a game
    const currentSearch = mainSearchRef.current?.value || searchQuery;
    if (currentSearch && currentSearch.trim()) {
      saveRecentSearch(currentSearch);
    }

    try {
      // Get the cached image first
      const cachedImage = await imageCacheService.getImage(game.imgID);

      // Navigate to download page with both game data and cached image
      navigate("/download", {
        state: {
          gameData: {
            ...game,
            cachedHeaderImage: cachedImage, // Include the cached header image
          },
        },
      });
    } catch (error) {
      console.error("Error preparing download:", error);
      // Still navigate but without cached image
      navigate("/download", {
        state: {
          gameData: game,
        },
      });
    }
  }, [searchQuery, saveRecentSearch, navigate, mainSearchRef]);

  // Handle clicking on a quick search result
  const handleQuickSearchClick = useCallback(
    game => {
      const currentSearch = mainSearchRef.current?.value || searchQuery;
      if (currentSearch) {
        saveRecentSearch(currentSearch);
      }
      handleDownload(game);
      setTimeout(() => {
        setShowRecentSearches(false);
      }, 100);
    },
    [searchQuery, saveRecentSearch, handleDownload, mainSearchRef]
  );

  const handleRefreshIndex = async () => {
    setIsRefreshing(true);

    try {
      // Quick check of just the Last-Modified header
      const lastModified = await gameService.checkMetadataUpdate();

      if (lastModified) {
        // If we got a Last-Modified header, fetch fresh data
        const freshData = await gameService.getAllGames();
        setGames(freshData.games);
      }
    } catch (error) {
      console.error("Error checking for updates:", error);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  const handleStartDownload = useCallback((game) => {
    navigate("/download", {
      state: { 
        gameData: game,
        autoStart: true
      },
    });
  }, [navigate]);

  const handleContextMenu = useCallback((e, game) => {
    e.preventDefault();
    e.stopPropagation();
    const x = e.clientX;
    const y = e.clientY;
    const menuWidth = 260;
    const menuHeight = 250;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let adjustedX = Math.min(x, viewportWidth - menuWidth);
    let adjustedY = y;
    if (y + menuHeight > viewportHeight) {
      adjustedY = Math.max(0, y - menuHeight);
    }
    adjustedY = Math.max(0, Math.min(adjustedY, viewportHeight - menuHeight));
    setContextMenuPosition({ x: adjustedX, y: adjustedY });
    setContextMenuGame(game);
    setContextMenuOpen(true);
  }, []);

  const handleReadMore = useCallback((game) => {
    navigate("/download", {
      state: { gameData: game },
    });
  }, [navigate]);

  const handlePlayLaterFromContext = useCallback((game) => {
    const playLaterList = JSON.parse(localStorage.getItem("play-later-games") || "[]");
    const isInList = playLaterList.some(g => g.game === game.game);
    
    if (isInList) {
      const updatedList = playLaterList.filter(g => g.game !== game.game);
      localStorage.setItem("play-later-games", JSON.stringify(updatedList));
      localStorage.removeItem(`play-later-image-${game.game}`);
    } else {
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
      playLaterList.push(gameToSave);
      localStorage.setItem("play-later-games", JSON.stringify(playLaterList));
    }
    window.dispatchEvent(new CustomEvent("play-later-updated"));
  }, []);

  return (
    <div className="flex flex-col bg-background">
      <GameContextMenu
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        position={contextMenuPosition}
        game={contextMenuGame}
        onDownload={handleDownload}
        onStartDownload={handleStartDownload}
        onReadMore={handleReadMore}
        onPlayLater={handlePlayLaterFromContext}
        isPlayLater={contextMenuGame && playLaterGames.some(g => g.game === contextMenuGame.game)}
      />
      {/* Sticky Search Bar */}
      <div
        onClick={handleStickySearchClick}
        className={`fixed left-1/2 z-50 -translate-x-1/2 cursor-pointer transition-all duration-300 ease-out ${
          showStickySearch
            ? "top-4 translate-y-0 opacity-100"
            : "pointer-events-none top-0 -translate-y-full opacity-0"
        }`}
      >
        <div className="flex min-w-[280px] items-center gap-3 rounded-full border border-border/50 bg-background/80 px-6 py-2.5 shadow-lg backdrop-blur-md transition-colors hover:border-border hover:bg-background/90">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {searchQuery || t("search.placeholder")}
          </span>
        </div>
      </div>
      <div className="flex-1 p-8 pb-24">
        <div className="mx-auto max-w-[1400px]">
          {apiMetadata && (
            <div className="mb-6 flex flex-col gap-3">
              {!apiMetadata.local && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{t("search.usinganApiWarning")}</span>                    
                  <a
                    className="inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                    onClick={() =>
                      window.electron.openURL("https://ascendara.app/docs/features/external-sources")
                    }
                  >
                    {t("common.learnMore")}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </div>
              )}
              {isIndexOutdated && apiMetadata.local && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>
                      {t("search.outdatedIndexWarning") ||
                        "Your local index hasn't been refreshed in a while. Consider updating it to see the latest games."}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-orange-500/30 text-orange-600 hover:bg-orange-500/20 dark:text-orange-400"
                    onClick={() => navigate("/localrefresh")}
                  >
                    <RefreshCw className="mr-2 h-3 w-3" />
                    {t("search.refreshNow") || "Refresh Now"}
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {apiMetadata.games.toLocaleString()} {t("search.gamesIndexed")}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <InfoIcon className="h-4 w-4 cursor-pointer transition-colors hover:text-foreground" />
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-border">
                    <AlertDialogCancel className="absolute right-2 top-2 cursor-pointer text-foreground transition-colors">
                      <X className="h-4 w-4" />
                    </AlertDialogCancel>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-2xl font-bold text-foreground">
                        {apiMetadata.local
                          ? t("search.localIndexedInformation")
                          : t("search.indexedInformation")}
                      </AlertDialogTitle>
                      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                        {apiMetadata.local ? (
                          <>
                            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-green-600 dark:text-green-400">
                              <Database className="h-4 w-4 shrink-0" />
                              <span>{t("search.usingLocalIndex")}</span>
                            </div>
                            <p>{t("search.localIndexedDescription")}</p>
                            <Separator className="bg-border/50" />
                            <p>
                              {t("search.totalGames")}:{" "}
                              {apiMetadata.games.toLocaleString()}
                            </p>
                            <p>
                              {t("search.source")}: {apiMetadata.source}
                            </p>
                            <p>
                              {t("search.lastUpdated")}: {apiMetadata.getDate}
                            </p>
                            <Separator className="bg-border/50" />
                            <div className="pt-2">
                              <Button
                                className="flex w-full items-center justify-center gap-2 text-secondary"
                                onClick={() => navigate("/localrefresh")}
                              >
                                <RefreshCw className="h-4 w-4" />
                                {t("search.refreshLocalIndex")}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p>
                              {t("search.indexedInformationDescription")}{" "}
                              <a
                                onClick={() =>
                                  window.electron.openURL("https://ascendara.app/dmca")
                                }
                                className="cursor-pointer text-primary hover:underline"
                              >
                                {t("common.learnMore")}{" "}
                                <ExternalLink className="mb-1 inline-block h-3 w-3" />
                              </a>
                            </p>
                            <Separator className="bg-border/50" />
                            <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-yellow-600 dark:text-yellow-400">
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              <span>{t("search.usinganApiWarning")}</span>
                            </div>
                            <Separator className="bg-border/50" />
                            <p>
                              {t("search.totalGames")}:{" "}
                              {apiMetadata.games.toLocaleString()}
                            </p>
                            <p>
                              {t("search.source")}:{" "}
                              {apiMetadata.sourceName || apiMetadata.source}
                            </p>
                            {apiMetadata.customSource && apiMetadata.sourceUrl && (
                              <p className="break-all text-xs text-muted-foreground/80">
                                <a
                                  onClick={() =>
                                    window.electron?.openURL?.(apiMetadata.sourceUrl)
                                  }
                                  className="cursor-pointer hover:underline"
                                >
                                  {apiMetadata.sourceUrl}
                                </a>
                              </p>
                            )}
                            <p>
                              {apiMetadata.customSource
                                ? t("search.lastSynced") || "Last synced"
                                : t("search.lastUpdated")}
                              : {apiMetadata.getDate}
                            </p>
                            <Separator className="bg-border/50" />
                            <div className="pt-2">
                              <Button
                                className="flex w-full items-center justify-center gap-2 text-secondary"
                                onClick={() => navigate("/localrefresh")}
                              >
                                <RefreshCw className="h-4 w-4" />
                                {t("search.switchToLocalIndex")}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </AlertDialogHeader>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

            </div>
          )}

          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={mainSearchRef}
                  placeholder={t("search.placeholder")}
                  defaultValue={searchQuery}
                  onChange={e => handleSearchInput(e.target.value)}
                  onClick={e => e.target.select()}
                  onFocus={handleSearchFocus}
                  onBlur={e => {
                    handleSearchBlur();
                    // Clear timer and immediately apply search on blur
                    if (searchTimerRef.current) {
                      clearTimeout(searchTimerRef.current);
                    }
                    setSearchQuery(e.target.value);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && e.target.value.trim()) {
                      // Clear timer and immediately apply search
                      if (searchTimerRef.current) {
                        clearTimeout(searchTimerRef.current);
                      }
                      const value = e.target.value;
                      saveRecentSearch(value);
                      setSearchQuery(value);
                      mainSearchRef.current?.blur();
                    }
                  }}
                  className="pl-10"
                />
                {isIndexUpdating && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 transform text-yellow-500">
                    <AlertTriangle size={20} />
                  </div>
                )}
                {/* Quick Search & Recent Searches Dropdown */}
                {showRecentSearches &&
                  (quickSearchResults.length > 0 || recentSearches.length > 0) && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[400px] overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                      <div className="p-2">
                        {/* Quick Search Results */}
                        {quickSearchResults.length > 0 && (
                          <>
                            <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                              {t("search.quickSearchResults")}
                            </div>
                            {quickSearchResults.map((game, index) => (
                              <div
                                key={index}
                                onClick={() => handleQuickSearchClick(game)}
                                className="group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-accent"
                              >
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-foreground">
                                    {game.game}
                                  </div>
                                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                    {game.size && (
                                      <div className="flex items-center gap-1">
                                        <Database className="h-3 w-3" />
                                        <span>{game.size}</span>
                                      </div>
                                    )}
                                    {game.latest_update && (
                                      <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        <span>
                                          {formatLatestUpdate(game.latest_update)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </>
                        )}

                        {/* Separator */}
                        {quickSearchResults.length > 0 && recentSearches.length > 0 && (
                          <Separator className="my-2 bg-border/50" />
                        )}

                        {/* Recent Searches */}
                        {recentSearches.length > 0 && (
                          <>
                            <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                              {t("search.recentSearches")}
                            </div>
                            {recentSearches.map((query, index) => (
                              <div
                                key={index}
                                className="group flex items-center justify-between rounded-md px-3 py-2 hover:bg-accent"
                              >
                                <button
                                  onClick={() => handleRecentSearchClick(query)}
                                  className="flex-1 cursor-pointer text-left text-sm text-foreground"
                                >
                                  {query}
                                </button>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    clearRecentSearch(query);
                                  }}
                                  className="ml-2 opacity-0 transition-opacity group-hover:opacity-100"
                                  aria-label="Clear this search"
                                >
                                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
              </div>
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="secondary"
                    className="flex items-center gap-2 border-0 hover:bg-accent"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {t("search.filters")}
                    {(showDLC || showOnline || selectedCategories.length > 0 || maxSize < 200) && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent className="border-0 bg-background p-6 text-foreground">
                  <SheetHeader>
                    <SheetTitle>{t("search.filterOptions")}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center">
                      <div className="flex w-full items-center gap-2">
                        <Gift className="h-4 w-4 text-primary" />
                        <Label
                          className={`cursor-pointer text-foreground hover:text-foreground/90 ${showDLC ? "font-bold" : ""}`}
                          onClick={() => setShowDLC(prev => !prev)}
                        >
                          {t("search.showDLC")}
                        </Label>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="flex w-full items-center gap-2">
                        <Gamepad2 className="h-4 w-4 text-primary" />
                        <Label
                          className={`cursor-pointer text-foreground hover:text-foreground/90 ${showOnline ? "font-bold" : ""}`}
                          onClick={() => setShowOnline(prev => !prev)}
                        >
                          {t("search.showOnline")}
                        </Label>
                      </div>
                    </div>
                    <Separator className="bg-border/50" />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-primary" />
                          <Label className="text-sm font-medium text-foreground">
                            {t("search.maxGameSize") || "Max Game Size"}
                          </Label>
                        </div>
                        <span className="text-xs font-medium text-primary">
                          {maxSize >= 200 ? t("search.anySize") : `≤ ${maxSize} GB`}
                        </span>
                      </div>
                      <Slider
                        min={5}
                        max={200}
                        step={5}
                        value={[maxSize]}
                        onValueChange={(value) => setMaxSize(value[0])}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>5 GB</span>
                        <span>{t("search.any")}</span>
                      </div>
                    </div>
                    <Separator className="bg-border/50" />
                    <div className="space-y-4">
                      <h4
                        className={
                          isFitGirlSource
                            ? "text-sm font-medium text-muted-foreground"
                            : "text-sm font-medium text-foreground"
                        }
                      >
                        {t("search.sortBy")}
                      </h4>
                      <RadioGroup
                        value={selectedSort}
                        onValueChange={setSelectedSort}
                        className="grid grid-cols-1 gap-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="weight"
                            id="weight"
                            disabled={isFitGirlSource}
                          />
                          <Label
                            className={`${isFitGirlSource ? "text-muted-foreground" : "cursor-pointer text-foreground hover:text-foreground/90"}`}
                            htmlFor="weight"
                          >
                            {t("search.mostPopular")}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="weight-asc"
                            id="weight-asc"
                            disabled={isFitGirlSource}
                          />
                          <Label
                            className={`${isFitGirlSource ? "text-muted-foreground" : "cursor-pointer text-foreground hover:text-foreground/90"}`}
                            htmlFor="weight-asc"
                          >
                            {t("search.leastPopular")}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="latest_update-desc"
                            id="latest_update-desc"
                            disabled={isFitGirlSource}
                          />
                          <Label
                            className={`${isFitGirlSource ? "text-muted-foreground" : "cursor-pointer text-foreground hover:text-foreground/90"}`}
                            htmlFor="latest_update-desc"
                          >
                            {t("search.mostRecentlyUpdated")}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="name"
                            id="name"
                            disabled={isFitGirlSource}
                          />
                          <Label
                            className={`${isFitGirlSource ? "text-muted-foreground" : "cursor-pointer text-foreground hover:text-foreground/90"}`}
                            htmlFor="name"
                          >
                            {t("search.alphabeticalAZ")}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="name-desc"
                            id="name-desc"
                            disabled={isFitGirlSource}
                          />
                          <Label
                            className={`${isFitGirlSource ? "text-muted-foreground" : "cursor-pointer text-foreground hover:text-foreground/90"}`}
                            htmlFor="name-desc"
                          >
                            {t("search.alphabeticalZA")}
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <Separator className="bg-border/50" />
                    <div className="space-y-4">
                      <h4
                        className={
                          isFitGirlSource
                            ? "text-sm font-medium text-muted-foreground"
                            : "text-sm font-medium text-foreground"
                        }
                      >
                        {t("search.categories")}
                      </h4>
                      <CategoryFilter
                        selectedCategories={selectedCategories}
                        setSelectedCategories={setSelectedCategories}
                        games={games}
                        showMatureCategories={settings.seeInappropriateContent}
                      />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              {isRefreshing && (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(8)].map((_, i) => (
                  <Card key={i} className="h-[300px] animate-pulse" />
                ))}
              </div>
            ) : displayedGames.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-lg text-muted-foreground">{t("search.noResults")}</p>
              </div>
            ) : (
              <div className="relative">
                <GameGrid 
                  displayedGames={displayedGames}
                  debouncedSearchQuery={debouncedSearchQuery}
                  handleDownload={handleDownload}
                  handleContextMenu={handleContextMenu}
                />
                {hasMore && (
                  <div ref={loaderRef} className="flex justify-center py-8">
                    <div className="flex items-center space-x-2">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-primary"></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {isIndexUpdating && (
        <AlertDialog defaultOpen>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
                <AlertTriangle className="text-yellow-500" />
                Index Update in Progress
              </AlertDialogTitle>
            </AlertDialogHeader>
            <p className="text-muted-foreground">
              The search index is currently being updated. Search results may be
              incomplete or inconsistent during this time. Please try again later.
            </p>
            <div className="mt-4 flex justify-end">
              <AlertDialogCancel className="text-muted-foreground">
                Dismiss
              </AlertDialogCancel>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
});

function useWindowSize() {
  const [gamesPerPage, setGamesPerPage] = useState(getInitialGamesPerPage());

  useEffect(() => {
    function handleResize() {
      setGamesPerPage(getInitialGamesPerPage());
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function getInitialGamesPerPage() {
    const width = window.innerWidth;
    if (width >= 1400) return 16;
    if (width >= 1024) return 12;
    if (width >= 768) return 8;
    return 4;
  }

  return gamesPerPage;
}

// Memoized game card wrapper to prevent re-renders
const MemoizedGameCard = memo(({ game, onDownload, onContextMenu }) => (
  <div 
    data-game-name={game.game}
    onContextMenu={(e) => onContextMenu?.(e, game)}
  >
    <GameCard game={game} onDownload={onDownload} />
  </div>
), (prevProps, nextProps) => {
  // Only re-render if the game object reference changes
  return prevProps.game === nextProps.game && prevProps.onDownload === nextProps.onDownload && prevProps.onContextMenu === nextProps.onContextMenu;
});

// Memoized game grid component to prevent re-renders on search input
const GameGrid = memo(({ 
  displayedGames, 
  debouncedSearchQuery, 
  handleDownload,
  handleContextMenu
}) => {
  // Create stable callback references for each game
  const downloadCallbacks = useMemo(() => {
    const callbacks = new Map();
    displayedGames.forEach(game => {
      const key = game.imgID || game.id || `${game.game}-${game.version}`;
      if (!callbacks.has(key)) {
        callbacks.set(key, () => handleDownload(game));
      }
    });
    return callbacks;
  }, [displayedGames, handleDownload]);


  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {displayedGames.map((game) => {
        const key = game.imgID || game.id || `${game.game}-${game.version}`;

        return (
          <MemoizedGameCard 
            key={key}
            game={game}
            onContextMenu={handleContextMenu} 
            onDownload={downloadCallbacks.get(key)} 
          />
        );
      })}
    </div>
  );
});

export default Search;
