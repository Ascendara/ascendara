import { useEffect } from "react";
import { useSearch } from "@/context/SearchContext";
import { useLocation } from "react-router-dom";

export const useGlobalSearch = () => {
  const { openSearch } = useSearch();
  const location = useLocation();

  useEffect(() => {
    const handleKeyDown = e => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (isCtrlOrCmd && e.key === "f") {
        const target = e.target;
        const isInInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

        if (!isInInput) {
          e.preventDefault();

          const pathname = location.pathname;
          if (pathname === "/library") {
            openSearch("library");
          } else if (pathname === "/settings") {
            openSearch("settings");
          } else {
            openSearch("global");
          }
        }
      }

      if (isCtrlOrCmd && e.key === "k") {
        e.preventDefault();
        openSearch("global");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openSearch, location.pathname]);
};
