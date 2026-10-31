import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Check, Eye, EyeOff, Globe, Lock, UserX } from "lucide-react";
import { FocusHero, FocusLine, StatusPill } from "./SettingsLayout";

function VisibilityOption({ icon: Icon, title, text, selected, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`relative flex flex-1 items-start gap-3 rounded-xl border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border/60 hover:border-border hover:bg-muted/30"
      }`}
    >
      <Icon
        className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`}
      />
      <div className="min-w-0 pr-6">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
      </div>
      {selected && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
          <Check className="h-3 w-3 text-secondary" />
        </span>
      )}
    </button>
  );
}

export default function PrivacySettingsCard({ t, userData, updateData }) {
  const isPrivate = userData?.private === true;

  const updatePrivacy = async (field, checked, onMessage, offMessage) => {
    try {
      const result = await updateData({ [field]: checked });
      if (result.success) {
        toast.success(checked ? onMessage : offMessage);
      } else {
        toast.error(
          result.error ||
            t("ascend.settings.privacyUpdateFailed") ||
            "Failed to update privacy setting"
        );
      }
    } catch (e) {
      console.error(`Failed to update ${field}:`, e);
      toast.error(
        t("ascend.settings.privacyUpdateFailed") || "Failed to update privacy setting"
      );
    }
  };

  const setPrivate = next => {
    if (next === isPrivate) return;
    updatePrivacy(
      "private",
      next,
      t("ascend.settings.accountNowPrivate") || "Your account is now private",
      t("ascend.settings.accountNowPublic") || "Your account is now public"
    );
  };

  return (
    <div className="space-y-8">
      <FocusHero
        icon={isPrivate ? EyeOff : Eye}
        tone={isPrivate ? "primary" : "muted"}
        eyebrow={t("ascend.settings.privacy")}
        title={t("ascend.settings.pages.privacy.title")}
        status={
          <StatusPill tone={isPrivate ? "primary" : "muted"}>
            {isPrivate
              ? t("ascend.settings.pages.privacy.private")
              : t("ascend.settings.pages.privacy.public")}
          </StatusPill>
        }
        description={t("ascend.settings.pages.privacy.description")}
      >
        <div
          role="radiogroup"
          aria-label={t("ascend.settings.pages.privacy.title")}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <VisibilityOption
            icon={Globe}
            title={t("ascend.settings.pages.privacy.public")}
            text={t("ascend.settings.pages.privacy.publicDescription")}
            selected={!isPrivate}
            onSelect={() => setPrivate(false)}
          />
          <VisibilityOption
            icon={Lock}
            title={t("ascend.settings.pages.privacy.private")}
            text={
              t("ascend.settings.privateAccountDescription") ||
              "When enabled, other users won't be able to see your profile details, games, or achievements."
            }
            selected={isPrivate}
            onSelect={() => setPrivate(true)}
          />
        </div>
      </FocusHero>

      <FocusLine
        icon={UserX}
        htmlFor="preventFriendRequests"
        label={t("ascend.settings.preventFriendRequests") || "Prevent Friend Requests"}
        description={
          t("ascend.settings.preventFriendRequestsDescription") ||
          "When enabled, other users won't be able to send you friend requests."
        }
      >
        <Switch
          id="preventFriendRequests"
          checked={userData?.preventFriendRequests || false}
          onCheckedChange={checked =>
            updatePrivacy(
              "preventFriendRequests",
              checked,
              t("ascend.settings.friendRequestsNowPrevented") ||
                "Other users can no longer send you friend requests",
              t("ascend.settings.friendRequestsNowAllowed") ||
                "Other users can now send you friend requests"
            )
          }
        />
      </FocusLine>
    </div>
  );
}
