import React, { useState, useEffect, useMemo, memo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
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
  AlertTriangle,
  X,
  Calendar,
  Database,
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

// Module-level cache with timestamp
let gamesCache = {
  data: null,
  timestamp: null,
  expiryTime: 5 * 60 * 1000, // 5 minutes
};

const Search = memo(() => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => {
    const saved = window.sessionStorage.getItem("searchQuery");
    return saved || "";
  });

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
  const [isRefreshRequestDialogOpen, setIsRefreshRequestDialogOpen] = useState(false);
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
  const isFitGirlSource = settings.gameSource === "fitgirl";
  const navigate = useNavigate();

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
    setSearchQuery(query);
    setShowRecentSearches(false);
    mainSearchRef.current?.blur();
  }, []);

  // Quick search - search only game titles
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      setQuickSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const results = games
      .filter(game => {
        const title = game.game.toLowerCase();
        return title.includes(query);
      })
      .slice(0, 5); // Limit to 5 results

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

  const useDebouncedValue = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
      const timer = setTimeout(() => setDebouncedValue(value), delay);
      return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
  };

  const fuzzyMatch = useMemo(() => {
    const cache = new Map();

    return (text, query) => {
      if (!text || !query) return false;

      const cacheKey = `${text.toLowerCase()}-${query.toLowerCase()}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);

      text = text.toLowerCase();
      query = query.toLowerCase();

      // Direct substring match for better performance
      if (text.includes(query)) {
        cache.set(cacheKey, true);
        return true;
      }

      const queryWords = query.split(/\s+/).filter(word => word.length > 0);
      if (queryWords.length === 0) {
        cache.set(cacheKey, false);
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

      cache.set(cacheKey, result);
      if (cache.size > 1000) {
        // Clear cache if it gets too large
        const keys = Array.from(cache.keys());
        keys.slice(0, 100).forEach(key => cache.delete(key));
      }
      return result;
    };
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
  }, []);

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

  // Start status check interval when component mounts (skip for local index)
  useEffect(() => {
    // Skip server status checks if using local index
    if (settings?.usingLocalIndex) {
      return;
    }
    const stopStatusCheck = startStatusCheck();
    return () => stopStatusCheck();
  }, [settings?.usingLocalIndex]);

  // Persist searchQuery to localStorage
  useEffect(() => {
    window.localStorage.setItem("searchQuery", searchQuery);
  }, [searchQuery]);

  // Persist searchQuery
  useEffect(() => {
    window.sessionStorage.setItem("searchQuery", searchQuery);
  }, [searchQuery]);

  // Persist Filters and Sorting
  useEffect(() => {
    window.sessionStorage.setItem(
      "selectedCategories",
      JSON.stringify(selectedCategories)
    );
  }, [selectedCategories]);

  useEffect(() => {
    window.sessionStorage.setItem("selectedSort", selectedSort);
  }, [selectedSort]);

  useEffect(() => {
    window.sessionStorage.setItem("onlineFilter", onlineFilter);
  }, [onlineFilter]);

  useEffect(() => {
    window.sessionStorage.setItem("showDLC", showDLC.toString());
  }, [showDLC]);

  useEffect(() => {
    window.sessionStorage.setItem("showOnline", showOnline.toString());
  }, [showOnline]);

  // Persist filterSmallestSize to localStorage
  useEffect(() => {
    window.localStorage.setItem("filterSmallestSize", filterSmallestSize.toString());
  }, [filterSmallestSize]);

  // Persist filterProvider to localStorage
  useEffect(() => {
    window.localStorage.setItem("filterProvider", filterProvider);
  }, [filterProvider]);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const filteredGames = useMemo(() => {
    if (!games?.length) return [];

    // Create a fast lookup for categories
    const categorySet = new Set(selectedCategories);
    const source = settings?.gameSource || "steamrip";

    // Pre-compute filter conditions
    const hasCategories = categorySet.size > 0;
    const hasContentFilters = showDLC || showOnline;
    const hasOnlineFilter = onlineFilter !== "all";
    const isFitGirl = source === "fitgirl";

    // Apply all filters in a single pass
    let filtered = games.filter(game => {
      // Search filter
      if (debouncedSearchQuery) {
        const gameTitle = game.game;
        const gameDesc = game.desc || "";
        if (!fuzzyMatch(gameTitle + " " + gameDesc, debouncedSearchQuery)) {
          return false;
        }
      }

      // Category filter
      if (hasCategories && !game.category?.some(cat => categorySet.has(cat))) {
        return false;
      }

      // Content filters (DLC/Online)
      if (hasContentFilters) {
        if (showDLC && showOnline) {
          if (!game.dlc && !game.online) return false;
        } else if (showDLC && !game.dlc) {
          return false;
        } else if (showOnline && !game.online) {
          return false;
        }
      }

      // Online filter
      if (hasOnlineFilter) {
        if (onlineFilter === "online" && !game.online) return false;
        if (onlineFilter === "offline" && game.online) return false;
      }

      return true;
    });

    // Skip sorting for FitGirl source
    if (isFitGirl) return filtered;

    // Optimize sorting
    const sortFn = (() => {
      switch (selectedSort) {
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
            // Sort descending by latest_update (most recent first)
            if (!a.latest_update && !b.latest_update) return 0;
            if (!a.latest_update) return 1;
            if (!b.latest_update) return -1;
            // Compare as dates (YYYY-MM-DD)
            return new Date(b.latest_update) - new Date(a.latest_update);
          };
        default:
          return null;
      }
    })();

    return sortFn ? [...filtered].sort(sortFn) : filtered;
  }, [
    games,
    debouncedSearchQuery,
    selectedCategories,
    onlineFilter,
    selectedSort,
    settings?.gameSource,
    showDLC,
    showOnline,
    fuzzyMatch,
  ]);

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

  const handleDownload = async game => {
    // Save the current search query when downloading a game
    if (searchQuery && searchQuery.trim()) {
      saveRecentSearch(searchQuery);
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
  };

  // Handle clicking on a quick search result
  const handleQuickSearchClick = useCallback(
    game => {
      saveRecentSearch(searchQuery);
      setShowRecentSearches(false);
      handleDownload(game);
    },
    [searchQuery, saveRecentSearch, handleDownload]
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

  const handleSendRefreshRequest = async () => {
    // Close the confirmation dialog
    setIsRefreshRequestDialogOpen(false);

    try {
      // Get auth token
      const AUTHORIZATION = await window.electron.getAPIKey();
      const response = await fetch("https://api.ascendara.app/auth/token", {
        headers: {
          Authorization: AUTHORIZATION,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to obtain token");
      }

      const { token } = await response.json();

      // Send the refresh request
      const refreshResponse = await fetch(
        "https://api.ascendara.app/app/request-refresh",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (refreshResponse.status === 200) {
        const data = await refreshResponse.json();
        if (data.status === "success") {
          toast.success(t("search.refreshRequestSuccess"));
          console.log("Refresh request sent successfully");
        } else {
          toast.error(t("search.refreshRequestError"));
          console.error("Error in refresh request response:", data);
        }
      } else if (refreshResponse.status === 500) {
        toast.error(t("search.refreshRequestRateLimited"));
        console.error("Rate limited: User already sent a refresh request");
      } else {
        toast.error(t("search.refreshRequestError"));
        console.error("Unexpected status code:", refreshResponse.status);
      }
    } catch (error) {
      toast.error(t("search.refreshRequestError"));
      console.error("Error sending refresh request:", error);
    }
  };

  return (
    <div className="flex flex-col bg-background">
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
                  <span>{t("search.usingApiWarning")}</span>
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
                              <span>{t("search.usingApiWarning")}</span>
                            </div>
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

              {/* Send Refresh Request Confirmation Dialog */}
              <AlertDialog
                open={isRefreshRequestDialogOpen}
                onOpenChange={setIsRefreshRequestDialogOpen}
              >
                <AlertDialogContent className="border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-2xl font-bold text-foreground">
                      {t("search.sendRefreshRequestTitle")}
                    </AlertDialogTitle>
                    <div className="mt-4 space-y-4 text-sm text-muted-foreground">
                      <p>{t("search.sendRefreshRequestDescription")}</p>

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => setIsRefreshRequestDialogOpen(false)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          className="text-secondary"
                          onClick={handleSendRefreshRequest}
                        >
                          {t("search.confirmSendRefreshRequest")}
                        </Button>
                      </div>
                    </div>
                  </AlertDialogHeader>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={mainSearchRef}
                  placeholder={t("search.placeholder")}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => setShowRecentSearches(true)}
                  onBlur={() => {
                    // Delay hiding to allow clicking on recent searches
                    setTimeout(() => setShowRecentSearches(false), 200);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && searchQuery.trim()) {
                      saveRecentSearch(searchQuery);
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
                    {(showDLC || showOnline || selectedCategories.length > 0) && (
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {displayedGames.map(game => (
                    <div
                      key={game.imgID || game.id || `${game.game}-${game.version}`}
                      data-game-name={game.game}
                    >
                      <GameCard game={game} onDownload={() => handleDownload(game)} />
                    </div>
                  ))}
                </div>
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

export default Search;
