import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  Loader2,
  ChevronRight,
  Search,
  UserPlus,
  Clock,
  Gamepad2,
  LockIcon,
  Globe,
  Crown,
  BadgeCheck,
  Hammer,
  UserCheck,
  Inbox,
} from "lucide-react";

export default function SearchSection({
  t,
  handleSearch,
  searchQuery,
  setSearchQuery,
  isSearching,
  searchResults,
  handleViewProfile,
  getRelationshipStatus,
  handleSendRequest,
}) {
  return (
    <div className="mb-20 space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card/95 to-card/90 p-6">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 backdrop-blur-sm">
              <Search className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("ascend.search.title")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("ascend.search.subtitle") || "Find and connect with other players"}
              </p>
            </div>
          </div>

          {/* Search Form */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex gap-3"
          >
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("ascend.search.placeholder")}
                className="h-12 rounded-xl border-border/50 bg-background/50 pl-12 text-base"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="h-12 rounded-xl px-6 text-secondary"
            >
              {isSearching ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  {t("ascend.search.search")}
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 ? (
        <div className="space-y-3">
          <p className="px-1 text-sm text-muted-foreground">
            {t("ascend.search.resultsCount", { count: searchResults.length }) ||
              `${searchResults.length} users found`}
          </p>
          {searchResults.map((result, index) => (
            <motion.div
              key={result.uid}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-all duration-300 hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
            >
              {/* Background glow on hover */}
              <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/5 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />

              <div
                onClick={() => handleViewProfile(result.uid)}
                className="w-full cursor-pointer p-5 text-left"
              >
                <div className="relative flex items-start gap-4">
                  {/* Avatar with status */}
                  <div className="relative shrink-0">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 shadow-lg shadow-primary/20">
                      {result.photoURL ? (
                        <img
                          src={result.photoURL}
                          alt={result.displayName}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-primary-foreground text-xl font-bold">
                          {result.displayName?.[0]?.toUpperCase() || "U"}
                        </span>
                      )}
                    </div>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card shadow-sm ${
                        result.status === "online"
                          ? "bg-green-500"
                          : result.status === "away"
                            ? "bg-yellow-500"
                            : result.status === "busy"
                              ? "bg-red-500"
                              : "bg-gray-500"
                      }`}
                    />
                  </div>

                  {/* User Info */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="truncate text-lg font-semibold">
                        {result.displayName}
                      </h3>
                      {result.owner && (
                        <Crown className="h-5 w-5 shrink-0 text-yellow-500" />
                      )}
                      {result.contributor && (
                        <Hammer className="h-5 w-5 shrink-0 text-orange-500" />
                      )}
                      {result.verified && (
                        <BadgeCheck className="h-5 w-5 shrink-0 text-blue-500" />
                      )}
                      {!result.private && result.level > 1 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Lv. {result.level}
                        </span>
                      )}
                      {result.private && (
                        <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">
                          <LockIcon className="h-3 w-3" />
                          {t("ascend.profile.private") || "Private"}
                        </span>
                      )}
                    </div>

                    {/* Bio */}
                    {!result.private && result.bio && (
                      <p className="mb-2 line-clamp-1 text-sm text-muted-foreground">
                        {result.bio}
                      </p>
                    )}

                    {/* Stats Row */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            result.status === "online"
                              ? "bg-green-500"
                              : result.status === "away"
                                ? "bg-yellow-500"
                                : result.status === "busy"
                                  ? "bg-red-500"
                                  : "bg-gray-500"
                          }`}
                        />
                        <span className="capitalize">
                          {result.status === "online"
                            ? t("ascend.status.online")
                            : result.status === "away"
                              ? t("ascend.status.away")
                              : result.status === "busy"
                                ? t("ascend.status.busy")
                                : t("ascend.status.offline")}
                        </span>
                      </div>
                      {!result.private && result.totalPlaytime > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{Math.floor(result.totalPlaytime / 3600)}h played</span>
                        </div>
                      )}
                      {!result.private && result.gamesPlayed > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Gamepad2 className="h-3.5 w-3.5" />
                          <span>{result.gamesPlayed} games</span>
                        </div>
                      )}
                      {!result.private && result.country && (
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5" />
                          <span>{result.country}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex shrink-0 items-center gap-2">
                    {(() => {
                      const status = getRelationshipStatus(result.uid);
                      if (status === "friend") {
                        return (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
                            disabled
                          >
                            <UserCheck className="mr-2 h-4 w-4 text-green-500" />
                            {t("ascend.friends.friends") || "Friends"}
                          </Button>
                        );
                      } else if (status === "requestSent") {
                        return (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
                            disabled
                          >
                            <Clock className="mr-2 h-4 w-4 text-amber-500" />
                            {t("ascend.friends.requestPending") || "Pending"}
                          </Button>
                        );
                      } else if (status === "requestReceived") {
                        return (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
                            disabled
                          >
                            <Inbox className="mr-2 h-4 w-4 text-blue-500" />
                            {t("ascend.friends.requestReceived") || "Request Received"}
                          </Button>
                        );
                      } else {
                        return (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={e => {
                              e.stopPropagation();
                              handleSendRequest(result.uid);
                            }}
                          >
                            <UserPlus className="mr-2 h-4 w-4" />
                            {t("ascend.friends.addFriend")}
                          </Button>
                        );
                      }
                    })()}
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : searchQuery && !isSearching ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-border/50 bg-card/50 p-12 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
            <Search className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="mb-1 text-lg font-semibold">
            {t("ascend.search.noResultsTitle") || "No users found"}
          </h3>
          <p className="text-sm text-muted-foreground">{t("ascend.search.noResults")}</p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-12 text-center"
        >
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/10 to-violet-500/10">
            <Users className="h-10 w-10 text-primary/50" />
          </div>
          <h3 className="mb-1 text-lg font-semibold">
            {t("ascend.search.startSearching") || "Start searching"}
          </h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {t("ascend.search.hint")}
          </p>
        </motion.div>
      )}
    </div>
  );
}
