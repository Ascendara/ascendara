import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Lock,
  Loader2,
  LogOut,
  ChevronRight,
  Check,
  Trash2,
  Infinity,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AccountActionsCard({
  t,
  handleLogout,
  showDeleteDialog,
  setShowDeleteDialog,
  deletePassword,
  setDeletePassword,
  isDeletingAccount,
  deleteHoldProgress,
  handleDeleteMouseDown,
  handleDeleteMouseUp,
  deleteConfirmed,
  setDeleteHoldProgress,
}) {
  return (
    <div className="mt-8 space-y-4 border-t border-border/50 pt-8">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {t("account.actions") || "Account Actions"}
      </h3>

      {/* Sign out button */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={handleLogout}
        className="group flex w-full items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4 text-left backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 transition-colors group-hover:bg-primary/10">
            <LogOut className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
          </div>
          <div>
            <span className="font-medium">{t("account.signOut")}</span>
            <p className="text-xs text-muted-foreground">
              {t("account.signOutDescription") || "Sign out of your account"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </motion.button>

      {/* Request Account Deletion */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="group flex w-full items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-4 text-left backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/10"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                <Trash2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span className="font-medium text-foreground">
                  {t("account.requestDeletion") || "Request Account Deletion"}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("account.deletionWarning") || "This action cannot be undone"}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </motion.button>
        </AlertDialogTrigger>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <Trash2 className="h-5 w-5 text-primary" />
              {t("account.deletion.title") || "Delete Account"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                {t("account.deletion.description") ||
                  "This will permanently delete your account and all associated data. This action cannot be undone."}
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-password" className="text-sm font-medium">
                  {t("account.deletion.enterPassword") ||
                    "Enter your password to confirm"}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="delete-password"
                    type="password"
                    value={deletePassword}
                    onChange={e => setDeletePassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                    disabled={isDeletingAccount}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-3 sm:flex-col">
            {/* Hold to delete button */}
            <div className="relative w-full overflow-hidden rounded-lg">
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-primary to-secondary"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: deleteHoldProgress / 100 }}
                style={{ transformOrigin: "left" }}
                transition={{ duration: 0.05 }}
              />
              <button
                onMouseDown={handleDeleteMouseDown}
                onMouseUp={handleDeleteMouseUp}
                onMouseLeave={handleDeleteMouseUp}
                onTouchStart={handleDeleteMouseDown}
                onTouchEnd={handleDeleteMouseUp}
                disabled={isDeletingAccount || deleteConfirmed}
                className="relative flex h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-primary bg-primary/10 font-medium text-primary transition-all hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AnimatePresence mode="wait">
                  {deleteConfirmed ? (
                    <motion.div
                      key="confirmed"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                      className="flex items-center gap-2 text-secondary"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1.2, 1] }}
                        transition={{ duration: 0.4, times: [0, 0.6, 1] }}
                      >
                        <Check className="h-5 w-5" />
                      </motion.div>
                      <span>{t("account.deletion.confirmed") || "Confirmed"}</span>
                    </motion.div>
                  ) : isDeletingAccount ? (
                    <motion.div
                      key="deleting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      >
                        <Loader2 className="h-4 w-4" />
                      </motion.div>
                      <span>{t("account.deletion.deleting") || "Deleting..."}</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="hold"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className={deleteHoldProgress > 0 ? "text-secondary" : ""}>
                        {deleteHoldProgress > 0
                          ? `${t("account.deletion.holdToDelete") || "Hold to delete"} (${Math.round(deleteHoldProgress)}%)`
                          : t("account.deletion.holdButton") ||
                            "Hold for 3 seconds to delete"}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </div>
            <AlertDialogCancel
              className="w-full"
              onClick={() => {
                setDeletePassword("");
                setDeleteHoldProgress(0);
              }}
            >
              {t("common.cancel") || "Cancel"}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
