import { motion, useReducedMotion } from "framer-motion";
import SectionHeader from "./SectionHeader";
import { getDeviceIcon, getDeviceDescription } from "@/lib/deviceParser";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

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
  const expiry = Math.max(0, webappCodeExpiry);
  const timeRemaining = `${Math.floor(expiry / 60)}:${String(expiry % 60).padStart(2, "0")}`;
  return (
    <div className="mb-28 space-y-6">
      <SectionHeader
        icon={Smartphone}
        title={t("ascend.companion.title")}
        description={t("ascend.companion.workspaceDescription")}
        actions={
          <Button
            variant="outline"
            className="gap-2 rounded-lg"
            onClick={() => window.electron.openURL("https://webview.ascendara.app")}
          >
            {t("ascend.companion.openCompanion")}
            <ExternalLink className="h-4 w-4" />
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="companion-devices" className="min-w-0">
          {/* Connected Devices Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
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
                onClick={loadConnectedDevices}
                variant="ghost"
                size="sm"
                disabled={loadingDevices}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loadingDevices ? "animate-spin" : ""}`}
                />
              </Button>
            </div>

            {loadingDevices ? (
              <div
                role="status"
                className="flex items-center justify-center gap-2 rounded-2xl border border-border/50 py-8 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("ascend.companion.loadingDevices")}
              </div>
            ) : connectedDevices.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/30 p-6 text-center">
                <Smartphone
                  className="h-8 w-8 shrink-0 text-muted-foreground/50"
                  aria-hidden="true"
                />
                <div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("ascend.companion.noConnectedDevices")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("ascend.companion.emptyDescription")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-card/50">
                {connectedDevices.map(device => {
                  const iconName = getDeviceIcon(device.deviceInfo);
                  const DeviceIcon =
                    iconName === "Smartphone"
                      ? Smartphone
                      : iconName === "Tablet"
                        ? Tablet
                        : iconName === "Laptop"
                          ? Laptop
                          : Monitor;
                  const deviceDescription = getDeviceDescription(device.deviceInfo);

                  return (
                    <div
                      key={device.sessionId}
                      className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <DeviceIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {device.deviceInfo?.platform ||
                              t("ascend.companion.webDevice")}
                          </p>
                          <p className="break-words text-xs text-muted-foreground">
                            {deviceDescription}
                          </p>
                          <p className="break-words text-xs text-muted-foreground">
                            {t("ascend.companion.lastActive")}:{" "}
                            {new Date(
                              device.lastActive?.seconds * 1000 || device.lastActive
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        aria-label={t("ascend.companion.disconnectDevice")}
                        onClick={() => handleDisconnectDevice(device.sessionId)}
                        variant="ghost"
                        size="sm"
                        disabled={disconnectingDevice === device.sessionId}
                        className="gap-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        {disconnectingDevice === device.sessionId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Unplug className="h-4 w-4" />
                        )}
                        {t("ascend.companion.disconnectDevice")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        <section
          aria-labelledby="companion-pairing"
          className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card/50"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-4">
            <h2 id="companion-pairing" className="text-sm font-semibold">
              {t("ascend.companion.connectYourPhone")}
            </h2>
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {t(
                webappConnectionCode
                  ? "ascend.companion.awaitingDevice"
                  : "ascend.companion.readyToPair"
              )}
            </span>
          </div>
          <motion.div
            key={webappConnectionCode ? "pairing" : "ready"}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="p-4"
          >
            {!webappConnectionCode ? (
              <div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("ascend.companion.pairingHelp")}
                </p>
                <Button
                  onClick={handleGenerateWebappCode}
                  disabled={isGeneratingCode}
                  className="mt-4 h-10 w-full rounded-lg text-secondary"
                >
                  {isGeneratingCode ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("ascend.companion.generating")}
                    </>
                  ) : (
                    <>
                      <Link2 className="mr-2 h-4 w-4" />
                      {t("ascend.companion.startConnection")}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-4">
                  {/* QR pairing */}
                  {webappQRCode && (
                    <div className="flex justify-center py-2">
                      <div className="flex w-full flex-col items-center gap-4 text-center">
                        <div className="flex aspect-square w-44 shrink-0 items-center justify-center rounded-2xl bg-white p-4 shadow-sm">
                          <img
                            src={webappQRCode}
                            alt={t("ascend.companion.qrCodeAlt")}
                            className="block h-36 w-36 object-contain"
                          />
                        </div>
                        <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
                          {t("ascend.companion.visitMonitor")}
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Manual pairing remains available without a QR code. */}
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="text-center">
                        <p className="mb-3 text-xs text-muted-foreground">
                          {t("ascend.companion.enterThisCode")}
                        </p>
                        <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
                          {webappConnectionCode.split("").map((digit, index) => (
                            <div
                              key={index}
                              className="flex h-11 w-8 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 font-mono text-xl font-semibold text-primary sm:w-9"
                            >
                              {digit}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>
                            {t("ascend.companion.codeExpiresIn")}{" "}
                            <span className="font-mono tabular-nums">
                              {timeRemaining}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleCopyWebappCode}
                    variant="outline"
                    className="flex-1 rounded-lg"
                  >
                    {webappCodeCopied ? (
                      <Check className="mr-2 h-4 w-4" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    {webappCodeCopied
                      ? t("ascend.companion.copied")
                      : t("ascend.companion.copyCode")}
                  </Button>
                  <Button
                    onClick={handleCancelWebappConnection}
                    variant="outline"
                    className="flex-1 rounded-lg"
                  >
                    <X className="mr-2 h-4 w-4" />
                    {t("ascend.companion.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </section>
      </div>

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
