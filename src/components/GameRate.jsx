import { useState, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Star } from "lucide-react";
import "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const GameRate = ({ game, isOpen, onClose }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comments, setComments] = useState("");
  const [shareAnonymously, setShareAnonymously] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authToken, setAuthToken] = useState("");

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const token = await getToken();
        setAuthToken(token);
      } catch (error) {
        console.error("Error fetching token:", error);
        toast.error(t("common.reportDialog.authFailed"), {
          description: t("common.reportDialog.authFailedDesc"),
        });
      }
    };

    if (isOpen) {
      fetchToken();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setRating(0);
      setComments("");
      setShareAnonymously(false);
      setSubmitError("");
    }
  }, [isOpen]);

  const getToken = async () => {
    try {
      const authHeaders = await window.electron.getAuthHeaders();
      const response = await fetch("https://api.ascendara.app/auth/token", {
        headers: authHeaders,
      });

      if (!response.ok) {
        throw new Error("Failed to obtain token");
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error("Error getting token:", error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    if (!rating) {
      toast.error(t("library.rateGame.missingRating"), {
        description: t("library.rateGame.missingRatingDesc"),
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");
    try {
      // Get a fresh token for each request to ensure timestamp validity
      const freshToken = await getToken();
      const ascendToken = user ? await user.getIdToken() : null;

      const response = await fetch("https://api.ascendara.app/app/v2/gamerate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshToken}`,
          ...(ascendToken && { "X-Ascend-Token": ascendToken }),
        },
        body: JSON.stringify({
          gameID: game.gameID,
          rating: rating,
          anonymous: !user || shareAnonymously,
          ...(comments.trim() && { comments: comments.trim() }),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setSubmitError(
          error.code === "inappropriate_language"
            ? t("library.rateGame.inappropriateLanguage")
            : error.code === "comment_filter_unavailable"
              ? t("library.rateGame.commentFilterUnavailable")
              : error.error || t("library.rateGame.errorDesc")
        );
        return;
      }

      await window.electron.gameRated(game.game || game.name, game.isCustom);

      toast.success(t("library.rateGame.success"), {
        description: t("library.rateGame.successDesc", { game: game.name }),
      });

      onClose();
      // Reset form
      setRating(0);
      setComments("");
    } catch (error) {
      console.error("Failed to submit rating:", error);
      toast.error(t("library.rateGame.error"), {
        description: error.message || t("library.rateGame.errorDesc"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRatingText = rating => {
    if (rating >= 4.5) return t("library.rateGame.excellent");
    if (rating >= 3.5) return t("library.rateGame.veryGood");
    if (rating >= 2.5) return t("library.rateGame.good");
    if (rating >= 1.5) return t("library.rateGame.fair");
    if (rating > 0) return t("library.rateGame.poor");
    return "";
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-[500px]">
        <AlertDialogHeader>
          <div className="flex items-center gap-4">
            <div>
              <AlertDialogTitle className="text-2xl font-bold text-foreground">
                {t("library.rateGame.title", { game: game.game })}
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-1 text-muted-foreground">
                {t("library.rateGame.description", { game: game.game })}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-4">
            <Label className="text-lg font-semibold text-foreground">
              {t("library.rateGame.ratingLabel")}
            </Label>

            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1" onMouseLeave={() => setHoveredRating(0)}>
                {[1, 2, 3, 4, 5].map(value => (
                  <motion.button
                    key={value}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="p-1 focus:outline-none"
                    onClick={() => setRating(value)}
                    onMouseEnter={() => setHoveredRating(value)}
                  >
                    <Star
                      size={32}
                      className="transition-colors"
                      style={{
                        fill:
                          (hoveredRating || rating) >= value
                            ? "rgb(var(--color-star-filled, 250 204 21))"
                            : "transparent",
                        stroke:
                          (hoveredRating || rating) >= value
                            ? "rgb(var(--color-star-filled, 250 204 21))"
                            : "rgb(var(--color-star-empty, 148 163 184))",
                      }}
                    />
                  </motion.button>
                ))}
              </div>

              <AnimatePresence>
                {(rating || hoveredRating) > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-lg font-medium text-foreground"
                  >
                    {getRatingText(hoveredRating || rating)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-lg font-semibold text-foreground" htmlFor="comments">
              {t("library.rateGame.commentsLabel")}
            </Label>
            <Textarea
              id="comments"
              value={comments}
              maxLength={5000}
              onChange={e => {
                setComments(e.target.value);
                setSubmitError("");
              }}
              placeholder={t("library.rateGame.commentPlaceholder")}
              className="min-h-[100px] resize-none text-foreground"
            />
            {submitError && (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("library.rateGame.publicReviewNotice")}
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
            <div className="space-y-1">
              <Label htmlFor="rate-anonymously" className="text-sm font-medium text-foreground">
                {t("library.rateGame.anonymousLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  user
                    ? "library.rateGame.anonymousDescription"
                    : "library.rateGame.anonymousGuestDescription"
                )}
              </p>
              {!user && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2">
                  <span className="text-xs text-muted-foreground">
                    {t("library.rateGame.ascendPromo")}
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      onClose();
                      navigate("/ascend");
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("library.rateGame.ascendPromoAction")}
                  </button>
                </div>
              )}
            </div>
            <Switch
              id="rate-anonymously"
              checked={!user || shareAnonymously}
              onCheckedChange={setShareAnonymously}
              disabled={!user || isSubmitting}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <Button
            className="text-primary"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            className="text-secondary"
            disabled={!rating || isSubmitting}
          >
            {isSubmitting ? t("common.submitting") : t("common.submit")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default GameRate;
