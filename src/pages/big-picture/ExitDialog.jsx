import { useState, useEffect, useCallback } from "react";
import { LogOut, X } from "lucide-react";
import { getControllerButtons, getButtonBadgeClass } from "./controller";
import { useControllerInput } from "./useControllerInput";

// Exit Dialog Component (for exiting to download)
const ExitDialog = ({ isOpen, onClose, onConfirm, t, controllerType }) => {
  const [selectedButton, setSelectedButton] = useState(0);
  const buttons = getControllerButtons(controllerType);

  useEffect(() => {
    if (isOpen) {
      setSelectedButton(0);
    }
  }, [isOpen]);

  const handleInput = useCallback(
    action => {
      if (action === "LEFT") setSelectedButton(0);
      else if (action === "RIGHT") setSelectedButton(1);
      else if (action === "CONFIRM") {
        if (selectedButton === 0) onConfirm();
        else onClose();
      } else if (action === "BACK") onClose();
    },
    [selectedButton, onConfirm, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = e => {
      if (e.repeat && !e.key.startsWith("Arrow")) return;
      e.preventDefault();
      e.stopPropagation();
      const keyMap = {
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        Enter: "CONFIRM",
        Escape: "BACK",
      };
      if (keyMap[e.key]) handleInput(keyMap[e.key]);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleInput, isOpen]);

  useControllerInput(handleInput, {
    priority: 30,
    enabled: isOpen,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[30000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-8 max-w-2xl rounded-2xl border-2 border-primary/30 bg-card p-8 shadow-2xl animate-in fade-in-50 zoom-in-95">
        <div className="mb-6 flex items-center gap-4">
          <h2 className="text-3xl font-bold text-foreground">
            {t("bigPicture.exitToDownload")}
          </h2>
        </div>
        <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
          {t("bigPicture.exitToDownloadMessage")}
        </p>
        <div className="flex gap-4">
          <button
            onClick={onConfirm}
            className={`flex flex-1 items-center justify-center gap-3 rounded-xl px-6 py-4 text-lg font-bold transition-all duration-150 ${
              selectedButton === 0
                ? "scale-105 bg-primary text-foreground shadow-lg shadow-primary/30"
                : "bg-muted text-muted-foreground hover:bg-muted"
            }`}
          >
            <LogOut className="h-5 w-5" />
            {t("bigPicture.exitBigPicture")}
          </button>
          <button
            onClick={onClose}
            className={`flex flex-1 items-center justify-center gap-3 rounded-xl px-6 py-4 text-lg font-bold transition-all duration-150 ${
              selectedButton === 1
                ? "scale-105 bg-slate-600 text-foreground shadow-lg"
                : "bg-muted text-muted-foreground hover:bg-muted"
            }`}
          >
            <X className="h-5 w-5" />
            {t("bigPicture.cancel")}
          </button>
        </div>
        <div className="mt-6 flex justify-center gap-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">
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

export { ExitDialog };
