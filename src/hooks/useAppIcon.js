import { useEffect, useState } from "react";
import { API_URL } from "@/config/api";

export const REMOTE_ICON_URL = `${API_URL}/logos/ascendara_256x.png`;

// Shared across every consumer so the remote logo is only requested once
let remoteIconPromise = null;

export function loadRemoteIcon() {
  if (!remoteIconPromise) {
    // Revalidate instead of trusting the API's max-age, otherwise a changed
    // logo stays hidden behind the HTTP cache for hours
    remoteIconPromise = fetch(REMOTE_ICON_URL, { cache: "no-cache" })
      .then(response => (response.ok ? response.blob() : null))
      .then(blob => (blob?.type.startsWith("image/") ? URL.createObjectURL(blob) : null))
      .catch(() => null);
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
