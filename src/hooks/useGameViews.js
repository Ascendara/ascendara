import { useEffect, useRef, useState } from "react";
import gameViewService from "@/services/games/gameViewService";

/**
 * Tracks a game card as viewed while it is on screen and returns its view count.
 * Attach the returned ref to the card's root element.
 * @param {string} gameID - The game the card shows
 * @param {boolean} enabled - Whether views apply (the normal index only)
 * @returns {[import("react").RefObject, number|null]} Card ref and view count
 */
export function useGameViews(gameID, enabled = true) {
  enabled = enabled && !String(gameID || "").startsWith("private-");
  const ref = useRef(null);
  const [views, setViews] = useState(() =>
    enabled ? gameViewService.getCount(gameID) : null
  );

  useEffect(() => {
    if (!enabled || !gameID) {
      setViews(null);
      return;
    }
    setViews(gameViewService.getCount(gameID));
    const stopObserving = gameViewService.observe(ref.current, gameID);
    const unsubscribe = gameViewService.subscribe(gameID, setViews);
    return () => {
      stopObserving();
      unsubscribe();
    };
  }, [gameID, enabled]);

  return [ref, views];
}
