import { memo, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PageNavigationContext, pageFocusIds } from "./PageHeader";
import { Gamepad2 } from "lucide-react";
import { useImageLoader } from "@/hooks/useImageLoader";
import { moveFocus, gameName } from "./surfaceNavigation";
import { scrollSurfaceFocus, cancelSurfaceScroll } from "./controllerNavigation";

export function useSurface(
  navigation,
  rows,
  onBack,
  active = true,
  initialFocus = null,
) {
  const pageNavigation = useContext(PageNavigationContext);
  if (pageNavigation && initialFocus !== "hero") rows = [pageFocusIds, ...rows];
  const firstSurfaceFocus = rows
    .flat()
    .find((id) => id && !pageFocusIds.includes(id));
  const defaultFocus =
    (pageNavigation?.pageFocusRequest?.current ? `page-${pageNavigation.view}` : initialFocus) ??
    firstSurfaceFocus ??
    (pageNavigation ? `page-${pageNavigation.view}` : null);
  const [selected, setSelected] = useState(defaultFocus);
  const root = useRef(null);
  useLayoutEffect(() => {
    const element = root.current;
    return () => cancelSurfaceScroll(element);
  }, []);
  const ids = rows.flat();
  const focusProps = useRef(new Map());
  const current = ids.includes(selected)
    ? selected
    : ids.includes(defaultFocus) ? defaultFocus : ids[0];
  useLayoutEffect(() => {
    if (!active) return;
    if (pageNavigation?.pageFocusRequest) pageNavigation.pageFocusRequest.current = false;
    const element = Array.from(
      root.current?.querySelectorAll("[data-focus-id]") || [],
    ).find((item) => item.dataset.focusId === current);
    element?.focus({ preventScroll: true });
    scrollSurfaceFocus(root.current, element);
  }, [current, active, pageNavigation?.pageFocusRequest]);
  useLayoutEffect(() => {
    if (!active) return;
    navigation.current = (action) => {
      if (["UP", "DOWN", "LEFT", "RIGHT"].includes(action)) {
        setSelected(previous => moveFocus(rows, ids.includes(previous) ? previous : current, action));
      } else if (action === "CONFIRM") {
        Array.from(root.current?.querySelectorAll("[data-focus-id]") || [])
          .find((item) => item.dataset.focusId === current)
          ?.click();
      } else if (action === "BACK") onBack?.();
    };
    return () => {
      navigation.current = null;
    };
  }, [navigation, rows, ids, current, onBack, active]);
  useLayoutEffect(() => {
    const valid = new Set(ids);
    for (const id of focusProps.current.keys()) {
      if (!valid.has(id)) focusProps.current.delete(id);
    }
  });
  const focus = id => {
    const tabIndex = current === id ? 0 : -1;
    const selected = active && current === id;
    const cached = focusProps.current.get(id);
    if (cached && cached.tabIndex === tabIndex && cached["data-selected"] === selected) return cached;
    const props = {
      "data-focus-id": id, tabIndex,
      onFocus: cached?.onFocus || (() => setSelected(id)),
      "data-selected": selected,
    };
    focusProps.current.set(id, props);
    return props;
  };
  return { root, focus, current, selectFocus: setSelected };
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
  onOpen,
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
      onClick={onOpen ? () => onOpen(game) : onClick}
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
