import SectionHeader from "./SectionHeader";
import { EmptyState } from "./primitives";
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
            <div className="h-20 w-20 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-primary" />
          </div>
          <p className="mt-6 text-muted-foreground">
            {t("ascend.notifications.loading") || "Loading notifications..."}
          </p>
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t("ascend.notifications.empty")}
          description={t("ascend.notifications.emptyDescription")}
        />
      ) : (
        <div className="space-y-3">
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
    </div>
  );
}
