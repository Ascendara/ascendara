import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Info, BadgeCheck, Copy } from "lucide-react";

export default function DiscordVerificationCard({ t, ascendAccess, user }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
      <div className="flex items-center justify-between border-b border-border/50 p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5865F2]/10">
            <svg
              className="h-4 w-4 text-[#5865F2]"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </div>
          <h2 className="mt-2 font-semibold">
            {t("ascend.settings.discordVerification") || "Discord Verification"}
          </h2>
        </div>
      </div>

      <div className="p-5">
        <div className="space-y-4">
          {/* Trial Warning Banner */}
          {!ascendAccess.isSubscribed && !ascendAccess.isVerified && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                    {t("ascend.settings.verificationRequiresSubscription") ||
                      "Subscription Required"}
                  </p>
                  <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                    {t("ascend.settings.verificationTrialWarning") ||
                      "The verification command only works for active subscribers. Subscribe to Ascend to get verified and unlock exclusive Discord roles."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/10">
              <BadgeCheck className="h-5 w-5 text-[#5865F2]" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1 font-medium">
                {t("ascend.settings.verifyYourAccount") || "Verify Your Account"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("ascend.settings.discordVerificationDescription") ||
                  "Get verified on our Discord server to unlock exclusive roles and features."}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-muted/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                {t("ascend.settings.howToVerify") || "How to Verify"}
              </span>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  1
                </span>
                <span>
                  {t("ascend.settings.verifyStep1") || "Join our Discord server"}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  2
                </span>
                <span>
                  {t("ascend.settings.verifyStep2") ||
                    "Run the following command in any channel:"}
                </span>
              </li>
            </ol>

            <div className="mt-3 rounded-lg bg-background/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <code className="font-mono text-xs text-muted-foreground">
                  {t("ascend.settings.verifyCommand") || "Verification Command"}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-xs"
                  onClick={() => {
                    const command = `=verifyascend ${user?.uid?.substring(0, 10) || ""}`;
                    navigator.clipboard.writeText(command);
                    toast.success(
                      t("ascend.settings.commandCopied") || "Command copied to clipboard!"
                    );
                  }}
                >
                  <Copy className="h-3 w-3" />
                  {t("ascend.settings.copy") || "Copy"}
                </Button>
              </div>
              <div className="rounded bg-muted/50 px-3 py-2 font-mono text-sm">
                =verifyascend {user?.uid?.substring(0, 10) || "XXXXXXXXXX"}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2 border-[#5865F2]/30 bg-[#5865F2]/5 hover:bg-[#5865F2]/10"
            onClick={() => window.electron?.openURL("https://ascendara.app/discord")}
          >
            <ExternalLink className="h-4 w-4" />
            {t("ascend.settings.joinDiscord") || "Join Discord Server"}
          </Button>
        </div>
      </div>
    </div>
  );
}
