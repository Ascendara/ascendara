import { useEffect, useState } from "react";
import { API_URL } from "@/config/api";

export const REMOTE_ICON_URL = `${API_URL}/logos/ascendara_256x.png`;

const LOGO_STORAGE_KEY = "ascendara-logo";

// Chosen by the inline script in index.html before first paint: the logo
// cached from the last launch, or the bundled icon. Every consumer starts from
// it so the boot loader, splash and menu bar all show the same image.
const bootIcon =
  (typeof window !== "undefined" && window.__ASCENDARA_BOOT_ICON__) || "icon.png";

let currentIcon = bootIcon;
let pendingIcon = null;
let bootComplete = false;
const listeners = new Set();

const publishIcon = url => {
  currentIcon = url;
  listeners.forEach(listener => listener(url));
};

const blobToDataUrl = blob =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Shared across every consumer so the remote logo is only requested once
let remoteIconPromise = null;

export function loadRemoteIcon() {
  if (!remoteIconPromise) {
    // Revalidate instead of trusting the API's max-age, otherwise a changed
    // logo stays hidden behind the HTTP cache for hours
    remoteIconPromise = fetch(REMOTE_ICON_URL, { cache: "no-cache" })
      .then(response => (response.ok ? response.blob() : null))
      .then(blob => (blob?.type.startsWith("image/") ? blobToDataUrl(blob) : null))
      .then(dataUrl => {
        if (!dataUrl || dataUrl === bootIcon) return dataUrl;
        try {
          // Next launch paints this logo from the very first frame
          localStorage.setItem(LOGO_STORAGE_KEY, dataUrl);
        } catch {
          // Storage full or unavailable: keep using the bundled icon at boot
        }
        // Swapping while the boot splash is up makes the logo visibly change
        // under the user; switch once the splash has handed off instead.
        if (bootComplete) publishIcon(dataUrl);
        else pendingIcon = dataUrl;
        return dataUrl;
      })
      .catch(() => null);
  }
  return remoteIconPromise;
}

/** Called once the startup splash has finished. */
export function markBootComplete() {
  bootComplete = true;
  if (pendingIcon) {
    publishIcon(pendingIcon);
    pendingIcon = null;
  }
}

/**
 * Returns the Ascendara logo. Available synchronously from the first render
 * (cached or bundled), and updated to the API's logo when that differs.
 */
export function useAppIcon() {
  const [icon, setIcon] = useState(currentIcon);

  useEffect(() => {
    listeners.add(setIcon);
    setIcon(currentIcon);
    loadRemoteIcon();
    return () => {
      listeners.delete(setIcon);
    };
  }, []);

  return icon;
}
