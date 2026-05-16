import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Folder,
  FolderOpen,
  File,
  Check,
  X,
  Home,
  ArrowUp,
  Monitor,
  Loader,
} from "lucide-react";

// Gamepad polling
const getGamepadInput = () => {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = Array.from(gamepads).find(
    (g) => g && g.connected && (g.axes.length >= 2 || g.buttons.length >= 10)
  );
  if (!gp) return null;
  const threshold = 0.5;
  return {
    up: gp.buttons[12]?.pressed || gp.axes[1] < -threshold,
    down: gp.buttons[13]?.pressed || gp.axes[1] > threshold,
    left: gp.buttons[14]?.pressed || gp.axes[0] < -threshold,
    right: gp.buttons[15]?.pressed || gp.axes[0] > threshold,
    a: gp.buttons[0]?.pressed,
    b: gp.buttons[1]?.pressed,
    x: gp.buttons[2]?.pressed,
    lb: gp.buttons[4]?.pressed,
    rb: gp.buttons[5]?.pressed,
  };
};

// Helpers
const getFileName = (p) => (p ? p.replace(/\\/g, "/").split("/").pop() : "");
const getParentPath = (p) => {
  if (!p) return null;
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  parts.pop();
  return parts.join("/") || "/";
};
const isExecutable = (name) =>
  /\.(exe|bat|cmd|sh|app)$/i.test(name || "");
const isFolder = (entry) => entry.type === "directory" || entry.isDirectory;

// Breadcrumb builder
const buildCrumbs = (path) => {
  if (!path) return [];
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.map((p, i) => ({
    label: p,
    path: parts.slice(0, i + 1).join("/"),
  }));
};

// Main Component
/**
 * GamepadFileBrowser
 *
 * Props:
 *   isOpen          {boolean}   – show/hide
 *   onClose         {function}  – called when user cancels
 *   onSelect        {function}  – called with the selected executable path
 *   initialPath     {string}    – optional starting directory
 *   title           {string}    – dialog title
 *   filterExe       {boolean}   – if true, only show folders + executables
 *   controllerType  {string}    – 'xbox' | 'playstation' | 'keyboard'
 *   t               {function}  – i18n helper (falls back gracefully)
 *
 * Requires window.electron API:
 *   window.electron.listDirectory(path)  → [{ name, type, path }]
 *   window.electron.getDrives()          → [{ name, path }]   (optional)
 */
const GamepadFileBrowser = ({
  isOpen,
  onClose,
  onSelect,
  initialPath = null,
  title = t("bigPicture.selectExecutable"),
  filterExe = true,
  controllerType = "xbox",
  t = (k, fb) => fb || k,
}) => {
  const [currentPath, setCurrentPath] = useState(null);
  const [entries, setEntries] = useState([]);
  const [drives, setDrives] = useState([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [canInput, setCanInput] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null); // confirmed selection
  const [view, setView] = useState("drives"); // 'drives' | 'files'

  const lastInputTime = useRef(0);
  const lastButtonState = useRef({});
  const listRef = useRef(null);
  const focusedRef = useRef(null);

  // Button labels by controller type
  const btnLabels = {
    xbox: { confirm: "A", cancel: "B", up: "LB", down: "RB" },
    playstation: { confirm: "✕", cancel: "○", up: "L1", down: "R1" },
    keyboard: { confirm: "Enter", cancel: "Esc", up: "PgUp", down: "PgDn" },
    generic: { confirm: "A", cancel: "B", up: "LB", down: "RB" },
  };
  const btn = btnLabels[controllerType] || btnLabels.xbox;
  const isKeyboard = controllerType === "keyboard";
  const badgeClass = isKeyboard ? "rounded-md" : "rounded-full";

  // Load drives on open
  useEffect(() => {
    if (!isOpen) return;
    setFocusedIndex(0);
    setSelectedFile(null);
    setError(null);

    const init = async () => {
      if (initialPath) {
        await loadDirectory(initialPath);
      } else {
        await loadDrives();
      }
    };
    init();

    const timer = setTimeout(() => setCanInput(true), 350);
    return () => {
      clearTimeout(timer);
      setCanInput(false);
    };
  }, [isOpen]);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusedRef.current) {
      focusedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedIndex]);

  // Block parent events when browser is open
  useEffect(() => {
    if (isOpen) {
        window.__fileBrowserOpen = true;
    } else {
        window.__fileBrowserOpen = false;
    }
    return () => {
        window.__fileBrowserOpen = false;
    };
  }, [isOpen]);  

  // Load drives
  const loadDrives = async () => {
    setLoading(true);
    setError(null);
    try {
      const driveList = await window.electron.getDrives?.();
      if (driveList && driveList.length > 0) {
        setDrives(driveList);
        setView("drives");
        setFocusedIndex(0);
        setCurrentPath(null);
      } else {
        // Fallback: try common paths
        setDrives([
          { name: "C:\\", path: "C:\\" },
          { name: "D:\\", path: "D:\\" },
        ]);
        setView("drives");
        setFocusedIndex(0);
      }
    } catch {
      setDrives([{ name: "C:\\", path: "C:\\" }]);
      setView("drives");
    }
    setLoading(false);
  };

  // Load directory
  const loadDirectory = async (path) => {
    setLoading(true);
    setError(null);
    try {
      const rawEntries = await window.electron.listDirectory(path);
      let filtered = rawEntries || [];
      if (filterExe) {
        filtered = filtered.filter(
          (e) => isFolder(e) || isExecutable(e.name)
        );
      }
      // Sort: folders first, then files
      filtered.sort((a, b) => {
        const af = isFolder(a) ? 0 : 1;
        const bf = isFolder(b) ? 0 : 1;
        if (af !== bf) return af - bf;
        return (a.name || "").localeCompare(b.name || "");
      });
      setEntries(filtered);
      setCurrentPath(path);
      setView("files");
      setFocusedIndex(0);
    } catch (err) {
      setError(`Cannot open: ${path}`);
    }
    setLoading(false);
  };

  // Navigate into entry
  const openEntry = useCallback(
    (entry) => {
      if (isFolder(entry)) {
        loadDirectory(entry.path || `${currentPath}/${entry.name}`);
      } else {
        // It's a file; confirm selection
        const filePath = entry.path || `${currentPath}/${entry.name}`;
        onSelect?.(filePath);
        onClose?.();
      }
    },
    [currentPath, onSelect, onClose]
  );

  const openDrive = useCallback((drive) => {
    loadDirectory(drive.path);
  }, []);

  const goUp = useCallback(() => {
    if (view === "files" && currentPath) {
      const parent = getParentPath(currentPath);
      if (parent) {
        loadDirectory(parent);
      } else {
        loadDrives();
      }
    } else if (view === "drives") {
      onClose?.();
    }
  }, [view, currentPath, onClose]);

  // Input handler
  const handleInput = useCallback(
    (action) => {
      if (!canInput) return;

      const listLen = view === "drives" ? drives.length : entries.length;

      if (action === "UP") {
        setFocusedIndex((p) => Math.max(0, p - 1));
      } else if (action === "DOWN") {
        setFocusedIndex((p) => Math.min(listLen - 1, p + 1));
      } else if (action === "PAGEUP") {
        setFocusedIndex((p) => Math.max(0, p - 8));
      } else if (action === "PAGEDOWN") {
        setFocusedIndex((p) => Math.min(listLen - 1, p + 8));
      } else if (action === "CONFIRM") {
        if (view === "drives") {
          if (drives[focusedIndex]) openDrive(drives[focusedIndex]);
        } else {
          if (entries[focusedIndex]) openEntry(entries[focusedIndex]);
        }
      } else if (action === "BACK") {
        goUp();
      }
    },
    [canInput, view, drives, entries, focusedIndex, openDrive, openEntry, goUp]
  );

  // Keyboard listener
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const map = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        PageUp: "PAGEUP",
        PageDown: "PAGEDOWN",
        Enter: "CONFIRM",
        Escape: "BACK",
        Backspace: "BACK",
      };
      if (map[e.key]) handleInput(map[e.key]);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [isOpen, handleInput]);

  // Gamepad polling
  const bPressStart = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    let rAF;

    const loop = () => {
      const gp = getGamepadInput();
      if (gp && canInput) {
        const now = Date.now();

        // B button
        if (gp.b) {
          if (!lastButtonState.current.b) {
            bPressStart.current = now;
          } else if (bPressStart.current !== null && now - bPressStart.current > 600) {
            bPressStart.current = null;
            lastButtonState.current.b = true;
            window.__bReleasedAt = Date.now();
            onClose?.();
          }
        } else {
          if (lastButtonState.current.b && bPressStart.current !== null) {
            if (now - bPressStart.current < 600) {
              handleInput("BACK");
            }
          }
          bPressStart.current = null;
        }
        lastButtonState.current.b = gp.b;

        const check = (btnName, action, repeat = true) => {
          if (btnName === 'b') return;
          if (gp[btnName]) {
            if (!lastButtonState.current[btnName]) {
              if (now - lastInputTime.current > 150) {
                handleInput(action);
                lastInputTime.current = now;
              }
            } else if (repeat && now - lastInputTime.current > 250) {
              handleInput(action);
              lastInputTime.current = now;
            }
          }
          lastButtonState.current[btnName] = gp[btnName];
        };
        check("up", "UP");
        check("down", "DOWN");
        check("lb", "PAGEUP", false);
        check("rb", "PAGEDOWN", false);
        check("a", "CONFIRM", false);
      }
      rAF = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(rAF);
      window.__bReleasedAt = Date.now();
    };
  }, [isOpen, canInput, handleInput, onClose]);

  if (!isOpen) return null;

  // Breadcrumbs
  const crumbs = currentPath ? buildCrumbs(currentPath) : [];

  // Render item
  const renderEntry = (entry, idx) => {
    const isFocused = focusedIndex === idx;
    const folder = isFolder(entry);
    const Icon = folder ? (isFocused ? FolderOpen : Folder) : File;
    const name = entry.name || getFileName(entry.path);
    const isExe = isExecutable(name);

    return (
      <div
        key={entry.path || idx}
        ref={isFocused ? focusedRef : null}
        onClick={() => openEntry(entry)}
        className={`
          group flex items-center gap-4 rounded-xl px-5 py-3.5 cursor-pointer
          transition-all duration-100 select-none
          ${isFocused
            ? "bg-primary text-secondary scale-[1.01] shadow-lg shadow-primary/20"
            : "text-foreground hover:bg-muted/60"
          }
        `}
      >
        <div className={`flex-shrink-0 ${isFocused ? "text-secondary" : folder ? "text-primary" : isExe ? "text-green-400" : "text-muted-foreground"}`}>
          <Icon className="h-6 w-6" />
        </div>
        <span className={`flex-1 truncate text-base font-medium ${isFocused ? "text-secondary" : ""}`}>
          {name}
        </span>
        {isExe && !isFocused && (
          <span className="rounded-md border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-bold text-green-400">
            .exe
          </span>
        )}
        {isExe && isFocused && (
          <span className="rounded-md border border-secondary/30 bg-secondary/20 px-2 py-0.5 text-xs font-bold text-secondary">
            .exe
          </span>
        )}
        {folder && isFocused && (
          <ChevronRight className="h-5 w-5 text-secondary/70" />
        )}
      </div>
    );
  };

  const renderDrive = (drive, idx) => {
    const isFocused = focusedIndex === idx;
    return (
      <div
        key={drive.path || idx}
        ref={isFocused ? focusedRef : null}
        onClick={() => openDrive(drive)}
        className={`
          group flex items-center gap-4 rounded-xl px-5 py-4 cursor-pointer
          transition-all duration-100 select-none
          ${isFocused
            ? "bg-primary text-secondary scale-[1.01] shadow-lg shadow-primary/20"
            : "text-foreground hover:bg-muted/60"
          }
        `}
      >
        <HardDrive className={`h-7 w-7 flex-shrink-0 ${isFocused ? "text-secondary" : "text-primary"}`} />
        <div className="flex flex-col">
          <span className={`text-lg font-bold ${isFocused ? "text-secondary" : ""}`}>
            {drive.name}
          </span>
          {drive.path && drive.path !== drive.name && (
            <span className={`text-xs ${isFocused ? "text-secondary/70" : "text-muted-foreground"}`}>
              {drive.path}
            </span>
          )}
        </div>
        {isFocused && <ChevronRight className="ml-auto h-5 w-5 text-secondary/70" />}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[35000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-[80vh] w-[70vw] max-w-4xl flex-col rounded-2xl border-2 border-primary/30 bg-background/95 shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95">

        {/* ── Header ── */}
        <div className="flex flex-shrink-0 items-center gap-4 border-b border-border/50 bg-background/95 px-8 py-5">
          <div className="rounded-xl bg-primary/15 p-2.5">
            <Monitor className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground truncate">{title}</h2>
            {/* Breadcrumbs */}
            <div className="mt-1 flex items-center gap-1 overflow-hidden">
              <button
                onClick={loadDrives}
                className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-primary transition-colors"
                tabIndex={-1}
              >
                <Home className="h-3.5 w-3.5" />
              </button>
              {crumbs.map((crumb, i) => (
                <React.Fragment key={crumb.path}>
                  <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
                  <button
                    onClick={() => loadDirectory(crumb.path)}
                    className="max-w-[140px] truncate rounded px-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    tabIndex={-1}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border/30 bg-muted/30 px-8 py-3">
          <button
            onClick={goUp}
            className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/50 hover:text-primary transition-colors"
            tabIndex={-1}
          >
            <ArrowUp className="h-4 w-4" />
            {view === "files" ? t("common.up") : t("common.close")}
          </button>
          <div className="flex-1" />
          {filterExe && (
            <span className="rounded-lg border border-border/40 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("bigPicture.showingFoldersAndExe")}
            </span>
          )}
        </div>

        {/* ── Content ── */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
              <Loader className="h-6 w-6 animate-spin" />
              <span className="text-base">{t("common.loading")}</span>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <X className="h-10 w-10 text-red-400" />
              <p className="text-base">{error}</p>
              <button
                onClick={goUp}
                className="rounded-lg bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80 transition-colors"
                tabIndex={-1}
              >
                Go back
              </button>
            </div>
          ) : view === "drives" ? (
            drives.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <p>{t("bigPicture.noDriveFound")}</p>
              </div>
            ) : (
              drives.map((d, i) => renderDrive(d, i))
            )
          ) : entries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>{t("bigPicture.emptyFolder")}</p>
            </div>
          ) : (
            entries.map((e, i) => renderEntry(e, i))
          )}
        </div>

        {/* ── Hold B to close banner ── */}
        <div className="flex flex-shrink-0 items-center justify-center gap-3 border-t-2 border-red-500/50 bg-red-500/15 px-8 py-3">
          <span className="rounded-full bg-red-500 px-3 py-1 text-sm font-black text-white">B</span>
          <span className="text-sm font-bold text-red-400 uppercase tracking-widest">
            {t("bigPicture.bToClose")}
          </span>
        </div>

        {/* ── Footer Controls ── */}
        <div className="flex flex-shrink-0 items-center justify-between border-t border-border/30 bg-card/80 px-8 py-4">
          <div className="flex-1 min-w-0 mr-6">
            {view !== "drives" && entries[focusedIndex] && !isFolder(entries[focusedIndex]) && (
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5">
                <Check className="h-4 w-4 flex-shrink-0 text-green-400" />
                <span className="truncate text-sm font-medium text-green-400">
                  {entries[focusedIndex].name}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className={`${badgeClass} bg-primary px-2.5 py-1 text-secondary`}>
                {btn.confirm}
              </span>
              {t("bigPicture.openSelect")}
            </span>
            <span className="flex items-center gap-2">
              <span className={`rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground`}>
                {btn.up}
              </span>
              /
              <span className={`rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground`}>
                {btn.down}
              </span>
              {t("bigPicture.page")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GamepadFileBrowser;
