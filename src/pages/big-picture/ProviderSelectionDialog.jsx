import { useState, useRef, useEffect, useCallback } from "react";
import { Download, X } from "lucide-react";
import { getControllerButtons, getButtonBadgeClass } from "./controller";
import { getGamepadInput } from "./gamepad";

// Provider Selection Dialog
const ProviderSelectionDialog = ({
  isOpen,
  game,
  providers,
  onClose,
  onConfirm,
  t,
  controllerType,
}) => {
  const [selectedProvider, setSelectedProvider] = useState(0);
  const [focusedSection, setFocusedSection] = useState("providers"); // "providers" or "cancel"
  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);
  const buttons = getControllerButtons(controllerType);

  useEffect(() => {
    if (isOpen) {
      setSelectedProvider(0);
      setFocusedSection("providers");
      const timer = setTimeout(() => setCanInput(true), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleInput = useCallback(
    action => {
      if (!canInput) return;

      if (action === "DOWN") {
        if (focusedSection === "providers") {
          setFocusedSection("cancel");
        }
      } else if (action === "UP") {
        if (focusedSection === "cancel") {
          setFocusedSection("providers");
        }
      } else if (action === "LEFT") {
        if (focusedSection === "providers") {
          setSelectedProvider(prev => Math.max(0, prev - 1));
        }
      } else if (action === "RIGHT") {
        if (focusedSection === "providers") {
          setSelectedProvider(prev => Math.min(providers.length - 1, prev + 1));
        }
      } else if (action === "CONFIRM") {
        console.log("[PROVIDER DIALOG] CONFIRM - focusedSection:", focusedSection);
        if (focusedSection === "providers") {
          // Directly start download with selected provider
          console.log(
            "[PROVIDER DIALOG] Starting download with provider:",
            providers[selectedProvider]
          );
          setCanInput(false);
          onConfirm(providers[selectedProvider]);
        } else if (focusedSection === "cancel") {
          // Cancel button
          console.log("[PROVIDER DIALOG] Closing dialog");
          setCanInput(false);
          onClose();
        }
      } else if (action === "BACK") {
        if (focusedSection === "cancel") {
          setFocusedSection("providers");
        } else {
          onClose();
        }
      }
    },
    [canInput, selectedProvider, focusedSection, providers, onConfirm, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = e => {
      e.preventDefault();
      e.stopPropagation();
      const keyMap = {
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        Enter: "CONFIRM",
        Escape: "BACK",
      };
      if (keyMap[e.key]) handleInput(keyMap[e.key]);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleInput, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let animationFrameId;
    const loop = () => {
      const gp = getGamepadInput();
      if (gp && canInput) {
        const now = Date.now();
        if (now - lastInputTime.current > 200) {
          if (gp.up) {
            handleInput("UP");
            lastInputTime.current = now;
          } else if (gp.down) {
            handleInput("DOWN");
            lastInputTime.current = now;
          } else if (gp.left) {
            handleInput("LEFT");
            lastInputTime.current = now;
          } else if (gp.right) {
            handleInput("RIGHT");
            lastInputTime.current = now;
          } else if (gp.a) {
            handleInput("CONFIRM");
            lastInputTime.current = now;
          } else if (gp.b) {
            handleInput("BACK");
            lastInputTime.current = now;
          }
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [handleInput, canInput, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[30000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-8 max-w-3xl rounded-2xl border-2 border-primary/30 bg-card p-8 shadow-2xl animate-in fade-in-50 zoom-in-95">
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-full bg-primary/20 p-3">
            <Download className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">
            {t("bigPicture.selectProvider")}
          </h2>
        </div>
        <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
          {t("bigPicture.selectProviderMessage", { game: game.game })}
        </p>
        <div className="mb-8 flex gap-4">
          {providers.map((provider, idx) => (
            <button
              key={provider}
              onClick={() => setSelectedProvider(idx)}
              className={`flex flex-1 items-center justify-center gap-3 rounded-xl px-6 py-4 text-lg font-bold uppercase transition-all duration-150 ${
                focusedSection === "providers" && idx === selectedProvider
                  ? "scale-105 bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/30"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {provider}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <button
            onClick={onClose}
            className={`flex flex-1 items-center justify-center gap-3 rounded-xl px-6 py-4 text-lg font-bold transition-all ${
              focusedSection === "cancel"
                ? "scale-105 bg-muted text-foreground ring-4 ring-muted-foreground/30"
                : "bg-muted text-foreground hover:bg-muted/80"
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
              {buttons.left} / {buttons.right}
            </span>
            {t("bigPicture.navigate")}
          </span>
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

export { ProviderSelectionDialog };
