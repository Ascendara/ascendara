import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  FITGIRL_SETTING_KEYS,
  resolveFitgirlOptions,
} from "@/services/downloads/fitgirlInstallOptions";

const OPTIONS = Object.keys(FITGIRL_SETTING_KEYS);

// The five FitGirl install switches. Controlled when value/onChange are given
// (one download), otherwise they edit the Settings defaults.
export function FitgirlInstallSwitches({ value, onChange, idPrefix = "fitgirl" }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      {OPTIONS.map(option => (
        <div key={option} className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor={`${idPrefix}-${option}`}>
              {t(`fitgirlInstall.${option}`)}
            </Label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t(`fitgirlInstall.${option}Description`)}
            </p>
          </div>
          <Switch
            id={`${idPrefix}-${option}`}
            checked={value[option]}
            onCheckedChange={checked => onChange({ ...value, [option]: checked })}
          />
        </div>
      ))}
    </div>
  );
}

// Settings > Downloads group.
export default function FitgirlInstallSettings() {
  const { settings, setSettings } = useSettings();
  const { t } = useLanguage();
  const value = resolveFitgirlOptions(settings, null);
  const onChange = next =>
    setSettings(current => {
      const updated = { ...current };
      for (const option of OPTIONS) updated[FITGIRL_SETTING_KEYS[option]] = next[option];
      return updated;
    });
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-muted/40 p-4">
      <div className="space-y-1">
        <h3 className="font-semibold">{t("fitgirlInstall.title")}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("fitgirlInstall.description")}
        </p>
      </div>
      <FitgirlInstallSwitches value={value} onChange={onChange} />
    </div>
  );
}
