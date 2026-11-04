import { useState, useEffect, useSyncExternalStore } from "react";
import imageCacheService from "@/services/images/imageCacheService";
import steamGridImageService from "@/services/images/steamGridImageService";
import { holdLoad, releaseWhenDecoded } from "@/lib/loadGate";

// Track which images are currently being loaded to prevent duplicate requests
const loadingImages = new Map();

const imageQueue = [];
const MAX_CONCURRENT_LOADS = 6;
let activeLoads = 0;

function processImageQueue() {
  const processNext = () => {
    while (activeLoads < MAX_CONCURRENT_LOADS && imageQueue.length > 0) {
      const task = imageQueue.shift();
      if (task && task.mounted) {
        activeLoads++;
        task
          .execute()
          .catch(() => {})
          .finally(() => {
            activeLoads--;
            processNext();
          });
      }
    }
  };

  processNext();
}

// Synchronous cache lookup, so a card whose image is already in memory renders
// it on its first paint instead of flashing a skeleton for a frame.
function peekCachedImage(imgID, options) {
  if (!options.enabled) return null;
  if (imgID) return imageCacheService.memoryCache?.get(imgID)?.url || null;
  if (options.fallbackGameName) {
    const assets = steamGridImageService.peek(options.fallbackGameName);
    return assets
      ? steamGridImageService.pickUrl(assets, options.fallbackSlot || "card")
      : null;
  }
  return null;
}

// Settle on a resolved image without re-rendering when it's already showing.
const resolvedState = url => prev =>
  prev.cachedImage === url && !prev.loading && !prev.error
    ? prev
    : { cachedImage: url, loading: false, error: null };

// Shared image loading hook to prevent duplicate loading
export function useImageLoader(
  imgID,
  options = { quality: "high", priority: "normal", enabled: true }
) {
  options = { quality: "high", priority: "normal", enabled: true, ...options };
  const revision = useSyncExternalStore(
    imageCacheService.subscribe,
    imageCacheService.getRevision
  );
  const [state, setState] = useState(() => ({
    cachedImage: peekCachedImage(imgID, options),
    loading: false,
    error: null,
  }));
  useEffect(() => {
    // Each effect owns its cancellation flag so an old request cannot update
    // a card after it has switched to a different game.
    let active = true;
    // Keeps the splash or page transition waiting until this image is ready
    // to paint, so a page is never revealed with empty cards.
    const releaseLoad = holdLoad();
    const settle = url => releaseWhenDecoded(releaseLoad, url);

    // SteamGrid fallback: when there's no imgID but a game name is supplied
    // (typically for custom Hydra sources), resolve a cover URL by name.
    if (!imgID && options.enabled && options.fallbackGameName) {
      const name = options.fallbackGameName;
      const slot = options.fallbackSlot || "card";

      // Synchronous cache peek for instant render
      const peeked = steamGridImageService.peek(name);
      if (peeked) {
        setState(resolvedState(steamGridImageService.pickUrl(peeked, slot)));
        releaseLoad();
        return;
      }

      setState(prev => ({ ...prev, loading: true }));
      steamGridImageService
        .getAssets(name)
        .then(assets => {
          if (!active) return;
          const url = steamGridImageService.pickUrl(assets, slot);
          setState({
            cachedImage: url,
            loading: false,
            error: url ? null : "No SteamGrid match",
          });
          settle(url);
        })
        .catch(err => {
          if (!active) return;
          setState({
            cachedImage: null,
            loading: false,
            error: err?.message || "SteamGrid lookup failed",
          });
          releaseLoad();
        });
      return () => {
        active = false;
        releaseLoad();
      };
    }

    if (!imgID || !options.enabled) {
      setState({
        cachedImage: null,
        loading: false,
        error: null,
      });
      releaseLoad();
      return;
    }

    // Check memory cache synchronously first (instant return)
    const cachedUrl = imageCacheService.memoryCache?.get(imgID)?.url;
    if (cachedUrl) {
      setState(resolvedState(cachedUrl));
      settle(cachedUrl);
      return;
    }

    // Check if this image is already being loaded
    const loadingKey = `${revision}-${imgID}-${options.quality}`;
    if (loadingImages.has(loadingKey)) {
      setState(prev => ({ ...prev, loading: true }));
      loadingImages
        .get(loadingKey)
        .then(cached => {
          if (active) {
            setState({
              cachedImage: cached,
              loading: false,
              error: cached ? null : "Failed to load image",
            });
          }
          settle(cached);
        })
        .catch(error => {
          if (active) {
            setState({
              cachedImage: null,
              loading: false,
              error: error.message || "Failed to load image",
            });
          }
          releaseLoad();
        });
      return () => {
        active = false;
        releaseLoad();
      };
    }

    // Set loading state immediately (non-blocking)
    setState(prev => ({ ...prev, loading: true }));

    // Create the load task
    const loadTask = {
      mounted: true,
      execute: async () => {
        if (!active) return null;

        try {
          const loadPromise =
            loadingImages.get(loadingKey) || imageCacheService.getImage(imgID, options);
          loadingImages.set(loadingKey, loadPromise);

          const cached = await loadPromise;

          if (active) {
            setState({
              cachedImage: cached,
              loading: false,
              error: null,
            });
          }
          settle(cached);
          return cached;
        } catch (error) {
          if (active) {
            setState({
              cachedImage: null,
              loading: false,
              error: error.message || "Failed to load image",
            });
          }
          releaseLoad();
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
      active = false;
      loadTask.mounted = false;
      releaseLoad();
    };
  }, [
    revision,
    imgID,
    options.enabled,
    options.quality,
    options.priority,
    options.fallbackGameName,
    options.fallbackSlot,
  ]);

  return state;
}
