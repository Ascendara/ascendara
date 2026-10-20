import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EmptyState, Panel } from "./primitives";
import { parseDeviceInfo } from "@/lib/deviceParser";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Check,
  X,
  Clock,
  Tablet,
  ShieldCheck,
  Unplug,
  RefreshCw,
  ExternalLink,
  Link2,
  Copy,
  Smartphone,
  Laptop,
  Monitor,
  Download,
  Users,
} from "lucide-react";

const DEVICE_ICONS = { Smartphone, Tablet, Laptop, Monitor };

// A device that checked in within this window is shown as active now.
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

const toDate = value => new Date(value?.seconds ? value.seconds * 1000 : value);
const toTime = value => toDate(value).getTime() || 0;

const formatRelativeTime = (date, locale) => {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
};

function PairingSteps({ t, step }) {
  const steps = [
    t("ascend.companion.stepOne"),
    t("ascend.companion.stepTwo"),
    t("ascend.companion.stepThree"),
  ];
  return (
    <ol className="space-y-3">
      {steps.map((label, index) => {
        const done = index < step;
        const current = index === step;
        return (
          <li key={label} className="flex items-start gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                done
                  ? "bg-primary text-secondary"
                  : current
                    ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={`pt-0.5 text-sm leading-5 transition-colors ${
                current ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PairingCard({
  t,
  reduceMotion,
  webappConnectionCode,
  handleGenerateWebappCode,
  isGeneratingCode,
  webappCodeExpiry,
  webappQRCode,
  handleCopyWebappCode,
  webappCodeCopied,
  handleCancelWebappConnection,
}) {
  // The server can hand back an existing code with less than the full lifetime
  // left, so the progress bar is measured against what we first saw.
  const [codeLifetime, setCodeLifetime] = useState(300);
  useEffect(() => {
    if (webappConnectionCode) setCodeLifetime(Math.max(webappCodeExpiry, 1));
    // Only reset when a new code arrives, not on every countdown tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webappConnectionCode]);

  const expiry = Math.max(0, webappCodeExpiry);
  const timeRemaining = `${Math.floor(expiry / 60)}:${String(expiry % 60).padStart(2, "0")}`;
  const remainingRatio = Math.min(1, expiry / codeLifetime);
  const expiringSoon = expiry <= 60;

  return (
    <Panel
      as="section"
      aria-labelledby="companion-pairing"
      className="flex min-w-0 flex-col overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-5 py-4">
        <h2 id="companion-pairing" className="text-sm font-semibold">
          {t("ascend.companion.connectYourPhone")}
        </h2>
        <span
          role="status"
          className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
        >
          <span className="relative flex h-1.5 w-1.5">
            {webappConnectionCode && !reduceMotion && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
            )}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          {t(
            webappConnectionCode
              ? "ascend.companion.awaitingDevice"
              : "ascend.companion.readyToPair"
          )}
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={webappConnectionCode ? "pairing" : "ready"}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="flex flex-1 flex-col p-5"
        >
          {!webappConnectionCode ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <div className="absolute inset-0 rounded-3xl bg-primary/10" />
                <div className="absolute inset-3 rounded-2xl border border-dashed border-primary/30" />
                <Smartphone className="relative h-9 w-9 text-primary" />
              </div>
              <p className="mt-5 max-w-[260px] text-sm leading-6 text-muted-foreground">
                {t("ascend.companion.pairingHelp")}
              </p>
              <Button
                onClick={handleGenerateWebappCode}
                disabled={isGeneratingCode}
                className="mt-5 h-10 w-full gap-2 rounded-lg text-secondary"
              >
                {isGeneratingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {isGeneratingCode
                  ? t("ascend.companion.generating")
                  : t("ascend.companion.startConnection")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              {webappQRCode && (
                <>
                  <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                    <img
                      src={webappQRCode}
                      alt={t("ascend.companion.qrCodeAlt")}
                      className="block h-40 w-40 object-contain"
                    />
                  </div>
                  <p className="mt-3 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
                    {t("ascend.companion.visitMonitor")}
                  </p>
                </>
              )}

              <p
                className={`text-xs text-muted-foreground ${webappQRCode ? "mt-5" : ""}`}
              >
                {t("ascend.companion.enterThisCode")}
              </p>
              <button
                type="button"
                onClick={handleCopyWebappCode}
                title={t("ascend.companion.copyCode")}
                aria-label={`${t("ascend.companion.copyCode")}: ${webappConnectionCode}`}
                className="mt-2 flex flex-wrap items-center justify-center gap-1.5 rounded-xl p-1 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
              >
                {webappConnectionCode.split("").map((digit, index) => (
                  <span
                    key={index}
                    className="flex h-11 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/5 font-mono text-xl font-semibold text-primary"
                  >
                    {digit}
                  </span>
                ))}
              </button>

              <div className="mt-4 w-full">
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                      expiringSoon ? "bg-amber-500" : "bg-primary"
                    }`}
                    style={{ width: `${remainingRatio * 100}%` }}
                  />
                </div>
                <div
                  className={`mt-2 flex items-center justify-center gap-1.5 text-xs ${
                    expiringSoon ? "text-amber-500" : "text-muted-foreground"
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  {t("ascend.companion.codeExpiresIn")}
                  <span className="font-mono tabular-nums">{timeRemaining}</span>
                </div>
              </div>

              <div className="mt-5 flex w-full gap-2">
                <Button
                  onClick={handleCopyWebappCode}
                  variant="outline"
                  className="flex-1 gap-2 rounded-lg"
                >
                  {webappCodeCopied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {webappCodeCopied
                    ? t("ascend.companion.copied")
                    : t("ascend.companion.copyCode")}
                </Button>
                <Button
                  onClick={handleCancelWebappConnection}
                  variant="ghost"
                  className="flex-1 gap-2 rounded-lg text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                  {t("ascend.companion.cancel")}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Panel>
  );
}

function DeviceRow({ t, locale, device, index, disconnecting, onDisconnect }) {
  const parsed = parseDeviceInfo(device.deviceInfo?.userAgent);
  const DeviceIcon = DEVICE_ICONS[parsed.icon] || Monitor;
  const name =
    device.deviceInfo?.platform ||
    (parsed.platform !== "Unknown" ? parsed.platform : t("ascend.companion.webDevice"));
  const lastActive = toDate(device.lastActive);
  const validDate = !Number.isNaN(lastActive.getTime());
  const isActive = validDate && Date.now() - lastActive.getTime() < ACTIVE_WINDOW_MS;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ delay: Math.min(index, 8) * 0.03 }}
      className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <DeviceIcon className="h-5 w-5 text-primary" />
          {isActive && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {parsed.browser !== "Unknown" && (
              <>
                <span>{parsed.browser}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            {isActive ? (
              <span className="font-medium text-green-600 dark:text-green-500">
                {t("ascend.companion.activeNow")}
              </span>
            ) : (
              validDate && (
                <span title={lastActive.toLocaleString()}>
                  {t("ascend.companion.lastActive")}{" "}
                  {formatRelativeTime(lastActive, locale)}
                </span>
              )
            )}
          </p>
        </div>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disconnecting}
            className="gap-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            {disconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Unplug className="h-4 w-4" />
            )}
            {t("ascend.companion.disconnectDevice")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ascend.companion.disconnectTitle", { device: name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("ascend.companion.disconnectDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("ascend.companion.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDisconnect(device.sessionId)}
            >
              {t("ascend.companion.disconnectDevice")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.li>
  );
}

export default function CompanionSection({
  t,
  webappConnectionCode,
  handleGenerateWebappCode,
  isGeneratingCode,
  webappCodeExpiry,
  webappQRCode,
  handleCopyWebappCode,
  webappCodeCopied,
  handleCancelWebappConnection,
  loadConnectedDevices,
  loadingDevices,
  connectedDevices,
  handleDisconnectDevice,
  disconnectingDevice,
}) {
  const reduceMotion = useReducedMotion();
  const { i18n } = useTranslation();

  const sortedDevices = useMemo(
    () =>
      [...connectedDevices].sort(
        (a, b) => toTime(b.lastActive) - toTime(a.lastActive)
      ),
    [connectedDevices]
  );

  const pairingStep = webappConnectionCode ? 1 : connectedDevices.length > 0 ? 3 : 0;
  const features = [
    { icon: Download, label: t("ascend.companion.downloads") },
    { icon: Users, label: t("ascend.companion.friends") },
  ];

  return (
    <div className="mb-28 space-y-6">
      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="relative overflow-hidden p-6 sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative flex h-full flex-col">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {t("ascend.companion.headline")}{" "}
              <span className="text-primary">{t("ascend.companion.headlineAccent")}</span>
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {t("ascend.companion.connectYourPhoneDescription")}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {features.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs font-medium"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-auto pt-8">
              <div className="border-t border-border/50 pt-6">
                <PairingSteps t={t} step={pairingStep} />
              </div>
            </div>
          </div>
        </Panel>

        <PairingCard
          t={t}
          reduceMotion={reduceMotion}
          webappConnectionCode={webappConnectionCode}
          handleGenerateWebappCode={handleGenerateWebappCode}
          isGeneratingCode={isGeneratingCode}
          webappCodeExpiry={webappCodeExpiry}
          webappQRCode={webappQRCode}
          handleCopyWebappCode={handleCopyWebappCode}
          webappCodeCopied={webappCodeCopied}
          handleCancelWebappConnection={handleCancelWebappConnection}
        />
      </div>

      <section aria-labelledby="companion-devices" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2
              id="companion-devices"
              className="flex items-center gap-2 text-base font-semibold"
            >
              {t("ascend.companion.connectedDevices")}
              {!loadingDevices && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {connectedDevices.length}
                </span>
              )}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("ascend.companion.devicesDescription")}
            </p>
          </div>
          <Button
            aria-label={t("ascend.companion.refreshDevices")}
            title={t("ascend.companion.refreshDevices")}
            onClick={loadConnectedDevices}
            variant="ghost"
            size="sm"
            disabled={loadingDevices}
          >
            <RefreshCw className={`h-4 w-4 ${loadingDevices ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {loadingDevices && connectedDevices.length === 0 ? (
          <Panel
            role="status"
            className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("ascend.companion.loadingDevices")}
          </Panel>
        ) : connectedDevices.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title={t("ascend.companion.noConnectedDevices")}
            description={t("ascend.companion.emptyDescription")}
            className="py-12"
          />
        ) : (
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-border/50">
              <AnimatePresence initial={false}>
                {sortedDevices.map((device, index) => (
                  <DeviceRow
                    key={device.sessionId}
                    t={t}
                    locale={i18n.language}
                    device={device}
                    index={index}
                    disconnecting={disconnectingDevice === device.sessionId}
                    onDisconnect={handleDisconnectDevice}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </Panel>
        )}
      </section>

      <footer className="flex items-start gap-3 border-t border-border/50 pt-4 text-xs leading-6 text-muted-foreground">
        <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          <span className="font-medium text-foreground">
            {t("ascend.companion.securityTitle")}
          </span>{" "}
          {t("ascend.companion.securityDescription")}{" "}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={() => window.electron.openURL("https://ascendara.app/webview")}
          >
            {t("common.learnMore")}
            <ExternalLink className="h-3 w-3" />
          </button>
        </p>
      </footer>
    </div>
  );
}
