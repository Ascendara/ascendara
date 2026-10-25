import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ImageCropDialog from "@/components/ImageCropDialog";
import ReviewCard from "@/components/ReviewCard";
import { cropImage } from "@/lib/cropImage";
import {
  deleteReviewCardBackground,
  getReviewCardBackground,
  uploadReviewCardBackground,
} from "@/services/firebase/firebaseService";

// Keep in sync with REVIEW_CARD_* in the API
const CARD_WIDTH = 800;
const CARD_HEIGHT = 300;
const MAX_BYTES = 8 * 1024 * 1024;
// The original only has to be openable; the cropped result is what's uploaded
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

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
  const [background, setBackground] = useState(null);
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [previewDate] = useState(() => new Date().toISOString());
  const [cropFile, setCropFile] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getReviewCardBackground().then(result => {
      if (cancelled) return;
      setBackground(result.background);
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
    toast.success(t("ascend.settings.reviewCard.uploaded"));
  };

  const handleRemove = async () => {
    setBusy(true);
    const result = await deleteReviewCardBackground();
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setBackground(null);
    toast.success(t("ascend.settings.reviewCard.removed"));
  };

  const name =
    userData?.username ||
    userData?.displayName ||
    user?.displayName ||
    t("ascend.settings.reviewCard.previewName");

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/60">
      <div className="flex items-center justify-between border-b border-border/50 p-5">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          <h2 className="!m-0 font-semibold leading-tight">
            {t("ascend.settings.reviewCard.title")}
          </h2>
        </div>
        {background && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
              background.passed
                ? "bg-green-500/10 text-green-500"
                : "bg-yellow-500/10 text-yellow-500"
            }`}
          >
            {background.passed ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            {t(
              background.passed
                ? "ascend.settings.reviewCard.approved"
                : "ascend.settings.reviewCard.pending"
            )}
          </span>
        )}
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">
          {t("ascend.settings.reviewCard.description", {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
          })}
        </p>

        {/* The real review card at its game page width (two per row beside the sidebar) */}
        <div className="rounded-xl bg-card p-4">
          <div className="max-w-[384px]">
            <ReviewCard
              review={{
                rating: 5,
                comments: t("ascend.settings.reviewCard.previewText"),
                photoURL: userData?.photoURL || user?.photoURL,
                badges: {
                  owner: userData?.owner === true,
                  contributor: userData?.contributor === true,
                  verified: userData?.verified === true,
                },
                cardBackground: background?.url,
                createdAt: previewDate,
              }}
              username={name}
              isGuest={false}
            />
          </div>
        </div>

        {background && !background.passed && (
          <p className="text-sm text-muted-foreground">
            {t("ascend.settings.reviewCard.pendingDescription")}
          </p>
        )}
        {status === "error" && (
          <p className="text-destructive text-sm">
            {t("ascend.settings.reviewCard.loadFailed")}
          </p>
        )}

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
              background
                ? "ascend.settings.reviewCard.replace"
                : "ascend.settings.reviewCard.upload"
            )}
          </Button>
          {background && (
            <Button
              variant="outline"
              onClick={handleRemove}
              disabled={busy}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {t("ascend.settings.reviewCard.remove")}
            </Button>
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
