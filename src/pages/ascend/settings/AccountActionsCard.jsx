import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Loader2,
  LogOut,
  Check,
  Trash2,
  Infinity as InfinityIcon,
} from "lucide-react";
import { FocusHero, FocusLine } from "./SettingsLayout";
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
  photoURL,
  displayName,
  email,
  handleLogout,
  showDeleteDialog,
  setShowDeleteDialog,
  showDepartureDialog,
  handleCancelDeparture,
  handleAccountDeletion,
  deletePassword,
  setDeletePassword,
  isDeletingAccount,
  deleteHoldProgress,
  handleDeleteMouseDown,
  handleDeleteMouseUp,
  deleteConfirmed,
  setDeleteHoldProgress,
}) {
  const [departureReason, setDepartureReason] = useState("");
  useEffect(() => {
    if (!showDepartureDialog) setDepartureReason("");
  }, [showDepartureDialog]);
  const closeDeparture = () => {
    setDepartureReason("");
    handleCancelDeparture();
  };

  return (
    <div className="space-y-8">
      <FocusHero
        media={
          <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary text-2xl font-semibold text-secondary">
            {photoURL ? (
              <img
                src={photoURL}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              (displayName || email || "U").charAt(0).toUpperCase()
            )}
          </div>
        }
        eyebrow={t("ascend.settings.pages.account.signedInAs")}
        title={displayName || email}
        description={displayName ? email : undefined}
      >
        <Button variant="outline" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
          {t("account.signOut")}
        </Button>
      </FocusHero>

      {/* Request Account Deletion */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <FocusLine
          icon={Trash2}
          danger
          label={t("account.requestDeletion") || "Request Account Deletion"}
          description={t("account.deletion.description")}
        >
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {t("ascend.settings.pages.account.requestDeletionButton")}
            </Button>
          </AlertDialogTrigger>
        </FocusLine>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
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
                          repeat: InfinityIcon,
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
      <AlertDialog
        open={showDepartureDialog}
        onOpenChange={open => {
          if (!open && !isDeletingAccount) closeDeparture();
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("account.deletion.departureTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("account.deletion.departureDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="departure-reason">{t("account.deletion.departureTitle")}</Label>
            <Textarea
              id="departure-reason"
              value={departureReason}
              onChange={e => setDepartureReason(e.target.value)}
              placeholder={t("account.deletion.departurePlaceholder")}
              maxLength={1000}
              rows={4}
              disabled={isDeletingAccount}
            />
          </div>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <button
              type="button"
              onClick={() => handleAccountDeletion("")}
              disabled={isDeletingAccount}
              className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {t("account.deletion.departureSkip")}
            </button>
            <button
              type="button"
              onClick={() => handleAccountDeletion(departureReason.trim())}
              disabled={isDeletingAccount || !departureReason.trim()}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {isDeletingAccount ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("account.deletion.departureSubmit")}
            </button>
            <AlertDialogCancel disabled={isDeletingAccount} onClick={closeDeparture}>
              {t("common.cancel") || "Cancel"}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
