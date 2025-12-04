import React, { useState, useEffect, memo, useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import {
  Home,
  Search,
  Library,
  Settings2,
  Download,
  ChevronRight,
  Package,
  User,
  ServerIcon,
  ArrowBigDown,
  CircleArrowDown,
} from "lucide-react";

const Navigation = memo(({ items }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [hoveredItem, setHoveredItem] = useState(null);
  const [size, setSize] = useState(() => {
    const savedSize = localStorage.getItem("navSize");
    return savedSize ? parseFloat(savedSize) : 100;
  });
  const [downloadCount, setDownloadCount] = useState(0);

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

  const handleMouseEnter = useCallback(item => {
    setHoveredItem(item.path);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredItem(null);
  }, []);

  const navStyle = useMemo(
    () => ({
      transform: `scale(${size / 100})`,
      transformOrigin: "bottom center",
    }),
    [size]
  );

  const isActive = useCallback(
    path => {
      if (path === "/search" && location.pathname === "/download") {
        return true;
      }
      if (
        path === "/settings" &&
        [
          "/settings",
          "/extralanguages",
          "/sidecaranddependencies",
          "/localrefresh",
        ].includes(location.pathname)
      ) {
        return true;
      }
      if (
        path === "/library" &&
        (location.pathname === "/gamescreen" ||
          location.pathname.startsWith("/folderview"))
      ) {
        return true;
      }
      return location.pathname === path;
    },
    [location.pathname]
  );

  const navItems = useMemo(() => {
    const items = [
      {
        path: "/",
        label: t("common.home"),
        icon: Home,
        color: "from-blue-500 to-cyan-400",
      },
      {
        path: "/search",
        label: t("common.search"),
        icon: Search,
        color: "from-purple-500 to-pink-400",
      },
      {
        path: "/library",
        label: t("common.library"),
        icon: Library,
        color: "from-green-500 to-emerald-400",
      },
      {
        path: "/downloads",
        label: t("common.downloads"),
        icon: CircleArrowDown,
        color: "from-orange-500 to-amber-400",
      },
      {
        path: "/torboxdownloads",
        label: t("common.torboxDownloads"),
        icon: ServerIcon,
        hidden: settings.torboxApiKey === "",
        color: "from-orange-500 to-amber-400",
      },
    ];

    items.push({
      path: "/profile",
      label: t("common.profile"),
      icon: User,
      color: "from-red-500 to-pink-400",
    });

    if (settings.viewWorkshopPage) {
      items.push({
        path: "/workshopdownloader",
        label: t("common.workshopDownloader"),
        icon: Package,
        color: "from-rose-500 to-red-400",
      });
    }

    items.push({
      path: "/settings",
      label: t("common.preferences"),
      icon: Settings2,
      color: "from-slate-500 to-gray-400",
    });

    return items;
  }, [t, settings.viewWorkshopPage, settings.torboxApiKey]);

  useEffect(() => {
    const checkDownloaderStatus = async () => {
      try {
        const games = await window.electron.getGames();
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
        setDownloadCount(downloadingGames.length);
      } catch (error) {
        console.error("Error checking downloading games:", error);
      }
    };

    // Check immediately
    checkDownloaderStatus();

    // Then check every second
    const interval = setInterval(() => {
      checkDownloaderStatus();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 select-none p-6">
      <div className="nav-container relative mx-auto max-w-xl" style={navStyle}>
        <div className="pointer-events-auto relative flex items-center justify-center gap-2 rounded-2xl border border-border bg-background/80 p-3 shadow-lg backdrop-blur-lg">
          <div
            className="pointer-events-auto absolute -left-2 -top-2 h-4 w-4 cursor-nw-resize"
            onMouseDown={e => handleMouseDown(e, true)}
          />
          <div
            className="pointer-events-auto absolute -right-2 -top-2 h-4 w-4 cursor-ne-resize"
            onMouseDown={e => handleMouseDown(e, false)}
          />

          {navItems.map((item, index) =>
            item.hidden ? null : (
              <React.Fragment key={item.path}>
                <Link
                  to={item.path}
                  onMouseEnter={() => handleMouseEnter(item)}
                  onMouseLeave={handleMouseLeave}
                  className={`group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 ${
                    isActive(item.path)
                      ? "z-10 scale-110 bg-primary text-background"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  } ${hoveredItem === item.path ? "z-10 scale-110" : "z-0 scale-100"} `}
                >
                  <div
                    className={`absolute inset-0 rounded-xl bg-gradient-to-br ${item.color} opacity-0 ${isActive(item.path) || hoveredItem === item.path ? "opacity-100" : ""} transition-opacity duration-300`}
                  />
                  <div
                    className={`relative flex h-12 w-12 items-center justify-center rounded-lg transition-all duration-200 ${
                      isActive(item.path)
                        ? "bg-gradient-to-br " + item.color
                        : "hover:bg-white/10"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.icon === Download && downloadCount > 0 && (
                      <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                        <span className="mb-0.5">{downloadCount}</span>
                      </div>
                    )}
                  </div>
                  <div
                    className={`absolute -top-10 transform whitespace-nowrap rounded-lg border border-border bg-background/95 px-3 py-1.5 text-sm font-medium text-foreground transition-all duration-300 ${
                      hoveredItem === item.path
                        ? "translate-y-0 opacity-100"
                        : "pointer-events-none translate-y-2 opacity-0"
                    }`}
                  >
                    {item.label}
                    <ChevronRight className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-90 transform text-border" />
                  </div>
                </Link>
                {index === (settings.torboxApiKey === "" ? 3 : 4) && (
                  <div className="h-8 w-px bg-border/50" />
                )}
              </React.Fragment>
            )
          )}
        </div>
      </div>
    </div>
  );
});

Navigation.displayName = "Navigation";

export default Navigation;
