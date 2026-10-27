import { useEffect, useState } from "react";
import SectionHeader from "./SectionHeader";
import { EmptyState } from "./primitives";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Bell, Loader, MessageSquareReply, Timer } from "lucide-react";
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
  listPlaytimeFlags,
} from "@/services/firebase/firebaseService";

const formatHours = seconds => `${(Math.max(0, seconds || 0) / 3600).toFixed(1)}h`;

function PlaytimeFlagCard({ t, flag, onReport }) {
  const daily = flag.kind === "daily";
  const games = flag.items.map(item => item.game).join(", ");
  const reason = flag.items[0]?.reason;
  const reviewed = flag.status !== "flagged" && flag.status !== "disputed";

  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6">
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
            <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
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

export default function NotificationsSection({ t, loadingNotifications, notifications }) {
  const [flags, setFlags] = useState([]);
  const [reporting, setReporting] = useState(null);

  useEffect(() => {
    listPlaytimeFlags().then(result => setFlags(result.flags));
  }, []);

  const handleReported = updated => {
    setFlags(current => current.map(flag => (flag.id === updated.id ? updated : flag)));
    setReporting(null);
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

      {loadingNotifications ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-primary" />
          </div>
          <p className="mt-6 text-muted-foreground">
            {t("ascend.notifications.loading") || "Loading notifications..."}
          </p>
        </div>
      ) : notifications.length === 0 && flags.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t("ascend.notifications.empty")}
          description={t("ascend.notifications.emptyDescription")}
        />
      ) : (
        <div className="space-y-3">
          {flags.map(flag => (
            <PlaytimeFlagCard key={flag.id} t={t} flag={flag} onReport={setReporting} />
          ))}
          {notifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 8) * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-6 transition-all hover:border-primary/30 hover:bg-card"
            >
              <div className="relative">
                <p className="text-sm leading-relaxed">{notification.message}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>—</span>
                  <span className="font-medium">{notification.author}</span>
                  {notification.timestamp && (
                    <>
                      <span>•</span>
                      <span>{new Date(notification.timestamp).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
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
