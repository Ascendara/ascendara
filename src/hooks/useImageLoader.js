import { useState, useEffect, useRef } from "react";
import imageCacheService from "@/services/imageCacheService";
import steamGridImageService from "@/services/steamGridImageService";

// Track which images are currently being loaded to prevent duplicate requests
const loadingImages = new Map();

const imageQueue = [];
let isProcessingQueue = false;
const MAX_CONCURRENT_LOADS = 6;
let activeLoads = 0;

function processImageQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  const processNext = () => {
    while (activeLoads < MAX_CONCURRENT_LOADS && imageQueue.length > 0) {
      const task = imageQueue.shift();
      if (task && task.mounted) {
        activeLoads++;
        task.execute().finally(() => {
          activeLoads--;
          processNext();
        });
      }
    }

    if (imageQueue.length === 0 && activeLoads === 0) {
      isProcessingQueue = false;
    }
  };

  processNext();
}

// Shared image loading hook to prevent duplicate loading
export function useImageLoader(
  imgID,
  options = { quality: "high", priority: "normal", enabled: true }
) {
  const [state, setState] = useState({
    cachedImage: null,
    loading: false,
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // SteamGrid fallback: when there's no imgID but a game name is supplied
    // (typically for custom Hydra sources), resolve a cover URL by name.
    if (!imgID && options.enabled && options.fallbackGameName) {
      const name = options.fallbackGameName;
      const slot = options.fallbackSlot || "card";

      // Synchronous cache peek for instant render
      const peeked = steamGridImageService.peek(name);
      if (peeked) {
        const url = steamGridImageService.pickUrl(peeked, slot);
        setState({ cachedImage: url, loading: false, error: null });
        return;
      }

      setState(prev => ({ ...prev, loading: true }));
      steamGridImageService
        .getAssets(name)
        .then(assets => {
          if (!mountedRef.current) return;
          const url = steamGridImageService.pickUrl(assets, slot);
          setState({
            cachedImage: url,
            loading: false,
            error: url ? null : "No SteamGrid match",
          });
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setState({
            cachedImage: null,
            loading: false,
            error: err?.message || "SteamGrid lookup failed",
          });
        });
      return;
    }

    if (!imgID || !options.enabled) {
      setState({
        cachedImage: null,
        loading: false,
        error: null,
      });
      return;
    }

    // Check memory cache synchronously first (instant return)
    const cachedUrl = imageCacheService.memoryCache?.get(imgID)?.url;
    if (cachedUrl) {
      setState({
        cachedImage: cachedUrl,
        loading: false,
        error: null,
      });
      return;
    }

    // Check if this image is already being loaded
    const loadingKey = `${imgID}-${options.quality}`;
    if (loadingImages.has(loadingKey)) {
      setState(prev => ({ ...prev, loading: true }));
      loadingImages
        .get(loadingKey)
        .then(cached => {
          if (mountedRef.current) {
            setState({
              cachedImage: cached,
              loading: false,
              error: cached ? null : "Failed to load image",
            });
          }
        })
        .catch(error => {
          if (mountedRef.current) {
            setState({
              cachedImage: null,
              loading: false,
              error: error.message || "Failed to load image",
            });
          }
        });
      return;
    }

    // Set loading state immediately (non-blocking)
    setState(prev => ({ ...prev, loading: true }));

    // Create the load task
    const loadTask = {
      mounted: true,
      execute: async () => {
        if (!mountedRef.current) return null;

        try {
          const loadPromise = imageCacheService.getImage(imgID, options);
          loadingImages.set(loadingKey, loadPromise);

          const cached = await loadPromise;

          if (mountedRef.current) {
            setState({
              cachedImage: cached,
              loading: false,
              error: null,
            });
          }
          return cached;
        } catch (error) {
          if (mountedRef.current) {
            setState({
              cachedImage: null,
              loading: false,
              error: error.message || "Failed to load image",
            });
          }
          throw error;
        } finally {
          loadingImages.delete(loadingKey);
        }
      },
    };

    // Add to queue based on priority
    if (options.priority === "high") {
      imageQueue.unshift(loadTask);
    } else {
      imageQueue.push(loadTask);
    }

    // Start processing queue
    processImageQueue();

    return () => {
      mountedRef.current = false;
      loadTask.mounted = false;
    };
  }, [
    imgID,
    options.enabled,
    options.quality,
    options.priority,
    options.fallbackGameName,
    options.fallbackSlot,
  ]);

  return state;
}
