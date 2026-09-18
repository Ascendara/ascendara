
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

const BrokenVersionDialog = ({ onClose }) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
          className="relative w-full max-w-lg rounded-lg bg-background p-6 shadow-lg"
        >
          <div className="flex items-center gap-4 text-center">
            <AlertTriangle className="mb-2 h-10 w-10 text-yellow-500" />
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {t("app.brokenVersion.title")}
              </h2>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <p className="text-sm">{t("app.brokenVersion.description")}</p>
            <p className="text-sm">{t("app.brokenVersion.development")}</p>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() =>
                window.electron.openURL("https://lfs.ascendara.app/download?update")
              }
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-secondary hover:bg-primary/90"
            >
              {t("app.brokenVersion.update")}
            </button>
            <button
              onClick={onClose}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-secondary hover:bg-primary/90"
            >
              {t("app.brokenVersion.understand")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default BrokenVersionDialog;
