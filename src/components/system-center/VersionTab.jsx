import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  History,
  Newspaper,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CATEGORIES,
  CATEGORY_KEYS,
  CHANGELOG_API_URL,
  ChangeItem,
  formatDate,
  pickEntry,
} from "@/components/ChangelogDialog";
import { FeatureSection } from "@/components/feature-centers/FeatureCenterPrimitives";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { checkForUpdates, useVersionStatus } from "@/services/app/updateCheckingService";
import v12Art from "@/assets/v12.png";

const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";
const MAJOR = APP_VERSION.split(".")[0];
const MAJOR_ART = { 12: v12Art };

// A section shows this many changes before "Show all"
const PREVIEW_COUNT = 4;

// Kept between openings so the tab shows instantly the second time
let cachedChangelog = null;

// Soft white folds drawn over the lavender badge, like the version tile in Settings
function SilkWaves({ className }) {
  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      viewBox="0 0 400 200"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 140 C 90 90, 190 190, 400 100 L 400 200 L 0 200 Z"
        fill="white"
        fillOpacity="0.32"
      />
      <path
        d="M0 170 C 120 120, 230 200, 400 150 L 400 200 L 0 200 Z"
        fill="white"
        fillOpacity="0.28"
      />
      <path
        d="M0 70 C 110 20, 210 130, 400 30"
        fill="none"
        stroke="white"
        strokeOpacity="0.75"
        strokeWidth="1.2"
      />
      <path
        d="M0 110 C 130 50, 240 150, 400 70"
        fill="none"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="0.9"
      />
    </svg>
  );
}

function ChangeSection({ tag, items, t }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, PREVIEW_COUNT);
  const hidden = items.length - visible.length;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {tag}
      </p>
      <ul>
        {visible.map(({ item, category }, index) => (
          <ChangeItem key={index} item={item} category={category} />
        ))}
      </ul>
      {(hidden > 0 || showAll) && items.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(value => !value)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {showAll
            ? t("featureCenters.system.version.showLess")
            : t("featureCenters.system.version.showAll", { count: hidden })}
        </button>
      )}
    </div>
  );
}

function LinkCard({ icon: Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card/50 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

const VersionTab = forwardRef(function VersionTab({ t, hideBadge }, badgeRef) {
  const { language } = useLanguage();
  const { checking, isOutdated } = useVersionStatus();
  const [checkingNow, setCheckingNow] = useState(false);
  const [changelog, setChangelog] = useState(cachedChangelog);
  const [loading, setLoading] = useState(!cachedChangelog);
  const [failed, setFailed] = useState(false);

  const loadChangelog = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(CHANGELOG_API_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      cachedChangelog = await response.json();
      setChangelog(cachedChangelog);
    } catch (error) {
      console.error("[SystemCenter] Could not load the changelog:", error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChangelog();
  }, [loadChangelog]);

  const entry = useMemo(() => pickEntry(changelog?.entries, APP_VERSION), [changelog]);

  // One section per parent tag, items flattened in category order
  const sections = useMemo(() => {
    if (!entry?.features) return [];
    return Object.entries(entry.features)
      .map(([tag, categories]) => ({
        tag,
        items: CATEGORY_KEYS.flatMap(category =>
          (Array.isArray(categories?.[category]) ? categories[category] : []).map(
            item => ({ item, category })
          )
        ),
      }))
      .filter(section => section.items.length > 0);
  }, [entry]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(CATEGORY_KEYS.map(key => [key, 0]));
    sections.forEach(section =>
      section.items.forEach(({ category }) => {
        result[category] += 1;
      })
    );
    return result;
  }, [sections]);

  const runUpdateCheck = useCallback(async () => {
    setCheckingNow(true);
    try {
      await checkForUpdates();
    } finally {
      setCheckingNow(false);
    }
  }, []);

  const updateState =
    checking || checkingNow ? "checking" : isOutdated ? "available" : "latest";
  const art = MAJOR_ART[MAJOR];
  const releaseDate = formatDate(entry?.date, language);
  // The changelog may only know an older release if this build is newer
  const entryIsThisVersion = entry?.version === APP_VERSION;

  return (
    <div className="space-y-5">
      {/* Hero: themed like the Settings version card; only the lavender
          badge keeps its own colors. The Settings badge lands in it. */}
      <section className="relative overflow-hidden rounded-[26px] bg-card/70 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_28px_-6px_rgba(0,0,0,0.18)] ring-1 ring-black/5 sm:p-8 dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_10px_32px_-8px_rgba(0,0,0,0.6)] dark:ring-white/10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* App-icon tile: soft lavender squircle with white silk waves */}
          <span className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[30px] bg-gradient-to-br from-[#f4f0ff] via-[#e6defc] to-[#d3c6f5] shadow-[0_10px_28px_-8px_rgba(124,58,237,0.45)] ring-1 ring-inset ring-violet-300/40">
            <SilkWaves />
            {art ? (
              <img
                ref={badgeRef}
                src={art}
                alt=""
                draggable={false}
                className="relative w-[4.5rem] drop-shadow-[0_2px_6px_rgba(124,58,237,0.35)]"
                style={{ opacity: hideBadge ? 0 : 1 }}
              />
            ) : (
              <span className="relative text-5xl font-black tracking-tighter text-violet-600">
                {MAJOR}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("featureCenters.system.version.eyebrow")}
            </p>
            <h2 className="mb-0 mt-1 text-3xl font-bold tracking-tight text-foreground">
              {t("settings.versionBadge.title", { major: MAJOR })}
            </h2>
            {entryIsThisVersion && entry?.title && (
              <p className="mt-1 text-sm text-muted-foreground">{entry.title}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary px-3 py-1 font-mono text-xs font-semibold text-secondary shadow-sm">
                v{APP_VERSION}
              </span>
              {entryIsThisVersion && releaseDate && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {releaseDate}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                {updateState === "checking" ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    {t("featureCenters.system.about.checking")}
                  </>
                ) : updateState === "available" ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-primary">
                      {t("featureCenters.system.about.updateAvailable")}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    {t("featureCenters.system.about.upToDate")}
                  </>
                )}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runUpdateCheck}
            disabled={updateState === "checking"}
            className="shrink-0 gap-2 self-start sm:self-center"
          >
            <RefreshCw
              className={`h-4 w-4 ${updateState === "checking" ? "animate-spin" : ""}`}
            />
            {t("featureCenters.system.about.checkUpdates")}
          </Button>
        </div>
      </section>

      <FeatureSection
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("featureCenters.system.version.latestChanges")}
          </span>
        }
        description={
          entry && !entryIsThisVersion
            ? t("featureCenters.system.version.showingVersion", {
                version: entry.version,
              })
            : undefined
        }
      >
        {loading && !entry ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t("featureCenters.common.loading")}
          </div>
        ) : failed && !entry ? (
          <div className="flex flex-wrap items-center gap-3 py-1">
            <p className="text-sm text-muted-foreground">
              {t("featureCenters.system.version.loadFailed")}
            </p>
            <Button size="sm" variant="outline" onClick={loadChangelog}>
              {t("featureCenters.common.retry")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {entry?.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {entry.description}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {CATEGORY_KEYS.filter(key => counts[key] > 0).map(key => {
                const meta = CATEGORIES[key];
                const Icon = meta.icon;
                return (
                  <span
                    key={key}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      meta.tint,
                      meta.text
                    )}
                  >
                    <Icon className="h-3 w-3" strokeWidth={2.75} />
                    {counts[key]} {t(`app.changelog.${key}`)}
                  </span>
                );
              })}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {sections.map(section => (
                <ChangeSection
                  key={section.tag}
                  tag={section.tag}
                  items={section.items}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}
      </FeatureSection>

      <div className="grid gap-3 sm:grid-cols-2">
        <LinkCard
          icon={History}
          title={t("featureCenters.system.version.pastChanges")}
          description={t("featureCenters.system.version.pastChangesDescription")}
          onClick={() => window.electron.openURL("https://ascendara.app/changelog")}
        />
        <LinkCard
          icon={Newspaper}
          title={t("featureCenters.system.version.news")}
          description={t("featureCenters.system.version.newsDescription")}
          onClick={() => window.electron.openURL("https://ascendara.app/news")}
        />
      </div>
    </div>
  );
});

export default VersionTab;
