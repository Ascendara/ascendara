import React, { useState, useEffect, useContext, memo, useMemo, useRef } from "react";
import { Outlet, useSearchParams, useLocation } from "react-router-dom";
import Navigation from "./Navigation";
import MenuBar from "./MenuBar";
import Tour from "./Tour";
import PageTransition from "./PageTransition";
import { useTheme } from "@/context/ThemeContext";
import { SettingsContext } from "@/context/SettingsContext";
import { useNaturalDownloadScroll } from "@/hooks/useNaturalDownloadScroll";
import Search from "@/pages/Search";

const Layout = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTour, setShowTour] = useState(false);
  const { theme, resolvedTheme } = useTheme();
  const location = useLocation();
  const context = useContext(SettingsContext);
  const smoothTransitions = context?.settings?.smoothTransitions ?? true;
  const isSearchPage = location.pathname === "/search";
  const isDownloadPage = location.pathname === "/download";
  const searchScrollRef = useRef(null);

  useNaturalDownloadScroll(isDownloadPage);

  useEffect(() => {
    if (searchParams.get("tour") === "true") {
      setShowTour(true);
      return;
    }
    // Post-welcome tour intent is persisted via sessionStorage so it survives
    // route redirects (e.g. default landing page) that would strip a query.
    try {
      if (sessionStorage.getItem("ascendara:startTour") === "1") {
        sessionStorage.removeItem("ascendara:startTour");
        setShowTour(true);
      }
    } catch (e) {
      // sessionStorage may be unavailable - ignore
    }
  }, [searchParams]);

  const handleCloseTour = () => {
    setShowTour(false);
    setSearchParams({});
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MenuBar className="fixed left-0 right-0 top-0 z-50" />
      <div className="h-8" />
      {/* Search is rendered persistently so scroll position and loaded games survive navigation */}
      <main
        ref={searchScrollRef}
        className="flex-1 overflow-y-auto px-4 pb-24"
        style={{ display: isSearchPage ? "block" : "none" }}
      >
        <Search scrollContainerRef={searchScrollRef} isVisible={isSearchPage} />
        {showTour && isSearchPage && <Tour onClose={handleCloseTour} />}
      </main>
      {/* Other pages render normally via Outlet */}
      <main
        className="flex-1 overflow-y-auto px-4 pb-24"
        style={{ display: isSearchPage ? "none" : "block" }}
      >
        <PageTransition key={location.pathname}>
          <Outlet />
        </PageTransition>
        {showTour && !isSearchPage && <Tour onClose={handleCloseTour} />}
      </main>
      <Navigation className="fixed bottom-0 left-0 right-0" />
    </div>
  );
});

Layout.displayName = "Layout";

export default Layout;
