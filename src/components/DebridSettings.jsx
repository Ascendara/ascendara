import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ExternalLink,
  GripVertical,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import DebridIcon from "@/components/DebridIcon";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import { getOrderedProviders } from "@/services/downloads/debridService";

// Flat section that sits on the settings page like its neighbours: a header with
// the master toggle, then one divided row per service that expands in place.
export default function DebridSettings() {
  const { settings, setSettings } = useSettings();
  const { t } = useLanguage();
  const providers = getOrderedProviders(settings);
  const [openId, setOpenId] = useState(providers[0]?.id ?? null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragTargetId, setDragTargetId] = useState(null);
  const debridEnabled = settings.debridEnabled === true;
  if (!providers.length) return null;

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
  const clearDraft = provider =>
    setDrafts(current => {
      const next = { ...current };
      delete next[provider.id];
      return next;
    });
  const signedIn = (provider, values) => {
    setSettings(current => ({ ...current, ...values }));
    clearDraft(provider);
    toast.success(t("debrid.signIn.success", { provider: provider.name }));
  };
  const save = async provider => {
    const value = (drafts[provider.id] ?? settings[provider.apiKeySetting] ?? "").trim();
    setSaving(provider.id);
    try {
      if (value) await provider.getUserInfo(value);
      setSettings(current => ({
        ...current,
        [provider.apiKeySetting]: value,
        // Only a new key ends a code sign-in: saving the same one keeps its refresh token
        ...(value !== current[provider.apiKeySetting] &&
          provider.signIn?.clearedSettings),
      }));
      clearDraft(provider);
      toast.success(t("settings.apiKeySaved"));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <section id="debrid-services" className="py-8">
      <div
        className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-3 ${debridEnabled ? "mb-6" : ""}`}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Label
            htmlFor="debrid-enabled"
            className="block cursor-pointer text-lg font-semibold tracking-tight text-foreground"
          >
            {t("debrid.settingsTitle")}
          </Label>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("debrid.settingsDescription")}
          </p>
        </div>
        <Switch
          id="debrid-enabled"
          className="mt-1 shrink-0"
          checked={debridEnabled}
          aria-controls="debrid-service-controls"
          aria-expanded={debridEnabled}
          onCheckedChange={value => update("debridEnabled", value)}
        />
      </div>

      <AnimatePresence initial={false}>
        {debridEnabled && (
          <motion.div
            id="debrid-service-controls"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Label className="text-sm font-medium">{t("debrid.priorityOrder")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("debrid.dragHint")}
              </span>
            </div>
            <ol
              className="divide-y divide-border/60 border-y border-border/60"
              aria-label={t("debrid.priorityOrder")}
            >
              {providers.map((item, index) => (
                <ProviderRow
                  key={item.id}
                  provider={item}
                  index={index}
                  count={providers.length}
                  open={openId === item.id}
                  onToggle={() => setOpenId(id => (id === item.id ? null : item.id))}
                  settings={settings}
                  setSettings={setSettings}
                  update={update}
                  draft={drafts[item.id]}
                  onDraftChange={value =>
                    setDrafts(current => ({ ...current, [item.id]: value }))
                  }
                  saving={saving}
                  onSave={() => save(item)}
                  onSignedIn={signedIn}
                  onMove={targetIndex => move(item.id, providers[targetIndex]?.id)}
                  isDragged={draggedId === item.id}
                  isDragTarget={dragTargetId === item.id}
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
                  t={t}
                />
              ))}
            </ol>
            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {t("debrid.priorityDescription")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ProviderRow({
  provider,
  index,
  count,
  open,
  onToggle,
  settings,
  setSettings,
  update,
  draft,
  onDraftChange,
  saving,
  onSave,
  onSignedIn,
  onMove,
  isDragged,
  isDragTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  t,
}) {
  const hasKey = Boolean(settings[provider.apiKeySetting]?.trim());
  const enabled = settings.debridProviderEnabled?.[provider.id] !== false;
  const status = !enabled ? "disabled" : hasKey ? "configured" : "notConfigured";
  const statusDot = {
    configured: "bg-green-500",
    notConfigured: "bg-muted-foreground/40",
    disabled: "bg-yellow-500",
  }[status];
  const panelId = `debrid-${provider.id}-panel`;
  const options = [
    [provider.torrentSetting, "debrid.useMagnets", "debrid.useMagnetsDescription", true],
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
  ];

  return (
    // Spread so the list's handlers stay the only JSX drag attributes in this file
    <li
      {...{ onDragOver, onDrop, onDragEnd }}
      className={`relative transition-colors ${isDragTarget ? "bg-primary/5 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary" : ""} ${isDragged ? "opacity-50" : ""}`}
    >
      <div draggable {...{ onDragStart }} className="flex items-center gap-3 py-3">
        <GripVertical
          aria-hidden="true"
          className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
        />
        <span className="w-4 text-center text-sm tabular-nums text-muted-foreground">
          {index + 1}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <DebridIcon provider={provider} className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {provider.name}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
            {t(`debrid.${status}`)}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div className="flex shrink-0 items-center">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={index === 0}
            aria-label={t("debrid.moveUp", { provider: provider.name })}
            onClick={() => onMove(index - 1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={index === count - 1}
            aria-label={t("debrid.moveDown", { provider: provider.name })}
            onClick={() => onMove(index + 1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-5 pb-5 pl-[3.25rem] pr-1">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor={`enable-${provider.id}`}>
                    {t("debrid.useService")}
                  </Label>
                </div>
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
                    value={draft ?? settings[provider.apiKeySetting] ?? ""}
                    onChange={event => onDraftChange(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter" && draft !== undefined && !saving)
                        onSave();
                    }}
                  />
                  <Button
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    onClick={onSave}
                    disabled={draft === undefined || Boolean(saving)}
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
                {provider.signIn && (
                  <DebridCodeSignIn
                    provider={provider}
                    signedIn={provider.signIn.isSignedIn(settings)}
                    onApproved={onSignedIn}
                  />
                )}
              </div>

              {options.map(([key, label, description, defaultValue]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor={key}>{t(label)}</Label>
                    <p className="text-sm text-muted-foreground">{t(description)}</p>
                  </div>
                  <Switch
                    id={key}
                    checked={settings[key] ?? defaultValue}
                    disabled={
                      !hasKey ||
                      !enabled ||
                      (key === provider.torrentFallbackSetting &&
                        !settings.torrentEnabled)
                    }
                    onCheckedChange={value => update(key, value)}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

// A service's code sign-in: the user approves a short code on the service's own site.
function DebridCodeSignIn({ provider, signedIn, onApproved }) {
  const { t } = useLanguage();
  const [flow, setFlow] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!flow) return undefined;
    let stopped = false;
    let timer;
    const check = async () => {
      const result = await provider.signIn.poll(flow);
      if (stopped) return;
      if (result.status === "pending" && Date.now() < flow.expiresAt) {
        timer = setTimeout(check, flow.intervalMs);
        return;
      }
      setFlow(null);
      if (result.status === "approved") onApproved(provider, result.settings);
      else if (result.status === "pending") toast.error(t("debrid.signIn.expired"));
      else toast.error(t("debrid.signIn.failed"));
    };
    timer = setTimeout(check, flow.intervalMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  const start = async () => {
    setStarting(true);
    try {
      setFlow(await provider.signIn.start());
    } catch (error) {
      toast.error(error.message);
    } finally {
      setStarting(false);
    }
  };

  if (!flow) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
        <Button variant="outline" size="sm" onClick={start} disabled={starting}>
          {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("debrid.signIn.button")}
        </Button>
        {signedIn && (
          <span className="text-xs text-muted-foreground">
            {t("debrid.signIn.signedIn")}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">
        {t("debrid.signIn.instructions", { url: provider.signIn.verificationUrl })}
      </p>
      <p className="select-all font-mono text-lg font-semibold tracking-widest">
        {flow.userCode}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.electron.openURL(flow.openUrl)}
        >
          {t("debrid.signIn.openPage")}
          <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setFlow(null)}>
          {t("debrid.signIn.cancel")}
        </Button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("debrid.signIn.waiting")}
        </span>
      </div>
    </div>
  );
}
