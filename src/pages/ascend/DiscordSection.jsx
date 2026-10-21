import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Copy,
  Crown,
  ExternalLink,
  Hash,
  Info,
  Lock,
  LifeBuoy,
  User,
} from "lucide-react";
import SectionHeader from "./SectionHeader";
import DiscordIcon from "./DiscordIcon";
import { Panel } from "./primitives";

const DISCORD_URL = "https://ascendara.app/discord";

const PERKS = [
  // Gated perks only unlock once the account is verified on the server
  { key: "role", icon: BadgeCheck, gated: true },
  { key: "channels", icon: Hash, gated: true },
  { key: "support", icon: LifeBuoy },
];

const fadeIn = delay => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay },
});

// The Discord bot writes the linked username onto the user's socials once the
// verify command succeeds, so its presence is what "connected" means.
export default function DiscordSection({
  t,
  user,
  userData,
  ascendAccess,
  handleSubscribe,
}) {
  const linkedDiscord = userData?.socials?.linkedDiscord;
  const isConnected = Boolean(linkedDiscord);
  const isTrial = !ascendAccess?.isSubscribed && !ascendAccess?.isVerified;
  const verifyCode = user?.uid?.substring(0, 10) || "";
  const command = `=verifyascend ${verifyCode}`;

  const planLabel = ascendAccess?.isVerified
    ? t("ascend.subscription.verified")
    : ascendAccess?.isSubscribed
      ? t("ascend.subscription.active")
      : ascendAccess?.daysRemaining > 0
        ? t("ascend.subscription.trialDays", { days: ascendAccess.daysRemaining })
        : t("ascend.subscription.trialExpired");

  const copyCommand = () => {
    navigator.clipboard.writeText(command);
    toast.success(t("ascend.settings.commandCopied"));
  };

  const openDiscord = () => window.electron?.openURL(DISCORD_URL);

  const accountRows = [
    {
      icon: DiscordIcon,
      label: t("ascend.discord.discordAccount"),
      value: linkedDiscord,
    },
    {
      icon: User,
      label: t("ascend.discord.ascendAccount"),
      value: user?.displayName || user?.email,
    },
    { icon: Crown, label: t("ascend.discord.plan"), value: planLabel },
  ];

  return (
    <div className="mb-40 space-y-6">
      <SectionHeader
        title={t("ascend.discord.title")}
        description={t("ascend.discord.subtitle")}
        actions={
          <Button
            variant="outline"
            className="gap-2 border-[#5865F2]/30 bg-[#5865F2]/5 hover:bg-[#5865F2]/10"
            onClick={openDiscord}
          >
            <ExternalLink className="h-4 w-4" />
            {isConnected
              ? t("ascend.discord.openServer")
              : t("ascend.settings.joinDiscord")}
          </Button>
        }
      />

      {/* Connection status */}
      <motion.div {...fadeIn(0)}>
        <Panel className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#5865F2]/15 via-transparent to-transparent" />
          <DiscordIcon className="pointer-events-none absolute -right-6 -top-8 h-40 w-40 text-[#5865F2]/10" />
          <div className="relative flex flex-wrap items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#5865F2] text-white shadow-lg shadow-[#5865F2]/30">
              <DiscordIcon className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isConnected ? "bg-green-500" : "bg-muted-foreground/50"
                  }`}
                />
                <h2 className="text-lg font-semibold">
                  {isConnected
                    ? t("ascend.discord.connected")
                    : t("ascend.discord.notConnected")}
                </h2>
              </div>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {isConnected
                  ? t("ascend.discord.connectedDescription")
                  : t("ascend.discord.notConnectedDescription")}
              </p>
            </div>
            {isConnected && (
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                <BadgeCheck className="h-4 w-4" />
                <span className="max-w-[200px] truncate">{linkedDiscord}</span>
              </div>
            )}
          </div>
        </Panel>
      </motion.div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {!isConnected && isTrial && (
            <motion.div
              {...fadeIn(0.05)}
              className="flex flex-wrap items-start gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/20">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                  {t("ascend.settings.verificationRequiresSubscription")}
                </p>
                <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                  {t("ascend.settings.verificationTrialWarning")}
                </p>
              </div>
              {handleSubscribe && (
                <Button
                  size="sm"
                  className="gap-2 text-secondary"
                  onClick={handleSubscribe}
                >
                  <Crown className="h-4 w-4" />
                  {t("ascend.discord.subscribe")}
                </Button>
              )}
            </motion.div>
          )}

          {isConnected ? (
            <motion.div {...fadeIn(0.1)}>
              <Panel className="p-5">
                <h3 className="font-medium">{t("ascend.discord.linkedAccounts")}</h3>
                <dl className="mt-4 divide-y divide-border/50">
                  {accountRows.map(row => (
                    <div
                      key={row.label}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                        <row.icon className="h-4 w-4" />
                      </div>
                      <dt className="flex-1 text-sm text-muted-foreground">
                        {row.label}
                      </dt>
                      <dd className="max-w-[60%] truncate text-sm font-medium">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </motion.div>
          ) : (
            <motion.div {...fadeIn(0.1)}>
              <Panel className="space-y-5 p-5">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <h3 className="font-medium">{t("ascend.settings.howToVerify")}</h3>
                </div>

                <ol className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      1
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm">{t("ascend.settings.verifyStep1")}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={openDiscord}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t("ascend.settings.joinDiscord")}
                      </Button>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      2
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm">{t("ascend.settings.verifyStep2")}</p>
                      <div className="flex items-center gap-2 rounded-lg bg-muted/50 py-1.5 pl-3 pr-1.5">
                        <code className="min-w-0 flex-1 truncate font-mono text-sm">
                          =verifyascend {verifyCode || "XXXXXXXXXX"}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={copyCommand}
                          disabled={!verifyCode}
                        >
                          <Copy className="h-3 w-3" />
                          {t("ascend.settings.copy")}
                        </Button>
                      </div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      3
                    </span>
                    <p className="text-sm">{t("ascend.discord.verifyStep3")}</p>
                  </li>
                </ol>
              </Panel>
            </motion.div>
          )}
        </div>

        <motion.div {...fadeIn(0.15)}>
          <Panel className="p-5">
            <h3 className="font-medium">{t("ascend.discord.perksTitle")}</h3>
            <ul className="mt-4 space-y-4">
              {PERKS.map(perk => (
                <li key={perk.key} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/10 text-[#5865F2]">
                    <perk.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {t(`ascend.discord.perks.${perk.key}.title`)}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {t(`ascend.discord.perks.${perk.key}.description`)}
                    </p>
                  </div>
                  {perk.gated &&
                    (isConnected ? (
                      <Check className="mt-1 h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    ))}
                </li>
              ))}
            </ul>
          </Panel>
        </motion.div>
      </div>
    </div>
  );
}
