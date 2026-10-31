import { motion } from "framer-motion";
import SectionHeader from "./SectionHeader";
import { EmptyState } from "./primitives";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Sparkles,
  Shield,
  Zap,
  ChevronRight,
  Check,
  X,
  RefreshCw,
  Star,
  Calendar,
  Rocket,
} from "lucide-react";

export default function UpcomingSection({
  upcomingChangelog,
  loadingUpcoming,
  loadUpcomingChangelog,
  t,
}) {
  if (!upcomingChangelog && !loadingUpcoming) {
    loadUpcomingChangelog();
  }
  const upcomingEntry = upcomingChangelog?.[0];
  return (
    <div className="mb-24 space-y-6">
      <SectionHeader
        icon={Rocket}
        title={t("ascend.upcoming.pageTitle")}
        description={t("ascend.upcoming.pageSubtitle")}
      />
      {loadingUpcoming ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-primary" />
          </div>
          <p className="mt-6 text-muted-foreground">
            {t("ascend.upcoming.loading") || "Loading upcoming changes..."}
          </p>
        </div>
      ) : upcomingEntry ? (
        <>
          {/* Hero Header with Version Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl bg-card/60 p-6 shadow sm:p-8"
          >
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-5">
                  <div className="mt-1 flex-shrink-0">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                      <Sparkles className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      {upcomingEntry.major && (
                        <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-secondary">
                          MAJOR UPDATE
                        </span>
                      )}
                      <span className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 font-mono text-sm font-semibold text-primary">
                        v{upcomingEntry.version}
                      </span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {new Date(upcomingEntry.date).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <h1 className="mb-3 text-3xl font-bold leading-tight">
                      {upcomingEntry.title ||
                        t("ascend.upcoming.title") ||
                        "Upcoming Update"}
                    </h1>
                    {upcomingEntry.description && (
                      <p className="text-base leading-relaxed text-muted-foreground">
                        {upcomingEntry.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadUpcomingChangelog}
                    disabled={loadingUpcoming}
                    className="gap-2"
                  >
                    {loadingUpcoming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {t("ascend.upcoming.refresh") || "Refresh"}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Changes Sections - Organized by Parent Tags */}
          <div className="space-y-4">
            {upcomingEntry.features &&
              Object.entries(upcomingEntry.features).map(
                ([parentTag, changes], tagIndex) => {
                  const hasAdditions = changes.additions?.length > 0;
                  const hasFixes = changes.fixes?.length > 0;
                  const hasImprovements = changes.improvements?.length > 0;
                  const hasRemovals = changes.removals?.length > 0;
                  const hasAnyChanges =
                    hasAdditions || hasFixes || hasImprovements || hasRemovals;

                  if (!hasAnyChanges) return null;

                  return (
                    <motion.div
                      key={parentTag}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: tagIndex * 0.1 }}
                      className="rounded-2xl bg-card/60 p-6 shadow"
                    >
                      <h3 className="mb-4 text-xl font-semibold">{parentTag}</h3>
                      <div className="space-y-4">
                        {/* Additions */}
                        {hasAdditions && (
                          <div className="rounded-xl bg-emerald-500/5 p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <Zap className="h-4 w-4 text-emerald-500" />
                              <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                {t("ascend.upcoming.additions") || "New Features"}
                              </h4>
                              <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                {changes.additions.length}
                              </span>
                            </div>
                            <ul className="space-y-2">
                              {changes.additions.map((item, i) => {
                                const isObject = typeof item === "object";
                                const text = isObject ? item.change : item;
                                const contributor = isObject ? item.contributor : null;
                                return (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                                    <div className="flex-1">
                                      <span>{text}</span>
                                      {contributor && (
                                        <span className="ml-2 inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                          @{contributor}
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {/* Fixes */}
                        {hasFixes && (
                          <div className="rounded-xl bg-amber-500/5 p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <Shield className="h-4 w-4 text-amber-500" />
                              <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                                {t("ascend.upcoming.fixes") || "Bug Fixes"}
                              </h4>
                              <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                {changes.fixes.length}
                              </span>
                            </div>
                            <ul className="space-y-2">
                              {changes.fixes.map((item, i) => {
                                const isObject = typeof item === "object";
                                const text = isObject ? item.change : item;
                                const contributor = isObject ? item.contributor : null;
                                return (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                    <div className="flex-1">
                                      <span>{text}</span>
                                      {contributor && (
                                        <span className="ml-2 inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                          @{contributor}
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {/* Improvements */}
                        {hasImprovements && (
                          <div className="rounded-xl bg-blue-500/5 p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <Star className="h-4 w-4 text-blue-500" />
                              <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                {t("ascend.upcoming.improvements") || "Improvements"}
                              </h4>
                              <span className="ml-auto rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                                {changes.improvements.length}
                              </span>
                            </div>
                            <ul className="space-y-2">
                              {changes.improvements.map((item, i) => {
                                const isObject = typeof item === "object";
                                const text = isObject ? item.change : item;
                                const contributor = isObject ? item.contributor : null;
                                return (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                                    <div className="flex-1">
                                      <span>{text}</span>
                                      {contributor && (
                                        <span className="ml-2 inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                                          @{contributor}
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {/* Removals */}
                        {hasRemovals && (
                          <div className="rounded-xl bg-red-500/5 p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <X className="h-4 w-4 text-red-500" />
                              <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">
                                {t("ascend.upcoming.removals") || "Removed"}
                              </h4>
                              <span className="ml-auto rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                                {changes.removals.length}
                              </span>
                            </div>
                            <ul className="space-y-2">
                              {changes.removals.map((item, i) => {
                                const isObject = typeof item === "object";
                                const text = isObject ? item.change : item;
                                const contributor = isObject ? item.contributor : null;
                                return (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                                    <div className="flex-1">
                                      <span>{text}</span>
                                      {contributor && (
                                        <span className="ml-2 inline-flex items-center rounded-md bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                                          @{contributor}
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                }
              )}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Check}
          title={t("ascend.upcoming.upToDate")}
          description={t("ascend.upcoming.noUpcoming")}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={loadUpcomingChangelog}
              disabled={loadingUpcoming}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {t("ascend.upcoming.refresh")}
            </Button>
          }
        />
      )}
    </div>
  );
}
