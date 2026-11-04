import { Maximize, Minimize, Minus, X } from "lucide-react";

const TRAFFIC_LIGHTS = [
  { id: "close", color: "#FF5F57", ring: "#E0443E", Glyph: X },
  { id: "minimize", color: "#FEBC2E", ring: "#DEA123", Glyph: Minus },
  { id: "fullscreen", color: "#28C840", ring: "#1AAB29", Glyph: Maximize },
];

/**
 * The window's minimize / fullscreen / close buttons, drawn either as plain
 * icons or as macOS-style traffic lights (close, minimize, fullscreen; the
 * glyphs show when the group is hovered). Mirrored reverses the order so the
 * close button stays at the window edge when the menu bar is flipped.
 */
export function WindowControls({
  variant = "icons",
  isFullscreen,
  onToggleFullscreen,
  mirrored = false,
  t,
  className = "",
}) {
  const actions = {
    close: () => window.electron.closeWindow(),
    minimize: () => window.electron.minimizeWindow(),
    fullscreen: onToggleFullscreen,
  };

  const order = mirrored ? "flex-row-reverse" : "";

  if (variant === "traffic") {
    return (
      <div
        className={`window-controls group/traffic flex items-center gap-2 ${order} ${className}`}
      >
        {TRAFFIC_LIGHTS.map(({ id, color, ring, Glyph }) => {
          const Icon = id === "fullscreen" && isFullscreen ? Minimize : Glyph;
          return (
            <button
              key={id}
              type="button"
              onClick={actions[id]}
              title={
                id === "fullscreen"
                  ? isFullscreen
                    ? t("exitFullscreen")
                    : t("enterFullscreen")
                  : undefined
              }
              className="flex h-3 w-3 items-center justify-center rounded-full active:brightness-90"
              style={{ backgroundColor: color, boxShadow: `inset 0 0 0 0.5px ${ring}` }}
            >
              <Icon
                className="h-2 w-2 text-black/60 opacity-0 transition-opacity group-hover/traffic:opacity-100"
                strokeWidth={3}
              />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`window-controls flex items-center ${className}`}>
      <div className={`flex items-center gap-2 ${order}`}>
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={actions.minimize}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          className="relative text-muted-foreground transition-colors hover:text-foreground"
          onClick={actions.fullscreen}
          title={isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
        >
          <Minimize
            className={`absolute inset-0 h-4 w-4 transition-opacity ${
              isFullscreen ? "opacity-100" : "opacity-0"
            }`}
          />
          <Maximize
            className={`h-4 w-4 transition-opacity ${
              isFullscreen ? "opacity-0" : "opacity-100"
            }`}
          />
        </button>
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={actions.close}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** A row of small option cards, each showing a preview above its label. */
function OptionCards({ options, value, onChange }) {
  return (
    <div role="radiogroup" className="flex shrink-0 gap-2">
      {options.map(({ id, label, preview }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`flex w-24 flex-col items-center gap-2 rounded-lg border px-2 pb-1.5 pt-2.5 text-xs font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/60 ${
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <span className="flex h-4 w-full items-center justify-center" aria-hidden>
              {preview}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function WindowControlsStylePicker({ value = "icons", onChange, t }) {
  return (
    <OptionCards
      value={value}
      onChange={onChange}
      options={[
        {
          id: "icons",
          label: t("settings.windowControlsIcons"),
          preview: (
            <span className="flex items-center gap-1.5">
              <Minus className="h-3.5 w-3.5" />
              <Maximize className="h-3 w-3" />
              <X className="h-3.5 w-3.5" />
            </span>
          ),
        },
        {
          id: "traffic",
          label: t("settings.windowControlsTraffic"),
          preview: (
            <span className="flex items-center gap-1.5">
              {TRAFFIC_LIGHTS.map(({ id, color }) => (
                <span
                  key={id}
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
          ),
        },
      ]}
    />
  );
}

// A sketch of the menu bar: the logo square and name on one side, the window
// controls on the other
function MenuBarSketch({ side }) {
  return (
    <span
      className={`flex h-3.5 w-full items-center gap-1 rounded-[3px] border border-current px-1 opacity-70 ${
        side === "right" ? "flex-row-reverse" : ""
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-[1px] bg-primary" />
      <span className="h-1 w-4 rounded-full bg-current opacity-60" />
      <span className="flex-1" />
      <span className="h-1 w-3 rounded-full bg-current opacity-40" />
    </span>
  );
}

export function MenuBarSidePicker({ value = "left", onChange, t }) {
  return (
    <OptionCards
      value={value}
      onChange={onChange}
      options={["left", "right"].map(side => ({
        id: side,
        label:
          side === "left"
            ? t("settings.menuBarSideLeft")
            : t("settings.menuBarSideRight"),
        preview: <MenuBarSketch side={side} />,
      }))}
    />
  );
}
