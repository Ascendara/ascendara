import SectionHeader from "./SectionHeader";
import { motion } from "framer-motion";
import { Bell } from "lucide-react";

export default function NotificationsSection({ t, loadingNotifications, notifications }) {
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
            <div className="h-20 w-20 rounded-full border-4 border-blue-500/20" />
            <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-blue-500" />
          </div>
          <p className="mt-6 text-muted-foreground">
            {t("ascend.notifications.loading") || "Loading notifications..."}
          </p>
        </div>
      ) : notifications.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-2xl border border-border/50 bg-card/50 py-20"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
            <Bell className="h-10 w-10 text-muted-foreground/50" />
          </div>
          <h3 className="mt-6 text-lg font-semibold">
            {t("ascend.notifications.empty")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("ascend.notifications.emptyDescription") ||
              "You're all caught up! Check back later for new updates."}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-blue-500/30 hover:bg-card hover:shadow-lg hover:shadow-blue-500/5"
            >
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition-all group-hover:bg-blue-500/20" />
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
    </div>
  );
}
