import { useState, useEffect, memo, useRef } from "react";
import { useOutlet, useSearchParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSettings } from "@/context/SettingsContext";
import Navigation from "./Navigation";
import Tour from "./Tour";
import PageTours from "./PageTours";
import { useNaturalDownloadScroll } from "@/hooks/useNaturalDownloadScroll";
import Search from "@/pages/Search";

const EASE_OUT = [0.22, 1, 0.36, 1];

// Pages that show a single game (opened from a card on Library, Search, Home...)
const isDetailPath = path => path === "/gamescreen" || path === "/download";

const getTransitionKind = (from, to) => {
  if (from === "/library" && to.startsWith("/folderview/")) return "folder-in";
  if (from.startsWith("/folderview/") && to === "/library") return "folder-out";
  if (isDetailPath(to) && !isDetailPath(from)) return "detail-in";
  if (isDetailPath(from) && !isDetailPath(to)) return "detail-out";
  return "page";
};

// Small, quick motions: enough to show where you're going without slowing
// navigation down. Exits stay short because AnimatePresence waits on them.
const routeVariants = {
  enter: kind => {
    switch (kind) {
      // Folders slide without scaling: scaling a full library grid forces a
      // costly re-raster of every card and made the switch stutter.
      case "folder-in":
        return { opacity: 0, x: 28 };
      case "folder-out":
        return { opacity: 0, x: -28 };
      case "detail-in":
        return { opacity: 0, y: 10, scale: 0.985 };
      case "detail-out":
        return { opacity: 0, scale: 1.01 };
      case "none":
        return { opacity: 1 };
      default:
        return { opacity: 0, y: 6 };
    }
  },
  visible: kind => ({
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: {
      duration: kind === "none" ? 0 : kind === "page" ? 0.2 : 0.24,
      ease: EASE_OUT,
    },
  }),
  leave: kind => {
    switch (kind) {
      // Short opacity-only exit: the next page waits on it, and fading is
      // the cheapest thing to animate on a large grid.
      case "folder-in":
      case "folder-out":
        return { opacity: 0, transition: { duration: 0.08 } };
      case "detail-in":
        return { opacity: 0, scale: 0.99, transition: { duration: 0.12 } };
      case "detail-out":
        return { opacity: 0, y: 8, scale: 0.99, transition: { duration: 0.12 } };
      default:
        return { opacity: 0, transition: { duration: 0 } };
    }
  },
};

const Layout = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTour, setShowTour] = useState(false);
  const location = useLocation();
  const outlet = useOutlet();
  const { settings } = useSettings();
  const reducedMotion = useReducedMotion();
  const [routeTransition, setRouteTransition] = useState({
    path: location.pathname,
    kind: "page",
  });
  if (routeTransition.path !== location.pathname) {
    setRouteTransition({
      path: location.pathname,
      kind: getTransitionKind(routeTransition.path, location.pathname),
    });
  }
  const animate = settings?.smoothTransitions !== false && !reducedMotion;
  const transitionKind = animate ? routeTransition.kind : "none";

  useEffect(() => {
    document.documentElement.dataset.motion = animate ? "full" : "reduced";
  }, [animate]);
  const isCollectionPage =
    location.pathname === "/library" || location.pathname.startsWith("/folderview/");
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
      <div className="h-8" />
      {/* Search is rendered persistently so scroll position and loaded games survive navigation */}
      <motion.main
        ref={searchScrollRef}
        className="flex-1 overflow-y-auto px-4 pb-24"
        style={{ display: isSearchPage ? "block" : "none" }}
        initial={false}
        animate={
          isSearchPage
            ? { opacity: 1, y: 0, transition: { duration: animate ? 0.22 : 0, ease: EASE_OUT } }
            : { opacity: 0, y: animate ? 6 : 0, transition: { duration: 0 } }
        }
      >
        <Search scrollContainerRef={searchScrollRef} isVisible={isSearchPage} />
      </motion.main>
      {/* Other pages render normally via Outlet */}
      <main
        className="flex-1 overflow-y-auto px-4 pb-24"
        style={{ display: isSearchPage ? "none" : "block" }}
      >
        {/* Skipped on /search so the outgoing page unmounts immediately instead of lingering in the hidden container with its listeners */}
        {!isSearchPage && (
          <AnimatePresence mode="wait" custom={transitionKind}>
            <motion.div
              key={location.pathname}
              custom={transitionKind}
              className={isCollectionPage ? "fixed inset-0" : undefined}
              style={{ transformOrigin: "50% 30%" }}
              variants={routeVariants}
              initial="enter"
              animate="visible"
              exit="leave"
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
      <Navigation className="fixed bottom-0 left-0 right-0" />
      {/* Keep one instance mounted while the tour navigates between pages. */}
      {showTour && <Tour onClose={handleCloseTour} />}
      <PageTours suppressed={showTour} />
    </div>
  );
});

Layout.displayName = "Layout";

export default Layout;
