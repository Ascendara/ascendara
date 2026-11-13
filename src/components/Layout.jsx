import { useState, useEffect, useLayoutEffect, memo, useRef } from "react";
import { useOutlet, useSearchParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { useSettings } from "@/context/SettingsContext";
import Navigation from "./Navigation";
import Tour from "./Tour";
import PageTours from "./PageTours";
import { useNaturalDownloadScroll } from "@/hooks/useNaturalDownloadScroll";
import Search from "@/pages/Search";
import { MENU_BAR_HEIGHT_STYLE } from "@/lib/appChromeGeometry";

const EASE_OUT = [0.22, 1, 0.36, 1];
// The leaving page is pinned on top of the new one, so it has to drop off
// right away (ease-out) or the click reads as lagging.
const EASE_EXIT = [0, 0, 0.2, 1];

// Pages that show a single game (opened from a card on Library, Search, Home...)
const isDetailPath = path => path === "/gamescreen" || path === "/download";

const getTransitionKind = (from, to) => {
  if (from === "/library" && to.startsWith("/folderview/")) return "folder-in";
  if (from.startsWith("/folderview/") && to === "/library") return "folder-out";
  if (isDetailPath(to) && !isDetailPath(from)) return "detail-in";
  if (isDetailPath(from) && !isDetailPath(to)) return "detail-out";
  return "page";
};

// Transforms are written as full `transform` strings (always the same
// function list) instead of x/y/scale so framer-motion can hand them to the
// compositor via WAAPI. That keeps the motion smooth even while the incoming
// page is busy mounting and loading data on the main thread.
const tf = (x = 0, y = 0, s = 1) => `translate3d(${x}px, ${y}px, 0px) scale(${s})`;
const REST = tf();

// The old and new page crossfade: the new page starts immediately while the
// old one fades out on top of nothing (it is pinned in place, out of flow).
// Exits are shorter than enters so the old page is gone before the new one
// settles.
const routeVariants = {
  enter: kind => {
    switch (kind) {
      case "folder-in":
        return { opacity: 0, transform: tf(36, 0) };
      case "folder-out":
        return { opacity: 0, transform: tf(-36, 0) };
      case "detail-in":
        return { opacity: 0, transform: tf(0, 14, 0.98) };
      case "detail-out":
        return { opacity: 0, transform: tf(0, 0, 1.015) };
      case "none":
        return { opacity: 1, transform: "none" };
      default:
        return { opacity: 0, transform: tf(0, 12) };
    }
  },
  visible: kind => ({
    opacity: 1,
    transform: REST,
    // Drop the transform once settled: a lingering transform would make this
    // wrapper the containing block for fixed-position elements inside pages.
    transitionEnd: { transform: "none" },
    transition:
      kind === "none"
        ? { duration: 0 }
        : {
            duration: kind === "page" ? 0.26 : 0.3,
            ease: EASE_OUT,
            opacity: { duration: kind === "page" ? 0.18 : 0.22, ease: "easeOut" },
          },
  }),
  // Exits start from an explicit keyframe: the settled page sits at
  // transform: none, which framer would otherwise resolve to scale(0).
  leave: kind => {
    const transition = { duration: 0.14, ease: EASE_EXIT };
    switch (kind) {
      case "folder-in":
        return { opacity: 0, transform: [REST, tf(-24, 0)], transition };
      case "folder-out":
        return { opacity: 0, transform: [REST, tf(24, 0)], transition };
      case "detail-in":
        return { opacity: 0, transform: [REST, tf(0, 0, 0.98)], transition };
      case "detail-out":
        return { opacity: 0, transform: [REST, tf(0, 14, 0.98)], transition };
      case "none":
        return { opacity: 0, transition: { duration: 0 } };
      default:
        return {
          opacity: 0,
          transform: [REST, tf(0, -6)],
          transition: { duration: 0.1, ease: EASE_EXIT },
        };
    }
  },
};

// Pages whose root is pinned to the window (position: fixed) get a wrapper
// that fills the window too. While a wrapper animates, its transform makes it
// what fixed children are positioned against, and an unsized one squashes
// them to nothing until the animation ends.
const fixedPageClass = path => {
  if (path === "/library" || path.startsWith("/folderview/")) return "fixed inset-0";
  // Ascend's sign-in and loading screens sit in normal flow, so its wrapper
  // also takes the main column's spacing and scrolls
  if (path === "/ascend") return "fixed inset-0 overflow-y-auto px-4 pb-24 pt-8";
  return null;
};

// One routed page. When it starts leaving, it's pinned with position: fixed at
// exactly where it sits on screen, so it drops out of the layout (the new page
// takes its place immediately) and doesn't jump when the window scrolls back
// to the top for the new page.
const RoutePage = ({ kind, fixed, children }) => {
  const ref = useRef(null);
  const isPresent = useIsPresent();

  useLayoutEffect(() => {
    const node = ref.current;
    if (isPresent || !node) return;
    const rect = node.getBoundingClientRect();
    Object.assign(node.style, {
      position: "fixed",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: fixed ? `${rect.height}px` : "auto",
      right: "auto",
      bottom: "auto",
      margin: "0",
      pointerEvents: "none",
    });
  }, [isPresent, fixed]);

  return (
    <motion.div
      ref={ref}
      custom={kind}
      className={fixed || undefined}
      style={{ transformOrigin: "50% 30%" }}
      variants={routeVariants}
      initial="enter"
      animate="visible"
      exit="leave"
    >
      {children}
    </motion.div>
  );
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
  const animate =
    settings?.smoothTransitions !== false && !settings?.reduceEffects && !reducedMotion;
  const transitionKind = animate ? routeTransition.kind : "none";

  useEffect(() => {
    document.documentElement.dataset.motion = animate ? "full" : "reduced";
  }, [animate]);
  const fixedClass = fixedPageClass(location.pathname);
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
      <div className="shrink-0" aria-hidden="true" style={MENU_BAR_HEIGHT_STYLE} />
      {/* Search is rendered persistently so scroll position and loaded games survive navigation */}
      <motion.main
        ref={searchScrollRef}
        className="flex-1 overflow-y-auto px-4 pb-24"
        style={{ display: isSearchPage ? "block" : "none" }}
        initial={false}
        animate={
          isSearchPage
            ? {
                opacity: 1,
                transform: REST,
                transitionEnd: { transform: "none" },
                transition: animate
                  ? {
                      duration: 0.36,
                      ease: EASE_OUT,
                      opacity: { duration: 0.28, ease: "easeOut" },
                    }
                  : { duration: 0 },
              }
            : {
                opacity: 0,
                transform: animate ? tf(0, 12) : REST,
                transition: { duration: 0 },
              }
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
          <AnimatePresence custom={transitionKind}>
            <RoutePage key={location.pathname} kind={transitionKind} fixed={fixedClass}>
              {outlet}
            </RoutePage>
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
