import ProfileSettingsCard from "./settings/ProfileSettingsCard";
import ProfileImage, { getInitial } from "@/components/ProfileImage";
import PrivacySettingsCard from "./settings/PrivacySettingsCard";
import ReviewCardSettingsCard from "./settings/ReviewCardSettingsCard";
import SubscriptionSettingsCard from "./settings/SubscriptionSettingsCard";
import AccountActionsCard from "./settings/AccountActionsCard";
import DllSharingSettingsCard from "./settings/DllSharingSettingsCard";
import TwoFactorSettingsCard from "./settings/TwoFactorSettingsCard";
import SectionHeader from "./SectionHeader";
import { useEffect, useState } from "react";
import {
  markSecurityFeatureSeen,
  useNewSecurityFeature,
} from "@/services/ascend/newFeatureBadgeService";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  User,
  Crown,
  Image as ImageIcon,
  Lock,
  ShieldCheck,
  Share2,
  UserCog,
} from "lucide-react";

const LAST_PAGE_KEY = "ascendSettingsPage";

const readLastPage = () => {
  try {
    return localStorage.getItem(LAST_PAGE_KEY);
  } catch {
    return null;
  }
};

const saveLastPage = id => {
  try {
    localStorage.setItem(LAST_PAGE_KEY, id);
  } catch {
    // Remembering the page is only a convenience
  }
};

function NavItem({ item, active, onSelect }) {
  return (
    <button
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      className={`group relative flex shrink-0 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary lg:w-full ${
        active
          ? "text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      }`}
    >
      {active && (
        <motion.span
          layoutId="settings-page-active"
          className="absolute inset-0 rounded-lg bg-muted/70"
          transition={{ type: "spring", stiffness: 400, damping: 34 }}
        />
      )}
      <span
        className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
          active ? "bg-primary text-secondary" : "bg-muted/60 group-hover:bg-muted"
        }`}
      >
        <item.icon className="h-3.5 w-3.5" />
      </span>
      <span className="relative truncate">{item.label}</span>
      {item.isNew && (
        <span className="relative ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-secondary">
          {item.newLabel}
        </span>
      )}
    </button>
  );
}

export default function SettingsSection({
  t,
  isEditingProfile,
  handleStartEditProfile,
  editPhotoURL,
  editDisplayName,
  user,
  setEditPhotoURL,
  setEditDisplayName,
  editBio,
  setEditBio,
  editCountry,
  setEditCountry,
  editDiscord,
  editEpicId,
  setEditEpicId,
  editGithub,
  setEditGithub,
  editSteam,
  setEditSteam,
  handleSaveProfile,
  isSavingProfile,
  handleCancelEditProfile,
  userData,
  ascendAccess,
  updateData,
  isDev,
  devSubscriptionState,
  setDevSubscriptionState,
  handleViewInvoices,
  handleManageSubscription,
  deletedAccountWarning,
  handleSubscribe,
  handleLogout,
  showDeleteDialog,
  setShowDeleteDialog,
  showDepartureDialog,
  handleCancelDeparture,
  handleAccountDeletion,
  deletePassword,
  setDeletePassword,
  isDeletingAccount,
  deleteHoldProgress,
  handleDeleteMouseDown,
  handleDeleteMouseUp,
  deleteConfirmed,
  setDeleteHoldProgress,
}) {
  const reduceMotion = useReducedMotion();
  const newSecurityFeature = useNewSecurityFeature();
  // Custom review card backgrounds are a paid perk
  const canCustomizeReviewCard = Boolean(
    ascendAccess?.isSubscribed || userData?.verified
  );
  // Same check the subscription page uses to show the trial
  const onTrial =
    !ascendAccess?.isSubscribed &&
    !ascendAccess?.isVerified &&
    ascendAccess?.hasAccess &&
    ascendAccess?.daysRemaining > 0;

  // Pages in the sidebar, in clusters split by a thin divider: what others see
  // of you, then what you keep to yourself, then the account itself. Each page
  // shows on its own, so the list can keep growing without one long scroll.
  const groups = [
    [
      { id: "profile", icon: User, label: t("ascend.settings.profile") },
      ...(canCustomizeReviewCard
        ? [
            {
              id: "reviewCard",
              icon: ImageIcon,
              label: t("ascend.settings.reviewCard.nav"),
            },
          ]
        : []),
      { id: "subscription", icon: Crown, label: t("ascend.settings.subscription") },
    ],
    [
      { id: "privacy", icon: Lock, label: t("ascend.settings.privacy") },
      {
        id: "security",
        icon: ShieldCheck,
        label: t("account.twoFactor.settings.title"),
        isNew: newSecurityFeature,
        newLabel: t("ascend.settings.newFeature"),
      },
      ...(ascendAccess?.hasAccess
        ? [{ id: "dllSharing", icon: Share2, label: t("ascend.settings.dllSharing") }]
        : []),
    ],
    [{ id: "account", icon: UserCog, label: t("ascend.settings.pages.account.nav") }],
  ];
  const pageIds = groups.flat().map(item => item.id);

  const [selectedId, setSelectedId] = useState(readLastPage);
  // A remembered page can disappear, like the review card when a plan ends
  const activeId = pageIds.includes(selectedId) ? selectedId : "profile";
  const selectPage = id => {
    setSelectedId(id);
    saveLastPage(id);
  };

  // Looking at Security clears the new-feature badges everywhere
  useEffect(() => {
    if (activeId === "security") markSecurityFeatureSeen(user?.uid);
  }, [activeId, user?.uid]);

  const photoURL = userData?.photoURL || user?.photoURL;
  const displayName = userData?.displayName || user?.displayName || "";

  const pages = {
    profile: () => (
      <ProfileSettingsCard
        t={t}
        isEditingProfile={isEditingProfile}
        handleStartEditProfile={handleStartEditProfile}
        editPhotoURL={editPhotoURL}
        editDisplayName={editDisplayName}
        user={user}
        setEditPhotoURL={setEditPhotoURL}
        setEditDisplayName={setEditDisplayName}
        editBio={editBio}
        setEditBio={setEditBio}
        editCountry={editCountry}
        setEditCountry={setEditCountry}
        editDiscord={editDiscord}
        editEpicId={editEpicId}
        setEditEpicId={setEditEpicId}
        editGithub={editGithub}
        setEditGithub={setEditGithub}
        editSteam={editSteam}
        setEditSteam={setEditSteam}
        handleSaveProfile={handleSaveProfile}
        isSavingProfile={isSavingProfile}
        handleCancelEditProfile={handleCancelEditProfile}
        userData={userData}
        showThanks={!onTrial}
      />
    ),
    reviewCard: () => <ReviewCardSettingsCard t={t} user={user} userData={userData} />,
    subscription: () => (
      <SubscriptionSettingsCard
        ascendAccess={ascendAccess}
        t={t}
        isDev={isDev}
        devSubscriptionState={devSubscriptionState}
        setDevSubscriptionState={setDevSubscriptionState}
        userData={userData}
        handleViewInvoices={handleViewInvoices}
        handleManageSubscription={handleManageSubscription}
        deletedAccountWarning={deletedAccountWarning}
        handleSubscribe={handleSubscribe}
      />
    ),
    privacy: () => (
      <PrivacySettingsCard t={t} userData={userData} updateData={updateData} />
    ),
    security: () => <TwoFactorSettingsCard t={t} />,
    dllSharing: () => <DllSharingSettingsCard t={t} />,
    account: () => (
      <AccountActionsCard
        t={t}
        photoURL={photoURL}
        displayName={displayName}
        email={user?.email}
        handleLogout={handleLogout}
        showDeleteDialog={showDeleteDialog}
        setShowDeleteDialog={setShowDeleteDialog}
        showDepartureDialog={showDepartureDialog}
        handleCancelDeparture={handleCancelDeparture}
        handleAccountDeletion={handleAccountDeletion}
        deletePassword={deletePassword}
        setDeletePassword={setDeletePassword}
        isDeletingAccount={isDeletingAccount}
        deleteHoldProgress={deleteHoldProgress}
        handleDeleteMouseDown={handleDeleteMouseDown}
        handleDeleteMouseUp={handleDeleteMouseUp}
        deleteConfirmed={deleteConfirmed}
        setDeleteHoldProgress={setDeleteHoldProgress}
      />
    ),
  };

  return (
    <div className="mb-40 space-y-6">
      <SectionHeader
        title={t("ascend.settings.title")}
        description={t("ascend.settings.subtitle")}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0 lg:sticky lg:top-0">
          {/* Whose settings these are */}
          <div className="mb-4 hidden items-center gap-3 px-2 lg:flex">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-secondary">
              <ProfileImage
                src={photoURL}
                className="h-full w-full object-cover"
                fallback={getInitial(displayName)}
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              {user?.email && (
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>

          <nav
            aria-label={t("ascend.settings.title")}
            className="flex items-center gap-1 overflow-x-auto pb-1 lg:flex-col lg:items-stretch lg:overflow-visible lg:pb-0"
          >
            {groups.map((group, i) => (
              <div
                key={group[0].id}
                className={`flex shrink-0 items-center gap-1 lg:flex-col lg:items-stretch ${
                  i > 0
                    ? "ml-1 border-l border-border/50 pl-2 lg:ml-0 lg:mt-2 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-3"
                    : ""
                }`}
              >
                {group.map(item => (
                  <NavItem
                    key={item.id}
                    item={item}
                    active={activeId === item.id}
                    onSelect={selectPage}
                  />
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 max-w-4xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeId}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {pages[activeId]()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
