import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/context/LanguageContext";

const MAX_ZOOM = 5;
const STAGE_PAD_X = 28;
const STAGE_PAD_Y = 36;
const NUDGE_PX = 10;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Lets the user pan and zoom an image behind a fixed-aspect frame. Calls
 * onConfirm with the framed area in source pixels: {x, y, width, height}.
 */
export default function ImageCropDialog({ file, aspect, onCancel, onConfirm }) {
  const { t } = useLanguage();
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [natural, setNatural] = useState(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Centre of the frame, in source image pixels
  const [center, setCenter] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setNatural(null);
    setCenter(null);
    setZoom(1);
    setBusy(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The dialog content mounts after open, so measure once it exists
  const measureStage = useCallback(node => {
    stageRef.current = node;
    if (node) setStageWidth(node.clientWidth);
  }, []);

  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setStageWidth(entry.contentRect.width)
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [imageUrl]);

  const frameWidth = Math.max(0, stageWidth - STAGE_PAD_X * 2);
  const frameHeight = frameWidth / aspect;
  const baseScale = natural
    ? Math.max(frameWidth / natural.width, frameHeight / natural.height)
    : 1;
  const scale = baseScale * zoom;

  const clampCenter = useCallback(
    (point, atScale) => {
      if (!natural || !atScale) return point;
      const halfWidth = frameWidth / atScale / 2;
      const halfHeight = frameHeight / atScale / 2;
      return {
        x: clamp(point.x, halfWidth, natural.width - halfWidth),
        y: clamp(point.y, halfHeight, natural.height - halfHeight),
      };
    },
    [natural, frameWidth, frameHeight]
  );

  const visibleCenter = center && clampCenter(center, scale);

  const zoomTo = (nextZoom, anchor) => {
    const next = clamp(nextZoom, 1, MAX_ZOOM);
    if (!visibleCenter) return setZoom(next);
    const nextScale = baseScale * next;
    // Keep the point under the cursor (or the frame centre) where it is
    const offsetX = anchor ? anchor.x - frameWidth / 2 : 0;
    const offsetY = anchor ? anchor.y - frameHeight / 2 : 0;
    const focus = {
      x: visibleCenter.x + offsetX / scale,
      y: visibleCenter.y + offsetY / scale,
    };
    setZoom(next);
    setCenter(
      clampCenter(
        { x: focus.x - offsetX / nextScale, y: focus.y - offsetY / nextScale },
        nextScale
      )
    );
  };

  const panBy = (dx, dy) =>
    setCenter(current => {
      if (!current) return current;
      const from = clampCenter(current, scale);
      return clampCenter({ x: from.x - dx / scale, y: from.y - dy / scale }, scale);
    });

  const handlePointerDown = event => {
    if (busy || !visibleCenter || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = event => {
    if (!dragRef.current) return;
    panBy(event.clientX - dragRef.current.x, event.clientY - dragRef.current.y);
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  // React's onWheel is passive, so preventDefault needs a native listener
  const wheelRef = useRef();
  wheelRef.current = event => {
    if (busy || !visibleCenter) return;
    event.preventDefault();
    const rect = stageRef.current.getBoundingClientRect();
    zoomTo(zoom * Math.exp(-event.deltaY * 0.0015), {
      x: event.clientX - rect.left - STAGE_PAD_X,
      y: event.clientY - rect.top - STAGE_PAD_Y,
    });
  };
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const listener = event => wheelRef.current(event);
    node.addEventListener("wheel", listener, { passive: false });
    return () => node.removeEventListener("wheel", listener);
  }, [imageUrl, stageWidth]);

  const handleKeyDown = event => {
    const moves = {
      ArrowLeft: [NUDGE_PX, 0],
      ArrowRight: [-NUDGE_PX, 0],
      ArrowUp: [0, NUDGE_PX],
      ArrowDown: [0, -NUDGE_PX],
    };
    if (moves[event.key]) {
      event.preventDefault();
      panBy(...moves[event.key]);
    } else if (event.key === "+" || event.key === "=") {
      zoomTo(zoom * 1.1);
    } else if (event.key === "-") {
      zoomTo(zoom / 1.1);
    }
  };

  const handleConfirm = async () => {
    if (!visibleCenter) return;
    const width = frameWidth / scale;
    const height = frameHeight / scale;
    setBusy(true);
    try {
      await onConfirm({
        x: visibleCenter.x - width / 2,
        y: visibleCenter.y - height / 2,
        width,
        height,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(file)} onOpenChange={open => !open && !busy && onCancel()}>
      <DialogContent className="max-w-2xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t("imageCropper.title")}</DialogTitle>
          <DialogDescription>{t("imageCropper.description")}</DialogDescription>
        </DialogHeader>

        <div
          ref={measureStage}
          role="application"
          tabIndex={0}
          aria-label={t("imageCropper.stageLabel")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className={`relative select-none overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            busy ? "cursor-wait" : "cursor-grab active:cursor-grabbing"
          }`}
          style={{ height: frameHeight + STAGE_PAD_Y * 2, touchAction: "none" }}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              onLoad={event => {
                const { naturalWidth: width, naturalHeight: height } =
                  event.currentTarget;
                setNatural({ width, height });
                setCenter({ x: width / 2, y: height / 2 });
              }}
              className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
              style={
                natural && visibleCenter
                  ? {
                      width: natural.width,
                      height: natural.height,
                      transform: `translate(${STAGE_PAD_X + frameWidth / 2 - visibleCenter.x * scale}px, ${
                        STAGE_PAD_Y + frameHeight / 2 - visibleCenter.y * scale
                      }px) scale(${scale})`,
                    }
                  : { visibility: "hidden" }
              }
            />
          )}
          {/* Frame: everything outside it is dimmed, thirds lines help framing */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-lg ring-2 ring-white/90"
            style={{
              left: STAGE_PAD_X,
              top: STAGE_PAD_Y,
              width: frameWidth,
              height: frameHeight,
              boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)",
            }}
          >
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
          </div>
          {!natural && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => zoomTo(zoom / 1.25)}
            disabled={busy || zoom <= 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label={t("imageCropper.zoomOut")}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <Slider
            value={[zoom]}
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            disabled={busy || !natural}
            onValueChange={([value]) => zoomTo(value)}
            aria-label={t("imageCropper.zoom")}
          />
          <button
            type="button"
            onClick={() => zoomTo(zoom * 1.25)}
            disabled={busy || zoom >= MAX_ZOOM}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label={t("imageCropper.zoomIn")}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !natural}
            onClick={() => {
              setZoom(1);
              setCenter({ x: natural.width / 2, y: natural.height / 2 });
            }}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("imageCropper.reset")}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t("imageCropper.cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy || !natural}
            className="gap-2 text-secondary"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t(busy ? "imageCropper.processing" : "imageCropper.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
