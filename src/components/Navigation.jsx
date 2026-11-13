import React, { useState, useEffect, memo, useCallback, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { getConfiguredProviders } from "@/services/downloads/debridService";
import {
  Home,
  Search,
  Library,
  Settings2,
  ChevronRight,
  Package,
  User,
  ServerIcon,
  CircleArrowDown,
  AtSign,
} from "lucide-react";
import { useAscendNotificationCount } from "@/services/ascend/ascendNotificationBadgeService";
import { useNewSecurityFeature } from "@/services/ascend/newFeatureBadgeService";
import { prefetchAscendData } from "@/services/ascend/ascendPrefetch";
import {
  NAVIGATION_EDGE_PADDING_PX,
  NAVIGATION_COMPACT_ITEM_HEIGHT_PX,
  NAVIGATION_COMPACT_SEPARATOR_HEIGHT_PX,
  NAVIGATION_COMPACT_PADDING_Y_PX,
  NAVIGATION_EXPANDED_ITEM_HEIGHT_PX,
  NAVIGATION_EXPANDED_SEPARATOR_HEIGHT_PX,
  NAVIGATION_EXPANDED_PADDING_Y_PX,
} from "@/lib/navigationGeometry";

// A dock item collapses to no width, and the negative margin cancels the dock's
// 8px gap, so its neighbours close up fully while it is hidden
const DOCK_ITEM_HIDDEN = { width: 0, marginLeft: -8, opacity: 0, scale: 0.3, y: 8 };
const DOCK_ITEM_SHOWN = {
  width: NAVIGATION_EXPANDED_ITEM_HEIGHT_PX,
  height: NAVIGATION_EXPANDED_ITEM_HEIGHT_PX,
  marginLeft: 0,
  opacity: 1,
  scale: 1,
  y: 0,
};
// While a page is scrolled, the dock shrinks to a row of colour dots; the current page's dot
// stretches into a short pill
const dockItemCompact = active => ({
  ...DOCK_ITEM_SHOWN,
  width: active ? 22 : 8,
  height: NAVIGATION_COMPACT_ITEM_HEIGHT_PX,
});
// How far from the top a page has to be scrolled before the dock goes compact
const COMPACT_MIN_SCROLL = 80;
const DOCK_SPRING = { type: "spring", stiffness: 380, damping: 30 };
const DOCK_ITEM_TRANSITION = { ...DOCK_SPRING, opacity: { duration: 0.2 } };
// The shell rides the same spring as the items so the two never drift apart. Its corner
// radius stays put: the compact dock is short enough that 18px already rounds it into a
// pill, and a fixed radius can't snap the way a jump to rounded-full does
const DOCK_SHELL_EXPANDED = {
  paddingTop: NAVIGATION_EXPANDED_PADDING_Y_PX,
  paddingBottom: NAVIGATION_EXPANDED_PADDING_Y_PX,
  paddingLeft: 12,
  paddingRight: 12,
  gap: 8,
};
const DOCK_SHELL_COMPACT = {
  paddingTop: NAVIGATION_COMPACT_PADDING_Y_PX,
  paddingBottom: NAVIGATION_COMPACT_PADDING_Y_PX,
  paddingLeft: 14,
  paddingRight: 14,
  gap: 6,
};

const Navigation = memo(({ items }) => {
  const { t } = useLanguage();
  const { settings } = useSettings();
  // One entry for all services with a downloads page, shown only while one is in use
  const debridNavVisible = getConfiguredProviders(settings).some(
    provider => provider.hasDownloadsPage !== false
  );
  const location = useLocation();
  const navigate = useNavigate();
  const [size, setSize] = useState(() => {
    const savedSize = localStorage.getItem("navSize");
    return savedSize ? parseFloat(savedSize) : 100;
  });
  const [downloadCount, setDownloadCount] = useState(0);
  // Unseen notifications, plus one while two-step verification is new to this member
  const ascendNotificationCount =
    useAscendNotificationCount() + (useNewSecurityFeature() ? 1 : 0);
  const downloadCountRef = useRef(0);
  const isGamePage = ["/download", "/gamescreen"].includes(location.pathname);
  // The router renders the next page in a transition, so location only
  // changes once that page is ready. Track the clicked path separately so the
  // dock highlights it on the very next frame instead of after the render.
  const [pendingPath, setPendingPath] = useState(null);
  useEffect(() => setPendingPath(null), [location.pathname]);
  const activePath = pendingPath ?? location.pathname;

  const handleMouseDown = useCallback(
    (e, isLeft) => {
      const startX = e.clientX;
      const startSize = size;

      const handleMouseMove = moveEvent => {
        moveEvent.preventDefault();
        const deltaX = moveEvent.clientX - startX;
        const adjustedDelta = isLeft ? -deltaX : deltaX;
        const newSize = Math.min(100, Math.max(50, startSize + adjustedDelta / 5));
        setSize(newSize);
        localStorage.setItem("navSize", newSize.toString());

        window.dispatchEvent(new CustomEvent("navResize"));
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [size]
  );

  const navStyle = useMemo(
    () => ({
      transform: `scale(${size / 100})`,
    }),
    [size]
  );

  const isActive = useCallback(
    path => {
      if (path === "/search" && activePath === "/download") {
        return true;
      }
      if (
        path === "/settings" &&
        [
          "/settings",
          "/themes",
          "/extralanguages",
          "/sidecaranddependencies",
          "/sources",
        ].includes(activePath)
      ) {
        return true;
      }
      if (
        path === "/library" &&
        (activePath === "/gamescreen" ||
          activePath === "/retro" ||
          activePath.startsWith("/folderview"))
      ) {
        return true;
      }
      return activePath === path;
    },
    [activePath]
  );

  const navItems = useMemo(() => {
    const items = [
      {
        path: "/",
        label: t("common.home"),
        icon: Home,
        color: "from-blue-400 to-blue-600",
      },
      {
        path: "/search",
        label: t("common.search"),
        icon: Search,
        color: "from-violet-400 to-violet-600",
      },
      {
        path: "/library",
        label: t("common.library"),
        icon: Library,
        color: "from-emerald-400 to-emerald-600",
      },
      {
        path: "/downloads",
        label: t("common.downloads"),
        icon: CircleArrowDown,
        color: "from-orange-400 to-orange-600",
      },
      {
        path: "/debriddownloads",
        label: t("debrid.downloadsTitle"),
        icon: ServerIcon,
        hidden: !debridNavVisible,
        color: "from-yellow-400 to-amber-500",
      },
      // Splits the download pages from the rest of the dock
      { separator: true, path: "separator" },
    ];

    items.push({
      path: "/profile",
      label: t("common.profile"),
      icon: User,
      color: "from-rose-400 to-rose-600",
    });

    items.push({
      path: "/ascend",
      label: t("common.ascend"),
      icon: AtSign,
      color: "from-fuchsia-400 to-fuchsia-600",
    });

    if (settings.viewWorkshopPage) {
      items.push({
        path: "/workshopdownloader",
        label: t("common.workshopDownloader"),
        icon: Package,
        color: "from-lime-400 to-lime-600",
      });
    }

    items.push({
      path: "/settings",
      label: t("common.preferences"),
      icon: Settings2,
      color: "from-slate-400 to-slate-600",
    });

    return items;
  }, [t, settings, debridNavVisible]);

  useEffect(() => {
    const checkDownloaderStatus = async () => {
      if (!settings?.downloadDirectory || settings.downloadDirectory === "") return;
      try {
        const games = await window.electron.getGames();
        if (!games || !Array.isArray(games)) {
          if (downloadCountRef.current !== 0) {
            downloadCountRef.current = 0;
            setDownloadCount(0);
          }
          return;
        }
        const downloadingGames = games.filter(game => {
          const { downloadingData } = game;
          return (
            downloadingData &&
            (downloadingData.downloading ||
              downloadingData.extracting ||
              downloadingData.updating ||
              downloadingData.error)
          );
        });
        const count = downloadingGames.length;
        // Only update state if count changed to prevent unnecessary rerenders
        if (count !== downloadCountRef.current) {
          downloadCountRef.current = count;
          setDownloadCount(count);
        }
      } catch (error) {
        console.error("Error checking downloading games:", error);
      }
    };

    // Poll quickly only while something is downloading; download events and
    // page changes trigger an immediate recheck in between.
    let timeout = null;
    let canceled = false;
    const schedule = () => {
      clearTimeout(timeout);
      if (canceled) return;
      timeout = setTimeout(
        async () => {
          await checkDownloaderStatus();
          schedule();
        },
        downloadCountRef.current > 0 ? 3000 : 15000
      );
    };
    let lastCheck = 0;
    const recheck = async () => {
      lastCheck = Date.now();
      await checkDownloaderStatus();
      schedule();
    };
    const handleProgress = () => {
      if (downloadCountRef.current === 0 && Date.now() - lastCheck > 2000) recheck();
    };

    recheck();
    const unsubProgress = window.electron.onDownloadProgress?.(handleProgress);
    const unsubComplete = window.electron.onDownloadComplete?.(recheck);
    const unsubError = window.electron.onDownloadError?.(recheck);
    return () => {
      canceled = true;
      clearTimeout(timeout);
      if (typeof unsubProgress === "function") unsubProgress();
      if (typeof unsubComplete === "function") unsubComplete();
      if (typeof unsubError === "function") unsubError();
    };
  }, [settings?.downloadDirectory, location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      const newSize = localStorage.getItem("navSize");
      if (newSize) {
        setSize(parseFloat(newSize));
      }
    };
    /**  @param {KeyboardEvent} event */
    const handleCtrlNavigation = event => {
      if (!(event.ctrlKey || event.metaKey)) return;
      switch (event.key) {
        case "1": {
          navigate("/");
          break;
        }
        case "2": {
          navigate("/search");
          break;
        }
        case "3": {
          navigate("/library");
          break;
        }
        case "4": {
          navigate("/downloads");
          break;
        }
        case "5": {
          navigate("/profile");
          break;
        }
        case "6": {
          navigate("/settings");
          break;
        }
      }
    };

    window.addEventListener("keydown", handleCtrlNavigation);
    window.addEventListener("navResize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleCtrlNavigation);
      window.removeEventListener("navResize", handleResize);
    };
  }, []);

  const compactEnabled = settings.compactDockOnScroll !== false;
  const [scrolled, setScrolled] = useState(false);
  const [dockEngaged, setDockEngaged] = useState(false);
  useEffect(() => {
    setScrolled(false);
    if (!compactEnabled) return undefined;
    // Some pages (Ascend) scroll inside their own container instead of the window,
    // so listen in the capture phase and follow whichever large area is scrolling.
    // Either direction counts: the dock stays compact until the page is back near the top
    const handleScroll = event => {
      const target = event.target;
      const isPage = target === document || target === document.documentElement;
      // Ignore small scrollers like dropdowns and carousels
      if (!isPage && target.clientHeight < window.innerHeight * 0.5) return;
      // Dialogs and popovers scroll over the page, not as it
      if (
        !isPage &&
        target.closest?.(
          '[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]'
        )
      )
        return;
      const y = isPage ? window.scrollY : target.scrollTop;
      setScrolled(y >= COMPACT_MIN_SCROLL);
    };
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, [compactEnabled, location.pathname]);
  // The welcome tour folds the dock in and out to show this off, setting or not
  const [compactPreview, setCompactPreview] = useState(false);
  useEffect(() => {
    const handlePreview = event => setCompactPreview(event.detail === true);
    window.addEventListener("navCompactPreview", handlePreview);
    return () => window.removeEventListener("navCompactPreview", handlePreview);
  }, []);
  // Hovering or tabbing into the dock opens it back up
  const compact = compactPreview || (compactEnabled && scrolled && !dockEngaged);
  // Stays parked while hovered, so the opened dock doesn't slide out from under the cursor
  const parkRight = isGamePage && compactEnabled && scrolled;

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex select-none justify-center"
      style={{ padding: NAVIGATION_EDGE_PADDING_PX }}
    >
      {/* Scrolled on a game page, the compact dock glides to the bottom-right corner,
          clear of the content. A transform percentage is the element's own width, so
          this lands its right edge at the window's padding while it shrinks */}
      <div
        className="transition-transform duration-500"
        style={{
          transform: parkRight
            ? `translateX(calc(50vw - 50% - ${NAVIGATION_EDGE_PADDING_PX}px))`
            : "translateX(0)",
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          className="nav-container relative max-w-xl"
          style={{
            ...navStyle,
            transformOrigin: parkRight ? "bottom right" : "bottom center",
          }}
          data-tour="navigation"
        >
          {/* data-boot-dock: slides up from the window edge as the boot logo lands (app.css) */}
          <motion.div
            className="pointer-events-auto relative mx-auto flex w-fit items-center justify-center rounded-[18px] border border-border shadow-lg backdrop-blur-lg"
            initial={false}
            animate={compact ? DOCK_SHELL_COMPACT : DOCK_SHELL_EXPANDED}
            transition={DOCK_SPRING}
            onPointerEnter={() => setDockEngaged(true)}
            onPointerLeave={() => setDockEngaged(false)}
            onFocus={() => setDockEngaged(true)}
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setDockEngaged(false);
            }}
            data-boot-dock
            style={{
              backgroundColor:
                "rgb(var(--color-nav-background, var(--color-background)) / 0.8)",
            }}
          >
            <div
              className="pointer-events-auto absolute -left-2 -top-2 h-4 w-4 cursor-nw-resize"
              onMouseDown={e => handleMouseDown(e, true)}
            />
            <div
              className="pointer-events-auto absolute -right-2 -top-2 h-4 w-4 cursor-ne-resize"
              onMouseDown={e => handleMouseDown(e, false)}
            />

            {/* Pages that are switched on or off (debrid, workshop) grow into the dock
              and shrink back out, pushing their neighbours aside as they go */}
            <AnimatePresence initial={false}>
              {navItems.map(item =>
                item.hidden ? null : item.separator ? (
                  <motion.div
                    key={item.path}
                    className="w-px shrink-0 rounded-full bg-border/50"
                    initial={false}
                    animate={
                      compact
                        ? {
                            height: NAVIGATION_COMPACT_SEPARATOR_HEIGHT_PX,
                            marginLeft: 2,
                            marginRight: 2,
                          }
                        : {
                            height: NAVIGATION_EXPANDED_SEPARATOR_HEIGHT_PX,
                            marginLeft: 0,
                            marginRight: 0,
                          }
                    }
                    transition={DOCK_SPRING}
                  />
                ) : (
                  <motion.div
                    key={item.path}
                    className="relative flex shrink-0 items-center justify-center"
                    initial={{
                      ...DOCK_ITEM_HIDDEN,
                      height: compact
                        ? NAVIGATION_COMPACT_ITEM_HEIGHT_PX
                        : NAVIGATION_EXPANDED_ITEM_HEIGHT_PX,
                    }}
                    animate={
                      compact ? dockItemCompact(isActive(item.path)) : DOCK_ITEM_SHOWN
                    }
                    exit={{
                      ...DOCK_ITEM_HIDDEN,
                      height: compact
                        ? NAVIGATION_COMPACT_ITEM_HEIGHT_PX
                        : NAVIGATION_EXPANDED_ITEM_HEIGHT_PX,
                    }}
                    transition={DOCK_ITEM_TRANSITION}
                  >
                    <motion.span
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br ${item.color} ${
                        compact && item.icon === CircleArrowDown && downloadCount > 0
                          ? "animate-pulse"
                          : ""
                      }`}
                      initial={false}
                      animate={{
                        opacity: compact ? (isActive(item.path) ? 1 : 0.6) : 0,
                      }}
                      // The dots and icons overlap as they swap, so the dock never
                      // looks empty halfway through
                      transition={{ duration: compact ? 0.3 : 0.4, ease: "easeInOut" }}
                    />
                    <motion.div
                      className={`flex shrink-0 ${compact ? "pointer-events-none" : ""}`}
                      initial={false}
                      animate={{ opacity: compact ? 0 : 1, scale: compact ? 0.6 : 1 }}
                      transition={{ duration: compact ? 0.2 : 0.3, ease: "easeOut" }}
                    >
                      <Link
                        to={item.path}
                        onClick={() => {
                          if (item.path !== location.pathname) setPendingPath(item.path);
                        }}
                        // Fetch Ascend's data on the way to the click
                        onPointerEnter={
                          item.path === "/ascend" ? prefetchAscendData : undefined
                        }
                        className={`group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 ${
                          isActive(item.path)
                            ? "z-10 scale-110 bg-primary text-background"
                            : "z-0 scale-100 text-muted-foreground hover:z-10 hover:scale-110 hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        <div
                          className={`absolute inset-0 rounded-xl bg-gradient-to-br ${item.color} transition-opacity duration-300 ${isActive(item.path) ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        />
                        {/* The gradient layer above fades the active colour in; a gradient set
                            here would swap instantly, since background images can't transition */}
                        <div
                          className={`relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors duration-300 ${
                            isActive(item.path) ? "" : "group-hover:bg-white/10"
                          }`}
                        >
                          <item.icon className="h-5 w-5" />
                          {item.icon === CircleArrowDown && downloadCount > 0 && (
                            <div className="text-primary-foreground absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-primary/30 bg-primary/90 px-1 text-[10px] font-semibold shadow-lg shadow-primary/25 backdrop-blur-sm">
                              {downloadCount}
                            </div>
                          )}
                          {item.path === "/ascend" && ascendNotificationCount > 0 && (
                            <div className="text-primary-foreground absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-primary/30 bg-primary/90 px-1 text-[10px] font-semibold shadow-lg shadow-primary/25 backdrop-blur-sm">
                              {ascendNotificationCount > 99
                                ? "99+"
                                : ascendNotificationCount}
                            </div>
                          )}
                        </div>
                        <div className="pointer-events-none absolute -top-10 translate-y-2 transform whitespace-nowrap rounded-lg border border-border bg-background/95 px-3 py-1.5 text-sm font-medium text-foreground opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                          {item.label}
                          <ChevronRight className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-90 transform text-border" />
                        </div>
                      </Link>
                    </motion.div>
                  </motion.div>
                )
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
});

Navigation.displayName = "Navigation";

export default Navigation;
