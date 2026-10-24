import { useEffect, useState } from "react";
import { API_URL } from "@/config/api";

export const REMOTE_ICON_URL = `${API_URL}/logos/ascendara_256x.png`;

// Shared across every consumer so the remote logo is only requested once
let remoteIconPromise = null;

export function loadRemoteIcon() {
  if (!remoteIconPromise) {
    remoteIconPromise = new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(REMOTE_ICON_URL);
      img.onerror = () => resolve(null);
      img.src = REMOTE_ICON_URL;
    });
  }
  return remoteIconPromise;
}

/**
 * Returns the Ascendara logo. Shows the bundled icon straight away and swaps
 * to the logo served by the API once it has loaded, so offline users and
 * slow connections still get an icon.
 */
export function useAppIcon() {
  const [icon, setIcon] = useState("");

  useEffect(() => {
    let cancelled = false;
    let remoteLoaded = false;

    loadRemoteIcon().then(url => {
      if (url && !cancelled) {
        remoteLoaded = true;
        setIcon(url);
      }
    });

    window.electron
      .getAssetPath("icon.png")
      .then(data => {
        if (data && !cancelled && !remoteLoaded) setIcon(data);
      })
      .catch(error => console.error("Failed to load icon:", error));

    return () => {
      cancelled = true;
    };
  }, []);

  return icon;
}
