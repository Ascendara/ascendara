import React, { useState, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
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
import { Star, StarHalf } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const GameRate = ({ game, isOpen, onClose }) => {
  const { t } = useLanguage();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comments, setComments] = useState("");
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
    try {
      // Get a fresh token for each request to ensure timestamp validity
      const freshToken = await getToken();

      const response = await fetch("https://api.ascendara.app/app/v2/gamerate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify({
          gameID: game.gameID,
          rating: rating,
          ...(comments.trim() && { comments: comments.trim() }),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit rating");
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
        description: t("library.rateGame.errorDesc"),
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
              onChange={e => setComments(e.target.value)}
              placeholder={t("library.rateGame.commentPlaceholder")}
              className="min-h-[100px] resize-none text-foreground"
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
