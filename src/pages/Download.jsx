import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { sanitizeText, formatLatestUpdate } from "@/lib/utils";
import imageCacheService from "@/services/imageCacheService";
import openCriticService from "@/services/openCriticService";
import { cacheDownloadData } from "@/services/retryGameDownloadService";
import {
  BadgeCheckIcon,
  CheckIcon,
  CircleSlash,
  CopyIcon,
  ExternalLink,
  InfoIcon,
  Loader,
  MessageSquareWarning,
  TriangleAlert,
  History,
  Zap,
  AlertTriangle,
  Star,
  FolderIcon,
  Apple,
  Gamepad2,
  Gift,
  ArrowDownCircle,
  Share,
  ArrowUpFromLine,
  X,
  Eye,
  FileQuestion,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import checkQbittorrentStatus from "@/services/qbittorrentCheckService";
import { toast } from "sonner";
import TimemachineDialog from "@/components/TimemachineDialog";
import igdbService from "@/services/gameInfoService";
import { useIgdbConfig } from "@/services/gameInfoConfig";
import torboxService from "@/services/torboxService";
import TorboxIcon from "@/components/TorboxIcon";
import GameScreenshots from "@/components/GameScreenshots";
import {
  fetchProviderPatterns,
  getProviderPattern,
} from "@/services/providerPatternService";

// Async validation using API patterns
const isValidURL = async (url, provider, patterns) => {
  const trimmedUrl = url.trim();
  if (trimmedUrl === "") {
    return true;
  }
  if (!patterns) return false;
  const pattern = getProviderPattern(provider, patterns);
  if (!pattern) return false;
  return pattern.test(trimmedUrl);
};

const sanitizeGameName = name => {
  return sanitizeText(name);
};

export default function DownloadPage() {
  const { state } = useLocation();
  const location = useLocation();
  const navigate = useNavigate();
  const [providerPatterns, setProviderPatterns] = useState(null);
  const [gameData, setGameData] = useState(state?.gameData);
  const [isUpdating, setIsUpdating] = useState(state?.gameData?.isUpdating || false);
  const [openCriticDialog, setOpenCriticDialog] = useState(false);
  const [showOpenCriticWarning, setShowOpenCriticWarning] = useState(false);
  const [criticData, setCriticData] = useState(null);
  const [criticLoading, setCriticLoading] = useState(false);
  const [criticError, setCriticError] = useState(null);
  const [criticCache, setCriticCache] = useState({});
  const { t } = useLanguage();
  const { settings, setSettings } = useSettings();
  const igdbConfig = useIgdbConfig();

  useEffect(() => {
    fetchProviderPatterns()
      .then(setProviderPatterns)
      .catch(err => {
        console.error("Failed to fetch provider patterns", err);
        setProviderPatterns(null);
      });
  }, []);

  // Handle OpenCritic dialog and API call
  const handleOpenCriticDialog = async gameName => {
    // Check if warning has been shown before
    if (!localStorage.getItem("openCriticBetaWarningShown")) {
      setShowOpenCriticWarning(true);
      return;
    }
    setOpenCriticDialog(true);

    // Check if we have cached data for this game
    if (criticCache[gameName]) {
      console.log("Using cached OpenCritic data for:", gameName);
      setCriticData(criticCache[gameName]);
      return;
    }

    setCriticLoading(true);
    setCriticError(null);
    setCriticData(null);

    try {
      const data = await openCriticService.getGameInfo(gameName);
      setCriticData(data);

      // Cache the results
      setCriticCache(prevCache => ({
        ...prevCache,
        [gameName]: data,
      }));
    } catch (error) {
      console.error("Error fetching OpenCritic data:", error);
      setCriticError(error.message || "Failed to fetch critic data");
    } finally {
      setCriticLoading(false);
    }
  };

  // Fetch IGDB data
  const fetchIgdbData = async gameName => {
    try {
      // Create a config object that includes both IGDB and GiantBomb credentials
      const apiConfig = {
        ...igdbConfig,
        giantBombKey: settings.giantBombKey || "",
      };

      // Skip if no API is enabled
      if (!igdbConfig.enabled && !settings.giantBombKey) {
        console.log("No game API integration is enabled");
        return;
      }

      setIgdbLoading(true);
      setIgdbError(null);

      try {
        const data = await igdbService.getGameDetails(gameName, apiConfig);

        if (data) {
          setIgdbData(data);
        } else {
          console.log("No game data found for:", gameData.game);
          setIgdbError("No game data found");
        }
      } catch (error) {
        console.error("Error fetching game data:", error);
        setIgdbError(error.message || "Error fetching game data");
      } finally {
        setIgdbLoading(false);
      }
    } catch (error) {
      console.error("Error in fetchGameInfo:", error);
      setIgdbLoading(false);
      setIgdbError(error.message || "An unexpected error occurred");
    }
  };

  // Clear data when leaving the page
  useEffect(() => {
    return () => {
      // Only clear if we're actually navigating away from the download page
      if (!location.pathname.includes("download")) {
        // Clear all state
        setSelectedProvider("");
        setInputLink("");
        setIsStartingDownload(false);
        setShowNoDownloadPath(false);
        setCachedImage(null);
        setIsValidLink(true);
        setShowCopySuccess(false);
        setShowShareCopySuccess(false);
        setIsReporting(false);
        setReportReason("");
        setReportDetails("");
        setShowNewUserGuide(false);
        setGuideStep(0);
        setGuideImages({});

        // Remove the state from history
        window.history.replaceState({}, document.title, location.pathname);
      }
    };
  }, [location]);

  // Log and validate game data
  useEffect(() => {
    if (!gameData) {
      console.error("No game data available");
      return;
    }
    console.log("Received game data:", gameData);
  }, [gameData, navigate]);

  // Fetch IGDB data when game data changes
  useEffect(() => {
    if (gameData && gameData.game) {
      fetchIgdbData(gameData.game);
    }
  }, [gameData]);

  // State declarations
  const [selectedProvider, setSelectedProvider] = useState("");
  const [inputLink, setInputLink] = useState("");
  const [isStartingDownload, setIsStartingDownload] = useState(false);

  // When provider changes, re-validate the input link
  useEffect(() => {
    const validate = async () => {
      if (!inputLink.trim()) {
        setIsValidLink(true);
        return;
      }
      if (providerPatterns) {
        const valid = await isValidURL(inputLink, selectedProvider, providerPatterns);
        setIsValidLink(valid);
      } else {
        setIsValidLink(false);
      }
    };
    validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, providerPatterns]);
  const [useAscendara, setUseAscendara] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [showNoDownloadPath, setShowNoDownloadPath] = useState(false);
  const [cachedImage, setCachedImage] = useState(null);
  const [isValidLink, setIsValidLink] = useState(true);
  const [torrentRunning, setIsTorrentRunning] = useState(false);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [showShareCopySuccess, setShowShareCopySuccess] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [timemachineSetting, setTimemachineSetting] = useState(false);
  const [showSelectPath, setShowSelectPath] = useState(false);
  const [showTimemachineSelection, setShowTimemachineSelection] = useState(false);
  const [showNewUserGuide, setShowNewUserGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [guideImages, setGuideImages] = useState({});
  const [lastProcessedUrl, setLastProcessedUrl] = useState(null);
  const [isProcessingUrl, setIsProcessingUrl] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [igdbData, setIgdbData] = useState(null);
  const [igdbError, setIgdbError] = useState(null);
  const [igdbLoading, setIgdbLoading] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [systemSpecs, setSystemSpecs] = useState(null);
  const [systemSpecsLoading, setSystemSpecsLoading] = useState(false);

  // Use a ref to track the event handler and active status
  const urlHandlerRef = useRef(null);
  const isActive = useRef(false);
  const igdbSectionRef = useRef(null);
  const mainContentRef = useRef(null);
  const scrollThreshold = 30; // Even lower threshold for quicker response
  const seamlessProviders = ["gofile", "buzzheavier", "pixeldrain"];
  const VERIFIED_PROVIDERS = ["megadb", "gofile", "buzzheavier", "pixeldrain"];

  async function whereToDownload(directUrl = null) {
    // Check if game is wanting to update
    if (gameData.isUpdating) {
      // Handle update flow
      setShowUpdatePrompt(true);
      return;
    }

    // Check if additional directories are set in settings
    if (settings.additionalDirectories && settings.additionalDirectories.length > 0) {
      // Show path selection dialog
      setShowSelectPath(true);
    } else {
      // No additional directories, proceed with direct download
      await handleDownload(directUrl, 0);
    }
  }

  async function handleDownload(directUrl = null, dir = null) {
    const sanitizedGameName = sanitizeText(gameData.game);
    if (showNoDownloadPath) {
      return;
    }

    if (!gameData) {
      console.error("No game data available");
      toast.error(t("download.toast.noGameData"));
      return;
    }

    // Handle torrent links if Fitgirl is the source
    if (settings.gameSource === "fitgirl") {
      const torrentLink = gameData.torrentLink;
      if (torrentLink) {
        if (isStartingDownload) {
          console.log("Download already in progress, skipping");
          return;
        }

        setIsStartingDownload(true);

        // Cache the download page data for retry functionality
        cacheDownloadData(sanitizedGameName, gameData);

        try {
          await window.electron.downloadFile(
            torrentLink,
            sanitizedGameName,
            gameData.online || false,
            gameData.dlc || false,
            false,
            gameData.version || "",
            gameData.imgID,
            gameData.size || "",
            dir
          );

          // Keep isStarting true until download actually begins
          const removeDownloadListener = window.electron.onDownloadProgress(
            downloadInfo => {
              if (downloadInfo.game === sanitizedGameName) {
                setIsStartingDownload(false);
                removeDownloadListener();
              }
            }
          );

          setTimeout(() => {
            toast.success(t("download.toast.torrentSent"));
            navigate("/downloads");
          }, 2500);
        } catch (error) {
          console.error("Download failed:", error);
          toast.error(t("download.toast.downloadFailed"));
          setIsStartingDownload(false);
        }
        return;
      }
    }
    // Determine if this provider should use Torbox
    const shouldUseTorbox = () => torboxProviders.includes(selectedProvider);
    if (
      !directUrl &&
      (selectedProvider === "gofile" || selectedProvider === "buzzheavier") &&
      !shouldUseTorbox()
    ) {
      let providerLinks = gameData.download_links?.[selectedProvider] || [];
      const validProviderLink = Array.isArray(providerLinks)
        ? providerLinks.find(link => link && typeof link === "string")
        : typeof providerLinks === "string"
          ? providerLinks
          : null;

      if (!validProviderLink) {
        toast.error(t("download.toast.invalidLink"));
        return;
      }

      // Properly format the link
      directUrl = validProviderLink.replace(/^(?:https?:)?\/\//, "https://");
    }

    // Handle providers using Torbox service
    if (!directUrl && shouldUseTorbox()) {
      // Get the appropriate link based on the selected provider
      let providerLink;

      // Get the link array and find a valid one
      const links = gameData.download_links?.[selectedProvider] || [];
      providerLink = Array.isArray(links)
        ? links.find(link => link && typeof link === "string")
        : links;

      // Ensure the link has proper protocol
      if (providerLink && !providerLink.startsWith("http")) {
        providerLink = "https:" + providerLink;
      }

      if (!providerLink || !isValidLink) {
        console.log("Invalid link:", providerLink, isValidLink);
        toast.error(t("download.toast.invalidLink"));
        return;
      }

      if (isStartingDownload) {
        console.log("Download already in progress, skipping");
        return;
      }

      setIsStartingDownload(true);
      toast.info(t("download.toast.processingLink"));

      try {
        console.log(`Processing ${selectedProvider} link with Torbox:`, providerLink);
        const apiKey = torboxService.getApiKey(settings);

        // Save comprehensive download data to local storage for TorboxDownloads
        try {
          // Get existing torbox data or initialize empty object
          const torboxData = JSON.parse(localStorage.getItem("torboxGameNames") || "{}");

          // Create a complete download data object with all necessary info
          const downloadData = {
            name: gameData.game,
            timestamp: Date.now(),
            imgUrl: gameData.imgID || null,
            provider: selectedProvider,
            originalUrl: providerLink,
            // Save all the necessary game data for download processing
            gameData: {
              game: gameData.game,
              version: gameData.version || "",
              size: gameData.size || "",
              imgID: gameData.imgID || null,
              online: gameData.online || false,
              dlc: gameData.dlc || false,
              download_links: gameData.download_links || {},
            },
          };

          // Store with the URL as key (will be used to match with download ID)
          torboxData[providerLink] = downloadData;

          // Save back to local storage
          localStorage.setItem("torboxGameNames", JSON.stringify(torboxData));
          console.log(
            "Saved comprehensive download data to local storage:",
            gameData.game
          );
        } catch (err) {
          console.error("Error saving download data to local storage:", err);
        }

        const result = await torboxService.getDirectDownloadLinkFromUrl(
          providerLink,
          apiKey
        );

        if (!result) {
          throw new Error("Failed to process download");
        }

        console.log("Got Torbox result:", result);

        // If we have a download ID, update the stored data with the ID for better matching
        if (result.item && result.item.id) {
          try {
            const torboxData = JSON.parse(
              localStorage.getItem("torboxGameNames") || "{}"
            );

            // Get the existing data for this URL if available
            const existingData = torboxData[providerLink] || {
              name: gameData.game,
              timestamp: Date.now(),
              imgUrl: gameData.imgID || null,
              provider: selectedProvider,
              originalUrl: providerLink,
              gameData: {
                game: gameData.game,
                version: gameData.version || "",
                size: gameData.size || "",
                imgID: gameData.imgID || null,
                online: gameData.online || false,
                dlc: gameData.dlc || false,
                download_links: gameData.download_links || {},
              },
            };

            // Create a new entry with the download ID as key
            torboxData[result.item.id] = {
              ...existingData,
              downloadId: result.item.id,
              // Add any additional data from the result
              files: result.item.files || [],
              status: result.item.status || result.status || "unknown",
              size: result.item.size || existingData.gameData.size || "",
            };

            localStorage.setItem("torboxGameNames", JSON.stringify(torboxData));
            console.log("Updated download data with ID:", result.item.id);
          } catch (err) {
            console.error("Error updating download data with ID:", err);
          }
        }

        // Check if the download is cached and ready
        if (result.status === "ready" && result.item) {
          toast.dismiss();
          toast.success(t("download.toast.linkProcessed"));

          // If we have a direct URL, use it
          if (result.url) {
            directUrl = result.url;
          } else {
            // Otherwise redirect to TorboxDownloads page
            toast.info(t("download.toast.downloadReady"));
            navigate("/torboxdownloads");
            setIsStartingDownload(false);
            return;
          }
        } else {
          // Download is not cached yet, redirect to TorboxDownloads page
          toast.dismiss();
          toast.info(t("download.toast.downloadQueued"));
          navigate("/torboxdownloads");
          setIsStartingDownload(false);
          return;
        }
      } catch (error) {
        console.error(`Error processing ${selectedProvider} link with Torbox:`, error);
        toast.dismiss();
        toast.error(t("download.toast.torboxProcessingError"));
        setIsStartingDownload(false);
        return;
      }
    }

    // For manual downloads with other providers, check if we have a valid link
    else if (!directUrl) {
      if (!selectedProvider) {
        console.log("No provider selected");
        return;
      }
      if (!inputLink || !isValidLink) {
        console.log("Input link:", inputLink);
        console.log("Is valid link:", isValidLink);
        console.log("Invalid link for manual download");
        return;
      }
    }

    if (isStartingDownload) {
      console.log("Download already in progress, skipping");
      return;
    }

    const urlToUse = directUrl || inputLink;
    console.log("Starting download with URL:", urlToUse);

    setIsStartingDownload(true);

    // Cache the download page data for retry functionality
    cacheDownloadData(sanitizedGameName, gameData);

    try {
      const isVrGame = gameData.category?.includes("Virtual Reality");

      await window.electron.downloadFile(
        urlToUse,
        sanitizedGameName,
        gameData.online || false,
        gameData.dlc || false,
        isVrGame || false,
        gameData.isUpdating || false,
        gameData.version || "",
        gameData.imgID,
        gameData.size || "",
        dir,
        gameData.gameID || ""
      );
      // Keep isStarting true until download actually begins
      const removeDownloadListener = window.electron.onDownloadProgress(downloadInfo => {
        if (downloadInfo.game === sanitizedGameName) {
          setIsStartingDownload(false);
          removeDownloadListener();
        }
      });

      setTimeout(() => {
        toast.success(t("download.toast.downloadStarted"));
        navigate("/downloads");
      }, 2500);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error(t("download.toast.downloadFailed"));
      setIsStartingDownload(false);
    }
  }

  useEffect(() => {
    const checkQbittorrent = async () => {
      if (settings.torrentEnabled) {
        const status = await checkQbittorrentStatus();
        setIsTorrentRunning(status.active);
      }
    };
    checkQbittorrent();
  }, [t, settings.torrentEnabled]);

  useEffect(() => {
    const checkDevMode = async () => {
      const isDevMode = await window.electron.isDev();
      setIsDev(isDevMode);
    };
    checkDevMode();
  }, []);

  // Protocol URL listener effect - only register handler when both useAscendara and providerPatterns are loaded
  useEffect(() => {
    if (!useAscendara || !providerPatterns) return;

    // Mark component as active
    isActive.current = true;

    // Remove any existing listener first
    if (urlHandlerRef.current) {
      window.electron.ipcRenderer.removeListener(
        "protocol-download-url",
        urlHandlerRef.current
      );
      urlHandlerRef.current = null;
    }

    // Create new handler and store in ref
    urlHandlerRef.current = async (event, url) => {
      if (!url?.startsWith("ascendara://") || !isActive.current) {
        return;
      }

      try {
        const encodedUrl = url.replace("ascendara://", "");
        const decodedUrl = decodeURIComponent(encodedUrl);
        // Remove trailing slash if it exists
        const cleanUrl = decodedUrl.endsWith("/") ? decodedUrl.slice(0, -1) : decodedUrl;

        // Don't process if it's the same URL we just handled
        if (cleanUrl === lastProcessedUrl) {
          console.log("Ignoring duplicate URL:", cleanUrl);
          return;
        }

        console.log("Handling protocol URL:", cleanUrl);
        // Detect provider from URL
        for (const provider of VERIFIED_PROVIDERS) {
          // Await the async validation
          const valid = await isValidURL(cleanUrl, provider, providerPatterns);
          if (valid) {
            setSelectedProvider(provider);
            setInputLink(cleanUrl);
            setIsValidLink(true);
            whereToDownload(cleanUrl);
            return;
          }
        }
        // If no valid provider found
        toast.error(t("download.toast.invalidLink"));
      } catch (error) {
        console.error("Error handling protocol URL:", error);
        toast.error(t("download.toast.invalidProtocolUrl"));
      }
    };

    // Add the new listener
    window.electron.ipcRenderer.on("protocol-download-url", urlHandlerRef.current);

    // Cleanup function
    return () => {
      // Mark component as inactive
      isActive.current = false;

      if (urlHandlerRef.current) {
        window.electron.ipcRenderer.removeListener(
          "protocol-download-url",
          urlHandlerRef.current
        );
        urlHandlerRef.current = null;
      }
      // Clear URL tracking on unmount
      setLastProcessedUrl(null);
      setIsProcessingUrl(false);
    };
  }, [useAscendara, providerPatterns]); // Only register handler when both are ready

  useEffect(() => {
    const loadFileFromPath = async path => {
      try {
        const data = await window.electron.getAssetPath(path);
        if (data) {
          setGuideImages(prev => ({
            ...prev,
            [path]: data,
          }));
        }
      } catch (error) {
        console.error("Failed to load:", error);
      }
    };

    const guideImagePaths = [
      "/guide/guide-off.png",
      "/guide/guide-on.png",
      "/guide/guide-start.png",
      "/guide/guide-alwaysopen.png",
      "/guide/guide-open.png",
      "/guide/guide-downloads.png",
    ];

    guideImagePaths.forEach(path => loadFileFromPath(path));
  }, []);

  useEffect(() => {
    setTimemachineSetting(settings.showOldDownloadLinks);
  }, [settings.showOldDownloadLinks]);

  useEffect(() => {
    window.scrollTo(0, 0);
    const loadCachedImage = async () => {
      const image = await imageCacheService.getImage(gameData.imgID);
      setCachedImage(image);
    };
    loadCachedImage();
    checkDownloadPath();
  }, [gameData, navigate]);

  useEffect(() => {
    const savedPreference = localStorage.getItem("useAscendara");
    if (savedPreference !== null) {
      setUseAscendara(JSON.parse(savedPreference));
    }
  }, []);

  useEffect(() => {
    const checkDevMode = async () => {
      const isDevMode = await window.electron.isDev();
      setIsDev(isDevMode);
    };
    checkDevMode();
  }, []);

  useEffect(() => {
    if (!igdbData || !igdbSectionRef.current) return;

    let lastScrollY = 0;
    let ticking = false;
    let scrollingTimeout = null;
    let scrollDirection = null;
    let lastScrollTime = Date.now();
    let hasScrolledToIgdb = false;
    let hasScrolledToBottom = false;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const currentTime = Date.now();

      // Determine scroll direction
      if (currentScrollY > lastScrollY) {
        scrollDirection = "down";
      } else if (currentScrollY < lastScrollY) {
        scrollDirection = "up";
      }

      // Update last scroll position
      lastScrollY = currentScrollY;

      // Reset scroll direction if it's been a while since last scroll
      if (currentTime - lastScrollTime > 500) {
        scrollDirection = null;
      }

      lastScrollTime = currentTime;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          // Clear any existing timeout
          if (scrollingTimeout) {
            clearTimeout(scrollingTimeout);
          }

          if (isAutoScrolling) {
            ticking = false;
            return;
          }

          const igdbSectionTop = igdbSectionRef.current.offsetTop;
          const igdbSectionBottom = igdbSectionTop + igdbSectionRef.current.offsetHeight;
          const windowHeight = window.innerHeight;
          const documentHeight = document.documentElement.scrollHeight;
          const scrollBottom = currentScrollY + windowHeight;

          // Reset flags when user has scrolled far enough
          if (currentScrollY < scrollThreshold) {
            hasScrolledToIgdb = false;
          }
          if (currentScrollY < igdbSectionTop - 100) {
            hasScrolledToBottom = false;
          }

          // Custom animation function for smooth scrolling
          const smoothScrollTo = (startPosition, targetPosition) => {
            setIsAutoScrolling(true);

            const distance = targetPosition - startPosition;
            const duration = 400; // milliseconds - faster animation
            let startTime = null;

            const animateScroll = timestamp => {
              if (!startTime) startTime = timestamp;
              const elapsed = timestamp - startTime;
              const progress = Math.min(elapsed / duration, 1);

              // Easing function for smoother animation
              const easeOutCubic = progress => 1 - Math.pow(1 - progress, 3);
              const easedProgress = easeOutCubic(progress);

              window.scrollTo(0, startPosition + distance * easedProgress);

              if (elapsed < duration) {
                window.requestAnimationFrame(animateScroll);
              } else {
                // Animation complete
                scrollingTimeout = setTimeout(() => {
                  setIsAutoScrolling(false);

                  // Update flags after scrolling completes
                  if (targetPosition >= igdbSectionTop - 100) {
                    hasScrolledToIgdb = true;
                  }
                  if (targetPosition >= documentHeight - windowHeight - 50) {
                    hasScrolledToBottom = true;
                  }
                }, 100);
              }
            };

            window.requestAnimationFrame(animateScroll);
          };

          // Case 1: Scrolling down from top area to IGDB section
          if (
            scrollDirection === "down" &&
            currentScrollY > scrollThreshold &&
            currentScrollY < igdbSectionTop - 150 &&
            !hasScrolledToIgdb
          ) {
            smoothScrollTo(currentScrollY, igdbSectionTop - 40);
          }
          // Case 2: Scrolling up from IGDB section to top area
          else if (
            scrollDirection === "up" &&
            currentScrollY < igdbSectionTop &&
            currentScrollY > scrollThreshold
          ) {
            smoothScrollTo(currentScrollY, 0);
          }
          // Case 3: Scrolling up from bottom of page to IGDB section
          else if (
            scrollDirection === "up" &&
            currentScrollY > igdbSectionBottom + 200 &&
            currentScrollY < documentHeight - windowHeight - 100
          ) {
            // Only trigger if we've scrolled up a significant amount
            if (scrollBottom < documentHeight - 150) {
              smoothScrollTo(currentScrollY, igdbSectionTop - 40);
            }
          }
          // Case 4: Scrolling down from IGDB section to bottom of page
          // Only trigger if we haven't already scrolled to bottom and we're near the end of the IGDB section
          else if (
            scrollDirection === "down" &&
            currentScrollY >= igdbSectionBottom - 200 &&
            currentScrollY < igdbSectionBottom &&
            !hasScrolledToBottom
          ) {
            smoothScrollTo(currentScrollY, documentHeight - windowHeight);
          }

          ticking = false;
        });

        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollingTimeout) {
        clearTimeout(scrollingTimeout);
      }
    };
  }, [igdbData, isAutoScrolling]);

  const checkDownloadPath = async () => {
    try {
      if (!settings.downloadDirectory) {
        setShowNoDownloadPath(true);
      }
    } catch (error) {
      console.error("Error getting settings:", error);
    }
  };
  const handleInputChange = async e => {
    const newLink = e.target.value;
    setInputLink(newLink);

    if (newLink.trim() === "") {
      setIsValidLink(true);
      return;
    }

    // Try to detect provider from URL if none selected
    if (!selectedProvider) {
      for (const provider of VERIFIED_PROVIDERS) {
        if (providerPatterns) {
          const valid = await isValidURL(newLink, provider, providerPatterns);
          if (valid) {
            setSelectedProvider(provider);
            setIsValidLink(true);
            return;
          }
        }
      }
    }

    if (providerPatterns) {
      const valid = await isValidURL(newLink, selectedProvider, providerPatterns);
      setIsValidLink(valid);
    } else {
      setIsValidLink(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === "Escape") {
        navigate("/search");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const guideSteps = [
    {
      title: t("download.newUserGuide.steps.0.title"),
      description: (
        <div>
          <p>{t("download.newUserGuide.steps.0.description")}</p>
        </div>
      ),
    },
    {
      title: t("download.newUserGuide.steps.1.title"),
      description: t("download.newUserGuide.steps.1.description"),
      image: guideImages["/guide/guide-off.png"],
    },
    {
      title: t("download.newUserGuide.steps.2.title"),
      description: t("download.newUserGuide.steps.2.description"),
      image: guideImages["/guide/guide-on.png"],
    },
    {
      title: t("download.newUserGuide.steps.3.title"),
      description: t("download.newUserGuide.steps.3.description"),
      image: guideImages["/guide/guide-start.png"],
    },
    {
      title: t("download.newUserGuide.steps.4.title"),
      description: t("download.newUserGuide.steps.4.description"),
      image: guideImages["/guide/guide-alwaysopen.png"],
    },
    {
      title: t("download.newUserGuide.steps.5.title"),
      description: t("download.newUserGuide.steps.5.description"),
      image: guideImages["/guide/guide-open.png"],
    },
    {
      title: t("download.newUserGuide.steps.6.title"),
      description: t("download.newUserGuide.steps.6.description"),
      image: guideImages["/guide/guide-downloads.png"],
    },
  ];

  const handleStartGuide = () => {
    setGuideStep(1);
  };

  const handleNextStep = () => {
    if (guideStep < guideSteps.length) {
      setGuideStep(guideStep + 1);
    } else {
      setSettings({ downloadHandler: true })
        .then(() => {
          setShowNewUserGuide(false);
          setGuideStep(0);
        })
        .catch(error => {
          console.error("Failed to save settings:", error);
        });
    }
  };

  const handleCloseGuide = () => {
    setShowNewUserGuide(false);
    setGuideStep(0);
  };

  const checkIfNewUser = async () => {
    if (!settings.downloadDirectory) {
      return true;
    }
    const games = await window.electron.getGames();
    return games.length === 0;
  };

  const handleCopyLink = async () => {
    let link = downloadLinks[selectedProvider][0].startsWith("//")
      ? `https:${downloadLinks[selectedProvider][0]}`
      : downloadLinks[selectedProvider][0];
    await navigator.clipboard.writeText(link);
    setShowCopySuccess(true);
    setTimeout(() => setShowCopySuccess(false), 1000);

    const isNewUser = await checkIfNewUser();
    if (isNewUser) {
      setShowNewUserGuide(true);
    }
  };

  const handleOpenInBrowser = async () => {
    let link = downloadLinks[selectedProvider][0].startsWith("//")
      ? `https:${downloadLinks[selectedProvider][0]}`
      : downloadLinks[selectedProvider][0];
    window.electron.openURL(link);

    const isNewUser = await checkIfNewUser();
    if (isNewUser) {
      setShowNewUserGuide(true);
    }
  };

  const handleShareLink = async () => {
    const shareLink = `https://ascendara.app/game/${gameData.gameID}`;
    await navigator.clipboard.writeText(shareLink);
    setShowShareCopySuccess(true);
    setTimeout(() => setShowShareCopySuccess(false), 2000);
  };

  const handleSubmitReport = async () => {
    if (!reportReason || !reportDetails.trim()) {
      toast.error(t("download.reportError"));
      return;
    }

    setIsReporting(true);
    try {
      const AUTHORIZATION = await window.electron.getAPIKey();
      const response = await fetch("https://api.ascendara.app/auth/token", {
        headers: {
          Authorization: AUTHORIZATION,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to obtain token");
      }

      const { token: authToken } = await response.json();

      const reportResponse = await fetch("https://api.ascendara.app/app/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          reportType: "GameBrowsing",
          reason: reportReason,
          details: reportDetails,
          gameName: gameData.game,
        }),
      });

      if (!reportResponse.ok) {
        // If token is expired or invalid, try once more with a new token
        if (reportResponse.status === 401) {
          const newTokenResponse = await fetch("https://api.ascendara.app/auth/token", {
            headers: {
              Authorization: AUTHORIZATION,
            },
          });

          if (!newTokenResponse.ok) {
            throw new Error("Failed to obtain new token");
          }

          const { token: newAuthToken } = await newTokenResponse.json();

          const retryResponse = await fetch("https://api.ascendara.app/app/report", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newAuthToken}`,
            },
            body: JSON.stringify({
              reportType: "GameBrowsing",
              reason: reportReason,
              details: reportDetails,
              gameName: gameData.game,
            }),
          });

          if (retryResponse.ok) {
            toast.success(t("download.toast.reportSubmitted"));
            setReportReason("");
            setReportDetails("");
            return;
          }
        }
        throw new Error("Failed to submit report");
      }

      toast.success(t("download.toast.reportSubmitted"));
      setReportReason("");
      setReportDetails("");
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error(t("download.toast.reportFailed"));
    } finally {
      setIsReporting(false);
    }
  };

  if (!gameData) {
    return (
      <div className="container mx-auto max-w-7xl p-6">
        <AlertDialog variant="destructive">
          <AlertDialogDescription>
            {t("download.toast.noGameData")}
          </AlertDialogDescription>
        </AlertDialog>
      </div>
    );
  }

  const downloadLinks = gameData?.download_links || {};
  const hasProviders = Object.keys(downloadLinks).length > 0;

  const providers = hasProviders
    ? Object.entries(downloadLinks)
        .filter(([_, links]) => {
          if (!Array.isArray(links)) return false;
          if (links.length === 0) return false;
          return links.some(link => typeof link === "string" && link.length > 0);
        })
        .map(([provider]) => provider)
    : [];

  const prioritizeTorbox = settings.prioritizeTorboxOverSeamless;
  const torboxProviders = prioritizeTorbox ? providers : ["1fichier", "megadb"];

  console.log("Final Available Providers:", providers);

  useEffect(() => {
    if (gameData?.download_links) {
      const availableProviders = Object.keys(gameData.download_links).filter(
        provider => gameData.download_links[provider]?.length > 0
      );

      if (availableProviders.includes("gofile")) {
        setSelectedProvider("gofile");
      } else if (
        torboxService.isEnabled(settings) &&
        availableProviders.includes("1fichier")
      ) {
        setSelectedProvider("1fichier");
      } else if (availableProviders.includes("buzzheavier")) {
        setSelectedProvider("buzzheavier");
      } else if (availableProviders.length > 0) {
        setSelectedProvider(availableProviders[0]);
      } else {
        setSelectedProvider("");
      }
    } else {
      setSelectedProvider("");
    }
  }, [gameData]);

  if (gameData && gameData.game) {
    gameData.game = sanitizeGameName(gameData.game);
  }

  return (
    <div
      className="container mx-auto flex min-h-screen max-w-7xl flex-col items-center fade-in"
      style={{ transform: `scale(0.95)`, transformOrigin: "top center" }}
      ref={mainContentRef}
    >
      <div className="w-full max-w-6xl">
        <div
          className="cursor-pointer text-center font-bold text-muted-foreground transition-colors hover:text-foreground"
          style={{
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
          onClick={() => navigate("/search")}
        >
          {t("download.pressEscToGoBack")}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {/* Game Header Section */}
          <div className="flex items-start gap-4">
            <img
              src={cachedImage || `https://api.ascendara.app/v2/image/${gameData.imgID}`}
              alt={gameData.game}
              className="h-36 w-64 rounded-lg object-cover"
            />
            <div className="flex flex-col">
              <div className="flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-2xl font-bold">
                  {gameData.game}
                  {gameData.rating > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="ml-2 flex cursor-help">
                            {[...Array(Math.round(gameData.rating))].map((_, i) => (
                              <Star
                                key={i}
                                className="h-5 w-5 fill-current text-yellow-400"
                              />
                            ))}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="max-w-[300px] font-semibold text-secondary">
                            {t("download.ratingTooltip", { rating: gameData.rating })}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </h1>
                {settings.gameSource !== "fitgirl" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button className="fixed right-8" variant="outline" size="sm">
                        {t("download.reportBroken")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <form
                        onSubmit={e => {
                          e.preventDefault();
                          handleSubmitReport();
                        }}
                      >
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-2xl font-bold text-foreground">
                            {t("download.reportBroken")}: {gameData.game}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                {t("download.reportReason")}
                              </label>
                              <Select
                                value={reportReason}
                                onValueChange={setReportReason}
                              >
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t("download.reportReasons.placeholder")}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="gamedetails">
                                    {t("download.reportReasons.gameDetails")}
                                  </SelectItem>
                                  <SelectItem value="filesnotdownloading">
                                    {t("download.reportReasons.filesNotDownloading")}
                                  </SelectItem>
                                  <SelectItem value="notagame">
                                    {t("download.reportReasons.notAGame")}
                                  </SelectItem>
                                  <SelectItem value="linksnotworking">
                                    {t("download.reportReasons.linksNotWorking")}
                                  </SelectItem>
                                  <SelectItem value="image-error">
                                    {t("download.reportReasons.imageError")}
                                  </SelectItem>
                                  <SelectItem value="image-bad">
                                    {t("download.reportReasons.imageBad")}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                {t("download.reportDescription")}
                              </label>
                              <Textarea
                                placeholder={t("download.reportDescription")}
                                value={reportDetails}
                                onChange={e => setReportDetails(e.target.value)}
                                className="min-h-[100px]"
                              />
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter className="mt-4 gap-2">
                          <AlertDialogCancel
                            className="text-primary"
                            onClick={() => {
                              setReportReason("");
                              setReportDetails("");
                            }}
                          >
                            {t("common.cancel")}
                          </AlertDialogCancel>
                          <Button
                            type="submit"
                            className="text-secondary"
                            disabled={isReporting}
                          >
                            {isReporting ? (
                              <>
                                <Loader className="mr-2 h-4 w-4 animate-spin" />
                                {t("download.submitting")}
                              </>
                            ) : (
                              t("download.submitReport")
                            )}
                          </Button>
                        </AlertDialogFooter>
                      </form>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              <div className="flex items-center gap-2">
                {gameData.emulator && (
                  <span className="mb-2 flex items-center gap-1 rounded bg-yellow-500/10 px-2 py-0.5 text-sm text-yellow-500">
                    <CircleSlash className="mr-1 h-4 w-4" />{" "}
                    {t("download.gameNeedsEmulator")}&nbsp;
                    <a
                      onClick={() =>
                        window.electron.openURL(
                          "https://ascendara.app/docs/troubleshooting/emulators"
                        )
                      }
                      className="cursor-pointer hover:underline"
                    >
                      {t("common.learnMore")}{" "}
                      <ExternalLink className="mb-1 inline-block h-3 w-3" />
                    </a>
                  </span>
                )}
                {gameData.category?.includes("Virtual Reality") && (
                  <span className="mb-2 flex items-center rounded bg-purple-500/10 px-2 py-0.5 text-sm text-foreground">
                    <svg
                      className="p-0.5 text-foreground"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2 10C2 8.89543 2.89543 8 4 8H20C21.1046 8 22 8.89543 22 10V17C22 18.1046 21.1046 19 20 19H16.1324C15.4299 19 14.7788 18.6314 14.4174 18.029L12.8575 15.4292C12.4691 14.7818 11.5309 14.7818 11.1425 15.4292L9.58261 18.029C9.22116 18.6314 8.57014 19 7.86762 19H4C2.89543 19 2 18.1046 2 17V10Z"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                      <path
                        d="M3.81253 6.7812C4.5544 5.6684 5.80332 5 7.14074 5H16.8593C18.1967 5 19.4456 5.6684 20.1875 6.7812L21 8H3L3.81253 6.7812Z"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                    <span className="ml-1text-foreground">
                      &nbsp;{t("download.gameNeedsVR")}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {gameData.version && (
                  <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-sm text-primary">
                    {gameData.version}
                    {timemachineSetting && (
                      <History
                        onClick={() => setShowTimemachineSelection(true)}
                        className="h-4 w-4 cursor-pointer"
                      />
                    )}
                  </span>
                )}
                {gameData.online && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex cursor-help items-center gap-1 rounded bg-green-500/10 px-2 py-0.5 text-sm text-green-500">
                          {t("download.online")}
                          <InfoIcon className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-secondary">{t("download.onlineTooltip")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {gameData.dlc && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex cursor-help items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-sm text-blue-500">
                          {t("download.allDlc")}
                          <InfoIcon className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-secondary">{t("download.allDlcTooltip")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              {gameData.size &&
                (() => {
                  const match = gameData.size
                    .trim()
                    .toLowerCase()
                    .match(/^([\d.]+)\s*(gb|mb)$/);
                  if (!match)
                    return (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("download.installSize")}: {gameData.size}
                      </p>
                    );
                  let [, num, unit] = match;
                  num = parseFloat(num);
                  let newNum, newUnit;
                  if (unit === "gb") {
                    newNum = num * 2.1;
                    newUnit = "GB";
                  } else {
                    newNum = num * 2.1;
                    newUnit = "MB";
                  }
                  const formatted =
                    newUnit === "GB" ? newNum.toFixed(1) : Math.round(newNum);
                  return (
                    <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                      {t("download.installSize")}: ~{formatted} {newUnit}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <FileQuestion className="h-3.5 w-3.5 cursor-pointer text-muted-foreground hover:text-foreground" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("download.installSizeInfo.title")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("download.installSizeInfo.description")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <p className="text-sm text-muted-foreground">
                            {t("download.installSizeInfo.note")}
                          </p>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.close")}</AlertDialogCancel>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      &nbsp;{t("download.gameSize")}: {gameData.size}
                    </p>
                  );
                })()}
              <p className="mt-2 text-sm text-muted-foreground">
                {t("download.latestUpdate")}: {formatLatestUpdate(gameData.latest_update)}
              </p>

              {/* OpenCritic Reviews Button */}
              <div className="mt-3 flex justify-start">
                <Button
                  variant="outline"
                  size="sm"
                  className="inline-flex items-center gap-1.5"
                  onClick={() => handleOpenCriticDialog(gameData.game)}
                >
                  <Eye className="h-4 w-4 text-primary" />
                  {t("download.viewCriticReviews")}
                </Button>
              </div>

              {/* OpenCritic Beta Warning Dialog */}
              <AlertDialog
                open={showOpenCriticWarning}
                onOpenChange={setShowOpenCriticWarning}
              >
                <AlertDialogContent className="max-h-[85vh] max-w-md overflow-y-auto border-border bg-background/95 p-4 backdrop-blur-sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold text-primary">
                      <AlertTriangle className="text-warning h-5 w-5" />
                      {t("download.betaFeature")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="mt-3 text-sm" asChild>
                      <div className="p-3">{t("download.openCriticBetaWarning")}</div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="mt-4">
                    <Button
                      className="w-full text-secondary"
                      onClick={() => {
                        setShowOpenCriticWarning(false);
                        localStorage.setItem("openCriticBetaWarningShown", "1");
                        handleOpenCriticDialog(gameData.game);
                      }}
                    >
                      {t("download.understand")}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* System Requirements Section - Right Column */}
            {gameData.minReqs && (
              <div className="ml-auto mr-24 w-72 shrink-0">
                <p className="mb-1.5 text-xs font-medium text-primary">
                  {t("download.systemRequirements")}
                </p>
                <div className="rounded-md border border-border/30 bg-card/60 p-2 text-xs">
                  <div className="grid gap-1">
                    {gameData.minReqs.os && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {t("download.specs.os")}
                        </span>
                        <span className="text-right text-foreground">
                          {gameData.minReqs.os}
                        </span>
                      </div>
                    )}
                    {gameData.minReqs.cpu && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {t("download.specs.cpu")}
                        </span>
                        <span className="text-right text-foreground">
                          {gameData.minReqs.cpu}
                        </span>
                      </div>
                    )}
                    {gameData.minReqs.ram && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {t("download.specs.ram")}
                        </span>
                        <span className="text-right text-foreground">
                          {gameData.minReqs.ram}
                        </span>
                      </div>
                    )}
                    {gameData.minReqs.gpu && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {t("download.specs.gpu")}
                        </span>
                        <span className="text-right text-foreground">
                          {gameData.minReqs.gpu}
                        </span>
                      </div>
                    )}
                    {gameData.minReqs.directx && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {t("download.specs.directx")}
                        </span>
                        <span className="text-right text-foreground">
                          {gameData.minReqs.directx}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex justify-center">
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={async () => {
                        setShowCompareDialog(true);
                        setSystemSpecsLoading(true);
                        try {
                          const specs = await window.electron.fetchSystemSpecs();
                          setSystemSpecs(specs);
                        } catch (err) {
                          console.error("Failed to fetch system specs:", err);
                        } finally {
                          setSystemSpecsLoading(false);
                        }
                      }}
                    >
                      {t("download.compareYourPC")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Compare Your PC Dialog */}
          <AlertDialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
            <AlertDialogContent className="max-w-2xl border-border bg-background/95 p-6 backdrop-blur-sm">
              <AlertDialogHeader className="mb-4">
                <AlertDialogTitle className="text-xl font-bold text-primary">
                  {t("download.compareYourPC")}
                </AlertDialogTitle>
              </AlertDialogHeader>

              {systemSpecsLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader className="h-10 w-10 animate-spin text-primary" />
                </div>
              ) : systemSpecs ? (
                <div className="space-y-4">
                  {/* Spec Comparison Table */}
                  <div className="overflow-hidden rounded-lg border border-border/50">
                    {/* Header Row */}
                    <div className="grid grid-cols-3 bg-primary/10">
                      <div className="p-3 text-sm font-semibold text-muted-foreground">
                        {t("download.specs.component")}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm font-semibold text-primary">
                        {t("download.yourPC")}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm font-semibold text-primary">
                        {t("download.required")}
                      </div>
                    </div>

                    {/* OS Row */}
                    <div className="grid grid-cols-3 border-t border-border/30">
                      <div className="p-3 text-sm font-medium text-muted-foreground">
                        {t("download.specs.os")}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {systemSpecs.os}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {gameData.minReqs?.os || "-"}
                      </div>
                    </div>

                    {/* CPU Row */}
                    <div className="grid grid-cols-3 border-t border-border/30 bg-card/30">
                      <div className="p-3 text-sm font-medium text-muted-foreground">
                        {t("download.specs.cpu")}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {systemSpecs.cpu}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {gameData.minReqs?.cpu || "-"}
                      </div>
                    </div>

                    {/* RAM Row */}
                    <div className="grid grid-cols-3 border-t border-border/30">
                      <div className="p-3 text-sm font-medium text-muted-foreground">
                        {t("download.specs.ram")}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {systemSpecs.ram}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {gameData.minReqs?.ram || "-"}
                      </div>
                    </div>

                    {/* GPU Row */}
                    <div className="grid grid-cols-3 border-t border-border/30 bg-card/30">
                      <div className="p-3 text-sm font-medium text-muted-foreground">
                        {t("download.specs.gpu")}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {systemSpecs.gpu}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {gameData.minReqs?.gpu || "-"}
                      </div>
                    </div>

                    {/* DirectX Row */}
                    <div className="grid grid-cols-3 border-t border-border/30">
                      <div className="p-3 text-sm font-medium text-muted-foreground">
                        {t("download.specs.directx")}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {systemSpecs.directx}
                      </div>
                      <div className="border-l border-border/30 p-3 text-sm text-foreground">
                        {gameData.minReqs?.directx || "-"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  {t("download.failedToLoadSpecs")}
                </div>
              )}

              <AlertDialogFooter className="mt-6">
                <AlertDialogCancel>{t("common.close")}</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* OpenCritic Dialog */}
          <AlertDialog open={openCriticDialog} onOpenChange={setOpenCriticDialog}>
            <AlertDialogContent className="max-h-[85vh] max-w-md overflow-y-auto border-border bg-background/95 p-4 backdrop-blur-sm">
              <X
                className="absolute right-4 top-4 h-5 w-5 cursor-pointer text-primary"
                onClick={() => setOpenCriticDialog(false)}
              />
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold text-primary">
                  <Eye className="h-5 w-5" />
                  {criticData ? criticData.name : gameData.game} -{" "}
                  {t("download.criticReviews")}
                </AlertDialogTitle>
              </AlertDialogHeader>

              {criticLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : criticError ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <AlertTriangle className="mb-2 h-10 w-10 text-yellow-500" />
                  <p>{t("download.criticError")}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{criticError}</p>
                </div>
              ) : criticData && criticData.warning === "game_not_rated" ? (
                <div className="flex flex-col items-center justify-center space-y-4 py-6 text-center">
                  <div className="rounded-full border border-yellow-500/30 bg-yellow-500/10 p-4">
                    <AlertTriangle className="h-10 w-10 text-yellow-500" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-primary">
                      {criticData.name}
                    </h3>
                    <p className="text-muted-foreground">{t("download.gameNotRated")}</p>
                  </div>

                  <div className="mt-2 w-full max-w-xs rounded-md border border-border/30 bg-card/60 p-4 shadow-sm">
                    <p className="text-center text-sm text-muted-foreground">
                      {t("download.noReviewsExplanation")}
                    </p>
                  </div>
                </div>
              ) : criticData ? (
                <div className="space-y-3 p-1">
                  {!criticData.exactMatch && (
                    <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-yellow-500">
                        <InfoIcon className="h-3 w-3" />
                        {t("download.notExactMatch")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("download.showingResultsFor")}:{" "}
                        <span className="font-medium">{criticData.searchResult}</span>
                      </p>
                    </div>
                  )}

                  {/* Warning for games not rated by critics is now handled in the main conditional render */}

                  {/* Game Description Section */}
                  {criticData.description && (
                    <div className="rounded-md border border-border/30 bg-card/60 p-3 shadow-sm">
                      <p className="text-sm text-foreground">{criticData.description}</p>
                    </div>
                  )}

                  {/* Genres and Platforms */}
                  <div className="grid grid-cols-2 gap-2">
                    {criticData.genres && criticData.genres.length > 0 && (
                      <div className="rounded-md border border-border/30 bg-card/60 p-3 shadow-sm">
                        <h4 className="mb-1 text-sm font-medium text-primary">
                          {t("download.genres")}
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {criticData.genres.map((genre, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                            >
                              {genre}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {criticData.platforms && criticData.platforms.length > 0 && (
                      <div className="rounded-md border border-border/30 bg-card/60 p-3 shadow-sm">
                        <h4 className="mb-1 text-sm font-medium text-primary">
                          {t("download.platforms")}
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {criticData.platforms.map((platform, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                            >
                              {platform}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Scores Section */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border/30 bg-card/60 p-3 shadow-sm">
                      <p className="text-sm text-primary">{t("download.medianScore")}</p>
                      <p className="text-2xl font-bold tracking-tight text-primary">
                        {criticData.medianScore !== null ? criticData.medianScore : "-"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border/30 bg-card/60 p-3 shadow-sm">
                      <p className="text-sm text-primary">
                        {t("download.topCriticScore")}
                      </p>
                      <p className="text-2xl font-bold tracking-tight text-primary">
                        {criticData.topCriticScore !== null
                          ? criticData.topCriticScore
                          : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border/30 bg-card/60 p-3 shadow-sm">
                      <p className="text-sm text-primary">{t("download.tier")}</p>
                      <p className="text-xl font-semibold tracking-tight text-primary">
                        {criticData.tier ? criticData.tier : "-"}
                      </p>
                    </div>

                    <div className="rounded-md border border-border/30 bg-card/60 p-3 shadow-sm">
                      <p className="text-sm text-primary">{t("download.reviewCount")}</p>
                      <p className="text-xl font-semibold tracking-tight text-primary">
                        {criticData.numReviews ? criticData.numReviews : "0"}
                      </p>
                    </div>
                  </div>

                  {/* Review Snippets Section */}
                  {criticData.reviews && criticData.reviews.length > 0 && (
                    <div className="rounded-md border border-border/30 bg-card/60 p-3 shadow-sm">
                      <h4 className="mb-2 text-sm font-medium text-primary">
                        {t("download.reviewSnippets")}
                      </h4>
                      <div className="space-y-2">
                        {criticData.reviews.map((review, index) => (
                          <div
                            key={index}
                            className="border-b border-border pb-2 last:border-0 last:pb-0"
                          >
                            <p className="mb-1 text-sm italic text-primary">
                              "{review.snippet}"
                            </p>
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-primary">
                                {t("download.by")}{" "}
                                <span className="font-medium text-primary/80">
                                  {review.author}
                                </span>{" "}
                                ({review.outlet})
                              </p>
                              {review.score && (
                                <span className="text-xs font-bold text-primary">
                                  {review.score}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time to Beat Section */}
                  {criticData.timeToBeat &&
                    Object.keys(criticData.timeToBeat).length > 0 && (
                      <div className="rounded-md border border-border/30 bg-card/60 p-3 shadow-sm">
                        <p className="mb-1 text-sm font-medium text-primary">
                          {t("download.timeToBeat")}
                        </p>
                        <div className="space-y-2">
                          {criticData.timeToBeat.mainStory > 0 && (
                            <div className="flex justify-between">
                              <span className="text-sm text-primary">
                                {t("download.mainStory")}:
                              </span>
                              <span className="text-sm font-medium">
                                {criticData.timeToBeat.mainStory} {t("download.hours")}
                              </span>
                            </div>
                          )}
                          {criticData.timeToBeat.mainPlusExtras > 0 && (
                            <div className="flex justify-between">
                              <span className="text-sm text-primary">
                                {t("download.mainPlusExtras")}:
                              </span>
                              <span className="text-sm font-medium">
                                {criticData.timeToBeat.mainPlusExtras}{" "}
                                {t("download.hours")}
                              </span>
                            </div>
                          )}
                          {criticData.timeToBeat.completionist > 0 && (
                            <div className="flex justify-between">
                              <span className="text-sm text-primary">
                                {t("download.completionist")}:
                              </span>
                              <span className="text-sm font-medium">
                                {criticData.timeToBeat.completionist}{" "}
                                {t("download.hours")}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  <div className="mt-4 flex justify-between border-t border-border/50 pt-2 text-primary">
                    <Button
                      variant="outline"
                      size="sm"
                      className="inline-flex items-center gap-1.5 transition-colors hover:bg-primary/10"
                      onClick={() =>
                        window.electron.openURL(
                          `${criticData.url}/reviews` || `https://opencritic.com`
                        )
                      }
                    >
                      {t("download.readReviews")} <ExternalLink className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="inline-flex items-center gap-1.5 transition-colors hover:bg-primary/10"
                      onClick={() =>
                        window.electron.openURL(
                          criticData.url || `https://opencritic.com`
                        )
                      }
                    >
                      {t("download.viewOnOpenCritic")}{" "}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </AlertDialogContent>
          </AlertDialog>

          {/* DMCA / Local Notice Banner */}
          {settings?.usingLocalIndex ? (
            <div
              className="w-full cursor-pointer rounded-lg border border-green-500/30 bg-green-500/10 p-3 transition-colors hover:bg-green-500/20"
              onClick={() => window.electron.openURL("https://ascendara.app/support")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <InfoIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700">
                    {t("download.localSourceMsg")}
                  </span>
                </div>
                <span className="flex items-center gap-1 text-sm text-green-700">
                  {t("common.learnMore")}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="w-full cursor-pointer rounded-lg border border-primary/20 bg-primary/10 p-3 transition-colors hover:bg-primary/15"
              onClick={() => window.electron.openURL("https://ascendara.app/dmca")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareWarning className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{t("download.dmcaNotice")}</span>
                </div>
                <span className="flex items-center gap-1 text-sm text-primary hover:underline">
                  {t("common.learnMore")} <ExternalLink size={16} />
                </span>
              </div>
            </div>
          )}

          <Separator className="my-1" />

          {/* Download Options Section */}
          {settings.gameSource === "fitgirl" && gameData.torrentLink ? (
            <div className="mx-auto max-w-xl">
              <div className="flex flex-col items-center space-y-8 py-2">
                <div className="flex w-full items-center justify-between">
                  <h2 className="flex items-center gap-2 text-xl font-semibold">
                    <span className="flex items-center gap-1">FitGirl Repacks</span>
                  </h2>
                </div>

                <div className="w-full max-w-md space-y-4 text-center">
                  <h3 className="text-2xl font-semibold">
                    {t("download.downloadOptions.torrentInstructions.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("download.downloadOptions.torrentInstructions.description")}
                  </p>
                </div>

                {!torrentRunning && (
                  <p className="text-muted-foreground">
                    <AlertTriangle className="mr-2 inline-block h-4 w-4" />
                    {t("download.downloadOptions.torrentInstructions.noTorrent")}
                  </p>
                )}

                <div className="w-full max-w-md">
                  <Button
                    onClick={() => whereToDownload()}
                    disabled={isStartingDownload || !gameData || !torrentRunning}
                    className="h-12 w-full text-lg text-secondary"
                  >
                    {isStartingDownload ? (
                      <>
                        {t("download.sendingTorrent")}
                        <Loader className="ml-2 h-4 w-4 animate-spin" />
                      </>
                    ) : (
                      t("download.downloadOptions.downloadTorrent")
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (torboxProviders.includes(selectedProvider) &&
              torboxService.isEnabled(settings) &&
              torboxService.getApiKey(settings)) ||
            seamlessProviders.includes(selectedProvider) ? (
            <div className="mx-auto max-w-xl">
              <div className="flex flex-col items-center space-y-8 py-6">
                <div className="flex w-full items-center justify-between">
                  <h2 className="flex items-center gap-2 text-xl font-semibold">
                    <span className="flex items-center gap-1">
                      {torboxProviders.includes(selectedProvider) &&
                      torboxService.isEnabled(settings) &&
                      torboxService.getApiKey(settings) ? (
                        <>
                          Torbox <TorboxIcon className="h-4 w-4 text-primary" />
                        </>
                      ) : seamlessProviders.includes(selectedProvider) ? (
                        <>
                          Seamless{" "}
                          <Zap fill="currentColor" className="h-4 w-4 text-primary" />
                        </>
                      ) : (
                        <>{selectedProvider}</>
                      )}
                    </span>
                  </h2>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder={t("download.switchProvider")} />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-background">
                      {providers.map(provider => {
                        let displayName;
                        switch (provider.toLowerCase()) {
                          case "gofile":
                            displayName = !settings.prioritizeTorboxOverSeamless
                              ? "Seamless (GoFile)"
                              : "GoFile";
                            break;
                          case "megadb":
                            displayName = "MegaDB";
                            break;
                          case "buzzheavier":
                            displayName = !settings.prioritizeTorboxOverSeamless
                              ? "Seamless (BuzzHeavier)"
                              : "BuzzHeavier";
                            break;
                          case "pixeldrain":
                            displayName = !settings.prioritizeTorboxOverSeamless
                              ? "Seamless (PixelDrain)"
                              : "PixelDrain";
                            break;
                          case "qiwi":
                            displayName = "QIWI";
                            break;
                          case "datanodes":
                            displayName = "DataNodes";
                            break;
                          default:
                            displayName =
                              provider.charAt(0).toUpperCase() + provider.slice(1);
                        }
                        const isVerified = VERIFIED_PROVIDERS.includes(
                          provider.toLowerCase()
                        );
                        return (
                          <SelectItem
                            key={provider}
                            value={provider}
                            className="hover:bg-muted focus:bg-muted"
                          >
                            <div className="flex items-center gap-2">
                              {displayName}
                              {isVerified && <BadgeCheckIcon className="h-4 w-4" />}
                              {provider === "1fichier" &&
                                torboxService.isEnabled(settings) && (
                                  <TorboxIcon className="h-4 w-4 text-primary" />
                                )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full max-w-md space-y-4 text-center">
                  <h3 className="text-2xl font-semibold">
                    {(() => {
                      const isTorbox =
                        torboxProviders.includes(selectedProvider) &&
                        torboxService.isEnabled(settings) &&
                        torboxService.getApiKey(settings);
                      const isSeamless = seamlessProviders.includes(selectedProvider);

                      if (isTorbox)
                        return t("download.downloadOptions.torboxInstructions.title");
                      if (isSeamless)
                        return t("download.downloadOptions.seamlessInstructions.title");
                      return selectedProvider;
                    })()}
                  </h3>
                  <p className="text-muted-foreground">
                    {(() => {
                      const isTorbox =
                        torboxProviders.includes(selectedProvider) &&
                        torboxService.isEnabled(settings) &&
                        torboxService.getApiKey(settings);
                      const isSeamless = seamlessProviders.includes(selectedProvider);

                      if (isTorbox)
                        return t(
                          "download.downloadOptions.torboxInstructions.description"
                        );
                      if (isSeamless)
                        return t(
                          "download.downloadOptions.seamlessInstructions.description"
                        );
                      return "";
                    })()}
                  </p>
                </div>

                <div className="w-full max-w-md">
                  <Button
                    onClick={() => whereToDownload()}
                    disabled={isStartingDownload || !gameData}
                    className="h-12 w-full text-lg text-secondary"
                  >
                    {isStartingDownload ? (
                      <>
                        {t("download.downloadOptions.downloading")}
                        <Loader className="ml-2 h-5 w-5 animate-spin" />
                      </>
                    ) : gameData.isUpdating ? (
                      <>
                        {t("gameCard.update")}
                        <ArrowUpFromLine className="ml-2 h-5 w-5 stroke-[3]" />
                      </>
                    ) : (
                      <>{t("download.downloadOptions.downloadNow")}</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Left Column - Download Options */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-xl font-semibold">
                    {t("download.downloadOptions.downloadOptions")}
                  </h2>
                  {isDev && (
                    <Button
                      onClick={() => {
                        window.electron.openURL(gameData.dirlink);
                      }}
                      className="h-12 w-full text-lg text-secondary"
                    >
                      (DEV) Open Direct Link
                    </Button>
                  )}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t("download.downloadOptions.downloadSource")}</Label>
                      {providers.length > 0 ? (
                        <Select
                          value={selectedProvider}
                          onValueChange={setSelectedProvider}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t("download.downloadOptions.selectProvider")}
                            />
                          </SelectTrigger>
                          <SelectContent className="border-border bg-background">
                            {providers.map(provider => {
                              let displayName;
                              switch (provider.toLowerCase()) {
                                case "gofile":
                                  displayName = "Seamless (GoFile)";
                                  break;
                                case "megadb":
                                  displayName = "MegaDB";
                                  break;
                                case "buzzheavier":
                                  displayName = "Seamless (BuzzHeavier)";
                                  break;
                                case "pixeldrain":
                                  displayName = "Seamless (PixelDrain)";
                                  break;
                                case "qiwi":
                                  displayName = "QIWI";
                                  break;
                                case "datanodes":
                                  displayName = "DataNodes";
                                  break;
                                default:
                                  displayName =
                                    provider.charAt(0).toUpperCase() + provider.slice(1);
                              }
                              const isVerified = VERIFIED_PROVIDERS.includes(
                                provider.toLowerCase()
                              );
                              return (
                                <SelectItem
                                  key={provider}
                                  value={provider}
                                  className="hover:bg-muted focus:bg-muted"
                                >
                                  <div className="flex items-center gap-2">
                                    {displayName}
                                    {isVerified && <BadgeCheckIcon className="h-4 w-4" />}
                                    {provider === "1fichier" &&
                                      torboxService.isEnabled(settings) && (
                                        <TorboxIcon className="h-7 w-7" />
                                      )}
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p>{t("download.downloadOptions.noProviders")}</p>
                      )}
                    </div>

                    {selectedProvider && (
                      <div className="space-y-3">
                        <div>
                          <Label>{t("download.downloadOptions.downloadLink")}</Label>
                          <div className="mt-1 flex items-center gap-2">
                            <div
                              className="group flex flex-1 cursor-pointer items-center justify-between rounded-md bg-muted p-2 text-sm transition-colors hover:bg-muted/80"
                              onClick={handleCopyLink}
                            >
                              <span>
                                {downloadLinks[selectedProvider] &&
                                downloadLinks[selectedProvider][0]
                                  ? downloadLinks[selectedProvider][0].startsWith("//")
                                    ? `https:${downloadLinks[selectedProvider][0]}`
                                    : downloadLinks[selectedProvider][0]
                                  : t("download.downloadOptions.noDownloadLink")}
                              </span>
                              {showCopySuccess ? (
                                <CheckIcon className="h-4 w-4 text-green-500" />
                              ) : (
                                <CopyIcon className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={handleOpenInBrowser}
                              variant="outline"
                            >
                              {t("download.downloadOptions.openInBrowser")}
                            </Button>
                          </div>
                        </div>

                        {!useAscendara && (
                          <div>
                            <Input
                              placeholder={t("download.downloadOptions.pasteLink")}
                              value={inputLink}
                              onChange={handleInputChange}
                              className={!isValidLink ? "border-red-500" : ""}
                            />
                            {!isValidLink && (
                              <p className="mt-1 text-sm text-red-500">
                                {t("download.downloadOptions.invalidLink")}{" "}
                                {selectedProvider}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedProvider && (
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="ascendara-handler"
                            checked={useAscendara}
                            onCheckedChange={checked => {
                              setUseAscendara(checked);
                              localStorage.setItem(
                                "useAscendara",
                                JSON.stringify(checked)
                              );
                            }}
                          />
                          <Label htmlFor="ascendara-handler" className="text-sm">
                            {t("download.downloadOptions.ascendaraHandler")}
                          </Label>
                        </div>
                        {!useAscendara && (
                          <p
                            className="cursor-pointer text-xs text-muted-foreground hover:underline"
                            onClick={() =>
                              window.electron.openURL("https://ascendara.app/extension")
                            }
                          >
                            {t("download.downloadOptions.getExtension")}
                          </p>
                        )}
                      </div>
                    )}

                    {selectedProvider && useAscendara && (
                      <div className="flex items-center justify-center space-x-2 py-2 text-muted-foreground">
                        <Loader className="h-4 w-4 animate-spin" />
                        <span className="text-sm">
                          {isStartingDownload
                            ? t("download.downloadOptions.startingDownload")
                            : t("download.downloadOptions.waitingForBrowser")}
                        </span>
                      </div>
                    )}

                    {!useAscendara && (
                      <Button
                        onClick={() => whereToDownload()}
                        disabled={
                          isStartingDownload ||
                          !selectedProvider ||
                          !inputLink ||
                          !isValidLink ||
                          !gameData
                        }
                        className="w-full text-secondary"
                      >
                        {isStartingDownload ? (
                          <>
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                            {t("download.downloadOptions.downloading")}
                          </>
                        ) : gameData.isUpdating ? (
                          <>
                            <ArrowUpFromLine className="mr-2 h-4 w-4" />
                            {t("gameCard.update")}
                          </>
                        ) : (
                          t("download.downloadOptions.downloadNow")
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Instructions */}
              <div className="space-y-3">
                {selectedProvider && selectedProvider !== "gofile" && (
                  <Card className="relative overflow-hidden border-border bg-card/50">
                    <div
                      className={`absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent opacity-50`}
                    />
                    <CardContent className="relative space-y-4 p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <TriangleAlert className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            {t("download.protectYourself.warningTitle")}
                          </h3>
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            {t("download.protectYourself.warning")}
                          </p>
                          <a
                            onClick={() =>
                              window.electron.openURL(
                                "https://ascendara.app/protect-yourself"
                              )
                            }
                            className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm text-primary/80 transition-colors hover:text-primary"
                          >
                            {t("download.protectYourself.learnHow")}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {selectedProvider ? (
                  <div>
                    {useAscendara ? (
                      <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                        <li>{t("download.downloadOptions.handlerInstructions.step1")}</li>
                        <li>{t("download.downloadOptions.handlerInstructions.step2")}</li>
                        <li>{t("download.downloadOptions.handlerInstructions.step3")}</li>
                      </ol>
                    ) : (
                      <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                        <li>{t("download.downloadOptions.manualInstructions.step1")}</li>
                        <li>{t("download.downloadOptions.manualInstructions.step2")}</li>
                        <li>{t("download.downloadOptions.manualInstructions.step3")}</li>
                        <li>{t("download.downloadOptions.manualInstructions.step4")}</li>
                        <li>{t("download.downloadOptions.manualInstructions.step5")}</li>
                        <li>{t("download.downloadOptions.manualInstructions.step6")}</li>
                      </ol>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("download.downloadOptions.selectProviderPrompt")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {igdbData && (
        <div className="mt-4 opacity-50">{t("download.scrollToViewMore")}</div>
      )}

      {settings.usingLocalIndex && (
        <TooltipProvider>
          <Tooltip open={showShareCopySuccess}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={handleShareLink}
                className="z-50 ml-auto gap-2"
              >
                {showShareCopySuccess ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
                {t("download.shareGame")}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-secondary" side="left">
              <p>{t("download.linkCopied")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* IGDB Game Store-like Section */}
      {gameData && (
        <div
          ref={igdbSectionRef}
          className="mb-8 mt-48 overflow-hidden rounded-lg border border-border bg-card shadow-md"
        >
          {igdbLoading ? (
            <div className="flex items-center justify-center px-16 py-16">
              <Loader className="mr-2 h-4 w-4 animate-spin text-primary" />
              {t("download.igdbLoading")}
            </div>
          ) : igdbData ? (
            <>
              {/* Hero Banner with Cover Image */}
              <div className="relative">
                {igdbData.screenshots && igdbData.screenshots.length > 0 ? (
                  <div className="relative h-[400px] w-full overflow-hidden">
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${igdbService.formatImageUrl(igdbData.screenshots[0].url, "screenshot_huge")})`,
                        filter: "blur(1px)",
                        transform: "scale(1.01)",
                      }}
                    ></div>
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/90 to-transparent"></div>

                    <div className="absolute bottom-0 left-0 right-0 flex items-end p-8">
                      <div className="relative z-10 flex w-full flex-col md:flex-row md:items-end">
                        {/* Game Cover */}
                        {igdbData.cover && (
                          <div className="mb-4 h-[200px] w-[150px] shrink-0 overflow-hidden rounded-md border border-border shadow-lg md:mb-0 md:mr-6">
                            <img
                              src={igdbService.formatImageUrl(
                                igdbData.cover.url,
                                "cover_big"
                              )}
                              alt={igdbData.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}
                        {/* Game Title and Basic Info */}
                        <div className="flex-1">
                          <h1 className="text-3xl font-bold text-primary drop-shadow-md">
                            {igdbData.name || gameData.game}
                          </h1>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-primary/80">
                            {gameData.version && (
                              <span className="rounded bg-primary/20 px-2 py-1">
                                v{gameData.version}
                              </span>
                            )}
                            {gameData.online && (
                              <span className="flex items-center gap-1 rounded bg-blue-500/20 px-2 py-1">
                                <Gamepad2 className="h-4 w-4" />
                                Online
                              </span>
                            )}
                            {gameData.dlc && (
                              <span className="flex items-center gap-1 rounded bg-green-500/20 px-2 py-1">
                                <Gift className="h-4 w-4" />
                                DLC
                              </span>
                            )}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-4">
                            {igdbData.rating && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex cursor-help items-center gap-2">
                                      <Apple className="h-5 w-5 fill-red-400 text-red-400" />
                                      <span className="text-sm font-medium text-primary">
                                        {(igdbData.rating / 10).toFixed(1)}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    <p className="max-w-[300px] text-xs font-semibold text-secondary">
                                      {t("download.igdbRating", {
                                        rating: (igdbData.rating / 10).toFixed(1),
                                      })}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            {gameData.rating > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex cursor-help items-center gap-2">
                                      <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                                      <span className="text-sm font-medium text-primary">
                                        {gameData.rating}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    <p className="max-w-[300px] font-semibold text-secondary">
                                      {t("download.ratingTooltip", {
                                        rating: gameData.rating,
                                      })}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            {igdbData.release_date && (
                              <div className="rounded-full bg-primary/20 px-3 py-1 text-sm font-medium text-primary">
                                {t("download.firstReleasedOn")}: {igdbData.release_date}
                              </div>
                            )}

                            {gameData.category && gameData.category.length > 0 && (
                              <div className="hidden rounded-full bg-card/80 px-3 py-1 text-sm font-medium text-foreground md:block">
                                {gameData.category.slice(0, 2).join(", ")}
                                {gameData.category.length > 2 && "..."}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[200px] items-center justify-center bg-gradient-to-r from-primary/20 to-secondary/20">
                    <h1 className="text-3xl font-bold text-foreground">
                      {igdbData.name || gameData.game}
                    </h1>
                  </div>
                )}
              </div>

              <div className="mt-4 flex space-x-4 pl-8">
                <Button
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="h-12 text-lg text-secondary"
                >
                  {t("download.downloadOptions.downloadNow")}
                  <ArrowDownCircle className="ml-2 h-6 w-6" />
                </Button>

                <Button
                  onClick={handleShareLink}
                  className="flex h-12 items-center text-lg text-secondary"
                >
                  {showShareCopySuccess ? (
                    <>
                      <CheckIcon className="mr-2 h-4 w-4" />
                      {t("download.linkCopied")}
                    </>
                  ) : (
                    <>
                      <Share className="mr-2 h-4 w-4" />
                      {t("download.shareGame")}
                    </>
                  )}
                </Button>
              </div>

              {/* Main Content */}
              <div className="p-8">
                {/* Game Details Grid - 3 columns on large screens */}
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                  {/* Game Summary - Spans 2 columns */}
                  <div className="md:col-span-2">
                    {igdbData.summary && (
                      <div className="mb-8">
                        <h2 className="mb-3 text-xl font-bold text-foreground">
                          {t("download.aboutGame")}
                        </h2>
                        <p className="leading-relaxed text-muted-foreground">
                          {igdbData.summary}
                        </p>

                        {igdbData.storyline && (
                          <div className="mt-4">
                            <p className="leading-relaxed text-muted-foreground">
                              {igdbData.storyline}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Game Metadata - Right column */}
                  <div className="space-y-6">
                    {/* Categories */}
                    {gameData.category && gameData.category.length > 0 && (
                      <div className="rounded-lg border border-border bg-card/50 p-4">
                        <h3 className="mb-2 font-semibold text-foreground">
                          {t("download.categories")}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {gameData.category.map((category, index) => (
                            <span
                              key={index}
                              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                            >
                              {category}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Developers & Publishers */}
                    {(igdbData.developers?.length > 0 ||
                      igdbData.publishers?.length > 0) && (
                      <div className="rounded-lg border border-border bg-card/50 p-4">
                        <h3 className="mb-2 font-semibold text-foreground">
                          {t("download.companies")}
                        </h3>

                        {igdbData.developers?.length > 0 && (
                          <div className="mb-2">
                            <h4 className="text-xs font-medium uppercase text-muted-foreground">
                              {t("download.developers")}
                            </h4>
                            <p className="text-sm text-foreground">
                              {igdbData.developers.join(", ")}
                            </p>
                          </div>
                        )}

                        {igdbData.publishers?.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium uppercase text-muted-foreground">
                              {t("download.publishers")}
                            </h4>
                            <p className="text-sm text-foreground">
                              {igdbData.publishers.join(", ")}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Screenshots Gallery - Full width */}
                {igdbData.screenshots && igdbData.screenshots.length > 0 && (
                  <div className="mb-64 mt-8">
                    <h2 className="mb-4 text-xl font-bold text-foreground">
                      {t("download.screenshots")}
                    </h2>
                    <GameScreenshots
                      screenshots={igdbData.screenshots.slice(0, 4).map(screenshot => ({
                        ...screenshot,
                        url: igdbService.formatImageUrl(screenshot.url, "screenshot_big"),
                        formatted_url: igdbService.formatImageUrl(
                          screenshot.url,
                          "screenshot_huge"
                        ),
                      }))}
                      className="h-[500px] w-full rounded-lg border border-border shadow-inner"
                    />
                  </div>
                )}

                {/* IGDB Attribution */}
                <div className="mt-8 flex items-center justify-end text-xs text-muted-foreground">
                  <span>{t("download.dataProvidedBy")}</span>
                  {igdbData?.source === "giantbomb" ? (
                    <a
                      onClick={() => window.electron.openURL("https://www.giantbomb.com")}
                      className="ml-1 flex cursor-pointer items-center text-primary hover:underline"
                    >
                      GiantBomb <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  ) : (
                    <a
                      onClick={() => window.electron.openURL("https://www.igdb.com")}
                      className="ml-1 flex cursor-pointer items-center text-primary hover:underline"
                    >
                      IGDB <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  )}
                  .
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t("download.infoMaybeInaccurate")}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6">
              {igdbError ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-destructive text-center font-medium">
                    {t("download.gameInfoError", "Error fetching game information")}
                  </p>
                  <p className="text-center text-sm text-muted-foreground">{igdbError}</p>
                </div>
              ) : (
                <p className="text-center text-muted-foreground">
                  {t("download.noGameInfoAvailable")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {gameData && (
        <TimemachineDialog
          gameData={gameData}
          onVersionSelect={version => setGameData(version)}
          open={showTimemachineSelection}
          onOpenChange={setShowTimemachineSelection}
        />
      )}

      <AlertDialog open={showUpdatePrompt} onOpenChange={setShowUpdatePrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("download.update.title", { game: gameData.game })}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-muted-foreground">
              {t("download.update.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              className="text-primary"
              onClick={() => setShowUpdatePrompt(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="text-secondary"
              onClick={() => {
                setShowUpdatePrompt(false);
                handleDownload();
              }}
            >
              {t("common.ok")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Select Download Path Dialog */}
      <AlertDialog open={showSelectPath} onOpenChange={setShowSelectPath}>
        <AlertDialogContent className="sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-foreground">
              {t("download.selectPath.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("download.selectPath.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-4 py-4 text-foreground">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                handleDownload(null, 0);
                setShowSelectPath(false);
              }}
            >
              <FolderIcon className="mr-2 h-4 w-4" />
              <div className="flex flex-1 items-center gap-2">
                <span className="truncate">
                  {settings.downloadDirectory ||
                    t("download.selectPath.defaultDirectory")}
                </span>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                  {t("download.selectPath.default")}
                </span>
              </div>
            </Button>
            {settings.additionalDirectories?.map((dir, index) => (
              <Button
                key={index}
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  handleDownload(null, index + 1);
                  setShowSelectPath(false);
                }}
              >
                <FolderIcon className="mr-2 h-4 w-4" />
                {dir}
              </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <Button
              variant="outline"
              className="text-primary"
              onClick={() => setShowSelectPath(false)}
            >
              {t("common.cancel")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New User Guide Alert Dialog */}
      <AlertDialog open={showNewUserGuide} onOpenChange={handleCloseGuide}>
        <AlertDialogContent className="sm:max-w-[425px]">
          <AlertDialogHeader>
            {guideStep === 0 ? (
              <>
                <AlertDialogTitle className="text-2xl font-bold text-foreground">
                  {t("download.newUserGuide.title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("download.newUserGuide.description")}
                </AlertDialogDescription>
              </>
            ) : (
              <>
                <AlertDialogTitle className="text-2xl font-bold text-foreground md:text-xl">
                  {t(`download.newUserGuide.steps.${guideStep - 1}.title`)}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(`download.newUserGuide.steps.${guideStep - 1}.description`)}
                </AlertDialogDescription>
                <div className="mt-4 space-y-4">
                  {guideSteps[guideStep - 1].image && (
                    <img
                      src={guideSteps[guideStep - 1].image}
                      alt={t(`download.newUserGuide.steps.${guideStep - 1}.title`)}
                      className="w-full rounded-lg border border-border"
                    />
                  )}
                  {guideSteps[guideStep - 1].action && (
                    <Button
                      className="w-full"
                      onClick={guideSteps[guideStep - 1].action.onClick}
                    >
                      {guideSteps[guideStep - 1].action.label}
                    </Button>
                  )}
                </div>
              </>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-primary" onClick={handleCloseGuide}>
              {guideStep === 0
                ? t("download.newUserGuide.noThanks")
                : t("download.newUserGuide.close")}
            </AlertDialogCancel>
            <Button
              className="text-secondary"
              onClick={guideStep === 0 ? handleStartGuide : handleNextStep}
            >
              {guideStep === 0
                ? t("download.newUserGuide.startGuide")
                : guideStep === guideSteps.length
                  ? t("download.newUserGuide.finish")
                  : guideStep === 1
                    ? t("download.newUserGuide.installed")
                    : guideStep === 2
                      ? t("download.newUserGuide.handlerEnabled")
                      : t("download.newUserGuide.nextStep")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

<style jsx>{`
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
`}</style>;
