import { forwardRef, useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  Link2,
  Github,
  Globe,
  MessageCircle,
  MessageSquareText,
  Monitor,
  RefreshCw,
  Rocket,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FeatureSection,
  FeatureStat,
} from "@/components/feature-centers/FeatureCenterPrimitives";
import { useAppIcon } from "@/hooks/useAppIcon";
import { checkForUpdates, useVersionStatus } from "@/services/app/updateCheckingService";

const REVISION = (typeof __APP_REVISION__ !== "undefined" ? __APP_REVISION__ : "")
  .toString()
  .trim();
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";

const LINKS = [
  { id: "website", icon: Globe, url: "https://ascendara.app/" },
  {
    id: "changelog",
    icon: ScrollText,
    url: "https://ascendara.app/changelog?individual",
  },
  { id: "docs", icon: BookOpen, url: "https://ascendara.app/docs" },
  { id: "discord", icon: MessageCircle, url: "https://ascendara.app/discord" },
  { id: "github", icon: Github, url: "https://github.com/ascendara/ascendara" },
  { id: "feedback", icon: MessageSquareText, url: "https://ascendara.app/feedback" },
];

const BRANCH_LABEL_KEYS = {
  live: "settings.appBranch.live.label",
  "public-testing": "settings.appBranch.publicTesting.label",
  experimental: "settings.appBranch.experimental.label",
};

const PLATFORM_NAMES = { win32: "Windows", darwin: "macOS", linux: "Linux" };

// Kept between openings so the tab shows instantly the second time
let cachedInfo = null;
let cachedSpecs = null;

const settled = result => (result.status === "fulfilled" ? result.value : null);

async function loadAppInfo() {
  const electron = window.electron;
  const branch = (await electron.getBranch?.().catch(() => null)) || "live";
  const [testingVersion, portable, launches, games, customGames] =
    await Promise.allSettled([
      branch === "live" ? null : electron.getTestingVersion?.(),
      electron.isPortable?.(),
      electron.getLaunchCount?.(),
      electron.getGames?.(),
      electron.getCustomGames?.(),
    ]);
  const userAgent = navigator.userAgent;
  const installed = settled(games);
  const custom = settled(customGames);
  return {
    branch,
    testingVersion: settled(testingVersion) || "",
    portable: settled(portable) === true,
    launches: Number(settled(launches)) || 0,
    games: Array.isArray(installed) ? installed.length : null,
    customGames: Array.isArray(custom) ? custom.length : 0,
    platform: electron.getPlatform?.() || "",
    electron: userAgent.match(/Electron\/([\d.]+)/)?.[1] || "",
    chromium: userAgent.match(/Chrome\/([\d.]+)/)?.[1] || "",
  };
}

function DetailList({ rows }) {
  return (
    <dl className="divide-y divide-border/60">
      {rows.map(row => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
        >
          <dt className="shrink-0 text-sm text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 truncate text-right text-sm font-medium text-foreground">
            {row.onClick ? (
              <button
                type="button"
                onClick={row.onClick}
                className="font-mono text-xs hover:text-primary hover:underline"
              >
                {row.value}
              </button>
            ) : (
              <span title={typeof row.value === "string" ? row.value : undefined}>
                {row.value}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const AboutTab = forwardRef(function AboutTab({ t, hideLogo }, logoRef) {
  const iconData = useAppIcon();
  const { checking, isOutdated } = useVersionStatus();
  const [info, setInfo] = useState(cachedInfo);
  const [specs, setSpecs] = useState(cachedSpecs);
  const [specsFailed, setSpecsFailed] = useState(false);
  const [checkingNow, setCheckingNow] = useState(false);

  useEffect(() => {
    let active = true;
    loadAppInfo()
      .then(result => {
        cachedInfo = result;
        if (active) setInfo(result);
      })
      .catch(error => console.error("[SystemCenter] Could not load app info:", error));

    // Reading hardware can take a moment on Windows, so it loads on its own
    if (!cachedSpecs) {
      window.electron
        .fetchSystemSpecs?.()
        .then(result => {
          cachedSpecs = result || null;
          if (active) setSpecs(cachedSpecs);
          if (active && !result) setSpecsFailed(true);
        })
        .catch(() => active && setSpecsFailed(true));
    }
    return () => {
      active = false;
    };
  }, []);

  const unknown = t("featureCenters.system.about.unknown");
  const branch = info?.branch || "live";
  const branchLabel = t(BRANCH_LABEL_KEYS[branch] || BRANCH_LABEL_KEYS.live);
  const version =
    branch !== "live" && info?.testingVersion ? info.testingVersion : APP_VERSION;
  const buildType = info
    ? t(
        info.portable
          ? "featureCenters.system.about.portable"
          : "featureCenters.system.about.installer"
      )
    : "…";
  const platformName = PLATFORM_NAMES[info?.platform] || info?.platform || unknown;

  const buildRows = [
    { label: t("featureCenters.system.about.version"), value: `v${version}` },
    { label: t("featureCenters.system.about.channel"), value: branchLabel },
    {
      label: t("featureCenters.system.about.revision"),
      value: REVISION ? REVISION.slice(0, 7) : "dev",
      onClick: REVISION
        ? () =>
            window.electron.openURL(
              `https://github.com/ascendara/ascendara/commit/${REVISION}`
            )
        : undefined,
    },
    { label: t("featureCenters.system.about.buildType"), value: buildType },
    { label: t("featureCenters.system.about.platform"), value: platformName },
    { label: "Electron", value: info?.electron || unknown },
    { label: "Chromium", value: info?.chromium || unknown },
  ];

  const pcRows = specs
    ? [
        { label: t("featureCenters.system.about.os"), value: specs.os || unknown },
        { label: t("featureCenters.system.about.cpu"), value: specs.cpu || unknown },
        { label: t("featureCenters.system.about.ram"), value: specs.ram || unknown },
        { label: t("featureCenters.system.about.gpu"), value: specs.gpu || unknown },
        ...(info?.platform === "win32" && specs.directx && specs.directx !== "Unknown"
          ? [{ label: "DirectX", value: specs.directx }]
          : []),
      ]
    : [];

  const runUpdateCheck = useCallback(async () => {
    setCheckingNow(true);
    try {
      await checkForUpdates();
    } finally {
      setCheckingNow(false);
    }
  }, []);

  const copyDetails = async () => {
    const lines = [
      "Ascendara",
      ...buildRows.map(row => `${row.label}: ${row.value}`),
      ...(REVISION ? [`Commit: ${REVISION}`] : []),
      "",
      ...pcRows.map(row => `${row.label}: ${row.value}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success(t("featureCenters.system.about.copied"), {
        description: t("featureCenters.system.about.copiedDescription"),
      });
    } catch {
      toast.error(t("featureCenters.system.about.copyFailed"));
    }
  };

  const updateState =
    checking || checkingNow ? "checking" : isOutdated ? "available" : "latest";

  return (
    <div className="space-y-5">
      {/* Hero: the menu bar logo lands in this slot when opened from it */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5 shadow sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-background/60 shadow-sm ring-1 ring-border/60">
            <img
              ref={logoRef}
              src={iconData || "icon.png"}
              alt="Ascendara"
              className="h-14 w-14"
              style={{ opacity: hideLogo ? 0 : 1 }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mb-0 text-2xl font-bold tracking-tight text-foreground">
                Ascendara
              </h2>
              <Badge variant="secondary" className="font-mono">
                v{version}
              </Badge>
              <Badge variant="outline">{branchLabel}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("featureCenters.system.about.tagline")}
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-sm">
              {updateState === "checking" ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {t("featureCenters.system.about.checking")}
                  </span>
                </>
              ) : updateState === "available" ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium text-primary">
                    {t("featureCenters.system.about.updateAvailable")}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-muted-foreground">
                    {t("featureCenters.system.about.upToDate")}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
            <Button
              variant="outline"
              size="sm"
              onClick={runUpdateCheck}
              disabled={updateState === "checking"}
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${updateState === "checking" ? "animate-spin" : ""}`}
              />
              {t("featureCenters.system.about.checkUpdates")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() =>
                window.electron.openURL("https://ascendara.app/changelog?individual")
              }
            >
              <ScrollText className="h-4 w-4" />
              {t("featureCenters.system.about.changelog")}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FeatureStat
          label={t("featureCenters.system.about.stats.games")}
          value={info?.games ?? "…"}
          hint={
            info?.customGames
              ? t("featureCenters.system.about.stats.custom", {
                  count: info.customGames,
                })
              : undefined
          }
        />
        <FeatureStat
          label={t("featureCenters.system.about.stats.launches")}
          value={info ? info.launches.toLocaleString() : "…"}
        />
        <FeatureStat
          label={t("featureCenters.system.about.channel")}
          value={branchLabel}
        />
        <FeatureStat
          label={t("featureCenters.system.about.buildType")}
          value={buildType}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FeatureSection
          title={
            <span className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" />
              {t("featureCenters.system.about.thisBuild")}
            </span>
          }
        >
          <DetailList rows={buildRows} />
        </FeatureSection>

        <FeatureSection
          title={
            <span className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" />
              {t("featureCenters.system.about.thisPc")}
            </span>
          }
          actions={
            <Button size="sm" variant="outline" className="gap-2" onClick={copyDetails}>
              <Copy className="h-3.5 w-3.5" />
              {t("featureCenters.system.about.copyDetails")}
            </Button>
          }
        >
          {specs ? (
            <DetailList rows={pcRows} />
          ) : (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              {specsFailed ? (
                <Cpu className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4 animate-spin" />
              )}
              {t(
                specsFailed
                  ? "featureCenters.system.about.specsUnavailable"
                  : "featureCenters.system.about.loadingSpecs"
              )}
            </div>
          )}
        </FeatureSection>
      </div>

      <FeatureSection
        title={
          <span className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            {t("featureCenters.system.about.links")}
          </span>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LINKS.map(link => {
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => window.electron.openURL(link.url)}
                className="group flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                <span className="flex-1 font-medium text-foreground">
                  {t(`featureCenters.system.about.linkNames.${link.id}`)}
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary" />
              </button>
            );
          })}
        </div>
      </FeatureSection>
    </div>
  );
});

export default AboutTab;
