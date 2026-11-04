import { useState } from "react";
import {
  ArrowUp,
  GripVertical,
  ArrowDown,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import DebridIcon from "@/components/DebridIcon";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import { getOrderedProviders } from "@/services/downloads/debridService";

export default function DebridSettings() {
  const { settings, setSettings } = useSettings();
  const { t } = useLanguage();
  const providers = getOrderedProviders(settings);
  const [selectedId, setSelectedId] = useState(providers[0]?.id);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragTargetId, setDragTargetId] = useState(null);
  const debridEnabled = settings.debridEnabled === true;
  const provider = providers.find(item => item.id === selectedId) || providers[0];
  if (!provider) return null;
  const configured = Boolean(settings[provider.apiKeySetting]?.trim());
  const enabled = settings.debridProviderEnabled?.[provider.id] !== false;
  const update = (key, value) => setSettings(current => ({ ...current, [key]: value }));
  const move = (id, targetId) =>
    setSettings(current => {
      const order = getOrderedProviders(current).map(item => item.id);
      const index = order.indexOf(id);
      const target = order.indexOf(targetId);
      if (index < 0 || target < 0 || index === target) return current;
      order.splice(target, 0, order.splice(index, 1)[0]);
      return { ...current, debridProviderOrder: order, debridProvider: order[0] };
    });
  const save = async () => {
    const value = (drafts[provider.id] ?? settings[provider.apiKeySetting] ?? "").trim();
    setSaving(provider.id);
    try {
      if (value) await provider.getUserInfo(value);
      update(provider.apiKeySetting, value);
      setDrafts(current => {
        const next = { ...current };
        delete next[provider.id];
        return next;
      });
      toast.success(t("settings.apiKeySaved"));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(null);
    }
  };
  return (
    <Card id="debrid-services" className="col-span-full space-y-6 p-6 [column-span:all]">
      <div className="flex items-center justify-between gap-4">
        <Label
          htmlFor="debrid-enabled"
          className="cursor-pointer text-base font-semibold"
        >
          {t("debrid.settingsTitle")}
        </Label>
        <Switch
          id="debrid-enabled"
          checked={debridEnabled}
          aria-controls="debrid-service-controls"
          aria-expanded={debridEnabled}
          onCheckedChange={value => update("debridEnabled", value)}
        />
      </div>
      {debridEnabled && (
        <>
          <p className="text-sm text-muted-foreground">
            {t("debrid.settingsDescription")}
          </p>
          <div
            id="debrid-service-controls"
            className="grid gap-6 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]"
          >
            <div className="space-y-2">
              <Label>{t("debrid.priorityOrder")}</Label>
              <ol className="space-y-2" aria-label={t("debrid.priorityOrder")}>
                {providers.map((item, index) => {
                  const hasKey = Boolean(settings[item.apiKeySetting]?.trim());
                  const isEnabled = settings.debridProviderEnabled?.[item.id] !== false;
                  return (
                    <li
                      key={item.id}
                      draggable
                      onDragStart={event => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-ascendara-debrid-provider",
                          item.id
                        );
                        setDraggedId(item.id);
                      }}
                      onDragOver={event => {
                        if (!draggedId || draggedId === item.id) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragTargetId(item.id);
                      }}
                      onDrop={event => {
                        if (!draggedId) return;
                        event.preventDefault();
                        move(draggedId, item.id);
                        setDraggedId(null);
                        setDragTargetId(null);
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragTargetId(null);
                      }}
                      className={`flex items-center gap-2 rounded-lg border p-2 transition-colors ${dragTargetId === item.id ? "border-primary bg-primary/10 ring-1 ring-primary" : item.id === provider.id ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20"} ${draggedId === item.id ? "opacity-50" : ""}`}
                    >
                      <GripVertical
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                      />
                      <button
                        type="button"
                        aria-pressed={item.id === provider.id}
                        onClick={() => setSelectedId(item.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="w-4 text-center text-sm text-muted-foreground">
                          {index + 1}
                        </span>
                        <DebridIcon
                          provider={item}
                          className="h-5 w-5 shrink-0 text-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {item.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {t(
                              !isEnabled
                                ? "debrid.disabled"
                                : hasKey
                                  ? "debrid.configured"
                                  : "debrid.notConfigured"
                            )}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={index === 0}
                          aria-label={t("debrid.moveUp", { provider: item.name })}
                          onClick={() => move(item.id, providers[index - 1]?.id)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={index === providers.length - 1}
                          aria-label={t("debrid.moveDown", { provider: item.name })}
                          onClick={() => move(item.id, providers[index + 1]?.id)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-muted-foreground">{t("debrid.dragHint")}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("debrid.priorityDescription")}
              </p>
            </div>
            <div className="space-y-5 lg:border-l lg:pl-6">
              <div className="flex items-center justify-between gap-4">
                <h4 className="flex items-center gap-2 font-medium">
                  <DebridIcon provider={provider} className="h-5 w-5 text-primary" />
                  {provider.name}
                </h4>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`enable-${provider.id}`} className="text-sm">
                    {t("debrid.useService")}
                  </Label>
                  <Switch
                    id={`enable-${provider.id}`}
                    checked={enabled}
                    onCheckedChange={value =>
                      setSettings(current => ({
                        ...current,
                        debridProviderEnabled: {
                          ...current.debridProviderEnabled,
                          [provider.id]: value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={provider.apiKeySetting}>{t("debrid.apiKey")}</Label>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => window.electron.openURL(provider.apiKeyUrl)}
                  >
                    {t("debrid.getApiKey")}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id={provider.apiKeySetting}
                    type="password"
                    autoComplete="off"
                    disabled={saving === provider.id}
                    value={drafts[provider.id] ?? settings[provider.apiKeySetting] ?? ""}
                    onChange={event =>
                      setDrafts(current => ({
                        ...current,
                        [provider.id]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    onClick={save}
                    disabled={drafts[provider.id] === undefined || Boolean(saving)}
                  >
                    {saving === provider.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {t("debrid.saveKey")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("debrid.keyDescription")}
                </p>
              </div>
              {[
                [
                  provider.torrentSetting,
                  "debrid.useMagnets",
                  "debrid.useMagnetsDescription",
                  true,
                ],
                [
                  provider.prioritizeSetting,
                  "debrid.preferSeamless",
                  "debrid.preferSeamlessDescription",
                  false,
                ],
                ...(provider.torrentFallbackSetting
                  ? [
                      [
                        provider.torrentFallbackSetting,
                        "debrid.localFallback",
                        "debrid.localFallbackDescription",
                        false,
                      ],
                    ]
                  : []),
              ].map(([key, label, description, defaultValue]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor={key}>{t(label)}</Label>
                    <p className="text-xs text-muted-foreground">{t(description)}</p>
                  </div>
                  <Switch
                    id={key}
                    checked={settings[key] ?? defaultValue}
                    disabled={
                      !configured ||
                      !enabled ||
                      (key === provider.torrentFallbackSetting &&
                        !settings.torrentEnabled)
                    }
                    onCheckedChange={value => update(key, value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
