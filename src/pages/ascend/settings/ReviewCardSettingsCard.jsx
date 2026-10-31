import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Info,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import ImageCropDialog from "@/components/ImageCropDialog";
import { FocusHero, StatusPill } from "./SettingsLayout";
import ReviewCard from "@/components/ReviewCard";
import { cropImage } from "@/lib/cropImage";
import {
  deleteReviewCardBackground,
  getReviewCard,
  updateReviewCardStyle,
  uploadReviewCardBackground,
} from "@/services/firebase/firebaseService";

// Keep in sync with REVIEW_CARD_* in the API
const CARD_WIDTH = 800;
const CARD_HEIGHT = 300;
const MAX_BYTES = 8 * 1024 * 1024;
// The original only has to be openable; the cropped result is what's uploaded
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MIN_IMAGE_OPACITY = 10;
const STYLE_FIELDS = ["auraColor", "textColor", "imageOpacity"];
const COLOR_PRESETS = [
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];

// The viewer's theme color as #rrggbb, shown when no custom color is set
const themeHex = variable => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable);
  const channels = value.trim().split(/\s+/).map(Number);
  if (channels.length !== 3 || channels.some(Number.isNaN)) return "#ffffff";
  return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
};

function ColorField({
  label,
  value,
  fallbackVariable,
  onChange,
  defaultLabel,
  disabled,
}) {
  const current = value || themeHex(fallbackVariable);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            {defaultLabel}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label
          className={`relative h-7 w-10 cursor-pointer overflow-hidden rounded-md border border-border ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
          style={{ backgroundColor: current }}
          title={current}
        >
          <input
            type="color"
            value={current}
            onChange={event => onChange(event.target.value.toLowerCase())}
            disabled={disabled}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <span className="w-16 font-mono text-xs text-muted-foreground">
          {value || "—"}
        </span>
        {COLOR_PRESETS.map(color => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            disabled={disabled}
            aria-label={color}
            className={`h-5 w-5 rounded-full border border-border transition-transform hover:scale-110 disabled:opacity-50 ${
              value === color ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

const loadImage = file =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve();
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      reject(new Error("unreadable"));
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });

export default function ReviewCardSettingsCard({ t, user, userData }) {
  // background is the live image; pending is a new upload awaiting approval,
  // while the approved one keeps showing to everyone
  const [background, setBackground] = useState(null);
  const [pending, setPending] = useState(null);
  const [previewSlot, setPreviewSlot] = useState("pending");
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [previewDate] = useState(() => new Date().toISOString());
  const [cropFile, setCropFile] = useState(null);
  // savedStyle is what everyone sees; style is the draft shown in the preview
  const [savedStyle, setSavedStyle] = useState({});
  const [style, setStyle] = useState({});
  const [savingStyle, setSavingStyle] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getReviewCard().then(result => {
      if (cancelled) return;
      setBackground(result.background);
      setPending(result.pending);
      setSavedStyle(result.style || {});
      setStyle(result.style || {});
      setStatus(result.error ? "error" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(t("ascend.settings.reviewCard.wrongType"));
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error(t("ascend.settings.reviewCard.sourceTooLarge"));
      return;
    }
    try {
      await loadImage(file);
    } catch {
      toast.error(t("ascend.settings.reviewCard.wrongType"));
      return;
    }
    setCropFile(file);
  };

  const handleCrop = async crop => {
    let file;
    try {
      // Stills keep up to 2x detail; animations stay at card size to keep GIFs small
      const width = Math.round(
        Math.min(Math.max(crop.width, CARD_WIDTH), CARD_WIDTH * 2)
      );
      file = await cropImage(cropFile, crop, {
        still: { width, height: Math.round((width * CARD_HEIGHT) / CARD_WIDTH) },
        animated: { width: CARD_WIDTH, height: CARD_HEIGHT },
      });
    } catch (error) {
      console.error("Failed to crop review card background:", error);
      toast.error(t("ascend.settings.reviewCard.cropFailed"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("ascend.settings.reviewCard.tooLarge"));
      return;
    }

    setBusy(true);
    const result = await uploadReviewCardBackground(file);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setCropFile(null);
    setBackground(result.background);
    setPending(result.pending);
    setPreviewSlot("pending");
    toast.success(
      t(
        result.background
          ? "ascend.settings.reviewCard.uploadedKeepsCurrent"
          : "ascend.settings.reviewCard.uploaded"
      )
    );
  };

  const handleRemove = async pendingOnly => {
    setBusy(true);
    const result = await deleteReviewCardBackground({ pendingOnly });
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setPending(null);
    if (!pendingOnly) setBackground(null);
    toast.success(
      t(
        pendingOnly
          ? "ascend.settings.reviewCard.pendingCanceled"
          : "ascend.settings.reviewCard.removed"
      )
    );
  };

  const hasImage = Boolean(background || pending);
  const awaitingApproval = Boolean(pending || (background && !background.passed));
  const showingPending = Boolean(pending && (previewSlot === "pending" || !background));
  const previewUrl = showingPending ? pending.url : background?.url;

  const styleChanged = STYLE_FIELDS.some(field => style[field] !== savedStyle[field]);
  const setStyleField = (field, value) =>
    setStyle(current => {
      const next = { ...current, [field]: value };
      if (value === null || value === undefined) delete next[field];
      return next;
    });

  const handleSaveStyle = async () => {
    setSavingStyle(true);
    const result = await updateReviewCardStyle(
      Object.fromEntries(STYLE_FIELDS.map(field => [field, style[field] ?? null]))
    );
    setSavingStyle(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setSavedStyle(result.style || {});
    setStyle(result.style || {});
    toast.success(t("ascend.settings.reviewCard.styleSaved"));
  };

  const name =
    userData?.username ||
    userData?.displayName ||
    user?.displayName ||
    t("ascend.settings.reviewCard.previewName");

  return (
    <div className="space-y-8">
      <FocusHero
        icon={ImageIcon}
        tone={hasImage && !awaitingApproval ? "success" : hasImage ? "primary" : "muted"}
        title={t("ascend.settings.reviewCard.title")}
        status={
          hasImage && (
            <StatusPill
              tone={awaitingApproval ? "warning" : "success"}
              icon={awaitingApproval ? Clock : CheckCircle2}
            >
              {t(
                awaitingApproval
                  ? "ascend.settings.reviewCard.pending"
                  : "ascend.settings.reviewCard.approved"
              )}
            </StatusPill>
          )
        }
        description={t("ascend.settings.reviewCard.description", {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
        })}
      >
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={handleFile}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={busy || status === "loading"}
            className="gap-2 text-secondary"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t(
              hasImage
                ? "ascend.settings.reviewCard.replace"
                : "ascend.settings.reviewCard.upload"
            )}
          </Button>
          {pending && background && (
            <Button
              variant="outline"
              onClick={() => handleRemove(true)}
              disabled={busy}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              {t("ascend.settings.reviewCard.cancelPending")}
            </Button>
          )}
          {hasImage && (
            <Button
              variant="outline"
              onClick={() => handleRemove(false)}
              disabled={busy}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {t("ascend.settings.reviewCard.remove")}
            </Button>
          )}
        </div>
        {awaitingApproval && (
          <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
            {t(
              pending && background?.passed
                ? "ascend.settings.reviewCard.pendingKeepsCurrent"
                : "ascend.settings.reviewCard.pendingDescription"
            )}
          </p>
        )}
        {status === "error" && (
          <p className="text-destructive mt-3 text-sm">
            {t("ascend.settings.reviewCard.loadFailed")}
          </p>
        )}
      </FocusHero>

      <div className="grid items-start gap-8 border-t border-border/50 pt-6 xl:grid-cols-[minmax(0,416px)_minmax(0,1fr)]">
        {/* The real review card at its game page width (two per row beside the sidebar) */}
        <div className="space-y-3 rounded-2xl bg-muted/30 p-4 ring-1 ring-border/50">
          {pending && background && (
            <div
              role="tablist"
              className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium"
            >
              {["live", "pending"].map(slot => (
                <button
                  key={slot}
                  type="button"
                  role="tab"
                  aria-selected={previewSlot === slot}
                  onClick={() => setPreviewSlot(slot)}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    previewSlot === slot
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(
                    slot === "live"
                      ? "ascend.settings.reviewCard.previewCurrent"
                      : "ascend.settings.reviewCard.previewNew"
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="max-w-[384px]">
            <ReviewCard
              review={{
                rating: 5,
                comments: t("ascend.settings.reviewCard.previewText"),
                photoURL: userData?.photoURL || user?.photoURL,
                // Matches the real card: private accounts never show badges there
                badges: {
                  private: userData?.private === true,
                  owner: userData?.owner === true,
                  contributor: userData?.contributor === true,
                  verified: userData?.verified === true,
                  bugCatcher: userData?.bugCatcher === true,
                  reviewCount: userData?.reviewCount,
                  discordLinked: Boolean(userData?.socials?.linkedDiscord),
                  level: userData?.profileStats?.level,
                },
                cardBackground: previewUrl,
                cardStyle: style,
                createdAt: previewDate,
              }}
              username={name}
              isGuest={false}
            />
          </div>
          {userData?.private === true && (
            <p className="flex max-w-[384px] items-start gap-1.5 text-xs leading-5 text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("ascend.settings.reviewCard.privateBadgesNote")}
            </p>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold">
              {t("ascend.settings.reviewCard.styleTitle")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("ascend.settings.reviewCard.styleDescription")}
            </p>
          </div>
          <ColorField
            label={t("ascend.settings.reviewCard.auraColor")}
            value={style.auraColor}
            fallbackVariable="--color-primary"
            onChange={value => setStyleField("auraColor", value)}
            defaultLabel={t("ascend.settings.reviewCard.useDefault")}
            disabled={savingStyle || status === "loading"}
          />
          <ColorField
            label={t("ascend.settings.reviewCard.textColor")}
            value={style.textColor}
            fallbackVariable="--color-foreground"
            onChange={value => setStyleField("textColor", value)}
            defaultLabel={t("ascend.settings.reviewCard.useDefault")}
            disabled={savingStyle || status === "loading"}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {t("ascend.settings.reviewCard.imageOpacity")}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {style.imageOpacity ?? 100}%
              </span>
            </div>
            <Slider
              value={[style.imageOpacity ?? 100]}
              min={MIN_IMAGE_OPACITY}
              max={100}
              step={1}
              disabled={savingStyle || !hasImage}
              onValueChange={([value]) =>
                setStyleField("imageOpacity", value === 100 ? null : value)
              }
              aria-label={t("ascend.settings.reviewCard.imageOpacity")}
            />
            {!hasImage && (
              <p className="text-xs text-muted-foreground">
                {t("ascend.settings.reviewCard.imageOpacityHint")}
              </p>
            )}
          </div>
          {styleChanged && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSaveStyle}
                disabled={savingStyle}
                className="gap-2 text-secondary"
              >
                {savingStyle && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("ascend.settings.reviewCard.saveStyle")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStyle(savedStyle)}
                disabled={savingStyle}
              >
                {t("ascend.settings.reviewCard.discardStyle")}
              </Button>
            </div>
          )}
        </div>
      </div>
      <ImageCropDialog
        file={cropFile}
        aspect={CARD_WIDTH / CARD_HEIGHT}
        onCancel={() => setCropFile(null)}
        onConfirm={handleCrop}
      />
    </div>
  );
}
