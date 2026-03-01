import React, { useState, useEffect, useRef } from "react";
import { Search, Loader, Download, Image as ImageIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/context/LanguageContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * GameAssetSearchDialog - Search and replace game assets (grid, logo, hero)
 * Works in both Library (keyboard) and BigPicture (controller) modes
 */
export const GameAssetSearchDialog = ({
  open,
  onOpenChange,
  gameName,
  isControllerMode = false,
}) => {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedButton, setSelectedButton] = useState(0);
  const [focusedSection, setFocusedSection] = useState("results");
  const [assetPreviews, setAssetPreviews] = useState({});
  const [isDownloading, setIsDownloading] = useState(false);
  const searchDebounceRef = useRef(null);
  const inputRef = useRef(null);
  const lastNavTime = useRef(0);
  const lastActionTime = useRef(0);
  const resultRefs = useRef([]);

  // Auto-populate search with game name when dialog opens
  useEffect(() => {
    if (open && gameName) {
      setSearchQuery(gameName);
      handleSearch(gameName);
    }
  }, [open, gameName]);

  // Controller navigation using BigPicture's gamepad polling system
  useEffect(() => {
    if (!isControllerMode || !open) return;

    let animationFrameId;

    const getGamepadInput = () => {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];
      if (!gp) return null;

      return {
        up: gp.axes[1] < -0.5 || gp.buttons[12]?.pressed,
        down: gp.axes[1] > 0.5 || gp.buttons[13]?.pressed,
        left: gp.axes[0] < -0.5 || gp.buttons[14]?.pressed,
        right: gp.axes[0] > 0.5 || gp.buttons[15]?.pressed,
        a: gp.buttons[0]?.pressed,
        b: gp.buttons[1]?.pressed,
      };
    };

    const loop = () => {
      const gp = getGamepadInput();
      if (gp) {
        const now = Date.now();

        // Navigation
        if (now - lastNavTime.current > 170) {
          let handledNav = false;

          if (gp.up) {
            if (focusedSection === "results" && selectedIndex > 0) {
              setSelectedIndex(selectedIndex - 1);
              handledNav = true;
            } else if (focusedSection === "buttons" && selectedButton > 0) {
              setSelectedButton(selectedButton - 1);
              handledNav = true;
            } else if (focusedSection === "buttons" && selectedButton === 0 && searchResults.length > 0) {
              setFocusedSection("results");
              handledNav = true;
            }
          } else if (gp.down) {
            if (focusedSection === "results" && selectedIndex < searchResults.length - 1) {
              setSelectedIndex(selectedIndex + 1);
              handledNav = true;
            } else if (focusedSection === "results" && selectedGame) {
              setFocusedSection("buttons");
              setSelectedButton(0);
              handledNav = true;
            } else if (focusedSection === "buttons" && selectedButton < 1) {
              setSelectedButton(selectedButton + 1);
              handledNav = true;
            }
          } else if (gp.left && focusedSection === "buttons") {
            if (selectedButton > 0) {
              setSelectedButton(selectedButton - 1);
              handledNav = true;
            }
          } else if (gp.right && focusedSection === "buttons") {
            if (selectedButton < 1) {
              setSelectedButton(selectedButton + 1);
              handledNav = true;
            }
          }

          if (handledNav) lastNavTime.current = now;
        }

        // Actions
        if (now - lastActionTime.current > 250) {
          let handledAction = false;

          if (gp.a) {
            if (focusedSection === "results" && searchResults[selectedIndex]) {
              handleSelectGame(searchResults[selectedIndex]);
              handledAction = true;
            } else if (focusedSection === "buttons") {
              if (selectedButton === 0 && selectedGame && !isDownloading) {
                handleDownloadAssets();
                handledAction = true;
              } else if (selectedButton === 1) {
                onOpenChange(false);
                handledAction = true;
              }
            }
          } else if (gp.b) {
            if (selectedGame && focusedSection === "buttons") {
              setSelectedGame(null);
              setAssetPreviews({});
              setFocusedSection("results");
              handledAction = true;
            } else {
              onOpenChange(false);
              handledAction = true;
            }
          }

          if (handledAction) lastActionTime.current = now;
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isControllerMode, open, selectedIndex, searchResults, selectedGame, focusedSection, selectedButton, isDownloading]);

  // Scroll selected item into view when navigating with controller
  useEffect(() => {
    if (isControllerMode && focusedSection === "results" && resultRefs.current[selectedIndex]) {
      resultRefs.current[selectedIndex].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest"
      });
    }
  }, [selectedIndex, focusedSection, isControllerMode]);

  // Focus input when dialog opens (keyboard mode)
  useEffect(() => {
    if (open && !isControllerMode && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, isControllerMode]);

  const handleSearch = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    // Clear previous debounce
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Debounce search
    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const searchUrl = `https://api.ascendara.app/api/proxy/steamgriddb/search?term=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl);

        if (!response.ok) {
          throw new Error("Search failed");
        }

        const data = await response.json();
        if (data.success && data.data) {
          setSearchResults(data.data.slice(0, 10));
          setSelectedIndex(0);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error("Asset search error:", error);
        toast.error(t("library.assetSearch.searchFailed") || "Search failed");
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSelectGame = async (game) => {
    setSelectedGame(game);
    setAssetPreviews({});

    // Fetch asset previews (grid, logo, hero)
    try {
      const assetTypes = [
        { type: "grids", key: "grid" },
        { type: "logos", key: "logo" },
        { type: "heroes", key: "hero" },
      ];

      const previews = {};
      for (const { type, key } of assetTypes) {
        try {
          const url = `https://api.ascendara.app/api/proxy/steamgriddb/${type}/${game.id}`;
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data && data.data.length > 0) {
              previews[key] = data.data[0].url;
            }
          }
        } catch (e) {
          console.warn(`Failed to fetch ${key}:`, e);
        }
      }

      setAssetPreviews(previews);
    } catch (error) {
      console.error("Failed to fetch asset previews:", error);
    }
  };

  const handleDownloadAssets = async () => {
    if (!selectedGame) return;

    setIsDownloading(true);
    try {
      // Download all available assets
      const assetTypes = [
        { type: "grids", key: "grid", filename: "grid.ascendara.jpg" },
        { type: "logos", key: "logo", filename: "logo.ascendara.png" },
        { type: "heroes", key: "hero", filename: "hero.ascendara.jpg" },
      ];

      let downloadedCount = 0;

      for (const { type, key, filename } of assetTypes) {
        try {
          const url = `https://api.ascendara.app/api/proxy/steamgriddb/${type}/${selectedGame.id}`;
          const response = await fetch(url);
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data && data.data.length > 0) {
              const assetUrl = data.data[0].url;
              
              // Download the image
              const imageResponse = await fetch(assetUrl);
              const blob = await imageResponse.blob();
              
              // Convert to base64
              const reader = new FileReader();
              const base64Promise = new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
              
              const dataUrl = await base64Promise;
              
              // Save to game directory via IPC
              await window.electron.saveGameAsset(gameName, filename, dataUrl);
              downloadedCount++;
            }
          }
        } catch (e) {
          console.warn(`Failed to download ${key}:`, e);
        }
      }

      if (downloadedCount > 0) {
        toast.success(
          t("library.assetSearch.assetsDownloaded", { count: downloadedCount }) ||
            `Downloaded ${downloadedCount} asset(s)`
        );

        // Dispatch event to refresh images
        window.dispatchEvent(
          new CustomEvent("game-assets-updated", {
            detail: { gameName },
          })
        );

        onOpenChange(false);
      } else {
        toast.error(t("library.assetSearch.noAssetsFound") || "No assets found");
      }
    } catch (error) {
      console.error("Failed to download assets:", error);
      toast.error(t("library.assetSearch.downloadFailed") || "Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          isControllerMode ? "max-w-4xl" : "max-w-3xl"
        )}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className={cn(
            "flex items-center gap-2",
            isControllerMode ? "text-2xl font-bold" : ""
          )}>
            <ImageIcon className={isControllerMode ? "h-6 w-6" : "h-5 w-5"} />
            {t("library.assetSearch.title") || "Search Game Assets"}
          </AlertDialogTitle>
          <AlertDialogDescription className={isControllerMode ? "text-base" : ""}>
            {t("library.assetSearch.description") ||
              "Search for and download new grid, logo, and banner images for this game"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          {!isControllerMode && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                placeholder={t("library.assetSearch.searchPlaceholder") || "Search for game..."}
                className="pl-10"
              />
            </div>
          )}

          {/* Search Results */}
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader className={cn(isControllerMode ? "h-10 w-10" : "h-8 w-8", "animate-spin text-primary")} />
            </div>
          ) : searchResults.length > 0 ? (
            <div className={cn(
              "max-h-[300px] space-y-2 overflow-y-auto border p-12",
              isControllerMode ? "rounded-xl" : "rounded-lg"
            )}>
              {searchResults.map((result, index) => (
                <div
                  key={result.id}
                  ref={(el) => (resultRefs.current[index] = el)}
                  onClick={() => handleSelectGame(result)}
                  className={cn(
                    "cursor-pointer border-2 p-3 transition-all",
                    isControllerMode ? "rounded-xl" : "rounded-lg",
                    selectedGame?.id === result.id
                      ? "border-primary bg-primary/10"
                      : isControllerMode && focusedSection === "results" && index === selectedIndex
                        ? "scale-105 border-primary bg-primary/20 shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                        : "border-transparent hover:border-primary/30 hover:bg-muted/50"
                  )}
                >
                  <p className={isControllerMode ? "text-lg font-semibold" : "font-medium"}>{result.name}</p>
                  {result.release_date && (
                    <p className={isControllerMode ? "text-sm text-muted-foreground" : "text-xs text-muted-foreground"}>
                      {new Date(result.release_date * 1000).getFullYear()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : searchQuery.length >= 2 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("library.assetSearch.noResults") || "No results found"}
            </div>
          ) : null}

          {/* Asset Previews */}
          {selectedGame && Object.keys(assetPreviews).length > 0 && (
            <div className="space-y-3">
              <p className={isControllerMode ? "text-base font-semibold" : "text-sm font-medium"}>
                {t("library.assetSearch.preview") || "Preview Assets"}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {assetPreviews.grid && (
                  <div className="space-y-1">
                    <p className={isControllerMode ? "text-sm font-medium text-muted-foreground" : "text-xs text-muted-foreground"}>Grid</p>
                    <img
                      src={assetPreviews.grid}
                      alt="Grid"
                      className={cn(
                        "h-32 w-full border object-cover",
                        isControllerMode ? "rounded-xl" : "rounded-lg"
                      )}
                    />
                  </div>
                )}
                {assetPreviews.logo && (
                  <div className="space-y-1">
                    <p className={isControllerMode ? "text-sm font-medium text-muted-foreground" : "text-xs text-muted-foreground"}>Logo</p>
                    <img
                      src={assetPreviews.logo}
                      alt="Logo"
                      className={cn(
                        "h-32 w-full border bg-muted object-contain p-2",
                        isControllerMode ? "rounded-xl" : "rounded-lg"
                      )}
                    />
                  </div>
                )}
                {assetPreviews.hero && (
                  <div className="space-y-1">
                    <p className={isControllerMode ? "text-sm font-medium text-muted-foreground" : "text-xs text-muted-foreground"}>Hero</p>
                    <img
                      src={assetPreviews.hero}
                      alt="Hero"
                      className={cn(
                        "h-32 w-full border object-cover",
                        isControllerMode ? "rounded-xl" : "rounded-lg"
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {isControllerMode ? (
          <div className="flex gap-4 py-4">
            <button
              onClick={handleDownloadAssets}
              disabled={!selectedGame || isDownloading}
              className={cn(
                "flex flex-1 items-center justify-center gap-3 rounded-xl p-4 text-lg font-semibold transition-all duration-200",
                focusedSection === "buttons" && selectedButton === 0
                  ? "scale-105 bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                  : "bg-muted hover:bg-muted/80",
                (!selectedGame || isDownloading) && "cursor-not-allowed opacity-50"
              )}
            >
              {isDownloading ? (
                <>
                  <Loader className="h-6 w-6 animate-spin" />
                  <span>{t("library.assetSearch.downloading") || "Downloading..."}</span>
                </>
              ) : (
                <>
                  <Download className="h-6 w-6" />
                  <span>{t("library.assetSearch.download") || "Download Assets"}</span>
                </>
              )}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              disabled={isDownloading}
              className={cn(
                "flex flex-1 items-center justify-center gap-3 rounded-xl p-4 text-lg font-semibold transition-all duration-200",
                focusedSection === "buttons" && selectedButton === 1
                  ? "scale-105 bg-muted text-foreground shadow-lg ring-4 ring-slate-500/50"
                  : "bg-muted hover:bg-muted/80",
                isDownloading && "cursor-not-allowed opacity-50"
              )}
            >
              <X className="h-6 w-6" />
              <span>{t("common.cancel") || "Cancel"}</span>
            </button>
          </div>
        ) : (
          <AlertDialogFooter>
            <Button
              onClick={handleDownloadAssets}
              disabled={!selectedGame || isDownloading}
              className="gap-2 text-secondary"
            >
              {isDownloading ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  {t("library.assetSearch.downloading") || "Downloading..."}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t("library.assetSearch.download") || "Download Assets"}
                </>
              )}
            </Button>
            <AlertDialogCancel disabled={isDownloading}>
              {t("common.cancel") || "Cancel"}
            </AlertDialogCancel>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};
