import ProfileSettingsCard from "./settings/ProfileSettingsCard";
import DiscordVerificationCard from "./settings/DiscordVerificationCard";
import PrivacySettingsCard from "./settings/PrivacySettingsCard";
import SubscriptionSettingsCard from "./settings/SubscriptionSettingsCard";
import SubscriptionSuccessDialog from "./settings/SubscriptionSuccessDialog";
import AccountActionsCard from "./settings/AccountActionsCard";
import SectionHeader from "./SectionHeader";
import { Settings } from "lucide-react";
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
  deletePassword,
  setDeletePassword,
  isDeletingAccount,
  deleteHoldProgress,
  handleDeleteMouseDown,
  handleDeleteMouseUp,
  deleteConfirmed,
  setDeleteHoldProgress,
}) {
  return (
    <div className="mb-40 space-y-6">
      <SectionHeader
        icon={Settings}
        title={t("ascend.settings.title")}
        description={t("ascend.settings.subtitle")}
      />

      {/* Profile Card */}
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

      {/* Discord Verification Card */}
      <DiscordVerificationCard t={t} ascendAccess={ascendAccess} user={user} />

      {/* Privacy Settings Card */}
      <PrivacySettingsCard t={t} userData={userData} updateData={updateData} />

      {/* Subscription Management */}
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

      {/* Subscription Success Dialog */}
      <SubscriptionSuccessDialog
        showSubscriptionSuccess={showSubscriptionSuccess}
        setShowSubscriptionSuccess={setShowSubscriptionSuccess}
        t={t}
      />

      {/* Account Actions */}
      <AccountActionsCard
        t={t}
        handleLogout={handleLogout}
        showDeleteDialog={showDeleteDialog}
        setShowDeleteDialog={setShowDeleteDialog}
        deletePassword={deletePassword}
        setDeletePassword={setDeletePassword}
        isDeletingAccount={isDeletingAccount}
        deleteHoldProgress={deleteHoldProgress}
        handleDeleteMouseDown={handleDeleteMouseDown}
        handleDeleteMouseUp={handleDeleteMouseUp}
        deleteConfirmed={deleteConfirmed}
        setDeleteHoldProgress={setDeleteHoldProgress}
      />
    </div>
  );
}
