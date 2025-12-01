import React, { useState, useRef, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogCancel,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Upload as UploadIcon } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { cn } from "@/lib/utils";
import gameService from "@/services/gameService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import imageCacheService from "@/services/imageCacheService";

const EditCoverDialog = ({ open, onOpenChange, gameName, onImageUpdate }) => {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState("search");
  const [coverSearch, setCoverSearch] = useState({
    query: "",
    isLoading: false,
    results: [],
    selectedCover: null,
  });
  const [customImage, setCustomImage] = useState({
    file: null,
    preview: null,
    isLoading: false,
    error: null,
  });

  // Add debounce timer ref
  const searchDebounceRef = useRef(null);
  const fileInputRef = useRef(null);
  const minSearchLength = 2;

  const handleCoverSearch = async query => {
    // Update query immediately for UI responsiveness
    setCoverSearch(prev => ({ ...prev, query }));

    // Clear previous timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Don't search if query is too short
    if (!query.trim() || query.length < minSearchLength) {
      setCoverSearch(prev => ({ ...prev, results: [], isLoading: false }));
      return;
    }

    // Set up new debounce timer
    searchDebounceRef.current = setTimeout(async () => {
      setCoverSearch(prev => ({ ...prev, isLoading: true }));
      try {
        const results = await gameService.searchGameCovers(query);
        setCoverSearch(prev => ({
          ...prev,
          results: results.slice(0, 9),
          isLoading: false,
        }));
      } catch (error) {
        console.error("Error searching covers:", error);
        setCoverSearch(prev => ({ ...prev, isLoading: false }));
      }
    }, 300); // 300ms debounce
  };

  const handleUpdateCover = async () => {
    // Clear all caches for this game's cover image
    const localStorageKey = `game-cover-${gameName}`;

    // 1. Clear localStorage cache
    localStorage.removeItem(localStorageKey);

    // 2. Clear in-memory cache if available
    if (imageCacheService && coverSearch.selectedCover?.imgID) {
      imageCacheService.invalidateCache(coverSearch.selectedCover.imgID);
    }

    if (activeTab === "search" && coverSearch.selectedCover) {
      // Fetch new image from search results and save to localStorage
      try {
        // Use v3 endpoint with gameID when using local index, otherwise use v2 with imgID
        const imageUrl =
          settings.usingLocalIndex && coverSearch.selectedCover.gameID
            ? gameService.getImageUrlByGameId(coverSearch.selectedCover.gameID)
            : gameService.getImageUrl(coverSearch.selectedCover.imgID);
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = reader.result;
          try {
            // 3. Update localStorage with new image
            localStorage.setItem(localStorageKey, dataUrl);

            // 4. Update the image on disk via Electron IPC
            if (window.electron && window.electron.updateGameCover) {
              await window.electron.updateGameCover(
                gameName,
                coverSearch.selectedCover.imgID,
                dataUrl
              );
              toast.success("Cover image updated successfully");
            }
          } catch (e) {
            console.warn("Could not cache new cover image:", e);
          }

          // 5. Notify parent component to update UI
          onImageUpdate && onImageUpdate(dataUrl, coverSearch.selectedCover.imgID);

          // 6. Dispatch a custom event to notify all components
          window.dispatchEvent(
            new CustomEvent("game-cover-updated", {
              detail: { gameName, dataUrl, imgID: coverSearch.selectedCover.imgID },
            })
          );

          onOpenChange(false);
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error("Failed to update cover image from search", e);
        toast.error("Failed to update cover image");
      }
    } else if (activeTab === "upload" && customImage.preview) {
      try {
        // 3. Update localStorage with new image
        localStorage.setItem(localStorageKey, customImage.preview);

        // 4. Update the image on disk via Electron IPC
        if (window.electron && window.electron.updateGameCover) {
          await window.electron.updateGameCover(gameName, null, customImage.preview);
          toast.success("Custom cover image saved successfully");
        } else {
          console.warn("Electron IPC not available, image only saved to localStorage");
          toast.warning("Image saved locally only");
        }

        // 5. Notify parent component to update UI
        onImageUpdate && onImageUpdate(customImage.preview, null);

        // 6. Dispatch a custom event to notify all components
        window.dispatchEvent(
          new CustomEvent("game-cover-updated", {
            detail: { gameName, dataUrl: customImage.preview, imgID: null },
          })
        );

        onOpenChange(false);
      } catch (e) {
        console.error("Failed to save custom cover image", e);
        toast.error("Failed to save custom cover image");
      }
    }
  };

  const handleFileChange = event => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setCustomImage({
        file: null,
        preview: null,
        isLoading: false,
        error: t("library.invalidImageFormat"),
      });
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setCustomImage({
        file: null,
        preview: null,
        isLoading: false,
        error: t("library.imageTooLarge", { size: "5MB" }),
      });
      return;
    }

    setCustomImage(prev => ({ ...prev, isLoading: true, error: null }));

    const reader = new FileReader();
    reader.onloadend = () => {
      setCustomImage({
        file,
        preview: reader.result,
        isLoading: false,
        error: null,
      });
    };
    reader.onerror = () => {
      setCustomImage({
        file: null,
        preview: null,
        isLoading: false,
        error: t("library.errorReadingFile"),
      });
    };
    reader.readAsDataURL(file);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("library.changeCoverImage")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("library.chooseOrUploadCoverImage")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">{t("library.searchOnline")}</TabsTrigger>
            <TabsTrigger value="upload">{t("library.uploadImage")}</TabsTrigger>
          </TabsList>

          {/* Search Tab Content */}
          <TabsContent value="search" className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-grow">
                <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-5 transform text-muted-foreground" />
                <Input
                  id="coverSearch"
                  value={coverSearch.query}
                  onChange={e => handleCoverSearch(e.target.value)}
                  className="border-input bg-background pl-8 text-foreground"
                  placeholder={t("library.searchGameCover")}
                  minLength={minSearchLength}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("library.searchGameCoverNotice")}
                </p>
              </div>
            </div>
            {/* Cover Search Results */}
            {coverSearch.query.length < minSearchLength ? (
              <div className="py-2 text-center text-sm text-muted-foreground">
                {t("library.enterMoreChars", { count: minSearchLength })}
              </div>
            ) : coverSearch.isLoading ? (
              <div className="flex justify-center py-4">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
              </div>
            ) : coverSearch.results.length > 0 ? (
              <div className="grid grid-cols-3 gap-4">
                {coverSearch.results.map((cover, index) => (
                  <div
                    key={index}
                    onClick={() =>
                      setCoverSearch(prev => ({ ...prev, selectedCover: cover }))
                    }
                    className={cn(
                      "relative aspect-video cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                      coverSearch.selectedCover === cover
                        ? "border-primary shadow-lg"
                        : "border-transparent hover:border-primary/50"
                    )}
                  >
                    <img
                      src={
                        settings.usingLocalIndex && cover.gameID
                          ? gameService.getImageUrlByGameId(cover.gameID)
                          : gameService.getImageUrl(cover.imgID)
                      }
                      alt={cover.title}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity hover:opacity-100">
                      <p className="px-2 text-center text-sm text-white">{cover.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-2 text-center text-sm text-muted-foreground">
                {t("library.noResultsFound")}
              </div>
            )}
          </TabsContent>

          {/* Upload Tab Content */}
          <TabsContent value="upload" className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />

              {!customImage.preview ? (
                <div
                  onClick={handleUploadClick}
                  className="flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors hover:bg-background/50"
                >
                  <UploadIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                  <p className="text-center text-muted-foreground">
                    {t("library.clickToUpload")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("library.supportedFormats")}
                  </p>
                </div>
              ) : (
                <div className="relative mx-auto w-full max-w-xs">
                  <div className="relative aspect-video overflow-hidden rounded-lg border-2 border-primary">
                    <img
                      src={customImage.preview}
                      alt={t("library.uploadedImage")}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute right-2 top-2 bg-background/80 hover:bg-background"
                    onClick={() =>
                      setCustomImage({
                        file: null,
                        preview: null,
                        isLoading: false,
                        error: null,
                      })
                    }
                  >
                    {t("common.remove")}
                  </Button>
                </div>
              )}

              {customImage.isLoading && (
                <div className="flex justify-center py-2">
                  <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
                </div>
              )}

              {customImage.error && (
                <p className="text-destructive text-sm">{customImage.error}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <AlertDialogFooter>
          <AlertDialogCancel className="text-primary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <Button
            variant="primary"
            className="bg-primary text-secondary"
            disabled={
              (activeTab === "search" && !coverSearch.selectedCover) ||
              (activeTab === "upload" && !customImage.preview)
            }
            onClick={handleUpdateCover}
          >
            {t("library.updateImage")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default EditCoverDialog;
