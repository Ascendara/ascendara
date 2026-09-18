
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "react-i18next";
import { Loader } from "lucide-react";

const UpdateOverlay = () => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor:
          theme === "dark" ? "rgba(0, 0, 0, 0.85)" : "rgba(255, 255, 255, 0.85)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backdropFilter: "blur(8px)",
      }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col items-center"
      >
        <Loader className="animate-spin text-primary" />
        <h2
          className={`mb-2 text-2xl font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}
        >
          {t("app.loading.installingUpdate")}
        </h2>
        <p
          className={`text-base ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}
        >
          {t("app.loading.ascendaraWillRestart")}
        </p>
      </motion.div>
    </motion.div>
  );
};

export default UpdateOverlay;
