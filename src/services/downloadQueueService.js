// Download Queue Service
// Manages a queue of downloads that auto-start up to maxConcurrentDownloads in parallel

const QUEUE_STORAGE_KEY = "ascendDownloadQueue";
const MAX_CONCURRENT_KEY = "maxConcurrentDownloads";
const DEFAULT_MAX_CONCURRENT = 5;

// Get the max concurrent downloads setting
export const getMaxConcurrentDownloads = () => {
  try {
    const val = parseInt(localStorage.getItem(MAX_CONCURRENT_KEY), 10);
    return isNaN(val) ? DEFAULT_MAX_CONCURRENT : Math.max(1, Math.min(10, val));
  } catch {
    return DEFAULT_MAX_CONCURRENT;
  }
};

// Save the max concurrent downloads setting
export const setMaxConcurrentDownloads = n => {
  try {
    localStorage.setItem(MAX_CONCURRENT_KEY, String(Math.max(1, Math.min(10, n))));
  } catch (error) {
    console.error("Error saving maxConcurrentDownloads:", error);
  }
};

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

// Count currently active downloads (downloading or extracting, not verifying)
export const getActiveDownloadCount = async () => {
  try {
    const games = await window.electron.getGames();
    return games.filter(game => {
      const { downloadingData } = game;
      return (
        downloadingData &&
        (downloadingData.downloading ||
          downloadingData.extracting ||
          downloadingData.updating) &&
        !downloadingData.verifying
      );
    }).length;
  } catch (error) {
    console.error("Error counting active downloads:", error);
    return 0;
  }
};

// Returns true only when we have reached the concurrent download limit
export const hasActiveDownloads = async () => {
  const count = await getActiveDownloadCount();
  const max = getMaxConcurrentDownloads();
  return count >= max;
};

// Start a single queued item and wait for it to appear in the games list
const startQueuedItem = async item => {
  try {
    await window.electron.downloadFile(
      item.url,
      item.gameName,
      item.online || false,
      item.dlc || false,
      item.isVr || false,
      item.updateFlow || false,
      item.version || "",
      item.imgID || null,
      item.size || "",
      item.additionalDirIndex || 0,
      item.gameID || ""
    );

    // Wait for download to appear then remove from queue
    const waitForDownloadToAppear = async (maxAttempts = 10) => {
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const games = await window.electron.getGames();
        const found = games.some(
          g =>
            g.game === item.gameName &&
            g.downloadingData &&
            (g.downloadingData.downloading || g.downloadingData.extracting)
        );
        if (found) {
          removeFromQueue(item.id);
          return;
        }
      }
      removeFromQueue(item.id);
    };

    waitForDownloadToAppear();
    return item;
  } catch (error) {
    console.error("Error starting queued download:", error);
    removeFromQueue(item.id);
    return null;
  }
};

// Fill all available download slots from the queue (supports parallel downloads)
export const processNextInQueue = async () => {
  const queue = getDownloadQueue();
  if (queue.length === 0) return null;

  const activeCount = await getActiveDownloadCount();
  const maxConcurrent = getMaxConcurrentDownloads();
  const availableSlots = maxConcurrent - activeCount;

  if (availableSlots <= 0) return null;

  // Take up to availableSlots items from the front of the queue
  const itemsToStart = queue.slice(0, availableSlots);

  // Mark them as "in-flight" by optimistically removing from queue
  // (startQueuedItem will also remove after confirmation)
  for (const item of itemsToStart) {
    removeFromQueue(item.id);
  }

  // Start all of them in parallel
  const started = await Promise.all(itemsToStart.map(item => startQueuedItem(item)));
  return started.filter(Boolean);
};
