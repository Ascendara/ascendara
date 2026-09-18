import { Home, Grid, SearchIcon, Download, LogOut } from "lucide-react";
import { getButtonBadgeClass } from "./controller";

// Persistent sidebar for home screen navigation
const HomeSidebar = ({
  selectedIndex,
  t,
  onItemClick,
  isVisible,
  buttons,
  controllerType,
}) => {
  const items = [
    { icon: Home, label: t("bigPicture.home"), action: "home" },
    { icon: Grid, label: t("bigPicture.library"), action: "library" },
    { icon: SearchIcon, label: t("bigPicture.catalog"), action: "catalog" },
    { icon: Download, label: t("bigPicture.downloads"), action: "downloads" },
    { icon: LogOut, label: t("bigPicture.exitBigPicture"), action: "exit_bp" },
  ];

  if (!isVisible) return null;

  return (
    <div className="fixed left-8 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-3">
      {items.map((item, idx) => (
        <div
          key={idx}
          onClick={() => onItemClick && onItemClick(idx)}
          className="group relative flex cursor-pointer items-center transition-all duration-200"
        >
          {/* Icon container */}
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-200 ${
              selectedIndex === idx
                ? "scale-110 bg-white shadow-[0_0_30px_rgba(255,255,255,0.5)]"
                : "bg-white/10 backdrop-blur-sm group-hover:scale-105 group-hover:bg-white/20"
            }`}
          >
            <item.icon
              className={`h-6 w-6 transition-colors duration-200 ${
                selectedIndex === idx ? "text-black" : "text-primary"
              }`}
            />
          </div>

          {/* Label tooltip - appears on hover or selection */}
          <div
            className={`absolute left-16 whitespace-nowrap rounded-lg bg-white px-4 py-2 text-sm font-bold text-black shadow-xl transition-all duration-200 ${
              selectedIndex === idx ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            {item.label}
            {/* Arrow pointing to icon */}
            <div className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-white"></div>
          </div>

          {/* Selection indicator bar */}
          {selectedIndex === idx && (
            <div className="absolute -left-2 h-8 w-1 rounded-full bg-primary shadow-[0_0_15px_hsl(var(--primary)/0.8)]" />
          )}
        </div>
      ))}

      {/* Navigation indicators - Always visible */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <span
          className={`flex h-8 w-8 items-center justify-center ${getButtonBadgeClass(controllerType)} bg-white/90 text-xs font-bold text-black shadow-lg`}
        >
          {buttons.up || "↑"}
        </span>
        <span className="text-xs font-semibold text-primary">
          {t("bigPicture.navigate")}
        </span>
        <span
          className={`flex h-8 w-8 items-center justify-center ${getButtonBadgeClass(controllerType)} bg-white/90 text-xs font-bold text-black shadow-lg`}
        >
          {buttons.down || "↓"}
        </span>
      </div>
    </div>
  );
};

export { HomeSidebar };
