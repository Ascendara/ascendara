// Download Queue Service for Ascend users
// Manages a queue of downloads that start automatically when the previous one finishes

import { resolveHost } from "@/services/downloads/debridService";
import pendingLibrarySwapService from "@/services/downloads/pendingLibrarySwapService";
import {
  TORRENT_DISABLED_CODE,
  isTorrentLink,
} from "@/services/downloads/torrentLink";

const QUEUE_STORAGE_KEY = "ascendDownloadQueue";

export const getQueueBlockReason = (item, settings) =>
  isTorrentLink(item?.url) && settings?.torrentEnabled !== true
    ? TORRENT_DISABLED_CODE
    : null;

// Get the current download queue
export const getDownloadQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) || "[]");
  } catch (error) {
    console.error("Error reading download queue:", error);
    return [];
  }
};

// Save the download queue
const saveDownloadQueue = queue => {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error("Error saving download queue:", error);
  }
};

// Add a download to the queue
export const addToQueue = downloadData => {
  const queue = getDownloadQueue();
  const queueItem = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    addedAt: Date.now(),
    ...downloadData,
  };
  queue.push(queueItem);
  saveDownloadQueue(queue);
  return queueItem;
};

// Remove a download from the queue by ID
export const removeFromQueue = id => {
  const queue = getDownloadQueue();
  const newQueue = queue.filter(item => item.id !== id);
  saveDownloadQueue(newQueue);
  return newQueue;
};

// Get the next download in the queue
export const getNextInQueue = () => {
  const queue = getDownloadQueue();
  return queue.length > 0 ? queue[0] : null;
};

// Clear the entire queue
export const clearQueue = () => {
  saveDownloadQueue([]);
};

// Reorder the queue by moving an item from one index to another
export const reorderQueue = (fromIndex, toIndex) => {
  const queue = getDownloadQueue();
  if (
    fromIndex < 0 ||
    fromIndex >= queue.length ||
    toIndex < 0 ||
    toIndex >= queue.length
  ) {
    return queue;
  }
  const newQueue = [...queue];
  const [movedItem] = newQueue.splice(fromIndex, 1);
  newQueue.splice(toIndex, 0, movedItem);
  saveDownloadQueue(newQueue);
  return newQueue;
};

// Check if there are active downloads (excluding completed/verifying/errored/stopped ones)
export const hasActiveDownloads = async () => {
  try {
    const games = await window.electron.getGames();
    const activeDownloads = games.filter(game => {
      const { downloadingData } = game;
      // Only count as active if actually downloading, extracting, or updating
      // Don't count verifying, errored, or stopped downloads as active
      return (
        downloadingData &&
        (downloadingData.downloading ||
          downloadingData.extracting ||
          downloadingData.updating) &&
        !downloadingData.verifying &&
        !downloadingData.error &&
        !downloadingData.stopped
      );
    });
    return activeDownloads.length > 0;
  } catch (error) {
    console.error("Error checking active downloads:", error);
    return false;
  }
};

// Lock to prevent concurrent processNextInQueue calls from starting the same download twice
let _processingQueue = false;

// Process the next item in the queue (called when a download completes)
export const processNextInQueue = async () => {
  if (_processingQueue) {
    return null;
  }
  _processingQueue = true;

  try {
    return await _processNextInQueueInternal();
  } finally {
    _processingQueue = false;
  }
};

const _processNextInQueueInternal = async () => {
  const nextItem = getNextInQueue();
  if (!nextItem) {
    return null;
  }

  // Check if there are still active downloads
  const hasActive = await hasActiveDownloads();
  if (hasActive) {
    return null; // Wait for current download to finish
  }

  // Start the download
  try {
    let url = nextItem.url;
    if (!url && !nextItem.debridLink && !nextItem.realDebridLink)
      throw new Error("This queued download has no link. Queue it again from its page.");
    const debridLink = nextItem.debridLink || nextItem.realDebridLink;
    const queuedTorrent = isTorrentLink(url);
    const settings =
      debridLink || queuedTorrent ? await window.electron.getSettings() : null;

    if (debridLink) {
      if (settings.debridEnabled !== true) return null;
      const resolved = await resolveHost(
        settings,
        debridLink,
        null,
        null,
        0,
        nextItem.debridProviderId || "realdebrid"
      );
      if (!resolved.url)
        throw new Error("This debrid download is still processing in the cloud.");
      url = resolved.url;
    }

    // Local torrent opt-in is a temporary queue block, not a fatal queue error.
    // Leave the item in place so normal idle polling can start it after the user
    // enables torrenting again.
    if (getQueueBlockReason(nextItem, settings) === TORRENT_DISABLED_CODE) return null;

    const result = await window.electron.downloadFile(
      url,
      nextItem.gameName,
      nextItem.online || false,
      nextItem.dlc || false,
      nextItem.isVr || false,
      nextItem.updateFlow || false,
      nextItem.version || "",
      nextItem.imgID || null,
      nextItem.size || "",
      nextItem.additionalDirIndex || 0,
      nextItem.gameID || "",
      nextItem.browserDirect === true || Boolean(debridLink),
      nextItem.browserAssetGameId,
      nextItem.browserAssetLogoId
    );
    if (result?.success === false) {
      if (result.blocked === true && result.code === TORRENT_DISABLED_CODE) {
        return null;
      }
      throw new Error(result.error);
    }

    // Only consume an imported-library swap after the queued download really
    // started. Temporary queue blocks must not remove the user's imported entry.
    const importedGameName = pendingLibrarySwapService.take(nextItem.gameName);
    if (importedGameName) {
      try {
        await window.electron.removeCustomGame(importedGameName);
      } catch (error) {
        console.warn("Could not remove imported game after queued swap download:", error);
      }
    }

    // Wait for the download to appear in the games list before removing from queue
    // This prevents the empty page flash
    const waitForDownloadToAppear = async (maxAttempts = 10) => {
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const games = await window.electron.getGames();
        const found = games.some(
          g =>
            g.game === (result?.game || nextItem.gameName) &&
            g.downloadingData &&
            (g.downloadingData.downloading || g.downloadingData.extracting)
        );
        if (found) {
          removeFromQueue(nextItem.id);
          return;
        }
      }
      // Fallback: remove anyway after max attempts
      removeFromQueue(nextItem.id);
    };

    // Hold the queue lock until then, so a poll in the meantime cannot start
    // the same item a second time.
    await waitForDownloadToAppear();

    return nextItem;
  } catch (error) {
    console.error("Error starting queued download:", error);
    // Still remove from queue on error to prevent infinite retry
    removeFromQueue(nextItem.id);
    return null;
  }
};
