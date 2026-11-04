import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Loader,
  Plus,
  Wrench,
  Sparkles,
  Minus,
  ExternalLink,
  CalendarDays,
  RefreshCw,
} from "lucide-react";
import { API_URL } from "@/config/api";

const CHANGELOG_API_URL = `${API_URL}/json/changelog/v2`;

// Order matters: this is how categories are listed in each section
const CATEGORIES = {
  additions: {
    icon: Plus,
    text: "text-emerald-500",
    tint: "bg-emerald-500/10",
    ring: "ring-emerald-500/40",
  },
  improvements: {
    icon: Sparkles,
    text: "text-sky-500",
    tint: "bg-sky-500/10",
    ring: "ring-sky-500/40",
  },
  fixes: {
    icon: Wrench,
    text: "text-amber-500",
    tint: "bg-amber-500/10",
    ring: "ring-amber-500/40",
  },
  removals: {
    icon: Minus,
    text: "text-muted-foreground",
    tint: "bg-muted",
    ring: "ring-muted-foreground/40",
  },
};
const CATEGORY_KEYS = Object.keys(CATEGORIES);

const resolveImageUrl = path => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
};

// Prefer the entry for the running version, otherwise the newest released one.
// Drafts are only considered when previewing a specific version.
const pickEntry = (entries, currentVersion, includeDrafts = false) => {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  if (includeDrafts) {
    const exact = entries.find(e => e?.version === currentVersion);
    if (exact) return exact;
  }
  const released = entries.filter(e => e && e.release !== false);
  return (
    released.find(e => e.version === currentVersion) || released[0] || entries[0] || null
  );
};

const formatDate = (date, language) => {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  try {
    return parsed.toLocaleDateString(language, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return parsed.toLocaleDateString();
  }
};

const Banner = ({ entry }) => {
  const imageUrl = resolveImageUrl(entry?.image);
  const [status, setStatus] = useState(imageUrl ? "loading" : "none");

  useEffect(() => {
    setStatus(imageUrl ? "loading" : "none");
  }, [imageUrl]);

  const showImage = status === "loading" || status === "loaded";

  return (
    <div className="relative aspect-[2048/682] w-full shrink-0 overflow-hidden bg-muted">
      {/* Fallback art, also shown behind the image while it loads */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/10 to-background" />
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
      <div className="absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
      {!showImage && entry?.version && (
        <div className="absolute inset-0 flex items-center justify-end pr-10">
          <span className="select-none text-[7rem] font-black leading-none tracking-tighter text-primary/15">
            {entry.version.split(".").slice(0, 2).join(".")}
          </span>
        </div>
      )}

      {showImage && (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            status === "loaded" ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      {status === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-foreground/5" />
      )}

      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
};

const ChangeItem = ({ item, category }) => {
  const meta = CATEGORIES[category];
  const Icon = meta.icon;
  const text = typeof item === "string" ? item : item?.change;
  const contributor = typeof item === "object" ? item?.contributor : null;
  if (!text) return null;

  return (
    <li className="flex items-start gap-3 py-1.5">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
          meta.tint,
          meta.text
        )}
      >
        <Icon className="h-3 w-3" strokeWidth={2.75} />
      </span>
      <span className="flex-1 text-sm leading-relaxed text-foreground">
        {text}
        {contributor && (
          <span className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-px align-middle text-[11px] font-medium text-muted-foreground">
            @{contributor}
          </span>
        )}
      </span>
    </li>
  );
};

const ChangelogDialog = ({
  open,
  onOpenChange,
  currentVersion,
  includeDrafts = false,
}) => {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [changelogData, setChangelogData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);

  const fetchChangelog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(CHANGELOG_API_URL);
      if (!response.ok) {
        throw new Error("Failed to fetch changelog");
      }
      setChangelogData(await response.json());
    } catch (err) {
      console.error("Error fetching changelog:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setFilter("all");
      setExpanded(false);
      fetchChangelog();
    }
  }, [open, fetchChangelog]);

  const entry = useMemo(
    () => pickEntry(changelogData?.entries, currentVersion, includeDrafts),
    [changelogData, currentVersion, includeDrafts]
  );

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
    const result = Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0]));
    sections.forEach(section =>
      section.items.forEach(({ category }) => {
        result[category] += 1;
      })
    );
    return result;
  }, [sections]);
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const visibleSections = useMemo(
    () =>
      filter === "all"
        ? sections
        : sections
            .map(section => ({
              ...section,
              items: section.items.filter(i => i.category === filter),
            }))
            .filter(section => section.items.length > 0),
    [sections, filter]
  );

  const title = entry?.title?.trim() || t("app.changelog.title");
  const description = entry?.description?.trim();
  const isLongDescription = (description?.length || 0) > 260;
  const date = formatDate(entry?.date, language);
  const version = entry?.version || currentVersion;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        {loading || error || !entry ? (
          <>
            <AlertDialogTitle className="sr-only">
              {t("app.changelog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex h-72 flex-col items-center justify-center gap-3 p-6">
                {loading ? (
                  <>
                    <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {t("app.changelog.loading")}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-destructive text-sm">
                      {t("app.changelog.failedToLoad")}
                    </p>
                    <Button variant="outline" size="sm" onClick={fetchChangelog}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {t("app.changelog.retry")}
                    </Button>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Banner key={entry.version} entry={entry} />

            <div className="relative -mt-10 space-y-4 px-7">
              <div className="flex flex-wrap items-center gap-2">
                {version && (
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-secondary shadow-sm">
                    v{version}
                  </span>
                )}
                {date && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {date}
                  </span>
                )}
              </div>

              <AlertDialogTitle className="text-3xl font-bold tracking-tight">
                {title}
              </AlertDialogTitle>

              {description ? (
                <div>
                  <AlertDialogDescription
                    className={cn(
                      "text-sm leading-relaxed text-muted-foreground",
                      isLongDescription && !expanded && "line-clamp-3"
                    )}
                  >
                    {description}
                  </AlertDialogDescription>
                  {isLongDescription && (
                    <button
                      type="button"
                      onClick={() => setExpanded(v => !v)}
                      className="mt-1 text-xs font-medium text-primary hover:underline"
                    >
                      {expanded
                        ? t("app.changelog.showLess")
                        : t("app.changelog.showMore")}
                    </button>
                  )}
                </div>
              ) : (
                <AlertDialogDescription className="sr-only">
                  {t("app.changelog.title")}
                </AlertDialogDescription>
              )}
            </div>

            {totalCount > 0 && (
              <div className="sticky top-0 z-10 mt-5 border-y border-border/60 bg-background/90 px-7 py-3 backdrop-blur">
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    active={filter === "all"}
                    onClick={() => setFilter("all")}
                    label={t("app.changelog.all")}
                    count={totalCount}
                  />
                  {CATEGORY_KEYS.map(category =>
                    counts[category] > 0 ? (
                      <FilterChip
                        key={category}
                        category={category}
                        active={filter === category}
                        onClick={() =>
                          setFilter(current => (current === category ? "all" : category))
                        }
                        label={t(`app.changelog.${category}`)}
                        count={counts[category]}
                      />
                    ) : null
                  )}
                </div>
              </div>
            )}

            <div className="space-y-6 px-7 pb-6 pt-5">
              {visibleSections.map((section, index) => (
                <motion.section
                  key={`${filter}-${section.tag}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(index, 6) * 0.05 }}
                >
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.tag}
                    </h3>
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {section.items.length}
                    </span>
                  </div>
                  <ul className="rounded-xl border border-border/60 bg-muted/20 px-4 py-2">
                    {section.items.map(({ item, category }, idx) => (
                      <ChangeItem key={idx} item={item} category={category} />
                    ))}
                  </ul>
                </motion.section>
              ))}
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 bg-background px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => window.electron.openURL("https://ascendara.app/changelog")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("app.changelog.fullChangelog")}
          </Button>
          <Button className="px-6 text-secondary" onClick={() => onOpenChange(false)}>
            {t("app.changelog.gotIt")}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const FilterChip = ({ active, onClick, label, count, category }) => {
  const meta = category ? CATEGORIES[category] : null;
  const Icon = meta?.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? cn(
              "border-transparent ring-1",
              meta
                ? cn(meta.tint, meta.text, meta.ring)
                : "bg-primary text-secondary ring-primary"
            )
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {Icon && (
        <Icon className={cn("h-3 w-3", !active && meta.text)} strokeWidth={2.75} />
      )}
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
};

export default ChangelogDialog;
