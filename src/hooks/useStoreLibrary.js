import { useCallback, useEffect, useRef, useState } from "react";
import { readStoreDisplay } from "@/lib/storeLibrary";

// Libraries synced before Steam names were resolved keep "appid_<id>" titles
// until the next sync, so resync once per session when any are left.
let placeholderResync = false;
function resyncPlaceholderNames(accounts) {
  if (placeholderResync) return;
  const steam = accounts.find(account => account.store === "steam");
  if (
    !steam?.connected ||
    steam.busy ||
    !steam.games?.some(game => /^(appid_)?\d+$/i.test(game.name || ""))
  )
    return;
  placeholderResync = true;
  window.electron.storeAccounts
    .refresh("steam")
    .then(result => {
      if (result?.success) window.dispatchEvent(new Event("store-accounts-updated"));
    })
    .catch(() => {});
}

export function useStoreLibrary() {
  const [preferences, setPreferences] = useState(readStoreDisplay);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const revision = ++request.current;
    try {
      const result = await window.electron.storeAccounts.state();
      if (revision !== request.current) return;
      if (!result.success) throw new Error("unavailable");
      setAccounts(result.data.accounts);
      setError("");
      resyncPlaceholderNames(result.data.accounts);
    } catch {
      if (revision === request.current) {
        setAccounts([]);
        setError("unavailable");
      }
    }
  }, []);
  useEffect(() => {
    const revisionRef = request;
    refresh();
    window.addEventListener("store-accounts-updated", refresh);
    window.addEventListener("focus", refresh);
    // Playtime and launch counts come back with the account state
    const unsubLaunched = window.electron.storeAccounts.onGameLaunched?.(refresh);
    const unsubClosed = window.electron.storeAccounts.onGameClosed?.(refresh);
    return () => {
      unsubLaunched?.();
      unsubClosed?.();
      revisionRef.current++;
      window.removeEventListener("store-accounts-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  const updatePreferences = next => {
    try {
      localStorage.setItem("library-store-display", JSON.stringify(next));
      setPreferences(next);
      return true;
    } catch {
      return false;
    }
  };
  return { preferences, updatePreferences, accounts, error, refresh };
}
