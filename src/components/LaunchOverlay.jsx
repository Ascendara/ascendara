import { motion, AnimatePresence } from "framer-motion";
import React from "react";
import { Loader } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const LaunchOverlay = ({
  isVisible,
  gameName,
  logoSrc,
  gridSrc,
  bgSrc,
  isLaunching,
  isRunning,
}) => {
  const { t } = useLanguage();
  if (!isVisible) return null;
  const isGameplayMode = !isLaunching && isRunning; // Game is running
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-background"
    >
      {/* Blurred/darkened background */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40 blur-md"
        style={{ backgroundImage: `url(${bgSrc || gridSrc})` }}
      />
      <div className="absolute inset-0 z-0 bg-black/50" />

      <div className="z-10 flex flex-col items-center gap-8">
        {/* Logo or Title */}
        {logoSrc ? (
          <motion.img
            src={logoSrc}
            className="h-32 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          />
        ) : (
          <motion.h1
            className="text-5xl font-black text-primary drop-shadow-lg"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          >
            {gameName}
          </motion.h1>
        )}

        {/* Animated grid image */}
        <motion.div
          className="relative rounded-xl shadow-[0_0_50px_hsl(var(--primary)/0.4)]"
          animate={{
            scale: [1, 1.02, 1],
            boxShadow: [
              "0 0 30px hsl(var(--primary)/0.3)",
              "0 0 60px hsl(var(--primary)/0.6)",
              "0 0 30px hsl(var(--primary)/0.3)",
            ],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <img
            src={gridSrc}
            className="h-[400px] w-auto rounded-xl border-2 border-primary/30 object-contain"
          />
        </motion.div>

        {/* Loading text */}
        <div className="mt-8 flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="animate-pulse text-xl font-medium tracking-widest text-muted-foreground">
            {t("bigPicture.launching")}
          </span>
        </div>
      </div>
    </motion.div>
  );
};
export default LaunchOverlay;
