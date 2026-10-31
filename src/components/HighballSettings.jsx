import { useEffect, useState } from "react";
import { CheckCircle2, FolderOpen, Loader, RotateCcw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const HIGHBALL_RENDERERS = ["dxmt", "d3dmetal", "dxvk", "vkd3d", "wined3d"];

const formatSize = bytes => `${Math.round(bytes / 1048576)} MB`;

export function OptionSelect({ value, onChange, options, className }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Graphics translator choices; D3DMetal stays disabled until its license is accepted. */
export function rendererOptions(t, d3dmetalAccepted, autoLabel) {
  return [
    { value: "auto", label: autoLabel },
    ...HIGHBALL_RENDERERS.map(renderer => ({
      value: renderer,
      label: t(`settings.macCompat.renderers.${renderer}`),
      disabled: renderer === "d3dmetal" && !d3dmetalAccepted,
    })),
  ];
}

/**
 * Shows Highball's setup state and runs the one-time engine download.
 * Shared by Settings and the Welcome flow.
 */
export function useHighballStatus() {
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null);
  const [settingUp, setSettingUp] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await window.electron.highballGetStatus());
    } catch (error) {
      console.error("Failed to read Highball status:", error);
    }
  };

  useEffect(() => {
    refresh();
    return window.electron.onHighballSetupProgress?.(update => setProgress(update));
  }, []);

  const setup = async () => {
    setSettingUp(true);
    setProgress(null);
    try {
      const result = await window.electron.highballSetup();
      if (!result.success) throw new Error(result.error);
      setStatus(result.status);
      return true;
    } catch (error) {
      toast.error(error.message);
      return false;
    } finally {
      setSettingUp(false);
      setProgress(null);
    }
  };

  return { status, progress, settingUp, setup, refresh, setStatus };
}

export function D3DMetalLicenseDialog({ open, onOpenChange, onAccepted }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (open) window.electron.highballGetD3DMetalLicense().then(setText);
  }, [open]);

  const accept = async () => {
    setAccepting(true);
    try {
      const result = await window.electron.highballAcceptD3DMetal();
      if (!result.success) throw new Error(result.error);
      onAccepted?.(result.status);
      onOpenChange(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("settings.macCompat.d3dmetalLicenseTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings.macCompat.d3dmetalLicenseDescription")}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72 rounded-md border border-border p-4">
          <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground">
            {text}
          </pre>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="text-secondary" disabled={accepting} onClick={accept}>
            {accepting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
            {t("settings.macCompat.d3dmetalAccept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Engine status, setup button and progress. Renders nothing when Highball
 * is not part of this build (Intel Macs).
 */
export function HighballSetupCard({ highball }) {
  const { t } = useTranslation();
  const { status, progress, settingUp, setup } = highball;

  if (!status?.supported) return null;

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t("settings.macCompat.highballTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {status.ready
              ? t("settings.macCompat.ready", { engine: status.engine?.wineVersion })
              : t("settings.macCompat.notSetUp", {
                  size: formatSize(status.downloadSize || 0),
                })}
          </p>
        </div>
        {status.ready ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
        ) : (
          <Button
            size="sm"
            className="shrink-0 text-secondary"
            disabled={settingUp}
            onClick={setup}
          >
            {settingUp ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              t("settings.macCompat.setUp")
            )}
          </Button>
        )}
      </div>
      {settingUp && progress && (
        <div className="space-y-1">
          <Progress value={progress.percent ?? 0} />
          <p className="text-xs text-muted-foreground">
            {progress.message}
            {progress.totalBytes
              ? ` ${formatSize(progress.receivedBytes)} / ${formatSize(progress.totalBytes)}`
              : ""}
          </p>
        </div>
      )}
      {!status.rosetta && !settingUp && (
        <p className="text-xs text-yellow-500">{t("settings.macCompat.rosettaNeeded")}</p>
      )}
    </div>
  );
}

/**
 * The Welcome flow's macOS compatibility step. Without Highball in this
 * build (Intel Macs), it shows the fallback instead.
 */
export function HighballWelcomeSetup({ fallback }) {
  const { t } = useTranslation();
  const highball = useHighballStatus();
  const [licenseOpen, setLicenseOpen] = useState(false);
  const { status } = highball;

  if (!status) return null;
  if (!status.supported) return fallback;

  return (
    <div className="space-y-4 rounded-xl bg-card p-6 shadow">
      <h3 className="text-xl font-semibold">{t("settings.macCompat.welcomeTitle")}</h3>
      <p>{t("settings.macCompat.welcomeDescription")}</p>
      <HighballSetupCard highball={highball} />
      {status.engine && !status.d3dmetalAccepted && (
        <Button variant="link" onClick={() => setLicenseOpen(true)}>
          {t("settings.macCompat.d3dmetalReview")}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {t("settings.macCompat.welcomeLater")}
      </p>
      <D3DMetalLicenseDialog
        open={licenseOpen}
        onOpenChange={setLicenseOpen}
        onAccepted={highball.setStatus}
      />
    </div>
  );
}

/**
 * The macOS Compatibility section of Settings.
 */
export default function HighballSettings() {
  const { t } = useTranslation();
  const highball = useHighballStatus();
  const { status, setStatus } = highball;
  const [prefs, setPrefs] = useState({
    macRunner: "auto",
    highballRenderer: "auto",
    highballBottleMode: "shared",
  });
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    window.electron.getSettings().then(settings =>
      setPrefs({
        macRunner: settings.macRunner || "auto",
        highballRenderer: settings.highballRenderer || "auto",
        highballBottleMode: settings.highballBottleMode || "shared",
      })
    );
  }, []);

  const update = async (key, value) => {
    setPrefs(current => ({ ...current, [key]: value }));
    await window.electron.updateSetting(key, value);
  };

  const resetShared = async () => {
    setResetting(true);
    const result = await window.electron.highballResetBottle(null, { shared: true });
    setResetting(false);
    if (result.success) toast.success(t("settings.macCompat.resetDone"));
    else toast.error(result.message);
    highball.refresh();
  };

  if (!status) return null;

  const usingHighball = status.supported && prefs.macRunner !== "wine";

  return (
    <div className="space-y-6">
      <h3 className="mb-2 text-base font-semibold text-foreground">
        {t("welcome.compatibilityLayer")}
      </h3>
      <p className="text-sm text-muted-foreground">
        {status.supported
          ? t("settings.macCompat.description")
          : t("settings.macCompat.intelDescription")}
      </p>

      {status.supported && (
        <div className="space-y-3">
          <label className="text-sm font-medium">
            {t("settings.linuxCompat.defaultRunner")}
          </label>
          <OptionSelect
            value={prefs.macRunner}
            onChange={value => update("macRunner", value)}
            options={[
              { value: "auto", label: t("settings.macCompat.runnerAuto") },
              { value: "highball", label: "Highball" },
              { value: "wine", label: t("settings.macCompat.runnerWine") },
            ]}
          />
        </div>
      )}

      {usingHighball && (
        <>
          <HighballSetupCard highball={highball} />

          <div className="space-y-3">
            <label className="text-sm font-medium">
              {t("settings.macCompat.renderer")}
            </label>
            <OptionSelect
              value={prefs.highballRenderer}
              onChange={value => update("highballRenderer", value)}
              options={rendererOptions(
                t,
                status.d3dmetalAccepted,
                t("settings.macCompat.rendererAuto")
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.macCompat.rendererHint")}
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4">
            <div>
              <p className="text-sm font-medium">D3DMetal</p>
              <p className="text-xs text-muted-foreground">
                {status.d3dmetalAccepted
                  ? t("settings.macCompat.d3dmetalEnabled")
                  : t("settings.macCompat.d3dmetalDescription")}
              </p>
            </div>
            {status.d3dmetalAccepted ? (
              <ShieldCheck className="h-5 w-5 shrink-0 text-green-500" />
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={!status.engine}
                onClick={() => setLicenseOpen(true)}
              >
                {t("settings.macCompat.d3dmetalReview")}
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">
              {t("settings.macCompat.bottle")}
            </label>
            <OptionSelect
              value={prefs.highballBottleMode}
              onChange={value => update("highballBottleMode", value)}
              options={[
                { value: "shared", label: t("settings.macCompat.bottleShared") },
                { value: "per-game", label: t("settings.macCompat.bottlePerGame") },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.macCompat.bottleHint")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.electron.highballOpenBottle()}
            >
              <FolderOpen className="h-4 w-4" />
              {t("settings.macCompat.openFolder")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={resetting || !status.ready}
              onClick={resetShared}
            >
              <RotateCcw className="h-4 w-4" />
              {t("settings.macCompat.resetShared")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("settings.macCompat.credit")}{" "}
            <button
              className="underline"
              onClick={() =>
                window.electron.openURL("https://github.com/gauthierpiarrette/highball")
              }
            >
              github.com/gauthierpiarrette/highball
            </button>
          </p>

          <D3DMetalLicenseDialog
            open={licenseOpen}
            onOpenChange={setLicenseOpen}
            onAccepted={setStatus}
          />
        </>
      )}
    </div>
  );
}
