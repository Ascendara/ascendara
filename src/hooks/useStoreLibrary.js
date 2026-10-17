import { useCallback, useEffect, useRef, useState } from "react";
import { readStoreDisplay } from "@/lib/storeLibrary";

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
    return () => {
      revisionRef.current++;
      window.removeEventListener("store-accounts-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  const updatePreferences = (next) => {
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
