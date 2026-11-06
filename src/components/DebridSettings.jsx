import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CloudDownload,
  ExternalLink,
  GripVertical,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Magnet,
  MonitorDown,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import DebridIcon from "@/components/DebridIcon";
import { formatBytes } from "@/components/debrid/DebridDownloadParts";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import {
  getOrderedProviders,
  getPreferredProvider,
  getTorrentProvider,
} from "@/services/downloads/debridService";

const STATUS_TONES = {
  connected: {
    pill: "bg-green-500/10 text-green-600 dark:text-green-400",
    dot: "bg-green-500",
  },
  checking: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
  error: { pill: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  notConnected: {
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/30",
  },
  paused: {
    pill: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    dot: "bg-yellow-500",
  },
};

const DOCS_URL = "https://ascendara.app/docs/downloads/debrid-services";

const apiKeyOf = (settings, provider) => settings[provider.apiKeySetting]?.trim() || "";

function DocsLink({ url, children }) {
  const { t } = useLanguage();
  return (
    <a
      onClick={() => window.electron.openURL(url)}
      className="inline-flex cursor-pointer items-center text-primary hover:underline"
    >
      {children || t("common.learnMore")}
      <ExternalLink className="ml-1 h-3 w-3" />
    </a>
  );
}

const statusOf = (settings, provider, account) => {
  if (settings.debridProviderEnabled?.[provider.id] === false) return "paused";
  if (!apiKeyOf(settings, provider)) return "notConnected";
  if (account?.status === "error") return "error";
  return account?.status === "ready" ? "connected" : "checking";
};

// Loads the account behind each saved key once, so every section can show who is
// connected without asking the service again.
function useAccounts(providers, settings) {
  const [accounts, setAccounts] = useState({});
  const loadedKeys = useRef({});
  const load = useCallback((provider, apiKey) => {
    loadedKeys.current[provider.id] = apiKey;
    const set = state => setAccounts(current => ({ ...current, [provider.id]: state }));
    if (!apiKey) return set({ status: "idle" });
    set({ status: "loading" });
    const current = () => loadedKeys.current[provider.id] === apiKey;
    provider
      .getUserInfo(apiKey)
      .then(user => current() && set({ status: "ready", user }))
      .catch(error => current() && set({ status: "error", error: error.message }));
  }, []);
  const signature = providers
    .map(provider => `${provider.id}:${apiKeyOf(settings, provider)}`)
    .join("|");
  useEffect(() => {
    for (const provider of providers) {
      const apiKey = apiKeyOf(settings, provider);
      if (loadedKeys.current[provider.id] !== apiKey) load(provider, apiKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return [accounts, provider => load(provider, apiKeyOf(settings, provider))];
}

// The Debrid settings page: the master switch and where downloads go first, then the
// order services are tried in, then each account. Everything sits flat on the page.
export default function DebridSettings() {
  const { settings, setSettings } = useSettings();
  const { t } = useLanguage();
  const providers = getOrderedProviders(settings);
  const [accounts, reloadAccount] = useAccounts(providers, settings);
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
    <>
      <Overview providers={providers} accounts={accounts} />

      {debridEnabled && (
        <section id="debrid-order" className="py-8">
          <SectionHeader
            title={t("debrid.priorityOrder")}
            description={
              <>
                {t("debrid.priorityDescription")}&nbsp;
                <DocsLink url={`${DOCS_URL}#download-order`} />
              </>
            }
          />
          <ol className="-mx-3 space-y-0.5" aria-label={t("debrid.priorityOrder")}>
            {providers.map((item, index) => (
              <OrderRow
                key={item.id}
                provider={item}
                index={index}
                count={providers.length}
                status={statusOf(settings, item, accounts[item.id])}
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
          <p className="mt-3 text-xs text-muted-foreground">{t("debrid.dragHint")}</p>
        </section>
      )}

      {debridEnabled && (
        <section id="debrid-accounts" className="py-8">
          <SectionHeader
            title={t("debrid.accountsTitle")}
            description={t("debrid.accountsDescription")}
          />
          <div className="space-y-10">
            {providers.map((item, index) => (
              <ServiceCard
                key={item.id}
                provider={item}
                position={index + 1}
                account={accounts[item.id]}
                onRetry={() => reloadAccount(item)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function SectionHeader({ title, description, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="mb-0 text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// The master switch, plus either what debrid adds (when off) or where each kind of
// download goes right now (when on).
function Overview({ providers, accounts }) {
  const { settings, setSettings } = useSettings();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const debridEnabled = settings.debridEnabled === true;
  const connected = providers.filter(
    provider => statusOf(settings, provider, accounts[provider.id]) === "connected"
  );
  const hostProvider = getPreferredProvider(settings);
  const torrentProvider = getTorrentProvider(settings);
  const routes = [
    {
      icon: CloudDownload,
      label: t("debrid.summaryConnected"),
      value: t("debrid.summaryConnectedValue", {
        count: connected.length,
        total: providers.length,
      }),
      muted: !connected.length,
    },
    {
      icon: Link2,
      label: t("debrid.summaryHosts"),
      value: hostProvider?.name || t("debrid.routeDirect"),
      provider: hostProvider,
      muted: !hostProvider,
    },
    {
      icon: Magnet,
      label: t("debrid.summaryMagnets"),
      value:
        torrentProvider?.name ||
        (settings.torrentEnabled ? t("debrid.routeLocal") : t("debrid.routeNone")),
      provider: torrentProvider,
      muted: !torrentProvider,
    },
  ];
  const features = [
    [Link2, "debrid.featureHosts", "debrid.featureHostsDescription"],
    [Magnet, "debrid.featureTorrents", "debrid.featureTorrentsDescription"],
    [MonitorDown, "debrid.featureHandoff", "debrid.featureHandoffDescription"],
  ];

  return (
    <section id="debrid-services" className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Label
            htmlFor="debrid-enabled"
            className="block cursor-pointer text-lg font-semibold tracking-tight text-foreground"
          >
            {t("debrid.settingsTitle")}
          </Label>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("debrid.settingsDescription")}&nbsp;
            <DocsLink url={DOCS_URL} />
          </p>
        </div>
        <Switch
          id="debrid-enabled"
          className="mt-1 shrink-0"
          checked={debridEnabled}
          onCheckedChange={value =>
            setSettings(current => ({ ...current, debridEnabled: value }))
          }
        />
      </div>

      {debridEnabled ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4">
          <dl className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-4">
            {routes.map(({ icon: Icon, label, value, provider, muted }) => (
              <div key={label} className="flex min-w-0 items-center gap-2.5">
                {provider ? (
                  <DebridIcon
                    provider={provider}
                    className="h-4 w-4 shrink-0 text-primary"
                  />
                ) : (
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd
                    className={cn(
                      "truncate text-sm font-semibold",
                      muted ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {value}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
          {connected.some(provider => provider.hasDownloadsPage !== false) && (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2 gap-1.5 px-2 text-primary"
              onClick={() => navigate("/debriddownloads")}
            >
              {t("debrid.openDownloads")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-3">
          {features.map(([Icon, title, description]) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t(title)}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t(description)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusPill({ status }) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium",
        STATUS_TONES[status].pill
      )}
    >
      {status === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
      {t(`debrid.status.${status}`)}
    </span>
  );
}

function ServiceCard({ provider, position, account, onRetry }) {
  const { settings, setSettings } = useSettings();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const apiKey = apiKeyOf(settings, provider);
  const hasKey = Boolean(apiKey);
  const enabled = settings.debridProviderEnabled?.[provider.id] !== false;
  const status = statusOf(settings, provider, account);
  const [editingKey, setEditingKey] = useState(false);
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
    ...(provider.removeAfterDoneSetting
      ? [
          [
            provider.removeAfterDoneSetting,
            "debrid.removeAfterDone",
            "debrid.removeAfterDoneDescription",
            false,
          ],
        ]
      : []),
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
    <article id={`debrid-${provider.id}`}>
      <header className="flex items-center gap-3">
        <DebridIcon provider={provider} className="h-6 w-6 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="mb-0 truncate text-base font-semibold text-foreground">
              {provider.name}
            </h4>
            <StatusPill status={status} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("debrid.position", { position })}
            {provider.docsUrl && (
              <>
                {" · "}
                <DocsLink url={provider.docsUrl}>{t("debrid.setupGuide")}</DocsLink>
              </>
            )}
          </p>
        </div>
        {status === "connected" && (
          <Button
            variant="ghost"
            size="sm"
            className="hidden gap-1.5 text-muted-foreground sm:inline-flex"
            onClick={() =>
              navigate(
                provider.hasDownloadsPage === false
                  ? "/downloads"
                  : `/debriddownloads?service=${provider.id}`
              )
            }
          >
            {t("debrid.viewDownloads")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
        <Switch
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
      </header>

      <div className="mt-5 grid gap-x-10 gap-y-6 pl-9 lg:grid-cols-2">
        <div className="min-w-0">
          <h5 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("debrid.accountTitle")}
          </h5>
          {hasKey && !editingKey ? (
            <AccountSummary
              provider={provider}
              account={account}
              signedInWithCode={provider.signIn?.isSignedIn(settings)}
              onRetry={onRetry}
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
          <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("debrid.optionsTitle")}
          </h5>
          {(!hasKey || !enabled) && (
            <p className="mb-1 text-xs text-muted-foreground">
              {t(hasKey ? "debrid.optionsPaused" : "debrid.optionsNeedAccount")}
            </p>
          )}
          <div>
            {options.map(([key, label, description, defaultValue]) => {
              const id = `${provider.id}-${key}`;
              return (
                <div key={key} className="flex items-center justify-between gap-4 py-3">
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
    </article>
  );
}

function OrderRow({
  provider,
  index,
  count,
  status,
  onMove,
  isDragged,
  isDragTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const { t } = useLanguage();
  return (
    // Spread so the list's handlers stay the only JSX drag attributes in this file
    <li
      draggable
      {...{ onDragStart, onDragOver, onDrop, onDragEnd }}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40",
        isDragTarget &&
          "bg-primary/5 before:absolute before:inset-x-3 before:-top-px before:h-0.5 before:rounded-full before:bg-primary",
        isDragged && "opacity-50"
      )}
    >
      <GripVertical
        aria-hidden="true"
        className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
      />
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-foreground">
        {index + 1}
      </span>
      <DebridIcon provider={provider} className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {provider.name}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_TONES[status].dot)} />
        {t(`debrid.status.${status}`)}
      </span>
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
    account?.status === "ready" ? provider.describeAccount?.(account.user, t) : null;
  const formatStat = ({ value, unit }) =>
    unit === "bytes"
      ? formatBytes(value) || "0 B"
      : unit === "days"
        ? t("debrid.days", { count: value })
        : value.toLocaleString();

  return (
    <div className="space-y-4">
      {account?.status === "error" ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
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
        <div className="space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-28 animate-pulse rounded bg-muted/70" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
          </div>
        </div>
      ) : (
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="truncate">{details.name || provider.name}</span>
            {details.plan && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                {details.plan}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {details.expiresAt
              ? t("debrid.expires", {
                  date: new Date(details.expiresAt).toLocaleDateString(),
                })
              : details.expiryNote || t("debrid.noPremium")}
          </p>
          {details.stats?.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
              {details.stats.map(stat => (
                <div key={stat.label} className="border-l-2 border-primary/30 pl-3">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </dt>
                  <dd className="text-sm font-semibold tabular-nums text-foreground">
                    {formatStat(stat)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      {signedInWithCode && (
        <p className="text-xs text-muted-foreground">
          {t(provider.signIn.signedInText || "debrid.signIn.signedIn")}
        </p>
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
