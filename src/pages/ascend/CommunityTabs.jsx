import { motion } from "framer-motion";
import { Users, Search, Trophy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const COMMUNITY_SECTIONS = ["friends", "search", "leaderboard"];

// The one header every Community tab shares: the page title, a shortcut to
// find people, and the tabs. Friend requests live on the Friends tab, so its
// tab carries their count.
export default function CommunityTabs({
  t,
  activeSection,
  setActiveSection,
  requestCount,
}) {
  const tabs = [
    { id: "friends", icon: Users, label: t("ascend.nav.friends"), badge: requestCount },
    { id: "search", icon: Search, label: t("ascend.nav.findPeople") },
    { id: "leaderboard", icon: Trophy, label: t("ascend.nav.leaderboard") },
  ];

  return (
    <header className="mb-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("ascend.nav.community")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("ascend.community.description")}
          </p>
        </div>
        {activeSection !== "search" && (
          <Button
            onClick={() => setActiveSection("search")}
            className="gap-2 rounded-xl text-secondary"
          >
            <UserPlus className="h-4 w-4" />
            {t("ascend.friends.addFriend")}
          </Button>
        )}
      </div>

      <div
        role="tablist"
        aria-label={t("ascend.nav.community")}
        className="flex gap-1 overflow-x-auto rounded-xl bg-card/50 p-1 shadow"
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
    </header>
  );
}
