import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const FirstIndexDialog = ({ onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleGoToIndex = async () => {
    onClose();
    navigate("/localrefresh");
  };

  const handleSkip = async () => {
    onClose();
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
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Database className="h-12 w-12 text-primary" />
              </div>
            </div>

            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold text-foreground">
                {t("app.firstIndexDialog.title") || "Game Index Required"}
              </h2>
              <p className="text-muted-foreground">
                {t("app.firstIndexDialog.message") ||
                  "This version of Ascendara requires you to build a local game index. This is a one-time process that will allow you to browse and download games."}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleGoToIndex}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-secondary transition-colors hover:bg-primary/90"
              >
                {t("app.firstIndexDialog.goToIndex") || "Set Up Game Index"}
                <ArrowRight size={20} />
              </button>
              <button
                onClick={handleSkip}
                className="w-full rounded-lg bg-secondary px-4 py-3 text-muted-foreground transition-colors hover:bg-secondary/90"
              >
                {t("app.firstIndexDialog.skip") || "Skip for Now"}
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {t("app.firstIndexDialog.note") ||
                "You can always set up the game index later from Settings."}
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default FirstIndexDialog;
