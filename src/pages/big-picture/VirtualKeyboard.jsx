import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Delete } from "lucide-react";
import { getControllerButtons } from "./controller";
import { KEYBOARD_LAYOUTS } from "./keyboardLayouts";
import { getGamepadInput } from "./gamepad";

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
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-primary px-1 leading-none text-secondary">
              {buttons.delete}
            </span>
            {t("bigPicture.del")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-primary px-1 leading-none text-secondary">
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
                          : "scale-[1.02] bg-primary text-secondary shadow-[0_0_15px_rgb(var(--color-primary)/0.6)]"
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

export { VirtualKeyboard };
