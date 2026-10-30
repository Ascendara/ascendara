import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Share2, Wrench } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

export default function DllSharingSettingsCard({ t }) {
  const { settings, setSettingsLocal } = useSettings();

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/60">
      <div className="flex items-center justify-between border-b border-border/50 p-5">
        <div className="flex items-center gap-2">
          <Wrench className="mb-3 h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t("ascend.settings.dllSharing")}</h2>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-muted-foreground" />
              <label htmlFor="contributeRepairDlls" className="font-medium">
                {t("settings.contributeRepairDlls")}
              </label>
            </div>
            <p
              id="repair-contributions-description"
              className="text-sm text-muted-foreground"
            >
              {t("settings.contributeRepairDllsDescription")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.contributeRepairDllsControl")}
            </p>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => window.electron.openURL("https://ascendara.app/privacy")}
            >
              {t("settings.contributeRepairDllsPrivacy")}
            </button>
          </div>
          <div className="ml-4">
            <Checkbox
              id="contributeRepairDlls"
              aria-describedby="repair-contributions-description"
              checked={settings.contributeRepairDlls === true}
              onCheckedChange={async checked => {
                try {
                  const saved = await window.electron.updateSetting(
                    "contributeRepairDlls",
                    checked
                  );
                  if (!saved)
                    throw new Error(t("settings.contributeRepairDllsSaveError"));
                  setSettingsLocal({ contributeRepairDlls: checked });
                } catch {
                  toast.error(t("settings.contributeRepairDllsSaveError"));
                }
              }}
              className="h-5 w-5"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
