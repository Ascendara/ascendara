import { useState } from "react";
import { EmptyState, Panel } from "./primitives";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  User,
  Eye,
  Loader2,
  Search,
  MessageCircle,
  UserMinus,
  Check,
  X,
  ChevronDown,
} from "lucide-react";
import EarnedBadges from "@/components/EarnedBadges";

const STATUS_DOT = {
  online: "bg-green-500",
  away: "bg-yellow-500",
  busy: "bg-red-500",
  offline: "bg-gray-400",
};

const statusOf = friend =>
  ["online", "away", "busy"].includes(friend.status) ? friend.status : "offline";

// Which statuses each filter chip and list group covers
const STATUS_GROUPS = {
  online: ["online"],
  away: ["away", "busy"],
  offline: ["offline"],
};

function GroupHeading({ dot, label, count }) {
  return (
    <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
      {label}
      <span className="font-normal normal-case tracking-normal">{count}</span>
    </h2>
  );
}

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
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`truncate text-sm font-medium transition-colors group-hover:text-foreground ${
              isOffline ? "text-muted-foreground" : ""
            }`}
          >
            {friend.displayName}
          </span>
          <EarnedBadges user={friend} className="h-3.5 w-3.5" />
        </span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
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

function RequestRow({ name, subtitle, index, children }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      className="flex items-center gap-3 px-4 py-3"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-secondary">
        {name?.[0]?.toUpperCase() || "U"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </motion.li>
  );
}

// Requests waiting on you, with sent ones folded away below them. Nothing is
// drawn when there are none either way.
function FriendRequests({ t, incoming, outgoing, onAccept, onDeny }) {
  const [showSent, setShowSent] = useState(false);
  if (!incoming.length && !outgoing.length) return null;

  return (
    <section className="space-y-2">
      <GroupHeading label={t("ascend.requests.title")} count={incoming.length} />
      <Panel className="overflow-hidden">
        {incoming.length > 0 ? (
          <ul className="divide-y divide-border/40">
            {incoming.map((request, index) => (
              <RequestRow
                key={request.id}
                index={index}
                name={request.fromDisplayName}
                subtitle={t("ascend.requests.wantsToAdd")}
              >
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-secondary"
                  onClick={() => onAccept(request.id, request.fromUid)}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("ascend.requests.accept")}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  onClick={() => onDeny(request.id)}
                  aria-label={t("ascend.requests.deny", { defaultValue: "Decline" })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </RequestRow>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            {t("ascend.requests.empty")}
          </p>
        )}

        {outgoing.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowSent(value => !value)}
              aria-expanded={showSent}
              className="flex w-full items-center gap-2 border-t border-border/40 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              {t("ascend.requests.sentCount", { count: outgoing.length })}
              <ChevronDown
                className={`ml-auto h-4 w-4 transition-transform ${showSent ? "rotate-180" : ""}`}
              />
            </button>
            {showSent && (
              <ul className="divide-y divide-border/40 border-t border-border/40 bg-muted/10">
                {outgoing.map((request, index) => (
                  <RequestRow
                    key={request.id}
                    index={index}
                    name={request.toDisplayName}
                    subtitle={t("ascend.requests.pending")}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => onDeny(request.id)}
                    >
                      {t("ascend.requests.cancel")}
                    </Button>
                  </RequestRow>
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>
    </section>
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
  incomingRequests,
  outgoingRequests,
  loadingRequests,
  handleAcceptRequest,
  handleDenyRequest,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const needle = query.trim().toLowerCase();
  const matching = needle
    ? friends.filter(friend => friend.displayName?.toLowerCase().includes(needle))
    : friends;
  const inGroup = (list, id) =>
    list.filter(friend => STATUS_GROUPS[id].includes(statusOf(friend)));

  const groups = [
    { id: "online", label: t("ascend.friends.onlineNow") },
    { id: "away", label: t("ascend.friends.awayOrBusy") },
    { id: "offline", label: t("ascend.friends.offlineSection") },
  ]
    .filter(group => filter === "all" || filter === group.id)
    .map(group => ({ ...group, list: inGroup(matching, group.id) }))
    .filter(group => group.list.length > 0);

  const chips = [
    { id: "all", label: t("ascend.friends.filterAll"), count: friends.length },
    { id: "online", label: t("ascend.friends.online"), dot: STATUS_DOT.online },
    { id: "away", label: t("ascend.friends.away"), dot: STATUS_DOT.away },
    { id: "offline", label: t("ascend.friends.offline"), dot: STATUS_DOT.offline },
  ].map(chip => ({ ...chip, count: chip.count ?? inGroup(friends, chip.id).length }));

  return (
    <div className="mb-24 space-y-6">
      {!loadingRequests && (
        <FriendRequests
          t={t}
          incoming={incomingRequests}
          outgoing={outgoingRequests}
          onAccept={handleAcceptRequest}
          onDeny={handleDenyRequest}
        />
      )}

      {loadingFriends ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : friends.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("ascend.friends.filterPlaceholder")}
                placeholder={t("ascend.friends.filterPlaceholder")}
                className="h-9 rounded-xl border-border/50 bg-card/60 pl-9"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {chips.map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilter(chip.id)}
                  aria-pressed={filter === chip.id}
                  className={`flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
                    filter === chip.id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/50 bg-card/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {chip.dot && <span className={`h-2 w-2 rounded-full ${chip.dot}`} />}
                  {chip.label}
                  <span className="tabular-nums opacity-70">{chip.count}</span>
                </button>
              ))}
            </div>
          </div>

          {groups.length > 0 ? (
            <div className="space-y-5">
              {groups.map((group, index) => (
                <motion.section
                  key={group.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="space-y-2"
                >
                  <GroupHeading
                    dot={STATUS_DOT[group.id]}
                    label={group.label}
                    count={group.list.length}
                  />
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
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("ascend.friends.noMatches")}
            </p>
          )}
        </section>
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
