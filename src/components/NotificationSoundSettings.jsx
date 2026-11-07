import { useEffect, useState } from "react";
import { Bell, Check, Play, Trash2, Trophy, Upload } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { playNotificationSound } from "@/services/app/notificationSoundService";

const PROFILES = ["classic", "crystal", "arcade", "simple"];

const SOUND_TYPES = [
  { kind: "achievement", icon: Trophy, label: "settings.sounds.achievement" },
  { kind: "notification", icon: Bell, label: "settings.sounds.notification" },
];

const NotificationSoundSettings = ({ settings, onSettingChange }) => {
  const { t } = useLanguage();
  const enabled = settings.notificationSounds !== false;
  const profile = PROFILES.includes(settings.notificationSoundProfile)
    ? settings.notificationSoundProfile
    : PROFILES[0];
  const [volume, setVolume] = useState(settings.notificationSoundVolume ?? 70);

  useEffect(() => {
    setVolume(settings.notificationSoundVolume ?? 70);
  }, [settings.notificationSoundVolume]);

  const selectProfile = name => {
    onSettingChange("notificationSoundProfile", name);
    playNotificationSound("notification", volume, name);
  };

  const uploadSound = async kind => {
    const result = await window.electron.pickNotificationSound(kind);
    if (result?.success) {
      onSettingChange(`${kind}SoundPath`, result.path);
      playNotificationSound(kind, volume);
    } else if (!result?.canceled) {
      const key =
        result?.error === "unsupported" || result?.error === "tooLarge"
          ? result.error
          : "saveFailed";
      toast.error(t(`settings.sounds.errors.${key}`));
    }
  };

  return (
    <div id="notification-sounds" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>{t("settings.sounds.title")}</Label>
          <p className="text-sm text-muted-foreground">
            {t("settings.sounds.description")}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={() => onSettingChange("notificationSounds", !enabled)}
        />
      </div>

      {enabled && (
        <div className="space-y-5 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-4">
            <Label className="w-28 shrink-0">{t("settings.sounds.volume")}</Label>
            <Slider
              value={[volume]}
              min={0}
              max={100}
              step={5}
              onValueChange={([value]) => setVolume(value)}
              onValueCommit={([value]) => {
                onSettingChange("notificationSoundVolume", value);
                playNotificationSound("notification", value);
              }}
              className="flex-1"
            />
            <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
              {volume}%
            </span>
          </div>

          <div className="space-y-2">
            <Label>{t("settings.sounds.profile")}</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {PROFILES.map(name => {
                const selected = name === profile;
                return (
                  <div
                    key={name}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectProfile(name)}
                    onKeyDown={event => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectProfile(name);
                      }
                    }}
                    className={cn(
                      "relative cursor-pointer rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {t(`settings.sounds.profiles.${name}`)}
                      </span>
                      {selected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t(`settings.sounds.profiles.${name}Description`)}
                    </p>
                    <div className="mt-2 flex gap-1">
                      {SOUND_TYPES.map(({ kind, icon: Icon }) => (
                        <Button
                          key={kind}
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 px-2 text-xs"
                          title={t(
                            kind === "achievement"
                              ? "settings.sounds.previewAchievement"
                              : "settings.sounds.previewNotification"
                          )}
                          onClick={event => {
                            event.stopPropagation();
                            playNotificationSound(kind, volume, name);
                          }}
                        >
                          <Play className="h-3 w-3" />
                          <Icon className="h-3.5 w-3.5" />
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-0.5">
              <Label>{t("settings.sounds.customTitle")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.sounds.customDescription")}
              </p>
            </div>
            {SOUND_TYPES.map(({ kind, icon: Icon, label }) => {
              const custom = Boolean(settings[`${kind}SoundPath`]);
              return (
                <div
                  key={kind}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t(label)}</p>
                      <p className="text-xs text-muted-foreground">
                        {custom
                          ? t("settings.sounds.customSound")
                          : t("settings.sounds.profileSound", {
                              profile: t(`settings.sounds.profiles.${profile}`),
                            })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("settings.sounds.preview")}
                      onClick={() => playNotificationSound(kind, volume)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    {custom && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t("settings.sounds.reset")}
                        onClick={() => onSettingChange(`${kind}SoundPath`, "")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => uploadSound(kind)}
                    >
                      <Upload className="h-4 w-4" />
                      {t("settings.sounds.choose")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationSoundSettings;
