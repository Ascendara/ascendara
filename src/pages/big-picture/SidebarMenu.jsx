import { Home, Grid, Library, Download, Settings, LogOut, Power, Gamepad2, User } from "lucide-react";

// Side menu
const SidebarMenu = ({ isOpen, selectedIndex, t, onItemClick, buttons }) => {
  const items = [
    { icon: Home, label: t("bigPicture.home"), action: "home" },
    { icon: Grid, label: t("bigPicture.library"), action: "library" },
    { icon: Library, label: t("bigPicture.catalog"), action: "catalog" },
    { icon: Download, label: t("bigPicture.downloads"), action: "downloads" },
    { icon: Settings, label: t("bigPicture.settings"), action: "settings" },
    { icon: LogOut, label: t("bigPicture.exitBigPicture"), action: "exit_bp" },
    {
      icon: Power,
      label: t("bigPicture.closeAscendara"),
      action: "quit_app",
      danger: true,
    },
    { icon: Gamepad2, label: "Retro", action: "retro" },
    { icon: User, label: "Profile", action: "profile" },
  ];
  return (
    <div
      className={`fixed inset-y-0 left-0 z-[10000] flex w-[min(420px,90vw)] overflow-y-auto transform flex-col bg-card p-8 shadow-2xl transition-transform duration-200 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      <h2 className="mb-4 border-b border-border pb-4 text-2xl font-light tracking-widest text-primary">
        {t("bigPicture.menu")}
      </h2>
      <div className="flex flex-col gap-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            onClick={() => onItemClick && onItemClick(idx)}
            className={`flex cursor-pointer items-center gap-4 rounded-lg p-4 transition-all duration-150 ${selectedIndex === idx ? (item.danger ? "scale-105 bg-red-600 text-secondary shadow-lg shadow-red-900/50" : "scale-105 bg-white text-black shadow-lg") : "text-slate-400 hover:bg-muted"} ${item.action === "exit_bp" ? "mt-auto" : ""}`}
          >
            <item.icon className="h-6 w-6" />
            <span className="font-bold tracking-wide">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto text-center text-xs uppercase tracking-wider text-muted-foreground">
        Press {buttons.cancel} to close
      </div>
    </div>
  );
};

export { SidebarMenu };
