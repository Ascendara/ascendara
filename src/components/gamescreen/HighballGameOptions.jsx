import { useEffect, useState } from "react";
import { Loader, RotateCcw, Wine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { OptionSelect, rendererOptions } from "@/components/HighballSettings";
import HighballCompatibility, {
  useHighballCompat,
} from "@/components/HighballCompatibility";

/** Per-game macOS compatibility overrides for a Windows game. */
export default function HighballGameOptions({ game, steamAppId }) {
  const { t } = useLanguage();
  const gameName = game?.game || game?.name;
  const compat = useHighballCompat({ steamAppId, title: gameName, detail: true });
  const isCustom = !!game?.isCustom;
  const [status, setStatus] = useState(null);
  const [overrides, setOverrides] = useState(null);
  const [bottleMode, setBottleMode] = useState("shared");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!gameName) return;
    window.electron.highballGetStatus().then(setStatus);
    window.electron.getMacCompatOverrides(gameName, isCustom).then(setOverrides);
    window.electron
      .getSettings()
      .then(settings => setBottleMode(settings.highballBottleMode || "shared"));
  }, [gameName, isCustom]);

  if (!status?.supported || !overrides) return null;

  const update = async (key, value) => {
    setOverrides(current => ({ ...current, [key]: value }));
    const saved = await window.electron.setMacCompatOverride(
      gameName,
      key,
      value,
      isCustom
    );
    if (!saved) toast.error(t("settings.macCompat.saveFailed"));
  };

  const resetBottle = async () => {
    setResetting(true);
    const result = await window.electron.highballResetBottle(gameName);
    setResetting(false);
    if (result.success) toast.success(t("settings.macCompat.resetDone"));
    else toast.error(result.message);
  };

  return (
    <section className="space-y-3 rounded-xl bg-card p-5 shadow">
      <div className="flex items-center gap-2">
        <Wine className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{t("settings.macCompat.gameTitle")}</span>
      </div>

      <HighballCompatibility compat={compat} />

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">
          {t("settings.linuxCompat.defaultRunner")}
        </span>
        <OptionSelect
          className="h-8 text-xs"
          value={overrides.macRunner}
          onChange={value => update("macRunner", value)}
          options={[
            { value: "auto", label: t("settings.macCompat.useGlobal") },
            { value: "highball", label: "Highball" },
            { value: "wine", label: t("settings.macCompat.runnerWine") },
          ]}
        />
      </label>

      {overrides.macRunner !== "wine" && (
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            {t("settings.macCompat.renderer")}
          </span>
          <OptionSelect
            className="h-8 text-xs"
            value={overrides.highballRenderer}
            onChange={value => update("highballRenderer", value)}
            options={rendererOptions(
              t,
              status.d3dmetalAccepted,
              t("settings.macCompat.useGlobal")
            )}
          />
        </label>
      )}

      <p className="text-xs text-muted-foreground">
        {t("settings.macCompat.rendererHint")}
      </p>

      {bottleMode === "per-game" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 text-xs"
            onClick={() => window.electron.highballOpenBottle(gameName)}
          >
            {t("settings.macCompat.openGameBottle")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            disabled={resetting}
            onClick={resetBottle}
          >
            {resetting ? (
              <Loader className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            {t("settings.macCompat.resetGameBottle")}
          </Button>
        </div>
      )}
    </section>
  );
}
