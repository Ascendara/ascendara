import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquareText, TriangleAlert, Sparkles } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import ReportIssue from "./ReportIssue";
import "./ContextMenu.css";

const ContextMenu = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isReportOpen, setIsReportOpen] = useState(false);
  const menuRef = useRef(null);
  const { t } = useLanguage();

  const handleContextMenu = e => {
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;

    // Ensure menu stays within viewport
    const menuWidth = 200; // Approximate menu width
    const menuHeight = 200; // Approximate menu height
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = Math.min(x, viewportWidth - menuWidth);
    let adjustedY = y;

    // Check if menu would go off bottom of screen
    if (y + menuHeight > viewportHeight) {
      // Open upward instead
      adjustedY = Math.max(0, y - menuHeight);
    }

    // Ensure it doesn't go off top
    adjustedY = Math.max(0, Math.min(adjustedY, viewportHeight - menuHeight));

    setPosition({ x: adjustedX, y: adjustedY });
    setIsVisible(true);
  };

  const handleClickOutside = e => {
    if (menuRef.current && !menuRef.current.contains(e.target)) {
      setIsVisible(false);
    }
  };

  const handleReport = () => {
    setIsReportOpen(true);
    setIsVisible(false);
  };

  const handleFeedback = () => {
    window.electron.openURL("https://ascendara.app/feedback");
    setIsVisible(false);
  };

  useEffect(() => {
    // Only attach listeners if we haven't already
    if (!window.__contextMenuListenersAttached) {
      document.addEventListener("contextmenu", handleContextMenu);
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("keydown", e => {
        if (e.key === "Escape") setIsVisible(false);
      });
      window.__contextMenuListenersAttached = true;
    }

    return () => {
      // Only remove listeners if we're the last instance
      if (window.__contextMenuListenersAttached) {
        document.removeEventListener("contextmenu", handleContextMenu);
        document.removeEventListener("click", handleClickOutside);
        document.removeEventListener("keydown", e => {
          if (e.key === "Escape") setIsVisible(false);
        });
        window.__contextMenuListenersAttached = false;
      }
    };
  }, []);

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="context-menu-backdrop"
              onClick={() => setIsVisible(false)}
            />
            
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.92, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0, top: position.y, left: position.x }}
              exit={{ opacity: 0, scale: 0.92, y: -8 }}
              transition={{ 
                duration: 0.2,
                ease: [0.16, 1, 0.3, 1]
              }}
              className="context-menu"
              style={{
                position: "fixed",
                top: position.y,
                left: position.x,
                zIndex: 1001,
              }}
            >
              {/* Glow effect */}
              <div className="context-menu-glow" />
              
              <div className="context-menu-content">
                {/* Header */}
                <div className="context-menu-header">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{t("common.contextMenu.menu")}</span>
                </div>

                {/* Separator */}
                <div className="context-menu-separator" />

                {/* Menu Items */}
                <motion.button
                  onClick={handleReport}
                  className="context-menu-item"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="context-menu-item-icon">
                    <TriangleAlert className="h-4 w-4" />
                  </div>
                  <div className="context-menu-item-content">
                    <span className="context-menu-item-label">
                      {t("common.reportIssue")}
                    </span>
                    <span className="context-menu-item-description">
                      {t("common.contextMenu.reportIssueDescription")}
                    </span>
                  </div>
                </motion.button>

                <motion.button
                  onClick={handleFeedback}
                  className="context-menu-item"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="context-menu-item-icon">
                    <MessageSquareText className="h-4 w-4" />
                  </div>
                  <div className="context-menu-item-content">
                    <span className="context-menu-item-label">
                      {t("common.giveFeedback")}
                    </span>
                    <span className="context-menu-item-description">
                      {t("common.contextMenu.shareFeedbackDescription")}
                    </span>
                  </div>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <ReportIssue isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} />
    </>
  );
};

export default ContextMenu;
