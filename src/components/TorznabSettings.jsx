import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";

export const torznabErrorKey = code => `settings.torznab.errors.${code || "badResponse"}`;

/** Prowlarr / Torznab connection, searched from each game's download page. */
export default function TorznabSettings({ settings, onSettingChange }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState(settings.torznabUrl || "");
  const [apiKey, setApiKey] = useState(settings.torznabApiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => setUrl(settings.torznabUrl || ""), [settings.torznabUrl]);
  useEffect(() => setApiKey(settings.torznabApiKey || ""), [settings.torznabApiKey]);

  const save = async () => {
    const trimmedUrl = url.trim();
    const trimmedKey = apiKey.trim();
    if (trimmedUrl !== (settings.torznabUrl || ""))
      await onSettingChange("torznabUrl", trimmedUrl);
    if (trimmedKey !== (settings.torznabApiKey || ""))
      await onSettingChange("torznabApiKey", trimmedKey);
  };

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      await save();
      setResult(await window.electron.torznab.test());
    } catch {
      setResult({ error: "badResponse" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="mb-0 text-lg font-semibold tracking-tight text-foreground">
            {t("settings.torznab.title")}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("settings.torznab.description")}
          </p>
        </div>
        <Switch
          checked={!!settings.torznabEnabled}
          onCheckedChange={checked => {
            setResult(null);
            onSettingChange("torznabEnabled", checked);
          }}
        />
      </div>

      {settings.torznabEnabled && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="torznab-url">{t("settings.torznab.url")}</Label>
            <Input
              id="torznab-url"
              value={url}
              placeholder="http://localhost:9696"
              spellCheck={false}
              onChange={e => {
                setUrl(e.target.value);
                setResult(null);
              }}
              onBlur={save}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.torznab.urlHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="torznab-key">{t("settings.torznab.apiKey")}</Label>
            <div className="flex gap-2">
              <Input
                id="torznab-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                spellCheck={false}
                autoComplete="off"
                onChange={e => {
                  setApiKey(e.target.value);
                  setResult(null);
                }}
                onBlur={save}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowKey(v => !v)}
                aria-label={t(
                  showKey ? "settings.torznab.hideKey" : "settings.torznab.showKey"
                )}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.torznab.apiKeyHint")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={testing || !url.trim()}
              onClick={runTest}
              className="text-primary"
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("settings.torznab.test")}
            </Button>
            {result && !result.error && (
              <span className="flex items-center gap-1.5 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                {!result.prowlarr
                  ? t("settings.torznab.connected")
                  : result.usenetCount
                    ? t("settings.torznab.connectedProwlarrUsenet", {
                        count: result.count,
                        usenetCount: result.usenetCount,
                      })
                    : t("settings.torznab.connectedProwlarr", { count: result.count })}
              </span>
            )}
            {result?.error && (
              <span className="text-destructive flex items-center gap-1.5 text-sm">
                <XCircle className="h-4 w-4" />
                {t(torznabErrorKey(result.error))}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
