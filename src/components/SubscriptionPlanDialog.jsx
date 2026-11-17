import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  ArrowRight,
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

const COPY = "ascend.settings.subscriptionDialogV2";
const FEATURE_INTERVAL_MS = 3500;

const formatPrice = (cents, currency = "usd") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

const planKind = plan =>
  plan.intervalCount === 0
    ? "lifetime"
    : plan.intervalCount === 6
      ? "sixMonth"
      : "monthly";

// One feature at a time, auto-advancing; hovering pauses it and the icons jump to one.
const FeatureShowcase = ({ t }) => {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const feature = FEATURES[active];
  const base = `${COPY}.includedFeatures.${feature.key}`;

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(
      () => setActive(index => (index + 1) % FEATURES.length),
      FEATURE_INTERVAL_MS
    );
    return () => clearTimeout(timer);
  }, [active, paused]);

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative h-[128px] overflow-hidden rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={feature.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <feature.icon className="h-4 w-4 text-white" />
              </div>
              <h4 className="text-sm font-semibold text-white">{t(`${base}.title`)}</h4>
            </div>
            <p className="mt-2.5 line-clamp-3 text-[13px] leading-relaxed text-white/75">
              {t(`${base}.description`)}
            </p>
          </motion.div>
        </AnimatePresence>
        {!paused && (
          <motion.div
            key={active}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: FEATURE_INTERVAL_MS / 1000, ease: "linear" }}
            className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/50"
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {FEATURES.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActive(index)}
            aria-label={t(`${COPY}.includedFeatures.${item.key}.title`)}
            title={t(`${COPY}.includedFeatures.${item.key}.title`)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
              index === active
                ? "scale-110 bg-white text-primary shadow-md"
                : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
};

const PartnerCodeField = ({ code, setCode, expanded, setExpanded, t }) => {
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <TicketPercent className="h-3.5 w-3.5" />
        {t(`${COPY}.partnerCode`)}
      </button>
    );
  }
  return (
    <div>
      <div
        className={cn(
          "flex h-10 items-center gap-2.5 rounded-xl border bg-background px-3 transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
          code ? "border-primary/50" : "border-border"
        )}
      >
        <TicketPercent
          className={cn(
            "h-4 w-4 shrink-0",
            code ? "text-primary" : "text-muted-foreground"
          )}
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
          placeholder={t(`${COPY}.partnerCodePlaceholder`)}
          aria-label={t(`${COPY}.partnerCodePlaceholder`)}
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm tracking-widest outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground"
        />
        {code && (
          <button
            type="button"
            onClick={() => setCode("")}
            aria-label={t(`${COPY}.removeCode`)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p
        className={cn(
          "mt-1.5 text-xs",
          code ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
        )}
      >
        {t(code ? `${COPY}.codeApplied` : `${COPY}.partnerCodeHint`)}
      </p>
    </div>
  );
};

const MembershipOption = ({
  plan,
  index,
  selected,
  blocked,
  hasPartnerCode,
  onSelect,
  t,
}) => {
  const kind = planKind(plan);
  const lifetime = kind === "lifetime";
  const currency = plan.currency || "usd";

  const name = t(`${COPY}.${kind}`);
  const badge = { sixMonth: t(`${COPY}.membersPick`), lifetime: t(`${COPY}.forever`) }[
    kind
  ];
  // With a partner code, lifetime is a fixed price instead of pay-what-you-want.
  const price =
    formatPrice(plan.unitAmount, currency) + (lifetime && !hasPartnerCode ? "+" : "");
  const suffix = t(
    `${COPY}.${{ monthly: "perMonth", sixMonth: "perSixMonths", lifetime: "once" }[kind]}`
  );
  const note = blocked
    ? t(`${COPY}.partnerCodeNotMonthly`)
    : {
        monthly: t(`${COPY}.monthlyNote`),
        sixMonth: t(`${COPY}.sixMonthNote`, {
          price: formatPrice(Math.round(plan.unitAmount / 6), currency),
        }),
        lifetime: hasPartnerCode
          ? t(`${COPY}.lifetimeWithCode`, {
              price: formatPrice(plan.unitAmount, currency),
            })
          : t(`${COPY}.lifetimeNote`),
      }[kind];

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: blocked ? 0.45 : 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.06, duration: 0.25 }}
      disabled={blocked}
      onClick={() => onSelect(plan.id)}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        blocked && "cursor-not-allowed",
        selected
          ? lifetime
            ? "border-amber-500/70 bg-amber-500/[0.07]"
            : "border-primary/70 bg-primary/[0.07]"
          : "border-border/70 hover:border-border hover:bg-muted/40"
      )}
    >
      <span
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selected
            ? lifetime
              ? "border-amber-500 bg-amber-500"
              : "border-primary bg-primary"
            : "border-muted-foreground/40"
        )}
      >
        {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{name}</span>
          {badge && (
            <span
              className={cn(
                "rounded-full px-2 py-px text-[10px] font-semibold uppercase tracking-wider",
                lifetime
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-primary/15 text-primary"
              )}
            >
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {note}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-lg font-bold leading-none tracking-tight text-foreground">
          {price}
        </span>
        <span className="mt-1 block text-[11px] text-muted-foreground">{suffix}</span>
      </span>
    </motion.button>
  );
};

const SubscriptionPlanDialog = ({
  open,
  onOpenChange,
  availablePlans,
  onPlanSelection,
  isLifetimeUpgrade = false,
  t,
}) => {
  const [showRedirectDialog, setShowRedirectDialog] = useState(false);
  const [partnerCode, setPartnerCode] = useState("");
  const [showPartnerCode, setShowPartnerCode] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const redirectCloseRef = useRef(null);
  const hasPartnerCode = partnerCode.length > 0;

  // Members already on a plan can only move up to lifetime.
  const plans = isLifetimeUpgrade
    ? availablePlans.filter(plan => plan.intervalCount === 0)
    : availablePlans;
  const isBlocked = plan => hasPartnerCode && planKind(plan) === "monthly";
  const preferred =
    plans.find(plan => planKind(plan) === "sixMonth") ||
    plans.find(plan => !isBlocked(plan)) ||
    plans[0];
  const selectedPlan =
    plans.find(plan => plan.id === selectedId && !isBlocked(plan)) ||
    (preferred && !isBlocked(preferred)
      ? preferred
      : plans.find(plan => !isBlocked(plan)));
  const joiningForLife = selectedPlan && planKind(selectedPlan) === "lifetime";

  // Each time the dialog opens, start from the recommended membership.
  useEffect(() => {
    if (open) setSelectedId(null);
  }, [open]);

  // Auto-close redirect dialog after 10 seconds
  useEffect(() => {
    if (!showRedirectDialog) return;
    const timer = setTimeout(() => setShowRedirectDialog(false), 10000);
    return () => clearTimeout(timer);
  }, [showRedirectDialog]);

  const handleJoin = async event => {
    if (!selectedPlan) return;
    if (event.currentTarget.contains(document.activeElement))
      document.activeElement.blur();
    onOpenChange(false);
    setShowRedirectDialog(true);
    if (!(await onPlanSelection(selectedPlan.id, partnerCode || undefined)))
      setShowRedirectDialog(false);
  };

  const title = t(isLifetimeUpgrade ? `${COPY}.lifetimeUpgradeTitle` : `${COPY}.title`);
  const description = t(
    isLifetimeUpgrade ? `${COPY}.lifetimeUpgradeDescription` : `${COPY}.description`
  );

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden border-border/50 bg-background p-0 sm:rounded-2xl">
          <button
            onClick={() => onOpenChange(false)}
            aria-label={t("common.close", { defaultValue: "Close" })}
            className="absolute right-3 top-3 z-20 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="grid min-h-0 overflow-y-auto md:grid-cols-[1fr_1.05fr]">
            {/* The invitation: who you're joining and what members get */}
            <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-violet-950 p-7 text-white md:p-8">
              <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-fuchsia-400/20 blur-3xl" />

              <div className="relative">
                <div className="flex items-center gap-3">
                  <AscendLogo className="h-10 w-10 drop-shadow-lg" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                    {t(`${COPY}.eyebrow`)}
                  </span>
                </div>

                <AlertDialogHeader className="mt-6 space-y-2 text-left">
                  <AlertDialogTitle className="text-3xl font-bold leading-tight tracking-tight text-white">
                    {title}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm leading-relaxed text-white/75">
                    {description}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="mt-7 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {t(`${COPY}.membersGet`)}
                  </h3>
                  <button
                    onClick={() =>
                      window.open("https://ascendara.app/ascend?ref=app", "_blank")
                    }
                    className="flex items-center gap-1 text-xs font-medium text-white/70 transition-colors hover:text-white"
                  >
                    {t(`${COPY}.seeEverything`)}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-3">
                  <FeatureShowcase t={t} />
                </div>
              </div>
            </section>

            {/* Choosing how to join */}
            <section className="flex flex-col p-7 md:p-8">
              <h3 className="text-sm font-semibold text-foreground">
                {t(`${COPY}.chooseMembership`)}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`${COPY}.sameMembership`)}
              </p>

              <div role="radiogroup" className="mt-5 space-y-2.5">
                {plans.map((plan, index) => (
                  <MembershipOption
                    key={plan.id}
                    plan={plan}
                    index={index}
                    selected={plan.id === selectedPlan?.id}
                    blocked={isBlocked(plan)}
                    hasPartnerCode={hasPartnerCode}
                    onSelect={setSelectedId}
                    t={t}
                  />
                ))}
              </div>

              <div className="mt-4">
                <PartnerCodeField
                  code={partnerCode}
                  setCode={setPartnerCode}
                  expanded={showPartnerCode}
                  setExpanded={setShowPartnerCode}
                  t={t}
                />
              </div>

              <div className="mt-auto pt-6">
                <button
                  disabled={!selectedPlan}
                  onClick={handleJoin}
                  className={cn(
                    "group flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
                    joiningForLife
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-amber-500 focus-visible:ring-amber-500"
                      : "bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary/90 focus-visible:ring-primary"
                  )}
                >
                  {t(joiningForLife ? `${COPY}.joinForLife` : `${COPY}.join`)}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <LockKeyhole className="h-3 w-3" />
                    {t(`${COPY}.securePayments`)}
                  </span>
                  {!joiningForLife && (
                    <span className="flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      {t(`${COPY}.leaveAnytime`)}
                    </span>
                  )}
                </div>
              </div>
            </section>
          </div>
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
              <Loader2
                className="absolute h-16 w-16 animate-spin text-primary/40"
                strokeWidth={1.5}
              />
              <AscendLogo className="h-8 w-8" />
            </div>
            <AlertDialogHeader className="text-center">
              <AlertDialogTitle>{t(`${COPY}.redirectingToCheckout`)}</AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-sm">
                {t(`${COPY}.completeCheckoutMessage`)}
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
