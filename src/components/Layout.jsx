import { useState, useEffect, useLayoutEffect, memo, useRef, useContext } from "react";
import {
  useOutlet,
  useSearchParams,
  useLocation,
  UNSAFE_LocationContext as LocationContext,
} from "react-router-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { useSettings } from "@/context/SettingsContext";
import Navigation from "./Navigation";
import Tour from "./Tour";
import PageTours from "./PageTours";
import { useNaturalDownloadScroll } from "@/hooks/useNaturalDownloadScroll";
import Search from "@/pages/Search";
import { beginPageLoad, endPageLoad, whenPageLoaded } from "@/lib/loadGate";

const EASE_OUT = [0.22, 1, 0.36, 1];
const EASE_EXIT = [0.4, 0, 1, 1];

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
            duration: kind === "page" ? 0.36 : 0.4,
            ease: EASE_OUT,
            opacity: { duration: kind === "page" ? 0.28 : 0.3, ease: "easeOut" },
          },
  }),
  // Exits start from an explicit keyframe: the settled page sits at
  // transform: none, which framer would otherwise resolve to scale(0).
  leave: kind => {
    const transition = { duration: 0.2, ease: EASE_EXIT };
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
          transition: { duration: 0.16, ease: EASE_EXIT },
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

// Inline styles a staged page is positioned with, cleared when it's revealed.
const STAGED_STYLE_KEYS = ["position", "top", "left", "width", "pointerEvents"];

// One routed page. When it starts leaving, it's pinned with position: fixed at
// exactly where it sits on screen, so it drops out of the layout (the new page
// takes its place immediately) and doesn't jump when the window scrolls back
// to the top for the new page.
//
// While `staged`, the page is mounted and loading but invisible, laid out out
// of flow where it will appear once the window scrolls back to the top; the
// previous page stays on screen until it's revealed. Each page sees the
// location it was rendered for, so a page on its way out doesn't re-render for
// the next page's URL.
const RoutePage = ({ kind, fixed, staged = false, locationContext, children }) => {
  const ref = useRef(null);
  const isPresent = useIsPresent();

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!staged) {
      STAGED_STYLE_KEYS.forEach(key => (node.style[key] = ""));
      return;
    }
    node.style.pointerEvents = "none";
    // Collection pages are already fixed to the viewport
    if (fixed) return;
    // Match the container's content box, where the page will sit in flow
    const parent = node.parentElement;
    const container = parent.getBoundingClientRect();
    const { paddingLeft, paddingRight } = getComputedStyle(parent);
    const padLeft = parseFloat(paddingLeft) || 0;
    const padRight = parseFloat(paddingRight) || 0;
    Object.assign(node.style, {
      position: "fixed",
      top: `${container.top + window.scrollY}px`,
      left: `${container.left + padLeft}px`,
      width: `${container.width - padLeft - padRight}px`,
    });
  }, [staged, fixed]);

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
      animate={staged ? "enter" : "visible"}
      exit="leave"
    >
      <LocationContext.Provider value={locationContext}>
        {children}
      </LocationContext.Provider>
    </motion.div>
  );
};

const Layout = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTour, setShowTour] = useState(false);
  const location = useLocation();
  const outlet = useOutlet();
  const locationContext = useContext(LocationContext);
  const { settings } = useSettings();
  const reducedMotion = useReducedMotion();
  // The page on screen, kept so it can stay up while the next one loads
  const livePageRef = useRef(null);
  const [routeTransition, setRouteTransition] = useState({
    path: location.pathname,
    kind: "page",
    // Set while the new page loads behind the one still on screen
    previous: null,
  });
  if (routeTransition.path !== location.pathname) {
    const onScreen = routeTransition.previous || livePageRef.current;
    const from = onScreen?.key ?? routeTransition.path;
    // Search lives outside the routed pages and switches instantly; going
    // back to the page still on screen just cancels the pending one.
    const stage =
      onScreen &&
      from !== "/search" &&
      location.pathname !== "/search" &&
      onScreen.key !== location.pathname;
    setRouteTransition({
      path: location.pathname,
      kind: getTransitionKind(from, location.pathname),
      previous: stage ? onScreen : null,
    });
  }
  const pending = !!routeTransition.previous;
  const animate = settings?.smoothTransitions !== false && !reducedMotion;
  const transitionKind = animate ? routeTransition.kind : "none";

  useEffect(() => {
    document.documentElement.dataset.motion = animate ? "full" : "reduced";
  }, [animate]);
  const fixedClass = fixedPageClass(location.pathname);
  const isSearchPage = location.pathname === "/search";
  // A new object per render: a transition captures the one from before it
  livePageRef.current = isSearchPage
    ? null
    : { key: location.pathname, outlet, locationContext, fixed: fixedClass };

  // Reveal the new page once it has finished loading (see lib/loadGate). The
  // load opens before the page's effects run so their holds count, and is
  // checked after them (parent effects run after their children's), so a
  // page with nothing to load is revealed without waiting.
  useLayoutEffect(() => {
    if (pending) beginPageLoad();
  }, [pending, routeTransition.path]);
  useEffect(() => {
    if (!pending) return;
    const path = routeTransition.path;
    let cancelled = false;
    const loaded = whenPageLoaded();
    loaded.then(() => {
      if (cancelled) return;
      setRouteTransition(current =>
        current.path === path ? { ...current, previous: null } : current
      );
    });
    return () => {
      cancelled = true;
      endPageLoad(loaded);
    };
  }, [pending, routeTransition.path]);

  // Once a new page is revealed, scroll up for it. The outgoing page is pinned
  // in place by now, so this doesn't move it. Going back to the page that was
  // still on screen leaves it where it was.
  const stagedFromRef = useRef(null);
  useLayoutEffect(() => {
    if (pending) {
      stagedFromRef.current ??= routeTransition.previous.key;
    } else if (stagedFromRef.current) {
      if (stagedFromRef.current !== location.pathname) window.scrollTo(0, 0);
      stagedFromRef.current = null;
    }
  }, [pending]);
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
            {pending && (
              <RoutePage
                key={routeTransition.previous.key}
                kind={transitionKind}
                fixed={routeTransition.previous.fixed}
                locationContext={routeTransition.previous.locationContext}
              >
                {routeTransition.previous.outlet}
              </RoutePage>
            )}
            <RoutePage
              key={location.pathname}
              kind={transitionKind}
              fixed={fixedClass}
              staged={pending}
              locationContext={locationContext}
            >
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
