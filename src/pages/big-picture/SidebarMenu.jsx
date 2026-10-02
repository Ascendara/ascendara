import { RefreshCw, LogOut, Power, Gamepad2 } from "lucide-react";
import { useEffect, useRef } from "react";

export const sidebarItems = [
  { icon: Gamepad2, label: "bigPicture.controllerAndKeyboard", action: "controller" },
  { icon: RefreshCw, label: "bigPicture.refreshGameLibrary", action: "refresh" },
  { icon: LogOut, label: "bigPicture.returnToDesktop", action: "exit_bp" },
  { icon: Power, label: "bigPicture.powerOptions", action: "power" },
];

// Side menu
const SidebarMenu = ({ isOpen, selectedIndex, t, onItemClick, onSelectIndex, buttons }) => {
  const root = useRef(null);
  useEffect(() => {
    if (isOpen) root.current?.querySelectorAll("button")[selectedIndex]?.focus();
  }, [isOpen, selectedIndex]);
  return (
    <div
      ref={root}
      aria-hidden={!isOpen}
      inert={!isOpen ? true : undefined}
      className={`fixed inset-y-0 left-0 z-[10000] flex w-[min(420px,90vw)] overflow-y-auto transform flex-col bg-card p-8 shadow-2xl transition-transform duration-200 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      <h2 className="mb-4 border-b border-border pb-4 text-2xl font-light tracking-widest text-primary">
        {t("bigPicture.menu")}
      </h2>
      <div className="flex flex-col gap-2">
        {sidebarItems.map((item, idx) => (
          <button
            type="button"
            key={item.action}
            tabIndex={isOpen && selectedIndex === idx ? 0 : -1}
            onFocus={() => onSelectIndex?.(idx)}
            onClick={() => onItemClick?.(item.action)}
            className={`flex cursor-pointer items-center gap-4 rounded-lg p-4 transition-all duration-150 ${selectedIndex === idx ? "scale-105 bg-white text-black shadow-lg" : "text-slate-400 hover:bg-muted"} ${item.action === "exit_bp" ? "mt-auto" : ""}`}
          >
            <item.icon className="h-6 w-6" />
            <span className="font-bold tracking-wide">{t(item.label)}</span>
          </button>
        ))}
      </div>
      <div className="mt-auto text-center text-xs uppercase tracking-wider text-muted-foreground">
        {t("bigPicture.pressToClose", { button: buttons.cancel })}
      </div>
    </div>
  );
};

export { SidebarMenu };
