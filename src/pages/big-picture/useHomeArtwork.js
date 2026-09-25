import { useEffect, useState } from "react";
import { useImageLoader } from "@/hooks/useImageLoader";
import { gameName } from "./surfaceNavigation";

// Bound decoded image references; reuse in-flight requests when moving between cards.
const cache = new Map();
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
  })().catch(() => null);
  cache.set(name, request);
  if (cache.size > 16) cache.delete(cache.keys().next().value);
  return request;
}

export function useHomeArtwork(game) {
  const name = game ? gameName(game) : "";
  const [local, setLocal] = useState(null);
  const { cachedImage } = useImageLoader(game?.imgID, {
    enabled: !!game?.imgID,
    priority: "high",
    quality: "high",
  });
  useEffect(() => {
    let live = true;
    setLocal(null);
    const timer = setTimeout(() => {
      if (name)
        artwork(name).then((image) => {
          if (live) setLocal(image);
        });
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name]);
  return (
    local ||
    game?.hero ||
    game?.header_image ||
    cachedImage ||
    game?.cover ||
    game?.image ||
    null
  );
}
