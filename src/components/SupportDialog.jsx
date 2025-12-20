import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, MessageCircle, DollarSign, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const SupportDialog = ({ onClose }) => {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [authToken, setAuthToken] = useState("");

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const AUTHORIZATION = await window.electron.getAPIKey();
        const response = await fetch("https://api.ascendara.app/auth/token", {
          headers: {
            Authorization: AUTHORIZATION,
          },
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

  const handleStarClick = value => {
    setRating(value);
  };

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
      fetch("https://api.ascendara.app/app/rate", {
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

  const handleDonate = () => {
    window.electron.openURL("https://ascendara.app/donate");
  };

  const handleFeedback = () => {
    window.electron.openURL("https://ascendara.app/feedback");
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative mx-4 w-full max-w-lg rounded-lg bg-card p-6 shadow-xl"
        >
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>

          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold text-foreground">
                {t("app.supportDialog.title")}
              </h2>
              <p className="text-muted-foreground">{t("app.supportDialog.message")}</p>
            </div>

            <div className="flex justify-center -space-x-1">
              {[1, 2, 3, 4, 5].map(value => (
                <button
                  key={value}
                  onMouseEnter={() => setHoveredStar(value)}
                  onMouseLeave={() => setHoveredStar(0)}
                  onClick={() => handleStarClick(value)}
                  className="px-1 transition-transform hover:scale-110"
                >
                  <Star
                    size={32}
                    className="transition-colors"
                    style={{
                      fill:
                        value <= (hoveredStar || rating)
                          ? "rgb(var(--color-star-filled, 250 204 21))"
                          : "transparent",
                      stroke:
                        value <= (hoveredStar || rating)
                          ? "rgb(var(--color-star-filled, 250 204 21))"
                          : "rgb(var(--color-star-empty, 148 163 184))",
                    }}
                  />
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleDonate}
                className="text-secondary-foreground flex items-center justify-center gap-2 rounded-lg bg-primary/80 px-4 py-3 transition-colors hover:bg-primary/90"
              >
                <DollarSign size={20} />
                {t("app.supportDialog.donate")}
              </button>
              <button
                onClick={handleFeedback}
                className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3 text-primary transition-colors hover:bg-secondary/90"
              >
                <MessageCircle size={20} />
                {t("app.supportDialog.feedback")}
              </button>
            </div>

            <div className="space-y-3 rounded-lg bg-primary/40 p-4 pt-2 text-center text-sm text-muted-foreground">
              <p className="px-8 italic">{t("app.supportDialog.note")}</p>
              <div className="flex justify-center">
                <img
                  src="https://cdn.ascendara.app/files/signature.svg"
                  className="w-28"
                  alt="Santiago Signature"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SupportDialog;
