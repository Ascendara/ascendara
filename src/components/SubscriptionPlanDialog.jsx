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
  LockKeyhole,
  TicketPercent,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "./ui/alert-dialog";
import AscendLogo from "./AscendLogo";
import { cn } from "@/lib/utils";

const FEATURES = [
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

// Each plan's accent, kept in one place so cards, chips and buttons agree.
const PLAN_STYLES = {
  monthly: {
    card: "border-border/60 bg-card/60 hover:border-border hover:bg-card",
    chip: "",
    check: "text-muted-foreground",
    cta: "bg-muted text-foreground group-hover:bg-muted/70",
  },
  sixMonth: {
    card: "border-primary/50 bg-primary/[0.06] shadow-xl shadow-primary/10 ring-1 ring-primary/30 hover:shadow-primary/20",
    chip: "bg-primary text-white",
    check: "text-primary",
    cta: "bg-primary text-white shadow-md shadow-primary/30 group-hover:bg-primary/90",
  },
  lifetime: {
    card: "border-amber-500/40 bg-gradient-to-b from-amber-500/[0.08] to-transparent hover:border-amber-500/60 hover:shadow-lg hover:shadow-amber-500/10",
    chip: "bg-gradient-to-r from-amber-500 to-amber-600 text-black",
    check: "text-amber-500",
    cta: "bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-md shadow-amber-500/25 group-hover:from-amber-400 group-hover:to-amber-500",
  },
};

const formatPrice = (cents, currency = "usd") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

const PartnerCodeField = ({ code, setCode, expanded, setExpanded, t }) => {
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mx-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <TicketPercent className="h-4 w-4" />
        {t("ascend.settings.subscriptionDialogV2.partnerCode")}
      </button>
    );
  }
  return (
    <div className="mx-auto w-full max-w-sm">
      <div
        className={cn(
          "flex h-11 items-center gap-2.5 rounded-xl border bg-background px-3 transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
          code ? "border-primary/50" : "border-border"
        )}
      >
        <TicketPercent
          className={cn("h-4 w-4 shrink-0", code ? "text-primary" : "text-muted-foreground")}
        />
        <input
          autoFocus
          value={code}
          onChange={event =>
            setCode(
              event.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9_-]/g, "")
                .slice(0, 64)
            )
          }
          placeholder={t("ascend.settings.subscriptionDialogV2.partnerCodePlaceholder")}
          aria-label={t("ascend.settings.subscriptionDialogV2.partnerCodePlaceholder")}
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm tracking-widest outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground"
        />
        {code && (
          <button
            type="button"
            onClick={() => setCode("")}
            aria-label={t("ascend.settings.subscriptionDialogV2.removeCode")}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {t("ascend.settings.subscriptionDialogV2.partnerCodeHint")}
      </p>
    </div>
  );
};

const PlanCard = ({ plan, index, hasPartnerCode, onSelect, t }) => {
  const kind =
    plan.intervalCount === 0 ? "lifetime" : plan.intervalCount === 6 ? "sixMonth" : "monthly";
  const style = PLAN_STYLES[kind];
  const blocked = kind === "monthly" && hasPartnerCode;
  const codeApplies = hasPartnerCode && kind !== "monthly";
  const currency = plan.currency || "usd";

  const name = {
    monthly: t("ascend.settings.monthly"),
    sixMonth: t("ascend.settings.sixMonths"),
    lifetime: t("ascend.settings.subscriptionDialogV2.lifetime"),
  }[kind];
  const chip = {
    sixMonth: t("ascend.settings.subscriptionDialogV2.mostPopular"),
    lifetime: t("ascend.settings.subscriptionDialogV2.oneTimePurchase"),
  }[kind];
  // With a partner code, lifetime is a fixed price instead of pay-what-you-want.
  const price =
    formatPrice(plan.unitAmount, currency) + (kind === "lifetime" && !hasPartnerCode ? "+" : "");
  const suffix = {
    monthly: t("ascend.settings.subscriptionDialogV2.perMonth"),
    sixMonth: t("ascend.settings.subscriptionDialogV2.perSixMonths"),
  }[kind];
  const subtitle = {
    monthly: t("ascend.settings.subscriptionDialogV2.billedMonthly"),
    sixMonth: t("ascend.settings.subscriptionDialogV2.billedEvery6Months", {
      price: formatPrice(Math.round(plan.unitAmount / 6), currency),
    }),
    lifetime: hasPartnerCode
      ? t("ascend.settings.subscriptionDialogV2.lifetimeWithCode", {
          price: formatPrice(plan.unitAmount, currency),
        })
      : t("ascend.settings.subscriptionDialogV2.lifetimeSupport"),
  }[kind];
  const perks = [
    { label: t("ascend.settings.subscriptionDialogV2.allPremiumFeatures") },
    { label: t("ascend.settings.subscriptionDialogV2.prioritySupport") },
    kind === "sixMonth" && {
      label: t("ascend.settings.subscriptionDialogV2.save25"),
      highlight: true,
    },
    kind === "lifetime" && {
      label: t("ascend.settings.subscriptionDialogV2.neverPayAgain"),
      highlight: true,
    },
  ].filter(Boolean);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: blocked ? 0.45 : 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      disabled={blocked}
      onClick={event => onSelect(plan.id, event)}
      className={cn(
        "group relative flex flex-col rounded-2xl border p-6 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        style.card,
        blocked ? "cursor-not-allowed" : "hover:-translate-y-0.5"
      )}
    >
      <div className="flex min-h-[1.5rem] items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{name}</span>
        {chip && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              style.chip
            )}
          >
            {chip}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight text-foreground">{price}</span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      <p className="mt-2 min-h-[2.5rem] text-sm leading-snug text-muted-foreground">
        {subtitle}
      </p>

      <div className="my-5 h-px bg-border/60" />

      <ul className="space-y-2.5 text-sm">
        {perks.map(perk => (
          <li
            key={perk.label}
            className={cn(
              "flex items-center gap-2.5",
              perk.highlight ? cn("font-medium", style.check) : "text-muted-foreground"
            )}
          >
            <Check className={cn("h-4 w-4 shrink-0", style.check)} />
            {perk.label}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        {codeApplies && (
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <TicketPercent className="h-3.5 w-3.5" />
            {t("ascend.settings.subscriptionDialogV2.codeApplied")}
          </p>
        )}
        <span
          className={cn(
            "flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition-all",
            style.cta
          )}
        >
          {blocked
            ? t("ascend.settings.subscriptionDialogV2.partnerCodeNotMonthly")
            : t("ascend.settings.subscriptionDialogV2.continue")}
        </span>
      </div>
    </motion.button>
  );
};

const TrustFooter = ({ t, showCancel }) => (
  <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
    <span className="flex items-center gap-1.5">
      <LockKeyhole className="h-3.5 w-3.5" />
      {t("ascend.settings.subscriptionDialogV2.securePayments")}
    </span>
    {showCancel && (
      <span className="flex items-center gap-1.5">
        <Check className="h-3.5 w-3.5" />
        {t("ascend.settings.subscriptionDialogV2.cancelAnytime")}
      </span>
    )}
  </div>
);

const SubscriptionPlanDialog = ({
  open,
  onOpenChange,
  availablePlans,
  onPlanSelection,
  isLifetimeUpgrade = false,
  t,
}) => {
  const lifetimePlan = availablePlans.find(plan => plan.intervalCount === 0);
  const [showRedirectDialog, setShowRedirectDialog] = useState(false);
  const [partnerCode, setPartnerCode] = useState("");
  const [showPartnerCode, setShowPartnerCode] = useState(false);
  const redirectCloseRef = useRef(null);
  const hasPartnerCode = partnerCode.length > 0;
  const partnerCodeField = (
    <PartnerCodeField
      code={partnerCode}
      setCode={setPartnerCode}
      expanded={showPartnerCode}
      setExpanded={setShowPartnerCode}
      t={t}
    />
  );

  // Auto-close redirect dialog after 10 seconds
  useEffect(() => {
    if (!showRedirectDialog) return;
    const timer = setTimeout(() => setShowRedirectDialog(false), 10000);
    return () => clearTimeout(timer);
  }, [showRedirectDialog]);

  const handlePlanClick = async (planId, event) => {
    if (event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
    onOpenChange(false);
    setShowRedirectDialog(true);
    if (!(await onPlanSelection(planId, partnerCode || undefined))) setShowRedirectDialog(false);
  };

  const closeButton = (
    <button
      onClick={() => onOpenChange(false)}
      aria-label={t("common.close", { defaultValue: "Close" })}
      className="absolute right-4 top-4 z-10 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <X className="h-5 w-5" />
    </button>
  );

  const brandMark = (
    <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-background shadow-lg shadow-primary/15">
      <AscendLogo className="h-9 w-9" />
    </div>
  );

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent
          className={cn(
            "flex max-h-[90vh] flex-col gap-0 overflow-hidden border-border/50 bg-background p-0 sm:rounded-2xl",
            isLifetimeUpgrade ? "max-w-md" : "max-w-5xl"
          )}
        >
          {closeButton}

          {isLifetimeUpgrade ? (
            <div className="relative overflow-y-auto px-8 pb-7 pt-10">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent" />
              <div className="relative">
                {brandMark}
                <AlertDialogHeader className="text-center">
                  <AlertDialogTitle className="text-2xl font-bold tracking-tight">
                    {t("ascend.settings.upgradeToLifetime")}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="leading-relaxed">
                    {t("ascend.settings.lifetimeUpgradeDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                {lifetimePlan && (
                  <div className="my-6 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/[0.08] to-transparent p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        {t("ascend.settings.subscriptionDialogV2.lifetime")}
                      </span>
                      <span className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black">
                        {t("ascend.settings.subscriptionDialogV2.oneTimePurchase")}
                      </span>
                    </div>
                    <p className="mt-4 text-4xl font-bold tracking-tight">
                      {formatPrice(lifetimePlan.unitAmount, lifetimePlan.currency || "usd")}
                      {!hasPartnerCode && "+"}
                    </p>
                    <p className="mt-2 text-sm leading-snug text-muted-foreground">
                      {hasPartnerCode
                        ? t("ascend.settings.subscriptionDialogV2.lifetimeWithCode", {
                            price: formatPrice(
                              lifetimePlan.unitAmount,
                              lifetimePlan.currency || "usd"
                            ),
                          })
                        : t("ascend.settings.subscriptionDialogV2.lifetimeSupport")}
                    </p>
                    <div className="my-4 h-px bg-border/60" />
                    <ul className="space-y-2.5 text-sm text-muted-foreground">
                      {["allPremiumFeatures", "neverPayAgain"].map(key => (
                        <li key={key} className="flex items-center gap-2.5">
                          <Check className="h-4 w-4 shrink-0 text-amber-500" />
                          {t(`ascend.settings.subscriptionDialogV2.${key}`)}
                        </li>
                      ))}
                    </ul>
                    {hasPartnerCode && (
                      <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <TicketPercent className="h-3.5 w-3.5" />
                        {t("ascend.settings.subscriptionDialogV2.codeApplied")}
                      </p>
                    )}
                  </div>
                )}

                <button
                  disabled={!lifetimePlan}
                  onClick={event => handlePlanClick(lifetimePlan.id, event)}
                  className="h-12 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 font-semibold text-black shadow-md shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
                >
                  {t("ascend.settings.upgradeToLifetime")}
                </button>
                <div className="mt-5">{partnerCodeField}</div>
                <div className="mt-6">
                  <TrustFooter t={t} />
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto">
              <div className="relative px-6 pb-10 pt-12 sm:px-10">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent" />
                <div className="relative">
                  {brandMark}
                  <AlertDialogHeader className="mb-10 text-center">
                    <AlertDialogTitle className="text-3xl font-bold tracking-tight">
                      {t("ascend.settings.subscriptionDialogV2.title")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="mx-auto mt-2 max-w-xl text-base">
                      {t("ascend.settings.subscriptionDialogV2.description")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div
                    className={cn(
                      "grid gap-5",
                      availablePlans.length === 1 ? "mx-auto max-w-sm" : "md:grid-cols-3"
                    )}
                  >
                    {availablePlans.map((plan, index) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        index={index}
                        hasPartnerCode={hasPartnerCode}
                        onSelect={handlePlanClick}
                        t={t}
                      />
                    ))}
                  </div>

                  <div className="mt-7">{partnerCodeField}</div>
                  <div className="mt-5">
                    <TrustFooter t={t} showCancel />
                  </div>
                </div>
              </div>

              <div className="border-t border-border/50 bg-muted/20 px-6 py-8 sm:px-10">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">
                    {t("ascend.settings.subscriptionDialogV2.everythingIncluded")}
                  </h3>
                  <button
                    onClick={() => window.open("https://ascendara.app/ascend?ref=app", "_blank")}
                    className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    {t("ascend.settings.subscriptionDialogV2.learnMore")}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                  {FEATURES.map(feature => {
                    const base = `ascend.settings.subscriptionDialogV2.includedFeatures.${feature.key}`;
                    return (
                      <div key={feature.key} className="flex gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <feature.icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-medium text-foreground">
                            {t(`${base}.title`)}
                          </h4>
                          <p
                            title={t(`${base}.description`)}
                            className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                          >
                            {t(`${base}.description`)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Redirect Loading Dialog */}
      <AlertDialog open={showRedirectDialog} onOpenChange={setShowRedirectDialog}>
        <AlertDialogContent
          className="max-w-md border-border/50 bg-background sm:rounded-2xl"
          onOpenAutoFocus={() => redirectCloseRef.current?.focus()}
        >
          <button
            ref={redirectCloseRef}
            onClick={() => setShowRedirectDialog(false)}
            aria-label={t("common.close", { defaultValue: "Close" })}
            className="absolute right-4 top-4 z-10 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex flex-col items-center justify-center space-y-4 py-6">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <Loader2 className="absolute h-16 w-16 animate-spin text-primary/40" strokeWidth={1.5} />
              <AscendLogo className="h-8 w-8" />
            </div>
            <AlertDialogHeader className="text-center">
              <AlertDialogTitle>
                {t("ascend.settings.subscriptionDialogV2.redirectingToCheckout")}
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-sm">
                {t("ascend.settings.subscriptionDialogV2.completeCheckoutMessage")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {partnerCode && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-xs tracking-widest text-emerald-600 dark:text-emerald-400">
                <TicketPercent className="h-3.5 w-3.5" />
                {partnerCode}
              </span>
            )}
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SubscriptionPlanDialog;
