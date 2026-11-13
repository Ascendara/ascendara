import { Maximize, Minimize, Minus, X } from "lucide-react";
import { getWindowControlOrder } from "@/lib/windowControlOrder";

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

const TRAFFIC_LIGHT_BY_ID = Object.fromEntries(
  TRAFFIC_LIGHTS.map(light => [light.id, light])
);

const ICON_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors";
const ICON_HOVER = "hover:bg-accent/60 hover:text-foreground";

function IconControl({ id, isFullscreen, onClick, fullscreenTitle }) {
  if (id === "minimize") {
    return (
      <button type="button" className={`${ICON_BUTTON} ${ICON_HOVER}`} onClick={onClick}>
        <Minus className="h-4 w-4" strokeWidth={2} />
      </button>
    );
  }

  if (id === "fullscreen") {
    return (
      <button
        type="button"
        className={`relative ${ICON_BUTTON} ${ICON_HOVER}`}
        onClick={onClick}
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
    );
  }

  return (
    <button
      type="button"
      className={`${ICON_BUTTON} hover:bg-red-500/15 hover:text-red-500`}
      onClick={onClick}
    >
      <X className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

/**
 * The window's minimize / fullscreen / close buttons, drawn either as plain
 * icons or as macOS-style traffic lights. Close always sits at the outer window
 * edge. On the right both styles share one order; on the left traffic lights
 * keep the native macOS order (see windowControlOrder).
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
  const controlOrder = getWindowControlOrder(mirrored, variant);

  if (variant === "traffic") {
    return (
      <div
        className={`window-controls group/traffic flex items-center gap-2 ${className}`}
      >
        {controlOrder.map(id => {
          const { color, ring } = TRAFFIC_LIGHT_BY_ID[id];
          return (
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
          );
        })}
      </div>
    );
  }

  return (
    <div className={`window-controls flex items-center ${className}`}>
      <div className="flex items-center gap-0.5">
        {controlOrder.map(id => (
          <IconControl
            key={id}
            id={id}
            isFullscreen={isFullscreen}
            onClick={actions[id]}
            fullscreenTitle={fullscreenTitle}
          />
        ))}
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

function WindowControlPreviewIcon({ id }) {
  if (id === "minimize") return <Minus className="h-3.5 w-3.5" />;
  if (id === "fullscreen") return <Maximize className="h-3 w-3" />;
  return <X className="h-3.5 w-3.5" />;
}

export function WindowControlsStylePicker({ value = "icons", onChange, t, side = "left" }) {
  const iconOrder = getWindowControlOrder(side === "right", "icons");
  const trafficOrder = getWindowControlOrder(side === "right", "traffic");

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
              {iconOrder.map(id => (
                <WindowControlPreviewIcon key={id} id={id} />
              ))}
            </span>
          ),
        },
        {
          id: "traffic",
          label: t("settings.windowControlsTraffic"),
          preview: (
            <span className="flex items-center gap-1.5">
              {trafficOrder.map(id => {
                const { color } = TRAFFIC_LIGHT_BY_ID[id];
                return (
                  <span
                    key={id}
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                );
              })}
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
