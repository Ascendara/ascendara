import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, LockIcon, MegaphoneOffIcon } from "lucide-react";

export default function PrivacySettingsCard({ t, userData, updateData }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
      <div className="flex items-center justify-between border-b border-border/50 p-5">
        <div className="flex items-center gap-2">
          <LockIcon className="mb-3 h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t("ascend.settings.privacy") || "Privacy"}</h2>
        </div>
      </div>
      <div className="p-5">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {t("ascend.settings.privateAccount") || "Private Account"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("ascend.settings.privateAccountDescription") ||
                  "When enabled, other users won't be able to see your profile details, games, or achievements."}
              </p>
            </div>
            <div className="ml-4">
              <Checkbox
                id="privateAccount"
                checked={userData?.private || false}
                onCheckedChange={async checked => {
                  try {
                    const result = await updateData({ private: checked });
                    if (result.success) {
                      toast.success(
                        checked
                          ? t("ascend.settings.accountNowPrivate") ||
                              "Your account is now private"
                          : t("ascend.settings.accountNowPublic") ||
                              "Your account is now public"
                      );
                    } else {
                      toast.error(
                        result.error ||
                          t("ascend.settings.privacyUpdateFailed") ||
                          "Failed to update privacy setting"
                      );
                    }
                  } catch (e) {
                    console.error("Failed to update privacy setting:", e);
                    toast.error(
                      t("ascend.settings.privacyUpdateFailed") ||
                        "Failed to update privacy setting"
                    );
                  }
                }}
                className="h-5 w-5"
              />
            </div>
          </div>

          {/* Hide Partner Ads - Only for active subscribers and verified users */}
          {false && (
            <div className="flex items-center justify-between border-t border-border/50 pt-6">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <MegaphoneOffIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {t("settings.hidePartnerAds") || "Hide Partner Ads"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("settings.hidePartnerAdsDescription") ||
                    "Hide partner advertisements in search results. Available for active Ascend subscribers."}
                </p>
              </div>
              <div className="ml-4">
                <Checkbox
                  id="hidePartnerAds"
                  checked={userData?.hidePartnerAds || false}
                  onCheckedChange={async checked => {
                    try {
                      const result = await updateData({ hidePartnerAds: checked });
                      if (result.success) {
                        toast.success(
                          checked
                            ? t("ascend.settings.partnerAdsHidden") ||
                                "Partner ads are now hidden"
                            : t("ascend.settings.partnerAdsVisible") ||
                                "Partner ads are now visible"
                        );
                      } else {
                        toast.error(
                          result.error ||
                            t("ascend.settings.updateFailed") ||
                            "Failed to update setting"
                        );
                      }
                    } catch (e) {
                      console.error("Failed to update partner ads setting:", e);
                      toast.error(
                        t("ascend.settings.updateFailed") || "Failed to update setting"
                      );
                    }
                  }}
                  className="h-5 w-5"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
