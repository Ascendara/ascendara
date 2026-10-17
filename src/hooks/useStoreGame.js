import { useCallback, useEffect, useState } from "react";
const images = new Map();
const pending = new Map();
export function useStoreGame(game, enabled = true) {
  const key = `${game.store}:${game.id}`;
  const [artwork, setArtwork] = useState(() => images.get(key) || {});
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const result = await window.electron.storeAccounts.gameDetails(
      game.store,
      game.id,
    );
    if (!result.success) throw new Error(result.error);
    return result.data;
  }, [game.store, game.id]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const update = () =>
      refresh()
        .then((value) => {
          if (active) {
            setDetails(value);
            setError("");
          }
        })
        .catch((failure) => {
          if (active) setError(failure.message);
        });
    update();
    window.addEventListener("focus", update);
    if (images.has(key)) setArtwork(images.get(key));
    else {
      if (!pending.has(key)) {
        const task = window.electron.storeAccounts
          .artwork(game.store, game.id)
          .then((result) => {
            if (!result.success) throw new Error(result.error);
            if (images.size >= 64) images.delete(images.keys().next().value);
            images.set(key, result.data);
            return result.data;
          })
          .finally(() => pending.delete(key));
        pending.set(key, task);
      }
      pending
        .get(key)
        .then((value) => {
          if (active) setArtwork(value);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      window.removeEventListener("focus", update);
    };
  }, [enabled, game.store, game.id, key, refresh]);
  return { artwork, details, error };
}
