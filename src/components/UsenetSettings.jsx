import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";

const CLIENTS = [
  { id: "sabnzbd", name: "SABnzbd", placeholder: "http://localhost:8080" },
  { id: "nzbget", name: "NZBGet", placeholder: "http://localhost:6789" },
];

// Text settings saved when the field loses focus
const FIELDS = [
  "usenetUrl",
  "usenetApiKey",
  "usenetUsername",
  "usenetPassword",
  "usenetCategory",
  "usenetRemotePath",
  "usenetLocalPath",
];

function SecretInput({ id, value, onChange, onBlur, t }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={onChange}
        onBlur={onBlur}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setShow(v => !v)}
        aria-label={t(show ? "settings.torznab.hideKey" : "settings.torznab.showKey")}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}

/** SABnzbd / NZBGet that Usenet releases from Prowlarr are sent to. */
export default function UsenetSettings({ settings, onSettingChange }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(FIELDS.map(key => [key, settings[key] || ""]))
  );
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(
    () => {
      setDraft(Object.fromEntries(FIELDS.map(key => [key, settings[key] || ""])));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    FIELDS.map(key => settings[key])
  );

  const clientId = settings.usenetClient === "nzbget" ? "nzbget" : "sabnzbd";
  const client = CLIENTS.find(c => c.id === clientId);

  const save = async () => {
    for (const key of FIELDS) {
      const value = String(draft[key] || "").trim();
      if (value !== (settings[key] || "")) await onSettingChange(key, value);
    }
  };

  const field = key => ({
    value: draft[key],
    onChange: e => {
      setDraft(prev => ({ ...prev, [key]: e.target.value }));
      setResult(null);
    },
    onBlur: save,
  });

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      await save();
      setResult(await window.electron.usenet.test());
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
            {t("settings.usenet.title")}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("settings.usenet.description")}
          </p>
        </div>
        <Switch
          checked={!!settings.usenetEnabled}
          onCheckedChange={checked => {
            setResult(null);
            onSettingChange("usenetEnabled", checked);
          }}
        />
      </div>

      {settings.usenetEnabled && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("settings.usenet.client")}</Label>
            <div className="flex gap-2">
              {CLIENTS.map(c => (
                <Button
                  key={c.id}
                  type="button"
                  variant={c.id === clientId ? "default" : "outline"}
                  className={c.id === clientId ? "text-secondary" : ""}
                  onClick={() => {
                    setResult(null);
                    onSettingChange("usenetClient", c.id);
                  }}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="usenet-url">{t("settings.usenet.url")}</Label>
            <Input
              id="usenet-url"
              placeholder={client.placeholder}
              spellCheck={false}
              {...field("usenetUrl")}
            />
          </div>

          {clientId === "sabnzbd" ? (
            <div className="space-y-1.5">
              <Label htmlFor="usenet-key">{t("settings.usenet.apiKey")}</Label>
              <SecretInput id="usenet-key" t={t} {...field("usenetApiKey")} />
              <p className="text-xs text-muted-foreground">
                {t("settings.usenet.apiKeyHint")}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="usenet-user">{t("settings.usenet.username")}</Label>
                <Input
                  id="usenet-user"
                  spellCheck={false}
                  autoComplete="off"
                  {...field("usenetUsername")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="usenet-password">{t("settings.usenet.password")}</Label>
                <SecretInput id="usenet-password" t={t} {...field("usenetPassword")} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="usenet-category">{t("settings.usenet.category")}</Label>
            <Input
              id="usenet-category"
              placeholder="games"
              spellCheck={false}
              {...field("usenetCategory")}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.usenet.categoryHint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.usenet.pathMapping")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label={t("settings.usenet.remotePath")}
                placeholder={t("settings.usenet.remotePath")}
                spellCheck={false}
                {...field("usenetRemotePath")}
              />
              <Input
                aria-label={t("settings.usenet.localPath")}
                placeholder={t("settings.usenet.localPath")}
                spellCheck={false}
                {...field("usenetLocalPath")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.usenet.pathMappingHint")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={testing || !draft.usenetUrl.trim()}
              onClick={runTest}
              className="text-primary"
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("settings.torznab.test")}
            </Button>
            {result && !result.error && (
              <span className="flex items-center gap-1.5 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                {t("settings.usenet.connected", {
                  client: result.client,
                  version: result.version || "",
                })}
              </span>
            )}
            {result?.error && (
              <span className="text-destructive flex items-center gap-1.5 text-sm">
                <XCircle className="h-4 w-4" />
                {t(`usenet.errors.${result.error}`)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
