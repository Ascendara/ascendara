import { useState, useRef, useEffect, useCallback } from "react";
import { Gamepad2, KeyboardIcon, SearchIcon, Settings, Check } from "lucide-react";
import { getControllerButtons, getButtonBadgeClass } from "./controller";
import { getGamepadInput } from "./gamepad";

// Big Picture Settings Dialog
const BigPictureSettingsDialog = ({
  isOpen,
  onClose,
  t,
  currentType,
  onTypeChange,
  currentKeyboardLayout,
  onKeyboardLayoutChange,
  controllerType,
}) => {
  const [selectedOption, setSelectedOption] = useState(0);
  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);
  const buttons = getControllerButtons(controllerType);

  const settingsOptions = [
    {
      type: "controller",
      value: "xbox",
      label: t("bigPicture.controllerTypeXbox"),
      icon: Gamepad2,
      category: t("bigPicture.controllerType"),
    },
    {
      type: "controller",
      value: "playstation",
      label: t("bigPicture.controllerTypePlayStation"),
      icon: Gamepad2,
      category: t("bigPicture.controllerType"),
    },
    {
      type: "controller",
      value: "generic",
      label: t("bigPicture.controllerTypeGeneric"),
      icon: Gamepad2,
      category: t("bigPicture.controllerType"),
    },
    {
      type: "controller",
      value: "keyboard",
      label: t("bigPicture.keyboard"),
      icon: KeyboardIcon,
      category: t("bigPicture.controllerType"),
    },
    {
      type: "keyboard",
      value: "qwerty",
      label: t("bigPicture.keyboardLayoutQwerty"),
      icon: SearchIcon,
      category: t("bigPicture.keyboardLayout"),
    },
    {
      type: "keyboard",
      value: "azerty",
      label: t("bigPicture.keyboardLayoutAzerty"),
      icon: SearchIcon,
      category: t("bigPicture.keyboardLayout"),
    },
  ];

  useEffect(() => {
    if (isOpen) {
      const currentControllerIndex = settingsOptions.findIndex(
        opt => opt.type === "controller" && opt.value === currentType
      );
      setSelectedOption(currentControllerIndex >= 0 ? currentControllerIndex : 0);
      const timer = setTimeout(() => setCanInput(true), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, currentType]);

  const handleInput = useCallback(
    action => {
      if (!canInput) return;

      if (action === "UP") {
        setSelectedOption(p => Math.max(0, p - 1));
      } else if (action === "DOWN") {
        setSelectedOption(p => Math.min(settingsOptions.length - 1, p + 1));
      } else if (action === "CONFIRM") {
        const selected = settingsOptions[selectedOption];
        if (selected.type === "controller") {
          onTypeChange(selected.value);
        } else if (selected.type === "keyboard") {
          onKeyboardLayoutChange(selected.value);
        }
        onClose();
      } else if (action === "BACK") {
        onClose();
      }
    },
    [
      canInput,
      selectedOption,
      settingsOptions,
      onTypeChange,
      onKeyboardLayoutChange,
      onClose,
    ]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = e => {
      e.preventDefault();
      e.stopPropagation();
      const keyMap = {
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

  let lastCategory = null;

  return (
    <div className="fixed inset-0 z-[30000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-8 max-w-2xl rounded-2xl border-2 border-primary/30 bg-card p-8 shadow-2xl animate-in fade-in-50 zoom-in-95">
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-full bg-primary/20 p-3">
            <Settings className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">
            {t("bigPicture.bigPictureSettings")}
          </h2>
        </div>
        <div className="mb-8 space-y-3">
          {settingsOptions.map((option, idx) => {
            const Icon = option.icon;
            const isSelected = idx === selectedOption;
            const isCurrent =
              (option.type === "controller" && option.value === currentType) ||
              (option.type === "keyboard" && option.value === currentKeyboardLayout);

            const showCategoryHeader = option.category !== lastCategory;
            lastCategory = option.category;

            return (
              <div key={`${option.type}-${option.value}`}>
                {showCategoryHeader && (
                  <p className="mb-2 mt-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    {option.category}
                  </p>
                )}
                <div
                  className={`flex items-center gap-4 rounded-xl p-4 transition-all duration-150 ${
                    isSelected
                      ? "scale-105 bg-primary text-secondary shadow-lg shadow-primary/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="flex-1 text-lg font-bold">{option.label}</span>
                  {isCurrent && <Check className="h-5 w-5 text-green-400" />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-center gap-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">
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

export { BigPictureSettingsDialog };
