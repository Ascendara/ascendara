import SectionHeader from "./SectionHeader";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Users,
  Eye,
  EyeOff,
  Circle,
  Moon,
  Loader2,
  Search,
  MessageCircle,
  UserPlus,
  UserMinus,
  Crown,
  BadgeCheck,
  Hammer,
} from "lucide-react";

export default function FriendsSection({
  friends,
  t,
  setActiveSection,
  loadingFriends,
  handleViewProfile,
  handleStartConversation,
  handleRemoveFriend,
}) {
  const onlineFriends = friends.filter(f => f.status === "online");
  const awayFriends = friends.filter(f => f.status === "away");
  const busyFriends = friends.filter(f => f.status === "busy");
  const offlineFriends = friends.filter(
    f => !["online", "away", "busy"].includes(f.status)
  );
  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Users}
        title={t("ascend.friends.title")}
        description={t("ascend.friends.subtitle", {
          defaultValue: "Connect and play with your friends",
        })}
        actions={
          <Button
            onClick={() => setActiveSection("search")}
            className="gap-2 rounded-xl text-secondary"
          >
            <UserPlus className="h-4 w-4" />
            {t("ascend.friends.addFriend")}
          </Button>
        }
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{friends.length}</p>
              <p className="text-xs text-muted-foreground">
                {t("ascend.friends.totalFriends") || "Total Friends"}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <Circle className="h-5 w-5 fill-green-500 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{onlineFriends.length}</p>
              <p className="text-xs text-muted-foreground">
                {t("ascend.friends.online") || "Online"}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
              <Moon className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{awayFriends.length}</p>
              <p className="text-xs text-muted-foreground">
                {t("ascend.friends.away") || "Away"}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-500/10">
              <EyeOff className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{offlineFriends.length}</p>
              <p className="text-xs text-muted-foreground">
                {t("ascend.friends.offline") || "Offline"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {loadingFriends ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : friends.length > 0 ? (
        <div className="space-y-4">
          {/* Online Friends Section */}
          {onlineFriends.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("ascend.friends.onlineNow") || "Online Now"} ({onlineFriends.length})
                </h3>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {onlineFriends.map(friend => (
                  <motion.div
                    key={friend.uid}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group relative overflow-hidden rounded-xl border border-green-500/20 bg-gradient-to-r from-green-500/5 to-transparent p-4 transition-all hover:border-green-500/40 hover:shadow-lg hover:shadow-green-500/5"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleViewProfile(friend.uid, "friends")}
                        className="relative shrink-0"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 ring-2 ring-green-500/30 transition-all group-hover:ring-green-500/50">
                          {friend.photoURL ? (
                            <img
                              src={friend.photoURL}
                              alt={friend.displayName}
                              className="h-full w-full rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-primary-foreground text-lg font-bold">
                              {friend.displayName?.[0]?.toUpperCase() || "U"}
                            </span>
                          )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-green-500" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => handleViewProfile(friend.uid, "friends")}
                          className="block text-left"
                        >
                          <p className="flex items-center gap-1 truncate font-semibold transition-colors hover:text-primary">
                            {friend.displayName}
                            {friend.owner && (
                              <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                            )}
                            {friend.contributor && (
                              <Hammer className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                            )}
                            {friend.verified && (
                              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                            )}
                          </p>
                        </button>
                        <p className="truncate text-xs text-green-600 dark:text-green-400">
                          {friend.customMessage || t("ascend.status.online")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => handleViewProfile(friend.uid, "friends")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => handleStartConversation(friend.uid)}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="hover:text-destructive h-8 w-8 text-muted-foreground"
                          onClick={() => handleRemoveFriend(friend.uid)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Away/Busy Friends Section */}
          {(awayFriends.length > 0 || busyFriends.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("ascend.friends.awayOrBusy") || "Away / Busy"} (
                  {awayFriends.length + busyFriends.length})
                </h3>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {[...awayFriends, ...busyFriends].map(friend => (
                  <motion.div
                    key={friend.uid}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group relative overflow-hidden rounded-xl border border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-transparent p-4 transition-all hover:border-yellow-500/40 hover:shadow-lg hover:shadow-yellow-500/5"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleViewProfile(friend.uid, "friends")}
                        className="relative shrink-0"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 ring-2 ring-yellow-500/30 transition-all group-hover:ring-yellow-500/50">
                          {friend.photoURL ? (
                            <img
                              src={friend.photoURL}
                              alt={friend.displayName}
                              className="h-full w-full rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-primary-foreground text-lg font-bold">
                              {friend.displayName?.[0]?.toUpperCase() || "U"}
                            </span>
                          )}
                        </div>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${friend.status === "busy" ? "bg-red-500" : "bg-yellow-500"}`}
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => handleViewProfile(friend.uid, "friends")}
                          className="block text-left"
                        >
                          <p className="flex items-center gap-1 truncate font-semibold transition-colors hover:text-primary">
                            {friend.displayName}
                            {friend.owner && (
                              <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                            )}
                            {friend.contributor && (
                              <Hammer className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                            )}
                            {friend.verified && (
                              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                            )}
                          </p>
                        </button>
                        <p className="truncate text-xs text-yellow-600 dark:text-yellow-400">
                          {friend.customMessage ||
                            (friend.status === "busy"
                              ? t("ascend.status.busy")
                              : t("ascend.status.away"))}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => handleViewProfile(friend.uid, "friends")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => handleStartConversation(friend.uid)}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="hover:text-destructive h-8 w-8 text-muted-foreground"
                          onClick={() => handleRemoveFriend(friend.uid)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Offline Friends Section */}
          {offlineFriends.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="h-2 w-2 rounded-full bg-gray-500" />
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("ascend.friends.offlineSection") || "Offline"} (
                  {offlineFriends.length})
                </h3>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {offlineFriends.map(friend => (
                  <motion.div
                    key={friend.uid}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/30 p-4 transition-all hover:border-border hover:bg-card/50"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleViewProfile(friend.uid, "friends")}
                        className="relative shrink-0"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted/70 opacity-75 transition-all group-hover:opacity-100">
                          {friend.photoURL ? (
                            <img
                              src={friend.photoURL}
                              alt={friend.displayName}
                              className="h-full w-full rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-lg font-bold text-muted-foreground">
                              {friend.displayName?.[0]?.toUpperCase() || "U"}
                            </span>
                          )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-gray-500" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => handleViewProfile(friend.uid, "friends")}
                          className="block text-left"
                        >
                          <p className="flex items-center gap-1 truncate font-semibold text-muted-foreground transition-colors hover:text-foreground">
                            {friend.displayName}
                            {friend.owner && (
                              <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                            )}
                            {friend.contributor && (
                              <Hammer className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                            )}
                            {friend.verified && (
                              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                            )}
                          </p>
                        </button>
                        <p className="truncate text-xs text-muted-foreground/70">
                          {t("ascend.status.offline")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => handleViewProfile(friend.uid, "friends")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => handleStartConversation(friend.uid)}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="hover:text-destructive h-8 w-8 text-muted-foreground"
                          onClick={() => handleRemoveFriend(friend.uid)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{t("ascend.friends.empty")}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {t("ascend.friends.emptyHint")}
          </p>
          <Button
            className="mt-6 gap-2 text-secondary"
            onClick={() => setActiveSection("search")}
          >
            <Search className="h-4 w-4" />
            {t("ascend.friends.findFriends")}
          </Button>
        </div>
      )}
    </div>
  );
}
