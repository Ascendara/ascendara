import { useState, useEffect, useCallback } from "react";
import { Folder, HardDrive } from "lucide-react";
import { formatBytes } from "@/services/app/systemHealthService";
import { getControllerButtons, getButtonBadgeClass } from "./controller";
import { useControllerInput } from "./useControllerInput";

// Picks which games directory a download goes to, like the Download page does
// when more than one directory is set. directories: [{ path, index }]
const InstallLocationDialog = ({
  isOpen,
  directories,
  onSelect,
  onClose,
  t,
  controllerType,
}) => {
  const [selected, setSelected] = useState(0);
  const [freeSpace, setFreeSpace] = useState({});
  const buttons = getControllerButtons(controllerType);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(0);
    let active = true;
    window.electron
      .getDriveSpace(directories.find(dir => dir.index === 0)?.path)
      .then(space => {
        if (!active) return;
        const byPath = {};
        for (const entry of space?.directories || []) {
          if (!entry.error && entry.freeSpace > 0) byPath[entry.path] = entry.freeSpace;
        }
        setFreeSpace(byPath);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, directories]);

  const handleInput = useCallback(
    action => {
      if (action === "UP") setSelected(prev => Math.max(0, prev - 1));
      else if (action === "DOWN")
        setSelected(prev => Math.min(directories.length - 1, prev + 1));
      else if (action === "CONFIRM") onSelect(directories[selected].index);
      else if (action === "BACK" || action === "MENU") onClose();
    },
    [directories, selected, onSelect, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = e => {
      if (e.repeat && !e.key.startsWith("Arrow")) return;
      const keyMap = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        Enter: "CONFIRM",
        Escape: "BACK",
        Backspace: "BACK",
      };
      if (!keyMap[e.key]) return;
      e.preventDefault();
      e.stopPropagation();
      handleInput(keyMap[e.key]);
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleInput, isOpen]);

  useControllerInput(handleInput, { priority: 30, enabled: isOpen });

  if (!isOpen) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[30000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-8 w-full max-w-3xl rounded-2xl border-2 border-primary/30 bg-card p-8 shadow-2xl animate-in fade-in-50 zoom-in-95">
        <h2 className="mb-3 text-3xl font-bold text-foreground">
          {t("bigPicture.installLocationTitle")}
        </h2>
        <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
          {t("bigPicture.installLocationMessage")}
        </p>
        <div className="mb-2 flex max-h-[50vh] flex-col gap-3 overflow-y-auto p-1">
          {directories.map(({ path, index }, position) => {
            const focused = position === selected;
            const free = freeSpace[path];
            return (
              <button
                key={`${index}-${path}`}
                onClick={() => onSelect(index)}
                onMouseEnter={() => setSelected(position)}
                className={`flex items-center gap-4 rounded-xl px-6 py-4 text-left transition-all duration-150 ${
                  focused
                    ? "bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/30"
                    : "bg-muted text-foreground hover:bg-muted/80"
                }`}
              >
                {index === 0 ? (
                  <HardDrive className="h-6 w-6 shrink-0" />
                ) : (
                  <Folder className="h-6 w-6 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate text-lg font-bold">{path}</span>
                {index === 0 && (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      focused ? "bg-secondary/20" : "bg-primary/20 text-primary"
                    }`}
                  >
                    {t("bigPicture.installLocationDefault")}
                  </span>
                )}
                {free !== undefined && (
                  <span
                    className={`shrink-0 text-sm font-medium ${
                      focused ? "text-secondary/80" : "text-muted-foreground"
                    }`}
                  >
                    {t("bigPicture.installLocationFree", { size: formatBytes(free) })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex justify-center gap-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span>↑ / ↓ {t("bigPicture.navigate")}</span>
          <span>
            <span
              className={`mr-2 ${getButtonBadgeClass(controllerType)} bg-primary px-2 py-1 text-secondary`}
            >
              {buttons.confirm}
            </span>
            {t("bigPicture.confirm")}
          </span>
          <span>
            <span
              className={`mr-2 ${getButtonBadgeClass(controllerType)} border border-border bg-muted px-2 py-1 text-muted-foreground`}
            >
              {buttons.cancel}
            </span>
            {t("bigPicture.cancel")}
          </span>
        </div>
      </div>
    </div>
  );
};

export { InstallLocationDialog };
