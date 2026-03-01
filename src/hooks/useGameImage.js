import { useState, useEffect, useRef } from "react";
import { useImageLoader } from "./useImageLoader";


export function useGameImage(game, options = {}) {
  const {
    priority = "normal",
    quality = "high",
    checkPlayLater = false,
  } = options;

  const [imageData, setImageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // Use the imgID-based loader as fallback for non-installed games
  const { cachedImage: apiImage, loading: apiLoading } = useImageLoader(
    game?.imgID,
    {
      quality,
      priority,
      enabled: !!game?.imgID && !game?.isCustom,
    }
  );

  useEffect(() => {
    mountedRef.current = true;
    let isMounted = true;

    const loadImage = async () => {
      if (!game) {
        setImageData(null);
        setLoading(false);
        return;
      }

      const gameName = game.game || game.name;
      const localStorageKey = `game-cover-${gameName}`;

      try {
        setLoading(true);

        // 1. Check Play Later cache first (if enabled)
        if (checkPlayLater) {
          const playLaterImage = localStorage.getItem(`play-later-image-${gameName}`);
          if (playLaterImage && isMounted) {
            setImageData(playLaterImage);
            setLoading(false);
            return;
          }
        }

        // 2. Check localStorage cache
        const cachedImage = localStorage.getItem(localStorageKey);
        if (cachedImage && isMounted) {
          setImageData(cachedImage);
          setLoading(false);
          return;
        }

        // 3. For installed games (not custom), try to load from game metadata
        // This ensures Library and BigPicture show the same image
        if (!game.isCustom && gameName) {
          try {
            const imageBase64 = await window.electron.getGameImage(gameName);
            if (imageBase64 && isMounted) {
              const dataUrl = `data:image/jpeg;base64,${imageBase64}`;
              setImageData(dataUrl);
              
              // Cache it
              try {
                localStorage.setItem(localStorageKey, dataUrl);
              } catch (e) {
                console.warn("Could not cache game image:", e);
              }
              setLoading(false);
              return;
            }
          } catch (error) {
            console.warn("Could not load installed game image:", error);
            // Fall through to API image
          }
        }

        // 4. Fall back to API/local index image (via useImageLoader)
        if (apiImage && isMounted) {
          setImageData(apiImage);
          
          // Cache it
          try {
            localStorage.setItem(localStorageKey, apiImage);
          } catch (e) {
            console.warn("Could not cache API image:", e);
          }
          setLoading(false);
          return;
        }

        // 5. Final fallback to game.cover or game.image
        if ((game.cover || game.image) && isMounted) {
          setImageData(game.cover || game.image);
          setLoading(false);
          return;
        }

        // No image found
        if (isMounted) {
          setImageData(null);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error loading game image:", error);
        if (isMounted) {
          setImageData(null);
          setLoading(false);
        }
      }
    };

    loadImage();

    // Listen for game cover update events
    const handleCoverUpdate = (event) => {
      const { gameName, dataUrl } = event.detail;
      const currentGameName = game?.game || game?.name;
      if (gameName === currentGameName && dataUrl && isMounted) {
        console.log(`Received cover update for ${gameName}`);
        setImageData(dataUrl);
      }
    };

    // Listen for game assets update events (when grid/logo/hero are changed)
    const handleAssetsUpdate = (event) => {
      const { gameName } = event.detail;
      const currentGameName = game?.game || game?.name;
      if (gameName === currentGameName && isMounted) {
        console.log(`Assets updated for ${gameName}, clearing cache and reloading`);
        // Clear localStorage cache for this game
        const localStorageKey = `game-cover-${gameName}`;
        localStorage.removeItem(localStorageKey);
        localStorage.removeItem(`play-later-image-${gameName}`);
        // Trigger reload
        loadImage();
      }
    };

    window.addEventListener("game-cover-updated", handleCoverUpdate);
    window.addEventListener("game-assets-updated", handleAssetsUpdate);

    return () => {
      isMounted = false;
      mountedRef.current = false;
      window.removeEventListener("game-cover-updated", handleCoverUpdate);
      window.removeEventListener("game-assets-updated", handleAssetsUpdate);
    };
  }, [game?.game, game?.name, game?.isCustom, apiImage, checkPlayLater]);

  return {
    imageData,
    loading: loading || apiLoading,
  };
}
