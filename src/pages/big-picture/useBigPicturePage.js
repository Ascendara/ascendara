import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDownloadQueue,
  processNextInQueue,
  hasActiveDownloads,
} from "@/services/downloadQueueService";
import { toast } from "sonner";
import * as torboxService from "@/services/torboxService";
import { SEAMLESS_PROVIDERS } from "@/config/providers";
import { sanitizeText } from "@/lib/utils";
import recentGamesService from "@/services/recentGamesService";
import gameService from "@/services/gameService";
import { useHideCursorOnGamepad } from "./useHideCursorOnGamepad";
import { getControllerButtons } from "./controller";
import { createFuzzyMatcher } from "./utils";
import { useDebouncedValue } from "./useDebouncedValue";
import { getGamepadInput } from "./gamepad";

function useBigPicturePage() {
  useHideCursorOnGamepad();
  const { t } = useLanguage();
  const { settings, updateSetting } = useSettings();
  const { isAuthenticated, user } = useAuth();
  const controllerType = settings.controllerType || "xbox";
  const buttons = getControllerButtons(controllerType);
  const [assetSearchOpen, setAssetSearchOpen] = useState(false);
  const [assetSearchGame, setAssetSearchGame] = useState(null);
  // Enter full-screen on mount, quit on unmount
  useEffect(() => {
    const enterFullScreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        // Silently ignore fullscreen errors (browser requires user gesture)
      }
    };

    enterFullScreen();

    // Prevent Escape key from exiting fullscreen
    const preventEscapeFullscreen = e => {
      if (e.key === "Escape" && document.fullscreenElement) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", preventEscapeFullscreen, { capture: true });

    // Quit full-screen when leaving Big Picture
    return () => {
      document.removeEventListener("keydown", preventEscapeFullscreen, { capture: true });
      if (document.fullscreenElement) {
        document
          .exitFullscreen()
          .catch(err => console.error("Error exiting fullscreen:", err));
      }
    };
  }, []);

  // Welcome animation effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcomeAnimation(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);
  const [allGames, setAllGames] = useState([]);
  const [carouselGames, setCarouselGames] = useState([]);
  const [storeGames, setStoreGames] = useState([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [selectedStoreGame, setSelectedStoreGame] = useState(null);
  const [view, setView] = useState("carousel");
  const [previousView, setPreviousView] = useState("carousel");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showWelcomeAnimation, setShowWelcomeAnimation] = useState(true);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showExitBigPictureDialog, setShowExitBigPictureDialog] = useState(false);
  const [showControllerSettings, setShowControllerSettings] = useState(false);
  const [downloadingGame, setDownloadingGame] = useState(null);
  const [selectedInstalledGame, setSelectedInstalledGame] = useState(null);
  const [installedGameView, setInstalledGameView] = useState(false);

  // New state for active downloads
  const [downloadingGames, setDownloadingGames] = useState([]);
  const [torboxStates, setTorboxStates] = useState({}); // webdownloadId -> state
  const [downloadsIndex, setDownloadsIndex] = useState(0);
  const [stoppingDownloads, setStoppingDownloads] = useState(new Set());
  const [resumingDownloads, setResumingDownloads] = useState(new Set());
  const [showKillDialog, setShowKillDialog] = useState(false);
  const [gameToKill, setGameToKill] = useState(null);
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [providerDialogGame, setProviderDialogGame] = useState(null);
  const [providerDialogProviders, setProviderDialogProviders] = useState([]);
  const providerDialogJustClosed = useRef(false);

  // Queue management state
  const [queuedDownloads, setQueuedDownloads] = useState([]);
  const [pendingDownloadData, setPendingDownloadData] = useState(null);
  const [showQueuePrompt, setShowQueuePrompt] = useState(false);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState(null);

  // Ref to track previous active download count for queue processing
  const prevActiveCountRef = useRef(0);

  // Ref to track previous downloading games for library refresh on completion
  const prevDownloadingGamesRef = useRef([]);

  // Fuzzy matcher instance for search
  const fuzzyMatch = useMemo(() => createFuzzyMatcher(), []);

  const [storeSearchQuery, setStoreSearchQuery] = useState("");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isSearchBarSelected, setIsSearchBarSelected] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState("qwerty");

  // Enhanced filtering and sorting states
  const [selectedSort, setSelectedSort] = useState("weight");
  const [showDLC, setShowDLC] = useState(false);
  const [showOnline, setShowOnline] = useState(false);

  const [carouselIndex, setCarouselIndex] = useState(0);
  const [libraryIndex, setLibraryIndex] = useState(0);
  const [storeIndex, setStoreIndex] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [homeSidebarIndex, setHomeSidebarIndex] = useState(-1); // -1 means not focused on sidebar
  const [isHomeSidebarActive, setIsHomeSidebarActive] = useState(false);

  // Context menu state - shows after 1 second of selection
  const [contextMenuGame, setContextMenuGame] = useState(null);
  const [contextMenuPosition, setContextMenuPosition] = useState(null);
  const contextMenuTimerRef = useRef(null);

  const [displayedCount, setDisplayedCount] = useState(30);
  const loaderRef = useRef(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const GAMES_PER_LOAD = 30;

  const navigate = useNavigate();
  const lastNavTime = useRef(0);
  const lastActionTime = useRef(0);
  const lastButtonState = useRef({});
  const GRID_COLS = 6;

  // --- DOWNLOAD POLLING ---
  useEffect(() => {
    const fetchDownloadingGames = async () => {
      try {
        const games = await window.electron.getGames();
        const downloading = games.filter(game => {
          const { downloadingData } = game;
          return (
            downloadingData &&
            (downloadingData.downloading ||
              downloadingData.extracting ||
              downloadingData.updating ||
              downloadingData.verifying ||
              downloadingData.stopped ||
              (downloadingData.verifyError && downloadingData.verifyError.length > 0) ||
              downloadingData.error)
          );
        });
        setDownloadingGames(downloading);
      } catch (error) {
        console.error("Error polling downloads:", error);
      }
    };

    fetchDownloadingGames();
    const intervalId = setInterval(fetchDownloadingGames, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // --- QUEUE POLLING ---
  useEffect(() => {
    const fetchQueuedDownloads = () => {
      const queue = getDownloadQueue();
      setQueuedDownloads(queue);
    };
    fetchQueuedDownloads();
    const queueIntervalId = setInterval(fetchQueuedDownloads, 1000);
    return () => clearInterval(queueIntervalId);
  }, []);

  // Process next queued download when downloads complete
  useEffect(() => {
    const activeCount = downloadingGames.filter(
      g =>
        g.downloadingData?.downloading ||
        g.downloadingData?.extracting ||
        g.downloadingData?.updating
    ).length;

    // When transitioning from active to no active downloads
    if (prevActiveCountRef.current > 0 && activeCount === 0) {
      processNextInQueue().then(nextItem => {
        if (nextItem) {
          toast.success(
            t("downloads.queuedDownloadStarted", { name: nextItem.gameName })
          );
        }
      });
    }
    prevActiveCountRef.current = activeCount;
  }, [downloadingGames, t]);

  // Refresh library when a download completes (was verifying, now gone)
  useEffect(() => {
    const currentNames = new Set(downloadingGames.map(g => g.game));
    const hasCompleted = prevDownloadingGamesRef.current.some(
      game => game.downloadingData?.verifying && !currentNames.has(game.game)
    );
    if (hasCompleted) {
      setRefreshTrigger(prev => prev + 1);
    }
    prevDownloadingGamesRef.current = downloadingGames;
  }, [downloadingGames]);

  // --- TORBOX POLLING ---
  useEffect(() => {
    if (!settings?.torboxApiKey) return;

    const pollTorboxStates = async () => {
      try {
        // Get all downloading games that have a torboxWebdownloadId
        const torboxDownloads = downloadingGames.filter(game => game.torboxWebdownloadId);

        if (torboxDownloads.length === 0) return;

        // Poll each TorBox download
        const newStates = {};
        for (const game of torboxDownloads) {
          try {
            const state = await torboxService.checkDownloadState(
              settings.torboxApiKey,
              game.torboxWebdownloadId
            );
            if (state && state.length > 0) {
              newStates[game.torboxWebdownloadId] = state[0];
            }
          } catch (error) {
            console.error(
              `Error checking TorBox state for ${game.torboxWebdownloadId}:`,
              error
            );
          }
        }

        setTorboxStates(newStates);
      } catch (error) {
        console.error("Error polling TorBox states:", error);
      }
    };

    // Poll immediately and then every 5 seconds
    pollTorboxStates();
    const intervalId = setInterval(pollTorboxStates, 5000);
    return () => clearInterval(intervalId);
  }, [downloadingGames, settings?.torboxApiKey]);

  // --- DOWNLOAD LOGIC ---
  const handleStartDownload = async (
    game,
    preferredProvider = null,
    forceStart = false
  ) => {
    const seamlessProviders = SEAMLESS_PROVIDERS;
    const links = game.download_links;

    // Determine torbox providers based on prioritizeTorboxOverSeamless setting
    const prioritizeTorbox = settings.prioritizeTorboxOverSeamless;
    const torboxProviders = prioritizeTorbox
      ? Object.keys(links || {}).filter(provider => links[provider]?.length > 0)
      : ["1fichier", "megadb"];

    // Check if we should use TorBox for this provider
    const shouldUseTorbox = provider =>
      torboxProviders.includes(provider) && torboxService.isEnabled(settings);

    // Find the provider to use (preferred or first available)
    let selectedProvider = null;
    let downloadUrl = null;

    // If a preferred provider is specified and available, use it
    if (preferredProvider && links[preferredProvider]) {
      selectedProvider = preferredProvider;
      const providerLinks = links[preferredProvider];
      downloadUrl = Array.isArray(providerLinks)
        ? providerLinks.find(link => link && typeof link === "string")
        : typeof providerLinks === "string"
          ? providerLinks
          : null;
    }

    // Otherwise find first available provider (seamless or torbox based on settings)
    if (!downloadUrl) {
      // If TorBox is prioritized and enabled, check for torbox providers first
      if (prioritizeTorbox && torboxService.isEnabled(settings)) {
        for (const provider of torboxProviders) {
          if (links[provider]) {
            selectedProvider = provider;
            const providerLinks = links[provider];
            downloadUrl = Array.isArray(providerLinks)
              ? providerLinks.find(link => link && typeof link === "string")
              : typeof providerLinks === "string"
                ? providerLinks
                : null;
            if (downloadUrl) break;
          }
        }
      } else {
        // Otherwise, prioritize seamless providers
        for (const provider of seamlessProviders) {
          if (links[provider]) {
            selectedProvider = provider;
            const providerLinks = links[provider];
            downloadUrl = Array.isArray(providerLinks)
              ? providerLinks.find(link => link && typeof link === "string")
              : typeof providerLinks === "string"
                ? providerLinks
                : null;
            if (downloadUrl) break;
          }
        }
      }
    }

    if (!downloadUrl || !selectedProvider) {
      toast.error(t("bigPicture.downloadError"));
      return;
    }

    // Check if this is a seamless provider that should NOT use TorBox
    const isSeamlessWithoutTorbox =
      seamlessProviders.includes(selectedProvider) && !shouldUseTorbox(selectedProvider);

    if (isSeamlessWithoutTorbox) {
      // Check if there's an active download
      const hasActive = await hasActiveDownloads();

      if (hasActive && !forceStart) {
        // Non-Ascend users can only have 1 download at a time - show error toast
        if (!isAuthenticated) {
          toast.error(t("download.toast.downloadQueueLimit"));
          return;
        }

        // Ascend users get the queue dialog with options
        const sanitizedGameName = sanitizeText(game.game);
        const isVrGame = game.category?.includes("Virtual Reality");

        setPendingDownloadData({
          url: downloadUrl,
          gameName: sanitizedGameName,
          online: game.online || false,
          dlc: game.dlc || false,
          isVr: isVrGame || false,
          updateFlow: false,
          version: game.version || "",
          imgID: game.imgID,
          size: game.size || "",
          additionalDirIndex: 0,
          gameID: game.gameID || "",
        });
        setShowQueuePrompt(true);
        return;
      }

      // Seamless download - start it directly
      try {
        // Properly format the link
        downloadUrl = downloadUrl.replace(/^(?:https?:)?\/{2}/, "https://");

        const sanitizedGameName = sanitizeText(game.game);
        const isVrGame = game.category?.includes("Virtual Reality");

        // Start the download
        await window.electron.downloadFile(
          downloadUrl,
          sanitizedGameName,
          game.online || false,
          game.dlc || false,
          isVrGame || false,
          false, // updateFlow
          game.version || "",
          game.imgID,
          game.size || "",
          0, // dir index
          game.gameID || ""
        );

        toast.success(t("bigPicture.downloadStarted"));
        changeView("downloads");
      } catch (error) {
        console.error("Error starting download:", error);
        toast.error(t("bigPicture.downloadError"));
      }
    } else {
      // Non-seamless or TorBox download - show exit dialog
      setDownloadingGame(game);
      setShowExitDialog(true);
    }
  };

  const handlePauseDownload = async game => {
    setStoppingDownloads(prev => new Set([...prev, game.game]));
    try {
      const result = await window.electron.stopDownload(game.game, false);
      if (!result) {
        throw new Error("Failed to pause download");
      }
      toast.success(t("downloads.pauseSuccess"));
    } catch (error) {
      console.error("Error pausing download:", error);
      toast.error(t("downloads.errors.pauseFailed"));
    } finally {
      setStoppingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(game.game);
        return newSet;
      });
    }
  };

  const handleKillDownload = game => {
    // Show confirmation dialog
    setGameToKill(game);
    setShowKillDialog(true);
  };

  const executeKillDownload = async () => {
    if (!gameToKill) return;

    setStoppingDownloads(prev => new Set([...prev, gameToKill.game]));
    try {
      const result = await window.electron.stopDownload(gameToKill.game, true, true);
      if (!result) {
        throw new Error("Failed to kill download");
      }
      setDownloadingGames(prev => prev.filter(g => g.game !== gameToKill.game));
      toast.success(t("downloads.killSuccess"));
    } catch (error) {
      console.error("Error killing download:", error);
      toast.error(t("downloads.errors.killFailed"));
    } finally {
      setStoppingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(gameToKill.game);
        return newSet;
      });
      setShowKillDialog(false);
      setGameToKill(null);
    }
  };

  const handleResumeDownload = async game => {
    setResumingDownloads(prev => new Set([...prev, game.game]));
    try {
      const result = await window.electron.resumeDownload(game.game);
      if (result.success) {
        toast.success(t("downloads.resumeSuccess"));
      } else {
        setResumingDownloads(prev => {
          const newSet = new Set(prev);
          newSet.delete(game.game);
          return newSet;
        });
        toast.error(t("downloads.resumeError"));
      }
    } catch (error) {
      console.error("Error resuming download:", error);
      setResumingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(game.game);
        return newSet;
      });
      toast.error(t("downloads.resumeError"));
    }
  };

  const handleOpenFolder = async game => {
    await window.electron.openGameDirectory(game.game);
  };

  // --- INSTALLED GAME DETAILS HANDLERS ---
  const handleShowInstalledGameDetails = game => {
    if (isTransitioning) return;

    setIsTransitioning(true);

    setTimeout(() => {
      setSelectedInstalledGame(game);
      setInstalledGameView(true);

      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 200);
  };

  const handleCloseInstalledGameDetails = useCallback(() => {
    console.log("[CLOSE GAME DETAILS] Resetting view");

    if (isTransitioning) return;

    setIsTransitioning(true);

    setTimeout(() => {
      // Use functional updates to ensure we're working with latest state
      setInstalledGameView(prev => {
        console.log(
          "[CLOSE GAME DETAILS] Setting installedGameView from",
          prev,
          "to false"
        );
        return false;
      });
      setSelectedInstalledGame(null);

      // Reset any active sidebar state
      setIsHomeSidebarActive(false);
      setHomeSidebarIndex(-1);

      // Trigger games refresh to update library after potential deletion
      setRefreshTrigger(prev => prev + 1);

      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 200);
  }, [isTransitioning]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electron.getSettings();
        if (settings?.bigPictureKeyboardLayout) {
          setKeyboardLayout(settings.bigPictureKeyboardLayout);
        }
      } catch (e) {}
    };
    loadSettings();
  }, []);

  // Debounced search for better performance
  const debouncedSearchQuery = useDebouncedValue(storeSearchQuery, 300);

  const filteredStoreGames = useMemo(() => {
    let filtered = storeGames;

    // Apply search filter
    if (debouncedSearchQuery.trim()) {
      filtered = filtered.filter(game => {
        const gameTitle = game.game || game.name || "";
        const gameDesc = game.desc || "";
        return fuzzyMatch(gameTitle + " " + gameDesc, debouncedSearchQuery);
      });
    }

    // Apply content filters (DLC/Online)
    if (showDLC || showOnline) {
      filtered = filtered.filter(game => {
        if (showDLC && showOnline) {
          return game.dlc || game.online;
        } else if (showDLC) {
          return game.dlc;
        } else if (showOnline) {
          return game.online;
        }
        return true;
      });
    }

    // Apply sorting
    const sortFn = (() => {
      switch (selectedSort) {
        case "weight":
          return (a, b) => (b.weight || 0) - (a.weight || 0);
        case "weight-asc":
          return (a, b) => (a.weight || 0) - (b.weight || 0);
        case "name":
          return (a, b) => (a.game || a.name || "").localeCompare(b.game || b.name || "");
        case "name-desc":
          return (a, b) => (b.game || b.name || "").localeCompare(a.game || a.name || "");
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
    })();

    return sortFn ? [...filtered].sort(sortFn) : filtered;
  }, [storeGames, debouncedSearchQuery, fuzzyMatch, showDLC, showOnline, selectedSort]);

  const displayedStoreGames = useMemo(() => {
    return filteredStoreGames.slice(0, displayedCount);
  }, [filteredStoreGames, displayedCount]);

  const hasMore = displayedCount < filteredStoreGames.length;

  const searchSuggestions = useMemo(() => {
    if (!storeSearchQuery.trim()) return [];
    return filteredStoreGames.slice(0, 20);
  }, [filteredStoreGames, storeSearchQuery]);

  const changeView = useCallback(
    newView => {
      if (newView === view || isTransitioning) return;

      setPreviousView(view);
      setIsTransitioning(true);

      // Start transition out
      setTimeout(() => {
        setCarouselIndex(0);
        setLibraryIndex(0);
        setStoreIndex(0);
        setIsSearchBarSelected(false);
        setStoreSearchQuery("");
        setView(newView);
        setDisplayedCount(30);

        // Transition in
        setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
      }, 200);
    },
    [view, isTransitioning]
  );

  useEffect(() => {
    if (view !== "store") return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore) {
          setDisplayedCount(prev => prev + GAMES_PER_LOAD);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, view, displayedCount]);

  // Reset pagination if search changes
  useEffect(() => {
    setDisplayedCount(30);
    setStoreIndex(0);
  }, [storeSearchQuery]);

  // Context menu timer - shows game details after 1 second of selection
  useEffect(() => {
    // Always clear existing timer and hide menu when index changes
    if (contextMenuTimerRef.current) {
      clearTimeout(contextMenuTimerRef.current);
      contextMenuTimerRef.current = null;
    }

    // Immediately hide context menu when navigating to a different game
    setContextMenuGame(null);
    setContextMenuPosition(null);

    // Reset context menu if not in store view or search bar is selected
    if (view !== "store" || isSearchBarSelected || isMenuOpen) {
      return;
    }

    // Set timer to show context menu after 1 second
    if (
      displayedStoreGames.length > 0 &&
      storeIndex >= 0 &&
      storeIndex < displayedStoreGames.length
    ) {
      contextMenuTimerRef.current = setTimeout(() => {
        const selectedGame = displayedStoreGames[storeIndex];
        setContextMenuGame(selectedGame);

        // Calculate position near the selected card
        const cardElements = document.querySelectorAll("[data-store-card]");
        const selectedCard = cardElements[storeIndex];
        if (selectedCard) {
          const rect = selectedCard.getBoundingClientRect();

          // Get the scrollable container to account for scroll offset
          const scrollContainer = selectedCard.closest(".overflow-y-auto");
          const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

          // Position to the right of the card, or left if too close to right edge
          const spaceOnRight = window.innerWidth - rect.right;
          const menuWidth = 420;
          const menuHeight = 500; // Approximate height

          let x, y;
          if (spaceOnRight > menuWidth + 20) {
            // Position to the right
            x = rect.right + 20;
          } else {
            // Position to the left
            x = rect.left - menuWidth - 20;
          }

          // Center vertically on the card, accounting for scroll position
          y = rect.top + scrollTop + rect.height / 2 - menuHeight / 2;

          // Keep within reasonable bounds (relative to document, not viewport)
          y = Math.max(scrollTop + 20, y);
          x = Math.max(20, Math.min(x, window.innerWidth - menuWidth - 20));

          setContextMenuPosition({ x, y });
        }
      }, 1000);
    }

    // Cleanup timer on unmount or when dependencies change
    return () => {
      if (contextMenuTimerRef.current) {
        clearTimeout(contextMenuTimerRef.current);
        contextMenuTimerRef.current = null;
      }
    };
  }, [storeIndex, view, isSearchBarSelected, isMenuOpen, displayedStoreGames]);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const installed = await window.electron.getGames();
        let custom = [];
        try {
          custom = await window.electron.getCustomGames();
        } catch (e) {}
        let games = [...installed, ...custom];

        setAllGames(games);

        // Get recently played games using the service (same logic as Home.jsx)
        const recentlyPlayed = recentGamesService.getRecentGames();

        // Combine installed and custom games
        const actuallyInstalledGames = [
          ...(installed || []).map(game => ({
            ...game,
            isCustom: false,
          })),
          ...(custom || []).map(game => ({
            ...game,
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
        const recentGames = recentlyPlayed
          .filter(recentGame =>
            actuallyInstalledGames.some(g => g.game === recentGame.game)
          )
          .map(recentGame => {
            const gameDetails = games.find(g => g.game === recentGame.game);
            return {
              ...gameDetails,
              lastPlayed: recentGame.lastPlayed,
            };
          });

        // Sort all games with recent games first (in order of last played), then alphabetically
        const recentGameIndexMap = new Map(
          recentGames.map((g, index) => [g.game, index])
        );
        let carousel = [...actuallyInstalledGames].sort((a, b) => {
          const aIndex = recentGameIndexMap.get(a.game);
          const bIndex = recentGameIndexMap.get(b.game);
          // If both are recent, sort by their index in recentGames (0 = most recent)
          if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
          // If only a is recent, it comes first
          if (aIndex !== undefined) return -1;
          // If only b is recent, it comes first
          if (bIndex !== undefined) return 1;
          // Neither is recent, sort alphabetically
          return (a.game || a.name).localeCompare(b.game || b.name);
        });

        if (carousel.length > 20) {
          carousel = carousel.slice(0, 20);
          carousel.push({
            isSeeMore: true,
            game: t("bigPicture.seeMore"),
            name: t("bigPicture.seeMore"),
          });
        }
        setCarouselGames(carousel);
      } catch (error) {}
    };
    fetchGames();
  }, [refreshTrigger]);

  useEffect(() => {
    const fetchStore = async () => {
      if (storeGames.length > 0) return;
      setStoreLoading(true);
      try {
        const response = await gameService.getAllGames();
        let list = Array.isArray(response) ? response : response.games || [];
        setStoreGames(list);
      } catch (e) {
        toast.error(t("bigPicture.unableToLoadCatalog"));
      } finally {
        setStoreLoading(false);
      }
    };
    if (view === "store") fetchStore();
  }, [view, storeGames.length]);

  useEffect(() => {
    if (isMenuOpen) {
      if (view === "carousel") setMenuIndex(0);
      else if (view === "library") setMenuIndex(1);
      else if (view === "store") setMenuIndex(2);
      else if (view === "downloads") setMenuIndex(3);
    }
  }, [isMenuOpen, view]);

  const handleSelectSuggestion = useCallback(game => {
    setIsKeyboardOpen(false);
    setSelectedStoreGame(game);
    setView("details");
  }, []);

  const handleConfirmSearch = useCallback(() => {
    setIsKeyboardOpen(false);
    setIsSearchBarSelected(false);
    if (filteredStoreGames.length > 0) setStoreIndex(0);
  }, [filteredStoreGames.length]);

  const handleSelectStoreGame = useCallback(
    (game, index) => {
      if (isTransitioning) return;

      setIsTransitioning(true);

      setTimeout(() => {
        setIsSearchBarSelected(false);
        setStoreIndex(index);
        setSelectedStoreGame(game);
        setView("details");

        setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
      }, 200);
    },
    [isTransitioning]
  );

  // --- MAIN NAVIGATION LOGIC (SHARED BETWEEN KEYBOARD & GAMEPAD) ---
  const handleNavigation = useCallback(
    action => {
      console.log(
        "[NAV]",
        action,
        "→",
        view,
        "| installedGameView:",
        installedGameView,
        "| isKeyboardOpen:",
        isKeyboardOpen
      );

      // Block all navigation when any dialog is open
      if (
        showExitDialog ||
        showExitBigPictureDialog ||
        showControllerSettings ||
        showKillDialog ||
        showProviderDialog ||
        showQueuePrompt
      ) {
        const dialogType = showKillDialog
          ? "kill"
          : showProviderDialog
            ? "provider"
            : showQueuePrompt
              ? "queue"
              : showExitDialog
                ? "exit"
                : showExitBigPictureDialog
                  ? "exitBP"
                  : "settings";
        console.log(`[NAV] Blocked by ${dialogType} dialog`);
        return;
      }

      if (isKeyboardOpen) {
        console.log("[NAV] Blocked by keyboard");
        return;
      }

      // Allow InstalledGameDetailsView to handle its own navigation
      if (installedGameView) {
        console.log("[NAV] Blocked by installedGameView - letting component handle it");
        return;
      }

      // Allow GameDetailsView to handle its own navigation
      if (view === "details" && action === "MENU") {
        console.log("[GAME DETAILS VIEW] Menu pressed");
        setView("store");
        setSelectedStoreGame(null);
        return;
      } else if (view === "details") {
        // GameDetailsView handles all other navigation internally
        return;
      }

      if (isMenuOpen) {
        if (action === "DOWN") setMenuIndex(p => Math.min(p + 1, 6));
        else if (action === "UP") setMenuIndex(p => Math.max(p - 1, 0));
        else if (action === "BACK" || action === "MENU") setIsMenuOpen(false);
        else if (action === "CONFIRM") {
          setIsMenuOpen(false);
          // Menu items: 0=HOME, 1=LIBRARY, 2=CATALOG, 3=DOWNLOADS, 4=SETTINGS, 5=EXIT BIG PICTURE, 6=CLOSE ASCENDARA
          if (menuIndex === 0) {
            changeView("carousel");
          } else if (menuIndex === 1) {
            changeView("library");
          } else if (menuIndex === 2) {
            changeView("store");
          } else if (menuIndex === 3) {
            changeView("downloads");
          } else if (menuIndex === 4) {
            setShowControllerSettings(true);
          } else if (menuIndex === 5) {
            setShowExitBigPictureDialog(true);
          } else if (menuIndex === 6) {
            // Close Ascendara completely (Force Quit)
            if (window.electron && window.electron.closeWindow) {
              window.electron.closeWindow(true);
            } else {
              window.close(); // Fallback if electron not available
            }
          }
        }
        return;
      }

      if (view === "details") return;

      if (view === "downloads") {
        const maxIndex = downloadingGames.length - 1;

        if (action === "DOWN") {
          setDownloadsIndex(p => Math.min(p + 1, maxIndex));
        } else if (action === "UP") {
          setDownloadsIndex(p => Math.max(p - 1, 0));
        } else if (action === "BACK") {
          changeView("carousel");
        } else if (action === "MENU") {
          setIsMenuOpen(true);
        }
        return;
      }

      if (view === "library") {
        const maxIndex = allGames.length - 1;

        if (action === "RIGHT") {
          const isAtRowEnd = (libraryIndex + 1) % GRID_COLS === 0;
          if (!isAtRowEnd && libraryIndex < maxIndex) {
            setLibraryIndex(p => {
              console.log("[LIBRARY] RIGHT:", p, "→", p + 1);
              return p + 1;
            });
          } else {
            console.log("[LIBRARY] RIGHT blocked - at row end or max");
          }
        } else if (action === "LEFT") {
          const isAtRowStart = libraryIndex % GRID_COLS === 0;
          if (!isAtRowStart && libraryIndex > 0) {
            setLibraryIndex(p => {
              console.log("[LIBRARY] LEFT:", p, "→", p - 1);
              return p - 1;
            });
          } else {
            console.log("[LIBRARY] LEFT blocked - at row start");
          }
        } else if (action === "DOWN") {
          if (libraryIndex + GRID_COLS <= maxIndex) {
            setLibraryIndex(p => {
              console.log("[LIBRARY] DOWN:", p, "→", p + GRID_COLS);
              return p + GRID_COLS;
            });
          }
        } else if (action === "UP") {
          if (libraryIndex >= GRID_COLS) {
            setLibraryIndex(p => {
              console.log("[LIBRARY] UP:", p, "→", p - GRID_COLS);
              return p - GRID_COLS;
            });
          }
        } else if (action === "MENU") setIsMenuOpen(true);
        else if (action === "BACK") changeView("carousel");
        else if (action === "CONFIRM" && allGames[libraryIndex])
          handleShowInstalledGameDetails(allGames[libraryIndex]);
        return;
      }

      if (view === "store") {
        const maxIndex = filteredStoreGames.length - 1;

        if (isSearchBarSelected) {
          if (action === "DOWN" && displayedStoreGames.length > 0) {
            setIsSearchBarSelected(false);
            setStoreIndex(0);
          } else if (action === "CONFIRM") setIsKeyboardOpen(true);
          else if (action === "BACK") {
            if (storeSearchQuery) setStoreSearchQuery("");
            else changeView("carousel");
          } else if (action === "MENU") setIsMenuOpen(true);
        } else {
          if (action === "RIGHT") {
            const isAtRowEnd = (storeIndex + 1) % GRID_COLS === 0;
            if (!isAtRowEnd && storeIndex < maxIndex) {
              setStoreIndex(p => p + 1);
            }
          } else if (action === "LEFT") {
            const isAtRowStart = storeIndex % GRID_COLS === 0;
            if (!isAtRowStart && storeIndex > 0) {
              setStoreIndex(p => p - 1);
            }
          } else if (action === "DOWN") {
            if (storeIndex + GRID_COLS <= maxIndex) {
              setStoreIndex(p => p + GRID_COLS);
            }
          } else if (action === "UP") {
            const newIdx = storeIndex - GRID_COLS;
            if (newIdx < 0) {
              setIsSearchBarSelected(true);
            } else {
              setStoreIndex(newIdx);
            }
          } else if (action === "MENU") setIsMenuOpen(true);
          else if (action === "BACK") setIsSearchBarSelected(true);
          else if (action === "CONFIRM" && displayedStoreGames[storeIndex]) {
            handleSelectStoreGame(displayedStoreGames[storeIndex], storeIndex);
          }
        }

        if (storeIndex >= displayedCount - GRID_COLS && hasMore) {
          setDisplayedCount(prev => prev + GAMES_PER_LOAD);
        }
        return;
      }

      // Default: Carousel
      const currentList = carouselGames;

      if (action === "RIGHT" && isHomeSidebarActive) {
        setIsHomeSidebarActive(false);
        setHomeSidebarIndex(-1);
      } else if (action === "UP" && isHomeSidebarActive) {
        setHomeSidebarIndex(p => Math.max(p - 1, 0));
      } else if (action === "DOWN" && isHomeSidebarActive) {
        setHomeSidebarIndex(p => Math.min(p + 1, 4));
      } else if (action === "CONFIRM" && isHomeSidebarActive) {
        // Execute sidebar action
        if (homeSidebarIndex === 0) {
          changeView("carousel");
        } else if (homeSidebarIndex === 1) {
          changeView("library");
        } else if (homeSidebarIndex === 2) {
          changeView("store");
        } else if (homeSidebarIndex === 3) {
          changeView("downloads");
        } else if (homeSidebarIndex === 4) {
          setShowExitBigPictureDialog(true);
        }
        setIsHomeSidebarActive(false);
        setHomeSidebarIndex(-1);
      } else if (action === "RIGHT") {
        setCarouselIndex(p => {
          const newIndex = Math.min(p + 1, currentList.length - 1);
          if (newIndex !== p) console.log("[CAROUSEL] RIGHT:", p, "→", newIndex);
          return newIndex;
        });
      } else if (action === "LEFT") {
        setCarouselIndex(p => {
          const newIndex = Math.max(p - 1, 0);
          if (newIndex !== p) console.log("[CAROUSEL] LEFT:", p, "→", newIndex);
          return newIndex;
        });
      } else if (action === "UP") {
        // Activate sidebar from carousel
        setIsHomeSidebarActive(true);
        setHomeSidebarIndex(0);
      } else if (action === "DOWN") {
        // Activate sidebar from carousel
        setIsHomeSidebarActive(true);
        setHomeSidebarIndex(0);
      } else if (action === "MENU") setIsMenuOpen(true);
      else if (action === "CONFIRM") {
        const game = currentList[carouselIndex];
        if (game?.isSeeMore) changeView("library");
        else if (game) handleShowInstalledGameDetails(game);
      }
    },
    [
      isKeyboardOpen,
      isMenuOpen,
      installedGameView,
      isHomeSidebarActive,
      homeSidebarIndex,
      menuIndex,
      view,
      allGames,
      libraryIndex,
      filteredStoreGames.length,
      isSearchBarSelected,
      displayedStoreGames,
      storeIndex,
      storeSearchQuery,
      displayedCount,
      hasMore,
      carouselGames,
      carouselIndex,
      changeView,
      navigate,
      handleSelectStoreGame,
      handleShowInstalledGameDetails,
      downloadingGame,
      showExitDialog,
      showExitBigPictureDialog,
      showControllerSettings,
    ]
  );

  // Keyboard Event Listener
  useEffect(() => {
    const handleKeyDown = e => {
      // Block navigation when any dialog is open or just closed
      if (
        showExitDialog ||
        showExitBigPictureDialog ||
        showControllerSettings ||
        showKillDialog ||
        showProviderDialog ||
        providerDialogJustClosed.current ||
        isKeyboardOpen
      )
        return;

      const now = Date.now();
      if (now - lastNavTime.current < 100) return;

      const keyMap = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        Enter: "CONFIRM",
        Escape: "BACK",
        Backspace: "BACK",
        Tab: "MENU",
        m: "MENU",
        ContextMenu: "MENU",
      };

      if (keyMap[e.key]) {
        lastNavTime.current = now;
        handleNavigation(keyMap[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleNavigation,
    showExitDialog,
    showExitBigPictureDialog,
    showControllerSettings,
    showKillDialog,
    showProviderDialog,
    isKeyboardOpen,
  ]);

  // GAMEPAD POLLING LOOP for Main Navigation
  useEffect(() => {
    let animationFrameId;

    const loop = () => {
      const gp = getGamepadInput();

      // Always update button states to prevent held buttons from triggering when view changes
      if (gp) {
        const updateButtonState = buttonName => {
          lastButtonState.current[buttonName] = gp[buttonName];
        };

        // Block navigation when any dialog is open or just closed
        if (
          showExitDialog ||
          showExitBigPictureDialog ||
          showControllerSettings ||
          showKillDialog ||
          showProviderDialog ||
          assetSearchOpen ||
          providerDialogJustClosed.current ||
          isKeyboardOpen
        ) {
          // Update button states even when blocked
          updateButtonState("up");
          updateButtonState("down");
          updateButtonState("left");
          updateButtonState("right");
          updateButtonState("a");
          updateButtonState("b");
          updateButtonState("menu");
          animationFrameId = requestAnimationFrame(loop);
          return;
        }

        const now = Date.now();

        // Track button state changes - only trigger on new press (not hold)
        const checkNavButton = (buttonName, action) => {
          if (gp[buttonName] && !lastButtonState.current[buttonName]) {
            // Button just pressed (wasn't pressed before)
            const timeSinceLastNav = now - lastNavTime.current;
            if (timeSinceLastNav > 170) {
              handleNavigation(action);
              lastNavTime.current = now;
            }
          }
          lastButtonState.current[buttonName] = gp[buttonName];
        };

        const checkActionButton = (buttonName, action) => {
          if (gp[buttonName] && !lastButtonState.current[buttonName]) {
            // Button just pressed (wasn't pressed before)
            if (now - lastActionTime.current > 250) {
              handleNavigation(action);
              lastActionTime.current = now;
            }
          }
          lastButtonState.current[buttonName] = gp[buttonName];
        };

        // 1. NAVIGATION
        checkNavButton("up", "UP");
        checkNavButton("down", "DOWN");
        checkNavButton("left", "LEFT");
        checkNavButton("right", "RIGHT");

        // 2. ACTIONS
        checkActionButton("a", "CONFIRM");
        checkActionButton("b", "BACK");
        checkActionButton("menu", "MENU");
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    handleNavigation,
    showExitDialog,
    showExitBigPictureDialog,
    showControllerSettings,
    showKillDialog,
    showProviderDialog,
    assetSearchOpen,
    isKeyboardOpen,
  ]);

  return {
    showKillDialog,
    showProviderDialog,
    isKeyboardOpen,
    storeSearchQuery,
    setStoreSearchQuery,
    setIsKeyboardOpen,
    handleConfirmSearch,
    searchSuggestions,
    handleSelectSuggestion,
    keyboardLayout,
    t,
    settings,
    showExitDialog,
    setShowExitDialog,
    downloadingGame,
    navigate,
    showExitBigPictureDialog,
    setShowExitBigPictureDialog,
    showControllerSettings,
    setShowControllerSettings,
    updateSetting,
    setKeyboardLayout,
    isMenuOpen,
    menuIndex,
    buttons,
    setIsMenuOpen,
    changeView,
    view,
    installedGameView,
    isTransitioning,
    isHomeSidebarActive,
    homeSidebarIndex,
    setIsHomeSidebarActive,
    setHomeSidebarIndex,
    carouselGames,
    carouselIndex,
    setCarouselIndex,
    downloadingGames,
    allGames,
    libraryIndex,
    setLibraryIndex,
    isSearchBarSelected,
    setIsSearchBarSelected,
    filteredStoreGames,
    storeLoading,
    displayedStoreGames,
    storeIndex,
    handleSelectStoreGame,
    loaderRef,
    hasMore,
    contextMenuGame,
    contextMenuPosition,
    downloadsIndex,
    torboxStates,
    handlePauseDownload,
    handleResumeDownload,
    handleKillDownload,
    handleOpenFolder,
    stoppingDownloads,
    resumingDownloads,
    isAuthenticated,
    queuedDownloads,
    selectedStoreGame,
    setIsTransitioning,
    setView,
    setSelectedStoreGame,
    handleStartDownload,
    setProviderDialogGame,
    setProviderDialogProviders,
    setShowProviderDialog,
    providerDialogJustClosed,
    selectedInstalledGame,
    handleCloseInstalledGameDetails,
    setAssetSearchGame,
    setAssetSearchOpen,
    assetSearchOpen,
    gameToKill,
    setShowKillDialog,
    setGameToKill,
    executeKillDownload,
    providerDialogGame,
    providerDialogProviders,
    showQueuePrompt,
    pendingDownloadData,
    setShowQueuePrompt,
    setPendingDownloadData,
    controllerType,
    assetSearchGame,
    showWelcomeAnimation,
  };
}

export { useBigPicturePage };
