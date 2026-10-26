import SectionHeader from "./SectionHeader";
import { EmptyState, Panel, StatStrip } from "./primitives";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Users,
  User,
  Eye,
  Circle,
  Moon,
  EyeOff,
  Loader2,
  Search,
  MessageCircle,
  UserPlus,
  UserMinus,
} from "lucide-react";
import EarnedBadges, {
  ContributorBadge,
  OwnerBadge,
  VerifiedBadge,
} from "@/components/EarnedBadges";

const STATUS_DOT = {
  online: "bg-green-500",
  away: "bg-yellow-500",
  busy: "bg-red-500",
  offline: "bg-gray-400",
};

function FriendRow({ friend, status, t, onView, onMessage, onRemove }) {
  const isOffline = status === "offline";
  const subtitle = isOffline
    ? t("ascend.status.offline")
    : friend.customMessage || t(`ascend.status.${status}`);

  return (
    <li className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      <button
        onClick={onView}
        className="relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={friend.displayName}
      >
        <span
          className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full ${
            isOffline ? "bg-muted" : "bg-primary"
          }`}
        >
          {friend.photoURL ? (
            <>
              <img
                src={friend.photoURL}
                alt=""
                onError={event => {
                  event.currentTarget.style.display = "none";
                  event.currentTarget.nextElementSibling?.classList.remove("hidden");
                }}
                className={`h-full w-full object-cover ${isOffline ? "opacity-70" : ""}`}
                referrerPolicy="no-referrer"
              />
              <User className="hidden h-5 w-5 text-secondary" aria-hidden="true" />
            </>
          ) : (
            <User
              className={`h-5 w-5 ${isOffline ? "text-muted-foreground" : "text-secondary"}`}
              aria-hidden="true"
            />
          )}
        </span>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${STATUS_DOT[status]}`}
        />
      </button>

      <button onClick={onView} className="min-w-0 flex-1 text-left outline-none">
        <p
          className={`flex items-center gap-1 truncate text-sm font-medium transition-colors group-hover:text-foreground ${
            isOffline ? "text-muted-foreground" : ""
          }`}
        >
          {friend.displayName}
          {friend.owner && <OwnerBadge className="h-3.5 w-3.5" />}
          {friend.contributor && <ContributorBadge className="h-3.5 w-3.5" />}
          {friend.verified && <VerifiedBadge className="h-3.5 w-3.5" />}
          <EarnedBadges user={friend} className="h-3.5 w-3.5" />
        </p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </button>

      <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={onView}
          aria-label={t("ascend.friends.viewProfile", { defaultValue: "View profile" })}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={onMessage}
          aria-label={t("ascend.profile.message")}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-red-500"
          onClick={onRemove}
          aria-label={t("ascend.friends.remove", { defaultValue: "Remove friend" })}
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

export default function FriendsSection({
  friends,
  t,
  setActiveSection,
  loadingFriends,
  handleViewProfile,
  handleStartConversation,
  handleRemoveFriend,
}) {
  const statusOf = friend =>
    ["online", "away", "busy"].includes(friend.status) ? friend.status : "offline";
  const onlineFriends = friends.filter(f => statusOf(f) === "online");
  const awayFriends = friends.filter(f => ["away", "busy"].includes(statusOf(f)));
  const offlineFriends = friends.filter(f => statusOf(f) === "offline");

  const groups = [
    { id: "online", label: t("ascend.friends.onlineNow"), list: onlineFriends },
    { id: "away", label: t("ascend.friends.awayOrBusy"), list: awayFriends },
    { id: "offline", label: t("ascend.friends.offlineSection"), list: offlineFriends },
  ].filter(group => group.list.length > 0);

  return (
    <div className="mb-24 space-y-6">
      <SectionHeader
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

      {loadingFriends ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : friends.length > 0 ? (
        <>
          <StatStrip
            stats={[
              {
                icon: Users,
                label: t("ascend.friends.totalFriends"),
                value: friends.length,
              },
              {
                icon: Circle,
                label: t("ascend.friends.online"),
                value: onlineFriends.length,
              },
              { icon: Moon, label: t("ascend.friends.away"), value: awayFriends.length },
              {
                icon: EyeOff,
                label: t("ascend.friends.offline"),
                value: offlineFriends.length,
              },
            ]}
          />

          <div className="space-y-5">
            {groups.map((group, index) => (
              <motion.section
                key={group.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="space-y-2"
              >
                <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[group.id]}`} />
                  {group.label}
                  <span className="font-normal normal-case tracking-normal">
                    {group.list.length}
                  </span>
                </h2>
                <Panel as="ul" className="divide-y divide-border/40 overflow-hidden">
                  {group.list.map(friend => (
                    <FriendRow
                      key={friend.uid}
                      friend={friend}
                      status={statusOf(friend)}
                      t={t}
                      onView={() => handleViewProfile(friend.uid, "friends")}
                      onMessage={() => handleStartConversation(friend.uid)}
                      onRemove={() => handleRemoveFriend(friend.uid)}
                    />
                  ))}
                </Panel>
              </motion.section>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Users}
          title={t("ascend.friends.empty")}
          description={t("ascend.friends.emptyHint")}
          action={
            <Button
              className="gap-2 text-secondary"
              onClick={() => setActiveSection("search")}
            >
              <Search className="h-4 w-4" />
              {t("ascend.friends.findFriends")}
            </Button>
          }
        />
      )}
    </div>
  );
}
