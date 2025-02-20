import { motion } from "framer-motion";
import React from "react";
import { useSettings } from "@/context/SettingsContext";

const PageTransition = ({ children }) => {
  const { settings } = useSettings();

  if (!settings.smoothTransitions) {
    return children;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ 
        duration: 0.2,
        ease: "easeInOut"
      }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
