// Audio player service for managing MP3 playback and progress tracking
import { create } from "zustand";
import axios from "axios";

const CACHE_PREFIX = "audio-cache-";
const PROGRESS_PREFIX = "audio-progress-";

// Convert external URL to proxied URL
const toProxyUrl = url => {
  if (!url) return url;
  return url.replace("https://downloads.khinsider.com", "/api/khinsider");
};

// Audio player store for managing global playback state
export const useAudioPlayer = create((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: parseFloat(localStorage.getItem("audio-volume") || "0.7"),
  audioElement: null,

  setTrack: track => {
    console.log("[AudioPlayerService] setTrack called with:", track);
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      audioElement.src = "";
    }
    set({ currentTrack: track, progress: 0, duration: 0 });
  },

  initializeAudio: () => {
    const { audioElement } = get();
    if (audioElement) return;

    const audio = new Audio();
    audio.preload = "metadata";

    // Set up audio event listeners
    audio.addEventListener("timeupdate", () => {
      set({ progress: audio.currentTime });
      // Save progress for resume capability
      if (get().currentTrack) {
        localStorage.setItem(
          `${PROGRESS_PREFIX}${get().currentTrack.url}`,
          audio.currentTime.toString()
        );
      }
    });

    audio.addEventListener("loadedmetadata", () => {
      set({ duration: audio.duration });
      // Restore previous progress if available
      if (get().currentTrack) {
        const savedProgress = localStorage.getItem(
          `${PROGRESS_PREFIX}${get().currentTrack.url}`
        );
        if (savedProgress) {
          audio.currentTime = parseFloat(savedProgress);
        }
      }
    });

    audio.addEventListener("ended", () => {
      set({ isPlaying: false, progress: 0 });
      localStorage.removeItem(`${PROGRESS_PREFIX}${get().currentTrack?.url}`);
    });

    audio.addEventListener("error", e => {
      // If audio ended or was killed, this isn't an error
      if (get().isPlaying) {
        console.error("Audio playback error:", e);
      }
      set({ isPlaying: false });
    });

    set({ audioElement: audio });
  },

  play: async () => {
    const { audioElement, currentTrack, volume } = get();
    console.log("[AudioPlayerService] play called. currentTrack:", currentTrack);
    if (!audioElement || !currentTrack) return;

    try {
      // Always reset the source before setting a new one
      audioElement.pause();
      audioElement.src = "";

      // If the URL is a direct mp3 link, set it directly
      if (/^https?:\/\/.+\.mp3$/i.test(currentTrack.url)) {
        console.log(
          "[AudioPlayer] Setting audioElement.src directly to:",
          currentTrack.url
        );
        audioElement.src = currentTrack.url;
      } else {
        // Otherwise, use the proxy/fetch logic
        const proxyUrl = toProxyUrl(currentTrack.url);
        console.log("[AudioPlayer] Proxy URL:", proxyUrl);
        const response = await axios.get(proxyUrl, { responseType: "blob" });
        const url = URL.createObjectURL(response.data);
        audioElement.src = url;
        localStorage.setItem(`${CACHE_PREFIX}${currentTrack.url}`, url);
      }

      console.log("[AudioPlayer] audioElement.src before play:", audioElement.src);
      audioElement.volume = volume;
      await audioElement.play();
      set({ isPlaying: true });
    } catch (error) {
      console.error("Error playing audio:", error);
      set({ isPlaying: false });
    }
  },

  pause: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      set({ isPlaying: false });
    }
  },

  seek: time => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.currentTime = time;
      set({ progress: time });
    }
  },

  setVolume: volume => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.volume = volume;
      localStorage.setItem("audio-volume", volume.toString());
      set({ volume });
    }
  },

  cleanup: () => {
    const { audioElement, currentTrack } = get();
    if (audioElement) {
      if (currentTrack) {
        localStorage.setItem(
          `${PROGRESS_PREFIX}${currentTrack.url}`,
          audioElement.currentTime.toString()
        );
      }
      audioElement.pause();
      audioElement.src = "";
    }
    set({ currentTrack: null, isPlaying: false, progress: 0, duration: 0 });
  },
}));

// Initialize audio on service import
useAudioPlayer.getState().initializeAudio();

// Handle cleanup on window unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    useAudioPlayer.getState().cleanup();
  });
}

// Instantly kill audio and miniplayer
// This sets a global flag `miniplayerKilled` for UI to react if needed
let miniplayerKilled = false;

export function killAudioAndMiniplayer() {
  useAudioPlayer.getState().cleanup();
  miniplayerKilled = true;
}

export function wasMiniplayerKilled() {
  return miniplayerKilled;
}

export function resetMiniplayerKilled() {
  miniplayerKilled = false;
}

export const formatTime = seconds => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// Clear old cached items periodically
export const clearOldCache = () => {
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(CACHE_PREFIX)) {
      const url = localStorage.getItem(key);
      if (url && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
      localStorage.removeItem(key);
    }
  });
};

// Run cache cleanup on service import
clearOldCache();
