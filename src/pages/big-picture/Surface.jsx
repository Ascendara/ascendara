import { memo, useContext, useEffect, useRef, useState } from "react";
import { PageNavigationContext, pageFocusIds } from "./PageHeader";
import { Gamepad2 } from "lucide-react";
import { useImageLoader } from "@/hooks/useImageLoader";
import { moveFocus, gameName } from "./surfaceNavigation";

export function useSurface(
  navigation,
  rows,
  onBack,
  active = true,
  initialFocus = null,
) {
  const pageNavigation = useContext(PageNavigationContext);
  if (pageNavigation && initialFocus !== "hero") rows = [pageFocusIds, ...rows];
  const defaultFocus = initialFocus ?? (pageNavigation ? `page-${pageNavigation.view}` : null);
  const [selected, setSelected] = useState(defaultFocus);
  const root = useRef(null);
  const ids = rows.flat();
  const current = ids.includes(selected)
    ? selected
    : ids.includes(defaultFocus) ? defaultFocus : ids[0];
  useEffect(() => {
    if (!active) return;
    const element = Array.from(
      root.current?.querySelectorAll("[data-focus-id]") || [],
    ).find((item) => item.dataset.focusId === current);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [current, active]);
  useEffect(() => {
    if (!active) return;
    navigation.current = (action) => {
      if (["UP", "DOWN", "LEFT", "RIGHT"].includes(action)) {
        setSelected(moveFocus(rows, current, action));
      } else if (action === "CONFIRM") {
        Array.from(root.current?.querySelectorAll("[data-focus-id]") || [])
          .find((item) => item.dataset.focusId === current)
          ?.click();
      } else if (action === "BACK") onBack?.();
    };
    return () => {
      navigation.current = null;
    };
  }, [navigation, rows, current, onBack, active]);
  const focus = (id) => ({
    "data-focus-id": id,
    tabIndex: current === id ? 0 : -1,
    onFocus: () => setSelected(id),
    "data-selected": active && current === id,
  });
  return { root, focus, current };
}

export function SurfaceButton({
  children,
  className = "",
  variant = "secondary",
  ...props
}) {
  return (
    <button
      type="button"
      {...props}
      className={`bp-action bp-action--${variant} ${className}`}
    >
      {children}
    </button>
  );
}

export const SurfaceGame = memo(function SurfaceGame({
  game,
  onClick,
  focus,
  subtitle,
  artworkOnly = false,
}) {
  const [image, setImage] = useState(game.cover || game.image || null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(null);
  const { cachedImage } = useImageLoader(game.imgID, {
    enabled: visible && !!game.imgID,
    quality: "high",
    priority: "normal",
  });
  const ref = useRef(null);
  const name = gameName(game);
  useEffect(() => {
    let live = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setVisible(true);
        if (game.platform) return;
        window.electron
          ?.getGameImage(name, "grid")
          .then((data) => {
            if (live && data) setImage(`data:image/jpeg;base64,${data}`);
          })
          .catch(() => {});
      },
      { rootMargin: "300px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [name, game.imgID, game.platform]);
  const artwork = image || cachedImage;
  return (
    <button
      ref={ref}
      {...focus}
      onClick={onClick}
      aria-label={name}
      className={`bp-game${artworkOnly ? " bp-game--artwork" : ""}`}
      data-missing-art={!artwork || artwork === failed}
    >
      <div className="bp-cover">
        {artwork && artwork !== failed ? (
          <img
            src={artwork}
            alt=""
            loading="lazy"
            onError={() => setFailed(artwork)}
          />
        ) : (
          <Gamepad2 aria-hidden="true" />
        )}
      </div>
      <strong>{name}</strong>
      {subtitle && <span>{subtitle}</span>}
    </button>
  );
});
