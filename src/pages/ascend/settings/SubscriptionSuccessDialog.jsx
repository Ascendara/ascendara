import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkle, Crown, BadgeCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function SubscriptionSuccessDialog({
  showSubscriptionSuccess,
  setShowSubscriptionSuccess,
  t,
}) {
  return (
    <AlertDialog open={showSubscriptionSuccess} onOpenChange={setShowSubscriptionSuccess}>
      <AlertDialogContent className="max-w-md overflow-hidden border-0 bg-gradient-to-b from-background to-background/95 p-0 shadow-2xl">
        <AlertDialogHeader className="sr-only">
          <AlertDialogTitle>{t("ascend.settings.welcomeToAscend")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("ascend.settings.subscriptionSuccessMessage")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-500/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />
        </div>

        <div className="relative p-8 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", duration: 0.8 }}
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500 to-amber-600 shadow-xl shadow-yellow-500/30"
          >
            <Crown className="h-10 w-10 text-white" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="mb-2 bg-gradient-to-r from-yellow-500 to-amber-600 bg-clip-text text-2xl font-bold text-transparent">
              {t("ascend.settings.welcomeToAscend")}
            </h2>
            <p className="mb-6 text-muted-foreground">
              {t("ascend.settings.subscriptionSuccessMessage")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <BadgeCheck className="h-4 w-4 text-emerald-500" />
              <span>{t("ascend.settings.allFeaturesUnlocked")}</span>
            </div>

            <Button
              className="h-12 w-full gap-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-white shadow-lg shadow-yellow-500/25 transition-shadow hover:shadow-yellow-500/40"
              onClick={() => setShowSubscriptionSuccess(false)}
            >
              <Sparkle className="h-4 w-4" />
              {t("ascend.settings.startExploring")}
            </Button>
          </motion.div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
