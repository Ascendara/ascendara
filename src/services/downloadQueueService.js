// Download Queue Service for Ascend users
// Manages a queue of downloads that start automatically when the previous one finishes

const QUEUE_STORAGE_KEY = "ascendDownloadQueue";

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

// Check if there are active downloads (excluding completed/verifying ones)
export const hasActiveDownloads = async () => {
  try {
    const games = await window.electron.getGames();
    const activeDownloads = games.filter(game => {
      const { downloadingData } = game;
      // Only count as active if actually downloading, extracting, or updating
      // Don't count verifying as active since that means it's almost done
      return (
        downloadingData &&
        (downloadingData.downloading ||
          downloadingData.extracting ||
          downloadingData.updating) &&
        !downloadingData.verifying
      );
    });
    return activeDownloads.length > 0;
  } catch (error) {
    console.error("Error checking active downloads:", error);
    return false;
  }
};

// Process the next item in the queue (called when a download completes)
export const processNextInQueue = async () => {
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
    await window.electron.downloadFile(
      nextItem.url,
      nextItem.gameName,
      nextItem.online || false,
      nextItem.dlc || false,
      nextItem.isVr || false,
      nextItem.updateFlow || false,
      nextItem.version || "",
      nextItem.imgID || null,
      nextItem.size || "",
      nextItem.additionalDirIndex || 0,
      nextItem.gameID || ""
    );

    // Wait for the download to appear in the games list before removing from queue
    // This prevents the empty page flash
    const waitForDownloadToAppear = async (maxAttempts = 10) => {
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const games = await window.electron.getGames();
        const found = games.some(
          g =>
            g.game === nextItem.gameName &&
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

    waitForDownloadToAppear();

    return nextItem;
  } catch (error) {
    console.error("Error starting queued download:", error);
    // Still remove from queue on error to prevent infinite retry
    removeFromQueue(nextItem.id);
    return null;
  }
};
