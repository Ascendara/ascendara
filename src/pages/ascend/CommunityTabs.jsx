import { motion } from "framer-motion";
import { Users, UserPlus, Search, Trophy } from "lucide-react";

export const COMMUNITY_SECTIONS = ["friends", "requests", "search", "leaderboard"];

export default function CommunityTabs({ t, activeSection, setActiveSection, requestCount }) {
  const tabs = [
    { id: "friends", icon: Users, label: t("ascend.nav.friends") },
    { id: "requests", icon: UserPlus, label: t("ascend.nav.requests"), badge: requestCount },
    { id: "search", icon: Search, label: t("ascend.nav.findPeople") },
    { id: "leaderboard", icon: Trophy, label: t("ascend.nav.leaderboard") },
  ];

  return (
    <div
      role="tablist"
      aria-label={t("ascend.nav.community")}
      className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border/50 bg-card/50 p-1"
    >
      {tabs.map(tab => {
        const isActive = activeSection === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveSection(tab.id)}
            className={`relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="community-tab"
                className="absolute inset-0 rounded-lg bg-primary/10"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
            <tab.icon className="relative h-4 w-4" />
            <span className="relative">{tab.label}</span>
            {tab.badge > 0 && (
              <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-secondary">
                {tab.badge > 99 ? "99+" : tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
