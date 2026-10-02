import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveLibraryConflicts, readLibraryChoices, libraryInstallKey } from "@/lib/libraryConflicts";

const STORAGE_KEY = "library-install-choices";
const EVENT = "library-install-choices-updated";
const readChoices = readLibraryChoices;

export function useLibraryConflicts(records, onSaveError) {
  const [choices, setChoices] = useState(readChoices);
  const [deferred, setDeferred] = useState(false);
  const [reviewKeys, setReviewKeys] = useState([]);
  useEffect(() => {
    const update = () => setChoices(readChoices());
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  const resolved = useMemo(
    () => resolveLibraryConflicts(records, choices),
    [records, choices]
  );
  const allConflicts = useMemo(
    () => resolveLibraryConflicts(records).conflicts,
    [records]
  );
  const conflict =
    allConflicts.find(item => reviewKeys.includes(item.key)) ||
    (deferred ? null : resolved.conflicts[0]) ||
    null;
  const resolve = useCallback(
    (key, choice) => {
      try {
        const item = allConflicts.find(item => item.key === key);
        if (!item || (choice !== "both" && !item.variants.some(game => libraryInstallKey(game) === choice))) return false;
        const next = { ...readChoices(), [key]: choice };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setChoices(next);
        setReviewKeys(keys => keys.filter(item => item !== key));
        window.dispatchEvent(new Event(EVENT));
        return true;
      } catch {
        onSaveError?.();
        return false;
      }
    },
    [onSaveError, allConflicts]
  );
  const review = () => {
    setReviewKeys(resolved.conflicts.map(item => item.key));
    setDeferred(false);
  };
  const manageSavedChoices = () => {
    setReviewKeys(allConflicts.map(item => item.key));
    setDeferred(false);
  };
  const defer = () => {
    setDeferred(true);
    setReviewKeys([]);
  };
  return {
    ...resolved,
    conflict,
    resolve,
    review,
    manageSavedChoices,
    defer,
    hasConflicts: allConflicts.length > 0,
    pendingCount: resolved.conflicts.length,
    savedCount: allConflicts.length - resolved.conflicts.length,
  };
}
