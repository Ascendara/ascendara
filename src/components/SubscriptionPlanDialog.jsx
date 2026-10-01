import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Check,
  X,
  Download,
  Zap,
  Cloud,
  Users,
  Puzzle,
  Shield,
  Gamepad2,
  ExternalLink,
  Loader2,
  MessageCircle,
  Smartphone,
  Joystick,
  User,
  Trophy,
  RefreshCw,
  Eye,
  Sparkles,
  FlaskConical,
  HardDriveDownload,
  ListOrdered,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

const SubscriptionPlanDialog = ({
  open,
  onOpenChange,
  availablePlans,
  onPlanSelection,
  t,
}) => {
  const [showRedirectDialog, setShowRedirectDialog] = useState(false);
  const redirectCloseRef = useRef(null);

  // Auto-close redirect dialog after 10 seconds
  useEffect(() => {
    if (showRedirectDialog) {
      const timer = setTimeout(() => {
        setShowRedirectDialog(false);
      }, 10000); // 10 seconds

      return () => clearTimeout(timer);
    }
  }, [showRedirectDialog]);

  const handlePlanClick = async (planId, event) => {
    if (event.currentTarget.contains(document.activeElement)) document.activeElement.blur();

    // Close the main dialog
    onOpenChange(false);

    // Show redirect dialog
    setShowRedirectDialog(true);

    // Call the plan selection handler
    if (!(await onPlanSelection(planId))) setShowRedirectDialog(false);
  };
  const features = [
    { key: "cloudSyncing", icon: Cloud },
    { key: "friendsSocial", icon: Users },
    { key: "realTimeChat", icon: MessageCircle },
    { key: "ascendaraCompanion", icon: Smartphone },
    { key: "cloudBackups", icon: Shield },
    { key: "retroCloudSaves", icon: Gamepad2 },
    { key: "expandedEmulatorPresets", icon: Joystick },
    { key: "customProfiles", icon: User },
    { key: "leaderboard", icon: Trophy },
    { key: "autoUpdates", icon: RefreshCw },
    { key: "updatePreview", icon: Eye },
    { key: "nexusModsIntegration", icon: Puzzle },
    { key: "unlimitedDownloads", icon: Download },
    { key: "flingTrainers", icon: Zap },
    { key: "smartQueue", icon: ListOrdered },
    { key: "experimentalBranch", icon: FlaskConical },
    { key: "libraryBackups", icon: HardDriveDownload },
    { key: "andMoreComing", icon: Sparkles },
  ];

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className="max-w-5xl border-border/50 bg-background p-0">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 z-10 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="px-8 pb-8 pt-12">
            <AlertDialogHeader className="mb-12 text-center">
              <AlertDialogTitle>
                {t("ascend.settings.subscriptionDialogV2.title")}
              </AlertDialogTitle>
              <p className="mt-3 text-base text-muted-foreground">
                {t("ascend.settings.subscriptionDialogV2.description")}
              </p>
            </AlertDialogHeader>

            <div className="mb-10 grid gap-5 md:grid-cols-3">
              {availablePlans.map((plan, index) => {
                const isMonthly = plan.intervalCount === 1;
                const is6Month = plan.intervalCount === 6;
                const isLifetime = plan.intervalCount === 0;
                const totalPrice = plan.unitAmount / 100;
                const monthlyEquivalent =
                  plan.intervalCount > 0
                    ? (totalPrice / plan.intervalCount).toFixed(2)
                    : null;

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={event => handlePlanClick(plan.id, event)}
                    className={`group relative cursor-pointer overflow-hidden rounded-2xl border transition-all duration-300 ${
                      is6Month
                        ? "scale-105 border-primary/40 bg-primary/5 shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/20"
                        : isLifetime
                          ? "border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10"
                          : "border-border/50 bg-card/50 hover:border-border hover:bg-card"
                    }`}
                  >
                    {is6Month && (
                      <div className="text-primary-foreground absolute left-1/2 top-0 -translate-x-1/2 rounded-b-lg bg-primary px-4 py-1.5 text-xs font-medium">
                        {t("ascend.settings.subscriptionDialogV2.mostPopular")}
                      </div>
                    )}
                    {isLifetime && (
                      <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-medium text-black">
                        {t("ascend.settings.subscriptionDialogV2.oneTimePurchase")}
                      </div>
                    )}

                    <div className={`p-6 ${is6Month || isLifetime ? "pt-10" : "pt-6"}`}>
                      <div className="mb-6">
                        <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                          {isLifetime
                            ? t("ascend.settings.subscriptionDialogV2.lifetime")
                            : is6Month
                              ? t("ascend.settings.subscriptionDialogV2.bestValue")
                              : t("ascend.settings.subscriptionDialogV2.flexible")}
                        </h3>
                        <div className="mb-2 flex items-baseline gap-1">
                          <span className="text-4xl font-semibold tracking-tight text-foreground">
                            ${totalPrice}
                            {isLifetime && "+"}
                          </span>
                          {!isLifetime && (
                            <span className="text-sm text-muted-foreground">
                              /{isMonthly ? "mo" : "6mo"}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {isLifetime
                            ? t("ascend.settings.subscriptionDialogV2.lifetimeSupport")
                            : isMonthly
                              ? t("ascend.settings.subscriptionDialogV2.billedMonthly")
                              : t(
                                  "ascend.settings.subscriptionDialogV2.billedEvery6Months",
                                  { price: `$${monthlyEquivalent}` }
                                )}
                        </p>
                      </div>

                      <button
                        className={`mb-6 w-full rounded-xl py-3 font-medium transition-all ${
                          is6Month
                            ? "bg-primary text-white shadow-md hover:bg-primary/90 hover:shadow-lg"
                            : isLifetime
                              ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md hover:from-amber-600 hover:to-amber-700 hover:shadow-lg"
                              : "bg-muted text-foreground hover:bg-muted/80"
                        }`}
                      >
                        {t("ascend.settings.subscriptionDialogV2.continue")}
                      </button>

                      <div className="space-y-3 text-sm">
                        <div className="flex items-center gap-2.5 text-muted-foreground">
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                          <span>
                            {t("ascend.settings.subscriptionDialogV2.allPremiumFeatures")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 text-muted-foreground">
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                          <span>
                            {t("ascend.settings.subscriptionDialogV2.prioritySupport")}
                          </span>
                        </div>
                        {is6Month && (
                          <div className="flex items-center gap-2.5 font-medium text-primary">
                            <Check className="h-4 w-4 shrink-0" />
                            <span>
                              {t("ascend.settings.subscriptionDialogV2.save25")}
                            </span>
                          </div>
                        )}
                        {isLifetime && (
                          <div className="flex items-center gap-2.5 font-medium text-amber-600">
                            <Check className="h-4 w-4 shrink-0" />
                            <span>
                              {t("ascend.settings.subscriptionDialogV2.neverPayAgain")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/30 p-6">
              <div className="mb-5 flex items-center justify-center gap-2">
                <h3 className="text-sm font-medium text-foreground">
                  {t("ascend.settings.subscriptionDialogV2.everythingIncluded")}
                </h3>
                <button
                  onClick={() =>
                    window.open("https://ascendara.app/ascend?ref=app", "_blank")
                  }
                  className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                  <span className="flex items-center gap-1">
                    {t("ascend.settings.subscriptionDialogV2.learnMore")}{" "}
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((feature, i) => (
                  <motion.div
                    key={feature.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    className="flex gap-3 rounded-lg border border-border/50 bg-background/60 p-4"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <feature.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-foreground">
                        {t(
                          `ascend.settings.subscriptionDialogV2.includedFeatures.${feature.key}.title`
                        )}
                      </h4>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t(
                          `ascend.settings.subscriptionDialogV2.includedFeatures.${feature.key}.description`
                        )}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Redirect Loading Dialog */}
      <AlertDialog open={showRedirectDialog} onOpenChange={setShowRedirectDialog}>
        <AlertDialogContent
          className="max-w-md border-border/50 bg-background"
          onOpenAutoFocus={() => redirectCloseRef.current?.focus()}
        >
          <button
            ref={redirectCloseRef}
            onClick={() => setShowRedirectDialog(false)}
            className="absolute right-4 top-4 z-10 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex flex-col items-center justify-center space-y-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <AlertDialogHeader className="text-center">
              <AlertDialogTitle>
                {t("ascend.settings.subscriptionDialogV2.redirectingToCheckout")}
              </AlertDialogTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("ascend.settings.subscriptionDialogV2.completeCheckoutMessage")}
              </p>
            </AlertDialogHeader>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SubscriptionPlanDialog;
