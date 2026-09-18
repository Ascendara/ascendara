import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  MessageCircle,
  UserPlus,
  X,
  Clock,
  ArrowLeft,
  Gamepad2,
  Trophy,
  Star,
  Award,
  LockIcon,
  Globe,
  Github,
  Crown,
  BadgeCheck,
  Flag,
  Loader,
  Hammer,
  Inbox,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

export default function UserProfileSection({
  handleBackFromProfile,
  t,
  loadingProfile,
  profileError,
  viewingProfile,
  getRelationshipStatus,
  handleStartConversation,
  handleSendRequest,
  reportDialogOpen,
  setReportDialogOpen,
  handleSubmitUserReport,
  reportUserReason,
  setReportUserReason,
  reportUserDetails,
  setReportUserDetails,
  isReportingUser,
}) {
  return (
    <div className="mb-20 space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={handleBackFromProfile} className="-ml-2 gap-2">
        <ArrowLeft className="h-4 w-4" />
        {t("ascend.profile.back") || "Back to Search"}
      </Button>

      {loadingProfile ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {t("ascend.profile.loading") || "Loading profile..."}
          </p>
        </div>
      ) : profileError ? (
        <div className="border-destructive/50 bg-destructive/10 rounded-2xl border p-8 text-center">
          <X className="text-destructive mx-auto mb-4 h-12 w-12" />
          <h3 className="mb-1 text-lg font-semibold">
            {t("ascend.profile.error") || "Error loading profile"}
          </h3>
          <p className="text-sm text-muted-foreground">{profileError}</p>
        </div>
      ) : viewingProfile ? (
        <>
          {/* Private Account Warning */}
          {viewingProfile.private && (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow-500/20">
                  <LockIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-yellow-600 dark:text-yellow-400">
                    {t("ascend.profile.privateAccount") || "Private Account"}
                  </h3>
                  <p className="text-sm text-yellow-600/80 dark:text-yellow-400/80">
                    {t("ascend.profile.privateAccountMessage") ||
                      "This user has set their account to private. Their profile details, games, and achievements are hidden."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Profile Header */}
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card/95 to-card/90">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5" />
            <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-violet-500/10 blur-3xl" />

            <div className="relative p-8">
              <div className="flex flex-col items-start gap-6 md:flex-row">
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 shadow-2xl shadow-primary/30 ring-4 ring-background">
                    {viewingProfile.photoURL ? (
                      <img
                        src={viewingProfile.photoURL}
                        alt={viewingProfile.displayName}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-primary-foreground text-4xl font-bold">
                        {viewingProfile.displayName?.[0]?.toUpperCase() || "U"}
                      </span>
                    )}
                  </div>
                  <div
                    className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-4 border-card shadow-lg ${
                      viewingProfile.status === "online"
                        ? "bg-green-500"
                        : viewingProfile.status === "away"
                          ? "bg-yellow-500"
                          : viewingProfile.status === "busy"
                            ? "bg-red-500"
                            : "bg-gray-500"
                    }`}
                  />
                </div>

                {/* User Info */}
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-1">
                    <h1 className="truncate text-3xl font-bold">
                      {viewingProfile.displayName}
                    </h1>
                    {viewingProfile.owner && (
                      <Crown className="mb-2 h-7 w-7 shrink-0 text-yellow-500" />
                    )}
                    {viewingProfile.contributor && (
                      <Hammer className="mb-2 h-7 w-7 shrink-0 text-orange-500" />
                    )}
                    {viewingProfile.verified && (
                      <BadgeCheck className="mb-2 h-7 w-7 shrink-0 text-blue-500" />
                    )}
                  </div>

                  {/* Level Badge & Status - only show if not private */}
                  {!viewingProfile.private && (
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5">
                        <Star className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-primary">
                          Level {viewingProfile.level}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${
                            viewingProfile.status === "online"
                              ? "bg-green-500"
                              : viewingProfile.status === "away"
                                ? "bg-yellow-500"
                                : viewingProfile.status === "busy"
                                  ? "bg-red-500"
                                  : "bg-gray-500"
                          }`}
                        />
                        <span className="capitalize">
                          {viewingProfile.status === "online"
                            ? t("ascend.status.online")
                            : viewingProfile.status === "away"
                              ? t("ascend.status.away")
                              : viewingProfile.status === "busy"
                                ? t("ascend.status.busy")
                                : t("ascend.status.offline")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Bio - only show if not private */}
                  {!viewingProfile.private && viewingProfile.bio && (
                    <p className="mb-4 max-w-lg text-muted-foreground">
                      {viewingProfile.bio}
                    </p>
                  )}

                  {/* Country & Socials - only show if not private */}
                  {!viewingProfile.private && (
                    <div className="flex flex-wrap items-center gap-3">
                      {viewingProfile.country && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Globe className="h-4 w-4 text-blue-500" />
                          <span>{viewingProfile.country}</span>
                        </div>
                      )}
                      {viewingProfile.socials?.linkedDiscord && (
                        <div className="flex items-center gap-1.5 rounded-lg bg-[#5865F2]/10 px-2.5 py-1 text-sm">
                          <svg
                            className="h-4 w-4 text-[#5865F2]"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                          </svg>
                          <span>{viewingProfile.socials.linkedDiscord}</span>
                        </div>
                      )}
                      {viewingProfile.socials?.epicId && (
                        <div className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-2.5 py-1 text-sm">
                          <Gamepad2 className="h-4 w-4" />
                          <span>{viewingProfile.socials.epicId}</span>
                        </div>
                      )}
                      {viewingProfile.socials?.github && (
                        <div className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-2.5 py-1 text-sm">
                          <Github className="h-4 w-4" />
                          <span>{viewingProfile.socials.github}</span>
                        </div>
                      )}
                      {viewingProfile.socials?.steam && (
                        <div className="flex items-center gap-1.5 rounded-lg bg-[#1b2838]/10 px-2.5 py-1 text-sm">
                          <Gamepad2 className="h-4 w-4" />
                          <span>{viewingProfile.socials.steam}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex shrink-0 gap-2">
                  {(() => {
                    const status = getRelationshipStatus(viewingProfile.uid);
                    if (status === "friend") {
                      return (
                        <Button
                          variant="outline"
                          onClick={() => handleStartConversation(viewingProfile.uid)}
                          className="gap-2"
                        >
                          <MessageCircle className="h-4 w-4" />
                          {t("ascend.profile.message") || "Message"}
                        </Button>
                      );
                    } else if (status === "requestSent") {
                      return (
                        <Button variant="outline" className="gap-2" disabled>
                          <Clock className="h-4 w-4 text-amber-500" />
                          {t("ascend.friends.requestPending") || "Pending"}
                        </Button>
                      );
                    } else if (status === "requestReceived") {
                      return (
                        <Button variant="outline" className="gap-2" disabled>
                          <Inbox className="h-4 w-4 text-blue-500" />
                          {t("ascend.friends.requestReceived") || "Request Received"}
                        </Button>
                      );
                    } else {
                      return (
                        <Button
                          onClick={() => handleSendRequest(viewingProfile.uid)}
                          className="gap-2 text-secondary"
                        >
                          <UserPlus className="h-4 w-4" />
                          {t("ascend.friends.addFriend")}
                        </Button>
                      );
                    }
                  })()}

                  {/* Report User Button */}
                  <AlertDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <form
                        onSubmit={e => {
                          e.preventDefault();
                          handleSubmitUserReport();
                        }}
                      >
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-2xl font-bold text-foreground">
                            {t("ascend.report.title") || "Report User"}:{" "}
                            {viewingProfile.displayName}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                {t("ascend.report.reason") || "Reason"}
                              </label>
                              <Select
                                value={reportUserReason}
                                onValueChange={setReportUserReason}
                              >
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={
                                      t("ascend.report.selectReason") || "Select a reason"
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inappropriate-content">
                                    {t("ascend.report.reasons.inappropriateContent") ||
                                      "Inappropriate Content"}
                                  </SelectItem>
                                  <SelectItem value="harassment">
                                    {t("ascend.report.reasons.harassment") ||
                                      "Harassment"}
                                  </SelectItem>
                                  <SelectItem value="spam">
                                    {t("ascend.report.reasons.spam") || "Spam"}
                                  </SelectItem>
                                  <SelectItem value="impersonation">
                                    {t("ascend.report.reasons.impersonation") ||
                                      "Impersonation"}
                                  </SelectItem>
                                  <SelectItem value="other">
                                    {t("ascend.report.reasons.other") || "Other"}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                {t("ascend.report.details") || "Details"}
                              </label>
                              <Textarea
                                placeholder={
                                  t("ascend.report.detailsPlaceholder") ||
                                  "Please provide more details about your report..."
                                }
                                value={reportUserDetails}
                                onChange={e => setReportUserDetails(e.target.value)}
                                className="min-h-[100px]"
                              />
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter className="mt-4 gap-2">
                          <AlertDialogCancel
                            className="text-primary"
                            onClick={() => {
                              setReportUserReason("");
                              setReportUserDetails("");
                            }}
                          >
                            {t("common.cancel") || "Cancel"}
                          </AlertDialogCancel>
                          <Button
                            type="submit"
                            className="text-secondary"
                            disabled={isReportingUser}
                          >
                            {isReportingUser ? (
                              <>
                                <Loader className="mr-2 h-4 w-4 animate-spin" />
                                {t("ascend.report.submitting") || "Submitting..."}
                              </>
                            ) : (
                              t("ascend.report.submit") || "Submit Report"
                            )}
                          </Button>
                        </AlertDialogFooter>
                      </form>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid - only show if not private */}
          {!viewingProfile.private && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <p className="text-2xl font-bold">
                  {Math.floor(viewingProfile.totalPlaytime / 3600)}h
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("ascend.profile.totalPlaytime") || "Total Playtime"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                    <Gamepad2 className="h-5 w-5 text-violet-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{viewingProfile.gamesPlayed}</p>
                <p className="text-sm text-muted-foreground">
                  {t("ascend.profile.gamesPlayed") || "Games Played"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                    <Trophy className="h-5 w-5 text-amber-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold">
                  {viewingProfile.unlockedAchievements ||
                    viewingProfile.achievements?.reduce(
                      (acc, game) =>
                        acc +
                        (game.unlockedAchievements ||
                          game.achievements?.filter(a => a.achieved)?.length ||
                          0),
                      0
                    ) ||
                    0}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("ascend.profile.achievements") || "Achievements"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                    <Star className="h-5 w-5 text-emerald-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold">
                  {viewingProfile.xp?.toLocaleString() || 0}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("ascend.profile.totalXP") || "Total XP"}
                </p>
              </div>
            </div>
          )}

          {/* Top Games - only show if not private */}
          {!viewingProfile.private && viewingProfile.games?.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
              <div className="flex items-center justify-between border-b border-border/50 p-5">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">
                    {t("ascend.profile.topGames") || "Top Games"}
                  </h2>
                </div>
                <span className="text-sm text-muted-foreground">
                  {viewingProfile.games.length} games
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {viewingProfile.games
                  .sort((a, b) => (b.playTime || 0) - (a.playTime || 0))
                  .slice(0, 5)
                  .map((game, index) => (
                    <div
                      key={game.name}
                      className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 text-lg font-bold text-primary">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{game.name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.floor((game.playTime || 0) / 3600)}h{" "}
                            {Math.floor(((game.playTime || 0) % 3600) / 60)}m
                          </span>
                          {game.achievementStats && (
                            <span className="flex items-center gap-1">
                              <Trophy className="h-3 w-3" />
                              {game.achievementStats.unlocked}/
                              {game.achievementStats.total}
                            </span>
                          )}
                        </div>
                      </div>
                      {game.achievementStats && (
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {game.achievementStats.percentage}%
                          </p>
                          <p className="text-xs text-muted-foreground">complete</p>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Recent Achievements - only show if not private */}
          {!viewingProfile.private &&
            viewingProfile.achievements?.some(g =>
              g.achievements?.some(a => a.achieved)
            ) && (
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
                <div className="flex items-center gap-2 border-b border-border/50 p-5">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  <h2 className="font-semibold">
                    {t("ascend.profile.recentAchievements") || "Recent Achievements"}
                  </h2>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {viewingProfile.achievements
                      .flatMap(game =>
                        (game.achievements || [])
                          .filter(a => a.achieved)
                          .map(a => ({ ...a, gameName: game.gameName }))
                      )
                      .slice(0, 6)
                      .map((achievement, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 rounded-xl bg-muted/30 p-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                            <Award className="h-5 w-5 text-amber-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {achievement.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {achievement.gameName}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

          {/* Empty state if no games */}
          {(!viewingProfile.games || viewingProfile.games.length === 0) && (
            <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                <Gamepad2 className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <h3 className="mb-1 text-lg font-semibold">
                {t("ascend.profile.noGames") || "No games yet"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("ascend.profile.noGamesHint") ||
                  "This user hasn't synced their library yet"}
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
