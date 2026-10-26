import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  MessageCircle,
  Settings,
  Smartphone,
  Bell,
  Flag,
  Clock,
  BadgeCheck,
  Crown,
  BadgeDollarSign,
  Rocket,
  Gamepad2,
  HardDrive,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { subscribeToUserStatus } from "@/services/firebase/firebaseService";
import { setUserOnlineStatus } from "@/services/ascend/ascendStatusService";
import { toast } from "sonner";
import DiscordIcon from "@/pages/ascend/DiscordIcon";
import EarnedBadges, {
  ContributorBadge,
  OwnerBadge,
  VerifiedBadge,
} from "@/components/EarnedBadges";

const DiscordOutlineIcon = props => <DiscordIcon {...props} outline />;

// Friends, requests, people search and the leaderboard share one tabbed
// Community page, so they count as a single destination here
const COMMUNITY_SECTIONS = [
  "friends",
  "requests",
  "search",
  "leaderboard",
  "userProfile",
];

const AscendNavBar = ({
  activeSection,
  onSectionChange,
  user,
  userData,
  onStatusChange,
  ascendAccess,
  onSubscribe,
  badges = {},
}) => {
  const { t } = useTranslation();
  const [currentStatus, setCurrentStatus] = useState("online");
  const [customMessage, setCustomMessage] = useState("");

  // Use server-verified access data
  const trialDaysRemaining =
    ascendAccess?.isSubscribed || ascendAccess?.isVerified
      ? -1
      : (ascendAccess?.daysRemaining ?? 7);

  const statusOptions = [
    { id: "online", color: "bg-green-500", label: t("ascend.status.online") },
    { id: "away", color: "bg-yellow-500", label: t("ascend.status.away") },
    { id: "busy", color: "bg-red-500", label: t("ascend.status.busy") },
    { id: "invisible", color: "bg-gray-500", label: t("ascend.status.invisible") },
  ];

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeToUserStatus(user.uid, data => {
      if (!data) return;
      setCustomMessage(data.customMessage || "");
      const status = data.status === "offline" ? "invisible" : data.status;
      setCurrentStatus(status || "online");
      onStatusChange?.(status || "online");
    });
  }, [user?.uid, onStatusChange]);

  const handleStatusChange = async status => {
    const result = await setUserOnlineStatus(status, customMessage);
    if (result.success) {
      setCurrentStatus(status);
      toast.success(t("ascend.status.updated"));
      onStatusChange?.(status);
    } else {
      toast.error(result.error);
    }
  };

  const currentStatusOption =
    statusOptions.find(s => s.id === currentStatus) || statusOptions[0];

  const navItems = [
    { id: "home", icon: LayoutDashboard, label: t("ascend.nav.overview") },
    { id: "cloudlibrary", icon: Gamepad2, label: t("ascend.nav.cloudLibrary") },
    { id: "cloudbackups", icon: HardDrive, label: t("ascend.nav.cloudBackups") },
    { id: "companion", icon: Smartphone, label: t("ascend.nav.companion") },
    {
      id: "friends",
      icon: Users,
      label: t("ascend.nav.community"),
      badge: badges.requests,
      matches: COMMUNITY_SECTIONS,
    },
    { id: "discord", icon: DiscordOutlineIcon, label: t("ascend.nav.discord") },
    {
      id: "messages",
      icon: MessageCircle,
      label: t("ascend.nav.messages"),
      badge: badges.messages,
    },
  ];

  const menuItems = [
    { id: "premium", icon: Crown, label: t("ascend.nav.premium") },
    { id: "notifications", icon: Bell, label: t("ascend.nav.notifications") },
    { id: "reports", icon: Flag, label: t("ascend.nav.reports") },
    { id: "settings", icon: Settings, label: t("ascend.nav.settings") },
  ];

  const isItemActive = item => (item.matches || [item.id]).includes(activeSection);

  const planTitle = ascendAccess?.isVerified
    ? t("ascend.subscription.verified")
    : ascendAccess?.isSubscribed
      ? t("ascend.subscription.active")
      : trialDaysRemaining > 0
        ? t("ascend.subscription.trialDays", { days: trialDaysRemaining })
        : t("ascend.subscription.trialExpired");

  const planChip = ascendAccess?.isVerified
    ? {
        icon: BadgeCheck,
        label: t("ascend.subscription.verifiedLabel"),
        title: planTitle,
        className: "border-blue-500/30 bg-blue-500/10 text-blue-500",
      }
    : ascendAccess?.isSubscribed
      ? null
      : {
          icon: Clock,
          label: `${Math.max(trialDaysRemaining, 0)}d`,
          title: planTitle,
          className:
            trialDaysRemaining <= 3
              ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
              : "border-primary/20 bg-primary/10 text-primary",
        };
  const showUpgrade =
    !ascendAccess?.isVerified && !ascendAccess?.isSubscribed && trialDaysRemaining <= 3;

  return (
    <header className="shrink-0 px-4 pt-[52px] sm:px-6 lg:px-10">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 rounded-2xl border border-border/50 bg-card/60 px-2 shadow-sm backdrop-blur-xl">
        {/* Primary destinations; inactive tabs collapse to icons on narrow windows */}
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item, index) => {
            const isActive = isItemActive(item);
            return (
              <div key={item.id} className="flex shrink-0 items-center">
                {index === 4 && <div className="mx-1.5 h-5 w-px bg-border/50" />}
                <button
                  onClick={() => onSectionChange(item.id)}
                  data-tour={`ascend-${item.id}`}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  title={item.label}
                  className={`relative flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="ascend-nav-active"
                      className="absolute inset-0 rounded-xl bg-primary/10"
                      transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    />
                  )}
                  <item.icon className="relative h-4 w-4 shrink-0" />
                  <span
                    className={`relative whitespace-nowrap ${isActive ? "" : "hidden xl:inline"}`}
                  >
                    {item.label}
                  </span>
                  {item.badge > 0 && (
                    <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-secondary">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        {/* Account area */}
        <div className="flex shrink-0 items-center gap-1.5">
          {showUpgrade ? (
            <button
              onClick={onSubscribe}
              title={planChip.title}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-secondary transition-colors hover:bg-primary/90"
            >
              <BadgeDollarSign className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t("ascend.subscription.upgradeShort")}
              </span>
              <span className="opacity-80">· {planChip.label}</span>
            </button>
          ) : planChip ? (
            <button
              onClick={() => onSectionChange("premium")}
              title={planChip.title}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-opacity hover:opacity-80 ${planChip.className}`}
            >
              <planChip.icon className="h-3.5 w-3.5" />
              {planChip.label}
            </button>
          ) : null}

          <button
            onClick={() => onSectionChange("upcoming")}
            data-tour="ascend-upcoming"
            aria-label={t("ascend.nav.upcoming")}
            title={t("ascend.nav.upcoming")}
            className={`flex h-9 w-9 items-center justify-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
              activeSection === "upcoming"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Rocket className="h-4 w-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-tour="ascend-account"
                className="flex items-center gap-1.5 rounded-xl p-1 pr-2 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="relative shrink-0">
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/70">
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-sm font-bold text-secondary">
                        {user?.displayName?.[0]?.toUpperCase() || "U"}
                      </span>
                    )}
                  </span>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${currentStatusOption.color}`}
                  />
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <p className="flex items-center gap-1 truncate text-sm font-semibold">
                  {user?.displayName || "User"}
                  {userData?.owner && <OwnerBadge className="h-3.5 w-3.5" />}
                  {userData?.contributor && <ContributorBadge className="h-3.5 w-3.5" />}
                  {userData?.verified && <VerifiedBadge className="h-3.5 w-3.5" />}
                  <EarnedBadges user={userData} className="h-3.5 w-3.5" />
                </p>
                <p className="truncate text-xs text-muted-foreground">{planTitle}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("ascend.status.setStatus")}
              </DropdownMenuLabel>
              {statusOptions.map(status => (
                <DropdownMenuItem
                  key={status.id}
                  onSelect={() => handleStatusChange(status.id)}
                  className="gap-3"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${status.color}`} />
                  <span className="flex-1">{status.label}</span>
                  {currentStatus === status.id && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {menuItems.map(item => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => onSectionChange(item.id)}
                  className="gap-3"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default AscendNavBar;
