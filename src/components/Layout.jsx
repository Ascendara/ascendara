import { useState, useEffect, memo, useRef } from "react";
import { useOutlet, useSearchParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSettings } from "@/context/SettingsContext";
import Navigation from "./Navigation";
import MenuBar from "./MenuBar";
import Tour from "./Tour";
import PageTransition from "./PageTransition";
import { useTheme } from "@/context/ThemeContext";
import { useNaturalDownloadScroll } from "@/hooks/useNaturalDownloadScroll";
import Search from "@/pages/Search";

const Layout = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTour, setShowTour] = useState(false);
  const { theme, resolvedTheme } = useTheme();
  const location = useLocation();
  const outlet = useOutlet();
  const { settings } = useSettings();
  const reducedMotion = useReducedMotion();
  const [routeTransition, setRouteTransition] = useState({ path: location.pathname, direction: 0 });
  if (routeTransition.path !== location.pathname) {
    const enteringFolder = location.pathname.startsWith("/folderview/") && routeTransition.path === "/library";
    const leavingFolder = location.pathname === "/library" && routeTransition.path.startsWith("/folderview/");
    setRouteTransition({ path: location.pathname, direction: enteringFolder ? 1 : leavingFolder ? -1 : 0 });
  }
  const animateFolders = settings?.smoothTransitions !== false && !reducedMotion;
  const folderDirection = animateFolders ? routeTransition.direction : 0;
  const isCollectionPage = location.pathname === "/library" || location.pathname.startsWith("/folderview/");
  const isSearchPage = location.pathname === "/search";
  const isDownloadPage = location.pathname === "/download";
  const searchScrollRef = useRef(null);

  useNaturalDownloadScroll(isDownloadPage);

  useEffect(() => {
    let shouldStartTour = searchParams.get("tour") === "true";
    // Post-welcome tour intent is persisted via sessionStorage so it survives
    // route redirects (e.g. default landing page) that would strip a query.
    try {
      if (sessionStorage.getItem("ascendara:startTour") === "1") {
        sessionStorage.removeItem("ascendara:startTour");
        shouldStartTour = true;
      }
    } catch (e) {
      // sessionStorage may be unavailable - ignore
    }
    if (shouldStartTour) setShowTour(true);
    if (searchParams.get("tour") === "true") {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("tour");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleCloseTour = () => {
    setShowTour(false);
    try {
      sessionStorage.removeItem("ascendara:startTour");
    } catch (e) {
      // sessionStorage may be unavailable - ignore
    }
    if (searchParams.has("tour")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("tour");
      setSearchParams(nextParams, { replace: true });
    }
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
      </main>
      {/* Other pages render normally via Outlet */}
      <main
        className="flex-1 overflow-y-auto px-4 pb-24"
        style={{ display: isSearchPage ? "none" : "block" }}
      >
        <AnimatePresence initial={false} mode="wait" custom={folderDirection}>
          <motion.div
            key={location.pathname}
            custom={folderDirection}
            className={isCollectionPage ? "fixed inset-0" : undefined}
            variants={{
              enter: direction => ({ opacity: direction ? 0 : 1, x: direction * 36, scale: direction ? 0.985 : 1 }),
              visible: { opacity: 1, x: 0, scale: 1 },
              leave: direction => ({ opacity: direction ? 0 : 1, x: direction * -24, scale: direction ? 0.99 : 1, transition: { duration: direction ? 0.14 : 0 } }),
            }}
            initial="enter"
            animate="visible"
            exit="leave"
            transition={{ duration: folderDirection ? 0.24 : 0, ease: [0.22, 1, 0.36, 1] }}
          >
            <PageTransition key={location.pathname} disabled={Boolean(folderDirection)}>
              {outlet}
            </PageTransition>
          </motion.div>
        </AnimatePresence>
      </main>
      <Navigation className="fixed bottom-0 left-0 right-0" />
      {/* Keep one instance mounted while the tour navigates between pages. */}
      {showTour && <Tour onClose={handleCloseTour} />}
    </div>
  );
});

Layout.displayName = "Layout";

export default Layout;
