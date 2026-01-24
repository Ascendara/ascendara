import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Search,
  Users,
  MessageCircle,
  UserPlus,
  Settings,
  Bell,
  Sparkles,
  Circle,
  Moon,
  MinusCircle,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Clock,
  CreditCard,
  CloudIcon,
  BadgeCheck,
  Crown,
  Hammer,
  BadgeDollarSign,
  Trophy,
  Rocket,
  Gamepad2,
  HardDrive,
  UsersRound,
} from "lucide-react";
import { updateUserStatus, getUserStatus } from "@/services/firebaseService";
import { toast } from "sonner";

const AscendSidebar = ({
  activeSection,
  onSectionChange,
  user,
  userData,
  onStatusChange,
  ascendAccess,
  onSubscribe,
}) => {
  const { t } = useTranslation();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [currentStatus, setCurrentStatus] = useState("online");
  const [customMessage, setCustomMessage] = useState("");

  // Use server-verified access data
  const trialDaysRemaining =
    ascendAccess?.isSubscribed || ascendAccess?.isVerified
      ? -1
      : (ascendAccess?.daysRemaining ?? 7);

  const statusOptions = [
    {
      id: "online",
      icon: Circle,
      color: "bg-green-500",
      label: t("ascend.status.online"),
    },
    { id: "away", icon: Moon, color: "bg-yellow-500", label: t("ascend.status.away") },
    {
      id: "busy",
      icon: MinusCircle,
      color: "bg-red-500",
      label: t("ascend.status.busy"),
    },
    {
      id: "invisible",
      icon: EyeOff,
      color: "bg-gray-500",
      label: t("ascend.status.invisible"),
    },
  ];

  // Load custom message on mount (status is managed by ascendStatusService)
  // Don't override status here - ascendStatusService sets it to online on app open
  useEffect(() => {
    if (user?.uid) {
      const timeout = setTimeout(() => {
        getUserStatus(user.uid).then(result => {
          if (result.data) {
            // Only load custom message, don't override status
            // Status is managed by ascendStatusService which sets it to online on app open
            setCustomMessage(result.data.customMessage || "");

            // Only use fetched status if it's a valid user-chosen status (not offline from API timeout)
            const validStatuses = ["online", "away", "busy"];
            const fetchedStatus = result.data.status;
            if (fetchedStatus && validStatuses.includes(fetchedStatus)) {
              setCurrentStatus(fetchedStatus);
              if (onStatusChange) {
                onStatusChange(fetchedStatus);
              }
            } else {
              // Default to online if status is offline (from API timeout) or invalid
              setCurrentStatus("online");
              if (onStatusChange) {
                onStatusChange("online");
              }
            }
          }
        });
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [user?.uid]);

  const handleStatusChange = async status => {
    const result = await updateUserStatus(status, customMessage);
    if (result.success) {
      setCurrentStatus(status);
      setShowStatusMenu(false);
      toast.success(t("ascend.status.updated"));
      // Notify parent component
      if (onStatusChange) {
        onStatusChange(status);
      }
    } else {
      toast.error(result.error);
    }
  };

  const getStatusColor = () => {
    const status = statusOptions.find(s => s.id === currentStatus);
    return status?.color || "bg-green-500";
  };

  // Expandable section states
  const [expandedSections, setExpandedSections] = useState({
    cloud: true,
  });

  const toggleSection = section => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Quick access items (icon grid at top)
  const quickAccessItems = [
    { id: "home", icon: Home, label: t("ascend.nav.home") },
    { id: "friends", icon: Users, label: t("ascend.nav.friends"), badge: 0 },
    { id: "requests", icon: UserPlus, label: t("ascend.nav.requests"), badge: 0 },
    { id: "messages", icon: MessageCircle, label: t("ascend.nav.messages"), badge: 0 },
  ];

  // Cloud section items
  const cloudItems = [
    {
      id: "cloudlibrary",
      icon: Gamepad2,
      label: t("ascend.nav.cloudLibrary") || "Cloud Library",
    },
    {
      id: "cloudbackups",
      icon: HardDrive,
      label: t("ascend.nav.cloudBackups") || "Cloud Backups",
    },
  ];

  // Main nav items (list below)
  const mainNavItems = [
    { id: "search", icon: Search, label: t("ascend.nav.search") },
    {
      id: "community",
      icon: UsersRound,
      label: t("ascend.nav.community") || "Community",
    },
    {
      id: "premium",
      icon: Crown,
      label: t("ascend.nav.premium") || "Premium Features",
    },
    {
      id: "leaderboard",
      icon: Trophy,
      label: t("ascend.nav.leaderboard") || "Leaderboard",
    },
    {
      id: "upcoming",
      icon: Rocket,
      label: t("ascend.nav.upcoming") || "Upcoming Update",
    },
    { id: "notifications", icon: Bell, label: t("ascend.nav.notifications"), badge: 0 },
    { id: "settings", icon: Settings, label: t("ascend.nav.settings") },
  ];

  // Quick access icon button
  const QuickAccessButton = ({ item, isActive }) => (
    <motion.button
      onClick={() => onSectionChange(item.id)}
      className={`group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 ${
        isActive
          ? "bg-primary shadow-lg shadow-primary/25"
          : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={item.label}
    >
      <item.icon
        className={`h-5 w-5 transition-colors duration-300 ${isActive ? "text-secondary" : ""}`}
      />
      {item.badge > 0 && (
        <span className="absolute -right-1 -top-1 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      )}
    </motion.button>
  );

  const NavButton = ({ item, isActive }) => (
    <button
      onClick={() => onSectionChange(item.id)}
      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 ${
        isActive
          ? "text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      <div className="flex w-full items-center gap-3 transition-all duration-150 ease-out group-hover:translate-x-0.5 group-active:translate-x-0 group-active:scale-[0.97]">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
            isActive ? "bg-primary/20" : "group-hover:bg-muted"
          }`}
        >
          <item.icon className={`mb-1 h-4 w-4 ${isActive ? "text-primary" : ""}`} />
        </div>
        <span className="mb-1 hidden text-sm font-medium lg:block">{item.label}</span>
        {item.badge > 0 && (
          <span className="text-primary-foreground mb-1 ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </div>
    </button>
  );

  // Get the index of active item in mainNavItems for the sliding indicator
  const activeNavIndex = mainNavItems.findIndex(item => item.id === activeSection);

  return (
    <div className="flex h-full w-16 shrink-0 flex-col overflow-hidden bg-background/60 backdrop-blur-xl lg:w-60">
      {/* Quick Access Grid */}
      <div className="shrink-0 p-3 pb-2">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {quickAccessItems.map(item => (
            <QuickAccessButton
              key={item.id}
              item={item}
              isActive={activeSection === item.id}
            />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-border/50" />

      {/* Main Navigation List */}
      <nav className="relative flex-1 space-y-1 overflow-y-auto p-3">
        {/* Cloud Section */}
        <div className="mb-2">
          <button
            onClick={() => toggleSection("cloud")}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              <CloudIcon className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{t("ascend.nav.cloud") || "Cloud"}</span>
            </div>
            {expandedSections.cloud ? (
              <ChevronUp className="hidden h-3.5 w-3.5 lg:block" />
            ) : (
              <ChevronDown className="hidden h-3.5 w-3.5 lg:block" />
            )}
          </button>
          <AnimatePresence initial={false}>
            {expandedSections.cloud && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-1 space-y-0.5 pl-1">
                  {cloudItems.map(item => (
                    <NavButton
                      key={item.id}
                      item={item}
                      isActive={activeSection === item.id}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="mx-2 my-2 h-px bg-border/30" />

        {/* Main nav items */}
        {mainNavItems.map(item => (
          <NavButton key={item.id} item={item} isActive={activeSection === item.id} />
        ))}
      </nav>

      {/* Trial/Subscription/Verified Status */}
      <div className="shrink-0 px-3 pb-2">
        {ascendAccess?.isVerified ? (
          // Verified user - show verified status
          <div className="rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 p-3">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-blue-500" />
              <span className="hidden text-xs font-medium text-blue-600 dark:text-blue-400 lg:block">
                {t("ascend.subscription.verified")}
              </span>
              <span className="text-xs font-bold text-blue-500 lg:hidden">
                {t("ascend.subscription.verifiedShort")}
              </span>
            </div>
          </div>
        ) : ascendAccess?.isSubscribed ? (
          // Subscribed user - show active status
          <div className="rounded-xl border border-green-500/30 bg-gradient-to-r from-green-500/20 to-emerald-500/20 p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-green-500" />
              <span className="hidden text-xs font-medium text-green-600 lg:block">
                {t("ascend.subscription.active")}
              </span>
              <span className="text-xs font-bold text-green-500 lg:hidden">Pro</span>
            </div>
          </div>
        ) : (
          // Trial user
          <div
            className={`rounded-xl p-3 ${
              trialDaysRemaining <= 3
                ? "border border-amber-500/30 bg-gradient-to-r from-amber-500/20 to-orange-500/20"
                : "border border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5"
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock
                className={`h-4 w-4 ${trialDaysRemaining <= 3 ? "text-amber-500" : "text-primary"}`}
              />
              <span className="hidden text-xs font-medium lg:block">
                {trialDaysRemaining > 0
                  ? t("ascend.subscription.trialDays", { days: trialDaysRemaining })
                  : t("ascend.subscription.trialExpired")}
              </span>
              <span className="text-xs font-bold lg:hidden">{trialDaysRemaining}d</span>
            </div>
            {trialDaysRemaining <= 3 && (
              <button
                onClick={onSubscribe}
                className="text-primary-foreground mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-primary/90"
              >
                <BadgeDollarSign className="h-3 w-3" />
                <span className="hidden lg:inline">
                  {t("ascend.subscription.upgrade")}
                </span>
                <span className="lg:hidden">{t("ascend.subscription.upgradeShort")}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* User section at bottom */}
      <div className="relative shrink-0 p-3 pt-0">
        {/* Status Menu Popup */}
        <AnimatePresence>
          {showStatusMenu && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-xl border border-border/50 bg-card/95 shadow-xl backdrop-blur-xl"
            >
              <div className="p-2">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("ascend.status.setStatus")}
                </p>
                {statusOptions.map(status => (
                  <button
                    key={status.id}
                    onClick={() => handleStatusChange(status.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50 ${
                      currentStatus === status.id ? "bg-muted/30" : ""
                    }`}
                  >
                    <div className={`h-3 w-3 rounded-full ${status.color}`} />
                    <span className="text-sm">{status.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Button */}
        <button
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className="flex w-full items-center gap-3 rounded-xl bg-muted/30 p-2 transition-colors hover:bg-muted/50"
        >
          <div className="relative shrink-0">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/70">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-primary-foreground text-sm font-bold">
                  {user?.displayName?.[0]?.toUpperCase() || "U"}
                </span>
              )}
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${getStatusColor()}`}
            />
          </div>
          <div className="hidden min-w-0 flex-1 text-left lg:block">
            <p className="flex items-center gap-1 truncate text-sm font-medium">
              {user?.displayName || "User"}
              {userData?.owner && (
                <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              )}
              {userData?.contributor && (
                <Hammer className="h-3.5 w-3.5 shrink-0 text-orange-500" />
              )}
              {userData?.verified && (
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              )}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {statusOptions.find(s => s.id === currentStatus)?.label ||
                t("ascend.status.online")}
            </p>
          </div>
          <ChevronUp
            className={`hidden h-4 w-4 text-muted-foreground transition-transform lg:block ${showStatusMenu ? "" : "rotate-180"}`}
          />
        </button>
      </div>
    </div>
  );
};

export default AscendSidebar;
