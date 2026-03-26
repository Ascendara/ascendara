import React, { useEffect, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Info, Clock, Check, Zap, TriangleAlert, MessageSquareText } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import ReportIssue from "./ReportIssue";

const GameContextMenu = ({ isOpen, onClose, position, game, onDownload, onReadMore, onPlayLater, isPlayLater, onStartDownload }) => {
  const { t } = useLanguage();
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleClickOutside = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }, [onClose]);

  const handleMenuClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Check if game has seamless download options
  const hasSeamlessOption = useMemo(() => {
    if (!game?.download_links) return false;
    const seamlessHosts = ["gofile", "buzzheavier", "pixeldrain"];
    const availableHosts = Object.keys(game.download_links);
    return availableHosts.some(host => seamlessHosts.includes(host));
  }, [game?.download_links]);

  if (!isOpen || !game) return null;

  const menuContent = (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[9999] flex items-start justify-start"
        onClick={handleClickOutside}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Backdrop with blur */}
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
        
        {/* Context Menu */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="absolute"
          style={{
            top: position.y,
            left: position.x,
          }}
          onClick={handleMenuClick}
        >
          <div className="min-w-[260px] overflow-hidden rounded-xl border border-border/50 bg-popover/95 shadow-2xl backdrop-blur-xl">
            {/* Header with game name */}
            <div className="flex items-center justify-center border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent px-3 py-3">
              <span className="text-sm font-semibold text-foreground line-clamp-1">
                {game.game}
              </span>
            </div>

            {/* Menu Items */}
            <div className="p-1.5">
              {hasSeamlessOption ? (
                <>
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onStartDownload) {
                        onStartDownload(game);
                      } else {
                        onDownload(game);
                      }
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 transition-all">
                      <Download className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{t("gameCard.downloadNow") || "Download Now"}</span>
                        <Zap className="h-3 w-3 fill-primary text-primary" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("gameCard.downloadNowDescription") || "Start downloading this game"}
                      </div>
                    </div>
                  </motion.button>
                  
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReadMore(game);
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/30">
                      <Info className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{t("gameCard.readMore") || "Read More"}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("gameCard.readMoreDescription") || "View game details"}
                      </div>
                    </div>
                  </motion.button>
                </>
              ) : (
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReadMore(game);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 transition-all">
                    <Info className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{t("gameCard.viewDetails") || "View Details"}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("gameCard.readMoreDescription") || "View game details"}
                    </div>
                  </div>
                </motion.button>
              )}
              
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayLater(game);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-md transition-all ${
                  isPlayLater ? "bg-primary/20" : "bg-accent/30"
                }`}>
                  {isPlayLater ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium">
                    {isPlayLater 
                      ? (t("gameCard.removeFromPlayLater") || "Remove from Play Later")
                      : (t("gameCard.addToPlayLater") || "Add to Play Later")
                    }
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isPlayLater
                      ? (t("gameCard.removeFromPlayLaterDescription") || "Remove from your list")
                      : (t("gameCard.addToPlayLaterDescription") || "Save for later")
                    }
                  </div>
                </div>
              </motion.button>

              {/* Divider */}
              <div className="my-1.5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

              {/* Report Issue */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsReportOpen(true);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/30">
                  <TriangleAlert className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{t("common.reportIssue") || "Report Issue"}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("common.contextMenu.reportIssueDescription") || "Report a problem"}
                  </div>
                </div>
              </motion.button>

              {/* Give Feedback */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  window.electron.openURL("https://ascendara.app/feedback");
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:translate-x-0.5"
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/30">
                  <MessageSquareText className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{t("common.giveFeedback") || "Give Feedback"}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("common.contextMenu.shareFeedbackDescription") || "Share your thoughts"}
                  </div>
                </div>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return (
    <>
      {createPortal(menuContent, document.body)}
      <ReportIssue isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} />
    </>
  );
};

export default GameContextMenu;
