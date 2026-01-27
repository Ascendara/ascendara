import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  LogOut,
  Power,
  Grid,
  Download,
  Home,
  Info,
  Check,
  Search,
  X,
  Delete,
  Coffee,
  Library,
  MousePointer,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Loader,
  Pause,
  Play,
  Wifi,
  FolderOpen,
  Trash2,
  Clock,
  Settings,
  Gamepad2,
  SearchIcon,
  Cloud,
  Smartphone,
  Puzzle,
  Zap,
  RefreshCw,
  Gift,
  Star,
  Circle,
  Square,
  Triangle,
  KeyboardIcon,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import gameService from "@/services/gameService";
import steamService from "@/services/gameInfoService";
import nexusModsService from "@/services/nexusModsService";
import flingTrainerService from "@/services/flingTrainerService";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useImageLoader } from "@/hooks/useImageLoader";
import recentGamesService from "@/services/recentGamesService";
import { sanitizeText } from "@/lib/utils";
import * as torboxService from "@/services/torboxService";

// UTILS
const formatBytes = (bytes, decimals = 2) => {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

// PlayStation button component
const PSButton = ({ type, className = "" }) => {
  const buttonStyles = "inline-flex items-center justify-center";

  switch (type) {
    case "cross":
      return <X className={`${buttonStyles} ${className}`} strokeWidth={3} />;
    case "circle":
      return <Circle className={`${buttonStyles} ${className}`} strokeWidth={2.5} />;
    case "square":
      return <Square className={`${buttonStyles} ${className}`} strokeWidth={2.5} />;
    case "triangle":
      return <Triangle className={`${buttonStyles} ${className}`} strokeWidth={2.5} />;
    default:
      return null;
  }
};

// Get controller button labels based on controller type
const getControllerButtons = (controllerType = "xbox") => {
  const buttonMaps = {
    xbox: {
      confirm: "A",
      cancel: "B",
      delete: "X",
      space: "Y",
      menu: "Start",
    },
    playstation: {
      confirm: <PSButton type="cross" className="h-4 w-4" />,
      cancel: <PSButton type="circle" className="h-4 w-4" />,
      delete: <PSButton type="square" className="h-4 w-4" />,
      space: <PSButton type="triangle" className="h-4 w-4" />,
      menu: "Options",
    },
    generic: {
      confirm: "A",
      cancel: "B",
      delete: "X",
      space: "Y",
      menu: "Menu",
    },
    keyboard: {
      confirm: "Enter",
      cancel: "Esc",
      delete: "Del",
      space: "Space",
      menu: "Tab",
    },
  };

  return buttonMaps[controllerType] || buttonMaps.xbox;
};

// Get button badge border radius based on controller type
const getButtonBadgeClass = (controllerType = "xbox") => {
  return controllerType === "keyboard" ? "rounded-md" : "rounded-full";
};

// Get button width class based on button text (for keyboard keys)
const getButtonWidthClass = (buttonText, baseSize = "w-8") => {
  if (
    typeof buttonText === "string" &&
    (buttonText === "Enter" || buttonText === "Space")
  ) {
    return baseSize === "w-8" ? "w-14" : baseSize === "w-10" ? "w-16" : "w-14";
  }
  return baseSize;
};

// Debounce hook for search optimization
const useDebouncedValue = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

// Fuzzy search with caching for performance
const createFuzzyMatcher = () => {
  const cache = new Map();

  return (text, query) => {
    if (!text || !query) return false;

    const cacheKey = `${text.toLowerCase()}-${query.toLowerCase()}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    text = text.toLowerCase();
    query = query.toLowerCase();

    // Direct substring match for better performance
    if (text.includes(query)) {
      cache.set(cacheKey, true);
      return true;
    }

    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    if (queryWords.length === 0) {
      cache.set(cacheKey, false);
      return false;
    }

    const result = queryWords.every(queryWord => {
      if (/\d/.test(queryWord)) return text.includes(queryWord);

      const words = text.split(/\s+/);
      return words.some(word => {
        if (/\d/.test(word)) return word.includes(queryWord);
        if (word.includes(queryWord)) return true;

        // Optimize character matching
        let matches = 0;
        let lastIndex = -1;

        for (const char of queryWord) {
          const index = word.indexOf(char, lastIndex + 1);
          if (index > lastIndex) {
            matches++;
            lastIndex = index;
          }
        }

        return matches >= queryWord.length * 0.8;
      });
    });

    cache.set(cacheKey, result);
    if (cache.size > 1000) {
      // Clear cache if it gets too large
      const keys = Array.from(cache.keys());
      keys.slice(0, 100).forEach(key => cache.delete(key));
    }
    return result;
  };
};

// GAMEPAD UTILS
let lastLoggedState = null;
let lastLogTime = 0;

const getGamepadInput = () => {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gamepads[0]; // First connected controller

  if (!gp) return null;

  // Joysticks deadzone
  const threshold = 0.5;

  // Log raw gamepad data for debugging
  const axes0 = gp.axes[0];
  const axes1 = gp.axes[1];
  const dpadUp = gp.buttons[12]?.pressed;
  const dpadDown = gp.buttons[13]?.pressed;
  const dpadLeft = gp.buttons[14]?.pressed;
  const dpadRight = gp.buttons[15]?.pressed;

  const input = {
    up: dpadUp || axes1 < -threshold,
    down: dpadDown || axes1 > threshold,
    left: dpadLeft || axes0 < -threshold,
    right: dpadRight || axes0 > threshold,
    a: gp.buttons[0]?.pressed,
    b: gp.buttons[1]?.pressed,
    x: gp.buttons[2]?.pressed,
    y: gp.buttons[3]?.pressed,
    menu: gp.buttons[9]?.pressed || gp.buttons[8]?.pressed,
    lb: gp.buttons[4]?.pressed,
    rb: gp.buttons[5]?.pressed,
  };

  // Only log on state changes and max once per 500ms
  const now = Date.now();
  const currentState = `${input.up ? "U" : ""}${input.down ? "D" : ""}${input.left ? "L" : ""}${input.right ? "R" : ""}${input.a ? "A" : ""}${input.b ? "B" : ""}`;

  if (currentState && currentState !== lastLoggedState && now - lastLogTime > 500) {
    console.log("[GAMEPAD] Input:", {
      direction: { up: input.up, down: input.down, left: input.left, right: input.right },
      source: {
        dpad: { up: dpadUp, down: dpadDown, left: dpadLeft, right: dpadRight },
        axes: { x: axes0.toFixed(2), y: axes1.toFixed(2) },
      },
      buttons: { a: input.a, b: input.b },
    });
    lastLoggedState = currentState;
    lastLogTime = now;
  } else if (!currentState) {
    lastLoggedState = null;
  }

  return input;
};

// Show installed game details (replaces direct launching)
const showInstalledGameDetails = (
  game,
  setSelectedInstalledGame,
  setInstalledGameView
) => {
  if (!game) return;
  setSelectedInstalledGame(game);
  setInstalledGameView(true);
};

// Seamless verification
const checkSeamlessAvailable = game => {
  if (!game || !game.download_links) return false;
  const links = game.download_links;
  if (typeof links !== "object" || links === null) return false;
  const compatibleHosts = ["gofile", "buzzheavier", "pixeldrain"];
  try {
    const hosts = Object.keys(links);
    return hosts.some(host => compatibleHosts.includes(host.toLowerCase()));
  } catch (e) {
    return false;
  }
};

// --- KEYBOARD COMPONENTS ---
const KEYBOARD_LAYOUTS = {
  qwerty: [
    [
      { k: "1" },
      { k: "2" },
      { k: "3" },
      { k: "4" },
      { k: "5" },
      { k: "6" },
      { k: "7" },
      { k: "8" },
      { k: "9" },
      { k: "0" },
    ],
    [
      { k: "Q" },
      { k: "W" },
      { k: "E" },
      { k: "R" },
      { k: "T" },
      { k: "Y" },
      { k: "U" },
      { k: "I" },
      { k: "O" },
      { k: "P" },
    ],
    [
      { k: "A" },
      { k: "S" },
      { k: "D" },
      { k: "F" },
      { k: "G" },
      { k: "H" },
      { k: "J" },
      { k: "K" },
      { k: "L" },
      { k: "DEL", span: 1 },
    ],
    [
      { k: "Z" },
      { k: "X" },
      { k: "C" },
      { k: "V" },
      { k: "B" },
      { k: "N" },
      { k: "M" },
      { k: "SPACE", span: 2 },
      { k: "ENTER", span: 1 },
    ],
  ],
  azerty: [
    [
      { k: "1" },
      { k: "2" },
      { k: "3" },
      { k: "4" },
      { k: "5" },
      { k: "6" },
      { k: "7" },
      { k: "8" },
      { k: "9" },
      { k: "0" },
    ],
    [
      { k: "A" },
      { k: "Z" },
      { k: "E" },
      { k: "R" },
      { k: "T" },
      { k: "Y" },
      { k: "U" },
      { k: "I" },
      { k: "O" },
      { k: "P" },
    ],
    [
      { k: "Q" },
      { k: "S" },
      { k: "D" },
      { k: "F" },
      { k: "G" },
      { k: "H" },
      { k: "J" },
      { k: "K" },
      { k: "L" },
      { k: "M" },
    ],
    [
      { k: "W" },
      { k: "X" },
      { k: "C" },
      { k: "V" },
      { k: "B" },
      { k: "N" },
      { k: "SPACE", span: 2 },
      { k: "DEL", span: 1 },
      { k: "ENTER", span: 1 },
    ],
  ],
};

// Exit Dialog Component (for exiting to download)
const ExitDialog = ({ isOpen, onClose, onConfirm, t, controllerType }) => {
  const [selectedButton, setSelectedButton] = useState(0);
  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);
  const buttons = getControllerButtons(controllerType);

  useEffect(() => {
    if (isOpen) {
      setSelectedButton(0);
      const timer = setTimeout(() => setCanInput(true), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleInput = useCallback(
    action => {
      if (!canInput) return;

      if (action === "LEFT") setSelectedButton(0);
      else if (action === "RIGHT") setSelectedButton(1);
      else if (action === "CONFIRM") {
        if (selectedButton === 0) onConfirm();
        else onClose();
      } else if (action === "BACK") onClose();
    },
    [canInput, selectedButton, onConfirm, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = e => {
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

  useEffect(() => {
    if (!isOpen) return;

    let animationFrameId;
    const loop = () => {
      const gp = getGamepadInput();
      if (gp && canInput) {
        const now = Date.now();
        if (now - lastInputTime.current > 200) {
          if (gp.left) {
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
    <div className="fixed inset-0 z-[30000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-8 max-w-2xl rounded-2xl border-2 border-primary/30 bg-card p-8 shadow-2xl animate-in fade-in-50 zoom-in-95">
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-full bg-primary/20 p-3">
            <Info className="h-8 w-8 text-primary" />
          </div>
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

// Exit Big Picture Confirmation Dialog
const ExitBigPictureDialog = ({ isOpen, onClose, onConfirm, t, controllerType }) => {
  const [selectedButton, setSelectedButton] = useState(0);
  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);
  const buttons = getControllerButtons(controllerType);

  useEffect(() => {
    if (isOpen) {
      setSelectedButton(0);
      const timer = setTimeout(() => setCanInput(true), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleInput = useCallback(
    action => {
      if (!canInput) return;

      if (action === "LEFT") setSelectedButton(0);
      else if (action === "RIGHT") setSelectedButton(1);
      else if (action === "CONFIRM") {
        if (selectedButton === 0) onConfirm();
        else onClose();
      } else if (action === "BACK") onClose();
    },
    [canInput, selectedButton, onConfirm, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = e => {
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

  useEffect(() => {
    if (!isOpen) return;

    let animationFrameId;
    const loop = () => {
      const gp = getGamepadInput();
      if (gp && canInput) {
        const now = Date.now();
        if (now - lastInputTime.current > 200) {
          if (gp.left) {
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
    <div className="fixed inset-0 z-[30000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-8 max-w-2xl rounded-2xl border-2 border-primary/30 bg-card p-8 shadow-2xl animate-in fade-in-50 zoom-in-95">
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-full bg-primary/20 p-3">
            <Info className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">
            {t("bigPicture.exitBigPictureConfirm")}
          </h2>
        </div>
        <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
          {t("bigPicture.exitBigPictureMessage")}
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

// Kill Download Confirmation Dialog
const KillDownloadDialog = ({
  isOpen,
  game,
  onClose,
  onConfirm,
  t,
  controllerType,
  isLoading = false,
}) => {
  const [selectedButton, setSelectedButton] = useState(0);
  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);
  const buttons = getControllerButtons(controllerType);

  useEffect(() => {
    if (isOpen) {
      setSelectedButton(0);
      const timer = setTimeout(() => setCanInput(true), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleInput = useCallback(
    action => {
      if (!canInput || isLoading) return;

      if (action === "LEFT") setSelectedButton(0);
      else if (action === "RIGHT") setSelectedButton(1);
      else if (action === "CONFIRM") {
        if (selectedButton === 0) onConfirm();
        else onClose();
      } else if (action === "BACK") onClose();
    },
    [canInput, isLoading, selectedButton, onConfirm, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = e => {
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

  useEffect(() => {
    if (!isOpen) return;

    let animationFrameId;
    const loop = () => {
      const gp = getGamepadInput();
      if (gp && canInput) {
        const now = Date.now();
        if (now - lastInputTime.current > 200) {
          if (gp.left) {
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
      <div className="mx-8 max-w-2xl rounded-2xl border-2 border-red-500/30 bg-card p-8 shadow-2xl animate-in fade-in-50 zoom-in-95">
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-full bg-red-500/20 p-3">
            <Trash2 className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">
            {t("bigPicture.confirmKillDownload")}
          </h2>
        </div>
        <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
          {t("bigPicture.confirmKillDownloadMessage", { game: game.game })}
        </p>
        <div className="flex gap-4">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex flex-1 items-center justify-center gap-3 rounded-xl px-6 py-4 text-lg font-bold transition-all duration-150 ${
              isLoading
                ? "cursor-not-allowed bg-muted/50 text-muted-foreground/50"
                : selectedButton === 0
                  ? "scale-105 bg-red-500 text-white shadow-lg shadow-red-500/30"
                  : "bg-muted text-muted-foreground hover:bg-muted"
            }`}
          >
            {isLoading ? (
              <Loader className="h-5 w-5 animate-spin" />
            ) : (
              <Trash2 className="h-5 w-5" />
            )}
            {isLoading
              ? t("bigPicture.deleting") || "Deleting..."
              : t("bigPicture.killDownload")}
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className={`flex flex-1 items-center justify-center gap-3 rounded-xl px-6 py-4 text-lg font-bold transition-all duration-150 ${
              isLoading
                ? "cursor-not-allowed bg-muted/50 text-muted-foreground/50"
                : selectedButton === 1
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
      label: "Keyboard",
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

// Virtual keyboard
const VirtualKeyboard = ({
  value,
  onChange,
  onClose,
  onConfirm,
  suggestions,
  onSelectSuggestion,
  layout = "qwerty",
  t,
  controllerType,
}) => {
  const [selectedRow, setSelectedRow] = useState(0);
  const [selectedCol, setSelectedCol] = useState(0);
  const [inSuggestions, setInSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);
  const buttons = getControllerButtons(controllerType);

  const gridLayout = KEYBOARD_LAYOUTS[layout] || KEYBOARD_LAYOUTS.qwerty;

  // Prevent input for the first 300ms to avoid the opening "A" press being registered
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanInput(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const getKeyAt = (rowIndex, colIndex) => {
    if (!gridLayout[rowIndex]) return null;
    return gridLayout[rowIndex][Math.min(colIndex, gridLayout[rowIndex].length - 1)];
  };

  const visibleSuggestions = suggestions.slice(0, 8);

  const handleInput = useCallback(
    action => {
      if (!canInput) return;

      if (inSuggestions) {
        if (action === "RIGHT")
          setSuggestionIndex(p => Math.min(p + 1, visibleSuggestions.length - 1));
        else if (action === "LEFT") setSuggestionIndex(p => Math.max(p - 1, 0));
        else if (action === "DOWN") {
          setInSuggestions(false);
          setSelectedRow(0);
          setSelectedCol(0);
        } else if (
          (action === "ENTER" || action === "A") &&
          visibleSuggestions[suggestionIndex]
        ) {
          onSelectSuggestion(visibleSuggestions[suggestionIndex]);
        } else if (action === "BACK" || action === "B") {
          setInSuggestions(false);
        }
        return;
      }

      if (action === "UP") {
        if (selectedRow === 0 && visibleSuggestions.length > 0) {
          setInSuggestions(true);
          setSuggestionIndex(0);
        } else {
          setSelectedRow(p => Math.max(0, p - 1));
          const prevRowLen = gridLayout[selectedRow - 1]?.length || 10;
          setSelectedCol(c => Math.min(c, prevRowLen - 1));
        }
      } else if (action === "DOWN") {
        if (selectedRow < gridLayout.length - 1) {
          setSelectedRow(p => p + 1);
          const nextRowLen = gridLayout[selectedRow + 1]?.length || 10;
          setSelectedCol(c => Math.min(c, nextRowLen - 1));
        }
      } else if (action === "RIGHT") {
        const currentRow = gridLayout[selectedRow];
        if (currentRow) setSelectedCol(p => Math.min(p + 1, currentRow.length - 1));
      } else if (action === "LEFT") {
        setSelectedCol(p => Math.max(p - 1, 0));
      } else if (action === "ENTER" || action === "A") {
        const keyObj = getKeyAt(selectedRow, selectedCol);
        if (keyObj) handleKeyAction(keyObj.k);
      } else if (action === "BACK" || action === "ESCAPE") {
        onClose();
      } else if (action === "BACKSPACE" || action === "X") {
        onChange(value.slice(0, -1));
      } else if (action === "SPACE" || action === "Y") {
        onChange(value + " ");
      }
    },
    [
      inSuggestions,
      selectedRow,
      selectedCol,
      suggestionIndex,
      visibleSuggestions,
      gridLayout,
      value,
      onClose,
      canInput,
    ]
  );

  // Keyboard Event Listener
  useEffect(() => {
    const handleKeyDown = e => {
      e.preventDefault();
      e.stopPropagation();

      const keyMap = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        Enter: "ENTER",
        Escape: "ESCAPE",
        Backspace: "BACKSPACE",
      };

      if (keyMap[e.key]) handleInput(keyMap[e.key]);
      else if (e.key.length === 1 && /[a-zA-Z0-9 ]/.test(e.key)) {
        if (canInput) onChange(value + e.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleInput, onChange, value, canInput]);

  // Gamepad Polling for Virtual Keyboard
  useEffect(() => {
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
            handleInput("A");
            lastInputTime.current = now;
          } else if (gp.b) {
            handleInput("BACK");
            lastInputTime.current = now;
          } else if (gp.x) {
            handleInput("X");
            lastInputTime.current = now;
          } else if (gp.y) {
            handleInput("Y");
            lastInputTime.current = now;
          }
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [handleInput, canInput]);

  const handleKeyAction = key => {
    if (key === "SPACE") onChange(value + " ");
    else if (key === "DEL") onChange(value.slice(0, -1));
    else if (key === "ENTER") onConfirm();
    else onChange(value + key.toLowerCase());
  };

  return (
    <div className="fixed inset-0 z-[20000] flex flex-col">
      <div className="flex-1 bg-background/60" onClick={onClose} />
      <div className="border-t-2 border-primary/30 bg-background/95 p-6 pb-10 duration-200 animate-in slide-in-from-bottom">
        <div className="mx-auto mb-6 flex max-w-5xl items-center gap-4 rounded-xl border-2 border-primary/50 bg-muted p-4">
          <Search className="h-6 w-6 flex-shrink-0 text-primary" />
          <span className="flex-1 truncate text-2xl font-medium text-primary">
            {value || (
              <span className="text-muted-foreground">
                {t("bigPicture.searchPlaceholder")}
              </span>
            )}
            <span className="ml-1 animate-pulse text-primary">|</span>
          </span>
          {value && (
            <button onClick={() => onChange("")}>
              <X className="h-6 w-6 text-primary" />
            </button>
          )}
        </div>

        <div className="mx-auto mb-2 flex max-w-5xl justify-end gap-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span>
            <span className="mr-1 rounded-sm bg-primary px-1 text-secondary">
              {buttons.delete}
            </span>
            {t("bigPicture.del")}
          </span>
          <span>
            <span className="mr-1 rounded-sm bg-primary px-1 text-secondary">
              {buttons.space}
            </span>
            {t("bigPicture.space")}
          </span>
        </div>

        {visibleSuggestions.length > 0 && (
          <div className="no-scrollbar mx-auto mb-4 flex max-w-5xl gap-2 overflow-x-auto pb-2">
            {visibleSuggestions.map((game, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSuggestion(game)}
                className={`flex flex-shrink-0 items-center gap-2 rounded-lg px-4 py-2 transition-all ${inSuggestions && suggestionIndex === idx ? "scale-105 bg-primary text-secondary" : "bg-muted text-primary"}`}
              >
                <span className="max-w-[150px] truncate text-sm font-bold">
                  {game.game}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mx-auto flex max-w-5xl flex-col gap-2">
          {gridLayout.map((row, rIdx) => (
            <div key={rIdx} className="grid h-16 grid-cols-10 gap-2">
              {row.map((keyObj, cIdx) => {
                const isSelected =
                  !inSuggestions && selectedRow === rIdx && selectedCol === cIdx;
                const key = keyObj.k;
                const colSpan = keyObj.span || 1;
                const isEnter = key === "ENTER";
                const isDel = key === "DEL";
                const isSpace = key === "SPACE";

                return (
                  <button
                    key={cIdx}
                    onClick={() => handleKeyAction(key)}
                    style={{ gridColumn: `span ${colSpan} / span ${colSpan}` }}
                    className={`flex items-center justify-center rounded-lg text-xl font-bold transition-all duration-75 ${
                      isSelected
                        ? isEnter
                          ? "scale-[1.02] bg-green-500 text-secondary shadow-[0_0_15px_rgba(34,197,94,0.6)]"
                          : "scale-[1.02] bg-primary text-secondary shadow-[0_0_15px_hsl(var(--primary)/0.6)]"
                        : isEnter
                          ? "bg-green-700 text-secondary"
                          : isDel
                            ? "bg-red-900/50 text-primary"
                            : "bg-muted text-primary hover:bg-muted"
                    }`}
                  >
                    {isDel ? (
                      <Delete className="h-6 w-6" />
                    ) : isEnter ? (
                      <Search className="h-6 w-6" />
                    ) : isSpace ? (
                      "SPACE"
                    ) : (
                      key
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- GAME DETAILS & STORE COMPONENTS ---
const GameDetailsView = ({
  game,
  onBack,
  onDownload,
  onShowProviderDialog,
  t,
  controllerType,
  dialogOpen = false,
}) => {
  const isSeamless = checkSeamlessAvailable(game);
  const [showMedia, setShowMedia] = useState(false);
  const [steamData, setSteamData] = useState(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const buttons = getControllerButtons(controllerType);
  const [focusedSection, setFocusedSection] = useState("button"); // 'button', 'description', 'screenshots', 'provider'
  const [selectedButton, setSelectedButton] = useState(0); // 0 = Download, 1 = Play Later
  const [supportsModManaging, setSupportsModManaging] = useState(false);
  const [supportsFlingTrainer, setSupportsFlingTrainer] = useState(false);
  const [isPlayLater, setIsPlayLater] = useState(false);

  // Provider selection for seamless downloads
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const seamlessProviders = ["gofile", "buzzheavier", "pixeldrain"];
  const availableProviders = isSeamless
    ? seamlessProviders.filter(provider => game.download_links?.[provider])
    : [];

  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);
  const descriptionRef = useRef(null);
  const screenshotsRef = useRef(null);

  // Use the same image loading hook as GameCard.jsx
  const { cachedImage, loading: imageLoading } = useImageLoader(game?.imgID, {
    quality: "high",
    priority: "high",
    enabled: !!game?.imgID,
  });

  // Background Image - check Play Later cache first, then use hook result
  const [playLaterImage, setPlayLaterImage] = useState(null);

  useEffect(() => {
    const gameName = game.game || game.name;
    const cached = localStorage.getItem(`play-later-image-${gameName}`);
    if (cached) {
      setPlayLaterImage(cached);
    }
  }, [game.game, game.name]);

  const bgImage = playLaterImage || cachedImage || game.cover || game.image;

  // Input delay on opening
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanInput(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Fetch Data
  useEffect(() => {
    let isMounted = true;
    const fetchGameData = async () => {
      const gameName = game.game || game.name;
      if (!gameName) return;
      console.log("[GameDetailsView] Fetching Steam data for:", gameName);
      setLoadingMedia(true);
      try {
        const data = await steamService.getGameDetails(gameName);
        console.log("[GameDetailsView] Steam data received:", data);
        if (data) {
          console.log("[GameDetailsView] - short_description:", data.short_description);
          console.log("[GameDetailsView] - about_the_game:", data.about_the_game);
          console.log("[GameDetailsView] - screenshots:", data.screenshots);
          console.log(
            "[GameDetailsView] - screenshots count:",
            data.screenshots?.length || 0
          );
        }
        if (isMounted && data) {
          setSteamData(data);
        } else if (!data) {
          console.log("[GameDetailsView] No Steam data found for game");
        }
      } catch (error) {
        console.error("[GameDetailsView] Error fetching steam data:", error);
      } finally {
        if (isMounted) {
          console.log("[GameDetailsView] Loading complete, loadingMedia set to false");
          setLoadingMedia(false);
        }
      }
    };
    fetchGameData();
    return () => {
      isMounted = false;
    };
  }, [game]);

  // Check Nexus Mods support
  useEffect(() => {
    const checkModSupport = async () => {
      const gameName = game.game || game.name;
      if (gameName) {
        try {
          const result = await nexusModsService.checkModSupport(gameName);
          setSupportsModManaging(result.supported);
        } catch (error) {
          console.error("[GameDetailsView] Error checking Nexus Mods support:", error);
          setSupportsModManaging(false);
        }
      }
    };
    checkModSupport();
  }, [game]);

  // Check FLiNG Trainer support
  useEffect(() => {
    const checkTrainerSupport = async () => {
      const gameName = game.game || game.name;
      if (gameName) {
        try {
          const result = await flingTrainerService.checkTrainerSupport(gameName);
          setSupportsFlingTrainer(result.supported);
        } catch (error) {
          console.error("[GameDetailsView] Error checking FLiNG Trainer support:", error);
          setSupportsFlingTrainer(false);
        }
      }
    };
    checkTrainerSupport();
  }, [game]);

  // Check if game is in Play Later list
  useEffect(() => {
    const gameName = game.game || game.name;
    if (!gameName) return;
    const playLaterGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");
    const isInList = playLaterGames.some(g => g.game === gameName);
    setIsPlayLater(isInList);
  }, [game]);

  // Handle Play Later Click
  const handlePlayLater = useCallback(() => {
    const gameName = game.game || game.name;
    const playLaterGames = JSON.parse(localStorage.getItem("play-later-games") || "[]");

    if (isPlayLater) {
      const updatedList = playLaterGames.filter(g => g.game !== gameName);
      localStorage.setItem("play-later-games", JSON.stringify(updatedList));
      localStorage.removeItem(`play-later-image-${gameName}`);
      setIsPlayLater(false);
    } else {
      const gameToSave = {
        game: gameName,
        name: game.name || gameName,
        imgID: game.imgID,
        cover: game.cover,
        image: game.image,
        size: game.size,
        category: game.category,
        desc: game.desc,
        addedAt: Date.now(),
      };
      playLaterGames.push(gameToSave);
      localStorage.setItem("play-later-games", JSON.stringify(playLaterGames));

      if (cachedImage) {
        try {
          localStorage.setItem(`play-later-image-${gameName}`, cachedImage);
        } catch (e) {
          console.warn("Could not cache play later image:", e);
        }
      }

      setIsPlayLater(true);
    }
    window.dispatchEvent(new CustomEvent("play-later-updated"));
  }, [game, isPlayLater, cachedImage]);

  const handleInput = useCallback(
    action => {
      if (!canInput || dialogOpen) return;

      if (action === "DOWN") {
        if (focusedSection === "button") {
          // Move from button to description
          setFocusedSection("description");
        } else if (focusedSection === "description") {
          // Move from description to screenshots if available
          if (steamData?.screenshots && steamData.screenshots.length > 0) {
            setShowMedia(true);
            setFocusedSection("screenshots");
          }
        } else if (focusedSection === "screenshots") {
          // Scroll screenshots down
          if (screenshotsRef.current) {
            screenshotsRef.current.scrollBy({ top: 200, behavior: "smooth" });
          }
        }
      } else if (action === "UP") {
        if (focusedSection === "screenshots") {
          // Move back from screenshots to description
          setShowMedia(false);
          setFocusedSection("description");
        } else if (focusedSection === "description") {
          // Move back from description to button
          setFocusedSection("button");
        }
      } else if (action === "LEFT") {
        if (focusedSection === "button") {
          // Navigate between buttons
          setSelectedButton(prev => Math.max(0, prev - 1));
        } else if (focusedSection === "description" && descriptionRef.current) {
          // Scroll left in description
          descriptionRef.current.scrollBy({ top: -100, behavior: "smooth" });
        } else if (focusedSection === "screenshots" && screenshotsRef.current) {
          // Scroll left in screenshots
          screenshotsRef.current.scrollBy({ top: -200, behavior: "smooth" });
        }
      } else if (action === "RIGHT") {
        if (focusedSection === "button") {
          // Navigate between buttons (0 = View Details, 1 = Play Later)
          setSelectedButton(prev => Math.min(1, prev + 1));
        } else if (focusedSection === "description" && descriptionRef.current) {
          // Scroll right in description
          descriptionRef.current.scrollBy({ top: 100, behavior: "smooth" });
        } else if (focusedSection === "screenshots" && screenshotsRef.current) {
          // Scroll right in screenshots
          screenshotsRef.current.scrollBy({ top: 200, behavior: "smooth" });
        }
      } else if (action === "CONFIRM") {
        if (focusedSection === "button") {
          if (selectedButton === 0) {
            // Start Download button
            console.log(
              "[DOWNLOAD] isSeamless:",
              isSeamless,
              "availableProviders:",
              availableProviders
            );
            if (isSeamless && availableProviders && availableProviders.length > 1) {
              console.log("[DOWNLOAD] Showing provider dialog");
              onShowProviderDialog(game, availableProviders);
            } else {
              console.log("[DOWNLOAD] Starting download directly");
              onDownload(game);
            }
          } else if (selectedButton === 1) {
            // Play Later button
            handlePlayLater();
          }
        } else if (focusedSection === "description") {
          // Move to screenshots if available
          if (steamData?.screenshots && steamData.screenshots.length > 0) {
            setShowMedia(true);
            setFocusedSection("screenshots");
          }
        }
      } else if (action === "BACK") {
        if (showMedia) {
          setShowMedia(false);
          setFocusedSection("button");
        } else if (focusedSection === "description") {
          setFocusedSection("button");
        } else {
          onBack();
        }
      }
    },
    [
      showMedia,
      onBack,
      onDownload,
      onShowProviderDialog,
      game,
      canInput,
      dialogOpen,
      focusedSection,
      steamData,
      selectedButton,
      handlePlayLater,
      isSeamless,
      availableProviders,
    ]
  );

  // Keyboard Listener
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.repeat) return;
      const map = {
        ArrowDown: "DOWN",
        ArrowUp: "UP",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        Escape: "BACK",
        Backspace: "BACK",
        Enter: "CONFIRM",
      };
      if (map[e.key]) {
        e.stopPropagation();
        handleInput(map[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleInput]);

  // Gamepad Polling
  useEffect(() => {
    let rAF;
    const loop = () => {
      // Block input when dialog is open
      if (dialogOpen) {
        rAF = requestAnimationFrame(loop);
        return;
      }

      const gp = getGamepadInput();
      if (gp && canInput) {
        const now = Date.now();
        if (now - lastInputTime.current > 150) {
          if (gp.down) {
            handleInput("DOWN");
            lastInputTime.current = now;
          } else if (gp.up) {
            handleInput("UP");
            lastInputTime.current = now;
          } else if (gp.left) {
            handleInput("LEFT");
            lastInputTime.current = now;
          } else if (gp.right) {
            handleInput("RIGHT");
            lastInputTime.current = now;
          } else if (gp.b) {
            handleInput("BACK");
            lastInputTime.current = now;
          } else if (gp.a) {
            handleInput("CONFIRM");
            lastInputTime.current = now;
          }
        }
      }
      rAF = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rAF);
  }, [handleInput, canInput, dialogOpen]);

  const hasScreenshots = steamData?.screenshots && steamData.screenshots.length > 0;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col overflow-hidden bg-background text-primary">
      <div
        className="absolute inset-0 z-0 opacity-30 transition-opacity duration-1000"
        style={{
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(60px) saturate(150%)",
        }}
      />

      <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#0e0e10] via-[#0e0e10]/70 to-transparent" />

      <div
        className={`absolute right-0 top-0 z-10 flex h-full w-[55%] items-center justify-center p-12 transition-all duration-500 ease-in-out ${
          showMedia
            ? "pointer-events-none translate-y-[-10%] scale-95 opacity-0"
            : "translate-y-0 scale-100 opacity-100"
        }`}
      >
        <div className="group relative">
          <div className="absolute inset-0 -z-10 translate-y-10 scale-90 rounded-full bg-primary/20 blur-3xl transition-colors duration-500 group-hover:bg-primary/40"></div>
          <img
            src={bgImage}
            alt={game.name || game.game}
            className="max-h-[75vh] max-w-full rotate-2 rounded-2xl border-4 border-white/10 object-cover shadow-2xl transition-all duration-500 ease-out group-hover:rotate-0 group-hover:scale-105"
          />
        </div>
      </div>

      <div
        className={`ease-[cubic-bezier(0.32,0.72,0,1)] relative z-20 h-full w-full transition-transform duration-500 ${
          showMedia ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        {/* VIEW 1: DETAILS */}
        <div className="relative h-full w-full flex-shrink-0">
          <div className="flex h-full w-[45%] flex-col justify-center p-16 pl-24">
            <h1 className="mb-6 text-6xl font-black leading-tight tracking-tight text-white drop-shadow-lg">
              {game.name || game.game}
            </h1>
            <div className="mb-6 flex flex-wrap gap-3">
              {game.category &&
                game.category.slice(0, 4).map((cat, idx) => (
                  <span
                    key={idx}
                    className="rounded-lg border border-white/10 bg-white/10 px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm"
                  >
                    {cat}
                  </span>
                ))}
            </div>

            <div className="mb-8 flex gap-6 text-white/80">
              {game.size && (
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  <span className="font-medium">{game.size}</span>
                </div>
              )}
              {game.version && (
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  <span className="font-medium">v{game.version}</span>
                </div>
              )}
            </div>

            {(game.dlc || game.online || isSeamless !== undefined) && (
              <div className="mb-6 flex flex-wrap gap-4">
                {game.dlc && (
                  <div className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-300 backdrop-blur-sm">
                    <Download className="h-4 w-4" />
                    <span>{t("bigPicture.includesDlc")}</span>
                  </div>
                )}
                {game.online && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/20 px-4 py-2 text-sm font-medium text-green-300 backdrop-blur-sm">
                    <Wifi className="h-4 w-4" />
                    <span>{t("bigPicture.onlineFix")}</span>
                  </div>
                )}
                {isSeamless ? (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/20 px-4 py-2 text-sm font-medium text-green-300 backdrop-blur-sm">
                    <Check className="h-4 w-4" />
                    <span>{t("bigPicture.readyToDownload")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/20 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm">
                    <MousePointer className="h-4 w-4" />
                    <span>{t("bigPicture.mouseRequired")}</span>
                  </div>
                )}
              </div>
            )}

            {/* Provider Selection UI */}
            {focusedSection === "provider" &&
              isSeamless &&
              availableProviders.length > 1 && (
                <div className="mb-6 rounded-xl border-2 border-primary/50 bg-primary/10 p-6 backdrop-blur-sm">
                  <h3 className="mb-4 text-lg font-bold text-white">
                    {t("bigPicture.selectProvider")}
                  </h3>
                  <div className="flex gap-3">
                    {availableProviders.map((provider, idx) => (
                      <button
                        key={provider}
                        onClick={() => setSelectedProviderIndex(idx)}
                        className={`rounded-lg px-6 py-3 text-sm font-bold uppercase transition-all ${
                          idx === selectedProviderIndex
                            ? "scale-105 bg-white text-black shadow-lg"
                            : "bg-white/20 text-white hover:bg-white/30"
                        }`}
                      >
                        {provider}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-white/60">
                    {t("bigPicture.useArrowsToSelect")} • Press {buttons.confirm}{" "}
                    {t("bigPicture.toConfirm")}
                  </p>
                </div>
              )}

            <div className="mb-6 flex gap-4">
              <button
                onClick={() => {
                  if (isSeamless && availableProviders.length > 1) {
                    onShowProviderDialog(game, availableProviders);
                  } else {
                    onDownload(game);
                  }
                }}
                className={`group flex w-fit items-center gap-4 rounded-2xl px-10 py-5 text-2xl font-black shadow-xl transition-all duration-200 ${
                  focusedSection === "button" && selectedButton === 0
                    ? "scale-110 bg-primary text-secondary shadow-primary/50 ring-4 ring-primary/50"
                    : "bg-primary text-secondary shadow-primary/30 hover:scale-105 hover:bg-primary"
                }`}
              >
                <Download className="h-7 w-7" />
                <span>
                  {isSeamless
                    ? t("bigPicture.startDownload")
                    : t("bigPicture.viewDetails")}
                </span>
              </button>

              <button
                onClick={handlePlayLater}
                className={`group flex w-fit items-center gap-3 rounded-2xl px-8 py-5 text-xl font-bold shadow-lg transition-all duration-200 ${
                  focusedSection === "button" && selectedButton === 1
                    ? isPlayLater
                      ? "scale-110 bg-green-500 text-secondary shadow-green-500/50 ring-4 ring-green-400/50"
                      : "scale-110 border-2 border-primary bg-muted text-foreground shadow-primary/30 ring-4 ring-primary/50"
                    : isPlayLater
                      ? "bg-green-500 text-secondary shadow-green-500/30"
                      : "border-2 border-border bg-muted text-foreground shadow-muted/30 hover:border-primary/40 hover:bg-muted/80"
                }`}
              >
                {isPlayLater ? (
                  <>
                    <Check className="h-6 w-6" />
                    <span>{t("bigPicture.addedToPlayLater")}</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-6 w-6" />
                    <span>{t("bigPicture.playLater")}</span>
                  </>
                )}
              </button>
            </div>

            <div
              ref={descriptionRef}
              className={`mb-8 max-h-[400px] min-h-[200px] max-w-3xl overflow-y-auto rounded-xl p-6 transition-all duration-200 ${
                focusedSection === "description"
                  ? "bg-muted/50 ring-4 ring-primary"
                  : "bg-muted/20"
              }`}
            >
              <p className="text-lg leading-relaxed text-white/90">
                {(
                  steamData?.summary ||
                  steamData?.description ||
                  steamData?.short_description ||
                  steamData?.about_the_game ||
                  steamData?.detailed_description ||
                  game.desc ||
                  t("bigPicture.failedToFetchDescription")
                ).replace(/<[^>]*>/g, "")}
              </p>
            </div>

            <div className="mt-8 space-y-4">
              {/* Ascend Features Banner */}
              <div className="group relative max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-muted/50 p-5 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-muted/70">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
                  {/* Cloud Saves - Always show */}
                  <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                      <Cloud className="h-4.5 w-4.5 text-white transition-transform duration-200 group-hover/item:scale-110" />
                      <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {t("bigPicture.cloudSaves")}
                    </span>
                  </div>

                  {/* Remote Downloads - Always show */}
                  <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                      <Smartphone className="h-4.5 w-4.5 text-white transition-transform duration-200 group-hover/item:scale-110" />
                      <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {t("bigPicture.remoteDownloads")}
                    </span>
                  </div>

                  {/* Mod Manager - Only if game supports mods */}
                  {supportsModManaging && (
                    <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                        <Puzzle className="h-4.5 w-4.5 text-white transition-transform duration-200 group-hover/item:scale-110" />
                        <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                      </div>
                      <span className="text-sm font-semibold text-white">
                        {t("bigPicture.modManager")}
                      </span>
                    </div>
                  )}

                  {/* Trainer - Only if game has trainer support */}
                  {supportsFlingTrainer && (
                    <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                        <Zap className="h-4.5 w-4.5 text-white transition-transform duration-200 group-hover/item:scale-110" />
                        <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                      </div>
                      <span className="text-sm font-semibold text-white">
                        {t("bigPicture.trainer")}
                      </span>
                    </div>
                  )}

                  {/* Auto Updates - Only for seamless games */}
                  {isSeamless && (
                    <div className="group/item flex items-center gap-2.5 transition-transform duration-200 hover:scale-105">
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-sm ring-1 ring-blue-500/20 transition-all duration-200 group-hover/item:shadow-md group-hover/item:ring-blue-500/30">
                        <RefreshCw className="h-4.5 w-4.5 text-secondary transition-transform duration-200 group-hover/item:scale-110" />
                        <div className="absolute -inset-1 rounded-lg bg-primary/20 opacity-0 blur transition-opacity duration-200 group-hover/item:opacity-100" />
                      </div>
                      <span className="text-sm font-semibold text-secondary">
                        {t("bigPicture.autoUpdates")}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    {t("bigPicture.ascendPremiumFeatures")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
                    <span className="text-xs font-bold text-secondary">
                      {t("bigPicture.available")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 animate-bounce flex-col items-center gap-2 opacity-60">
            <span className="text-xs font-bold uppercase tracking-widest text-secondary">
              {hasScreenshots ? t("bigPicture.screenshots") : t("bigPicture.mediaInfo")}
            </span>
            <ChevronDown className="h-6 w-6 text-secondary" />
          </div>
        </div>

        <div className="relative flex h-full w-full flex-shrink-0 flex-col">
          <div className="absolute inset-0 -z-10 bg-background/90 backdrop-blur-md" />
          <div className="z-20 flex items-center gap-4 border-b border-white/5 px-24 py-12">
            <ImageIcon className="h-8 w-8 text-primary" />
            <h2 className="text-4xl font-light tracking-wider text-primary">
              {t("bigPicture.media")}
            </h2>
          </div>

          <div
            ref={screenshotsRef}
            className="no-scrollbar flex-1 overflow-y-auto p-12 px-24 pb-32"
          >
            {steamData?.screenshots && steamData.screenshots.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
                {steamData.screenshots.map((screen, idx) => {
                  const imageUrl =
                    typeof screen === "string"
                      ? screen
                      : screen.path_full || screen.path_thumbnail || screen.url;
                  return (
                    <div
                      key={screen.id || idx}
                      className="group relative aspect-video overflow-hidden rounded-xl border-2 border-transparent bg-muted transition-all hover:scale-[1.02] hover:border-primary"
                    >
                      <img
                        src={imageUrl}
                        alt={`Screenshot ${idx + 1}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={e => {
                          console.log("[Screenshot] Failed to load:", imageUrl);
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <p>{t("bigPicture.noScreenshotsAvailable")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="fixed bottom-12 right-16 z-50 flex gap-10 text-sm font-bold tracking-widest text-primary">
        {!showMedia && (
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 ${getButtonWidthClass(buttons.confirm, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} bg-primary text-sm font-black text-secondary shadow-lg`}
            >
              {buttons.confirm}
            </span>{" "}
            {t("bigPicture.download")}
          </div>
        )}
        <div
          className="flex cursor-pointer items-center gap-3 transition-colors hover:text-primary/80"
          onClick={() => handleInput("BACK")}
        >
          <span
            className={`flex h-10 ${getButtonWidthClass(buttons.cancel, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} border border-border bg-muted text-sm text-muted-foreground`}
          >
            {buttons.cancel}
          </span>{" "}
          {showMedia ? t("bigPicture.upBack") : t("bigPicture.back")}
        </div>
      </div>
    </div>
  );
};

// Installed Game Details View Component
const InstalledGameDetailsView = ({ game, onBack, t, controllerType }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [steamData, setSteamData] = useState(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [canInput, setCanInput] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [selectedButton, setSelectedButton] = useState("play"); // 'play' or 'folder'
  const lastInputTime = useRef(0);
  const buttons = getControllerButtons(controllerType);
  const gameName = game.game || game.name;

  useEffect(() => {
    console.log("[InstalledGameDetailsView] Mounted with game:", gameName);
    console.log("[InstalledGameDetailsView] Game object:", game);
  }, []);

  // Load game image
  useEffect(() => {
    let isMounted = true;
    const loadCover = async () => {
      try {
        console.log("[InstalledGameDetailsView] Loading cover for:", gameName);
        const base64 = await window.electron.getGameImage(gameName);
        if (isMounted && base64) {
          console.log("[InstalledGameDetailsView] Cover loaded successfully");
          setImageSrc(`data:image/jpeg;base64,${base64}`);
        } else {
          console.log("[InstalledGameDetailsView] No cover image found");
        }
      } catch (e) {
        console.error("[InstalledGameDetailsView] Error loading game image:", e);
      }
    };
    loadCover();
    return () => {
      isMounted = false;
    };
  }, [gameName]);

  // Load play time from game object
  useEffect(() => {
    console.log("[InstalledGameDetailsView] Game playTime:", game.playTime);
    setPlayTime(game.playTime || 0);
  }, [game.playTime]);

  // Check if game is running
  useEffect(() => {
    const checkRunning = async () => {
      try {
        const running = await window.electron.isGameRunning(gameName);
        setIsRunning(running);
      } catch (e) {
        console.error("Error checking game status:", e);
      }
    };
    checkRunning();
    const interval = setInterval(checkRunning, 2000);
    return () => clearInterval(interval);
  }, [gameName]);

  // Fetch Steam data
  useEffect(() => {
    let isMounted = true;
    const fetchGameData = async () => {
      console.log("[InstalledGameDetailsView] Fetching Steam data for:", gameName);
      setLoadingMedia(true);
      try {
        const data = await steamService.getGameDetails(gameName);
        console.log("[InstalledGameDetailsView] Steam data received:", data);
        if (data) {
          console.log(
            "[InstalledGameDetailsView] - short_description:",
            data.short_description
          );
          console.log(
            "[InstalledGameDetailsView] - formatted_screenshots:",
            data.formatted_screenshots
          );
          console.log(
            "[InstalledGameDetailsView] - screenshots count:",
            data.formatted_screenshots?.length || 0
          );
        }
        if (isMounted && data) {
          setSteamData(data);
        } else if (!data) {
          console.log("[InstalledGameDetailsView] No Steam data found for game");
        }
      } catch (error) {
        console.error("[InstalledGameDetailsView] Error fetching steam data:", error);
      } finally {
        if (isMounted) {
          console.log(
            "[InstalledGameDetailsView] Loading complete, loadingMedia set to false"
          );
          setLoadingMedia(false);
        }
      }
    };
    fetchGameData();
    return () => {
      isMounted = false;
    };
  }, [gameName]);

  // Input delay on opening
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanInput(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Handle play game
  const handlePlayGame = async () => {
    if (isLaunching || isRunning) return;

    setIsLaunching(true);

    try {
      // Check if in dev mode
      if (await window.electron.isDev()) {
        setTimeout(() => toast.error(t("library.cannotRunDev")), 0);
        setIsLaunching(false);
        return;
      }

      // Check if already running
      const running = await window.electron.isGameRunning(gameName);
      if (running) {
        setTimeout(() => toast.error(t("library.alreadyRunning", { game: gameName })), 0);
        setIsLaunching(false);
        return;
      }

      // Check Steam for online games
      if (game.online) {
        const hideSteamWarning = localStorage.getItem("hideSteamWarning");
        if (!hideSteamWarning) {
          if (!(await window.electron.isSteamRunning())) {
            setTimeout(() => toast.error(t("library.steamNotRunning")), 0);
            setIsLaunching(false);
            return;
          }
        }
      }
      await window.electron.playGame(
        gameName,
        game.isCustom,
        game.backups ?? false,
        false,
        null,
        false
      );

      // Save to recently played
      recentGamesService.addRecentGame({
        game: gameName,
        name: game.name,
        imgID: game.imgID,
        version: game.version,
        isCustom: game.isCustom,
        online: game.online,
        dlc: game.dlc,
      });

      setIsLaunching(false);
      setTimeout(() => toast.success(t("library.gameLaunched", { game: gameName })), 0);
    } catch (error) {
      console.error("Error launching game:", error);
      setTimeout(() => toast.error(t("library.launchFailed")), 0);
      setIsLaunching(false);
    }
  };

  // Handle open directory
  const handleOpenDirectory = async () => {
    await window.electron.openGameDirectory(gameName, game.isCustom);
  };

  const handleInput = useCallback(
    action => {
      if (!canInput) return;

      if (action === "DOWN") {
        if (!showMedia) setShowMedia(true);
      } else if (action === "UP") {
        if (showMedia) setShowMedia(false);
      } else if (action === "LEFT") {
        if (!showMedia) setSelectedButton("play");
      } else if (action === "RIGHT") {
        if (!showMedia) setSelectedButton("folder");
      } else if (action === "BACK" || action === "MENU") {
        if (showMedia) setShowMedia(false);
        else {
          console.log("[GAME DETAILS] Back/Menu pressed, calling onBack");
          onBack();
        }
      } else if (action === "CONFIRM") {
        if (!showMedia) {
          if (selectedButton === "play" && !isLaunching && !isRunning) {
            handlePlayGame();
          } else if (selectedButton === "folder") {
            handleOpenDirectory();
          }
        }
      } else if (action === "X") {
        if (!showMedia) handleOpenDirectory();
      }
    },
    [
      showMedia,
      onBack,
      isLaunching,
      isRunning,
      canInput,
      handlePlayGame,
      handleOpenDirectory,
      selectedButton,
    ]
  );

  // Keyboard Listener
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.repeat) return;
      const map = {
        ArrowDown: "DOWN",
        ArrowUp: "UP",
        Escape: "BACK",
        Backspace: "BACK",
        Enter: "CONFIRM",
        x: "X",
        X: "X",
        m: "MENU",
        M: "MENU",
        ContextMenu: "MENU",
      };
      if (map[e.key]) {
        e.stopPropagation();
        handleInput(map[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleInput]);

  // Gamepad Polling
  useEffect(() => {
    let rAF;
    const loop = () => {
      const gp = getGamepadInput();
      if (gp && canInput) {
        const now = Date.now();
        if (now - lastInputTime.current > 150) {
          if (gp.down) {
            handleInput("DOWN");
            lastInputTime.current = now;
          } else if (gp.up) {
            handleInput("UP");
            lastInputTime.current = now;
          } else if (gp.left) {
            handleInput("LEFT");
            lastInputTime.current = now;
          } else if (gp.right) {
            handleInput("RIGHT");
            lastInputTime.current = now;
          } else if (gp.b) {
            handleInput("BACK");
            lastInputTime.current = now;
          } else if (gp.a) {
            handleInput("CONFIRM");
            lastInputTime.current = now;
          } else if (gp.x) {
            handleInput("X");
            lastInputTime.current = now;
          } else if (gp.menu) {
            handleInput("MENU");
            lastInputTime.current = now;
          }
        }
      }
      rAF = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rAF);
  }, [handleInput, canInput]);

  const formatPlayTime = time => {
    if (!time || time < 60) return t("library.notPlayedYet") || "Not played yet";
    if (time < 3600) return `${Math.floor(time / 60)} ${t("library.minutes")}`;
    if (time < 7200) return `1 ${t("library.hour")}`;
    return `${Math.floor(time / 3600)} ${t("library.hours")}`;
  };

  const hasScreenshots =
    steamData?.formatted_screenshots && steamData.formatted_screenshots.length > 0;
  const bgImage = imageSrc;
  const gameDescription = (
    steamData?.short_description ||
    steamData?.about_the_game ||
    steamData?.detailed_description ||
    steamData?.summary ||
    steamData?.description ||
    ""
  )?.replace(/<[^>]*>/g, "");

  useEffect(() => {
    console.log("[InstalledGameDetailsView] Render state:");
    console.log("  - imageSrc:", imageSrc ? "loaded" : "not loaded");
    console.log("  - steamData:", steamData ? "loaded" : "not loaded");
    console.log("  - hasScreenshots:", hasScreenshots);
    console.log("  - gameDescription:", gameDescription ? "available" : "not available");
    console.log("  - loadingMedia:", loadingMedia);
  }, [imageSrc, steamData, hasScreenshots, gameDescription, loadingMedia]);

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col overflow-hidden bg-background text-primary">
      <div
        className="absolute inset-0 z-0 opacity-30 transition-opacity duration-1000"
        style={{
          backgroundImage: bgImage ? `url(${bgImage})` : "none",
          backgroundColor: bgImage ? "transparent" : "#1e293b",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(60px) saturate(150%)",
        }}
      />

      <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#0e0e10] via-[#0e0e10]/70 to-transparent" />

      <div
        className={`absolute right-0 top-0 z-10 flex h-full w-[55%] items-center justify-center p-12 transition-all duration-500 ease-in-out ${
          showMedia
            ? "pointer-events-none translate-y-[-10%] scale-95 opacity-0"
            : "translate-y-0 scale-100 opacity-100"
        }`}
      >
        <div className="group relative">
          <div className="absolute inset-0 -z-10 translate-y-10 scale-90 rounded-full bg-primary/20 blur-3xl transition-colors duration-500 group-hover:bg-primary/40"></div>
          {bgImage ? (
            <img
              src={bgImage}
              alt={gameName}
              className="max-h-[75vh] max-w-full rotate-2 rounded-2xl border-4 border-white/10 object-cover shadow-2xl transition-all duration-500 ease-out group-hover:rotate-0 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-[60vh] w-[40vw] items-center justify-center rounded-2xl border-4 border-white/10 bg-muted">
              <span className="text-2xl text-muted-foreground">{gameName}</span>
            </div>
          )}
        </div>
      </div>

      <div
        className={`ease-[cubic-bezier(0.32,0.72,0,1)] relative z-20 h-full w-full transition-transform duration-500 ${
          showMedia ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        {/* VIEW 1: DETAILS */}
        <div className="relative h-full w-full flex-shrink-0">
          <div className="flex h-full w-[45%] flex-col justify-center p-16 pl-24">
            <h1 className="mb-6 text-6xl font-black leading-tight tracking-tight text-white drop-shadow-lg">
              {gameName}
            </h1>

            {game.category && game.category.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-3">
                {game.category.slice(0, 4).map((cat, idx) => (
                  <span
                    key={idx}
                    className="rounded-lg border border-white/10 bg-white/10 px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}

            <div className="mb-8 flex gap-6 text-white/80">
              {game.version && (
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  <span className="font-medium">v{game.version}</span>
                </div>
              )}
              {playTime > 0 && (
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  <span className="font-medium">{formatPlayTime(playTime)}</span>
                </div>
              )}
            </div>

            {gameDescription ? (
              <p className="mb-8 max-w-2xl text-lg leading-relaxed text-white/90">
                {gameDescription}
              </p>
            ) : (
              <p className="mb-8 max-w-2xl text-sm italic text-secondary">
                {loadingMedia
                  ? t("bigPicture.loadingDescription")
                  : t("bigPicture.noDescriptionAvailable")}
              </p>
            )}

            {(game.dlc || game.online) && (
              <div className="mb-8 flex gap-4">
                {game.dlc && (
                  <div className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-300">
                    <Download className="h-4 w-4" />
                    <span>{t("bigPicture.includesDlc")}</span>
                  </div>
                )}
                {game.online && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/20 px-4 py-2 text-sm font-medium text-green-300">
                    <Wifi className="h-4 w-4" />
                    <span>{t("bigPicture.onlineFix")}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={handlePlayGame}
                disabled={isLaunching || isRunning}
                className={`group flex items-center gap-4 rounded-2xl px-10 py-5 text-2xl font-black shadow-xl transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 ${
                  selectedButton === "play"
                    ? "scale-110 bg-primary text-secondary shadow-primary/50 ring-4 ring-primary/50"
                    : "bg-white text-primary shadow-black/30 hover:scale-105 hover:bg-primary hover:text-secondary"
                }`}
              >
                {isLaunching ? (
                  <>
                    <Loader className="h-7 w-7 animate-spin" />
                    <span>{t("bigPicture.launching")}</span>
                  </>
                ) : isRunning ? (
                  <>
                    <Play className="h-7 w-7 fill-current" />
                    <span>{t("bigPicture.running")}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-7 w-7 fill-current" />
                    <span>{t("bigPicture.play")}</span>
                  </>
                )}
              </button>

              <button
                onClick={handleOpenDirectory}
                className={`flex items-center gap-3 rounded-2xl border-2 px-8 py-5 text-xl font-bold backdrop-blur-sm transition-all duration-200 ${
                  selectedButton === "folder"
                    ? "scale-110 border-primary bg-primary/30 text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                    : "border-white/20 bg-white/10 text-secondary hover:scale-105 hover:border-white/40 hover:bg-white/20"
                }`}
              >
                <FolderOpen className="h-6 w-6" />
              </button>
            </div>
          </div>

          {hasScreenshots && (
            <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 animate-bounce flex-col items-center gap-2 opacity-60">
              <span className="text-xs font-bold uppercase tracking-widest text-secondary">
                {t("bigPicture.screenshots")}
              </span>
              <ChevronDown className="h-6 w-6 text-secondary" />
            </div>
          )}
        </div>

        {/* VIEW 2: MEDIA */}
        <div className="relative flex h-full w-full flex-shrink-0 flex-col">
          <div className="absolute inset-0 -z-10 bg-background/90 backdrop-blur-md" />
          <div className="z-20 flex items-center gap-4 border-b border-white/5 px-24 py-12">
            <ImageIcon className="h-8 w-8 text-primary" />
            <h2 className="text-4xl font-light tracking-wider text-primary">
              {t("bigPicture.screenshots").toUpperCase()}
            </h2>
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto p-12 px-24 pb-32">
            {steamData?.formatted_screenshots &&
            steamData.formatted_screenshots.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
                {steamData.formatted_screenshots.map((screen, idx) => {
                  const imageUrl =
                    typeof screen === "string"
                      ? screen
                      : screen.path_full || screen.path_thumbnail || screen.url;
                  return (
                    <div
                      key={idx}
                      className="group relative aspect-video overflow-hidden rounded-xl border-2 border-transparent bg-muted transition-all hover:scale-[1.02] hover:border-primary"
                    >
                      <img
                        src={imageUrl}
                        alt={`Screenshot ${idx + 1}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={e => {
                          console.log("[Screenshot] Failed to load:", imageUrl);
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : loadingMedia ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <p>{t("bigPicture.noScreenshotsAvailable")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="fixed bottom-12 right-16 z-50 flex gap-10 text-sm font-bold tracking-widest text-primary">
        {!showMedia && !isLaunching && !isRunning && (
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 ${getButtonWidthClass(buttons.confirm, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} bg-primary text-sm font-black text-secondary shadow-lg`}
            >
              {buttons.confirm}
            </span>
            {t("bigPicture.play")}
          </div>
        )}
        {!showMedia && (
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 ${getButtonWidthClass(buttons.delete, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} border border-border bg-muted text-sm font-black text-muted-foreground`}
            >
              {buttons.delete}
            </span>
            {t("bigPicture.openFolder")}
          </div>
        )}
        <div
          className="flex cursor-pointer items-center gap-3 transition-colors hover:text-primary/80"
          onClick={() => handleInput("BACK")}
        >
          <span
            className={`flex h-10 ${getButtonWidthClass(buttons.cancel, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} border border-border bg-muted text-sm text-muted-foreground`}
          >
            {buttons.cancel}
          </span>{" "}
          {showMedia ? t("bigPicture.upBack") : t("bigPicture.back")}
        </div>
      </div>
    </div>
  );
};

// Store card component
const StoreGameCard = React.memo(({ game, isSelected, onClick }) => {
  const cardRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const { cachedImage, loading } = useImageLoader(game?.imgID, {
    quality: isVisible ? "high" : "low",
    priority: isVisible ? "high" : "low",
    enabled: !!game?.imgID && isVisible,
  });
  const imageUrl = cachedImage || game.cover || game.image || null;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isSelected]);

  useEffect(() => {
    if (isVisible && game.imgID) {
      setIsVisible(false);
      setTimeout(() => setIsVisible(true), 0);
    }
  }, [game.imgID]);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`relative flex aspect-[2/3] w-full cursor-pointer flex-col justify-end transition-all duration-150 ease-out ${isSelected ? "z-20 scale-105" : "z-10 scale-100 opacity-70"}`}
    >
      <div
        className={`relative z-10 h-full w-full overflow-hidden rounded-xl border-[3px] bg-muted shadow-2xl transition-all duration-150 ${isSelected ? "border-white/90 shadow-lg shadow-primary/20 brightness-110" : "border-transparent brightness-75 hover:brightness-100"}`}
      >
        {isVisible && imageUrl ? (
          <img
            src={imageUrl}
            alt={game.game}
            className="h-full w-full object-cover transition-opacity duration-300"
            style={{ objectPosition: "center top" }}
            loading="lazy"
          />
        ) : loading ? (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Loader className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-muted text-secondary">
            <Download className="mb-2 h-8 w-8 opacity-50" />
            <span className="px-4 text-center text-sm font-bold">{game.game}</span>
          </div>
        )}
      </div>
      {/* Top Status Bar */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between p-2">
        {/* Rating badge */}
        {game.rating && game.rating > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 backdrop-blur-sm">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="text-xs font-bold text-primary">
              {Math.round(game.rating)}
            </span>
          </div>
        )}

        {/* DLC/Online badges */}
        <div className="flex items-center gap-1.5">
          {game.dlc && (
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary/10 backdrop-blur-sm transition-all hover:bg-secondary/20">
              <Gift className="h-3.5 w-3.5 text-secondary" />
            </div>
          )}
          {game.online && (
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary/10 backdrop-blur-sm transition-all hover:bg-secondary/20">
              <Gamepad2 className="h-3.5 w-3.5 text-secondary" />
            </div>
          )}
        </div>
      </div>

      {isSelected && (
        <div className="absolute bottom-0 left-0 right-0 z-20 rounded-b-xl bg-gradient-to-t from-black via-black/95 to-transparent p-4 pt-10 text-center">
          <span
            className={`block font-bold leading-tight text-secondary ${game.game.length > 35 ? "text-xs" : "text-sm"}`}
          >
            {game.game}
          </span>
          {game.size && (
            <span className="mt-1 block text-xs text-slate-400">{game.size}</span>
          )}
        </div>
      )}
    </div>
  );
});

// Library card component
const GameCard = ({ game, index, isSelected, onClick, isGridMode, t }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!isGridMode && isSelected && cardRef.current) {
      const container = document.getElementById("big-picture-scroll-container");
      if (container) {
        if (index < 2) container.scrollTo({ left: 0, behavior: "smooth" });
        else {
          const cardCenter = cardRef.current.offsetLeft + cardRef.current.offsetWidth / 2;
          const targetX = cardCenter - window.innerWidth * 0.55;
          container.scrollTo({ left: targetX, behavior: "smooth" });
        }
      }
    }
    if (isGridMode && isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isSelected, index, isGridMode]);

  useEffect(() => {
    if (game.isFake || game.isSeeMore) return;

    let isMounted = true;
    const loadCover = async () => {
      const gameName = game.game || game.name;
      try {
        const base64 = await window.electron.getGameImage(gameName);
        if (isMounted && base64) setImageSrc(`data:image/jpeg;base64,${base64}`);
      } catch (e) {}
    };
    loadCover();
    return () => {
      isMounted = false;
    };
  }, [game]);

  const isHero = !isGridMode && index === 0 && !game.isSeeMore;
  const gameName = game.game || game.name;

  // Card to Library
  if (game.isSeeMore) {
    return (
      <div
        ref={cardRef}
        onClick={onClick}
        className={`relative flex flex-shrink-0 flex-col items-center justify-center rounded-xl border-4 bg-muted transition-all duration-150 ease-out ${isGridMode ? "aspect-[2/3] w-full" : "aspect-[2/3] h-full"} ${isSelected ? "z-20 scale-105 border-primary shadow-[0_0_30px_hsl(var(--primary)/0.5)]" : "z-10 scale-100 border-transparent opacity-80"}`}
      >
        <Grid
          className={`mb-4 h-12 w-12 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
        />
        <h3 className="px-4 text-center text-xl font-bold">{t("bigPicture.seeMore")}</h3>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`relative flex flex-shrink-0 flex-col justify-end transition-all duration-150 ease-out ${isHero ? "aspect-video" : "aspect-[2/3]"} ${isGridMode ? "w-full" : "h-full"} ${isSelected ? "z-20 scale-105" : "z-10 scale-100 opacity-80"} ${!isGridMode && isSelected ? "mx-5" : !isGridMode ? "mx-2" : ""}`}
    >
      {isSelected && (imageSrc || game.isFake) && (
        <div
          className="absolute inset-0 -z-10 rounded-xl transition-opacity duration-200"
          style={{
            backgroundImage: imageSrc ? `url(${imageSrc})` : "none",
            backgroundColor: imageSrc ? "transparent" : "#334155",
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(25px) saturate(120%) brightness(1.0)",
            transform: "scale(1.02) translateY(5px)",
            opacity: 0.4,
          }}
        />
      )}
      <div
        className={`relative z-10 h-full w-full overflow-hidden rounded-xl border-[3px] bg-muted shadow-2xl transition-all duration-150 ${isSelected ? "border-white/90 shadow-lg ring-0 brightness-110" : "border-transparent brightness-75 hover:brightness-100"}`}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={gameName}
            className="h-full w-full object-cover"
            style={{ objectPosition: "center top" }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-muted text-muted-foreground">
            <span className="px-4 text-center text-sm font-bold">{gameName}</span>
          </div>
        )}
      </div>
      {!isGridMode && (
        <div
          className={`pointer-events-none absolute left-1/2 z-30 w-[300px] -translate-x-1/2 text-center transition-all duration-150 ease-out ${isSelected ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"} ${isHero ? "-bottom-20" : "-bottom-14"}`}
        >
          <h3
            className={`font-bold tracking-wide text-primary drop-shadow-md ${isHero ? "text-3xl" : "text-xl"} ${gameName.length > 25 ? "text-lg leading-tight" : ""}`}
          >
            {gameName}
          </h3>
          {isHero && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold tracking-wider text-secondary shadow-lg">
                {t("bigPicture.lastPlayed")}
              </span>
              <span className="text-sm font-medium text-primary drop-shadow-md">
                {game.playTime && game.playTime >= 60
                  ? game.playTime >= 3600
                    ? `${Math.floor(game.playTime / 3600)}h ${t("bigPicture.played")}`
                    : `${Math.floor(game.playTime / 60)}m ${t("bigPicture.played")}`
                  : game.playTime > 0
                    ? `< 1m ${t("bigPicture.played")}`
                    : `0h ${t("bigPicture.played")}`}
              </span>
            </div>
          )}
        </div>
      )}
      {isGridMode && isSelected && (
        <div className="absolute bottom-0 left-0 right-0 z-20 rounded-b-xl bg-gradient-to-t from-black via-black/95 to-transparent p-3 pt-8 text-center">
          <span
            className={`block font-bold leading-tight text-primary ${gameName.length > 30 ? "text-xs" : gameName.length > 20 ? "text-sm" : "text-sm"}`}
          >
            {gameName}
          </span>
        </div>
      )}
    </div>
  );
};

// Store search bar
const StoreSearchBar = ({ isSelected, searchQuery, onClick, t, buttons }) => {
  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-4 rounded-xl px-6 py-4 transition-all duration-150 ${isSelected ? "scale-[1.02] bg-primary text-secondary" : "bg-muted/80 text-slate-400 hover:bg-muted"}`}
    >
      <Search className="h-6 w-6" />
      <span className="text-lg font-medium">
        {searchQuery || t("bigPicture.searchGame")}
      </span>
      {searchQuery && (
        <span className="ml-auto text-sm opacity-70">
          Press {buttons.confirm} to modify
        </span>
      )}
    </div>
  );
};

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
        <span className="text-xs font-semibold text-white/90">
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
  ];
  return (
    <div
      className={`fixed inset-y-0 left-0 z-[10000] flex w-[350px] transform flex-col bg-card p-8 shadow-2xl transition-transform duration-200 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      <h2 className="mb-10 border-b border-border pb-4 text-2xl font-light tracking-widest text-primary">
        {t("bigPicture.menu")}
      </h2>
      <div className="flex flex-col gap-4">
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

// --- ACTIVE DOWNLOAD COMPONENT ---
const ActiveDownloadsBar = ({ downloads, t }) => {
  if (!downloads || downloads.length === 0) return null;

  return (
    <div className="absolute bottom-20 left-24 right-24 z-50 flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400">
        <Download className="h-4 w-4" /> {t("bigPicture.activeDownloads")} (
        {downloads.length})
      </h3>
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
        {downloads.map(game => {
          const data = game.downloadingData || {};
          const progress = parseFloat(data.progressCompleted || 0);
          const speed = data.progressDownloadSpeeds || "0 KB/s";

          // Calculate downloaded from progress and total size
          const total = game.size || "0 MB";
          const calculateDownloaded = () => {
            if (!game.size || progress === 0) return "0 MB";
            const sizeMatch = game.size.match(/([\d.]+)\s*(GB|MB|KB)/);
            if (!sizeMatch) return "0 MB";
            const sizeValue = parseFloat(sizeMatch[1]);
            const sizeUnit = sizeMatch[2];
            const downloadedValue = ((sizeValue * progress) / 100).toFixed(2);
            return `${downloadedValue} ${sizeUnit}`;
          };
          const downloaded = calculateDownloaded();

          const status = data.extracting
            ? t("bigPicture.extracting")
            : data.verifying
              ? t("bigPicture.verifying")
              : t("bigPicture.downloading");

          return (
            <div
              key={game.game}
              className="flex min-w-[300px] max-w-[400px] flex-1 flex-col gap-2 rounded-lg border border-white/10 bg-muted/90 p-3 shadow-lg backdrop-blur"
            >
              <div className="flex items-center justify-between text-xs font-bold uppercase">
                <span className="max-w-[180px] truncate text-primary">{game.game}</span>
                <span className="text-primary">{speed}</span>
              </div>

              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${data.extracting ? "animate-pulse bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-400">
                <span>
                  {downloaded} / {total}
                </span>
                <span>{progress.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- BIG PICTURE DOWNLOAD CARD ---
const BigPictureDownloadCard = ({
  game,
  isSelected,
  torboxState,
  onPause,
  onResume,
  onKill,
  onOpenFolder,
  isStopping,
  isResuming,
  t,
  buttons,
}) => {
  const [selectedActionIndex, setSelectedActionIndex] = React.useState(0);
  const data = game.downloadingData || {};
  const progress = parseFloat(data.progressCompleted || 0);
  const speed = data.progressDownloadSpeeds || "0 KB/s";

  // Calculate downloaded from progress and total size
  const total = game.size || "0 MB";
  const calculateDownloaded = () => {
    if (!game.size || progress === 0) return "0 MB";
    const sizeMatch = game.size.match(/([\d.]+)\s*(GB|MB|KB)/);
    if (!sizeMatch) return "0 MB";
    const sizeValue = parseFloat(sizeMatch[1]);
    const sizeUnit = sizeMatch[2];
    const downloadedValue = ((sizeValue * progress) / 100).toFixed(2);
    return `${downloadedValue} ${sizeUnit}`;
  };
  const downloaded = calculateDownloaded();

  const isDownloading = data.downloading;
  const isExtracting = data.extracting;
  const isVerifying = data.verifying;
  const isPaused = data.stopped;
  const hasError = data.error || (data.verifyError && data.verifyError.length > 0);

  const getStatus = () => {
    if (hasError) return { text: t("downloads.error"), color: "text-red-500" };
    if (isResuming) return { text: t("downloads.resuming"), color: "text-amber-500" };
    if (isStopping) return { text: t("downloads.pausing"), color: "text-amber-500" };
    if (isPaused) return { text: t("downloads.paused"), color: "text-slate-400" };
    if (isExtracting) return { text: t("downloads.extracting"), color: "text-amber-500" };
    if (isVerifying) return { text: t("downloads.verifying"), color: "text-green-500" };
    if (isDownloading) return { text: t("downloads.downloading"), color: "text-primary" };
    return { text: t("downloads.pending"), color: "text-slate-400" };
  };

  const status = getStatus();

  const getActions = () => {
    if (hasError) {
      return [
        { label: t("downloads.openFolder"), icon: FolderOpen, action: onOpenFolder },
        { label: t("downloads.kill"), icon: Trash2, action: onKill, danger: true },
      ];
    }
    if (isPaused) {
      return [
        { label: t("downloads.resume"), icon: Play, action: onResume },
        { label: t("downloads.openFolder"), icon: FolderOpen, action: onOpenFolder },
        { label: t("downloads.kill"), icon: Trash2, action: onKill, danger: true },
      ];
    }
    if (isDownloading) {
      return [
        { label: t("downloads.pause"), icon: Pause, action: onPause },
        { label: t("downloads.openFolder"), icon: FolderOpen, action: onOpenFolder },
        { label: t("downloads.kill"), icon: Trash2, action: onKill, danger: true },
      ];
    }
    return [
      { label: t("downloads.openFolder"), icon: FolderOpen, action: onOpenFolder },
      { label: t("downloads.kill"), icon: Trash2, action: onKill, danger: true },
    ];
  };

  const actions = getActions();

  // Handle gamepad input for action selection
  React.useEffect(() => {
    if (!isSelected) {
      setSelectedActionIndex(0);
      return;
    }

    const handleGamepadInput = () => {
      const input = getGamepadInput();
      if (!input) return;

      if (input.left && selectedActionIndex > 0) {
        setSelectedActionIndex(p => p - 1);
      } else if (input.right && selectedActionIndex < actions.length - 1) {
        setSelectedActionIndex(p => p + 1);
      } else if (input.a) {
        actions[selectedActionIndex]?.action();
      }
    };

    const interval = setInterval(handleGamepadInput, 150);
    return () => clearInterval(interval);
  }, [isSelected, selectedActionIndex, actions]);

  return (
    <div
      className={`relative rounded-xl border-2 p-6 transition-all duration-200 ${
        isSelected
          ? "scale-[1.02] border-primary bg-primary/10 shadow-lg shadow-primary/20"
          : "border-border/50 bg-card/50"
      }`}
    >
      {/* Game Name and Status */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="mb-1 text-xl font-bold text-primary">{game.game}</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{game.size}</span>
            {!hasError && !isPaused && !hasError && (
              <span className={`text-sm font-semibold ${status.color}`}>
                • {status.text}
              </span>
            )}
            {isDownloading && !hasError && (
              <span className="text-xs text-muted-foreground">• {speed}</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar - Only show for downloading, not extracting */}
      {!hasError && !isExtracting && (
        <div className="mb-4">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${
                isVerifying ? "bg-green-500" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {downloaded} / {total}
            </span>
            <span className="font-bold">{progress.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Extraction Progress */}
      {isExtracting && !hasError && (
        <div className="mb-4 space-y-3">
          {data.extractionProgress?.totalFiles > 0 ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">
                    {parseFloat(data.extractionProgress.percentComplete || 0).toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">
                    {data.extractionProgress.filesExtracted} /{" "}
                    {data.extractionProgress.totalFiles} files
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                    style={{
                      width: `${parseFloat(data.extractionProgress.percentComplete || 0)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <Loader className="h-4 w-4 animate-spin text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {t("downloads.extracting")}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {data.extractionProgress.extractionSpeed}
                    </span>
                  </div>
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={data.extractionProgress.currentFile}
                  >
                    {data.extractionProgress.currentFile ||
                      t("downloads.extractingDescription")}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="relative h-3 overflow-hidden rounded-full bg-muted/50">
                <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-amber-500/20 via-amber-500 to-amber-500/20" />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <Loader className="h-4 w-4 animate-spin text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("downloads.extracting")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("downloads.preparingExtraction") || "Preparing extraction..."}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Error Message */}
      {hasError && (
        <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <p className="text-sm text-red-500">
            {data.error ||
              (data.verifyError && data.verifyError[0]) ||
              t("downloads.unknownError")}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {actions.map((action, idx) => (
          <button
            key={idx}
            onClick={action.action}
            disabled={isStopping || isResuming}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              isSelected && idx === selectedActionIndex
                ? action.danger
                  ? "scale-105 bg-red-500 text-white shadow-lg"
                  : "scale-105 bg-primary text-white shadow-lg"
                : action.danger
                  ? "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                  : "bg-primary/20 text-primary hover:bg-primary/30"
            } ${isStopping || isResuming ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </button>
        ))}
      </div>

      {/* Controller Hint */}
      {isSelected && (
        <div className="mt-4 flex items-center justify-center gap-4 border-t border-border/50 pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="rounded bg-primary/20 px-2 py-1 font-bold text-primary">
              ← →
            </span>
            {t("bigPicture.navigate")}
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded bg-primary/20 px-2 py-1 font-bold text-primary">
              {buttons.confirm}
            </span>
            {t("bigPicture.select")}
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded bg-primary/20 px-2 py-1 font-bold text-primary">
              {buttons.cancel}
            </span>
            {t("bigPicture.back")}
          </span>
        </div>
      )}
    </div>
  );
};

const useHideCursorOnGamepad = () => {
  useEffect(() => {
    let lastCursorState = "auto";

    // Function to show cursor
    const showCursor = () => {
      if (lastCursorState !== "auto") {
        document.body.style.cursor = "auto";
        lastCursorState = "auto";
      }
    };

    // Function to hide cursor
    const hideCursor = () => {
      if (lastCursorState !== "none") {
        document.body.style.cursor = "none";
        lastCursorState = "none";
      }
    };

    window.addEventListener("mousemove", showCursor);
    window.addEventListener("mousedown", showCursor);

    // Loop for controller
    let animationFrameId;
    const loop = () => {
      const gp = getGamepadInput();

      if (gp) {
        const isGamepadActive = Object.values(gp).some(value => value === true);

        if (isGamepadActive) {
          hideCursor();
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    // Cleanup when leaving the screen
    return () => {
      window.removeEventListener("mousemove", showCursor);
      window.removeEventListener("mousedown", showCursor);
      cancelAnimationFrame(animationFrameId);
      document.body.style.cursor = "auto";
    };
  }, []);
};

export default function BigPicture() {
  useHideCursorOnGamepad();
  const { t } = useLanguage();
  const { settings, updateSetting } = useSettings();
  const controllerType = settings.controllerType || "xbox";
  const buttons = getControllerButtons(controllerType);
  // Enter full-screen on mount, quit on unmount
  useEffect(() => {
    const enterFullScreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        // Silently ignore fullscreen errors (browser requires user gesture)
      }
    };

    enterFullScreen();

    // Prevent Escape key from exiting fullscreen
    const preventEscapeFullscreen = e => {
      if (e.key === "Escape" && document.fullscreenElement) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", preventEscapeFullscreen, { capture: true });

    // Quit full-screen when leaving Big Picture
    return () => {
      document.removeEventListener("keydown", preventEscapeFullscreen, { capture: true });
      if (document.fullscreenElement) {
        document
          .exitFullscreen()
          .catch(err => console.error("Error exiting fullscreen:", err));
      }
    };
  }, []);
  const [allGames, setAllGames] = useState([]);
  const [carouselGames, setCarouselGames] = useState([]);
  const [storeGames, setStoreGames] = useState([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [selectedStoreGame, setSelectedStoreGame] = useState(null);
  const [view, setView] = useState("carousel");
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showExitBigPictureDialog, setShowExitBigPictureDialog] = useState(false);
  const [showControllerSettings, setShowControllerSettings] = useState(false);
  const [downloadingGame, setDownloadingGame] = useState(null);
  const [selectedInstalledGame, setSelectedInstalledGame] = useState(null);
  const [installedGameView, setInstalledGameView] = useState(false);

  // New state for active downloads
  const [downloadingGames, setDownloadingGames] = useState([]);
  const [torboxStates, setTorboxStates] = useState({}); // webdownloadId -> state
  const [downloadsIndex, setDownloadsIndex] = useState(0);
  const [stoppingDownloads, setStoppingDownloads] = useState(new Set());
  const [resumingDownloads, setResumingDownloads] = useState(new Set());
  const [showKillDialog, setShowKillDialog] = useState(false);
  const [gameToKill, setGameToKill] = useState(null);
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [providerDialogGame, setProviderDialogGame] = useState(null);
  const [providerDialogProviders, setProviderDialogProviders] = useState([]);
  const providerDialogJustClosed = useRef(false);

  // Fuzzy matcher instance for search
  const fuzzyMatch = useMemo(() => createFuzzyMatcher(), []);

  const [storeSearchQuery, setStoreSearchQuery] = useState("");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isSearchBarSelected, setIsSearchBarSelected] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState("qwerty");

  // Enhanced filtering and sorting states
  const [selectedSort, setSelectedSort] = useState("weight");
  const [showDLC, setShowDLC] = useState(false);
  const [showOnline, setShowOnline] = useState(false);

  const [carouselIndex, setCarouselIndex] = useState(0);
  const [libraryIndex, setLibraryIndex] = useState(0);
  const [storeIndex, setStoreIndex] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [homeSidebarIndex, setHomeSidebarIndex] = useState(-1); // -1 means not focused on sidebar
  const [isHomeSidebarActive, setIsHomeSidebarActive] = useState(false);

  const [displayedCount, setDisplayedCount] = useState(30);
  const loaderRef = useRef(null);
  const GAMES_PER_LOAD = 30;

  const navigate = useNavigate();
  const lastNavTime = useRef(0);
  const lastActionTime = useRef(0);
  const GRID_COLS = 6;

  // --- DOWNLOAD POLLING ---
  useEffect(() => {
    const fetchDownloadingGames = async () => {
      try {
        const games = await window.electron.getGames();
        const downloading = games.filter(game => {
          const { downloadingData } = game;
          return (
            downloadingData &&
            (downloadingData.downloading ||
              downloadingData.extracting ||
              downloadingData.updating ||
              downloadingData.verifying ||
              downloadingData.stopped ||
              (downloadingData.verifyError && downloadingData.verifyError.length > 0) ||
              downloadingData.error)
          );
        });
        setDownloadingGames(downloading);
      } catch (error) {
        console.error("Error polling downloads:", error);
      }
    };

    fetchDownloadingGames();
    const intervalId = setInterval(fetchDownloadingGames, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // --- TORBOX POLLING ---
  useEffect(() => {
    if (!settings?.torboxApiKey) return;

    const pollTorboxStates = async () => {
      try {
        // Get all downloading games that have a torboxWebdownloadId
        const torboxDownloads = downloadingGames.filter(game => game.torboxWebdownloadId);

        if (torboxDownloads.length === 0) return;

        // Poll each TorBox download
        const newStates = {};
        for (const game of torboxDownloads) {
          try {
            const state = await torboxService.checkDownloadState(
              settings.torboxApiKey,
              game.torboxWebdownloadId
            );
            if (state && state.length > 0) {
              newStates[game.torboxWebdownloadId] = state[0];
            }
          } catch (error) {
            console.error(
              `Error checking TorBox state for ${game.torboxWebdownloadId}:`,
              error
            );
          }
        }

        setTorboxStates(newStates);
      } catch (error) {
        console.error("Error polling TorBox states:", error);
      }
    };

    // Poll immediately and then every 5 seconds
    pollTorboxStates();
    const intervalId = setInterval(pollTorboxStates, 5000);
    return () => clearInterval(intervalId);
  }, [downloadingGames, settings?.torboxApiKey]);

  // --- DOWNLOAD LOGIC ---
  const handleStartDownload = async (game, preferredProvider = null) => {
    const seamlessProviders = ["gofile", "buzzheavier", "pixeldrain"];
    const links = game.download_links;

    // Determine torbox providers based on prioritizeTorboxOverSeamless setting
    const prioritizeTorbox = settings.prioritizeTorboxOverSeamless;
    const torboxProviders = prioritizeTorbox
      ? Object.keys(links || {}).filter(provider => links[provider]?.length > 0)
      : ["1fichier", "megadb"];

    // Check if we should use TorBox for this provider
    const shouldUseTorbox = provider =>
      torboxProviders.includes(provider) && torboxService.isEnabled(settings);

    // Find the provider to use (preferred or first available)
    let selectedProvider = null;
    let downloadUrl = null;

    // If a preferred provider is specified and available, use it
    if (preferredProvider && links[preferredProvider]) {
      selectedProvider = preferredProvider;
      const providerLinks = links[preferredProvider];
      downloadUrl = Array.isArray(providerLinks)
        ? providerLinks.find(link => link && typeof link === "string")
        : typeof providerLinks === "string"
          ? providerLinks
          : null;
    }

    // Otherwise find first available provider (seamless or torbox based on settings)
    if (!downloadUrl) {
      // If TorBox is prioritized and enabled, check for torbox providers first
      if (prioritizeTorbox && torboxService.isEnabled(settings)) {
        for (const provider of torboxProviders) {
          if (links[provider]) {
            selectedProvider = provider;
            const providerLinks = links[provider];
            downloadUrl = Array.isArray(providerLinks)
              ? providerLinks.find(link => link && typeof link === "string")
              : typeof providerLinks === "string"
                ? providerLinks
                : null;
            if (downloadUrl) break;
          }
        }
      } else {
        // Otherwise, prioritize seamless providers
        for (const provider of seamlessProviders) {
          if (links[provider]) {
            selectedProvider = provider;
            const providerLinks = links[provider];
            downloadUrl = Array.isArray(providerLinks)
              ? providerLinks.find(link => link && typeof link === "string")
              : typeof providerLinks === "string"
                ? providerLinks
                : null;
            if (downloadUrl) break;
          }
        }
      }
    }

    if (!downloadUrl || !selectedProvider) {
      toast.error(t("bigPicture.downloadError"));
      return;
    }

    // Check if this is a seamless provider that should NOT use TorBox
    const isSeamlessWithoutTorbox =
      seamlessProviders.includes(selectedProvider) && !shouldUseTorbox(selectedProvider);

    if (isSeamlessWithoutTorbox) {
      // Seamless download - start it directly
      try {
        // Properly format the link
        downloadUrl = downloadUrl.replace(/^(?:https?:)?\/{2}/, "https://");

        const sanitizedGameName = sanitizeText(game.game);
        const isVrGame = game.category?.includes("Virtual Reality");

        // Start the download
        await window.electron.downloadFile(
          downloadUrl,
          sanitizedGameName,
          game.online || false,
          game.dlc || false,
          isVrGame || false,
          false, // updateFlow
          game.version || "",
          game.imgID,
          game.size || "",
          0, // dir index
          game.gameID || ""
        );

        toast.success(t("bigPicture.downloadStarted"));
        changeView("downloads");
      } catch (error) {
        console.error("Error starting download:", error);
        toast.error(t("bigPicture.downloadError"));
      }
    } else {
      // Non-seamless or TorBox download - show exit dialog
      setDownloadingGame(game);
      setShowExitDialog(true);
    }
  };

  const handlePauseDownload = async game => {
    setStoppingDownloads(prev => new Set([...prev, game.game]));
    try {
      const result = await window.electron.stopDownload(game.game, false);
      if (!result) {
        throw new Error("Failed to pause download");
      }
      toast.success(t("downloads.pauseSuccess"));
    } catch (error) {
      console.error("Error pausing download:", error);
      toast.error(t("downloads.errors.pauseFailed"));
    } finally {
      setStoppingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(game.game);
        return newSet;
      });
    }
  };

  const handleKillDownload = game => {
    // Show confirmation dialog
    setGameToKill(game);
    setShowKillDialog(true);
  };

  const executeKillDownload = async () => {
    if (!gameToKill) return;

    setStoppingDownloads(prev => new Set([...prev, gameToKill.game]));
    try {
      const result = await window.electron.stopDownload(gameToKill.game, true);
      if (!result) {
        throw new Error("Failed to kill download");
      }
      setDownloadingGames(prev => prev.filter(g => g.game !== gameToKill.game));
      toast.success(t("downloads.killSuccess"));
    } catch (error) {
      console.error("Error killing download:", error);
      toast.error(t("downloads.errors.killFailed"));
    } finally {
      setStoppingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(gameToKill.game);
        return newSet;
      });
      setShowKillDialog(false);
      setGameToKill(null);
    }
  };

  const handleResumeDownload = async game => {
    setResumingDownloads(prev => new Set([...prev, game.game]));
    try {
      const result = await window.electron.resumeDownload(game.game);
      if (result.success) {
        toast.success(t("downloads.resumeSuccess"));
      } else {
        setResumingDownloads(prev => {
          const newSet = new Set(prev);
          newSet.delete(game.game);
          return newSet;
        });
        toast.error(t("downloads.resumeError"));
      }
    } catch (error) {
      console.error("Error resuming download:", error);
      setResumingDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(game.game);
        return newSet;
      });
      toast.error(t("downloads.resumeError"));
    }
  };

  const handleOpenFolder = async game => {
    await window.electron.openGameDirectory(game.game);
  };

  // --- INSTALLED GAME DETAILS HANDLERS ---
  const handleShowInstalledGameDetails = game => {
    setSelectedInstalledGame(game);
    setInstalledGameView(true);
  };

  const handleCloseInstalledGameDetails = useCallback(() => {
    console.log("[CLOSE GAME DETAILS] Resetting view");

    // Use functional updates to ensure we're working with latest state
    setInstalledGameView(prev => {
      console.log(
        "[CLOSE GAME DETAILS] Setting installedGameView from",
        prev,
        "to false"
      );
      return false;
    });
    setSelectedInstalledGame(null);

    // Reset any active sidebar state
    setIsHomeSidebarActive(false);
    setHomeSidebarIndex(-1);
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electron.getSettings();
        if (settings?.bigPictureKeyboardLayout) {
          setKeyboardLayout(settings.bigPictureKeyboardLayout);
        }
      } catch (e) {}
    };
    loadSettings();
  }, []);

  // Debounced search for better performance
  const debouncedSearchQuery = useDebouncedValue(storeSearchQuery, 300);

  const filteredStoreGames = useMemo(() => {
    let filtered = storeGames;

    // Apply search filter
    if (debouncedSearchQuery.trim()) {
      filtered = filtered.filter(game => {
        const gameTitle = game.game || game.name || "";
        const gameDesc = game.desc || "";
        return fuzzyMatch(gameTitle + " " + gameDesc, debouncedSearchQuery);
      });
    }

    // Apply content filters (DLC/Online)
    if (showDLC || showOnline) {
      filtered = filtered.filter(game => {
        if (showDLC && showOnline) {
          return game.dlc || game.online;
        } else if (showDLC) {
          return game.dlc;
        } else if (showOnline) {
          return game.online;
        }
        return true;
      });
    }

    // Apply sorting
    const sortFn = (() => {
      switch (selectedSort) {
        case "weight":
          return (a, b) => (b.weight || 0) - (a.weight || 0);
        case "weight-asc":
          return (a, b) => (a.weight || 0) - (b.weight || 0);
        case "name":
          return (a, b) => (a.game || a.name || "").localeCompare(b.game || b.name || "");
        case "name-desc":
          return (a, b) => (b.game || b.name || "").localeCompare(a.game || a.name || "");
        case "latest_update-desc":
          return (a, b) => {
            if (!a.latest_update && !b.latest_update) return 0;
            if (!a.latest_update) return 1;
            if (!b.latest_update) return -1;
            return new Date(b.latest_update) - new Date(a.latest_update);
          };
        default:
          return null;
      }
    })();

    return sortFn ? [...filtered].sort(sortFn) : filtered;
  }, [storeGames, debouncedSearchQuery, fuzzyMatch, showDLC, showOnline, selectedSort]);

  const displayedStoreGames = useMemo(() => {
    return filteredStoreGames.slice(0, displayedCount);
  }, [filteredStoreGames, displayedCount]);

  const hasMore = displayedCount < filteredStoreGames.length;

  const searchSuggestions = useMemo(() => {
    if (!storeSearchQuery.trim()) return [];
    return filteredStoreGames.slice(0, 20);
  }, [filteredStoreGames, storeSearchQuery]);

  const changeView = useCallback(newView => {
    setCarouselIndex(0);
    setLibraryIndex(0);
    setStoreIndex(0);

    setIsSearchBarSelected(false);

    setStoreSearchQuery("");
    setView(newView);
    setDisplayedCount(30);
  }, []);

  useEffect(() => {
    if (view !== "store") return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore) {
          setDisplayedCount(prev => prev + GAMES_PER_LOAD);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, view, displayedCount]);

  // Reset pagination if search changes
  useEffect(() => {
    setDisplayedCount(30);
    setStoreIndex(0);
  }, [storeSearchQuery]);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const installed = await window.electron.getGames();
        let custom = [];
        try {
          custom = await window.electron.getCustomGames();
        } catch (e) {}
        let games = [...installed, ...custom];

        setAllGames(games);

        // Get recently played games using the service (same logic as Home.jsx)
        const recentlyPlayed = recentGamesService.getRecentGames();

        // Combine installed and custom games
        const actuallyInstalledGames = [
          ...(installed || []).map(game => ({
            ...game,
            isCustom: false,
          })),
          ...(custom || []).map(game => ({
            name: game.game,
            game: game.game,
            version: game.version,
            online: game.online,
            dlc: game.dlc,
            executable: game.executable,
            isCustom: true,
          })),
        ];

        // Filter out games that are no longer installed and merge with full game details
        const recentGames = recentlyPlayed
          .filter(recentGame =>
            actuallyInstalledGames.some(g => g.game === recentGame.game)
          )
          .map(recentGame => {
            const gameDetails = games.find(g => g.game === recentGame.game);
            return {
              ...gameDetails,
              lastPlayed: recentGame.lastPlayed,
            };
          });

        let carousel = recentGames.length > 0 ? [...recentGames] : [...games];
        if (carousel.length > 20) {
          carousel = carousel.slice(0, 20);
          carousel.push({
            isSeeMore: true,
            game: t("bigPicture.seeMore"),
            name: t("bigPicture.seeMore"),
          });
        }
        setCarouselGames(carousel);
      } catch (error) {}
    };
    fetchGames();
  }, []);

  useEffect(() => {
    const fetchStore = async () => {
      if (storeGames.length > 0) return;
      setStoreLoading(true);
      try {
        const response = await gameService.getAllGames();
        let list = Array.isArray(response) ? response : response.games || [];
        setStoreGames(list);
      } catch (e) {
        toast.error(t("bigPicture.unableToLoadCatalog"));
      } finally {
        setStoreLoading(false);
      }
    };
    if (view === "store") fetchStore();
  }, [view, storeGames.length]);

  useEffect(() => {
    if (isMenuOpen) {
      if (view === "carousel") setMenuIndex(0);
      else if (view === "library") setMenuIndex(1);
      else if (view === "store") setMenuIndex(2);
      else if (view === "downloads") setMenuIndex(3);
    }
  }, [isMenuOpen, view]);

  const handleSelectSuggestion = useCallback(game => {
    setIsKeyboardOpen(false);
    setSelectedStoreGame(game);
    setView("details");
  }, []);

  const handleConfirmSearch = useCallback(() => {
    setIsKeyboardOpen(false);
    setIsSearchBarSelected(false);
    if (filteredStoreGames.length > 0) setStoreIndex(0);
  }, [filteredStoreGames.length]);

  const handleSelectStoreGame = useCallback((game, index) => {
    setIsSearchBarSelected(false);
    setStoreIndex(index);
    setSelectedStoreGame(game);
    setView("details");
  }, []);

  // --- MAIN NAVIGATION LOGIC (SHARED BETWEEN KEYBOARD & GAMEPAD) ---
  const handleNavigation = useCallback(
    action => {
      console.log(
        "[NAV]",
        action,
        "→",
        view,
        "| installedGameView:",
        installedGameView,
        "| isKeyboardOpen:",
        isKeyboardOpen
      );

      // Block all navigation when any dialog is open
      if (
        showExitDialog ||
        showExitBigPictureDialog ||
        showControllerSettings ||
        showKillDialog ||
        showProviderDialog
      ) {
        const dialogType = showKillDialog
          ? "kill"
          : showProviderDialog
            ? "provider"
            : showExitDialog
              ? "exit"
              : showExitBigPictureDialog
                ? "exitBP"
                : "settings";
        console.log(`[NAV] Blocked by ${dialogType} dialog`);
        return;
      }

      if (isKeyboardOpen) {
        console.log("[NAV] Blocked by keyboard");
        return;
      }

      // Allow InstalledGameDetailsView to handle its own navigation
      if (installedGameView) {
        console.log("[NAV] Blocked by installedGameView - letting component handle it");
        return;
      }

      // Allow GameDetailsView to handle its own navigation
      if (view === "details" && action === "MENU") {
        setIsMenuOpen(true);
        return;
      } else if (view === "details") {
        // GameDetailsView handles all other navigation internally
        return;
      }

      if (isMenuOpen) {
        if (action === "DOWN") setMenuIndex(p => Math.min(p + 1, 6));
        else if (action === "UP") setMenuIndex(p => Math.max(p - 1, 0));
        else if (action === "BACK" || action === "MENU") setIsMenuOpen(false);
        else if (action === "CONFIRM") {
          setIsMenuOpen(false);
          // Menu items: 0=HOME, 1=LIBRARY, 2=CATALOG, 3=DOWNLOADS, 4=SETTINGS, 5=EXIT BIG PICTURE, 6=CLOSE ASCENDARA
          if (menuIndex === 0) {
            changeView("carousel");
          } else if (menuIndex === 1) {
            changeView("library");
          } else if (menuIndex === 2) {
            changeView("store");
          } else if (menuIndex === 3) {
            changeView("downloads");
          } else if (menuIndex === 4) {
            setShowControllerSettings(true);
          } else if (menuIndex === 5) {
            setShowExitBigPictureDialog(true);
          } else if (menuIndex === 6) {
            // Close Ascendara completely
            if (window.electron && window.electron.closeApp) {
              window.electron.closeApp();
            } else {
              window.close();
            }
          }
        }
        return;
      }

      if (view === "details") return;

      if (view === "downloads") {
        const maxIndex = downloadingGames.length - 1;

        if (action === "DOWN") {
          setDownloadsIndex(p => Math.min(p + 1, maxIndex));
        } else if (action === "UP") {
          setDownloadsIndex(p => Math.max(p - 1, 0));
        } else if (action === "BACK") {
          changeView("carousel");
        } else if (action === "MENU") {
          setIsMenuOpen(true);
        }
        return;
      }

      if (view === "library") {
        const maxIndex = allGames.length - 1;

        if (action === "RIGHT") {
          const isAtRowEnd = (libraryIndex + 1) % GRID_COLS === 0;
          if (!isAtRowEnd && libraryIndex < maxIndex) {
            setLibraryIndex(p => {
              console.log("[LIBRARY] RIGHT:", p, "→", p + 1);
              return p + 1;
            });
          } else {
            console.log("[LIBRARY] RIGHT blocked - at row end or max");
          }
        } else if (action === "LEFT") {
          const isAtRowStart = libraryIndex % GRID_COLS === 0;
          if (!isAtRowStart && libraryIndex > 0) {
            setLibraryIndex(p => {
              console.log("[LIBRARY] LEFT:", p, "→", p - 1);
              return p - 1;
            });
          } else {
            console.log("[LIBRARY] LEFT blocked - at row start");
          }
        } else if (action === "DOWN") {
          if (libraryIndex + GRID_COLS <= maxIndex) {
            setLibraryIndex(p => {
              console.log("[LIBRARY] DOWN:", p, "→", p + GRID_COLS);
              return p + GRID_COLS;
            });
          }
        } else if (action === "UP") {
          if (libraryIndex >= GRID_COLS) {
            setLibraryIndex(p => {
              console.log("[LIBRARY] UP:", p, "→", p - GRID_COLS);
              return p - GRID_COLS;
            });
          }
        } else if (action === "MENU") setIsMenuOpen(true);
        else if (action === "BACK") changeView("carousel");
        else if (action === "CONFIRM" && allGames[libraryIndex])
          handleShowInstalledGameDetails(allGames[libraryIndex]);
        return;
      }

      if (view === "store") {
        const maxIndex = filteredStoreGames.length - 1;

        if (isSearchBarSelected) {
          if (action === "DOWN" && displayedStoreGames.length > 0) {
            setIsSearchBarSelected(false);
            setStoreIndex(0);
          } else if (action === "CONFIRM") setIsKeyboardOpen(true);
          else if (action === "BACK") {
            if (storeSearchQuery) setStoreSearchQuery("");
            else changeView("carousel");
          } else if (action === "MENU") setIsMenuOpen(true);
        } else {
          if (action === "RIGHT") {
            const isAtRowEnd = (storeIndex + 1) % GRID_COLS === 0;
            if (!isAtRowEnd && storeIndex < maxIndex) {
              setStoreIndex(p => p + 1);
            }
          } else if (action === "LEFT") {
            const isAtRowStart = storeIndex % GRID_COLS === 0;
            if (!isAtRowStart && storeIndex > 0) {
              setStoreIndex(p => p - 1);
            }
          } else if (action === "DOWN") {
            if (storeIndex + GRID_COLS <= maxIndex) {
              setStoreIndex(p => p + GRID_COLS);
            }
          } else if (action === "UP") {
            const newIdx = storeIndex - GRID_COLS;
            if (newIdx < 0) {
              setIsSearchBarSelected(true);
            } else {
              setStoreIndex(newIdx);
            }
          } else if (action === "MENU") setIsMenuOpen(true);
          else if (action === "BACK") setIsSearchBarSelected(true);
          else if (action === "CONFIRM" && displayedStoreGames[storeIndex]) {
            handleSelectStoreGame(displayedStoreGames[storeIndex], storeIndex);
          }
        }

        if (storeIndex >= displayedCount - GRID_COLS && hasMore) {
          setDisplayedCount(prev => prev + GAMES_PER_LOAD);
        }
        return;
      }

      // Default: Carousel
      const currentList = carouselGames;

      if (action === "RIGHT" && isHomeSidebarActive) {
        setIsHomeSidebarActive(false);
        setHomeSidebarIndex(-1);
      } else if (action === "UP" && isHomeSidebarActive) {
        setHomeSidebarIndex(p => Math.max(p - 1, 0));
      } else if (action === "DOWN" && isHomeSidebarActive) {
        setHomeSidebarIndex(p => Math.min(p + 1, 4));
      } else if (action === "CONFIRM" && isHomeSidebarActive) {
        // Execute sidebar action
        if (homeSidebarIndex === 0) {
          changeView("carousel");
        } else if (homeSidebarIndex === 1) {
          changeView("library");
        } else if (homeSidebarIndex === 2) {
          changeView("store");
        } else if (homeSidebarIndex === 3) {
          changeView("downloads");
        } else if (homeSidebarIndex === 4) {
          setShowExitBigPictureDialog(true);
        }
        setIsHomeSidebarActive(false);
        setHomeSidebarIndex(-1);
      } else if (action === "RIGHT") {
        setCarouselIndex(p => {
          const newIndex = Math.min(p + 1, currentList.length - 1);
          if (newIndex !== p) console.log("[CAROUSEL] RIGHT:", p, "→", newIndex);
          return newIndex;
        });
      } else if (action === "LEFT") {
        setCarouselIndex(p => {
          const newIndex = Math.max(p - 1, 0);
          if (newIndex !== p) console.log("[CAROUSEL] LEFT:", p, "→", newIndex);
          return newIndex;
        });
      } else if (action === "UP") {
        // Activate sidebar from carousel
        setIsHomeSidebarActive(true);
        setHomeSidebarIndex(0);
      } else if (action === "DOWN") {
        // Activate sidebar from carousel
        setIsHomeSidebarActive(true);
        setHomeSidebarIndex(0);
      } else if (action === "MENU") setIsMenuOpen(true);
      else if (action === "CONFIRM") {
        const game = currentList[carouselIndex];
        if (game?.isSeeMore) changeView("library");
        else if (game) handleShowInstalledGameDetails(game);
      }
    },
    [
      isKeyboardOpen,
      isMenuOpen,
      installedGameView,
      isHomeSidebarActive,
      homeSidebarIndex,
      menuIndex,
      view,
      allGames,
      libraryIndex,
      filteredStoreGames.length,
      isSearchBarSelected,
      displayedStoreGames,
      storeIndex,
      storeSearchQuery,
      displayedCount,
      hasMore,
      carouselGames,
      carouselIndex,
      changeView,
      navigate,
      handleSelectStoreGame,
      handleShowInstalledGameDetails,
      downloadingGame,
      showExitDialog,
      showExitBigPictureDialog,
      showControllerSettings,
    ]
  );

  // Keyboard Event Listener
  useEffect(() => {
    const handleKeyDown = e => {
      // Block navigation when any dialog is open or just closed
      if (
        showExitDialog ||
        showExitBigPictureDialog ||
        showControllerSettings ||
        showKillDialog ||
        showProviderDialog ||
        providerDialogJustClosed.current ||
        isKeyboardOpen
      )
        return;

      const now = Date.now();
      if (now - lastNavTime.current < 100) return;

      const keyMap = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        Enter: "CONFIRM",
        Escape: "BACK",
        Backspace: "BACK",
        Tab: "MENU",
        m: "MENU",
        ContextMenu: "MENU",
      };

      if (keyMap[e.key]) {
        lastNavTime.current = now;
        handleNavigation(keyMap[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleNavigation,
    showExitDialog,
    showExitBigPictureDialog,
    showControllerSettings,
    showKillDialog,
    showProviderDialog,
    isKeyboardOpen,
  ]);

  // GAMEPAD POLLING LOOP for Main Navigation
  useEffect(() => {
    let animationFrameId;

    const loop = () => {
      // Block navigation when any dialog is open or just closed
      if (
        showExitDialog ||
        showExitBigPictureDialog ||
        showControllerSettings ||
        showKillDialog ||
        showProviderDialog ||
        providerDialogJustClosed.current ||
        isKeyboardOpen
      ) {
        animationFrameId = requestAnimationFrame(loop);
        return;
      }

      const gp = getGamepadInput();
      if (gp) {
        const now = Date.now();
        const timeSinceLastNav = now - lastNavTime.current;

        if (timeSinceLastNav > 170) {
          let handledNav = false;

          if (gp.up) {
            handleNavigation("UP");
            handledNav = true;
          } else if (gp.down) {
            handleNavigation("DOWN");
            handledNav = true;
          } else if (gp.left) {
            handleNavigation("LEFT");
            handledNav = true;
          } else if (gp.right) {
            handleNavigation("RIGHT");
            handledNav = true;
          }

          if (handledNav) {
            lastNavTime.current = now;
          }
        }

        // 2. ACTIONS
        if (now - lastActionTime.current > 250) {
          let handledAction = false;

          if (gp.a) {
            handleNavigation("CONFIRM");
            handledAction = true;
          } else if (gp.b) {
            handleNavigation("BACK");
            handledAction = true;
          } else if (gp.menu) {
            handleNavigation("MENU");
            handledAction = true;
          }

          if (handledAction) lastActionTime.current = now;
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    handleNavigation,
    showExitDialog,
    showExitBigPictureDialog,
    showControllerSettings,
    showKillDialog,
    showProviderDialog,
    isKeyboardOpen,
  ]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex h-screen w-screen flex-col overflow-hidden bg-background text-primary ${showKillDialog || showProviderDialog ? "pointer-events-none" : ""}`}
    >
      <Toaster
        position="top-center"
        richColors
        toastOptions={{
          style: {
            zIndex: 999999,
            background: "rgba(0, 0, 0, 0.95)",
            border: "2px solid rgba(59, 130, 246, 0.5)",
            color: "white",
            fontSize: "18px",
            fontWeight: "bold",
            padding: "20px 30px",
            borderRadius: "16px",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(59, 130, 246, 0.3)",
            backdropFilter: "blur(10px)",
            minWidth: "400px",
          },
          className: "big-picture-toast",
        }}
      />

      {isKeyboardOpen && (
        <VirtualKeyboard
          value={storeSearchQuery}
          onChange={setStoreSearchQuery}
          onClose={() => setIsKeyboardOpen(false)}
          onConfirm={handleConfirmSearch}
          suggestions={searchSuggestions}
          onSelectSuggestion={handleSelectSuggestion}
          layout={keyboardLayout}
          t={t}
          controllerType={settings.controllerType || "xbox"}
        />
      )}

      {showExitDialog && (
        <ExitDialog
          isOpen={showExitDialog}
          onClose={() => setShowExitDialog(false)}
          onConfirm={() => {
            setShowExitDialog(false);
            if (downloadingGame) {
              navigate("/download", {
                state: {
                  gameData: downloadingGame,
                },
              });
            } else {
              navigate("/");
            }
          }}
          t={t}
          controllerType={settings.controllerType || "xbox"}
        />
      )}

      {showExitBigPictureDialog && (
        <ExitBigPictureDialog
          isOpen={showExitBigPictureDialog}
          onClose={() => setShowExitBigPictureDialog(false)}
          onConfirm={async () => {
            setShowExitBigPictureDialog(false);
            // Exit fullscreen before navigating
            if (document.fullscreenElement) {
              try {
                await document.exitFullscreen();
              } catch (err) {
                console.error("Error exiting fullscreen:", err);
              }
            }
            navigate("/");
          }}
          t={t}
          controllerType={settings.controllerType || "xbox"}
        />
      )}

      {showControllerSettings && (
        <BigPictureSettingsDialog
          isOpen={showControllerSettings}
          onClose={() => setShowControllerSettings(false)}
          t={t}
          currentType={settings.controllerType || "xbox"}
          currentKeyboardLayout={keyboardLayout}
          controllerType={settings.controllerType || "xbox"}
          onTypeChange={newType => {
            updateSetting("controllerType", newType);
            toast.success(`Controller type set to ${newType}`);
          }}
          onKeyboardLayoutChange={newLayout => {
            setKeyboardLayout(newLayout);
            updateSetting("bigPictureKeyboardLayout", newLayout);
            toast.success(`Keyboard layout set to ${newLayout.toUpperCase()}`);
          }}
        />
      )}

      <div
        className={`absolute inset-0 z-[9000] bg-background/60 transition-opacity duration-200 ${isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <SidebarMenu
        isOpen={isMenuOpen}
        selectedIndex={menuIndex}
        t={t}
        buttons={buttons}
        onItemClick={idx => {
          setIsMenuOpen(false);
          // Menu items: 0=HOME, 1=LIBRARY, 2=CATALOG, 3=DOWNLOADS, 4=SETTINGS, 5=EXIT BIG PICTURE, 6=CLOSE ASCENDARA
          if (idx === 0) {
            changeView("carousel");
          } else if (idx === 1) {
            changeView("library");
          } else if (idx === 2) {
            changeView("store");
          } else if (idx === 3) {
            changeView("downloads");
          } else if (idx === 4) {
            setShowControllerSettings(true);
          } else if (idx === 5) {
            setShowExitBigPictureDialog(true);
          } else if (idx === 6) {
            if (window.electron && window.electron.closeApp) {
              window.electron.closeApp();
            } else {
              window.close();
            }
          }
        }}
      />

      {view !== "details" && (
        <div
          className={`absolute left-24 top-16 z-20 transition-all duration-200 ${isMenuOpen || isKeyboardOpen ? "opacity-50 blur-sm" : ""}`}
        >
          <h1 className="flex items-center gap-4 text-3xl font-light uppercase tracking-[0.2em] text-primary">
            <span className="h-1 w-12 rounded-full bg-primary shadow-[0_0_15px_hsl(var(--primary)/0.8)]"></span>
            {view === "library"
              ? t("bigPicture.library")
              : view === "store"
                ? t("bigPicture.catalog")
                : view === "downloads"
                  ? t("bigPicture.downloads")
                  : t("bigPicture.home")}
          </h1>
        </div>
      )}

      <div
        className={`relative flex w-full flex-1 items-center pb-16 transition-all duration-200 ${isMenuOpen ? "scale-95 opacity-50 blur-sm" : ""}`}
      >
        {view === "carousel" && (
          <>
            {/* Home screen sidebar navigation */}
            <HomeSidebar
              selectedIndex={isHomeSidebarActive ? homeSidebarIndex : -1}
              t={t}
              onItemClick={idx => {
                if (idx === 0) {
                  changeView("carousel");
                } else if (idx === 1) {
                  changeView("library");
                } else if (idx === 2) {
                  changeView("store");
                } else if (idx === 3) {
                  changeView("downloads");
                } else if (idx === 4) {
                  // Exit Big Picture - always show exit confirmation dialog
                  setShowExitBigPictureDialog(true);
                }
                setIsHomeSidebarActive(false);
                setHomeSidebarIndex(-1);
              }}
              isVisible={!isKeyboardOpen && !isMenuOpen}
              buttons={buttons}
              controllerType={settings.controllerType || "xbox"}
            />

            <div
              id="big-picture-scroll-container"
              className="no-scrollbar flex h-[65vh] w-screen max-w-[100vw] items-center overflow-x-auto overflow-y-visible scroll-smooth px-24"
            >
              <div className="flex h-[42vh] items-center gap-4 pl-6 pt-12">
                {carouselGames.map((game, index) => (
                  <GameCard
                    key={index}
                    game={game}
                    index={index}
                    isSelected={index === carouselIndex && !isMenuOpen}
                    onClick={() => setCarouselIndex(index)}
                    isGridMode={false}
                    t={t}
                  />
                ))}
                <div className="w-[60vw] flex-shrink-0"></div>
              </div>
            </div>
            {/* Show active downloads in carousel view */}
            <ActiveDownloadsBar downloads={downloadingGames} t={t} />
          </>
        )}

        {view === "library" && (
          <div className="no-scrollbar h-full w-full overflow-y-auto scroll-smooth px-24 pb-8 pt-32">
            <div className="grid grid-cols-6 gap-6">
              {allGames.map((game, index) => (
                <GameCard
                  key={index}
                  game={game}
                  index={index}
                  isSelected={index === libraryIndex && !isMenuOpen}
                  onClick={() => setLibraryIndex(index)}
                  isGridMode={true}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}

        {view === "store" && (
          <div className="no-scrollbar flex h-full w-full flex-col overflow-y-auto scroll-smooth px-24 pt-28">
            <div className="mb-4 flex-shrink-0">
              <StoreSearchBar
                isSelected={isSearchBarSelected && !isMenuOpen && !isKeyboardOpen}
                searchQuery={storeSearchQuery}
                onClick={() => {
                  setIsSearchBarSelected(true);
                  setIsKeyboardOpen(true);
                }}
                t={t}
                buttons={buttons}
              />
              {storeSearchQuery && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {filteredStoreGames.length}{" "}
                  {filteredStoreGames.length > 1
                    ? t("bigPicture.resultsForPlural")
                    : t("bigPicture.resultsFor")}{" "}
                  "{storeSearchQuery}"
                </p>
              )}
            </div>

            {storeLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                  <p className="text-xl text-muted-foreground">
                    {t("bigPicture.loadingCatalog")}
                  </p>
                </div>
              </div>
            ) : filteredStoreGames.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <Search className="h-16 w-16 text-primary" />
                  <p className="text-xl text-muted-foreground">
                    {storeSearchQuery
                      ? t("bigPicture.noGameFound")
                      : t("bigPicture.noGameAvailable")}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-6 gap-6 pb-4">
                  {displayedStoreGames.map((game, index) => (
                    <StoreGameCard
                      key={game.imgID || `store-${index}`}
                      game={game}
                      isSelected={
                        index === storeIndex && !isSearchBarSelected && !isMenuOpen
                      }
                      onClick={() => handleSelectStoreGame(game, index)}
                    />
                  ))}
                </div>
                <div ref={loaderRef} className="flex w-full justify-center py-10">
                  {hasMore && (
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary"></div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {view === "downloads" && (
          <div className="no-scrollbar flex h-full w-full flex-col overflow-y-auto scroll-smooth px-24 pt-28">
            {downloadingGames.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="relative">
                  {/* Glowing background effect */}
                  <div className="absolute inset-0 -z-10 animate-pulse">
                    <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
                  </div>

                  <div className="flex flex-col items-center gap-8 text-center">
                    {/* Coffee icon with animated steam */}
                    <div className="relative">
                      <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 shadow-lg shadow-primary/20">
                        <Coffee className="h-12 w-12 text-primary" />
                      </div>
                      {/* Animated steam effect */}
                      <div className="absolute -top-2 left-1/2 flex -translate-x-1/2 gap-1">
                        <div
                          className="h-6 w-1 animate-pulse rounded-full bg-primary/30 blur-sm"
                          style={{ animationDelay: "0s", animationDuration: "2s" }}
                        />
                        <div
                          className="h-8 w-1 animate-pulse rounded-full bg-primary/40 blur-sm"
                          style={{ animationDelay: "0.3s", animationDuration: "2.2s" }}
                        />
                        <div
                          className="h-6 w-1 animate-pulse rounded-full bg-primary/30 blur-sm"
                          style={{ animationDelay: "0.6s", animationDuration: "2s" }}
                        />
                      </div>
                    </div>

                    {/* Text content */}
                    <div className="space-y-4">
                      <h2 className="text-4xl font-light uppercase tracking-[0.2em] text-primary">
                        {t("downloads.noDownloads")}
                      </h2>
                      <p className="mx-auto max-w-md text-base text-muted-foreground/80">
                        {t("downloads.noDownloadsMessage")}
                      </p>
                    </div>

                    {/* Decorative line with dots */}
                    <div className="flex items-center gap-3">
                      <div className="h-px w-16 bg-gradient-to-r from-transparent to-primary/30" />
                      <div className="flex gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary/50 shadow-sm shadow-primary/50" />
                        <span className="h-2 w-2 rounded-full bg-primary/70 shadow-md shadow-primary/70" />
                        <span className="h-2 w-2 rounded-full bg-primary/50 shadow-sm shadow-primary/50" />
                      </div>
                      <div className="h-px w-16 bg-gradient-to-l from-transparent to-primary/30" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-6 pb-8">
                {downloadingGames.map((game, index) => (
                  <BigPictureDownloadCard
                    key={game.game}
                    game={game}
                    isSelected={index === downloadsIndex && !isMenuOpen}
                    torboxState={
                      game.torboxWebdownloadId
                        ? torboxStates[game.torboxWebdownloadId]
                        : undefined
                    }
                    onPause={() => handlePauseDownload(game)}
                    onResume={() => handleResumeDownload(game)}
                    onKill={() => handleKillDownload(game)}
                    onOpenFolder={() => handleOpenFolder(game)}
                    isStopping={stoppingDownloads.has(game.game)}
                    isResuming={resumingDownloads.has(game.game)}
                    t={t}
                    buttons={buttons}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {view === "details" && selectedStoreGame && (
          <GameDetailsView
            game={selectedStoreGame}
            onBack={() => {
              setView("store");
              setSelectedStoreGame(null);
            }}
            onDownload={handleStartDownload}
            onShowProviderDialog={(game, providers) => {
              setProviderDialogGame(game);
              setProviderDialogProviders(providers);
              setShowProviderDialog(true);
            }}
            t={t}
            controllerType={settings.controllerType || "xbox"}
            dialogOpen={
              showExitDialog ||
              showProviderDialog ||
              showKillDialog ||
              providerDialogJustClosed.current
            }
          />
        )}

        {installedGameView && selectedInstalledGame && (
          <InstalledGameDetailsView
            game={selectedInstalledGame}
            onBack={handleCloseInstalledGameDetails}
            t={t}
            controllerType={settings.controllerType || "xbox"}
          />
        )}
      </div>

      {/* Kill Download Confirmation Dialog */}
      {showKillDialog && gameToKill && (
        <KillDownloadDialog
          isOpen={showKillDialog}
          game={gameToKill}
          onClose={() => {
            setShowKillDialog(false);
            setGameToKill(null);
          }}
          onConfirm={executeKillDownload}
          t={t}
          controllerType={settings.controllerType || "xbox"}
          isLoading={gameToKill && stoppingDownloads.has(gameToKill.game)}
        />
      )}

      {/* Provider Selection Dialog */}
      {showProviderDialog && providerDialogGame && (
        <ProviderSelectionDialog
          isOpen={showProviderDialog}
          game={providerDialogGame}
          providers={providerDialogProviders}
          onClose={() => {
            setShowProviderDialog(false);
            setProviderDialogGame(null);
            setProviderDialogProviders([]);
            providerDialogJustClosed.current = true;
            setTimeout(() => {
              providerDialogJustClosed.current = false;
            }, 500);
          }}
          onConfirm={provider => {
            setShowProviderDialog(false);
            setProviderDialogGame(null);
            setProviderDialogProviders([]);
            providerDialogJustClosed.current = true;
            setTimeout(() => {
              providerDialogJustClosed.current = false;
            }, 500);
            handleStartDownload(providerDialogGame, provider);
          }}
          t={t}
          controllerType={settings.controllerType || "xbox"}
        />
      )}

      {view !== "details" && !isKeyboardOpen && !installedGameView && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-[100] flex h-16 items-center justify-between border-t border-white/5 bg-card/90 px-16 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] transition-all duration-200 ${isMenuOpen ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
        >
          <div
            className="flex cursor-pointer items-center gap-3 font-bold tracking-widest text-primary transition-colors hover:text-primary/80"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu className="h-6 w-6" />
            <span>{t("bigPicture.menu")}</span>
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {buttons.menu}
            </span>
          </div>
          <div className="flex gap-12 text-sm font-bold tracking-widest text-primary">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 ${getButtonWidthClass(buttons.confirm, "w-8")} items-center justify-center ${getButtonBadgeClass(controllerType)} bg-primary text-xs font-black text-secondary shadow-lg`}
              >
                {buttons.confirm}
              </span>
              {view === "store" && isSearchBarSelected
                ? t("bigPicture.search")
                : view === "store"
                  ? t("bigPicture.select")
                  : t("bigPicture.play")}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 ${getButtonWidthClass(buttons.cancel, "w-8")} items-center justify-center ${getButtonBadgeClass(controllerType)} border border-border bg-muted text-xs font-black text-muted-foreground`}
              >
                {buttons.cancel}
              </span>
              {view === "carousel" ? t("bigPicture.exit") : t("bigPicture.back")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
