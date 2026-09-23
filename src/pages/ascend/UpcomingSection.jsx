import { motion } from "framer-motion";
import SectionHeader from "./SectionHeader";
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
            <div className="h-20 w-20 rounded-full border-4 border-violet-500/20" />
            <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-violet-500" />
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
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-fuchsia-500/10 p-8"
          >
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />
            <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />

            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-5">
                  <div className="mt-1 flex-shrink-0">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl shadow-violet-500/30">
                      <Sparkles className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      {upcomingEntry.major && (
                        <span className="rounded-full bg-gradient-to-r from-violet-500 to-purple-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/30">
                          MAJOR UPDATE
                        </span>
                      )}
                      <span className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 font-mono text-sm font-semibold text-violet-600 dark:text-violet-400">
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
                      className="rounded-2xl border border-border/50 bg-card/50 p-6"
                    >
                      <h3 className="mb-4 text-xl font-semibold">{parentTag}</h3>
                      <div className="space-y-4">
                        {/* Additions */}
                        {hasAdditions && (
                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
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
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
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
                          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
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
                          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
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
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border border-dashed border-border/50 bg-card/30 p-16 text-center"
        >
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/20 to-purple-500/20">
            <Check className="h-12 w-12 text-violet-500" />
          </div>
          <h2 className="mb-3 text-2xl font-bold">
            {t("ascend.upcoming.upToDate") || "You're up to date!"}
          </h2>
          <p className="mx-auto max-w-md text-muted-foreground">
            {t("ascend.upcoming.noUpcoming") ||
              "There are no upcoming updates at this time. Check back later!"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={loadUpcomingChangelog}
            disabled={loadingUpcoming}
            className="mt-6 gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {t("ascend.upcoming.refresh") || "Refresh"}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
