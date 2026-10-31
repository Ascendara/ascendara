import { useState } from "react";
import ProfileImage, { getInitial } from "@/components/ProfileImage";
import { EmptyState, Panel } from "./primitives";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  Loader2,
  ChevronRight,
  Search,
  UserPlus,
  UserX,
  Clock,
  Gamepad2,
  LockIcon,
  Globe,
  UserCheck,
  Inbox,
  Star,
} from "lucide-react";
import EarnedBadges from "@/components/EarnedBadges";

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
            className="h-11 rounded-xl border-border/50 bg-card/60 pl-12"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={isSearching || !searchQuery.trim()}
          className="h-11 rounded-xl px-6 text-secondary"
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

      {/* Search Results */}
      {isSearching ? (
        <div role="status" aria-label={t("ascend.search.search")} className="space-y-3">
          {[0, 1, 2].map(index => (
            <div
              key={index}
              className="flex animate-pulse items-center gap-4 rounded-2xl bg-card/60 p-5 shadow motion-reduce:animate-none"
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
        <div className="space-y-2">
          <p className="px-1 text-xs text-muted-foreground">
            {t("ascend.search.resultsCount", { count: searchResults.length })}
          </p>
          <Panel as="ul" className="divide-y divide-border/40 overflow-hidden">
            {searchResults.map((result, index) => (
              <motion.li
                key={result.uid}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.2) }}
                className="group relative transition-colors focus-within:bg-muted/30 hover:bg-muted/30"
              >
                <div className="relative w-full px-4 py-3 text-left">
                  <div className="relative flex flex-wrap items-center gap-4">
                    {/* Avatar with status */}
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary">
                        <ProfileImage
                          src={result.photoURL}
                          className="h-full w-full object-cover"
                          fallback={
                            <span className="text-primary-foreground text-base font-semibold">
                              {getInitial(result.displayName)}
                            </span>
                          }
                        />
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
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
                        <h3 className="min-w-0 truncate text-sm font-semibold">
                          <button
                            type="button"
                            onClick={() => handleViewProfile(result.uid)}
                            className="text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-primary"
                          >
                            {result.displayName}
                          </button>
                        </h3>
                        <EarnedBadges user={result} className="h-4 w-4" />
                        {result.private && (
                          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <LockIcon className="h-3 w-3" />
                            {t("ascend.profile.private") || "Private"}
                          </span>
                        )}
                      </div>

                      {/* Bio */}
                      {!result.private && result.bio && (
                        <p className="mb-1 line-clamp-1 text-xs text-muted-foreground">
                          {result.bio}
                        </p>
                      )}

                      {/* Stats Row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        {!result.private && result.level > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Star className="h-3.5 w-3.5" />
                            <span>
                              {t("ascend.profile.level", { defaultValue: "Level" })}{" "}
                              {result.level}
                            </span>
                          </div>
                        )}
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
                              className="rounded-xl"
                              disabled
                            >
                              <UserCheck className="mr-2 h-4 w-4" />
                              {t("ascend.friends.friends") || "Friends"}
                            </Button>
                          );
                        } else if (status === "requestSent") {
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              disabled
                            >
                              <Clock className="mr-2 h-4 w-4" />
                              {t("ascend.friends.requestPending") || "Pending"}
                            </Button>
                          );
                        } else if (status === "requestReceived") {
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              disabled
                            >
                              <Inbox className="mr-2 h-4 w-4" />
                              {t("ascend.friends.requestReceived") || "Request Received"}
                            </Button>
                          );
                        } else if (result.preventFriendRequests) {
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              disabled
                            >
                              <UserX className="mr-2 h-4 w-4" />
                              {t("ascend.friends.notAcceptingRequests") ||
                                "Not Accepting Requests"}
                            </Button>
                          );
                        } else {
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
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
              </motion.li>
            ))}
          </Panel>
        </div>
      ) : submittedQuery !== null ? (
        <EmptyState
          icon={Search}
          title={t("ascend.search.noResultsTitle")}
          description={t("ascend.search.noResults")}
        />
      ) : (
        <EmptyState
          icon={Users}
          title={t("ascend.search.startSearching")}
          description={t("ascend.search.hint")}
        />
      )}
    </div>
  );
}
