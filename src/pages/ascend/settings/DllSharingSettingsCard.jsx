import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { BadgeCheck, FileCode2, Globe, Share2 } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { FocusHero, FocusPoints, StatusPill } from "./SettingsLayout";

export default function DllSharingSettingsCard({ t }) {
  const { settings, setSettingsLocal } = useSettings();
  const enabled = settings.contributeRepairDlls === true;

  const setEnabled = async checked => {
    try {
      const saved = await window.electron.updateSetting("contributeRepairDlls", checked);
      if (!saved) throw new Error(t("settings.contributeRepairDllsSaveError"));
      setSettingsLocal({ contributeRepairDlls: checked });
    } catch {
      toast.error(t("settings.contributeRepairDllsSaveError"));
    }
  };

  return (
    <div className="space-y-8">
      <FocusHero
        icon={Share2}
        tone={enabled ? "success" : "muted"}
        eyebrow={t("ascend.settings.dllSharing")}
        title={t("settings.contributeRepairDlls")}
        status={
          <StatusPill tone={enabled ? "success" : "muted"}>
            {enabled
              ? t("account.twoFactor.settings.on")
              : t("account.twoFactor.settings.off")}
          </StatusPill>
        }
        description={t("ascend.settings.pages.dllSharing.description")}
      >
        <label
          htmlFor="contributeRepairDlls"
          className="flex max-w-xl cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3 transition-colors hover:bg-muted/30"
        >
          <span className="text-sm font-medium">
            {t("ascend.settings.pages.dllSharing.toggle")}
          </span>
          <Switch
            id="contributeRepairDlls"
            aria-describedby="repair-contributions-control"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </label>
        <p
          id="repair-contributions-control"
          className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground"
        >
          {t("settings.contributeRepairDllsControl")}{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => window.electron.openURL("https://ascendara.app/privacy")}
          >
            {t("settings.contributeRepairDllsPrivacy")}
          </button>
        </p>
      </FocusHero>

      <FocusPoints
        title={t("ascend.settings.pages.howItWorks")}
        items={[
          {
            icon: FileCode2,
            title: t("ascend.settings.pages.dllSharing.onlyDllsTitle"),
            text: t("ascend.settings.pages.dllSharing.onlyDllsText"),
          },
          {
            icon: BadgeCheck,
            title: t("ascend.settings.pages.dllSharing.approvedTitle"),
            text: t("ascend.settings.pages.dllSharing.approvedText"),
          },
          {
            icon: Globe,
            title: t("ascend.settings.pages.dllSharing.publicTitle"),
            text: t("ascend.settings.pages.dllSharing.publicText"),
          },
        ]}
      />
    </div>
  );
}
