import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Lock, ArrowUpRight, Repeat2 } from "lucide-react";

// Release channels, steadiest first. The order is also the order of the track.
export const APP_BRANCHES = [
  {
    id: "live",
    labelKey: "settings.appBranch.live.label",
    descriptionKey: "settings.appBranch.live.description",
    text: "text-emerald-500",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/25",
    tint: "bg-emerald-500/[0.06]",
  },
  {
    id: "public-testing",
    labelKey: "settings.appBranch.publicTesting.label",
    descriptionKey: "settings.appBranch.publicTesting.description",
    text: "text-yellow-500",
    dot: "bg-yellow-500",
    ring: "ring-yellow-500/25",
    tint: "bg-yellow-500/[0.06]",
  },
  {
    id: "experimental",
    labelKey: "settings.appBranch.experimental.label",
    descriptionKey: "settings.appBranch.experimental.description",
    text: "text-red-400",
    dot: "bg-red-400",
    ring: "ring-red-400/25",
    tint: "bg-red-400/[0.06]",
    requiresSubscription: true,
  },
];

export const getAppBranch = id =>
  APP_BRANCHES.find(branch => branch.id === id) || APP_BRANCHES[0];

/**
 * The App Branch picker: where you are now, how the channels trade stability
 * for new features, and a track of the channels to switch between.
 */
export default function AppBranchPicker({
  t,
  currentBranch,
  currentVersion,
  branchVersions,
  hasAscendSubscription,
  onSwitch,
  onLocked,
}) {
  const current = getAppBranch(currentBranch);
  const currentIndex = APP_BRANCHES.indexOf(current);
  const liveVersion = branchVersions?.live;

  return (
    <div className="space-y-8">
      {/* Where this install is right now */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`relative flex h-2.5 w-2.5 ${current.dot} rounded-full`}>
            <span
              className={`absolute inset-0 animate-ping rounded-full ${current.dot} opacity-60`}
            />
          </span>
          <p className="text-sm text-muted-foreground">
            {t("settings.appBranch.onBranch")}{" "}
            <span className={`font-semibold ${current.text}`}>{t(current.labelKey)}</span>
            {currentVersion && (
              <span className="ml-1.5 font-mono text-xs text-foreground/80">
                v{currentVersion}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() =>
            window.electron.openURL("https://ascendara.app/changelog?individual")
          }
        >
          {t("settings.appBranch.changelog")}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Stability scale: steadier on the left, newer on the right */}
      <div className="space-y-2">
        <div className="relative grid grid-cols-3 gap-1.5">
          {APP_BRANCHES.map((branch, index) => (
            <div key={branch.id} className="relative h-1.5 overflow-hidden rounded-full">
              <div className={`absolute inset-0 ${branch.dot} opacity-20`} />
              {index === currentIndex && (
                <motion.div
                  layoutId="app-branch-scale"
                  className={`absolute inset-0 ${branch.dot}`}
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>{t("settings.appBranch.steadier")}</span>
          <span>{t("settings.appBranch.newer")}</span>
        </div>
      </div>

      {/* The channels, as stops on one track */}
      <ol className="relative">
        {APP_BRANCHES.map((branch, index) => {
          const isActive = branch.id === current.id;
          const isLocked = branch.requiresSubscription && !hasAscendSubscription;
          const version = branchVersions?.[branch.id];
          // A testing channel with nothing newer than Live has no build to offer
          const sameAsLive =
            branch.id !== "live" && !!version && !!liveVersion && version === liveVersion;
          const isLast = index === APP_BRANCHES.length - 1;

          return (
            <li
              key={branch.id}
              className={`relative flex gap-4 rounded-lg py-4 pl-3 pr-3 transition-colors ${
                isActive ? branch.tint : ""
              }`}
            >
              {/* Track line and stop */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-[-1.25rem] left-5 top-9 w-px bg-border"
                />
              )}
              <span
                aria-hidden="true"
                className={`relative z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-4 ${
                  isActive
                    ? `${branch.dot} ${branch.ring}`
                    : "bg-background ring-background"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isActive ? "bg-background" : `${branch.dot} opacity-70`
                  }`}
                />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`text-sm font-semibold ${isActive ? branch.text : "text-foreground"}`}
                  >
                    {t(branch.labelKey)}
                  </span>
                  {version && (
                    <span className="font-mono text-xs text-muted-foreground">
                      v{version}
                    </span>
                  )}
                  {branch.requiresSubscription && (
                    <span className="rounded-full border border-yellow-500/30 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-yellow-500">
                      Ascend
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  {t(branch.descriptionKey)}
                </p>
                {sameAsLive && !isActive && (
                  <p className="mt-1.5 text-xs text-muted-foreground/80">
                    {t("settings.appBranch.sameAsLive")}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-start">
                {isActive ? (
                  <span
                    className={`mt-0.5 text-xs font-semibold uppercase tracking-wide ${branch.text}`}
                  >
                    {t("settings.appBranch.current")}
                  </span>
                ) : isLocked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={onLocked}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {t("settings.appBranch.unlock")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={sameAsLive}
                    onClick={() => onSwitch(branch)}
                  >
                    <Repeat2 className="h-3.5 w-3.5" />
                    {t("settings.appBranch.switch")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
