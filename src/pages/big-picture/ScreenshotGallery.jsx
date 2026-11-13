import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader, X } from "lucide-react";
import { getButtonBadgeClass } from "./controller";

// The grid switches between 2 and 3 columns at the lg breakpoint, so vertical
// navigation has to know how many images make up a row.
const getScreenshotColumns = () =>
  typeof window !== "undefined" && window.innerWidth >= 1024 ? 3 : 2;

const ScreenshotGallery = ({
  screenshots = [],
  index = 0,
  lightboxOpen = false,
  focused = false,
  onFocus,
  onOpen,
  onClose,
  onNavigate,
  loading = false,
  emptyLabel,
  t,
  controllerType = "xbox",
  buttons,
}) => {
  const gridRef = useRef(null);
  const lastIndex = Math.max(0, screenshots.length - 1);
  const activeIndex = Math.min(Math.max(index, 0), lastIndex);
  const active = screenshots[activeIndex];

  // Keep the focused thumbnail visible while moving around with a controller.
  useEffect(() => {
    if (!focused || lightboxOpen) return;
    gridRef.current
      ?.querySelector(`[data-screenshot-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, focused, lightboxOpen]);

  const step = delta => {
    if (!screenshots.length) return;
    onNavigate?.((activeIndex + delta + screenshots.length) % screenshots.length);
  };

  return (
    <>
      {screenshots.length > 0 ? (
        <div ref={gridRef} className="grid grid-cols-2 gap-6 lg:grid-cols-3">
          {screenshots.map((screen, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={screen.id ?? idx}
                type="button"
                data-screenshot-index={idx}
                onClick={() => {
                  onFocus?.(idx);
                  onOpen?.();
                }}
                className={`group relative aspect-video scroll-my-6 overflow-hidden rounded-xl border-2 bg-muted transition-all duration-200 ${
                  isActive && focused
                    ? "scale-[1.02] border-primary ring-4 ring-primary/40"
                    : "border-transparent hover:scale-[1.02] hover:border-primary"
                }`}
              >
                <img
                  src={screen.url}
                  alt={screen.alt || `Screenshot ${idx + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={e => {
                    console.log("[Screenshot] Failed to load:", screen.url);
                    e.target.style.display = "none";
                  }}
                />
                {isActive && focused && (
                  <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-sm font-black text-secondary shadow-lg">
                    {idx + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : loading ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <p>{emptyLabel}</p>
        </div>
      )}

      {lightboxOpen &&
        active &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[40000] flex flex-col bg-black/95 backdrop-blur-md"
            onClick={onClose}
          >
            <div className="flex items-center justify-between px-10 py-6">
              <span className="rounded-full bg-white/10 px-4 py-2 text-lg font-bold tabular-nums text-white">
                {activeIndex + 1} / {screenshots.length}
              </span>
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onClose?.();
                }}
                aria-label={t("bigPicture.cancel")}
                className="rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div
              className="relative flex min-h-0 flex-1 items-center justify-center px-20 pb-6"
              onClick={event => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous"
                className="absolute left-6 rounded-full bg-white/10 p-4 text-white transition-all hover:scale-105 hover:bg-white/20"
              >
                <ChevronLeft className="h-9 w-9" />
              </button>

              <img
                src={active.url}
                alt={active.alt || `Screenshot ${activeIndex + 1}`}
                className="h-full w-full rounded-lg border border-white/10 object-contain shadow-2xl"
              />

              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next"
                className="absolute right-6 rounded-full bg-white/10 p-4 text-white transition-all hover:scale-105 hover:bg-white/20"
              >
                <ChevronRight className="h-9 w-9" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 pb-8 text-xs font-bold uppercase tracking-widest text-white/60">
              <span>← / → {t("bigPicture.navigate")}</span>
              <span>
                <span
                  className={`mr-2 ${getButtonBadgeClass(controllerType)} bg-white/20 px-2.5 py-1 text-white`}
                >
                  {buttons?.cancel ?? "B"}
                </span>
                {t("bigPicture.cancel")}
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export { ScreenshotGallery, getScreenshotColumns };
