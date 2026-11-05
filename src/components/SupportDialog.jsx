import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, MessageCircle, Heart, Sparkles, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { API_URL } from "@/config/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import DeveloperSignature from "@/components/DeveloperSignature";
import { cn } from "@/lib/utils";

const ratingLabelKey = value => `app.supportDialog.ratings.${value}`;

const SupportDialog = ({ onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [pendingAction, setPendingAction] = useState(null);
  const [authToken, setAuthToken] = useState("");

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const authHeaders = await window.electron.getAuthHeaders();
        const response = await fetch(`${API_URL}/auth/token`, {
          headers: authHeaders,
        });
        const data = await response.json();
        if (data.token) {
          setAuthToken(data.token);
        }
      } catch (error) {
        console.error("Error fetching token:", error);
        toast.error(t("common.reportDialog.authFailed"), {
          description: t("common.reportDialog.authFailedDesc"),
        });
      }
    };

    fetchToken();
  }, []);

  const handleClose = () => {
    if (rating > 0) {
      if (!authToken) {
        console.error("No auth token available");
        toast.error(t("common.reportDialog.authFailed"), {
          description: t("common.reportDialog.authFailedDesc"),
        });
        onClose();
        return;
      }

      // Send the rating to the API
      fetch(`${API_URL}/app/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: "rating",
          rating: rating,
        }),
      }).catch(error => {
        console.error("Error sending rating:", error);
        toast.error(t("common.reportDialog.ratingFailed"), {
          description: t("common.reportDialog.ratingFailedDesc"),
        });
      });
    }
    onClose();
  };

  const handleAscend = () => {
    handleClose();
    navigate("/ascend");
  };

  const handleFeedback = () => {
    window.electron.openURL("https://ascendara.app/feedback");
  };

  const actions = {
    ascend: handleAscend,
    feedback: () => {
      handleFeedback();
      onClose();
    },
  };

  // Ask before leaving the rating behind; once rated, act right away.
  const requestAction = action => {
    if (rating > 0) {
      action === "ascend" ? handleAscend() : handleFeedback();
      return;
    }
    setPendingAction(action);
  };

  const activeRating = hoveredStar || rating;

  return (
    <Dialog open onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden border-border/60 bg-card p-0 sm:rounded-2xl">
        {/* Header */}
        <div className="relative px-6 pb-5 pt-8 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/15 to-transparent"
          />
          <div className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Heart className="h-6 w-6" aria-hidden="true" />
          </div>
          <DialogTitle className="relative text-xl font-bold text-foreground">
            {t("app.supportDialog.title")}
          </DialogTitle>
          <DialogDescription className="relative mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("app.supportDialog.message")}
          </DialogDescription>
        </div>

        {/* Rating */}
        <div className="px-6">
          <div className="flex flex-col items-center gap-1 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
            <div
              className="flex items-center"
              role="radiogroup"
              onMouseLeave={() => setHoveredStar(0)}
            >
              {[1, 2, 3, 4, 5].map(value => {
                const filled = value <= activeRating;
                return (
                  <motion.button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={t(ratingLabelKey(value))}
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.9 }}
                    onMouseEnter={() => setHoveredStar(value)}
                    onFocus={() => setHoveredStar(value)}
                    onBlur={() => setHoveredStar(0)}
                    onClick={() => {
                      setRating(value);
                      setPendingAction(null);
                    }}
                    className="rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Star
                      className={cn(
                        "h-8 w-8 transition-colors",
                        filled ? "fill-star-filled text-star-filled" : "text-star-empty"
                      )}
                    />
                  </motion.button>
                );
              })}
            </div>
            <div className="h-5">
              <AnimatePresence mode="wait">
                {activeRating > 0 && (
                  <motion.p
                    key={activeRating}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.12 }}
                    className="text-sm font-medium text-foreground"
                  >
                    {t(ratingLabelKey(activeRating))}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pt-4">
          <AnimatePresence mode="wait" initial={false}>
            {pendingAction ? (
              <motion.div
                key="confirm"
                role="alertdialog"
                aria-live="polite"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="border-status-warning space-y-3 rounded-xl border bg-[rgb(var(--color-warning,234_179_8)/0.08)] p-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className="text-status-warning mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-foreground">
                    {t("app.supportDialog.dismissWarning")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPendingAction(null)}
                    className="flex-1 whitespace-nowrap text-primary"
                  >
                    {t("app.supportDialog.goBack")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => actions[pendingAction]()}
                    className="flex-1 whitespace-nowrap text-secondary"
                  >
                    {t("app.supportDialog.dismissRating")}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className="flex flex-wrap gap-3"
              >
                <Button
                  onClick={() => requestAction("ascend")}
                  className="flex-1 gap-2 whitespace-nowrap text-secondary"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {t("app.supportDialog.ascend")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => requestAction("feedback")}
                  className="flex-1 gap-2 whitespace-nowrap text-primary"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  {t("app.supportDialog.feedback")}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Personal note */}
        <figure className="mx-6 mb-6 mt-5 border-t border-border/60 pt-5">
          <blockquote className="border-l-2 border-primary/40 pl-4 text-sm italic leading-relaxed text-muted-foreground">
            {t("app.supportDialog.note")}
          </blockquote>
          <figcaption className="mt-3 flex justify-end">
            <DeveloperSignature
              title={t("ascend.settings.pages.profile.signatureAlt")}
              className="h-auto w-28 text-foreground/80"
            />
          </figcaption>
        </figure>
      </DialogContent>
    </Dialog>
  );
};

export default SupportDialog;
