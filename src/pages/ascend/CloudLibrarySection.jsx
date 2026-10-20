import AscendGameImage from "@/components/AscendGameImage";
import { motion } from "framer-motion";
import SectionHeader from "./SectionHeader";
import { StatStrip, EmptyState } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  CloudUpload,
  Search,
  Clock,
  Gamepad2,
  Trophy,
  RefreshCw,
  CloudIcon,
  Gift,
  Play,
  Star,
  Trash2,
  ChevronDown,
  ChevronUp,
  Award,
  LockIcon,
  Info,
  CloudOff,
  CloudDownload,
} from "lucide-react";

export default function CloudLibrarySection({
  getFilteredLibraryGames,
  cloudLibrary,
  t,
  handleRestoreFromCloud,
  isRestoringFromCloud,
  isSyncingLibrary,
  handleSyncLibrary,
  formatPlaytimeDetailed,
  librarySearchQuery,
  setLibrarySearchQuery,
  librarySortBy,
  setLibrarySortBy,
  loadingCloudLibrary,
  expandedGame,
  handleExpandGame,
  isGameInstalledLocally,
  loadingGameAchievements,
  gameAchievements,
  showDeleteConfirm,
  setShowDeleteConfirm,
  handleDeleteCloudGame,
  deletingGame,
}) {
  const filteredGames = getFilteredLibraryGames();
  const achievementPercentage =
    cloudLibrary?.totalAchievements > 0
      ? Math.round(
          (cloudLibrary.unlockedAchievements / cloudLibrary.totalAchievements) * 100
        )
      : 0;
  return (
    <div className="mb-24 space-y-6">
      <SectionHeader
        icon={CloudIcon}
        title={t("ascend.cloudLibrary.title")}
        description={t("ascend.cloudLibrary.subtitle")}
        actions={
          <>
            <Button
              onClick={handleRestoreFromCloud}
              disabled={isRestoringFromCloud || isSyncingLibrary}
              variant="outline"
              className="shrink-0 gap-2 whitespace-nowrap"
              title={
                t("ascend.cloudLibrary.restoreTooltip") ||
                "Restore profile stats and per-game playtime from cloud into local files (use after OS migration or fresh install)"
              }
            >
              {isRestoringFromCloud ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudDownload className="h-4 w-4" />
              )}
              {isRestoringFromCloud
                ? t("ascend.cloudLibrary.restoring") || "Restoring..."
                : t("ascend.cloudLibrary.restore") || "Restore from Cloud"}
            </Button>
            <Button
              onClick={handleSyncLibrary}
              disabled={isSyncingLibrary || isRestoringFromCloud}
              className="shrink-0 gap-2 whitespace-nowrap text-secondary"
            >
              {isSyncingLibrary ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              {isSyncingLibrary
                ? t("ascend.cloudLibrary.syncing")
                : t("ascend.cloudLibrary.sync")}
            </Button>
          </>
        }
      >
        {cloudLibrary?.lastSynced && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            {t("ascend.cloudLibrary.lastSynced")}{" "}
            {new Date(cloudLibrary.lastSynced).toLocaleString()}
          </p>
        )}
      </SectionHeader>

      {cloudLibrary && (
        <StatStrip
          stats={[
            {
              icon: Gamepad2,
              label: t("ascend.cloudLibrary.gamesInCloud"),
              value: cloudLibrary.totalGames || 0,
            },
            {
              icon: Clock,
              label: t("ascend.cloudLibrary.totalPlaytime"),
              value: formatPlaytimeDetailed(cloudLibrary.totalPlaytime || 0),
            },
            {
              icon: Trophy,
              label: t("ascend.cloudLibrary.achievements"),
              value: cloudLibrary.unlockedAchievements || 0,
              suffix: `/ ${cloudLibrary.totalAchievements || 0}`,
              footer: (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${achievementPercentage}%` }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="h-full rounded-full bg-primary"
                  />
                </div>
              ),
            },
            {
              icon: Play,
              label: t("ascend.cloudLibrary.totalLaunches"),
              value:
                cloudLibrary.games?.reduce((acc, g) => acc + (g.launchCount || 0), 0) || 0,
            },
          ]}
        />
      )}

      {/* Search and sort stay pinned while scrolling a long library */}
      <div className="sticky top-0 z-20 -mx-2 flex flex-col gap-2 rounded-2xl bg-background/85 p-2 backdrop-blur-xl sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("ascend.cloudLibrary.searchPlaceholder")}
            className="h-11 rounded-xl border-border/50 bg-card/60 pl-11"
            value={librarySearchQuery}
            onChange={e => setLibrarySearchQuery(e.target.value)}
          />
        </div>
        <Select value={librarySortBy} onValueChange={setLibrarySortBy}>
          <SelectTrigger className="h-11 w-full rounded-xl border-border/50 bg-card/60 sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">{t("ascend.cloudLibrary.sortName")}</SelectItem>
            <SelectItem value="playtime">
              {t("ascend.cloudLibrary.sortPlaytime")}
            </SelectItem>
            <SelectItem value="recent">{t("ascend.cloudLibrary.sortRecent")}</SelectItem>
            <SelectItem value="achievements">
              {t("ascend.cloudLibrary.sortAchievements")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loadingCloudLibrary ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-primary" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("ascend.cloudLibrary.loading")}
          </p>
        </div>
      ) : cloudLibrary && filteredGames.length > 0 ? (
        <div className="space-y-3">
          {filteredGames.map((game, index) => {
            const gameAchStats = game.achievementStats || game.achievements;
            const isExpanded = expandedGame === game.name;
            return (
              <motion.div
                key={game.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 8) * 0.03 }}
                className="group overflow-hidden rounded-2xl border border-border/50 bg-card/60 transition-colors hover:border-primary/30"
              >
                {/* Main Game Row */}
                <div
                  className="flex cursor-pointer items-center gap-4 p-4"
                  onClick={() => handleExpandGame(game.name)}
                >
                  {/* Game Image */}
                  <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-xl bg-muted">
                    <AscendGameImage name={game.name || game.game} />
                    {gameAchStats?.percentage === 100 && (
                      <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500 shadow-lg">
                        <Trophy className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Game Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-lg font-semibold">{game.name}</h3>
                      {!isGameInstalledLocally(game.name) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex shrink-0 cursor-help items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">
                                <CloudOff className="h-3 w-3" />
                                {t("ascend.cloudLibrary.cloudOnly") || "Cloud only"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-secondary">
                                {t("ascend.cloudLibrary.cloudOnly") || "Cloud only"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {game.isCustom && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {t("ascend.cloudLibrary.custom")}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {formatPlaytimeDetailed(game.playTime || 0)}
                      </span>
                      {game.launchCount > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Play className="h-4 w-4" />
                          {game.launchCount} {t("ascend.cloudLibrary.launches")}
                        </span>
                      )}
                      {gameAchStats && (
                        <span className="flex items-center gap-1.5">
                          <Trophy className="h-4 w-4 text-yellow-500" />
                          {gameAchStats.unlocked}/{gameAchStats.total} (
                          {gameAchStats.percentage}%)
                        </span>
                      )}
                    </div>
                    {/* Achievement Progress Bar */}
                    {gameAchStats && (
                      <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-yellow-500 transition-all"
                          style={{ width: `${gameAchStats.percentage}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Badges & Actions */}
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      {game.favorite && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                          <Star className="h-4 w-4 fill-red-500 text-red-500" />
                        </div>
                      )}
                      {game.online && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
                          <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      {game.dlc && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
                          <Gift className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted">
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Content - Achievements & Actions */}
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-border/50 bg-muted/30"
                  >
                    <div className="space-y-4 p-4">
                      {/* Achievements Section */}
                      {loadingGameAchievements ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <span className="ml-2 text-sm text-muted-foreground">
                            {t("ascend.cloudLibrary.loadingAchievements")}
                          </span>
                        </div>
                      ) : gameAchievements?.achievements?.length > 0 ? (
                        <div>
                          <h4 className="mb-3 flex items-center gap-2 font-semibold">
                            <Trophy className="h-4 w-4 text-yellow-500" />
                            {t("ascend.cloudLibrary.achievements")} (
                            {gameAchievements.unlockedAchievements}/
                            {gameAchievements.totalAchievements})
                          </h4>
                          <div className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto pr-2 sm:grid-cols-3 md:grid-cols-4">
                            {gameAchievements.achievements.map((ach, i) => (
                              <div
                                key={ach.achID || i}
                                className={`relative flex flex-col items-center rounded-xl border p-3 transition-all ${
                                  ach.achieved
                                    ? "border-yellow-500/30 bg-yellow-500/5"
                                    : "border-border/50 bg-muted/50 opacity-60"
                                }`}
                              >
                                {ach.icon ? (
                                  <img
                                    src={ach.icon}
                                    alt={ach.name}
                                    className={`h-10 w-10 rounded-lg ${!ach.achieved && "grayscale"}`}
                                  />
                                ) : (
                                  <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${ach.achieved ? "bg-yellow-500/20" : "bg-muted"}`}
                                  >
                                    <Award
                                      className={`h-5 w-5 ${ach.achieved ? "text-yellow-500" : "text-muted-foreground"}`}
                                    />
                                  </div>
                                )}
                                <p className="mt-2 line-clamp-2 text-center text-xs font-medium">
                                  {ach.name}
                                </p>
                                {!ach.achieved && (
                                  <LockIcon className="absolute right-2 top-2 h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : gameAchStats ? (
                        <div className="py-6 text-center text-muted-foreground">
                          <Trophy className="mx-auto mb-2 h-8 w-8 opacity-50" />
                          <p className="text-sm">
                            {t("ascend.cloudLibrary.achievementDetailsNotSynced")}
                          </p>
                          <p className="mt-1 text-xs">
                            {t("ascend.cloudLibrary.syncToLoadAchievements")}
                          </p>
                        </div>
                      ) : (
                        <div className="py-6 text-center text-muted-foreground">
                          <Info className="mx-auto mb-2 h-8 w-8 opacity-50" />
                          <p className="text-sm">
                            {t("ascend.cloudLibrary.noAchievements")}
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between border-t border-border/50 pt-3">
                        <div className="text-xs text-muted-foreground">
                          {game.lastPlayed && (
                            <span>
                              {t("ascend.cloudLibrary.lastPlayed")}:{" "}
                              {new Date(game.lastPlayed).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {showDeleteConfirm === game.name ? (
                            <>
                              <span className="mr-2 text-sm text-muted-foreground">
                                {t("ascend.cloudLibrary.deleteConfirm")}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowDeleteConfirm(null)}
                              >
                                {t("ascend.cloudLibrary.cancel")}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteCloudGame(game.name)}
                                disabled={deletingGame === game.name}
                              >
                                {deletingGame === game.name ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  t("ascend.cloudLibrary.delete")
                                )}
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={e => {
                                e.stopPropagation();
                                setShowDeleteConfirm(game.name);
                              }}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              {t("ascend.cloudLibrary.removeFromCloud")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      ) : cloudLibrary ? (
        <EmptyState
          icon={Search}
          title={t("ascend.cloudLibrary.noResults")}
          description={
            librarySearchQuery
              ? t("ascend.cloudLibrary.tryDifferentSearch")
              : t("ascend.cloudLibrary.syncFirst")
          }
        />
      ) : (
        <EmptyState
          icon={CloudIcon}
          title={t("ascend.cloudLibrary.emptyTitle")}
          description={t("ascend.cloudLibrary.emptyDescription")}
          action={
            <Button
              onClick={handleSyncLibrary}
              disabled={isSyncingLibrary}
              className="gap-2 text-secondary"
            >
              {isSyncingLibrary ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              {isSyncingLibrary
                ? t("ascend.cloudLibrary.syncing")
                : t("ascend.cloudLibrary.startSyncing")}
            </Button>
          }
        />
      )}
    </div>
  );
}
