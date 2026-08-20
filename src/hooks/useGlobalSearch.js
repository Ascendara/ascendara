import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSearch } from "@/context/SearchContext";
import { useCommandPaletteRegistration } from "@/hooks/useCommandPaletteRegistration";
import { useRecoveryPointOnUpdate } from "@/hooks/useRecoveryPointOnUpdate";

function isEditableTarget(target) {
  return Boolean(
    target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
  );
}

export const useGlobalSearch = () => {
  const { openSearch } = useSearch();
  const location = useLocation();

  useCommandPaletteRegistration();
  useRecoveryPointOnUpdate();

  useEffect(() => {
    const handleKeyDown = event => {
      const platform = navigator.userAgentData?.platform || navigator.platform || "";
      const isMac = platform.toUpperCase().includes("MAC");
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
      if (!modifierPressed) return;

      const key = event.key.toLowerCase();
      if (key === "f" && !isEditableTarget(event.target)) {
        event.preventDefault();
        if (location.pathname === "/library") openSearch("library");
        else if (location.pathname === "/settings") openSearch("settings");
        else openSearch("global");
        return;
      }

      if (key === "k") {
        event.preventDefault();
        openSearch("global");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [location.pathname, openSearch]);
};
