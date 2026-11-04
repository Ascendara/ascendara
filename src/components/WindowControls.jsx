import { Maximize, Minimize, Minus, X } from "lucide-react";

const TRAFFIC_LIGHTS = [
  { id: "close", color: "#FF5F57", ring: "#E0443E" },
  { id: "minimize", color: "#FEBC2E", ring: "#DEA123" },
  { id: "fullscreen", color: "#28C840", ring: "#1AAB29" },
];

// Glyphs drawn on the light's own 12px grid so they sit dead center, sized
// like the native ones (about half the light)
function TrafficGlyph({ id, isFullscreen }) {
  let shape;
  if (id === "close") {
    shape = (
      <path
        d="M4 4l4 4M8 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    );
  } else if (id === "minimize") {
    shape = (
      <path d="M3.5 6h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    );
  } else if (isFullscreen) {
    // Two triangles pointing in toward the center
    shape = <path d="M6.6 2.9v2.5h2.5zM5.4 9.1V6.6H2.9z" fill="currentColor" />;
  } else {
    // Two triangles pointing out to the corners
    shape = <path d="M3.6 3.6h3.6L3.6 7.2zM8.4 8.4H4.8l3.6-3.6z" fill="currentColor" />;
  }
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-full w-full text-black/55 opacity-0 transition-opacity duration-100 group-hover/traffic:opacity-100"
      aria-hidden
    >
      {shape}
    </svg>
  );
}

const ICON_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors";
const ICON_HOVER = "hover:bg-accent/60 hover:text-foreground";

/**
 * The window's minimize / fullscreen / close buttons, drawn either as plain
 * icons or as macOS-style traffic lights. Traffic lights always run close,
 * minimize, fullscreen like the native ones (glyphs show when the group is
 * hovered); mirrored reverses the icons so close stays at the window edge
 * when the menu bar is flipped.
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

  const fullscreenTitle = isFullscreen ? t("exitFullscreen") : t("enterFullscreen");

  if (variant === "traffic") {
    return (
      <div
        className={`window-controls group/traffic flex items-center gap-2 ${className}`}
      >
        {TRAFFIC_LIGHTS.map(({ id, color, ring }) => (
          <button
            key={id}
            type="button"
            onClick={actions[id]}
            title={id === "fullscreen" ? fullscreenTitle : undefined}
            className="h-3 w-3 shrink-0 overflow-hidden rounded-full active:brightness-90"
            style={{ backgroundColor: color, boxShadow: `inset 0 0 0 0.5px ${ring}` }}
          >
            <TrafficGlyph id={id} isFullscreen={isFullscreen} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`window-controls flex items-center ${className}`}>
      <div className={`flex items-center gap-0.5 ${mirrored ? "flex-row-reverse" : ""}`}>
        <button
          type="button"
          className={`${ICON_BUTTON} ${ICON_HOVER}`}
          onClick={actions.minimize}
        >
          <Minus className="h-4 w-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`relative ${ICON_BUTTON} ${ICON_HOVER}`}
          onClick={actions.fullscreen}
          title={fullscreenTitle}
        >
          <Minimize
            className={`absolute h-3.5 w-3.5 transition-opacity ${
              isFullscreen ? "opacity-100" : "opacity-0"
            }`}
            strokeWidth={2}
          />
          <Maximize
            className={`h-3.5 w-3.5 transition-opacity ${
              isFullscreen ? "opacity-0" : "opacity-100"
            }`}
            strokeWidth={2}
          />
        </button>
        <button
          type="button"
          className={`${ICON_BUTTON} hover:bg-red-500/15 hover:text-red-500`}
          onClick={actions.close}
        >
          <X className="h-4 w-4" strokeWidth={2} />
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
