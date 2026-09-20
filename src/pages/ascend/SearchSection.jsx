import { useState } from "react";
import SectionHeader from "./SectionHeader";
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
  const [submittedQuery, setSubmittedQuery] = useState(null);
  return (
    <div className="mb-20 space-y-6">
      <SectionHeader
        icon={Search}
        title={t("ascend.search.title")}
        description={t("ascend.search.subtitle", {
          defaultValue: "Find and connect with other players",
        })}
      >
        <form
          onSubmit={e => {
            e.preventDefault();
            if (isSearching || !searchQuery.trim()) return;
            setSubmittedQuery(searchQuery.trim());
            handleSearch();
          }}
          className="flex flex-wrap gap-3"
        >
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("ascend.search.placeholder")}
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
      </SectionHeader>

      {/* Search Results */}
      {isSearching ? (
        <div role="status" aria-label={t("ascend.search.search")} className="space-y-3">
          {[0, 1, 2].map(index => (
            <div
              key={index}
              className="flex animate-pulse items-center gap-4 rounded-2xl border border-border/50 bg-card/50 p-5 motion-reduce:animate-none"
            >
              <div className="h-12 w-12 rounded-xl bg-muted" />
              <div className="flex-1 space-y-3">
                <div className="h-4 w-1/3 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      ) : searchResults.length > 0 ? (
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
              transition={{ delay: Math.min(index * 0.03, 0.2) }}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-colors hover:border-primary/30 hover:bg-card focus-within:border-primary/40"
            >
              {/* Background glow on hover */}
              <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/5 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />

              <div className="relative w-full p-5 text-left">
                <div className="relative flex flex-wrap items-center gap-4">
                  {/* Avatar with status */}
                  <div className="relative shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 ring-1 ring-border/50">
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
                  <div className="min-w-0 flex-1 basis-40">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="min-w-0 truncate text-base font-semibold">
                        <button
                          type="button"
                          onClick={() => handleViewProfile(result.uid)}
                          className="text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-primary"
                        >
                          {result.displayName}
                        </button>
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
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
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
                  <div className="relative z-10 flex shrink-0 items-center gap-2">
                    {(() => {
                      const status = getRelationshipStatus(result.uid);
                      if (status === "friend") {
                        return (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl bg-background/50"
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
                            className="rounded-xl bg-background/50"
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
                            className="rounded-xl bg-background/50"
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
                            className="rounded-xl bg-background/50"
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
      ) : submittedQuery !== null ? (
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
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
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
