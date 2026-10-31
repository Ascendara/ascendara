import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionHeader from "./SectionHeader";
import { EmptyState } from "./primitives";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Bell,
  Bookmark,
  CheckCheck,
  ChevronDown,
  Heart,
  Loader,
  MessageSquareReply,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  disputePlaytimeFlag,
  listMemberNotifications,
  listPlaytimeFlags,
} from "@/services/firebase/firebaseService";
import {
  getWishlistMatches,
  WISHLIST_MATCHES_EVENT,
} from "@/services/ascend/wishlistWatchService";
import {
  markNotificationsSeen,
  notificationKeys,
  readNotificationState,
  setNotificationsArchived,
} from "@/services/ascend/ascendNotificationBadgeService";
import gameService from "@/services/games/gameService";
import { useAuth } from "@/context/AuthContext";

const formatHours = seconds => `${(Math.max(0, seconds || 0) / 3600).toFixed(1)}h`;

function PlaytimeFlagCard({ t, flag, onReport }) {
  const daily = flag.kind === "daily";
  const games = flag.items.map(item => item.game).join(", ");
  const reason = flag.items[0]?.reason;
  const reviewed = flag.status !== "flagged" && flag.status !== "disputed";

  return (
    <div className="rounded-2xl bg-yellow-500/5 p-6">
      <div className="flex items-start gap-3">
        <Timer className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-relaxed">
            {t(`ascend.notifications.playtime.${daily ? "daily" : "ledger"}`, {
              hours: formatHours(daily ? flag.dailySeconds : flag.droppedSeconds),
            })}
            {games && <span className="text-muted-foreground"> · {games}</span>}
          </p>
          {reason && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t(`ascend.notifications.playtime.reasons.${reason}`, {
                defaultValue: reason,
              })}
            </p>
          )}

          {flag.response && (
            <div className="mt-3 rounded-xl bg-primary/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <MessageSquareReply className="h-3.5 w-3.5" />
                {t("ascend.notifications.playtime.response")}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{flag.response}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>—</span>
              <span className="font-medium">
                {t("ascend.notifications.playtime.author")}
              </span>
              {flag.flaggedAt && (
                <>
                  <span>•</span>
                  <span>{new Date(flag.flaggedAt).toLocaleDateString()}</span>
                </>
              )}
              {(flag.dispute || reviewed) && (
                <>
                  <span>•</span>
                  <span>{t(`ascend.notifications.playtime.status.${flag.status}`)}</span>
                </>
              )}
            </div>
            {!flag.dispute && !reviewed && (
              <Button variant="outline" size="sm" onClick={() => onReport(flag)}>
                {t("ascend.notifications.playtime.report")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewLikeCard({ t, notification }) {
  return (
    <div className="rounded-2xl bg-red-500/5 p-6">
      <div className="flex items-start gap-3">
        <Heart className="mt-0.5 h-4 w-4 shrink-0 fill-red-500 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-relaxed">
            {t(
              notification.gameName
                ? "ascend.notifications.reviewLike.message"
                : "ascend.notifications.reviewLike.messageNoGame",
              { name: notification.liker, game: notification.gameName }
            )}
          </p>
          {notification.createdAt && (
            <p className="mt-3 text-xs text-muted-foreground">
              {new Date(notification.createdAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function WishlistMatchCard({ t, match }) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);

  const openGame = async () => {
    setOpening(true);
    const game = await gameService.findGameByGameID(match.gameID).catch(() => null);
    setOpening(false);
    if (!game) {
      toast.error(t("ascend.wishlist.gameMissing"));
      return;
    }
    navigate("/download", {
      state: { gameData: { ...game, download_links: game.download_links || {} } },
    });
  };

  return (
    <div className="rounded-2xl bg-primary/5 p-6">
      <div className="flex items-start gap-3">
        <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-relaxed">
            {t("ascend.wishlist.nowAvailable", { game: match.name })}
          </p>
          {match.matchedAt && (
            <p className="mt-3 text-xs text-muted-foreground">
              {new Date(match.matchedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={opening}
          onClick={openGame}
        >
          {opening ? (
            <Loader className="h-3.5 w-3.5 animate-spin" />
          ) : (
            t("ascend.wishlist.view")
          )}
        </Button>
      </div>
    </div>
  );
}

function ReportFlagDialog({ t, flag, onClose, onReported }) {
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!flag) setDetails("");
  }, [flag]);

  const handleSubmit = async () => {
    if (sending || !details.trim()) return;
    setSending(true);
    const result = await disputePlaytimeFlag(flag.id, "other", details.trim());
    setSending(false);
    if (result.error) {
      toast.error(t("ascend.notifications.playtime.failed"), {
        description: result.error,
      });
      return;
    }
    toast.success(t("ascend.notifications.playtime.sent"));
    onReported(result.flag);
  };

  return (
    <Dialog open={!!flag} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-5"
          onSubmit={e => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("ascend.notifications.playtime.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("ascend.notifications.playtime.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-[120px] text-foreground"
            value={details}
            maxLength={2000}
            onChange={e => setDetails(e.target.value)}
            placeholder={t("ascend.notifications.playtime.placeholder")}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="text-primary"
              onClick={onClose}
            >
              {t("ascend.notifications.playtime.cancel")}
            </Button>
            <Button
              type="submit"
              className="text-secondary"
              disabled={sending || !details.trim()}
            >
              {sending ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  {t("ascend.notifications.playtime.sending")}
                </>
              ) : (
                t("ascend.notifications.playtime.submit")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnnouncementCard({ notification }) {
  return (
    <div className="rounded-2xl bg-card/60 p-6 shadow transition-colors hover:bg-card">
      <p className="pr-8 text-sm leading-relaxed">{notification.message}</p>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span>—</span>
        <span className="font-medium">{notification.author}</span>
        {notification.timestamp && (
          <>
            <span>•</span>
            <span>{new Date(toTime(notification.timestamp)).toLocaleDateString()}</span>
          </>
        )}
      </div>
    </div>
  );
}

// Firestore timestamps, ISO strings and epoch numbers all show up here
function toTime(value) {
  const time = new Date(value?.toDate?.() ?? value ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

// Before this device has any saved state, only the last two weeks count as new
const FRESH_MS = 14 * 24 * 60 * 60 * 1000;

function ArchivableItem({ t, item, archived, onArchive }) {
  const label = t(
    archived ? "ascend.notifications.restore" : "ascend.notifications.archive"
  );
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="group relative"
    >
      {item.node}
      <button
        type="button"
        onClick={() => onArchive([item.key], !archived)}
        title={label}
        aria-label={label}
        className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        {archived ? (
          <ArchiveRestore className="h-4 w-4" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
      </button>
    </motion.div>
  );
}

// A titled list; with onToggle it becomes a dropdown that starts closed
function NotificationGroup({
  t,
  title,
  items,
  archived,
  onArchive,
  open,
  onToggle,
  action,
}) {
  if (!items.length) return null;
  const collapsible = typeof onToggle === "function";
  const expanded = !collapsible || open;
  return (
    <section className="space-y-3">
      <div className="flex min-h-8 items-center gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`}
            />
            {title}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
              {items.length}
            </span>
          </button>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {title}
          </p>
        )}
        {action && expanded && <div className="ml-auto">{action}</div>}
      </div>
      <AnimatePresence initial={false}>
        {expanded &&
          items.map(item => (
            <ArchivableItem
              key={item.key}
              t={t}
              item={item}
              archived={archived}
              onArchive={onArchive}
            />
          ))}
      </AnimatePresence>
    </section>
  );
}

function GroupAction({ icon: Icon, label, onClick }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 text-xs text-muted-foreground"
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

export default function NotificationsSection({ t, loadingNotifications, notifications }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [flags, setFlags] = useState(null);
  const [memberNotifications, setMemberNotifications] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [wishlistMatches, setWishlistMatches] = useState(getWishlistMatches);
  const [archivedKeys, setArchivedKeys] = useState(
    () => (uid && readNotificationState(uid)?.archived) || new Set()
  );
  // What was unseen when the section opened stays "New" while it is open,
  // even though opening it marks everything as seen right away
  const [seenAtOpen] = useState(() => (uid ? readNotificationState(uid)?.seen : null));
  const [showEarlier, setShowEarlier] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const refresh = () => setWishlistMatches(getWishlistMatches());
    window.addEventListener(WISHLIST_MATCHES_EVENT, refresh);
    return () => window.removeEventListener(WISHLIST_MATCHES_EVENT, refresh);
  }, []);

  useEffect(() => {
    listPlaytimeFlags().then(result => setFlags(result.flags || []));
    listMemberNotifications().then(result =>
      setMemberNotifications(result.notifications || [])
    );
  }, []);

  const handleReported = updated => {
    setFlags(current => current.map(flag => (flag.id === updated.id ? updated : flag)));
    setReporting(null);
  };

  const loaded = !loadingNotifications && flags !== null && memberNotifications !== null;

  const items = useMemo(() => {
    if (!loaded) return [];
    return [
      ...flags.map(flag => ({
        key: notificationKeys.flag(flag),
        at: toTime(flag.flaggedAt),
        node: <PlaytimeFlagCard t={t} flag={flag} onReport={setReporting} />,
      })),
      ...wishlistMatches.map(match => ({
        key: notificationKeys.wishlist(match),
        at: toTime(match.matchedAt),
        node: <WishlistMatchCard t={t} match={match} />,
      })),
      ...memberNotifications
        .filter(notification => notification.kind === "reviewLike")
        .map(notification => ({
          key: notificationKeys.member(notification),
          at: toTime(notification.createdAt),
          node: <ReviewLikeCard t={t} notification={notification} />,
        })),
      ...notifications.map(notification => ({
        key: notificationKeys.announcement(notification),
        at: toTime(notification.timestamp),
        node: <AnnouncementCard notification={notification} />,
      })),
    ].sort((a, b) => b.at - a.at);
  }, [loaded, flags, wishlistMatches, memberNotifications, notifications, t]);

  // Opening the section clears the badge for everything it shows
  useEffect(() => {
    if (!uid || !loaded) return;
    markNotificationsSeen(
      uid,
      items.map(item => item.key)
    );
  }, [uid, loaded, items]);

  const isNew = item =>
    seenAtOpen ? !seenAtOpen.has(item.key) : item.at > Date.now() - FRESH_MS;
  const active = items.filter(item => !archivedKeys.has(item.key));
  const fresh = active.filter(isNew);
  const earlier = active.filter(item => !isNew(item));
  const archived = items.filter(item => archivedKeys.has(item.key));

  const handleArchive = (keys, archive) => {
    if (!uid || !keys.length) return;
    setNotificationsArchived(uid, keys, archive);
    setArchivedKeys(readNotificationState(uid)?.archived || new Set());
  };

  return (
    <div className="mb-24 space-y-6">
      <SectionHeader
        icon={Bell}
        title={t("ascend.notifications.title")}
        description={t("ascend.notifications.subtitle", {
          defaultValue: "Stay updated with important announcements and updates",
        })}
      />

      {!loaded ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-primary" />
          </div>
          <p className="mt-6 text-muted-foreground">
            {t("ascend.notifications.loading") || "Loading notifications..."}
          </p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t("ascend.notifications.empty")}
          description={t("ascend.notifications.emptyDescription")}
        />
      ) : (
        <div className="space-y-8">
          {fresh.length > 0 ? (
            <NotificationGroup
              t={t}
              title={t("ascend.notifications.new")}
              items={fresh}
              onArchive={handleArchive}
              action={
                <GroupAction
                  icon={Archive}
                  label={t("ascend.notifications.archiveAll")}
                  onClick={() =>
                    handleArchive(
                      fresh.map(item => item.key),
                      true
                    )
                  }
                />
              }
            />
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-card/40 p-5 text-sm text-muted-foreground shadow">
              <CheckCheck className="h-4 w-4 shrink-0 text-primary" />
              {t("ascend.notifications.caughtUp")}
            </div>
          )}

          <NotificationGroup
            t={t}
            title={t("ascend.notifications.earlier")}
            items={earlier}
            onArchive={handleArchive}
            open={showEarlier}
            onToggle={() => setShowEarlier(open => !open)}
            action={
              <GroupAction
                icon={Archive}
                label={t("ascend.notifications.archiveAll")}
                onClick={() =>
                  handleArchive(
                    earlier.map(item => item.key),
                    true
                  )
                }
              />
            }
          />

          <NotificationGroup
            t={t}
            title={t("ascend.notifications.archived")}
            items={archived}
            archived
            onArchive={handleArchive}
            open={showArchived}
            onToggle={() => setShowArchived(open => !open)}
            action={
              <GroupAction
                icon={ArchiveRestore}
                label={t("ascend.notifications.restoreAll")}
                onClick={() =>
                  handleArchive(
                    archived.map(item => item.key),
                    false
                  )
                }
              />
            }
          />
        </div>
      )}

      <ReportFlagDialog
        t={t}
        flag={reporting}
        onClose={() => setReporting(null)}
        onReported={handleReported}
      />
    </div>
  );
}
