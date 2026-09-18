import { getDeviceIcon, getDeviceDescription } from "@/lib/deviceParser";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Check,
  X,
  Clock,
  Gamepad2,
  RefreshCw,
  ExternalLink,
  Info,
  Globe,
  Link2,
  Copy,
  Smartphone,
  Laptop,
  Monitor,
} from "lucide-react";

export default function WebappConnectionCard({
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
  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
      <div className="flex items-center justify-between border-b border-border/50 p-5">
        <div className="flex items-center gap-2">
          <Smartphone className="mb-3 h-5 w-5 text-primary" />
          <h2 className="font-semibold">
            {t("ascend.settings.webappConnection") || "Webapp Connection"}
          </h2>
        </div>
      </div>
      <div className="p-5">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">
                {t("ascend.settings.connectYourPhone") || "Connect Your Phone"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("ascend.settings.connectYourPhoneDescription") ||
                  "Access your Ascendara library and stats from any device by connecting through monitor.ascendara.app"}
              </p>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2 ring-1 ring-primary/20">
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {t("ascend.settings.securityTitle") || "End-to-end encrypted."}
                  </span>{" "}
                  {t("ascend.settings.securityDescription") ||
                    "Commands are sent through a secure API, and your Ascendara app decides whether and how to execute them."}
                  &nbsp;
                  <a
                    className="inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                    onClick={() =>
                      window.electron.openURL("https://ascendara.app/webview")
                    }
                  >
                    {t("common.learnMore")}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </p>
              </div>
            </div>
          </div>

          {!webappConnectionCode ? (
            <Button
              onClick={handleGenerateWebappCode}
              disabled={isGeneratingCode}
              className="w-full text-secondary"
            >
              {isGeneratingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("ascend.settings.generating") || "Generating..."}
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  {t("ascend.settings.startConnection") || "Start Connection"}
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Left Column - Code Display */}
                <div className="space-y-4">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
                    <div className="text-center">
                      <p className="mb-3 text-sm font-medium text-muted-foreground">
                        {t("ascend.settings.enterThisCode") ||
                          "Enter this code on your phone"}
                      </p>
                      <div className="mb-4 flex items-center justify-center gap-2">
                        {webappConnectionCode.split("").map((digit, index) => (
                          <div
                            key={index}
                            className="flex h-14 w-12 items-center justify-center rounded-lg border-2 border-primary bg-background text-2xl font-bold text-primary"
                          >
                            {digit}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          {t("ascend.settings.codeExpiresIn") || "Code expires in"}{" "}
                          {webappCodeExpiry}s
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Info className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      {t("ascend.settings.visitMonitor")}
                    </p>
                  </div>
                </div>

                {/* Right Column - QR Code */}
                {webappQRCode && (
                  <div className="flex items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6">
                    <div className="text-center">
                      <div className="rounded-lg bg-white p-3 shadow-lg">
                        <img src={webappQRCode} alt="QR Code" className="h-40 w-40" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCopyWebappCode}
                  variant="outline"
                  className="flex-1"
                >
                  {webappCodeCopied ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {webappCodeCopied
                    ? t("ascend.settings.codeCopied") || "Copied Code"
                    : t("ascend.settings.copyCode") || "Copy Code"}
                </Button>
                <Button
                  onClick={handleCancelWebappConnection}
                  variant="outline"
                  className="flex-1"
                >
                  <X className="mr-2 h-4 w-4" />
                  {t("ascend.settings.cancel") || "Cancel"}
                </Button>
              </div>
            </div>
          )}

          {/* Connected Devices Section */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                {t("ascend.settings.connectedDevices") || "Connected Devices"}
              </h4>
              <Button
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
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : connectedDevices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
                <Smartphone className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("ascend.settings.noConnectedDevices") || "No devices connected"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {connectedDevices.map(device => {
                  const iconName = getDeviceIcon(device.deviceInfo);
                  const DeviceIcon =
                    iconName === "Smartphone"
                      ? Smartphone
                      : iconName === "Tablet"
                        ? Gamepad2
                        : iconName === "Laptop"
                          ? Laptop
                          : Monitor;
                  const deviceDescription = getDeviceDescription(device.deviceInfo);

                  return (
                    <div
                      key={device.sessionId}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <DeviceIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {device.deviceInfo?.platform || "Web Device"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {deviceDescription}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("ascend.settings.lastActive") || "Last active"}:{" "}
                            {new Date(
                              device.lastActive?.seconds * 1000 || device.lastActive
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleDisconnectDevice(device.sessionId)}
                        variant="ghost"
                        size="sm"
                        disabled={disconnectingDevice === device.sessionId}
                      >
                        {disconnectingDevice === device.sessionId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
