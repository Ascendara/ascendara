import ProfileSettingsCard from "./settings/ProfileSettingsCard";
import DiscordVerificationCard from "./settings/DiscordVerificationCard";
import WebappConnectionCard from "./settings/WebappConnectionCard";
import PrivacySettingsCard from "./settings/PrivacySettingsCard";
import SubscriptionSettingsCard from "./settings/SubscriptionSettingsCard";
import SubscriptionSuccessDialog from "./settings/SubscriptionSuccessDialog";
import AccountActionsCard from "./settings/AccountActionsCard";
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
  webappConnectionCode,
  handleGenerateWebappCode,
  isGeneratingCode,
  webappCodeExpiry,
  webappQRCode,
  handleCopyWebappCode,
  webappCodeCopied,
  handleCancelWebappConnection,
  loadConnectedDevices,
  loadingDevices,
  connectedDevices,
  handleDisconnectDevice,
  disconnectingDevice,
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-500/10 p-6">
        <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 backdrop-blur-sm">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("ascend.settings.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("ascend.settings.subtitle")}
            </p>
          </div>
        </div>
      </div>

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

      {/* Webapp Connection Card */}
      <WebappConnectionCard
        t={t}
        webappConnectionCode={webappConnectionCode}
        handleGenerateWebappCode={handleGenerateWebappCode}
        isGeneratingCode={isGeneratingCode}
        webappCodeExpiry={webappCodeExpiry}
        webappQRCode={webappQRCode}
        handleCopyWebappCode={handleCopyWebappCode}
        webappCodeCopied={webappCodeCopied}
        handleCancelWebappConnection={handleCancelWebappConnection}
        loadConnectedDevices={loadConnectedDevices}
        loadingDevices={loadingDevices}
        connectedDevices={connectedDevices}
        handleDisconnectDevice={handleDisconnectDevice}
        disconnectingDevice={disconnectingDevice}
      />

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
