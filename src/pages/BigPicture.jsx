import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  LogOut,
  Power,
  Grid,
  Download,
  Home,
  Zap,
  Check,
  Search,
  X,
  Delete,
  ChevronRight,
  Library,
  MousePointer,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Loader,
  Pause,
  Play,
  Wifi,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import gameService from "@/services/gameService";
import steamService from "@/services/gameInfoService";

// UTILS
const sanitizeText = text => {
  return text.replace(/[^a-z0-9]/gi, "_").toLowerCase();
};

const formatBytes = (bytes, decimals = 2) => {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

// GAMEPAD UTILS
const getGamepadInput = () => {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gamepads[0]; // First connected controller

  if (!gp) return null;

  // Joysticks deadzone
  const threshold = 0.5;

  return {
    up: gp.buttons[12]?.pressed || gp.axes[1] < -threshold,
    down: gp.buttons[13]?.pressed || gp.axes[1] > threshold,
    left: gp.buttons[14]?.pressed || gp.axes[0] < -threshold,
    right: gp.buttons[15]?.pressed || gp.axes[0] > threshold,
    a: gp.buttons[0]?.pressed,
    b: gp.buttons[1]?.pressed,
    x: gp.buttons[2]?.pressed,
    y: gp.buttons[3]?.pressed,
    menu: gp.buttons[9]?.pressed || gp.buttons[8]?.pressed,
    lb: gp.buttons[4]?.pressed,
    rb: gp.buttons[5]?.pressed,
  };
};

// Launching function
const launchGame = async game => {
  if (!game) return;
  try {
    const gameName = game.game || game.name;
    console.log("Launching :", gameName);
    await window.electron.playGame(
      gameName,
      game.isCustom || false,
      game.backups || false,
      false,
      null,
      false
    );
  } catch (error) {
    console.error("Launching error:", error);
    toast.error("Unable to launch the game");
  }
};

// Seamless verification
const checkSeamlessAvailable = game => {
  if (!game || !game.download_links) return false;

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

// Virtual keyboard
const VirtualKeyboard = ({
  value,
  onChange,
  onClose,
  onConfirm,
  suggestions,
  onSelectSuggestion,
  layout = "qwerty",
}) => {
  const [selectedRow, setSelectedRow] = useState(0);
  const [selectedCol, setSelectedCol] = useState(0);
  const [inSuggestions, setInSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);

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
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="border-t-2 border-primary/30 bg-background p-6 pb-10 duration-200 animate-in slide-in-from-bottom">
        <div className="mx-auto mb-6 flex max-w-5xl items-center gap-4 rounded-xl border-2 border-primary/50 bg-card p-4">
          <Search className="h-6 w-6 flex-shrink-0 text-primary/80" />
          <span className="flex-1 truncate text-2xl font-medium text-white">
            {value || <span className="text-muted-foreground/80">Search...</span>}
            <span className="ml-1 animate-pulse text-primary/80">|</span>
          </span>
          {value && (
            <button onClick={() => onChange("")}>
              <X className="h-6 w-6 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="mx-auto mb-2 flex max-w-5xl justify-end gap-4 text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
          <span>
            <span className="mr-1 rounded-sm bg-white px-1 text-black">X</span>Del
          </span>
          <span>
            <span className="mr-1 rounded-sm bg-white px-1 text-black">Y</span>Space
          </span>
        </div>

        {visibleSuggestions.length > 0 && (
          <div className="no-scrollbar mx-auto mb-4 flex max-w-5xl gap-2 overflow-x-auto pb-2">
            {visibleSuggestions.map((game, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSuggestion(game)}
                className={`flex flex-shrink-0 items-center gap-2 rounded-lg px-4 py-2 transition-all ${inSuggestions && suggestionIndex === idx ? "scale-105 bg-blue-600 text-white" : "bg-card text-slate-300"}`}
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
                          ? "scale-[1.02] bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)]"
                          : "scale-[1.02] bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                        : isEnter
                          ? "bg-green-700 text-white"
                          : isDel
                            ? "bg-red-900/50 text-white"
                            : "bg-card text-white hover:bg-slate-700"
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
const GameDetailsView = ({ game, onBack, onDownload }) => {
  const isSeamless = checkSeamlessAvailable(game);
  const [showMedia, setShowMedia] = useState(false);
  const [steamData, setSteamData] = useState(null);
  const [loadingMedia, setLoadingMedia] = useState(false);

  const [canInput, setCanInput] = useState(false);
  const lastInputTime = useRef(0);

  // Background Image
  const bgImage = game.imgID
    ? `https://api.ascendara.app/v2/image/${game.imgID}`
    : game.cover || game.image;

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
      setLoadingMedia(true);
      try {
        const data = await steamService.getGameDetails(gameName);
        if (isMounted && data) {
          setSteamData(data);
        }
      } catch (error) {
        console.error("Error fetching steam data:", error);
      } finally {
        if (isMounted) setLoadingMedia(false);
      }
    };
    fetchGameData();
    return () => {
      isMounted = false;
    };
  }, [game]);

  const handleInput = useCallback(
    action => {
      if (!canInput) return;

      if (action === "DOWN") {
        if (!showMedia) setShowMedia(true);
      } else if (action === "UP") {
        if (showMedia) setShowMedia(false);
      } else if (action === "BACK") {
        if (showMedia) setShowMedia(false);
        else onBack();
      } else if (action === "CONFIRM") {
        if (!showMedia) onDownload(game);
      }
    },
    [showMedia, onBack, onDownload, game, canInput]
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
  }, [handleInput, canInput]);

  const hasScreenshots = steamData?.screenshots && steamData.screenshots.length > 0;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col overflow-hidden bg-background text-foreground">
      <div
        className="absolute inset-0 z-0 opacity-30 transition-opacity duration-1000"
        style={{
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(60px) saturate(150%)",
        }}
      />

      <div className="absolute inset-0 z-0 bg-gradient-to-r from-background via-background/70 to-transparent" />

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
            <h1 className="mb-6 text-6xl font-black leading-tight tracking-tight drop-shadow-lg">
              {game.name || game.game}
            </h1>
            <div className="mb-6 flex flex-wrap gap-3">
              {game.category &&
                game.category.slice(0, 4).map((cat, idx) => (
                  <span
                    key={idx}
                    className="rounded-lg border border-white/10 bg-white/10 px-4 py-1.5 text-sm font-bold uppercase tracking-wider backdrop-blur-sm"
                  >
                    {cat}
                  </span>
                ))}
            </div>

            <div className="mb-8 flex gap-6 text-muted-foreground">
              {game.size && (
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  <span className="font-medium">{game.size}</span>
                </div>
              )}
            </div>

            <p className="mb-10 line-clamp-4 max-w-xl text-xl leading-relaxed text-slate-300 drop-shadow-md">
              {game.desc || "Failed to fetch description."}
            </p>

            <button
              onClick={() => onDownload(game)}
              className="group flex w-fit items-center gap-4 rounded-2xl bg-white px-10 py-5 text-2xl font-black text-black shadow-xl shadow-black/30 transition-all duration-200 hover:scale-105 hover:bg-blue-400 hover:text-white"
            >
              <Download className="h-7 w-7" />
              <span>DOWNLOAD</span>
            </button>

            <div className="mt-8">
              {isSeamless ? (
                <div className="flex w-fit items-center gap-4 rounded-xl border border-green-500/30 bg-green-500/20 px-6 py-3 text-base font-medium backdrop-blur-md">
                  <Check className="h-6 w-6 text-green-400" />
                  <span className="text-green-400">Ready to download</span>
                </div>
              ) : (
                <div className="flex w-fit items-center gap-4 rounded-xl border border-primary/30 bg-primary/20 px-6 py-3 text-base font-medium backdrop-blur-md">
                  <MousePointer className="h-6 w-6 text-primary/80" />
                  <span className="text-primary/80">Mouse required (Website)</span>
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 animate-bounce flex-col items-center gap-2 opacity-60">
            <span className="text-xs font-bold uppercase tracking-widest">
              {hasScreenshots ? "Screenshots" : "Media Info"}
            </span>
            <ChevronDown className="h-6 w-6" />
          </div>
        </div>

        <div className="relative flex h-full w-full flex-shrink-0 flex-col">
          <div className="absolute inset-0 -z-10 bg-background/90 backdrop-blur-md" />
          <div className="z-20 flex items-center gap-4 border-b border-white/5 px-24 py-12">
            <ImageIcon className="h-8 w-8 text-primary" />
            <h2 className="text-4xl font-light tracking-wider">MEDIA</h2>
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto p-12 px-24 pb-32">
            {steamData?.screenshots ? (
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
                {steamData.screenshots.map((screen, idx) => (
                  <div
                    key={screen.id || idx}
                    className="group relative aspect-video overflow-hidden rounded-xl border-2 border-transparent bg-card transition-all hover:scale-[1.02] hover:border-primary"
                  >
                    <img
                      src={screen.path_thumbnail || screen.path_full}
                      alt={`Screenshot ${idx + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground/80">
                <p>No screenshots available.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="fixed bottom-12 right-16 z-50 flex gap-10 text-sm font-bold tracking-widest text-muted-foreground">
        {!showMedia && (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-black text-black shadow-lg">
              A
            </span>{" "}
            DOWNLOAD
          </div>
        )}
        <div
          className="flex cursor-pointer items-center gap-3 transition-colors hover:text-white"
          onClick={() => handleInput("BACK")}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-600 bg-card text-sm">
            B
          </span>{" "}
          {showMedia ? "UP / BACK" : "BACK"}
        </div>
      </div>
    </div>
  );
};

// Store card component
const StoreGameCard = React.memo(({ game, isSelected, onClick }) => {
  const cardRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const imageUrl = game.imgID ? `https://api.ascendara.app/v2/image/${game.imgID}` : null;

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
    setIsVisible(false);
  }, [game.imgID]);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`relative flex aspect-[2/3] w-full cursor-pointer flex-col justify-end transition-all duration-150 ease-out ${isSelected ? "z-20 scale-105" : "z-10 scale-100 opacity-70"}`}
    >
      <div
        className={`relative z-10 h-full w-full overflow-hidden rounded-xl border-[3px] bg-card shadow-2xl transition-all duration-150 ${isSelected ? "border-white/90 shadow-lg shadow-primary/20 brightness-110" : "border-transparent brightness-75 hover:brightness-100"}`}
      >
        {isVisible && imageUrl ? (
          <img
            src={imageUrl}
            alt={game.game}
            className="h-full w-full object-cover transition-opacity duration-300"
            style={{ objectPosition: "center top" }}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-card text-muted-foreground/80">
            <Download className="mb-2 h-8 w-8 opacity-50" />
            <span className="px-4 text-center text-sm font-bold">{game.game}</span>
          </div>
        )}
      </div>
      {isSelected && (
        <div className="absolute bottom-0 left-0 right-0 z-20 rounded-b-xl bg-gradient-to-t from-black via-black/95 to-transparent p-4 pt-10 text-center">
          <span
            className={`block font-bold leading-tight text-white ${game.game.length > 35 ? "text-xs" : "text-sm"}`}
          >
            {game.game}
          </span>
          {game.size && (
            <span className="mt-1 block text-xs text-muted-foreground">{game.size}</span>
          )}
        </div>
      )}
    </div>
  );
});

// Library card component
const GameCard = ({ game, index, isSelected, onClick, isGridMode }) => {
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
        className={`relative flex flex-shrink-0 flex-col items-center justify-center rounded-xl border-4 bg-card transition-all duration-150 ease-out ${isGridMode ? "aspect-[2/3] w-full" : "aspect-[2/3] h-full"} ${isSelected ? "z-20 scale-105 border-primary shadow-[0_0_30px_rgba(59,130,246,0.5)]" : "z-10 scale-100 border-transparent opacity-80"}`}
      >
        <Grid
          className={`mb-4 h-12 w-12 ${isSelected ? "text-primary/80" : "text-muted-foreground/80"}`}
        />
        <h3 className="px-4 text-center text-xl font-bold">SEE ALL GAMES</h3>
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
        className={`relative z-10 h-full w-full overflow-hidden rounded-xl border-[3px] bg-card shadow-2xl transition-all duration-150 ${isSelected ? "border-white/90 shadow-lg ring-0 brightness-110" : "border-transparent brightness-75 hover:brightness-100"}`}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={gameName}
            className="h-full w-full object-cover"
            style={{ objectPosition: "center top" }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-card text-muted-foreground/80">
            <span className="px-4 text-center text-sm font-bold">{gameName}</span>
          </div>
        )}
      </div>
      {!isGridMode && (
        <div
          className={`pointer-events-none absolute left-1/2 z-30 w-[300px] -translate-x-1/2 text-center transition-all duration-150 ease-out ${isSelected ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"} ${isHero ? "-bottom-20" : "-bottom-14"}`}
        >
          <h3
            className={`font-bold tracking-wide text-foreground drop-shadow-md ${isHero ? "text-3xl" : "text-xl"} ${gameName.length > 25 ? "text-lg leading-tight" : ""}`}
          >
            {gameName}
          </h3>
          {isHero && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-primary-foreground rounded bg-primary px-2 py-0.5 text-[10px] font-bold tracking-wider shadow-lg">
                LAST PLAYED
              </span>
              <span className="text-sm font-medium text-muted-foreground drop-shadow-md">
                {game.playTime ? `${Math.floor(game.playTime / 3600)}h played` : "Ready"}
              </span>
            </div>
          )}
        </div>
      )}
      {isGridMode && isSelected && (
        <div className="absolute bottom-0 left-0 right-0 z-20 rounded-b-xl bg-gradient-to-t from-black via-black/95 to-transparent p-3 pt-8 text-center">
          <span
            className={`block font-bold leading-tight text-white ${gameName.length > 30 ? "text-xs" : gameName.length > 20 ? "text-sm" : "text-sm"}`}
          >
            {gameName}
          </span>
        </div>
      )}
    </div>
  );
};

// Store search bar
const StoreSearchBar = ({ isSelected, searchQuery, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-4 rounded-xl px-6 py-4 transition-all duration-150 ${isSelected ? "scale-[1.02] bg-primary text-white shadow-lg shadow-primary/30" : "bg-card/80 text-muted-foreground hover:bg-slate-700"}`}
    >
      <Search className="h-6 w-6" />
      <span className="text-lg font-medium">{searchQuery || "Search a game..."}</span>
      {searchQuery && (
        <span className="ml-auto text-sm opacity-70">Press A to modify</span>
      )}
    </div>
  );
};

// Side menu
const SidebarMenu = ({ isOpen, selectedIndex }) => {
  const items = [
    { icon: Home, label: "HOME", action: "home" },
    { icon: Grid, label: "LIBRARY", action: "library" },
    { icon: Library, label: "CATALOG", action: "downloads" },
    { icon: LogOut, label: "EXIT BIG PICTURE", action: "exit_bp" },
    { icon: Power, label: "CLOSE ASCENDARA", action: "quit_app", danger: true },
  ];
  return (
    <div
      className={`fixed inset-y-0 left-0 z-[10000] flex w-[350px] transform flex-col border-r border-border bg-card p-8 shadow-2xl transition-transform duration-200 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      <h2 className="mb-10 border-b border-border pb-4 text-2xl font-light tracking-widest text-muted-foreground">
        MENU
      </h2>
      <div className="flex flex-col gap-4">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-4 rounded-lg p-4 transition-all duration-150 ${selectedIndex === idx ? (item.danger ? "scale-105 bg-red-600 text-white shadow-lg shadow-red-900/50" : "scale-105 bg-white text-black shadow-lg") : "text-muted-foreground hover:bg-card"} ${item.action === "exit_bp" ? "mt-auto" : ""}`}
          >
            <item.icon className="h-6 w-6" />
            <span className="font-bold tracking-wide">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto text-center text-xs uppercase tracking-wider text-slate-600">
        Press B to close
      </div>
    </div>
  );
};

// --- ACTIVE DOWNLOAD COMPONENT ---
const ActiveDownloadsBar = ({ downloads }) => {
  if (!downloads || downloads.length === 0) return null;

  return (
    <div className="absolute bottom-20 left-24 right-24 z-50 flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
        <Download className="h-4 w-4" /> Active Downloads ({downloads.length})
      </h3>
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
        {downloads.map(game => {
          const data = game.downloadingData || {};
          const progress = parseFloat(data.progressCompleted || 0);
          const speed = data.progressDownloadSpeeds || "0 KB/s";
          const status = data.extracting
            ? "Extracting..."
            : data.verifying
              ? "Verifying..."
              : "Downloading...";

          return (
            <div
              key={game.game}
              className="flex min-w-[300px] max-w-[400px] flex-1 flex-col gap-2 rounded-lg border border-white/10 bg-card/90 p-3 shadow-lg backdrop-blur"
            >
              <div className="flex items-center justify-between text-xs font-bold uppercase">
                <span className="max-w-[180px] truncate text-white">{game.game}</span>
                <span className="text-primary/80">{speed}</span>
              </div>

              <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${data.extracting ? "animate-pulse bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-muted-foreground">
                <span>{status}</span>
                <span>{progress.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
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
  // Switch to full-screen
  useEffect(() => {
    const enterFullScreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.error("Error entering fullscreen:", err);
      }
    };

    enterFullScreen();

    // Quit full-screen when leaving Big Picture
    return () => {
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

  // New state for active downloads
  const [downloadingGames, setDownloadingGames] = useState([]);

  const [storeSearchQuery, setStoreSearchQuery] = useState("");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isSearchBarSelected, setIsSearchBarSelected] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState("qwerty");

  const [carouselIndex, setCarouselIndex] = useState(0);
  const [libraryIndex, setLibraryIndex] = useState(0);
  const [storeIndex, setStoreIndex] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  // --- DOWNLOAD LOGIC ---
  const handleStartDownload = async game => {
    const sanitizedGameName = sanitizeText(game.game || game.name);

    // Check if download directory exists (simple check)
    const settings = await window.electron.getSettings();
    if (!settings.downloadDirectory) {
      toast.error("No download directory set in settings");
      return;
    }

    // Determine Provider
    let selectedProvider = "";
    let directUrl = "";
    const links = game.download_links;

    if (links) {
      const availableProviders = Object.keys(links).filter(
        p => links[p] && links[p].length > 0
      );

      // Priority list: Gofile > Buzzheavier > 1fichier > others
      if (availableProviders.includes("gofile")) selectedProvider = "gofile";
      else if (availableProviders.includes("buzzheavier"))
        selectedProvider = "buzzheavier";
      else if (availableProviders.includes("1fichier")) selectedProvider = "1fichier";
      else if (availableProviders.length > 0) selectedProvider = availableProviders[0];
    }

    if (selectedProvider && links[selectedProvider]) {
      // Get first link
      let providerLink = Array.isArray(links[selectedProvider])
        ? links[selectedProvider][0]
        : links[selectedProvider];

      // Simple formatting
      if (providerLink && !providerLink.startsWith("http")) {
        if (providerLink.startsWith("//")) providerLink = "https:" + providerLink;
        else providerLink = "https://" + providerLink;
      }
      directUrl = providerLink;
    }

    if (!directUrl) {
      toast.error("No compatible download link found.");
      return;
    }

    toast.info(`Starting download: ${game.game}`);
    changeView("carousel"); // Go back to home to see progress

    try {
      const isVrGame = game.category?.includes("Virtual Reality");

      await window.electron.downloadFile(
        directUrl,
        sanitizedGameName,
        game.online || false,
        game.dlc || false,
        isVrGame || false,
        false, // isUpdating
        game.version || "",
        game.imgID,
        game.size || "",
        0, // Default dir index
        game.gameID || ""
      );
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to start download");
    }
  };

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

  const filteredStoreGames = useMemo(() => {
    if (!storeSearchQuery.trim()) return storeGames;
    const query = storeSearchQuery.toLowerCase();
    return storeGames.filter(game =>
      (game.game || game.name || "").toLowerCase().includes(query)
    );
  }, [storeGames, storeSearchQuery]);

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
        games.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));

        setAllGames(games);

        let carousel = [...games];
        if (carousel.length > 20) {
          carousel = carousel.slice(0, 20);
          carousel.push({ isSeeMore: true, game: "See more", name: "See more" });
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
        toast.error("Unable to load catalog");
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
      if (isKeyboardOpen || (view === "details" && action !== "MENU")) return;

      if (isMenuOpen) {
        if (action === "DOWN") setMenuIndex(p => Math.min(p + 1, 4));
        else if (action === "UP") setMenuIndex(p => Math.max(p - 1, 0));
        else if (action === "BACK" || action === "MENU") setIsMenuOpen(false);
        else if (action === "CONFIRM") {
          setIsMenuOpen(false);
          if (menuIndex === 0) changeView("carousel");
          else if (menuIndex === 1) changeView("library");
          else if (menuIndex === 2) changeView("store");
          else if (menuIndex === 3) navigate("/");
          else if (menuIndex === 4) window.close();
        }
        return;
      }

      if (view === "details") return;

      if (view === "library") {
        const maxIndex = allGames.length - 1;

        if (action === "RIGHT") {
          const isAtRowEnd = (libraryIndex + 1) % GRID_COLS === 0;
          if (!isAtRowEnd && libraryIndex < maxIndex) {
            setLibraryIndex(p => p + 1);
          }
        } else if (action === "LEFT") {
          const isAtRowStart = libraryIndex % GRID_COLS === 0;
          if (!isAtRowStart && libraryIndex > 0) {
            setLibraryIndex(p => p - 1);
          }
        } else if (action === "DOWN") {
          if (libraryIndex + GRID_COLS <= maxIndex) {
            setLibraryIndex(p => p + GRID_COLS);
          }
        } else if (action === "UP") {
          if (libraryIndex >= GRID_COLS) {
            setLibraryIndex(p => p - GRID_COLS);
          }
        } else if (action === "MENU") setIsMenuOpen(true);
        else if (action === "BACK") changeView("carousel");
        else if (action === "CONFIRM" && allGames[libraryIndex])
          launchGame(allGames[libraryIndex]);
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
      if (action === "RIGHT")
        setCarouselIndex(p => Math.min(p + 1, currentList.length - 1));
      else if (action === "LEFT") setCarouselIndex(p => Math.max(p - 1, 0));
      else if (action === "MENU") setIsMenuOpen(true);
      else if (action === "CONFIRM") {
        const game = currentList[carouselIndex];
        if (game?.isSeeMore) changeView("library");
        else if (game) launchGame(game);
      }
    },
    [
      isKeyboardOpen,
      isMenuOpen,
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
    ]
  );

  // Keyboard Event Listener
  useEffect(() => {
    const handleKeyDown = e => {
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
  }, [handleNavigation]);

  // GAMEPAD POLLING LOOP for Main Navigation
  useEffect(() => {
    let animationFrameId;

    const loop = () => {
      const gp = getGamepadInput();
      if (gp) {
        const now = Date.now();

        if (now - lastNavTime.current > 170) {
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

          if (handledNav) lastNavTime.current = now;
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
  }, [handleNavigation]);

  return (
    <div className="fixed inset-0 z-[9999] flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <Toaster
        position="top-center"
        richColors
        theme="dark"
        toastOptions={{
          style: {
            background: "rgb(var(--color-card))",
            border: "2px solid rgb(var(--color-border))",
            color: "rgb(var(--color-foreground))",

            fontSize: "1.25rem",
            padding: "20px 24px",
            minWidth: "400px",
            gap: "16px",
            borderRadius: "8px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            zIndex: 99999,
          },
          descriptionClassName: "!text-lg !text-muted-foreground",
          titleClassName: "!font-bold !tracking-wide",
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
        />
      )}

      <div
        className={`absolute inset-0 z-[9000] bg-black/60 transition-opacity duration-200 ${isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <SidebarMenu isOpen={isMenuOpen} selectedIndex={menuIndex} />

      {view !== "details" && (
        <div
          className={`absolute left-24 top-16 z-20 transition-all duration-200 ${isMenuOpen || isKeyboardOpen ? "opacity-50 blur-sm" : ""}`}
        >
          <h1 className="flex items-center gap-4 text-3xl font-light uppercase tracking-[0.2em] text-white/90">
            <span className="h-1 w-12 rounded-full bg-primary shadow-[0_0_15px_rgba(59,130,246,0.8)]"></span>
            {view === "library" ? "ALL GAMES" : view === "store" ? "CATALOG" : "HOME"}
          </h1>
        </div>
      )}

      <div
        className={`relative flex w-full flex-1 items-center pb-16 transition-all duration-200 ${isMenuOpen ? "scale-95 opacity-50 blur-sm" : ""}`}
      >
        {view === "carousel" && (
          <>
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
                  />
                ))}
                <div className="w-[60vw] flex-shrink-0"></div>
              </div>
            </div>
            {/* Show active downloads in carousel view */}
            <ActiveDownloadsBar downloads={downloadingGames} />
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
              />
              {storeSearchQuery && (
                <p className="mt-2 text-sm text-muted-foreground/80">
                  {filteredStoreGames.length} result
                  {filteredStoreGames.length > 1 ? "s" : ""} for "{storeSearchQuery}"
                </p>
              )}
            </div>

            {storeLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                  <p className="text-xl text-muted-foreground">Loading catalog...</p>
                </div>
              </div>
            ) : filteredStoreGames.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <Search className="h-16 w-16 text-slate-600" />
                  <p className="text-xl text-muted-foreground">
                    {storeSearchQuery ? "No game found" : "No game available"}
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
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-blue-500"></div>
                  )}
                </div>
              </>
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
          />
        )}
      </div>

      {view !== "details" && !isKeyboardOpen && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-[100] flex h-16 items-center justify-between border-t border-border border-white/5 bg-background/95 px-16 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] backdrop-blur transition-all duration-200 ${isMenuOpen ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
        >
          <div
            className="flex cursor-pointer items-center gap-3 font-bold tracking-widest text-muted-foreground transition-colors hover:text-white"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu className="h-6 w-6" />
            <span>MENU</span>
            <span className="rounded bg-card px-2 py-0.5 text-[10px] text-muted-foreground/80">
              Start
            </span>
          </div>
          <div className="flex gap-12 text-sm font-bold tracking-widest text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-black text-black shadow-lg">
                A
              </span>
              {view === "store" && isSearchBarSelected
                ? "SEARCH"
                : view === "store"
                  ? "SELECT"
                  : "PLAY"}
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-600 bg-card text-xs font-black">
                B
              </span>
              {view === "carousel" ? "EXIT" : "BACK"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
