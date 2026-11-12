import { useEffect, useRef, useState } from "react";
import { useImageLoader } from "@/hooks/useImageLoader";
import { gameName } from "./surfaceNavigation";

// Bound decoded image references; reuse in-flight requests when moving between cards.
const cache = new Map();
// Lookups that already finished, so revisiting a game shows its art at once.
const resolved = new Map();
async function artwork(name) {
  if (cache.has(name)) return cache.get(name);
  const request = (async () => {
    for (const type of ["hero", "header", "grid"]) {
      const data = await window.electron?.getGameImage(name, type);
      if (data)
        return data.startsWith("data:")
          ? data
          : `data:image/jpeg;base64,${data}`;
    }
    return null;
  })()
    .catch(() => null)
    .then((image) => {
      if (cache.get(name) === request) resolved.set(name, image);
      return image;
    });
  cache.set(name, request);
  if (cache.size > 16) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
    resolved.delete(oldest);
  }
  return request;
}

/**
 * Artwork for `game` plus the name of the game it belongs to. While a new
 * game's artwork is still loading this keeps returning the previous game's, so
 * the image changes once (and crossfades once) instead of flashing through the
 * old art, a fallback cover and then the hero.
 */
export function useHomeArtworkState(game) {
  const name = game ? gameName(game) : "";
  const { cachedImage } = useImageLoader(game?.imgID, {
    enabled: !!game?.imgID,
    priority: "high",
    quality: "high",
  });
  const [settled, setSettled] = useState(() =>
    name && resolved.has(name) ? { name, local: resolved.get(name) } : null
  );
  useEffect(() => {
    if (!name) {
      setSettled(null);
      return undefined;
    }
    if (resolved.has(name)) {
      setSettled({ name, local: resolved.get(name) });
      return undefined;
    }
    let live = true;
    // Short delay so scrolling quickly past games doesn't load every one.
    const timer = setTimeout(() => {
      artwork(name).then((local) => {
        if (live) setSettled({ name, local });
      });
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name]);
  const last = useRef({ name: null, image: null });
  if (!name) {
    last.current = { name: null, image: null };
  } else if (settled?.name === name) {
    last.current = {
      name,
      image:
        settled.local ||
        game?.hero ||
        game?.header_image ||
        cachedImage ||
        game?.cover ||
        game?.image ||
        null,
    };
  }
  return last.current;
}

export function useHomeArtwork(game) {
  return useHomeArtworkState(game).image;
}
