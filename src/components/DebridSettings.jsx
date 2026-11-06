import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ExternalLink,
  GripVertical,
  KeyRound,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import DebridIcon from "@/components/DebridIcon";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { getOrderedProviders } from "@/services/downloads/debridService";

const STATUS_TONES = {
  connected: "bg-green-500/10 text-green-600 dark:text-green-400",
  checking: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
  notConnected: "bg-muted text-muted-foreground",
  paused: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

// The settings page section for debrid accounts: a master toggle, the order services
// are tried in, and one card per service with its account and download options.
export default function DebridSettings() {
  const { settings, setSettings } = useSettings();
  const { t } = useLanguage();
  const providers = getOrderedProviders(settings);
  const [draggedId, setDraggedId] = useState(null);
  const [dragTargetId, setDragTargetId] = useState(null);
  const debridEnabled = settings.debridEnabled === true;
  if (!providers.length) return null;

  const move = (id, targetId) =>
    setSettings(current => {
      const order = getOrderedProviders(current).map(item => item.id);
      const index = order.indexOf(id);
      const target = order.indexOf(targetId);
      if (index < 0 || target < 0 || index === target) return current;
      order.splice(target, 0, order.splice(index, 1)[0]);
      return { ...current, debridProviderOrder: order, debridProvider: order[0] };
    });

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
          onCheckedChange={value =>
            setSettings(current => ({ ...current, debridEnabled: value }))
          }
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
            <PriorityStrip providers={providers} settings={settings} t={t} />
            <ol className="space-y-3" aria-label={t("debrid.priorityOrder")}>
              {providers.map((item, index) => (
                <ProviderCard
                  key={item.id}
                  provider={item}
                  index={index}
                  count={providers.length}
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
                />
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// One line that reads like the routing itself: which service gets asked first.
function PriorityStrip({ providers, settings, t }) {
  return (
    <div className="mb-4 rounded-xl bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("debrid.priorityOrder")}
        </span>
        <ol className="flex flex-wrap items-center gap-1.5">
          {providers.map((provider, index) => {
            const active =
              Boolean(settings[provider.apiKeySetting]?.trim()) &&
              settings.debridProviderEnabled?.[provider.id] !== false;
            return (
              <li key={provider.id} className="flex items-center gap-1.5">
                {index > 0 && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                )}
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    active
                      ? "border-primary/30 bg-background text-foreground"
                      : "border-dashed border-border text-muted-foreground"
                  )}
                >
                  <span className="tabular-nums text-muted-foreground">{index + 1}</span>
                  {provider.name}
                </span>
              </li>
            );
          })}
        </ol>
        <span className="ml-auto text-xs text-muted-foreground">
          {t("debrid.dragHint")}
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
        {t("debrid.priorityDescription")}
      </p>
    </div>
  );
}

// Loads the account behind a saved key, so the card can say who is connected.
function useAccount(provider, apiKey) {
  const [state, setState] = useState({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!apiKey) {
      setState({ status: "idle" });
      return undefined;
    }
    let stopped = false;
    setState(current => ({ ...current, status: "loading" }));
    provider
      .getUserInfo(apiKey)
      .then(user => !stopped && setState({ status: "ready", user }))
      .catch(error => !stopped && setState({ status: "error", error: error.message }));
    return () => {
      stopped = true;
    };
  }, [provider, apiKey, attempt]);
  return [state, () => setAttempt(value => value + 1)];
}

function ProviderCard({
  provider,
  index,
  count,
  onMove,
  isDragged,
  isDragTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const { settings, setSettings } = useSettings();
  const { t } = useLanguage();
  const apiKey = settings[provider.apiKeySetting]?.trim() || "";
  const hasKey = Boolean(apiKey);
  const enabled = settings.debridProviderEnabled?.[provider.id] !== false;
  const [account, retryAccount] = useAccount(provider, apiKey);
  const [editingKey, setEditingKey] = useState(false);
  const status = !enabled
    ? "paused"
    : !hasKey
      ? "notConnected"
      : account.status === "error"
        ? "error"
        : account.status === "ready"
          ? "connected"
          : "checking";
  const update = (key, value) => setSettings(current => ({ ...current, [key]: value }));

  const saveKey = async value => {
    if (value) await provider.getUserInfo(value);
    setSettings(current => ({
      ...current,
      [provider.apiKeySetting]: value,
      // Only a new key ends a code sign-in: saving the same one keeps its refresh token
      ...(value !== current[provider.apiKeySetting] && provider.signIn?.clearedSettings),
    }));
    setEditingKey(false);
  };
  const disconnect = () => {
    setSettings(current => ({
      ...current,
      [provider.apiKeySetting]: "",
      ...provider.signIn?.clearedSettings,
    }));
    setEditingKey(false);
    toast.success(t("debrid.disconnected", { provider: provider.name }));
  };
  const signedIn = values => {
    setSettings(current => ({ ...current, ...values }));
    setEditingKey(false);
    toast.success(t("debrid.signIn.success", { provider: provider.name }));
  };

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
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card/40 transition-[opacity,border-color,box-shadow]",
        isDragTarget ? "border-primary ring-2 ring-primary/20" : "border-border/70",
        isDragged && "opacity-50"
      )}
    >
      <div
        draggable
        {...{ onDragStart }}
        className="flex items-center gap-3 border-b border-border/60 px-4 py-3"
      >
        <GripVertical
          aria-hidden="true"
          className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        />
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <DebridIcon provider={provider} className="h-5 w-5 text-primary" />
          <span className="text-primary-foreground absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[10px] font-bold tabular-nums">
            {index + 1}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {provider.name}
          </p>
          <span
            className={cn(
              "mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium",
              STATUS_TONES[status]
            )}
          >
            {status === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
            {t(`debrid.status.${status}`)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
          <Switch
            className="ml-2"
            checked={enabled}
            aria-label={t("debrid.useService", { provider: provider.name })}
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

      <div className="grid gap-x-8 gap-y-5 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("debrid.accountTitle")}
          </h4>
          {hasKey && !editingKey ? (
            <AccountSummary
              provider={provider}
              account={account}
              signedInWithCode={provider.signIn?.isSignedIn(settings)}
              onRetry={retryAccount}
              onChangeKey={() => setEditingKey(true)}
              onDisconnect={disconnect}
            />
          ) : (
            <ConnectForm
              provider={provider}
              currentKey={apiKey}
              onSave={saveKey}
              onSignedIn={signedIn}
              onCancel={hasKey ? () => setEditingKey(false) : null}
            />
          )}
        </div>

        <div className="min-w-0">
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("debrid.optionsTitle")}
          </h4>
          {(!hasKey || !enabled) && (
            <p className="mb-1 text-xs text-muted-foreground">
              {t(hasKey ? "debrid.optionsPaused" : "debrid.optionsNeedAccount")}
            </p>
          )}
          <div className="divide-y divide-border/50">
            {options.map(([key, label, description, defaultValue]) => {
              const id = `${provider.id}-${key}`;
              return (
                <div key={key} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor={id} className="text-sm">
                      {t(label)}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t(description)}</p>
                  </div>
                  <Switch
                    id={id}
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
              );
            })}
          </div>
        </div>
      </div>
    </li>
  );
}

function AccountSummary({
  provider,
  account,
  signedInWithCode,
  onRetry,
  onChangeKey,
  onDisconnect,
}) {
  const { t } = useLanguage();
  const details =
    account.status === "ready" ? provider.describeAccount?.(account.user, t) : null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
        {account.status === "error" ? (
          <div className="flex items-start justify-between gap-3">
            <p className="text-destructive min-w-0 text-xs">{account.error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              onClick={onRetry}
            >
              <RefreshCw className="h-3 w-3" />
              {t("featureCenters.common.retry")}
            </Button>
          </div>
        ) : !details ? (
          <div className="space-y-1.5">
            <div className="h-4 w-36 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted/70" />
          </div>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="truncate">{details.name || provider.name}</span>
              {details.plan && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {details.plan}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {details.expiresAt
                ? t("debrid.expires", {
                    date: new Date(details.expiresAt).toLocaleDateString(),
                  })
                : t("debrid.noPremium")}
            </p>
          </>
        )}
      </div>
      {signedInWithCode && (
        <p className="text-xs text-muted-foreground">{t("debrid.signIn.signedIn")}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onChangeKey}>
          <KeyRound className="h-3.5 w-3.5" />
          {t("debrid.changeKey")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="hover:text-destructive gap-1.5 text-muted-foreground"
          onClick={onDisconnect}
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("debrid.disconnect")}
        </Button>
      </div>
    </div>
  );
}

function ConnectForm({ provider, currentKey, onSave, onSignedIn, onCancel }) {
  const { t } = useLanguage();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputId = `${provider.id}-api-key`;

  const submit = async () => {
    const key = value.trim();
    if (!key || saving) return;
    setSaving(true);
    try {
      await onSave(key);
      toast.success(t("settings.apiKeySaved"));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {provider.signIn && (
        <>
          <DebridCodeSignIn provider={provider} onApproved={onSignedIn} />
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border/70" />
            {t("debrid.orUseKey")}
            <span className="h-px flex-1 bg-border/70" />
          </div>
        </>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId} className="text-sm">
            {t("debrid.apiKey")}
          </Label>
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
            id={inputId}
            type="password"
            autoComplete="off"
            placeholder={currentKey ? "••••••••••••" : t("debrid.keyPlaceholder")}
            disabled={saving}
            value={value}
            onChange={event => setValue(event.target.value)}
            onKeyDown={event => event.key === "Enter" && submit()}
          />
          <Button
            className="shrink-0"
            onClick={submit}
            disabled={!value.trim() || saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("debrid.connect")}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("debrid.keyDescription")}</p>
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={onCancel}
            >
              {t("debrid.signIn.cancel")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// A service's code sign-in: the user approves a short code on the service's own site.
function DebridCodeSignIn({ provider, onApproved }) {
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
      if (result.status === "approved") onApproved(result.settings);
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
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={start}
        disabled={starting}
      >
        {starting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <QrCode className="h-4 w-4" />
        )}
        {t("debrid.signIn.button")}
      </Button>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs text-muted-foreground">
        {t("debrid.signIn.instructions", { url: provider.signIn.verificationUrl })}
      </p>
      <p className="select-all text-center font-mono text-2xl font-semibold tracking-[0.3em] text-foreground">
        {flow.userCode}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => window.electron.openURL(flow.openUrl)}>
          {t("debrid.signIn.openPage")}
          <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setFlow(null)}>
          {t("debrid.signIn.cancel")}
        </Button>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("debrid.signIn.waiting")}
        </span>
      </div>
    </div>
  );
}
