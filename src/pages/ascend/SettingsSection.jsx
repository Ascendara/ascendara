import ProfileSettingsCard from "./settings/ProfileSettingsCard";
import DiscordVerificationCard from "./settings/DiscordVerificationCard";
import PrivacySettingsCard from "./settings/PrivacySettingsCard";
import SubscriptionSettingsCard from "./settings/SubscriptionSettingsCard";
import SubscriptionSuccessDialog from "./settings/SubscriptionSuccessDialog";
import AccountActionsCard from "./settings/AccountActionsCard";
import SectionHeader from "./SectionHeader";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { User, Crown, Shield, LogOut } from "lucide-react";
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
  showSubscriptionSuccess,
  setShowSubscriptionSuccess,
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
  const sections = [
    { id: "profile", icon: User, label: t("ascend.settings.profile") },
    { id: "subscription", icon: Crown, label: t("ascend.settings.subscription") },
    { id: "privacy", icon: Shield, label: t("ascend.settings.privacy") },
    { id: "account", icon: LogOut, label: t("account.actions") },
  ];
  const [activeId, setActiveId] = useState("profile");
  const sectionRefs = useRef({});

  // Highlight whichever section is nearest the top of the scroll area
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.dataset.section);
      },
      { rootMargin: "-120px 0px -55% 0px" }
    );
    Object.values(sectionRefs.current).forEach(node => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const scrollTo = id => {
    setActiveId(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sectionProps = id => ({
    ref: node => (sectionRefs.current[id] = node),
    "data-section": id,
    className: "scroll-mt-6 space-y-4",
  });

  return (
    <div className="mb-40 space-y-6">
      <SectionHeader
        title={t("ascend.settings.title")}
        description={t("ascend.settings.subtitle")}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label={t("ascend.settings.title")}
          className="flex gap-1 overflow-x-auto lg:sticky lg:top-0 lg:flex-col"
        >
          {sections.map(section => {
            const isActive = activeId === section.id;
            return (
              <button
                key={section.id}
                onClick={() => scrollTo(section.id)}
                aria-current={isActive ? "true" : undefined}
                className={`relative flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="settings-section-active"
                    className="absolute inset-0 rounded-lg bg-primary/10"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <section.icon className="relative h-4 w-4" />
                <span className="relative">{section.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-10">
          <section {...sectionProps("profile")}>
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
            />
          </section>

          <section {...sectionProps("subscription")}>
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
            <DiscordVerificationCard t={t} ascendAccess={ascendAccess} user={user} />
          </section>

          <section {...sectionProps("privacy")}>
            <PrivacySettingsCard t={t} userData={userData} updateData={updateData} />
          </section>

          {/* Subscription Success Dialog */}
          <SubscriptionSuccessDialog
            showSubscriptionSuccess={showSubscriptionSuccess}
            setShowSubscriptionSuccess={setShowSubscriptionSuccess}
            t={t}
          />

          <section {...sectionProps("account")}>
            <AccountActionsCard
              t={t}
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
          </section>
        </div>
      </div>
    </div>
  );
}
